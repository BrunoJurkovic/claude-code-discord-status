import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'node:fs';
import { spawn, execSync } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as p from '@clack/prompts';
import {
  CONFIG_DIR,
  CONFIG_FILE,
  PID_FILE,
  LOG_FILE,
  DEFAULT_PORT,
  DEFAULT_DISCORD_CLIENT_ID,
} from './shared/constants.js';
import { loadConfig } from './shared/config.js';
import { formatDuration, statusBadge, connectionBadge } from './cli-utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const args = process.argv.slice(2);
const command = args[0];

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

async function checkHealth(): Promise<{
  connected: boolean;
  sessions: number;
  uptime: number;
} | null> {
  const config = loadConfig();
  try {
    const res = await fetch(`http://127.0.0.1:${config.daemonPort}/health`);
    if (res.ok) {
      return (await res.json()) as { connected: boolean; sessions: number; uptime: number };
    }
  } catch {
    // Not running
  }
  return null;
}

async function startDaemon(background: boolean): Promise<void> {
  p.intro('claude-discord-status');

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
    });
    child.unref();

    p.log.success(`Daemon started in background (PID ${child.pid})`);
    p.log.info(`Log file: ${LOG_FILE}`);
    p.outro();
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
  p.intro('claude-discord-status');

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
}

async function showStatus(): Promise<void> {
  p.intro('claude-discord-status');

  const pid = getDaemonPid();
  const health = await checkHealth();

  if (!pid && !health) {
    p.log.info('Daemon is not running.');
    p.outro();
    return;
  }

  const lines: string[] = [];
  lines.push(`PID        ${pid ?? 'unknown'}`);

  if (health) {
    lines.push(`Discord    ${connectionBadge(health.connected)}`);
    lines.push(`Sessions   ${health.sessions} active`);
    lines.push(`Uptime     ${formatDuration(health.uptime * 1000)}`);
  } else {
    lines.push(`Health     Could not reach daemon`);
  }

  p.note(lines.join('\n'), 'Daemon Status');

  // Show active sessions
  const config = loadConfig();
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
}

