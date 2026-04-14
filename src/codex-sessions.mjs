import fs from "node:fs/promises";
import path from "node:path";
import { config } from "./config.mjs";

async function readJsonLines(filePath) {
  let content;
  try {
    content = await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

async function walkFiles(rootDir) {
  try {
    const stat = await fs.stat(rootDir);
    if (!stat.isDirectory()) {
      return [];
    }
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const files = [];
  const entries = await fs.readdir(rootDir, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walkFiles(entryPath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".jsonl")) {
      files.push(entryPath);
    }
  }
  return files;
}

async function readSessionMeta(filePath) {
  const content = await fs.readFile(filePath, "utf8");
  const firstLine = content.split("\n").find((line) => line.trim().length > 0);
  if (!firstLine) {
    return null;
  }
  const firstRecord = JSON.parse(firstLine);
  if (firstRecord?.type !== "session_meta" || !firstRecord.payload?.id) {
    return null;
  }
  return {
    threadId: firstRecord.payload.id,
    cwd: firstRecord.payload.cwd,
    originator: firstRecord.payload.originator,
    source: firstRecord.payload.source,
    cliVersion: firstRecord.payload.cli_version,
    sessionFile: filePath
  };
}

export async function listLocalCodexThreads() {
  const [indexRows, sessionFiles] = await Promise.all([
    readJsonLines(config.codexSessionIndexPath),
    walkFiles(config.codexSessionsDir)
  ]);

  const metaByThreadId = new Map();
  for (const sessionFile of sessionFiles) {
    const meta = await readSessionMeta(sessionFile);
    if (meta) {
      metaByThreadId.set(meta.threadId, meta);
    }
  }

  const hydrated = indexRows.map((row) => {
      const meta = metaByThreadId.get(row.id);
      return {
        threadId: row.id,
        threadName: row.thread_name ?? "",
        updatedAt: row.updated_at ?? "",
        cwd: meta?.cwd ?? null,
        originator: meta?.originator ?? null,
        source: meta?.source ?? null,
        cliVersion: meta?.cliVersion ?? null,
        sessionFile: meta?.sessionFile ?? null
      };
    });

  const withCwdValidity = await Promise.all(
    hydrated.map(async (row) => ({
      ...row,
      cwdExists: row.cwd ? await directoryExists(row.cwd) : false
    }))
  );

  return withCwdValidity
    .filter((row) => row.cwd && row.cwdExists)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function findLocalThread(threadId) {
  const threads = await listLocalCodexThreads();
  return threads.find((thread) => thread.threadId === threadId) ?? null;
}

async function directoryExists(targetPath) {
  try {
    const stat = await fs.stat(targetPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}
