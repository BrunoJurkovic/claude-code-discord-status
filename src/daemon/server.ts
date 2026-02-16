import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'node:http';
import { z } from 'zod';
import type { SessionRegistry } from './sessions.js';

const SessionStartSchema = z.object({
  pid: z.number().int().positive(),
  projectPath: z.string().min(1),
});

const SessionActivitySchema = z.object({
  details: z.string().max(128).nullable().optional(),
  smallImageKey: z.string().optional(),
  smallImageText: z.string().optional(),
  priority: z.enum(['hook', 'mcp']).optional(),
});

type HealthProvider = () => {
  connected: boolean;
  uptime: number;
  version: string;
  latestVersion?: string;
  updateAvailable?: boolean;
};

export function createDaemonServer(
  registry: SessionRegistry,
  healthProvider: HealthProvider,
): Server {
  const server = createServer(async (req, res) => {
    try {
      await handleRequest(req, res, registry, healthProvider);
    } catch (err) {
      sendJson(res, 500, { error: 'Internal server error' });
      console.error('Server error:', err);
    }
  });

  return server;
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  registry: SessionRegistry,
  healthProvider: HealthProvider,
): Promise<void> {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const path = url.pathname;
  const method = req.method ?? 'GET';

  // GET /health
  if (method === 'GET' && path === '/health') {
    const health = healthProvider();
    sendJson(res, 200, {
      connected: health.connected,
      sessions: registry.getSessionCount(),
      uptime: health.uptime,
      version: health.version,
      ...(health.latestVersion !== undefined && { latestVersion: health.latestVersion }),
      ...(health.updateAvailable !== undefined && { updateAvailable: health.updateAvailable }),
    });
    return;
  }

  // GET /sessions
  if (method === 'GET' && path === '/sessions') {
    sendJson(res, 200, registry.getAllSessions());
    return;
  }

  // Route: /sessions/:sessionId/*
  const sessionMatch = path.match(/^\/sessions\/([^/]+)\/(start|activity|end)$/);
  if (sessionMatch && method === 'POST') {
    const sessionId = sessionMatch[1];
    const action = sessionMatch[2];
    const body = await readBody(req);

    if (action === 'start') {
      const parsed = SessionStartSchema.safeParse(body);
      if (!parsed.success) {
        sendJson(res, 400, { error: 'Invalid request body', details: parsed.error.issues });
        return;
      }
      // Deduplicate: if a session already exists for the same projectPath + pid, return it.
      // This prevents the hook and MCP from the same Claude instance from double-registering,
      // while still allowing two different Claude instances in the same folder.
      const existing = registry.findSessionByProjectPath(parsed.data.projectPath);
      if (existing && existing.pid === parsed.data.pid) {
        sendJson(res, 200, { sessionId: existing.sessionId, projectName: existing.projectName });
        return;
      }
      const session = registry.startSession(sessionId, parsed.data);
      sendJson(res, 201, { sessionId: session.sessionId, projectName: session.projectName });
      return;
    }

    if (action === 'activity') {
      const parsed = SessionActivitySchema.safeParse(body);
      if (!parsed.success) {
        sendJson(res, 400, { error: 'Invalid request body', details: parsed.error.issues });
        return;
      }
      const session = registry.updateActivity(sessionId, parsed.data);
      if (!session) {
        sendJson(res, 404, { error: 'Session not found' });
        return;
      }
      sendJson(res, 200, { sessionId: session.sessionId, details: session.details });
      return;
    }

    if (action === 'end') {
      const existed = registry.endSession(sessionId);
      if (!existed) {
        sendJson(res, 404, { error: 'Session not found' });
        return;
      }
      sendJson(res, 200, { ok: true });
      return;
    }
  }

  sendJson(res, 404, { error: 'Not found' });
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf-8');
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}
