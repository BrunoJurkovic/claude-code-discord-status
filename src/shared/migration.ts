import {
  existsSync,
  renameSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  chmodSync,
  mkdirSync,
} from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { CONFIG_DIR, HOOK_FILE, CONFIG_FILE, LEGACY_CONFIG_DIR } from './constants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CLAUDE_SETTINGS_PATH = join(homedir(), '.claude', 'settings.json');

/**
 * Migrates from ~/.claude-discord-status/ to ~/.claude-presence/.
 * Returns true if migration was performed.
 */
export function migrateFromLegacy(): boolean {
  const legacyExists = existsSync(LEGACY_CONFIG_DIR);
  const newExists = existsSync(CONFIG_DIR);

  // Nothing to migrate
  if (!legacyExists) return false;

  // Both exist — skip (user already migrated or has manual setup)
  if (legacyExists && newExists) return false;

  try {
    // Step 1: Move the directory
    renameSync(LEGACY_CONFIG_DIR, CONFIG_DIR);

    // Step 2: Update hook paths in Claude settings
    updateHookPaths();

    // Step 3: Re-copy hook script to ensure it's up to date
    copyHookToStablePath();

    // Step 4: Update daemonPath in config
    updateDaemonPathInConfig();

    return true;
  } catch {
    // Migration failed — non-fatal
    return false;
  }
}

/**
 * Scans ~/.claude/settings.json and rewrites any hook command
 * containing "claude-hook.sh" to point to the stable path.
 */
export function updateHookPaths(): void {
  try {
    if (!existsSync(CLAUDE_SETTINGS_PATH)) return;

    const raw = readFileSync(CLAUDE_SETTINGS_PATH, 'utf-8');
    const settings = JSON.parse(raw);
    const hooks = settings.hooks as Record<string, unknown[]> | undefined;
    if (!hooks) return;

    let changed = false;

    for (const event of Object.keys(hooks)) {
      for (const entry of hooks[event]) {
        const entryObj = entry as Record<string, unknown>;
        const innerHooks = entryObj.hooks as Array<Record<string, unknown>> | undefined;
        if (!innerHooks) continue;

        for (const hook of innerHooks) {
          if (typeof hook.command === 'string' && hook.command.includes('claude-hook.sh')) {
            hook.command = HOOK_FILE;
            changed = true;
          }
        }
      }
    }

    if (changed) {
      writeFileSync(CLAUDE_SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf-8');
    }
  } catch {
    // Non-fatal
  }
}

/**
 * Copies the current package's claude-hook.sh to the stable config dir location.
 */
export function copyHookToStablePath(): void {
  try {
    // __dirname is dist/ when bundled by tsup (not src/shared/)
    const candidates = [
      resolve(__dirname, '..', 'src', 'hooks', 'claude-hook.sh'),
      resolve(__dirname, '..', 'hooks', 'claude-hook.sh'),
    ];
    const source = candidates.find((p) => existsSync(p));
    if (!source) return;

    mkdirSync(CONFIG_DIR, { recursive: true });
    copyFileSync(source, HOOK_FILE);
    chmodSync(HOOK_FILE, 0o755);
  } catch {
    // Non-fatal
  }
}

/**
 * Updates the daemonPath in config.json to point to the current package's daemon.
 */
export function updateDaemonPathInConfig(): void {
  try {
    if (!existsSync(CONFIG_FILE)) return;

    const config = JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
    // __dirname is dist/ when bundled by tsup (not src/shared/)
    const daemonPath = resolve(__dirname, 'daemon', 'index.js');

    if (existsSync(daemonPath) && config.daemonPath !== daemonPath) {
      config.daemonPath = daemonPath;
      writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
    }
  } catch {
    // Non-fatal
  }
}
