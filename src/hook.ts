// Node.js hook for Windows (and fallback for any platform).
// Replicates the logic of claude-hook.sh without any Unix dependencies.
// Reads Claude Code lifecycle events from stdin and forwards them to the daemon.
// Always exits 0 to never block Claude Code.

import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync, statSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CONFIG_DIR,
  CONFIG_FILE,
  LOG_FILE,
  DEFAULT_PORT,
  AUTOSTART_LOCK_FILE,
  AUTOSTART_COOLDOWN,
} from './shared/constants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface HookInput {
  session_id?: string;
  hook_event_name?: string;
  tool_name?: string;
  cwd?: string;
  matcher?: string;
}

const TOOL_MAP: Record<string, { details: string; icon: string; iconText: string }> = {
  Write: { details: 'Editing a file', icon: 'coding', iconText: 'Writing code' },
  Edit: { details: 'Editing a file', icon: 'coding', iconText: 'Writing code' },
  Bash: { details: 'Running a command', icon: 'terminal', iconText: 'Running a command' },
  Read: { details: 'Reading a file', icon: 'reading', iconText: 'Reading files' },
  Grep: { details: 'Searching codebase', icon: 'searching', iconText: 'Searching' },
  Glob: { details: 'Searching codebase', icon: 'searching', iconText: 'Searching' },
  WebSearch: { details: 'Searching the web', icon: 'searching', iconText: 'Searching' },
  WebFetch: { details: 'Searching the web', icon: 'searching', iconText: 'Searching' },
  Task: { details: 'Running a subtask', icon: 'thinking', iconText: 'Thinking...' },
};

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    process.stdin.on('data', (chunk) => chunks.push(chunk));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    process.stdin.on('error', () => resolve(''));
  });
}

function getDaemonUrl(): string {
  const port =
    process.env.CLAUDE_PRESENCE_PORT ?? process.env.CLAUDE_DISCORD_PORT ?? String(DEFAULT_PORT);
  return (
    process.env.CLAUDE_PRESENCE_URL ?? process.env.CLAUDE_DISCORD_URL ?? `http://127.0.0.1:${port}`
  );
}

async function postJson(url: string, data: unknown): Promise<void> {
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(1000),
    });
  } catch {
    // Never fail — daemon may be unreachable
  }
}

function resolveDaemonPath(): string | null {
  // Strategy 1: Read from config file
  if (existsSync(CONFIG_FILE)) {
    try {
      const config = JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
      if (config.daemonPath && existsSync(config.daemonPath)) {
        return config.daemonPath;
      }
    } catch {
      // ignore
    }
  }

  // Strategy 2: Derive from this script's location
  const candidate = resolve(__dirname, 'daemon', 'index.js');
  if (existsSync(candidate)) {
    return candidate;
  }

  return null;
}

function acquireLock(): boolean {
  // Check existing lock with cooldown
  if (existsSync(AUTOSTART_LOCK_FILE)) {
    try {
      const mtime = statSync(AUTOSTART_LOCK_FILE).mtimeMs;
      if (Date.now() - mtime < AUTOSTART_COOLDOWN) {
        return false;
      }
      unlinkSync(AUTOSTART_LOCK_FILE);
    } catch {
      return false;
    }
  }

  // Acquire lock atomically
  try {
    writeFileSync(AUTOSTART_LOCK_FILE, String(Date.now()), { flag: 'wx' });
    return true;
  } catch {
    return false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureDaemon(daemonUrl: string): Promise<boolean> {
  // Quick health check
  try {
    const res = await fetch(`${daemonUrl}/health`, {
      signal: AbortSignal.timeout(500),
    });
    if (res.ok) return true;
  } catch {
    // Not running
  }

  // Check cooldown lock
  if (!acquireLock()) return false;

  const daemonPath = resolveDaemonPath();
  if (!daemonPath) return false;

  // Ensure config dir exists
  mkdirSync(CONFIG_DIR, { recursive: true });

  // Spawn daemon in background
  try {
    const { openSync } = await import('node:fs');
    const logFd = openSync(LOG_FILE, 'a');
    const child = spawn('node', [daemonPath], {
      detached: true,
      stdio: ['ignore', logFd, logFd],
      env: { ...process.env },
      windowsHide: true,
    });
    child.unref();
  } catch {
    return false;
  }

  // Poll for readiness
  for (let i = 0; i < 8; i++) {
    await sleep(200);
    try {
      const res = await fetch(`${daemonUrl}/health`, {
        signal: AbortSignal.timeout(500),
      });
      if (res.ok) return true;
    } catch {
      // keep polling
    }
  }

  return false;
}

/**
 * Process a hook event from its raw JSON string.
 * Exported separately from handleHook() for testability.
 */
export async function processHookEvent(raw: string): Promise<void> {
  if (!raw.trim()) return;

  let input: HookInput;
  try {
    input = JSON.parse(raw) as HookInput;
  } catch {
    return;
  }

  const sessionId = input.session_id;
  const hookEvent = input.hook_event_name;
  if (!sessionId || !hookEvent) return;

  const daemonUrl = getDaemonUrl();

  // Ensure daemon is running (auto-start if needed)
  await ensureDaemon(daemonUrl);

  const cwd = input.cwd ?? '';
  // process.ppid gives the PID of the shell that spawned this hook process.
  // On both Unix and Windows, Claude Code spawns hooks via a shell, so ppid
  // points back to the Claude Code process (or its immediate shell wrapper).
  const pid = process.ppid;

  switch (hookEvent) {
    case 'SessionStart': {
      const details = input.matcher === 'resume' ? 'Resuming session...' : 'Starting session...';
      await postJson(`${daemonUrl}/sessions/${sessionId}/start`, {
        pid,
        projectPath: cwd,
      });
      await postJson(`${daemonUrl}/sessions/${sessionId}/activity`, {
        details,
        smallImageKey: 'starting',
        smallImageText: 'Starting up',
        priority: 'hook',
      });
      break;
    }

    case 'SessionEnd':
      await postJson(`${daemonUrl}/sessions/${sessionId}/end`, {});
      break;

    case 'UserPromptSubmit':
      await postJson(`${daemonUrl}/sessions/${sessionId}/activity`, {
        details: 'Thinking...',
        smallImageKey: 'thinking',
        smallImageText: 'Thinking...',
        priority: 'hook',
      });
      break;

    case 'PreToolUse': {
      const toolName = input.tool_name ?? '';
      const tool = TOOL_MAP[toolName] ?? {
        details: 'Working...',
        icon: 'coding',
        iconText: 'Working',
      };
      const details = tool.details.slice(0, 128);
      await postJson(`${daemonUrl}/sessions/${sessionId}/activity`, {
        details,
        smallImageKey: tool.icon,
        smallImageText: tool.iconText,
        priority: 'hook',
      });
      break;
    }

    case 'Stop':
      await postJson(`${daemonUrl}/sessions/${sessionId}/activity`, {
        details: 'Finished',
        smallImageKey: 'idle',
        smallImageText: 'Idle',
        priority: 'hook',
      });
      break;

    case 'Notification':
      await postJson(`${daemonUrl}/sessions/${sessionId}/activity`, {
        details: 'Waiting for input',
        smallImageKey: 'idle',
        smallImageText: 'Idle',
        priority: 'hook',
      });
      break;

    default:
      // Unknown event, ignore
      break;
  }
}

export async function handleHook(): Promise<void> {
  try {
    const raw = await readStdin();
    await processHookEvent(raw);
  } catch {
    // Never block Claude Code
  }

  process.exit(0);
}
