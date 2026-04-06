import { existsSync, readFileSync, statSync, unlinkSync, chmodSync, rmSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { homedir } from 'node:os';
import {
  CONFIG_DIR,
  CONFIG_FILE,
  PID_FILE,
  HOOK_FILE,
  LEGACY_CONFIG_DIR,
} from './shared/constants.js';
import { updateHookPaths, copyHookToStablePath } from './shared/migration.js';

const CLAUDE_SETTINGS_PATH = join(homedir(), '.claude', 'settings.json');

export interface CheckResult {
  status: 'pass' | 'fail' | 'warn';
  label: string;
  message: string;
  fix?: () => Promise<void>;
}

export function checkNodeVersion(): CheckResult {
  const version = process.versions.node;
  const major = parseInt(version.split('.')[0], 10);
  if (major >= 18) {
    return { status: 'pass', label: 'Node.js', message: `Node.js ${version}` };
  }
  return { status: 'fail', label: 'Node.js', message: `Node.js ${version} (>= 18 required)` };
}

export function checkJq(): CheckResult {
  try {
    const version = execSync('jq --version', { stdio: 'pipe' }).toString().trim();
    return { status: 'pass', label: 'jq', message: `jq ${version}` };
  } catch {
    return {
      status: 'fail',
      label: 'jq',
      message: 'jq not found (brew install jq / apt install jq)',
    };
  }
}

export function checkConfigFile(): CheckResult {
  if (!existsSync(CONFIG_FILE)) {
    return {
      status: 'fail',
      label: 'Config',
      message: `Config not found at ${CONFIG_FILE} — run \`claude-presence setup\``,
    };
  }
  try {
    JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
    return { status: 'pass', label: 'Config', message: CONFIG_FILE };
  } catch {
    return { status: 'fail', label: 'Config', message: `Invalid JSON in ${CONFIG_FILE}` };
  }
}

export function checkLegacyConfigDir(): CheckResult {
  const legacyExists = existsSync(LEGACY_CONFIG_DIR);
  const newExists = existsSync(CONFIG_DIR);

  if (!legacyExists) {
    return { status: 'pass', label: 'Legacy config', message: 'No legacy directory' };
  }

  if (legacyExists && newExists) {
    return {
      status: 'warn',
      label: 'Legacy config',
      message: `Both ${LEGACY_CONFIG_DIR} and ${CONFIG_DIR} exist`,
      fix: async () => {
        rmSync(LEGACY_CONFIG_DIR, { recursive: true, force: true });
      },
    };
  }

  return {
    status: 'fail',
    label: 'Legacy config',
    message: `Old config at ${LEGACY_CONFIG_DIR} needs migration`,
    fix: async () => {
      const { migrateFromLegacy } = await import('./shared/migration.js');
      migrateFromLegacy();
    },
  };
}

export function checkHookScript(): CheckResult {
  if (!existsSync(HOOK_FILE)) {
    return {
      status: 'fail',
      label: 'Hook script',
      message: `Not found at ${HOOK_FILE}`,
      fix: async () => {
        copyHookToStablePath();
      },
    };
  }

  try {
    const stat = statSync(HOOK_FILE);
    const isExecutable = (stat.mode & 0o111) !== 0;
    if (!isExecutable) {
      return {
        status: 'fail',
        label: 'Hook script',
        message: `${HOOK_FILE} is not executable`,
        fix: async () => {
          chmodSync(HOOK_FILE, 0o755);
        },
      };
    }
  } catch {
    return { status: 'fail', label: 'Hook script', message: `Cannot stat ${HOOK_FILE}` };
  }

  return { status: 'pass', label: 'Hook script', message: HOOK_FILE };
}

export function checkHookPaths(): CheckResult {
  if (!existsSync(CLAUDE_SETTINGS_PATH)) {
    return { status: 'warn', label: 'Hook paths', message: 'No Claude settings.json found' };
  }

  try {
    const settings = JSON.parse(readFileSync(CLAUDE_SETTINGS_PATH, 'utf-8'));
    const hooks = settings.hooks as Record<string, unknown[]> | undefined;
    if (!hooks) {
      return { status: 'warn', label: 'Hook paths', message: 'No hooks configured' };
    }

    const mismatched: string[] = [];
    let hookCount = 0;

    for (const event of Object.keys(hooks)) {
      for (const entry of hooks[event]) {
        const entryObj = entry as Record<string, unknown>;
        const innerHooks = entryObj.hooks as Array<Record<string, unknown>> | undefined;
        if (!innerHooks) continue;

        for (const hook of innerHooks) {
          if (typeof hook.command === 'string' && hook.command.includes('claude-hook.sh')) {
            hookCount++;
            if (hook.command !== HOOK_FILE) {
              mismatched.push(hook.command);
            }
          }
        }
      }
    }

    if (hookCount === 0) {
      return {
        status: 'warn',
        label: 'Hook paths',
        message: 'No claude-presence hooks found in settings',
      };
    }

    if (mismatched.length > 0) {
      return {
        status: 'fail',
        label: 'Hook paths',
        message: `${mismatched.length} hook(s) point to wrong path`,
        fix: async () => {
          updateHookPaths();
        },
      };
    }

    return { status: 'pass', label: 'Hook paths', message: `${hookCount} hooks configured` };
  } catch {
    return { status: 'fail', label: 'Hook paths', message: 'Cannot parse Claude settings.json' };
  }
}

export function checkDuplicateHooks(): CheckResult {
  if (!existsSync(CLAUDE_SETTINGS_PATH)) {
    return { status: 'pass', label: 'Duplicate hooks', message: 'No settings file' };
  }

  try {
    const settings = JSON.parse(readFileSync(CLAUDE_SETTINGS_PATH, 'utf-8'));
    const hooks = settings.hooks as Record<string, unknown[]> | undefined;
    if (!hooks) return { status: 'pass', label: 'Duplicate hooks', message: 'OK' };

    let duplicates = 0;

    for (const event of Object.keys(hooks)) {
      const seen = new Set<string>();
      for (const entry of hooks[event]) {
        const entryObj = entry as Record<string, unknown>;
        const innerHooks = entryObj.hooks as Array<Record<string, unknown>> | undefined;
        if (!innerHooks) continue;

        for (const hook of innerHooks) {
          if (typeof hook.command === 'string' && hook.command.includes('claude-hook.sh')) {
            if (seen.has(event)) {
              duplicates++;
            }
            seen.add(event);
          }
        }
      }
    }

    if (duplicates > 0) {
      return {
        status: 'fail',
        label: 'Duplicate hooks',
        message: `${duplicates} duplicate hook entries`,
        fix: async () => {
          updateHookPaths();
        },
      };
    }

    return { status: 'pass', label: 'Duplicate hooks', message: 'No duplicates' };
  } catch {
    return { status: 'pass', label: 'Duplicate hooks', message: 'Cannot check' };
  }
}

export function checkStalePid(): CheckResult {
  if (!existsSync(PID_FILE)) {
    return { status: 'pass', label: 'Daemon PID', message: 'No PID file' };
  }

  try {
    const pid = parseInt(readFileSync(PID_FILE, 'utf-8').trim(), 10);
    try {
      process.kill(pid, 0);
      return { status: 'pass', label: 'Daemon PID', message: `Running (PID ${pid})` };
    } catch {
      return {
        status: 'fail',
        label: 'Daemon PID',
        message: `Stale PID file (process ${pid} not running)`,
        fix: async () => {
          unlinkSync(PID_FILE);
        },
      };
    }
  } catch {
    return {
      status: 'fail',
      label: 'Daemon PID',
      message: 'Invalid PID file',
      fix: async () => {
        unlinkSync(PID_FILE);
      },
    };
  }
}

export function checkStaleLock(): CheckResult {
  const lockDir = join(CONFIG_DIR, 'autostart.lock');
  if (!existsSync(lockDir)) {
    return { status: 'pass', label: 'Autostart lock', message: 'No stale lock' };
  }

  return {
    status: 'warn',
    label: 'Autostart lock',
    message: 'Stale autostart lock found',
    fix: async () => {
      try {
        rmSync(lockDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    },
  };
}

export async function checkDaemonHealth(port: number): Promise<CheckResult> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    if (res.ok) {
      const data = (await res.json()) as { connected: boolean; sessions: number; uptime: number };
      if (data.connected) {
        return {
          status: 'pass',
          label: 'Discord',
          message: `Connected, ${data.sessions} session(s)`,
        };
      }
      return {
        status: 'warn',
        label: 'Discord',
        message: 'Daemon running but Discord not connected (is Discord open?)',
      };
    }
  } catch {
    // not reachable
  }

  return {
    status: 'fail',
    label: 'Daemon',
    message: 'Not reachable',
  };
}

export function checkOldEnvVars(): CheckResult {
  const oldVars = [
    'CLAUDE_DISCORD_CLIENT_ID',
    'CLAUDE_DISCORD_PORT',
    'CLAUDE_DISCORD_PRESET',
    'CLAUDE_DISCORD_UPDATE_CHECK',
    'CLAUDE_DISCORD_URL',
  ];

  const found = oldVars.filter((v) => process.env[v] !== undefined);
  if (found.length === 0) {
    return { status: 'pass', label: 'Env vars', message: 'Using new names' };
  }

  const renamed = found.map((v) => v.replace('CLAUDE_DISCORD', 'CLAUDE_PRESENCE'));
  return {
    status: 'warn',
    label: 'Env vars',
    message: `Old env vars in use: ${found.join(', ')}. Rename to: ${renamed.join(', ')}`,
  };
}

export async function runAllChecks(port: number): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  results.push(checkNodeVersion());
  results.push(checkJq());
  results.push(checkConfigFile());
  results.push(checkLegacyConfigDir());
  results.push(checkHookScript());
  results.push(checkHookPaths());
  results.push(checkDuplicateHooks());
  results.push(checkStalePid());
  results.push(checkStaleLock());
  results.push(await checkDaemonHealth(port));
  results.push(checkOldEnvVars());

  return results;
}
