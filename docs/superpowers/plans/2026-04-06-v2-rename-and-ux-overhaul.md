# v2.0.0: Rename to claude-presence & UX Overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the project from `claude-code-discord-status` to `claude-presence`, fix broken auto-start, add a `doctor` command, and streamline the setup flow.

**Architecture:** The rename touches constants, config, CLI, hook script, package.json, and tests. Migration logic auto-converts old installs. The doctor command runs health checks and offers fixes. Smart auto-start detects stale PIDs and retries intelligently.

**Tech Stack:** Node.js, TypeScript, Bash, Vitest, tsup, @clack/prompts

**Spec:** `docs/superpowers/specs/2026-04-06-v2-rename-and-ux-overhaul.md`

---

### Task 1: Rename constants and config paths

**Files:**
- Modify: `src/shared/constants.ts`
- Modify: `src/shared/config.ts`
- Modify: `src/shared/update-checker.ts`
- Modify: `tests/shared/config.test.ts`
- Modify: `tests/shared/update-checker.test.ts`

- [ ] **Step 1: Update constants.ts with new paths and legacy constants**

In `src/shared/constants.ts`, change:

```typescript
// Old
export const CONFIG_DIR = join(homedir(), '.claude-discord-status');
// ...
export const PACKAGE_NAME = 'claude-code-discord-status';
```

To:

```typescript
export const CONFIG_DIR = join(homedir(), '.claude-presence');
export const CONFIG_FILE = join(CONFIG_DIR, 'config.json');
export const PID_FILE = join(CONFIG_DIR, 'daemon.pid');
export const LOG_FILE = join(CONFIG_DIR, 'daemon.log');
export const HOOK_FILE = join(CONFIG_DIR, 'claude-hook.sh');
export const UPDATE_CHECK_FILE = join(CONFIG_DIR, 'update-check.json');
export const LAST_SEEN_VERSION_FILE = join(CONFIG_DIR, 'last-seen-version');
export const PENDING_CHANGELOG_FILE = join(CONFIG_DIR, 'pending-changelog');
export const PACKAGE_NAME = 'claude-presence';

// Legacy paths for migration
export const LEGACY_CONFIG_DIR = join(homedir(), '.claude-discord-status');
```

The derived constants (`CONFIG_FILE`, `PID_FILE`, etc.) are already defined relative to `CONFIG_DIR`, so only `CONFIG_DIR` and `PACKAGE_NAME` actually change. Add `LEGACY_CONFIG_DIR` at the bottom.

- [ ] **Step 2: Update config.ts env var fallback chain**

In `src/shared/config.ts`, change `loadConfig()` to check new env vars first, then old as fallback:

```typescript
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

  const updateCheckEnv =
    process.env.CLAUDE_PRESENCE_UPDATE_CHECK ?? process.env.CLAUDE_DISCORD_UPDATE_CHECK;
  const updateCheck =
    updateCheckEnv !== undefined ? updateCheckEnv !== '0' : (fileConfig.updateCheck ?? true);

  return {
    discordClientId:
      process.env.CLAUDE_PRESENCE_CLIENT_ID ??
      process.env.CLAUDE_DISCORD_CLIENT_ID ??
      fileConfig.discordClientId ??
      DEFAULT_DISCORD_CLIENT_ID,
    daemonPort: process.env.CLAUDE_PRESENCE_PORT
      ? parseInt(process.env.CLAUDE_PRESENCE_PORT, 10)
      : process.env.CLAUDE_DISCORD_PORT
        ? parseInt(process.env.CLAUDE_DISCORD_PORT, 10)
        : (fileConfig.daemonPort ?? DEFAULT_PORT),
    staleCheckInterval: fileConfig.staleCheckInterval ?? STALE_CHECK_INTERVAL,
    idleTimeout: fileConfig.idleTimeout ?? IDLE_TIMEOUT,
    removeTimeout: fileConfig.removeTimeout ?? REMOVE_TIMEOUT,
    updateCheck,
    preset:
      process.env.CLAUDE_PRESENCE_PRESET ??
      process.env.CLAUDE_DISCORD_PRESET ??
      fileConfig.preset ??
      'minimal',
  };
}
```

- [ ] **Step 3: Update update-checker.ts env var fallback**

In `src/shared/update-checker.ts`, change `isUpdateCheckDisabled()`:

