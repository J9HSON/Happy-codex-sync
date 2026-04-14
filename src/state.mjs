import fs from "node:fs/promises";
import { config } from "./config.mjs";

export async function ensureState() {
  await fs.mkdir(config.stateDir, { recursive: true });
  await fs.mkdir(config.logsDir, { recursive: true });
  await migrateLegacyState();
}

export async function readManagedSessions() {
  await ensureState();
  try {
    const raw = await fs.readFile(config.managedSessionsPath, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.sessions)) {
      return [];
    }
    return parsed.sessions;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

export async function writeManagedSessions(sessions) {
  await ensureState();
  const normalized = [...sessions].sort((a, b) => (b.startedAt ?? "").localeCompare(a.startedAt ?? ""));
  await fs.writeFile(
    config.managedSessionsPath,
    JSON.stringify({ sessions: normalized }, null, 2) + "\n",
    "utf8"
  );
}

async function migrateLegacyState() {
  if (config.legacyProjectStateDir === config.stateDir) {
    return;
  }

  const newManagedExists = await exists(config.managedSessionsPath);
  const legacyManagedExists = await exists(config.legacyManagedSessionsPath);
  if (!newManagedExists && legacyManagedExists) {
    await fs.copyFile(config.legacyManagedSessionsPath, config.managedSessionsPath);
  }

  const legacyLogsExist = await exists(config.legacyLogsDir);
  if (legacyLogsExist) {
    await fs.cp(config.legacyLogsDir, config.logsDir, { recursive: true, force: false }).catch(() => {});
  }
}

async function exists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}
