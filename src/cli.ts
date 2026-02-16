import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { spawn, execSync } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CONFIG_DIR,
  CONFIG_FILE,
  PID_FILE,
  LOG_FILE,
  DEFAULT_PORT,
  DEFAULT_DISCORD_CLIENT_ID,
} from './shared/constants.js';
import { loadConfig } from './shared/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const args = process.argv.slice(2);
const command = args[0];

function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function getDaemonPid(): number | null {
  try {
    if (existsSync(PID_FILE)) {
      const pid = parseInt(readFileSync(PID_FILE, 'utf-8').trim(), 10);
      process.kill(pid, 0); // Check if alive
      return pid;
    }
  } catch {
    // PID file exists but process is dead
    try {
      unlinkSync(PID_FILE);
    } catch {
      // ignore
    }
  }
  return null;
}

async function checkHealth(): Promise<{ connected: boolean; sessions: number; uptime: number } | null> {
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
  const existing = getDaemonPid();
  if (existing) {
    console.log(`Daemon is already running (PID ${existing})`);
    return;
  }

  const daemonPath = resolve(__dirname, 'daemon', 'index.js');

  if (!existsSync(daemonPath)) {
    console.error(`Daemon entry point not found at ${daemonPath}`);
    console.error('Run `npm run build` first.');
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

    console.log(`Daemon started in background (PID ${child.pid})`);
    console.log(`Log file: ${LOG_FILE}`);
  } else {
    console.log('Starting daemon in foreground...');

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
  const pid = getDaemonPid();
  if (!pid) {
    console.log('Daemon is not running.');
    return;
  }

  try {
    process.kill(pid, 'SIGTERM');
    console.log(`Daemon stopped (PID ${pid})`);
  } catch {
    console.log('Daemon process not found, cleaning up PID file.');
  }

  try {
    unlinkSync(PID_FILE);
  } catch {
    // ignore
  }
}

async function showStatus(): Promise<void> {
  const pid = getDaemonPid();
  const health = await checkHealth();

  if (!pid && !health) {
    console.log('Daemon is not running.');
    return;
  }

  console.log(`Daemon PID: ${pid ?? 'unknown'}`);

  if (health) {
    console.log(`Discord connected: ${health.connected}`);
    console.log(`Active sessions: ${health.sessions}`);
    console.log(`Uptime: ${health.uptime}s`);
  } else {
    console.log('Could not reach daemon health endpoint.');
  }

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
      }>;
      if (sessions.length > 0) {
        console.log('\nActive sessions:');
        for (const s of sessions) {
          console.log(`  ${s.projectName} — ${s.details} [${s.status}]`);
        }
      }
    }
  } catch {
    // ignore
  }
}

async function setup(): Promise<void> {
  console.log('Claude Code Discord Status — Setup\n');

  // Check Node version
  const nodeVersion = parseInt(process.versions.node.split('.')[0], 10);
  if (nodeVersion < 18) {
    console.error(`Node.js >= 18 required (found ${process.versions.node})`);
    process.exit(1);
  }
  console.log(`✓ Node.js ${process.versions.node}`);

  // Check jq
  try {
    execSync('jq --version', { stdio: 'pipe' });
    console.log('✓ jq found');
  } catch {
    console.error('✗ jq is required but not found. Install it:');
    console.error('  macOS: brew install jq');
    console.error('  Ubuntu: sudo apt install jq');
    process.exit(1);
  }

  // Prompt for Discord Client ID
  const clientId = await prompt(
    `Discord Client ID (press Enter for default): `,
  );
  const resolvedClientId = clientId || DEFAULT_DISCORD_CLIENT_ID;

  // Write config
  mkdirSync(CONFIG_DIR, { recursive: true });
  const config = {
    discordClientId: resolvedClientId,
    daemonPort: DEFAULT_PORT,
  };
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
  console.log(`✓ Config written to ${CONFIG_FILE}`);

  // Register MCP server
  const mcpPath = resolve(__dirname, 'mcp', 'index.js');
  try {
    execSync(`claude mcp add --transport stdio --scope user discord-status -- node ${mcpPath}`, {
      stdio: 'pipe',
    });
    console.log('✓ MCP server registered');
  } catch {
    console.log('⚠ Could not register MCP server automatically.');
    console.log(`  Run: claude mcp add --transport stdio --scope user discord-status -- node ${mcpPath}`);
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

    for (const [event, entries] of Object.entries(newHooks)) {
      if (!existingHooks[event]) {
        existingHooks[event] = [];
      }
      // Only add if not already present (check by command)
      for (const entry of entries) {
        const entryStr = JSON.stringify(entry);
        const alreadyExists = existingHooks[event].some((e) => JSON.stringify(e) === entryStr);
        if (!alreadyExists) {
          existingHooks[event].push(entry);
        }
      }
    }

    existingSettings.hooks = existingHooks;
    mkdirSync(dirname(claudeSettingsPath), { recursive: true });
    writeFileSync(claudeSettingsPath, JSON.stringify(existingSettings, null, 2), 'utf-8');
    console.log('✓ Hooks configured');
  } catch (err) {
    console.log(`⚠ Could not configure hooks: ${(err as Error).message}`);
    console.log(`  Manually add hooks to ${claudeSettingsPath}`);
  }

  // Start daemon
  await startDaemon(true);

  // Wait a moment and verify
  await new Promise((resolve) => setTimeout(resolve, 2000));
  const health = await checkHealth();
  if (health) {
    console.log(`\n✓ Daemon is running (Discord ${health.connected ? 'connected' : 'connecting...'})`);
  } else {
    console.log('\n⚠ Daemon may not have started. Check logs:');
    console.log(`  cat ${LOG_FILE}`);
  }

  console.log('\nSetup complete! Your Discord status will update when using Claude Code.');
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
  console.log('Uninstalling Claude Code Discord Status...\n');

  // Stop daemon
  await stopDaemon();

  // Remove MCP server
  try {
    execSync('claude mcp remove discord-status', { stdio: 'pipe' });
    console.log('✓ MCP server removed');
  } catch {
    console.log('⚠ Could not remove MCP server (may not have been registered)');
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
        console.log('✓ Hooks removed');
      }
    }
  } catch {
    console.log('⚠ Could not clean up hooks');
  }

  // Remove config
  try {
    const { rmSync } = await import('node:fs');
    rmSync(CONFIG_DIR, { recursive: true, force: true });
    console.log('✓ Config removed');
  } catch {
    console.log('⚠ Could not remove config directory');
  }

  console.log('\nUninstall complete.');
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
    console.log(`claude-discord-status — Discord Rich Presence for Claude Code

Usage:
  claude-discord-status setup        Interactive setup
  claude-discord-status start [-d]   Start the daemon (-d for background)
  claude-discord-status stop         Stop the daemon
  claude-discord-status status       Show daemon status and sessions
  claude-discord-status uninstall    Remove all hooks, MCP, and config`);
    break;
}