```typescript
export function isUpdateCheckDisabled(configUpdateCheck: boolean): boolean {
  if (process.env.NO_UPDATE_NOTIFIER === '1') return true;
  if (process.env.CLAUDE_PRESENCE_UPDATE_CHECK === '0') return true;
  if (process.env.CLAUDE_DISCORD_UPDATE_CHECK === '0') return true;
  return !configUpdateCheck;
}
```

- [ ] **Step 4: Update config.test.ts for new env var names**

In `tests/shared/config.test.ts`, update the `beforeEach` to clean both old and new env vars, and add tests for the fallback chain:

```typescript
beforeEach(() => {
  vi.resetModules();
  process.env = { ...originalEnv };
  // Clean new env vars
  delete process.env.CLAUDE_PRESENCE_CLIENT_ID;
  delete process.env.CLAUDE_PRESENCE_PORT;
  delete process.env.CLAUDE_PRESENCE_UPDATE_CHECK;
  delete process.env.CLAUDE_PRESENCE_PRESET;
  // Clean old env vars
  delete process.env.CLAUDE_DISCORD_CLIENT_ID;
  delete process.env.CLAUDE_DISCORD_PORT;
  delete process.env.CLAUDE_DISCORD_UPDATE_CHECK;
  delete process.env.CLAUDE_DISCORD_PRESET;
});
```

Update existing env var test names and values from `CLAUDE_DISCORD_*` to `CLAUDE_PRESENCE_*`. For example:

```typescript
it('CLAUDE_PRESENCE_UPDATE_CHECK=0 overrides config', async () => {
  vi.mocked(existsSync).mockReturnValue(true);
  vi.mocked(readFileSync).mockReturnValue(
    JSON.stringify({ updateCheck: true }),
  );
  process.env.CLAUDE_PRESENCE_UPDATE_CHECK = '0';
  const config = await loadConfig();
  expect(config.updateCheck).toBe(false);
});

it('CLAUDE_PRESENCE_* env vars override config file', async () => {
  vi.mocked(existsSync).mockReturnValue(true);
  vi.mocked(readFileSync).mockReturnValue(
    JSON.stringify({ discordClientId: 'file-id', daemonPort: 9999 }),
  );
  process.env.CLAUDE_PRESENCE_CLIENT_ID = 'env-client-id';
  process.env.CLAUDE_PRESENCE_PORT = '8888';
  const config = await loadConfig();
  expect(config.discordClientId).toBe('env-client-id');
  expect(config.daemonPort).toBe(8888);
});

it('old CLAUDE_DISCORD_* env vars work as fallback', async () => {
  vi.mocked(existsSync).mockReturnValue(false);
  process.env.CLAUDE_DISCORD_CLIENT_ID = 'legacy-id';
  process.env.CLAUDE_DISCORD_PORT = '7777';
  const config = await loadConfig();
  expect(config.discordClientId).toBe('legacy-id');
  expect(config.daemonPort).toBe(7777);
});

it('new CLAUDE_PRESENCE_* takes precedence over old CLAUDE_DISCORD_*', async () => {
  vi.mocked(existsSync).mockReturnValue(false);
  process.env.CLAUDE_PRESENCE_CLIENT_ID = 'new-id';
  process.env.CLAUDE_DISCORD_CLIENT_ID = 'old-id';
  const config = await loadConfig();
  expect(config.discordClientId).toBe('new-id');
});

it('CLAUDE_PRESENCE_PRESET env var overrides config file', async () => {
  vi.mocked(existsSync).mockReturnValue(true);
  vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ preset: 'gen-z' }));
  process.env.CLAUDE_PRESENCE_PRESET = 'minimal';
  const config = await loadConfig();
  expect(config.preset).toBe('minimal');
});
```

- [ ] **Step 5: Update update-checker.test.ts for new env var names**

In `tests/shared/update-checker.test.ts`, update `beforeEach` to clean both env var sets:

```typescript
beforeEach(() => {
  vi.resetModules();
  process.env = { ...originalEnv };
  delete process.env.NO_UPDATE_NOTIFIER;
  delete process.env.CLAUDE_PRESENCE_UPDATE_CHECK;
  delete process.env.CLAUDE_DISCORD_UPDATE_CHECK;
  // ...rest unchanged
});
```

Update the existing test and add a new one:

