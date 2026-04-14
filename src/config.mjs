import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const homeDir = os.homedir();
const appName = "happy-codex-sync";
const stateRoot = process.env.HAPPY_CODEX_SYNC_STATE_DIR
  ? path.resolve(process.env.HAPPY_CODEX_SYNC_STATE_DIR)
  : path.join(process.env.XDG_STATE_HOME ?? path.join(homeDir, ".local", "state"), appName);
const configRoot = process.env.HAPPY_CODEX_SYNC_CONFIG_DIR
  ? path.resolve(process.env.HAPPY_CODEX_SYNC_CONFIG_DIR)
  : path.join(process.env.XDG_CONFIG_HOME ?? path.join(homeDir, ".config"), appName);

export const config = {
  appName,
  projectRoot,
  homeDir,
  binEntrypoint: path.join(projectRoot, "bin", "happy-codex-sync.mjs"),
  codexHome: path.join(homeDir, ".codex"),
  codexSessionIndexPath: path.join(homeDir, ".codex", "session_index.jsonl"),
  codexSessionsDir: path.join(homeDir, ".codex", "sessions"),
  stateDir: stateRoot,
  logsDir: path.join(stateRoot, "logs"),
  managedSessionsPath: path.join(stateRoot, "managed-sessions.json"),
  configDir: configRoot,
  userConfigPath: path.join(configRoot, "config.json"),
  happyLogsDir: path.join(homeDir, ".happy", "logs"),
  launchAgentsDir: path.join(homeDir, "Library", "LaunchAgents"),
  launchAgentLabel: "dev.happy-codex-sync.watch",
  launchAgentPlistPath: path.join(homeDir, "Library", "LaunchAgents", "dev.happy-codex-sync.watch.plist"),
  serviceStdoutPath: path.join(stateRoot, "service.stdout.log"),
  serviceStderrPath: path.join(stateRoot, "service.stderr.log"),
  legacyProjectStateDir: path.join(projectRoot, "state"),
  legacyManagedSessionsPath: path.join(projectRoot, "state", "managed-sessions.json"),
  legacyLogsDir: path.join(projectRoot, "state", "logs")
};
