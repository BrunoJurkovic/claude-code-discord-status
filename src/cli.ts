import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  unlinkSync,
  copyFileSync,
  chmodSync,
} from 'node:fs';
import { spawn, execSync } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import * as p from '@clack/prompts';
import {
  CONFIG_DIR,
  CONFIG_FILE,
  PID_FILE,
  LOG_FILE,
  HOOK_FILE,
  DEFAULT_PORT,
  DEFAULT_DISCORD_CLIENT_ID,
  PACKAGE_NAME,
  LEGACY_CONFIG_DIR,
} from './shared/constants.js';
import { loadConfig } from './shared/config.js';
import { migrateFromLegacy } from './shared/migration.js';
import { runAllChecks } from './doctor.js';
import { PRESETS, PRESET_NAMES, DEFAULT_PRESET, isValidPreset } from './presets/index.js';
import type { PresetName } from './presets/types.js';
import { formatDuration, statusBadge, connectionBadge, dim } from './cli-utils.js';
import { VERSION } from './shared/version.js';
import {
  readCachedUpdate,
  isUpdateCheckDisabled,
  compareVersions,
} from './shared/update-checker.js';
import {
  checkChangelogState,
  formatChangelogSection,
  writePendingChangelog,
} from './shared/changelog.js';
import type { HealthResponse } from './shared/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const args = process.argv.slice(2);
const command = args[0];

function persistDaemonPath(): void {
  const daemonPath = resolve(__dirname, 'daemon', 'index.js');
  if (!existsSync(daemonPath)) return;

  try {
    let config: Record<string, unknown> = {};
    if (existsSync(CONFIG_FILE)) {
      config = JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
    }
    if (config.daemonPath !== daemonPath) {
      config.daemonPath = daemonPath;
      mkdirSync(CONFIG_DIR, { recursive: true });
      writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
    }
  } catch {
    // Non-critical
  }
}

function copyHookScript(): string {
  const candidates = [
    resolve(__dirname, '..', 'src', 'hooks', 'claude-hook.sh'),
    resolve(__dirname, '..', 'hooks', 'claude-hook.sh'),
  ];
  const source = candidates.find((p) => existsSync(p));
  if (!source) return HOOK_FILE;

  mkdirSync(CONFIG_DIR, { recursive: true });
  copyFileSync(source, HOOK_FILE);
  chmodSync(HOOK_FILE, 0o755);
  return HOOK_FILE;
}

async function waitForProcessExit(pid: number, timeoutMs = 3000): Promise<boolean> {
  const interval = 100;
  let elapsed = 0;
  while (elapsed < timeoutMs) {
    try {
      process.kill(pid, 0);
    } catch {
      return true;
    }
    await new Promise((r) => setTimeout(r, interval));
    elapsed += interval;
  }
  return false;
}

function getDaemonPid(): number | null {
  try {
    if (existsSync(PID_FILE)) {
      const pid = parseInt(readFileSync(PID_FILE, 'utf-8').trim(), 10);
      process.kill(pid, 0);
      return pid;
    }
  } catch {
    try {
      unlinkSync(PID_FILE);
    } catch {
      // ignore
    }
  }
  return null;
}

async function checkHealth(): Promise<HealthResponse | null> {
  const config = loadConfig();
  try {
    const res = await fetch(`http://127.0.0.1:${config.daemonPort}/health`);
    if (res.ok) {
      return (await res.json()) as HealthResponse;
    }
  } catch {
    // Not running
  }
  return null;
}

function displayChangelog(): boolean {
  const state = checkChangelogState(VERSION);
  if (!state.shouldShow) return false;

  const { sections } = state;
  const first = sections[0];
  const last = sections[sections.length - 1];
  const title =
    sections.length === 1
      ? `What's new in v${last.version}`
      : `What's new (v${first.version} – v${last.version})`;

  const parts: string[] = [];
  for (let i = 0; i < sections.length; i++) {
    if (i > 0) parts.push('─'.repeat(40));
    const s = sections[i];
    parts.push(`v${s.version} ${dim(`(${s.date})`)}`);
    parts.push(formatChangelogSection(s));
  }

  p.note(parts.join('\n\n'), title);
  return true;
}

