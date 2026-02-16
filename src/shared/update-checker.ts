import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import type { UpdateCheckResult } from './types.js';
import {
  UPDATE_CHECK_FILE,
  UPDATE_CHECK_INTERVAL,
  NPM_REGISTRY_URL,
  PACKAGE_NAME,
  CONFIG_DIR,
} from './constants.js';
import { VERSION } from './version.js';

export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const parse = (v: string): number[] => {
    const match = v.match(/^(\d+)\.(\d+)\.(\d+)/);
    if (!match) return [0, 0, 0];
    return [parseInt(match[1], 10), parseInt(match[2], 10), parseInt(match[3], 10)];
  };

  const pa = parse(a);
  const pb = parse(b);

  for (let i = 0; i < 3; i++) {
    if (pa[i] < pb[i]) return -1;
    if (pa[i] > pb[i]) return 1;
  }
  return 0;
}

export function readCachedUpdate(): UpdateCheckResult | null {
  try {
    const raw = JSON.parse(readFileSync(UPDATE_CHECK_FILE, 'utf-8'));
    if (
      typeof raw === 'object' &&
      raw !== null &&
      typeof raw.latestVersion === 'string' &&
      typeof raw.currentVersion === 'string' &&
      typeof raw.updateAvailable === 'boolean' &&
      typeof raw.checkedAt === 'number'
    ) {
      return raw as UpdateCheckResult;
    }
  } catch {
    // Missing file, invalid JSON, etc.
  }
  return null;
}

export function isUpdateCheckDisabled(configUpdateCheck: boolean): boolean {
  if (process.env.NO_UPDATE_NOTIFIER === '1') return true;
  if (process.env.CLAUDE_DISCORD_UPDATE_CHECK === '0') return true;
  return !configUpdateCheck;
}

async function fetchLatestVersion(): Promise<string | null> {
  try {
    const res = await fetch(`${NPM_REGISTRY_URL}/${PACKAGE_NAME}/latest`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { version?: string };
    return typeof data.version === 'string' ? data.version : null;
  } catch {
    return null;
  }
}

function writeCache(result: UpdateCheckResult): void {
  try {
    mkdirSync(CONFIG_DIR, { recursive: true });
    writeFileSync(UPDATE_CHECK_FILE, JSON.stringify(result), 'utf-8');
  } catch {
    // Silent failure on write errors
  }
}

export async function checkForUpdate(
  configUpdateCheck: boolean,
): Promise<UpdateCheckResult | null> {
  if (isUpdateCheckDisabled(configUpdateCheck)) return null;

  const cached = readCachedUpdate();

  // Return fresh cache without fetching
  if (cached && Date.now() - cached.checkedAt < UPDATE_CHECK_INTERVAL) {
    return cached;
  }

  const latestVersion = await fetchLatestVersion();

  if (latestVersion) {
    const result: UpdateCheckResult = {
      latestVersion,
      currentVersion: VERSION,
      updateAvailable: compareVersions(VERSION, latestVersion) < 0,
      checkedAt: Date.now(),
    };
    writeCache(result);
    return result;
  }

  // Network failure — return stale cache if available
  return cached;
}
