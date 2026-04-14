import { setTimeout as delay } from "node:timers/promises";
import { runDoctor } from "./doctor.mjs";
import { listLocalCodexThreads, findLocalThread } from "./codex-sessions.mjs";
import { publishThread, refreshManagedSessions, stopManagedThread } from "./happy-manager.mjs";
import { ensureState } from "./state.mjs";
import { installService, serviceStatus, uninstallService } from "./service.mjs";
import { getDefaultConfig, readUserConfig, writeUserConfig } from "./user-config.mjs";

function printHelp() {
  console.log(`happy-codex-sync

Usage:
  happy-codex-sync doctor
  happy-codex-sync setup [--recent N] [--interval seconds]
  happy-codex-sync list-local [--limit N]
  happy-codex-sync list-managed
  happy-codex-sync publish <thread-id>
  happy-codex-sync publish-last
  happy-codex-sync publish-recent [count]
  happy-codex-sync sync [--recent N]
  happy-codex-sync watch [--recent N] [--interval seconds]
  happy-codex-sync stop <thread-id|all>
  happy-codex-sync service <install|uninstall|status> [--recent N] [--interval seconds]
`);
}

function formatSession(session) {
  return `${session.threadId} | ${session.threadName || "(unnamed)"} | ${session.cwd} | updated=${session.updatedAt}`;
}

function formatManaged(session) {
  return `${session.threadId} | wrapper=${session.wrapperPid ?? "-"} | happy-pid=${session.happyPid ?? "-"} | happy=${session.happySessionId ?? "-"} | alive=${session.alive ? "yes" : "no"} | ${session.cwd}`;
}

function readFlag(args, name, fallback) {
  const index = args.indexOf(name);
  if (index === -1) {
    return fallback;
  }
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    return fallback;
  }
  return value;
}

function resolvePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? fallback), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function resolveWatchSettings(args) {
  const defaults = await readUserConfig();
  return {
    recent: resolvePositiveInt(readFlag(args, "--recent", String(defaults.recent)), defaults.recent),
    interval: resolvePositiveInt(readFlag(args, "--interval", String(defaults.interval)), defaults.interval)
  };
}

async function handleDoctor() {
  const diagnosis = await runDoctor();
  for (const check of diagnosis.checks) {
    const status = check.ok ? "ok" : (check.required ? "fail" : "warn");
    console.log(`${status} | ${check.name} | ${check.detail}`);
  }
  if (!diagnosis.ok) {
    throw new Error("doctor failed");
  }
}

async function handleListLocal(args) {
  const limit = Number.parseInt(readFlag(args, "--limit", "20"), 10);
  const sessions = await listLocalCodexThreads();
  for (const session of sessions.slice(0, limit)) {
    console.log(formatSession(session));
  }
}

async function handleListManaged() {
  const sessions = await refreshManagedSessions();
  for (const session of sessions) {
    console.log(formatManaged(session));
  }
}

async function publishById(threadId) {
  const thread = await findLocalThread(threadId);
  if (!thread) {
    throw new Error(`Unknown local Codex thread: ${threadId}`);
  }
  const result = await publishThread(thread);
  console.log(`${result.created ? "published" : "already-managed"} ${formatManaged(result.session)}`);
}

async function handlePublishLast() {
  const sessions = await listLocalCodexThreads();
  const latest = sessions[0];
  if (!latest) {
    throw new Error("No local Codex threads found.");
  }
  await publishById(latest.threadId);
}

async function handlePublishRecent(countValue) {
  const count = Number.parseInt(countValue ?? "5", 10);
  const sessions = await listLocalCodexThreads();
  for (const session of sessions.slice(0, count)) {
    try {
      const result = await publishThread(session);
      console.log(`${result.created ? "published" : "already-managed"} ${formatManaged(result.session)}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`skipped ${session.threadId} | ${message}`);
    }
  }
}

async function handleSync(args) {
  const settings = await resolveWatchSettings(args);
  await handlePublishRecent(String(settings.recent));
}

async function handleWatch(args) {
  const settings = await resolveWatchSettings(args);
  console.log(`watching recent=${settings.recent} interval=${settings.interval}s`);
  while (true) {
    await handlePublishRecent(String(settings.recent));
    await delay(settings.interval * 1000);
  }
}

async function handleStop(threadId) {
  if (!threadId) {
    throw new Error("stop requires <thread-id|all>");
  }
  const sessions = await stopManagedThread(threadId);
  for (const session of sessions) {
    console.log(formatManaged(session));
  }
}

async function handleSetup(args) {
  const defaults = getDefaultConfig();
  const recent = resolvePositiveInt(readFlag(args, "--recent", String(defaults.recent)), defaults.recent);
  const interval = resolvePositiveInt(readFlag(args, "--interval", String(defaults.interval)), defaults.interval);
  await handleDoctor();
  await writeUserConfig({ recent, interval });
  if (process.platform === "darwin") {
    const installed = await installService({ recent, interval });
    console.log(`service installed | label=${installed.label} | plist=${installed.plistPath} | recent=${installed.recent} | interval=${installed.interval}`);
    return;
  }
  console.log(`config saved | recent=${recent} | interval=${interval}`);
  console.log(`run: happy-codex-sync watch --recent ${recent} --interval ${interval}`);
}

async function handleService(args) {
  const action = args[0];
  if (!action) {
    throw new Error("service requires <install|uninstall|status>");
  }

  if (action === "install") {
    const defaults = getDefaultConfig();
    const recent = resolvePositiveInt(readFlag(args, "--recent", String(defaults.recent)), defaults.recent);
    const interval = resolvePositiveInt(readFlag(args, "--interval", String(defaults.interval)), defaults.interval);
    const result = await installService({ recent, interval });
    console.log(`service installed | label=${result.label} | plist=${result.plistPath}`);
    return;
  }

  if (action === "uninstall") {
    await uninstallService();
    console.log("service uninstalled");
    return;
  }

  if (action === "status") {
    const status = await serviceStatus();
    console.log(`installed=${status.installed ? "yes" : "no"} loaded=${status.loaded ? "yes" : "no"}`);
    if (status.detail) {
      console.log(status.detail);
    }
    return;
  }

  throw new Error(`unknown service action: ${action}`);
}

export async function runCli(argv) {
  await ensureState();
  const [command = "help", ...args] = argv;

  switch (command) {
    case "doctor":
      await handleDoctor();
      return;
    case "setup":
      await handleSetup(args);
      return;
    case "help":
    case "--help":
    case "-h":
      printHelp();
      return;
    case "list-local":
      await handleListLocal(args);
      return;
    case "list-managed":
      await handleListManaged();
      return;
    case "publish":
      await publishById(args[0]);
      return;
    case "publish-last":
      await handlePublishLast();
      return;
    case "publish-recent":
      await handlePublishRecent(args[0]);
      return;
    case "sync":
      await handleSync(args);
      return;
    case "watch":
      await handleWatch(args);
      return;
    case "stop":
      await handleStop(args[0]);
      return;
    case "service":
      await handleService(args);
      return;
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}