function displayPostCommandNotifications(): void {
  const shownChangelog = displayChangelog();

  // Don't show "update available" if we just showed the changelog
  if (shownChangelog) return;

  const config = loadConfig();
  if (isUpdateCheckDisabled(config.updateCheck)) return;

  const cached = readCachedUpdate();
  if (!cached) return;

  // Compare against actual running version, not the stale cached currentVersion
  if (compareVersions(VERSION, cached.latestVersion) >= 0) return;

  p.note(
    `Update available: v${VERSION} → v${cached.latestVersion}\nRun \`claude-presence update\` to update`,
    'Update',
  );
}

async function update(): Promise<void> {
  p.intro(`claude-presence v${VERSION}`);

  const s = p.spinner();

  // Stop daemon if running
  const pid = getDaemonPid();
  if (pid) {
    try {
      process.kill(pid, 'SIGTERM');
      await waitForProcessExit(pid);
      p.log.success(`Daemon stopped (PID ${pid})`);
    } catch {
      // ignore
    }
  }

  // Clean up legacy MCP server registration (removed in v1.x)
  try {
    execSync('claude mcp remove discord-status', { stdio: 'pipe' });
    p.log.success('Removed legacy MCP server registration');
  } catch {
    // MCP was never registered or claude CLI not available — ignore
  }

  // Run npm install
  s.start(`Updating ${PACKAGE_NAME}...`);
  try {
    execSync(`npm install -g ${PACKAGE_NAME}@latest`, { stdio: 'pipe' });
    s.stop('Package updated');
    writePendingChangelog(VERSION);
  } catch (err) {
    s.stop('Update failed');
    p.log.error(`npm install failed: ${(err as Error).message}`);
    p.outro();
    process.exit(1);
  }

  // Re-copy hook script to stable location (Unix only; Windows uses CLI subcommand)
  if (process.platform !== 'win32') {
    copyHookScript();
  }

  // Restart daemon
  const daemonPath = resolve(__dirname, 'daemon', 'index.js');
  if (existsSync(daemonPath)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
    const { openSync } = await import('node:fs');
    const logFd = openSync(LOG_FILE, 'a');
    const child = spawn('node', [daemonPath], {
      detached: true,
      stdio: ['ignore', logFd, logFd],
      env: { ...process.env },
      windowsHide: true,
    });
    child.unref();
    persistDaemonPath();
    p.log.success(`Daemon restarted (PID ${child.pid})`);
  }

  p.outro('Update complete!');
}

async function startDaemon(background: boolean): Promise<void> {
  p.intro(`claude-presence v${VERSION}`);

  const existing = getDaemonPid();
  if (existing) {
    p.log.warn(`Daemon is already running (PID ${existing})`);
    p.outro();
    return;
  }

  const daemonPath = resolve(__dirname, 'daemon', 'index.js');

  if (!existsSync(daemonPath)) {
    p.log.error(`Daemon entry point not found at ${daemonPath}`);
    p.log.info('Run `npm run build` first.');
    p.outro();
    process.exit(1);
  }

  if (background) {
    mkdirSync(CONFIG_DIR, { recursive: true });

    const { openSync } = await import('node:fs');
    const logFd = openSync(LOG_FILE, 'a');
    const child = spawn('node', [daemonPath], {
      detached: true,
      stdio: ['ignore', logFd, logFd],
      env: { ...process.env },
      windowsHide: true,
    });
    child.unref();

    persistDaemonPath();
    p.log.success(`Daemon started in background (PID ${child.pid})`);
    p.log.info(`Log file: ${LOG_FILE}`);
    p.outro();
    displayPostCommandNotifications();
  } else {
    p.log.info('Starting daemon in foreground...');
    p.outro();

    const child = spawn('node', [daemonPath], {
      stdio: 'inherit',
      env: { ...process.env },
    });
    child.on('exit', (code) => {
      process.exit(code ?? 0);
    });
  }
}