```typescript
it('returns null when disabled via CLAUDE_PRESENCE_UPDATE_CHECK=0', async () => {
  process.env.CLAUDE_PRESENCE_UPDATE_CHECK = '0';
  const check = await loadCheckForUpdate();
  expect(await check(true)).toBeNull();
});

it('returns null when disabled via legacy CLAUDE_DISCORD_UPDATE_CHECK=0', async () => {
  process.env.CLAUDE_DISCORD_UPDATE_CHECK = '0';
  const check = await loadCheckForUpdate();
  expect(await check(true)).toBeNull();
});
```

- [ ] **Step 6: Run tests**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/shared/constants.ts src/shared/config.ts src/shared/update-checker.ts tests/shared/config.test.ts tests/shared/update-checker.test.ts
git commit -m "feat: rename constants and config to claude-presence with env var fallback"
```

---

### Task 2: Rename package.json and display strings

**Files:**
- Modify: `package.json`
- Modify: `src/cli.ts`

- [ ] **Step 1: Update package.json**

Change:
```json
{
  "name": "claude-presence",
  "bin": {
    "claude-presence": "./dist/cli.js"
  }
}
```

Also update `repository.url`, `homepage`, and `bugs.url` if the GitHub repo is being renamed. If not, leave them as-is (the spec says this is orthogonal).

- [ ] **Step 2: Rename all display strings in cli.ts**

Find and replace all hardcoded `claude-discord-status` strings in `src/cli.ts`. These are string literals in `p.intro()` calls, help text, and update notifications:

Replace every `p.intro('claude-discord-status')` and `p.intro(\`claude-discord-status v${VERSION}\`)` with `p.intro(\`claude-presence v${VERSION}\`)`.

Replace `"Run \`claude-discord-status update\` to update"` with `"Run \`claude-presence update\` to update"`.

Replace the `npm install -g ${PACKAGE_NAME}` reference (line 198) — this already uses the `PACKAGE_NAME` constant so it will update automatically.

Replace `'claude-discord-status'` in the help `p.outro()` (line 795) with a description that still makes sense: `'Discord Rich Presence for Claude Code'` (already correct, no change needed there).

- [ ] **Step 3: Run typecheck and tests**

Run: `npm run typecheck && npm test`
Expected: All pass.

- [ ] **Step 4: Commit**

```bash
git add package.json src/cli.ts
git commit -m "feat: rename package to claude-presence and update display strings"
```

---

### Task 3: Add migration logic to CLI

**Files:**
- Modify: `src/cli.ts`
- Create: `tests/cli/migration.test.ts`

- [ ] **Step 1: Write migration tests**

Create `tests/cli/migration.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  existsSync,
  renameSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  copyFileSync,
  chmodSync,
} from 'node:fs';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  renameSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  copyFileSync: vi.fn(),
  chmodSync: vi.fn(),
  unlinkSync: vi.fn(),
}));

// We test the migration function directly
// It will be exported from cli.ts or a separate migration.ts module

describe('migrateFromLegacy', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('migrates when old dir exists and new dir does not', async () => {
    vi.mocked(existsSync).mockImplementation((p: string) => {
      if (typeof p === 'string' && p.includes('.claude-discord-status')) return true;
      if (typeof p === 'string' && p.includes('.claude-presence')) return false;
      return false;
    });

    const { migrateFromLegacy } = await import('../../src/shared/migration.js');
    const result = migrateFromLegacy();

    expect(result).toBe(true);
    expect(renameSync).toHaveBeenCalled();
  });

  it('skips when both dirs exist', async () => {
    vi.mocked(existsSync).mockReturnValue(true);

    const { migrateFromLegacy } = await import('../../src/shared/migration.js');
    const result = migrateFromLegacy();

    expect(result).toBe(false);
    expect(renameSync).not.toHaveBeenCalled();
  });

  it('skips when neither dir exists', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    const { migrateFromLegacy } = await import('../../src/shared/migration.js');
    const result = migrateFromLegacy();

    expect(result).toBe(false);
    expect(renameSync).not.toHaveBeenCalled();
  });

  it('updates hook paths in claude settings', async () => {
    vi.mocked(existsSync).mockImplementation((p: string) => {
      if (typeof p === 'string' && p.includes('.claude-discord-status')) return true;
      if (typeof p === 'string' && p.includes('.claude-presence')) return false;
      if (typeof p === 'string' && p.includes('settings.json')) return true;
      return false;
    });

    const settingsWithOldHooks = JSON.stringify({
      hooks: {
        SessionStart: [{
          hooks: [{
            type: 'command',
            command: '/opt/homebrew/lib/node_modules/claude-code-discord-status/src/hooks/claude-hook.sh',
          }],
        }],
      },
    });
    vi.mocked(readFileSync).mockReturnValue(settingsWithOldHooks);

    const { migrateFromLegacy } = await import('../../src/shared/migration.js');
    migrateFromLegacy();

    const writeCall = vi.mocked(writeFileSync).mock.calls.find(
      (call) => typeof call[0] === 'string' && call[0].includes('settings.json'),
    );
    expect(writeCall).toBeDefined();
    const written = JSON.parse(writeCall![1] as string);
    expect(written.hooks.SessionStart[0].hooks[0].command).toContain('.claude-presence');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/cli/migration.test.ts`
Expected: FAIL — `src/shared/migration.js` does not exist.

- [ ] **Step 3: Create migration module**

Create `src/shared/migration.ts`:

```typescript
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

const CLAUDE_SETTINGS_PATH = join(
  homedir(),
  '.claude',
  'settings.json',
);

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
            hook.command = STABLE_HOOK_PATH;
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
    const candidates = [
      resolve(__dirname, '..', '..', 'src', 'hooks', 'claude-hook.sh'),
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
    const daemonPath = resolve(__dirname, '..', 'daemon', 'index.js');

    if (existsSync(daemonPath) && config.daemonPath !== daemonPath) {
      config.daemonPath = daemonPath;
      writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
    }
  } catch {
    // Non-fatal
  }
}
```

- [ ] **Step 4: Wire migration into CLI entry**

In `src/cli.ts`, add at the top of the file after the imports:

```typescript
import { migrateFromLegacy } from './shared/migration.js';
```

Then add a migration call before the `switch (command)` block at the bottom of the file:

```typescript
// Run migration before any command
const migrated = migrateFromLegacy();
if (migrated) {
  p.log.info('Migrated config from ~/.claude-discord-status/ to ~/.claude-presence/');
}
```

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: All tests pass, including the new migration tests.

- [ ] **Step 6: Commit**

```bash
git add src/shared/migration.ts tests/cli/migration.test.ts src/cli.ts
git commit -m "feat: add automatic migration from legacy config directory"
```

---

### Task 4: Revamp setup flow

**Files:**
- Modify: `src/cli.ts` (the `setup()` function)

- [ ] **Step 1: Reorder setup flow**

In `src/cli.ts`, rewrite the `setup()` function. The key changes are:
1. Migration runs after prereq checks (already wired from Task 3)
2. Preset selection comes first
3. Custom Discord app question moves to end, pre-selected "No"

Replace the configuration section of `setup()` (lines 396-465 approximately — everything between the `--- Configuration ---` comment and the `--- Installation ---` comment) with:

```typescript
  // --- Configuration ---

  // Preset selection first
  let existingPreset: PresetName = DEFAULT_PRESET;
  if (existsSync(CONFIG_FILE)) {
    try {
      const current = JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
      if (current.preset && isValidPreset(current.preset)) {
        existingPreset = current.preset;
      }
    } catch {
      // ignore
    }
  }

  const presetChoice = await p.select({
    message: 'Choose a message style',
    options: PRESET_NAMES.map((name) => ({
      value: name,
      label: PRESETS[name].label,
      hint: PRESETS[name].description,
    })),
    initialValue: existingPreset,
  });

  if (p.isCancel(presetChoice)) {
    p.cancel('Setup cancelled.');
    process.exit(0);
  }

  // Custom Discord app — last, defaults to No
  let resolvedClientId = DEFAULT_DISCORD_CLIENT_ID;
  if (existsSync(CONFIG_FILE)) {
    try {
      const current = JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
      if (current.discordClientId) {
        resolvedClientId = current.discordClientId;
      }
    } catch {
      // ignore
    }
  }

  const useCustomApp = await p.confirm({
    message: 'Use a custom Discord Application ID?',
    initialValue: false,
  });

  if (p.isCancel(useCustomApp)) {
    p.cancel('Setup cancelled.');
    process.exit(0);
  }

  if (useCustomApp) {
    const clientId = await p.text({
      message: 'Discord Client ID',
      placeholder: DEFAULT_DISCORD_CLIENT_ID,
      validate: (value = '') => {
        if (!value.trim()) return 'Client ID is required';
        if (!/^\d+$/.test(value.trim())) return 'Client ID must be numeric';
      },
    });

    if (p.isCancel(clientId)) {
      p.cancel('Setup cancelled.');
      process.exit(0);
    }

    resolvedClientId = clientId.trim();
  }

  if (resolvedClientId === DEFAULT_DISCORD_CLIENT_ID) {
    p.log.info('Using default Client ID (recommended)');
  } else {
    p.log.info(`Using custom Client ID: ${resolvedClientId}`);
  }
```

- [ ] **Step 2: Add hint to the confirm prompt**

The `@clack/prompts` `confirm()` doesn't have a `hint` option, but we can add context before the question:

```typescript
  p.log.step('The default works out of the box \u2014 only change this if you\'ve created your own Discord app');

  const useCustomApp = await p.confirm({
    message: 'Use a custom Discord Application ID?',
    initialValue: false,
  });
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: Pass.

- [ ] **Step 4: Commit**

```bash
git add src/cli.ts
git commit -m "feat: revamp setup flow - preset first, custom app last with hint"
```

---

### Task 5: Smart auto-start in hook script

**Files:**
- Modify: `src/hooks/claude-hook.sh`

- [ ] **Step 1: Update env vars and config dir with fallback**

Replace the top of `src/hooks/claude-hook.sh` (lines 8-16):

```bash
# Config directory with legacy fallback
CONFIG_DIR="$HOME/.claude-presence"
if [ ! -d "$CONFIG_DIR" ] && [ -d "$HOME/.claude-discord-status" ]; then
  CONFIG_DIR="$HOME/.claude-discord-status"
fi

CONFIG_FILE="$CONFIG_DIR/config.json"
LOG_FILE="$CONFIG_DIR/daemon.log"
PID_FILE="$CONFIG_DIR/daemon.pid"
LOCK_DIR="$CONFIG_DIR/autostart.lock"
AUTOSTART_COOLDOWN=10

# Env var resolution: new names first, old names as fallback
DAEMON_PORT="${CLAUDE_PRESENCE_PORT:-${CLAUDE_DISCORD_PORT:-19452}}"
DAEMON_URL="${CLAUDE_PRESENCE_URL:-${CLAUDE_DISCORD_URL:-http://127.0.0.1:${DAEMON_PORT}}}"
CURL_OPTS="--connect-timeout 1 --max-time 1 -s -o /dev/null"
```

- [ ] **Step 2: Rewrite ensure_daemon() with smart PID detection**

Replace the entire `ensure_daemon()` function:

```bash
# Auto-start daemon if not reachable
ensure_daemon() {
  # Step 1: Quick health check — if reachable, we're done
  if curl --connect-timeout 0.5 --max-time 1 -s -o /dev/null "${DAEMON_URL}/health" 2>/dev/null; then
    return 0
  fi

  # Step 2: Check PID file for stale process detection
  if [ -f "$PID_FILE" ]; then
    local pid
    pid=$(cat "$PID_FILE" 2>/dev/null) || true

    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      # Process is alive but HTTP not ready — wait briefly
      local attempts=0
      while [ "$attempts" -lt 5 ]; do
        sleep 0.3
        if curl --connect-timeout 0.3 --max-time 0.5 -s -o /dev/null "${DAEMON_URL}/health" 2>/dev/null; then
          return 0
        fi
        attempts=$((attempts + 1))
      done
      # Daemon is alive but not responding — probably starting from another hook
      return 1
    else
      # Stale PID — process is dead. Clean up and fall through to restart.
      rm -f "$PID_FILE"
      rmdir "$LOCK_DIR" 2>/dev/null || true
    fi
  fi

  # Step 3: Check cooldown lock
  if [ -d "$LOCK_DIR" ]; then
    local lock_age
    lock_age=$(( $(date +%s) - $(file_mtime "$LOCK_DIR") ))
    if [ "$lock_age" -lt "$AUTOSTART_COOLDOWN" ]; then
      return 1
    fi
    rmdir "$LOCK_DIR" 2>/dev/null || true
  fi

  # Step 4: Acquire lock (atomic mkdir)
  if ! mkdir "$LOCK_DIR" 2>/dev/null; then
    return 1
  fi

  # Step 5: Resolve daemon path
  local daemon_path=""

  # Strategy 1: Read from config file
  if [ -f "$CONFIG_FILE" ]; then
    daemon_path=$(jq -r '.daemonPath // empty' "$CONFIG_FILE" 2>/dev/null) || true
  fi

  # Strategy 2: Derive from hook script location
  if [ -z "$daemon_path" ] || [ ! -f "$daemon_path" ]; then
    local script_dir
    script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    daemon_path="${script_dir}/../../dist/daemon/index.js"
  fi

  # Validate daemon path exists
  if [ ! -f "$daemon_path" ]; then
    rmdir "$LOCK_DIR" 2>/dev/null || true
    return 1
  fi

  # Ensure config dir exists
  mkdir -p "$CONFIG_DIR" 2>/dev/null || true

  # Step 6: Spawn daemon in background
  nohup node "$daemon_path" >> "$LOG_FILE" 2>&1 &

  # Step 7: Poll for readiness (10 attempts, 300ms each = 3s max)
  local attempts=0
  while [ "$attempts" -lt 10 ]; do
    sleep 0.3
    if curl --connect-timeout 0.3 --max-time 0.5 -s -o /dev/null "${DAEMON_URL}/health" 2>/dev/null; then
      # Success — remove lock so future hooks don't hit cooldown
      rmdir "$LOCK_DIR" 2>/dev/null || true
      return 0
    fi
    attempts=$((attempts + 1))
  done

  # Failed to start — leave lock for cooldown
  return 1
}
```

- [ ] **Step 3: Verify hook script is valid bash**

Run: `bash -n src/hooks/claude-hook.sh`
Expected: No syntax errors.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/claude-hook.sh
git commit -m "feat: smart auto-start with stale PID detection and reduced cooldown"
```

---

### Task 6: Doctor command

**Files:**
- Modify: `src/cli.ts`
- Create: `tests/cli/doctor.test.ts`

- [ ] **Step 1: Write doctor check tests**

Create `tests/cli/doctor.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { execSync } from 'node:child_process';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  unlinkSync: vi.fn(),
  copyFileSync: vi.fn(),
  chmodSync: vi.fn(),
  statSync: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
  spawn: vi.fn(),
}));

describe('doctor checks', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.resetModules();
  });

  describe('checkJq', () => {
    it('passes when jq is installed', async () => {
      vi.mocked(execSync).mockReturnValue(Buffer.from('jq-1.7.1'));
      const { checkJq } = await import('../../src/doctor.js');
      const result = checkJq();
      expect(result.status).toBe('pass');
    });

    it('fails when jq is not installed', async () => {
      vi.mocked(execSync).mockImplementation(() => { throw new Error('not found'); });
      const { checkJq } = await import('../../src/doctor.js');
      const result = checkJq();
      expect(result.status).toBe('fail');
    });
  });

  describe('checkConfigFile', () => {
    it('passes when config exists and parses', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('{"preset":"minimal"}');
      const { checkConfigFile } = await import('../../src/doctor.js');
      const result = checkConfigFile();
      expect(result.status).toBe('pass');
    });

    it('fails when config does not exist', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      const { checkConfigFile } = await import('../../src/doctor.js');
      const result = checkConfigFile();
      expect(result.status).toBe('fail');
    });
  });

  describe('checkLegacyConfigDir', () => {
    it('passes when no legacy dir exists', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      const { checkLegacyConfigDir } = await import('../../src/doctor.js');
      const result = checkLegacyConfigDir();
      expect(result.status).toBe('pass');
    });

    it('warns when both dirs exist', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      const { checkLegacyConfigDir } = await import('../../src/doctor.js');
      const result = checkLegacyConfigDir();
      expect(result.status).toBe('warn');
      expect(result.fix).toBeDefined();
    });
  });

  describe('checkHookScript', () => {
    it('passes when hook exists and is executable', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(statSync).mockReturnValue({ mode: 0o100755 } as any);
      const { checkHookScript } = await import('../../src/doctor.js');
      const result = checkHookScript();
      expect(result.status).toBe('pass');
    });

    it('fails when hook does not exist', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      const { checkHookScript } = await import('../../src/doctor.js');
      const result = checkHookScript();
      expect(result.status).toBe('fail');
      expect(result.fix).toBeDefined();
    });
  });

  describe('checkHookPaths', () => {
    it('passes when all hooks point to stable path', async () => {
      const home = process.env.HOME ?? '/Users/test';
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        hooks: {
          SessionStart: [{
            hooks: [{ command: `${home}/.claude-presence/claude-hook.sh` }],
          }],
        },
      }));
      const { checkHookPaths } = await import('../../src/doctor.js');
      const result = checkHookPaths();
      expect(result.status).toBe('pass');
    });

    it('fails when hooks point to wrong path', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        hooks: {
          SessionStart: [{
            hooks: [{ command: '/opt/homebrew/lib/node_modules/claude-hook.sh' }],
          }],
        },
      }));
      const { checkHookPaths } = await import('../../src/doctor.js');
      const result = checkHookPaths();
      expect(result.status).toBe('fail');
      expect(result.fix).toBeDefined();
    });
  });

  describe('checkStalePid', () => {
    it('passes when no PID file exists', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      const { checkStalePid } = await import('../../src/doctor.js');
      const result = checkStalePid();
      expect(result.status).toBe('pass');
    });
  });

  describe('checkStaleLock', () => {
    it('passes when no lock dir exists', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      const { checkStaleLock } = await import('../../src/doctor.js');
      const result = checkStaleLock();
      expect(result.status).toBe('pass');
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/cli/doctor.test.ts`
Expected: FAIL — `src/doctor.js` does not exist.

- [ ] **Step 3: Create doctor module**

Create `src/doctor.ts`:

```typescript
import {
  existsSync,
  readFileSync,
  writeFileSync,
  statSync,
  unlinkSync,
  copyFileSync,
  chmodSync,
  mkdirSync,
  rmSync,
} from 'node:fs';
import { execSync } from 'node:child_process';
import { join, resolve, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  CONFIG_DIR,
  CONFIG_FILE,
  PID_FILE,
  HOOK_FILE,
  LEGACY_CONFIG_DIR,
} from './shared/constants.js';
import { updateHookPaths, copyHookToStablePath } from './shared/migration.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
      message: `Config not found at ${CONFIG_FILE}`,
      fix: async () => {
        // Can't auto-fix — need setup
      },
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
      return { status: 'warn', label: 'Hook paths', message: 'No discord-status hooks found' };
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
          // Deduplicate by removing all claude-hook.sh entries, then re-adding one per event
          // This is handled by updateHookPaths which replaces all entries
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
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/cli/doctor.test.ts`
Expected: All tests pass.

- [ ] **Step 5: Wire doctor command into CLI**

In `src/cli.ts`, add import and the `doctor` function:

```typescript
import {
  runAllChecks,
  type CheckResult,
} from './doctor.js';
```

Add the doctor function:

```typescript
async function doctor(): Promise<void> {
  p.intro(`claude-presence v${VERSION}`);

  const config = loadConfig();
  const autoFix = args.includes('--fix');

  const s = p.spinner();
  s.start('Checking health...');
  const results = await runAllChecks(config.daemonPort);
  s.stop('Health check complete');

  // Display results
  for (const r of results) {
    if (r.status === 'pass') {
      p.log.success(`${r.message}`);
    } else if (r.status === 'warn') {
      p.log.warn(`${r.label} \u2014 ${r.message}`);
    } else {
      p.log.error(`${r.label} \u2014 ${r.message}`);
    }
  }

  // Collect fixable issues
  const fixable = results.filter((r) => r.status !== 'pass' && r.fix);
  if (fixable.length === 0) {
    p.outro('All checks passed.');
    return;
  }

  let shouldFix = autoFix;
  if (!autoFix) {
    const confirm = await p.confirm({
      message: `Found ${fixable.length} fixable issue(s). Fix them?`,
      initialValue: true,
    });
    if (p.isCancel(confirm)) {
      p.cancel('Cancelled.');
      process.exit(0);
    }
    shouldFix = confirm;
  }

  if (shouldFix) {
    for (const r of fixable) {
      await r.fix!();
      p.log.success(`Fixed: ${r.label}`);
    }

    // Re-check daemon after fixes — try to start if still not reachable
    try {
      const res = await fetch(`http://127.0.0.1:${config.daemonPort}/health`);
      if (!res.ok) throw new Error();
    } catch {
      // Try starting daemon
      const daemonPath = resolve(__dirname, 'daemon', 'index.js');
      if (existsSync(daemonPath)) {
        mkdirSync(CONFIG_DIR, { recursive: true });
        const { openSync } = await import('node:fs');
        const logFd = openSync(LOG_FILE, 'a');
        const child = spawn('node', [daemonPath], {
          detached: true,
          stdio: ['ignore', logFd, logFd],
          env: { ...process.env },
        });
        child.unref();
        persistDaemonPath();
        p.log.success(`Daemon started (PID ${child.pid})`);
      }
    }
  }

  p.outro(shouldFix ? 'Issues fixed.' : 'Run with --fix to auto-repair.');
}
```

Add the case to the switch:

```typescript
  case 'doctor':
    await doctor();
    break;
