import fs from "node:fs/promises";
import { config } from "./config.mjs";
import { listLocalCodexThreads } from "./codex-sessions.mjs";
import { isCodexVersionSupported, resolveRuntime } from "./runtime.mjs";

function isNodeVersionSupported(versionText) {
  const major = Number.parseInt(String(versionText).split(".")[0] ?? "", 10);
  return Number.isFinite(major) && major >= 20;
}

export async function runDoctor() {
  const runtime = await resolveRuntime();
  const sessionIndexExists = await pathExists(config.codexSessionIndexPath);
  const localThreads = sessionIndexExists ? await listLocalCodexThreads() : [];

  const checks = [
    {
      name: "node version",
      ok: isNodeVersionSupported(process.versions.node),
      required: true,
      detail: process.versions.node
    },
    {
      name: "happy binary",
      ok: !!runtime.happyPath,
      required: true,
      detail: runtime.happyPath ?? "not found"
    },
    {
      name: "codex binary",
      ok: !!runtime.codexPath,
      required: true,
      detail: runtime.codexPath ?? "not found"
    },
    {
      name: "codex version",
      ok: isCodexVersionSupported(runtime.codexVersion),
      required: true,
      detail: runtime.codexVersionText ?? "unknown"
    },
    {
      name: "codex session index",
      ok: sessionIndexExists,
      required: false,
      detail: config.codexSessionIndexPath
    },
    {
      name: "local codex threads",
      ok: localThreads.length > 0,
      required: false,
      detail: `${localThreads.length} found`
    }
  ];

  return {
    ok: checks.every((check) => !check.required || check.ok),
    checks,
    runtime,
    localThreads
  };
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}