async function stopDaemon(): Promise<void> {
  p.intro(`claude-presence v${VERSION}`);

  const pid = getDaemonPid();
  if (!pid) {
    p.log.info('Daemon is not running.');
    p.outro();
    return;
  }

  try {
    process.kill(pid, 'SIGTERM');
    p.log.success(`Daemon stopped (PID ${pid})`);
  } catch {
    p.log.info('Daemon process not found, cleaning up PID file.');
  }

  try {
    unlinkSync(PID_FILE);
  } catch {
    // ignore
  }

  p.outro();
  displayPostCommandNotifications();
}

async function showStatus(): Promise<void> {
  p.intro(`claude-presence v${VERSION}`);

  const pid = getDaemonPid();
  const health = await checkHealth();

  if (!pid && !health) {
    p.log.info('Daemon is not running.');
    p.outro();
    return;
  }

  const config = loadConfig();
  const presetLabel = isValidPreset(config.preset) ? PRESETS[config.preset].label : config.preset;

  const lines: string[] = [];
  lines.push(`PID        ${pid ?? 'unknown'}`);

  if (health) {
    lines.push(`Version    v${health.version}`);
    lines.push(`Discord    ${connectionBadge(health.connected)}`);
    lines.push(`Sessions   ${health.sessions} active`);
    lines.push(`Preset     ${presetLabel}`);
    lines.push(`Uptime     ${formatDuration(health.uptime * 1000)}`);
  } else {
    lines.push(`Preset     ${presetLabel}`);
    lines.push(`Health     Could not reach daemon`);
  }

  p.note(lines.join('\n'), 'Daemon Status');

  // Show active sessions
  try {
    const res = await fetch(`http://127.0.0.1:${config.daemonPort}/sessions`);
    if (res.ok) {
      const sessions = (await res.json()) as Array<{
        sessionId: string;
        projectName: string;
        details: string;
        status: string;
        startedAt: string;
      }>;
      if (sessions.length > 0) {
        for (const s of sessions) {
          const elapsed = s.startedAt
            ? formatDuration(Date.now() - new Date(s.startedAt).getTime())
            : '';
          const badge = statusBadge(s.status);
          p.log.step(
            `${s.projectName}\n  ${s.details} — ${badge}${elapsed ? ` — ${elapsed}` : ''}`,
          );
        }
      }
    }
  } catch {
    // ignore
  }

  p.outro();
  displayPostCommandNotifications();
}

