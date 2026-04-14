import fs from "node:fs/promises";
import { config } from "./config.mjs";

const DEFAULTS = {
  recent: 20,
  interval: 30
};

export async function ensureConfigDir() {
  await fs.mkdir(config.configDir, { recursive: true });
}

export async function readUserConfig() {
  await ensureConfigDir();
  try {
    const raw = await fs.readFile(config.userConfigPath, "utf8");
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULTS,
      ...parsed
    };
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return { ...DEFAULTS };
    }
    throw error;
  }
}

export async function writeUserConfig(partial) {
  const current = await readUserConfig();
  const next = {
    ...current,
    ...partial
  };
  await ensureConfigDir();
  await fs.writeFile(config.userConfigPath, JSON.stringify(next, null, 2) + "\n", "utf8");
  return next;
}

export function getDefaultConfig() {
  return { ...DEFAULTS };
}