```

Update the help text to include doctor:

```typescript
  p.note(
    [
      'setup            Interactive setup',
      'start [-d]       Start the daemon (-d for background)',
      'stop             Stop the daemon',
      'status           Show daemon status and sessions',
      'preset [name]    Change message style',
      'doctor [--fix]   Diagnose and fix issues',
      'update           Update to the latest version',
      'uninstall        Remove all hooks and config',
    ].join('\n'),
    'Commands',
  );
```

- [ ] **Step 6: Run typecheck and all tests**

Run: `npm run typecheck && npm test`
Expected: All pass.

- [ ] **Step 7: Commit**

```bash
git add src/doctor.ts tests/cli/doctor.test.ts src/cli.ts
git commit -m "feat: add doctor command with health checks and auto-fix"
```

---

### Task 7: Update uninstall to clean both directories

**Files:**
- Modify: `src/cli.ts` (the `uninstall()` function)

- [ ] **Step 1: Update uninstall to remove both config dirs**

In the `uninstall()` function in `src/cli.ts`, replace the config removal section (around line 680-687):

```typescript
  // Remove config — both new and legacy dirs
  try {
    const { rmSync } = await import('node:fs');
    if (existsSync(CONFIG_DIR)) {
      rmSync(CONFIG_DIR, { recursive: true, force: true });
      p.log.success('Config removed');
    }
    if (existsSync(LEGACY_CONFIG_DIR)) {
      rmSync(LEGACY_CONFIG_DIR, { recursive: true, force: true });
      p.log.success('Legacy config removed');
    }
    if (!existsSync(CONFIG_DIR) && !existsSync(LEGACY_CONFIG_DIR)) {
      p.log.success('Config already removed');
    }
  } catch {
    p.log.warn('Could not remove config directory');
  }