async function setup(): Promise<void> {
  p.intro('claude-presence');

  // --- Prerequisites ---
  const nodeVersion = process.versions.node;
  const nodeMajor = parseInt(nodeVersion.split('.')[0], 10);
  if (nodeMajor < 18) {
    p.log.error(`Node.js >= 18 required (found ${nodeVersion})`);
    p.outro();
    process.exit(1);
  }

  p.log.success(`Node.js ${nodeVersion}`);

  // jq is only needed on Unix (bash hook uses it); Windows hook is pure Node.js
  if (process.platform !== 'win32') {
    let jqVersion = '';
    try {
      jqVersion = execSync('jq --version', { stdio: 'pipe' }).toString().trim();
    } catch {
      p.log.error('jq is required but not found.');
      p.log.info('  macOS: brew install jq');
      p.log.info('  Ubuntu: sudo apt install jq');
      p.outro();
      process.exit(1);
    }
    p.log.success(`jq ${jqVersion}`);
  }

  // --- Configuration ---
  const existingConfig = existsSync(CONFIG_FILE);

  // Preset selection first
  let existingPreset: PresetName = DEFAULT_PRESET;
  if (existingConfig) {
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
  if (existingConfig) {
    try {
      const current = JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
      if (current.discordClientId) {
        resolvedClientId = current.discordClientId;
      }
    } catch {
      // ignore
    }
  }

  p.log.step(
    "The default works out of the box \u2014 only change this if you've created your own Discord app",
  );

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

  mkdirSync(CONFIG_DIR, { recursive: true });
  const config: Record<string, unknown> = {
    discordClientId: resolvedClientId,
    daemonPort: DEFAULT_PORT,
    preset: presetChoice,
    daemonPath: resolve(__dirname, 'daemon', 'index.js'),
  };
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
  p.log.success(`Config written to ${CONFIG_FILE}`);

  // --- Installation ---

  // On Windows, use the Node.js hook (CLI subcommand); on Unix, use the bash script.
  const hookCommand = process.platform === 'win32' ? 'claude-presence hook' : copyHookScript();

  const claudeSettingsPath = join(homedir(), '.claude', 'settings.json');

  const hookConfig = createHookConfig(hookCommand);

  try {
    let existingSettings: Record<string, unknown> = {};
    if (existsSync(claudeSettingsPath)) {
      existingSettings = JSON.parse(readFileSync(claudeSettingsPath, 'utf-8'));
    }

    const existingHooks = (existingSettings.hooks ?? {}) as Record<string, unknown[]>;
    const newHooks = hookConfig.hooks as Record<string, unknown[]>;

    // Remove any old hook entries (from previous installs/npx paths)
    for (const event of Object.keys(existingHooks)) {
      existingHooks[event] = existingHooks[event].filter((entry: unknown) => {
        const str = JSON.stringify(entry);
        return (
          !str.includes('claude-hook.sh') &&
          !str.includes('claude-discord-status hook') &&
          !str.includes('claude-presence hook')
        );
      });
      if (existingHooks[event].length === 0) {
        delete existingHooks[event];
      }
    }

    // Add fresh entries pointing to the stable copy
    let hooksAdded = 0;
    for (const [event, entries] of Object.entries(newHooks)) {
      if (!existingHooks[event]) {
        existingHooks[event] = [];
      }
      for (const entry of entries) {
        existingHooks[event].push(entry);
        hooksAdded++;
      }
    }

    existingSettings.hooks = existingHooks;
    mkdirSync(dirname(claudeSettingsPath), { recursive: true });
    writeFileSync(claudeSettingsPath, JSON.stringify(existingSettings, null, 2), 'utf-8');

    p.log.success(`Hooks configured (${hooksAdded} lifecycle events)`);
  } catch (err) {
    p.log.warn(`Could not configure hooks: ${(err as Error).message}`);
    p.log.info(`  Manually add hooks to ${claudeSettingsPath}`);
  }

  // Start daemon
  const existingPid = getDaemonPid();
  if (existingPid) {
    p.log.success(`Daemon already running (PID ${existingPid})`);
  } else {
    const daemonPath = resolve(__dirname, 'daemon', 'index.js');
    mkdirSync(CONFIG_DIR, { recursive: true });

    const { openSync } = await import('node:fs');
    const logFd = openSync(LOG_FILE, 'a');
    const child = spawn('node', [daemonPath], {
      detached: true,
      stdio: ['ignore', logFd, logFd],
      env: { ...process.env },
      windowsHide: true,
    });
    child.unref();
    p.log.success(`Daemon started (PID ${child.pid})`);
  }

  // --- Verification ---
  const s = p.spinner();
  s.start('Verifying Discord connection...');
  await new Promise((resolve) => setTimeout(resolve, 2000));
  const health = await checkHealth();

  if (health) {
    if (health.connected) {
      s.stop('Discord connected');
    } else {
      s.stop('Discord is connecting (open Discord if not running)');
    }
  } else {
    s.stop('Could not reach daemon — check logs');
    const viewCmd = process.platform === 'win32' ? `type "${LOG_FILE}"` : `cat ${LOG_FILE}`;
    p.log.info(`  ${viewCmd}`);
  }

  p.note(
    'Open Discord and check your profile — you\nshould see "Using Claude Code" as activity.',
    'Next steps',
  );

  p.outro('Setup complete!');
}

export function createHookConfig(hookCommand: string) {
  const syncHook = {
    matcher: '',
    hooks: [
      {
        type: 'command',
        command: hookCommand,
        timeout: 5,
      },
    ],
  };

  const asyncHook = (matcher?: string) => ({
    ...(matcher ? { matcher } : {}),
    hooks: [
      {
        type: 'command',
        command: hookCommand,
        timeout: 5,
        async: true,
      },
    ],
  });

  return {
    hooks: {
      SessionStart: [syncHook],
      UserPromptSubmit: [asyncHook()],
      PreToolUse: [asyncHook('Write|Edit|Bash|Read|Grep|Glob|WebSearch|WebFetch|Task')],
      Stop: [asyncHook()],
      Notification: [asyncHook()],
      SessionEnd: [asyncHook()],
    },
  };
}

async function uninstall(): Promise<void> {
  p.intro('claude-presence');

  const shouldContinue = await p.confirm({
    message: 'This will remove all hooks and config. Continue?',
    initialValue: false,
  });

  if (p.isCancel(shouldContinue) || !shouldContinue) {
    p.cancel('Uninstall cancelled.');
    process.exit(0);
  }

  // Stop daemon
  const pid = getDaemonPid();
  if (pid) {
    try {
      process.kill(pid, 'SIGTERM');
      p.log.success(`Daemon stopped (PID ${pid})`);
    } catch {
      p.log.info('Daemon process not found, cleaning up PID file.');
    }
    try {
      unlinkSync(PID_FILE);
    } catch {
      // ignore
    }
  } else {
    p.log.info('Daemon was not running');
  }

  // Remove hooks from settings
  const claudeSettingsPath = join(homedir(), '.claude', 'settings.json');

  try {
    if (existsSync(claudeSettingsPath)) {
      const settings = JSON.parse(readFileSync(claudeSettingsPath, 'utf-8'));
      if (settings.hooks) {
        for (const event of Object.keys(settings.hooks)) {
          settings.hooks[event] = (settings.hooks[event] as unknown[]).filter((entry: unknown) => {
            const str = JSON.stringify(entry);
            return (
              !str.includes('claude-hook.sh') &&
              !str.includes('claude-discord-status hook') &&
              !str.includes('claude-presence hook')
            );
          });
          if (settings.hooks[event].length === 0) {
            delete settings.hooks[event];
          }
        }
        if (Object.keys(settings.hooks).length === 0) {
          delete settings.hooks;
        }
        writeFileSync(claudeSettingsPath, JSON.stringify(settings, null, 2), 'utf-8');
        p.log.success('Hooks removed');
      }
    }
  } catch {
    p.log.warn('Could not clean up hooks');
  }

  // Remove config — both new and legacy dirs
  try {
    const { rmSync } = await import('node:fs');
    let removed = false;
    if (existsSync(CONFIG_DIR)) {
      rmSync(CONFIG_DIR, { recursive: true, force: true });
      removed = true;
    }
    if (existsSync(LEGACY_CONFIG_DIR)) {
      rmSync(LEGACY_CONFIG_DIR, { recursive: true, force: true });
      removed = true;
    }
    p.log.success(removed ? 'Config removed' : 'Config already removed');
  } catch {
    p.log.warn('Could not remove config directory');
  }

  p.outro('Uninstall complete.');
}

async function changePreset(presetArg?: string): Promise<void> {
  p.intro(`claude-presence v${VERSION}`);

  let selectedPreset: PresetName;

  if (presetArg && isValidPreset(presetArg)) {
    selectedPreset = presetArg;
  } else {
    if (presetArg) {
      p.log.warn(`Unknown preset "${presetArg}". Available: ${PRESET_NAMES.join(', ')}`);
    }

    // Read current preset from config
    let currentPreset: PresetName = DEFAULT_PRESET;
    try {
      if (existsSync(CONFIG_FILE)) {
        const current = JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
        if (current.preset && isValidPreset(current.preset)) {
          currentPreset = current.preset;
        }
      }
    } catch {
      // ignore
    }

    const choice = await p.select({
      message: 'Choose a message style',
      options: PRESET_NAMES.map((name) => ({
        value: name,
        label: PRESETS[name].label,
        hint: PRESETS[name].description,
      })),
      initialValue: currentPreset,
    });

    if (p.isCancel(choice)) {
      p.cancel('Cancelled.');
      process.exit(0);
    }

    selectedPreset = choice;
  }

  // Update config file
  let existingConfig: Record<string, unknown> = {};
  try {
    if (existsSync(CONFIG_FILE)) {
      existingConfig = JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
    }
  } catch {
    // ignore
  }

  existingConfig.preset = selectedPreset;
  existingConfig.daemonPath = resolve(__dirname, 'daemon', 'index.js');
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(existingConfig, null, 2), 'utf-8');
  p.log.success(`Message style set to ${PRESETS[selectedPreset].label}`);

  // Restart daemon if running
  const pid = getDaemonPid();
  if (pid) {
    try {
      process.kill(pid, 'SIGTERM');
      await waitForProcessExit(pid);
    } catch {
      // ignore
    }

    const daemonPath = resolve(__dirname, 'daemon', 'index.js');
    if (existsSync(daemonPath)) {
      mkdirSync(CONFIG_DIR, { recursive: true });
      const { openSync } = await import('node:fs');
      const logFd = openSync(LOG_FILE, 'a');
      const child = spawn('node', [daemonPath], {
        detached: true,
        stdio: ['ignore', logFd, logFd],
        env: { ...process.env },
        windowsHide: true,
      });
      child.unref();
      p.log.success(`Daemon restarted (PID ${child.pid})`);
    }
  }

  p.outro();
}

