import { spawn } from 'node:child_process';
import { existsSync, openSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { DEFAULT_PORT, CONFIG_DIR, LOG_FILE } from '../shared/constants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DAEMON_PORT = process.env.CLAUDE_DISCORD_PORT
  ? parseInt(process.env.CLAUDE_DISCORD_PORT, 10)
  : DEFAULT_PORT;
const DAEMON_URL = `http://127.0.0.1:${DAEMON_PORT}`;

let cachedSessionId: string | null = null;

async function isDaemonRunning(): Promise<boolean> {
  try {
    const res = await fetch(`${DAEMON_URL}/health`, {
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function ensureDaemon(): Promise<void> {
  if (await isDaemonRunning()) return;

  const daemonPath = resolve(__dirname, '..', 'daemon', 'index.js');
  if (!existsSync(daemonPath)) return;

  mkdirSync(CONFIG_DIR, { recursive: true });
  const logFd = openSync(LOG_FILE, 'a');
  const child = spawn('node', [daemonPath], {
    detached: true,
    stdio: ['ignore', logFd, logFd],
    env: { ...process.env },
  });
  child.unref();

  // Wait briefly for the daemon to be ready
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 300));
    if (await isDaemonRunning()) return;
  }
}

async function findOrCreateSession(): Promise<string> {
  if (cachedSessionId) return cachedSessionId;

  const cwd = process.cwd();

  try {
    // Try to find a matching session by projectPath
    const res = await fetch(`${DAEMON_URL}/sessions`);
    if (res.ok) {
      const sessions = (await res.json()) as Array<{ sessionId: string; projectPath: string }>;
      const match = sessions.find((s) => s.projectPath === cwd);
      if (match) {
        cachedSessionId = match.sessionId;
        return cachedSessionId;
      }
    }
  } catch {
    // Daemon may not be running
  }

  // No match found — register a new session
  const sessionId = crypto.randomUUID();
  try {
    await fetch(`${DAEMON_URL}/sessions/${sessionId}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pid: process.ppid,
        projectPath: cwd,
      }),
    });
  } catch {
    // Daemon may not be running
  }

  cachedSessionId = sessionId;
  return cachedSessionId;
}

const server = new McpServer({
  name: 'discord-status',
  version: '0.1.0',
});

server.tool(
  'set_discord_status',
  `Update your Discord Rich Presence status to let the user's friends know what you're working on. Call this when you start a meaningful task, shift focus, or complete something significant. Write a short, natural description of what you're doing — think of it like a commit message or a brief status update. Examples: 'Fixing the login redirect bug', 'Adding unit tests for the payment module', 'Reviewing PR feedback on the API layer'. Don't update more than once per minute.`,
  {
    details: z.string().max(128).describe('The status message to display (max 128 chars)'),
    state: z
      .string()
      .max(128)
      .optional()
      .describe('Secondary context line (defaults to project name)'),
    clear: z.boolean().optional().describe('If true, clears the custom status'),
  },
  async ({ details, state, clear }) => {
    const sessionId = await findOrCreateSession();

    try {
      if (clear) {
        // Clear by sending a generic status
        await fetch(`${DAEMON_URL}/sessions/${sessionId}/activity`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            details: 'Working...',
            priority: 'hook',
          }),
        });
        return { content: [{ type: 'text' as const, text: 'Discord status cleared.' }] };
      }

      const body: Record<string, string> = {
        details,
        priority: 'mcp',
      };

      if (state) {
        // state is handled by the resolver, but we can store it in details if needed
        body.details = details;
      }

      await fetch(`${DAEMON_URL}/sessions/${sessionId}/activity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      return {
        content: [{ type: 'text' as const, text: `Discord status updated: "${details}"` }],
      };
    } catch (err) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Failed to update Discord status: ${(err as Error).message}. Is the daemon running? (claude-discord-status start)`,
          },
        ],
        isError: true,
      };
    }
  },
);

await ensureDaemon();

const transport = new StdioServerTransport();
server.connect(transport).catch((err) => {
  console.error('MCP server failed to start:', err);
  process.exit(1);
});
