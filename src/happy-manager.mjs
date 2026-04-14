import fs from "node:fs";
import fsPromises from "node:fs/promises";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import path from "node:path";
import { execCommand } from "./shell.mjs";
import { config } from "./config.mjs";
import { assertRuntimeReady, buildSpawnEnv, resolveRuntime } from "./runtime.mjs";
import { readManagedSessions, writeManagedSessions } from "./state.mjs";

function trimJsonEnvelope(stdout) {
  const start = stdout.indexOf("[");
  const end = stdout.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) {
    return "[]";
  }
  return stdout.slice(start, end + 1);
}

export async function listHappyDaemonSessions() {
  const runtime = await resolveRuntime();
  assertRuntimeReady(runtime);
  const { stdout } = await execCommand(runtime.happyPath, ["daemon", "list"], {
    env: buildSpawnEnv(runtime)
  });
  const trimmed = trimJsonEnvelope(stdout);
  try {
    return JSON.parse(trimmed);
  } catch {
    return [];
  }
}

export async function refreshManagedSessions() {
  const [managedSessions, daemonSessions] = await Promise.all([
    readManagedSessions(),
    listHappyDaemonSessions()
  ]);

  const daemonByPid = new Map(daemonSessions.map((session) => [session.pid, session]));
  const refreshed = [];

  for (const session of managedSessions) {
    const wrapperPid = session.wrapperPid ?? session.pid ?? null;
    const happyRuntime = await resolveHappyRuntime(session.threadId);
    const wrapperAlive = wrapperPid ? await isProcessAlive(wrapperPid) : false;
    const daemonSession = happyRuntime.happyPid ? daemonByPid.get(happyRuntime.happyPid) : null;
    const normalizedLogFile = path.join(config.logsDir, `${session.threadId}.log`);
    refreshed.push({
      ...session,
      wrapperPid,
      logFile: normalizedLogFile,
      happyPid: happyRuntime.happyPid ?? session.happyPid ?? null,
      happyLogPath: happyRuntime.happyLogPath ?? session.happyLogPath ?? null,
      alive: wrapperAlive || !!daemonSession,
      happySessionId: daemonSession?.happySessionId ?? happyRuntime.happySessionId ?? session.happySessionId ?? null
    });
  }

  await writeManagedSessions(refreshed);
  return refreshed;
}

export async function publishThread(thread) {
  const runtime = await resolveRuntime();
  assertRuntimeReady(runtime);
  const cwdExists = await directoryExists(thread.cwd);
  if (!cwdExists) {
    throw new Error(`thread cwd no longer exists: ${thread.cwd}`);
  }
  const managedSessions = await refreshManagedSessions();
  const existing = managedSessions.find((session) => session.threadId === thread.threadId && session.alive);
  if (existing) {
    return {
      created: false,
      session: existing
    };
  }

  await fsPromises.mkdir(config.logsDir, { recursive: true });
  const logFile = path.join(config.logsDir, `${thread.threadId}.log`);
  const logFd = fs.openSync(logFile, "a");

  const child = spawn(
    runtime.happyPath,
    ["codex", "--resume", thread.threadId],
    {
      cwd: thread.cwd,
      env: buildSpawnEnv(runtime),
      detached: true,
      stdio: ["ignore", logFd, logFd]
    }
  );

  const spawned = await new Promise((resolve, reject) => {
    child.once("spawn", () => resolve(true));
    child.once("error", reject);
  });
  if (!spawned) {
    throw new Error(`failed to spawn happy for ${thread.threadId}`);
  }

  child.unref();
  fs.closeSync(logFd);

  await delay(2600);
  const [daemonSessions, happyRuntime] = await Promise.all([
    listHappyDaemonSessions(),
    resolveHappyRuntime(thread.threadId)
  ]);
  const daemonSession = happyRuntime.happyPid ? daemonSessions.find((session) => session.pid === happyRuntime.happyPid) ?? null : null;

  const newSession = {
    threadId: thread.threadId,
    threadName: thread.threadName,
    cwd: thread.cwd,
    updatedAt: thread.updatedAt,
    wrapperPid: child.pid,
    happyPid: happyRuntime.happyPid ?? null,
    happySessionId: daemonSession?.happySessionId ?? happyRuntime.happySessionId ?? null,
    logFile,
    happyLogPath: happyRuntime.happyLogPath ?? null,
    startedAt: new Date().toISOString(),
    alive: true
  };

  const nextSessions = [
    ...managedSessions.filter((session) => session.threadId !== thread.threadId),
    newSession
  ];
  await writeManagedSessions(nextSessions);

  return {
    created: true,
    session: newSession
  };
}

export async function stopManagedThread(threadId) {
  const managedSessions = await refreshManagedSessions();
  const targets = threadId === "all" ? managedSessions.filter((session) => session.alive) : managedSessions.filter((session) => session.threadId === threadId && session.alive);
  for (const session of targets) {
    try {
      if (session.happyPid) {
        process.kill(session.happyPid, "SIGTERM");
      }
    } catch {
    }
    try {
      if (session.wrapperPid) {
        process.kill(session.wrapperPid, "SIGTERM");
      }
    } catch {
    }
  }
  await delay(400);
  return refreshManagedSessions();
}

async function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function directoryExists(targetPath) {
  try {
    const stat = await fsPromises.stat(targetPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

async function resolveHappyRuntime(threadId) {
  const candidates = await findHappyLogsForThread(threadId);
  const best = candidates[0] ?? null;
  if (!best) {
    return {
      happySessionId: null,
      happyPid: null,
      happyLogPath: null
    };
  }
  return best;
}

async function findHappyLogsForThread(threadId) {
  let entries;
  try {
    entries = await fsPromises.readdir(config.happyLogsDir);
  } catch {
    return [];
  }

  const results = [];
  for (const fileName of entries.filter((name) => name.endsWith(".log")).sort().reverse()) {
    const logPath = path.join(config.happyLogsDir, fileName);
    const raw = await fsPromises.readFile(logPath, "utf8");
    if (!raw.includes(`"--resume","${threadId}"`) && !raw.includes(`--resume ${threadId}`)) {
      continue;
    }
    const happySessionId = raw.match(/Session created\/loaded:\s+([a-z0-9]+)/i)?.[1] ?? null;
    const happyPid = Number.parseInt(fileName.match(/pid-(\d+)/)?.[1] ?? "", 10) || null;
    results.push({
      happySessionId,
      happyPid,
      happyLogPath: logPath
    });
  }
  return results;
}