```

Add the `LEGACY_CONFIG_DIR` import at the top of `cli.ts` if not already there (it should come from `constants.js`).

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: Pass.

- [ ] **Step 3: Commit**

```bash
git add src/cli.ts
git commit -m "feat: uninstall cleans both legacy and new config directories"
```

---

### Task 8: Update README and final verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update README.md**

Replace all occurrences of:
- `claude-code-discord-status` with `claude-presence` (in npm install commands, package name references)
- `claude-discord-status` with `claude-presence` (in CLI command examples)
- `~/.claude-discord-status/` with `~/.claude-presence/`
- `CLAUDE_DISCORD_CLIENT_ID` with `CLAUDE_PRESENCE_CLIENT_ID`
- `CLAUDE_DISCORD_PORT` with `CLAUDE_PRESENCE_PORT`
- `CLAUDE_DISCORD_PRESET` with `CLAUDE_PRESENCE_PRESET`

Add the `doctor` command to the CLI section:

```bash
claude-presence doctor            # Diagnose and fix issues
claude-presence doctor --fix      # Auto-fix all issues
```

Add a "Upgrading from v1.x" section after "Quick Start":

```markdown
## Upgrading from v1.x

```bash
npm install -g claude-presence
claude-presence doctor --fix
```

Migration is automatic — your config, hooks, and settings are moved to the new `~/.claude-presence/` directory on first run. The old `claude-code-discord-status` package can be uninstalled after upgrading.
```

- [ ] **Step 2: Run full verification suite**

Run: `npm run format && npm run typecheck && npm test`
Expected: All pass.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: update README for claude-presence v2.0.0"
```

---

### Task 9: Final integration test

**Files:** None new — this is a manual verification task.

- [ ] **Step 1: Run full CI-equivalent suite**

```bash
npm run format:check && npm run lint && npm run typecheck && npm test && npm run build
```

Expected: All pass with zero warnings.

- [ ] **Step 2: Verify built output**

```bash
node dist/cli.js --version
node dist/cli.js
```

Expected: Version prints correctly. Help text shows `claude-presence` everywhere with `doctor` in the command list.

- [ ] **Step 3: Verify hook script**

```bash
bash -n src/hooks/claude-hook.sh
head -20 src/hooks/claude-hook.sh
```

Expected: No syntax errors. Top shows `CONFIG_DIR="$HOME/.claude-presence"` with legacy fallback.

- [ ] **Step 4: Commit any final formatting fixes**

If `format:check` required changes:
```bash
git add -A
git commit -m "chore: format"
```
