import { readFileSync, existsSync } from 'node:fs';
import type { AppConfig } from './types.js';
import {
  CONFIG_FILE,
  DEFAULT_DISCORD_CLIENT_ID,
  DEFAULT_PORT,
  STALE_CHECK_INTERVAL,
  IDLE_TIMEOUT,
  REMOVE_TIMEOUT,
} from './constants.js';

interface ConfigFile {
  discordClientId?: string;
  daemonPort?: number;
  staleCheckInterval?: number;
  idleTimeout?: number;
  removeTimeout?: number;
}

export function loadConfig(): AppConfig {
  let fileConfig: ConfigFile = {};

  if (existsSync(CONFIG_FILE)) {
    try {
      const raw = readFileSync(CONFIG_FILE, 'utf-8');
      fileConfig = JSON.parse(raw) as ConfigFile;
    } catch {
      // Ignore invalid config file, use defaults
    }
  }

  return {
    discordClientId:
      process.env.CLAUDE_DISCORD_CLIENT_ID ??
      fileConfig.discordClientId ??
      DEFAULT_DISCORD_CLIENT_ID,
    daemonPort: process.env.CLAUDE_DISCORD_PORT
      ? parseInt(process.env.CLAUDE_DISCORD_PORT, 10)
      : (fileConfig.daemonPort ?? DEFAULT_PORT),
    staleCheckInterval: fileConfig.staleCheckInterval ?? STALE_CHECK_INTERVAL,
    idleTimeout: fileConfig.idleTimeout ?? IDLE_TIMEOUT,
    removeTimeout: fileConfig.removeTimeout ?? REMOVE_TIMEOUT,
  };
}