async function doctor(): Promise<void> {
  p.intro(`claude-presence v${VERSION}`);

  const config = loadConfig();
  const autoFix = args.includes('--fix');

  const s = p.spinner();
  s.start('Checking health...');
  const results = await runAllChecks(config.daemonPort);
  s.stop('Health check complete');

  for (const r of results) {
    if (r.status === 'pass') {
      p.log.success(r.message);
    } else if (r.status === 'warn') {
      p.log.warn(`${r.label} \u2014 ${r.message}`);
    } else {
      p.log.error(`${r.label} \u2014 ${r.message}`);
    }
  }

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

    // Try to start daemon if still not reachable
    try {
      const res = await fetch(`http://127.0.0.1:${config.daemonPort}/health`);
      if (!res.ok) throw new Error();
    } catch {
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

function showHelp(): void {
  p.intro(`claude-presence v${VERSION}`);

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

  p.outro('Discord Rich Presence for Claude Code');
  displayPostCommandNotifications();
}

// Run migration before any command
const migrated = migrateFromLegacy();
if (migrated) {
  p.log.info('Migrated config from ~/.claude-discord-status/ to ~/.claude-presence/');
}

// Main
switch (command) {
  case 'start':
    await startDaemon(args.includes('-d') || args.includes('--daemon'));
    break;
  case 'stop':
    await stopDaemon();
    break;
  case 'status':
    await showStatus();
    break;
  case 'setup':
    await setup();
    break;
  case 'preset':
    await changePreset(args[1]);
    break;
  case 'doctor':
    await doctor();
    break;
  case 'uninstall':
    await uninstall();
    break;
  case 'update':
    await update();
    break;
  case 'hook': {
    const { handleHook } = await import('./hook.js');
    await handleHook();
    break;
  }
  case '--version':
  case '-v':
    console.log(VERSION);
    break;
  default:
    showHelp();
    break;
}