async function setup(): Promise<void> {
  p.intro('claude-discord-status');

  // --- Prerequisites ---
  const nodeVersion = process.versions.node;
  const nodeMajor = parseInt(nodeVersion.split('.')[0], 10);
  if (nodeMajor < 18) {
    p.log.error(`Node.js >= 18 required (found ${nodeVersion})`);
    p.outro();
    process.exit(1);
  }

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

  p.log.success(`Node.js ${nodeVersion}`);
  p.log.success(`jq ${jqVersion}`);

  // --- Configuration ---
  let resolvedClientId = DEFAULT_DISCORD_CLIENT_ID;
  const existingConfig = existsSync(CONFIG_FILE);

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

  const useCustomApp = await p.confirm({
    message: 'Use a custom Discord app? (default shows as "Claude Code")',
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
    p.log.info('Using default Client ID');
  } else {
    p.log.info(`Using custom Client ID: ${resolvedClientId}`);
  }

  mkdirSync(CONFIG_DIR, { recursive: true });
  const config = {
    discordClientId: resolvedClientId,
    daemonPort: DEFAULT_PORT,
  };
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
  p.log.success(`Config written to ${CONFIG_FILE}`);

  // --- Installation ---

  // Check if claude CLI exists
  let hasClaude = false;
  try {
    execSync('which claude', { stdio: 'pipe' });
    hasClaude = true;
  } catch {
    // claude CLI not found
  }

  const mcpPath = resolve(__dirname, 'mcp', 'index.js');

  if (hasClaude) {
    try {
      execSync(`claude mcp add --transport stdio --scope user discord-status -- node ${mcpPath}`, {
        stdio: 'pipe',
      });
      p.log.success('MCP server registered');
    } catch {
      p.log.warn('Could not register MCP server automatically.');
      p.log.info(
        `  Run: claude mcp add --transport stdio --scope user discord-status -- node ${mcpPath}`,
      );
    }
  } else {
    p.log.warn('claude CLI not found — skipping MCP registration.');
    p.log.info(
      `  Run: claude mcp add --transport stdio --scope user discord-status -- node ${mcpPath}`,
    );
  }

  // Merge hooks into ~/.claude/settings.json
  const hookScriptPath = resolve(__dirname, '..', 'src', 'hooks', 'claude-hook.sh');
  const hookCommand = existsSync(hookScriptPath) ? hookScriptPath : 'claude-hook.sh';

  const claudeSettingsPath = join(
    process.env.HOME ?? process.env.USERPROFILE ?? '~',
    '.claude',
    'settings.json',
  );

  const hookConfig = createHookConfig(hookCommand);

  try {
    let existingSettings: Record<string, unknown> = {};
    if (existsSync(claudeSettingsPath)) {
      existingSettings = JSON.parse(readFileSync(claudeSettingsPath, 'utf-8'));
    }

    const existingHooks = (existingSettings.hooks ?? {}) as Record<string, unknown[]>;
    const newHooks = hookConfig.hooks as Record<string, unknown[]>;
    let hooksAdded = 0;
    let hooksSkipped = 0;

    for (const [event, entries] of Object.entries(newHooks)) {
      if (!existingHooks[event]) {
        existingHooks[event] = [];
      }
      for (const entry of entries) {
        const entryStr = JSON.stringify(entry);
        const alreadyExists = existingHooks[event].some((e) => JSON.stringify(e) === entryStr);
        if (!alreadyExists) {
          existingHooks[event].push(entry);
          hooksAdded++;
        } else {
          hooksSkipped++;
        }
      }
    }

    existingSettings.hooks = existingHooks;
    mkdirSync(dirname(claudeSettingsPath), { recursive: true });
    writeFileSync(claudeSettingsPath, JSON.stringify(existingSettings, null, 2), 'utf-8');

    if (hooksAdded > 0 && hooksSkipped > 0) {
      p.log.success(`Hooks configured (${hooksAdded} added, ${hooksSkipped} already present)`);
    } else if (hooksAdded > 0) {
      p.log.success(`Hooks configured (${hooksAdded} lifecycle events)`);
    } else {
      p.log.success('Hooks already configured (no changes)');
    }
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
    p.log.info(`  cat ${LOG_FILE}`);
  }

  p.note(
    'Open Discord and check your profile — you\nshould see "Using Claude Code" as activity.',
    'Next steps',
  );

  p.outro('Setup complete!');
}

function createHookConfig(hookCommand: string) {
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
  p.intro('claude-discord-status');

  const shouldContinue = await p.confirm({
    message: 'This will remove all hooks, MCP registration, and config. Continue?',
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

  // Remove MCP server
  try {
    execSync('claude mcp remove discord-status', { stdio: 'pipe' });
    p.log.success('MCP server removed');
  } catch {
    p.log.warn('Could not remove MCP server (may not have been registered)');
  }

  // Remove hooks from settings
  const claudeSettingsPath = join(
    process.env.HOME ?? process.env.USERPROFILE ?? '~',
    '.claude',
    'settings.json',
  );

  try {
    if (existsSync(claudeSettingsPath)) {
      const settings = JSON.parse(readFileSync(claudeSettingsPath, 'utf-8'));
      if (settings.hooks) {
        for (const event of Object.keys(settings.hooks)) {
          settings.hooks[event] = (settings.hooks[event] as unknown[]).filter((entry: unknown) => {
            const str = JSON.stringify(entry);
            return !str.includes('claude-hook.sh');
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

  // Remove config
  try {
    const { rmSync } = await import('node:fs');
    rmSync(CONFIG_DIR, { recursive: true, force: true });
    p.log.success('Config removed');
  } catch {
    p.log.warn('Could not remove config directory');
  }

  p.outro('Uninstall complete.');
}

function showHelp(): void {
  p.intro('claude-discord-status');

  p.note(
    [
      'setup        Interactive setup',
      'start [-d]   Start the daemon (-d for background)',
      'stop         Stop the daemon',
      'status       Show daemon status and sessions',
      'uninstall    Remove all hooks, MCP, and config',
    ].join('\n'),
    'Commands',
  );

  p.outro('Discord Rich Presence for Claude Code');
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
  case 'uninstall':
    await uninstall();
    break;
  default:
    showHelp();
    break;
}
