import fs from "node:fs/promises";
import os from "node:os";
import { config } from "./config.mjs";
import { execCommand } from "./shell.mjs";
import { ensureState } from "./state.mjs";
import { assertRuntimeReady, buildSpawnEnv, resolveRuntime } from "./runtime.mjs";
import { getDefaultConfig, writeUserConfig } from "./user-config.mjs";

function escapeXml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function plistArray(values) {
  return values.map((value) => `    <string>${escapeXml(value)}</string>`).join("\n");
}

function plistDictEntries(entries) {
  return Object.entries(entries)
    .map(([key, value]) => `    <key>${escapeXml(key)}</key>\n    <string>${escapeXml(value)}</string>`)
    .join("\n");
}

function buildPlist({ nodePath, recent, interval, env }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${escapeXml(config.launchAgentLabel)}</string>
  <key>ProgramArguments</key>
  <array>
${plistArray([nodePath, config.binEntrypoint, "watch", "--recent", String(recent), "--interval", String(interval)])}
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>WorkingDirectory</key>
  <string>${escapeXml(os.homedir())}</string>
  <key>StandardOutPath</key>
  <string>${escapeXml(config.serviceStdoutPath)}</string>
  <key>StandardErrorPath</key>
  <string>${escapeXml(config.serviceStderrPath)}</string>
  <key>EnvironmentVariables</key>
  <dict>
${plistDictEntries(env)}
  </dict>
</dict>
</plist>
`;
}

export async function installService(options = {}) {
  if (process.platform !== "darwin") {
    throw new Error("service install currently supports macOS only. On other systems, run the watch command directly.");
  }

  await ensureState();
  const runtime = await resolveRuntime();
  assertRuntimeReady(runtime);

  const defaults = getDefaultConfig();
  const recent = normalizePositiveInt(options.recent, defaults.recent);
  const interval = normalizePositiveInt(options.interval, defaults.interval);
  await writeUserConfig({ recent, interval });

  const env = buildSpawnEnv(runtime, {
    HAPPY_CODEX_SYNC_STATE_DIR: config.stateDir,
    HAPPY_CODEX_SYNC_CONFIG_DIR: config.configDir
  });

  await fs.mkdir(config.launchAgentsDir, { recursive: true });
  const plist = buildPlist({
    nodePath: process.execPath,
    recent,
    interval,
    env: {
      PATH: env.PATH,
      HAPPY_CODEX_SYNC_STATE_DIR: config.stateDir,
      HAPPY_CODEX_SYNC_CONFIG_DIR: config.configDir
    }
  });
  await fs.writeFile(config.launchAgentPlistPath, plist, "utf8");

  const domain = `gui/${process.getuid()}`;
  await execCommand("launchctl", ["bootout", domain, config.launchAgentPlistPath]).catch(() => {});
  await execCommand("launchctl", ["bootstrap", domain, config.launchAgentPlistPath]);
  await execCommand("launchctl", ["kickstart", "-k", `${domain}/${config.launchAgentLabel}`]);

  return {
    recent,
    interval,
    plistPath: config.launchAgentPlistPath,
    label: config.launchAgentLabel
  };
}

export async function uninstallService() {
  if (process.platform !== "darwin") {
    throw new Error("service uninstall currently supports macOS only.");
  }
  const domain = `gui/${process.getuid()}`;
  await execCommand("launchctl", ["bootout", domain, config.launchAgentPlistPath]).catch(() => {});
  await fs.rm(config.launchAgentPlistPath, { force: true });
}

export async function serviceStatus() {
  const installed = await fileExists(config.launchAgentPlistPath);
  if (process.platform !== "darwin") {
    return { installed, loaded: false, detail: "launchd unsupported on this platform" };
  }
  const domainLabel = `gui/${process.getuid()}/${config.launchAgentLabel}`;
  try {
    const { stdout } = await execCommand("launchctl", ["print", domainLabel]);
    return {
      installed,
      loaded: true,
      detail: stdout.trim()
    };
  } catch (error) {
    return {
      installed,
      loaded: false,
      detail: error instanceof Error ? error.message : String(error)
    };
  }
}

async function fileExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function normalizePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? fallback), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
