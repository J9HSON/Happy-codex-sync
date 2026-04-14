import fs from "node:fs/promises";
import path from "node:path";
import { execCommand } from "./shell.mjs";
import { config } from "./config.mjs";

function splitPathEntries(pathValue) {
  return (pathValue ?? "")
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

async function isExecutable(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function resolveExecutable(name, overrideEnvName, extraDirs = []) {
  const overridePath = process.env[overrideEnvName];
  if (overridePath && await isExecutable(overridePath)) {
    return path.resolve(overridePath);
  }

  const searchDirs = [
    ...extraDirs,
    path.join(config.homeDir, ".local", "bin"),
    ...splitPathEntries(process.env.PATH),
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin"
  ];

  const seen = new Set();
  for (const dir of searchDirs) {
    const normalized = path.resolve(dir);
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    const candidate = path.join(normalized, name);
    if (await isExecutable(candidate)) {
      return candidate;
    }
  }

  return null;
}

function parseVersion(text) {
  const match = text.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    return null;
  }
  return {
    major: Number.parseInt(match[1], 10),
    minor: Number.parseInt(match[2], 10),
    patch: Number.parseInt(match[3], 10),
    raw: match[0]
  };
}

export function isCodexVersionSupported(version) {
  if (!version) {
    return false;
  }
  return version.major > 0 || version.minor >= 100;
}

export async function resolveRuntime() {
  const [codexPath, happyPath] = await Promise.all([
    resolveExecutable("codex", "HAPPY_CODEX_SYNC_CODEX"),
    resolveExecutable("happy", "HAPPY_CODEX_SYNC_HAPPY")
  ]);

  let codexVersionText = null;
  let codexVersion = null;
  let happyVersionText = null;

  if (codexPath) {
    try {
      const { stdout } = await execCommand(codexPath, ["--version"]);
      codexVersionText = stdout.trim();
      codexVersion = parseVersion(codexVersionText);
    } catch {
    }
  }

  if (happyPath) {
    try {
      const { stdout, stderr } = await execCommand(happyPath, ["daemon", "status"]);
      happyVersionText = `${stdout}${stderr}`.trim();
    } catch (error) {
      happyVersionText = error instanceof Error ? error.message : String(error);
    }
  }

  return {
    codexPath,
    codexBinDir: codexPath ? path.dirname(codexPath) : null,
    codexVersion,
    codexVersionText,
    happyPath,
    happyBinDir: happyPath ? path.dirname(happyPath) : null,
    happyVersionText
  };
}

export function buildSpawnEnv(runtime, extra = {}) {
  const dirs = [
    runtime.codexBinDir,
    runtime.happyBinDir,
    ...splitPathEntries(process.env.PATH)
  ].filter(Boolean);

  const uniqueDirs = [...new Set(dirs)];
  return {
    ...process.env,
    ...extra,
    PATH: uniqueDirs.join(path.delimiter)
  };
}

export function assertRuntimeReady(runtime) {
  if (!runtime.happyPath) {
    throw new Error("happy binary not found. Install it first: npm install -g happy");
  }
  if (!runtime.codexPath) {
    throw new Error("codex binary not found. Install it first: npm install -g @openai/codex");
  }
  if (!isCodexVersionSupported(runtime.codexVersion)) {
    throw new Error(`codex version too old: ${runtime.codexVersionText ?? "unknown"}. Need codex-cli >= 0.100.0`);
  }
}
