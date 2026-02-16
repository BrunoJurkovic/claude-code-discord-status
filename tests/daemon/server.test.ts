import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import { SessionRegistry } from '../../src/daemon/sessions.js';
import { createDaemonServer } from '../../src/daemon/server.js';

let server: Server;
let baseUrl: string;
let registry: SessionRegistry;

beforeAll(async () => {
  registry = new SessionRegistry();
  server = createDaemonServer(registry, () => ({
    connected: true,
    uptime: 42,
  }));

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        baseUrl = `http://127.0.0.1:${addr.port}`;
      }
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
});

async function post(path: string, body: unknown): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('HTTP API', () => {
  describe('GET /health', () => {
    it('returns health info', async () => {
      const res = await fetch(`${baseUrl}/health`);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.connected).toBe(true);
      expect(body.uptime).toBe(42);
      expect(typeof body.sessions).toBe('number');
    });
  });

  describe('POST /sessions/:id/start', () => {
    it('creates a new session', async () => {
      const res = await post('/sessions/test-session-1/start', {
        pid: process.pid,
        projectPath: '/tmp/test-project',
      });
      expect(res.status).toBe(201);

      const body = await res.json();
      expect(body.sessionId).toBe('test-session-1');
      expect(body.projectName).toBe('test-project');
    });

    it('deduplicates by projectPath + pid and returns existing session', async () => {
      const res1 = await post('/sessions/dedup-1/start', {
        pid: process.pid,
        projectPath: '/tmp/dedup-project',
      });
      expect(res1.status).toBe(201);
      const body1 = await res1.json();
      expect(body1.sessionId).toBe('dedup-1');

      // Second start with different sessionId but same projectPath AND pid
      const res2 = await post('/sessions/dedup-2/start', {
        pid: process.pid,
        projectPath: '/tmp/dedup-project',
      });
      expect(res2.status).toBe(200); // 200, not 201
      const body2 = await res2.json();
      expect(body2.sessionId).toBe('dedup-1'); // returns the original
    });

    it('allows two sessions on the same folder with different pids', async () => {
      const res1 = await post('/sessions/folder-1/start', {
        pid: 11111,
        projectPath: '/tmp/same-folder',
      });
      expect(res1.status).toBe(201);

      // Different pid = different Claude Code instance
      const res2 = await post('/sessions/folder-2/start', {
        pid: 22222,
        projectPath: '/tmp/same-folder',
      });
      expect(res2.status).toBe(201);
      const body2 = await res2.json();
      expect(body2.sessionId).toBe('folder-2'); // creates a new session
    });

    it('rejects invalid body', async () => {
      const res = await post('/sessions/bad/start', {
        pid: 'not-a-number',
      });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /sessions/:id/activity', () => {
    it('updates session activity', async () => {
      // Ensure session exists
      await post('/sessions/test-session-2/start', {
        pid: process.pid,
        projectPath: '/tmp/test-project-2',
      });

      const res = await post('/sessions/test-session-2/activity', {
        details: 'Editing test.ts',
        smallImageKey: 'coding',
        priority: 'hook',
      });
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.details).toBe('Editing test.ts');
    });

    it('returns 404 for unknown session', async () => {
      const res = await post('/sessions/nonexistent/activity', {
        details: 'test',
      });
      expect(res.status).toBe(404);
    });
  });

  describe('POST /sessions/:id/end', () => {
    it('ends a session', async () => {
      await post('/sessions/test-session-3/start', {
        pid: process.pid,
        projectPath: '/tmp/test-project-3',
      });

      const res = await post('/sessions/test-session-3/end', {});
      expect(res.status).toBe(200);
    });

    it('returns 404 for unknown session', async () => {
      const res = await post('/sessions/nonexistent/end', {});
      expect(res.status).toBe(404);
    });
  });

  describe('GET /sessions', () => {
    it('lists all sessions', async () => {
      const res = await fetch(`${baseUrl}/sessions`);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
    });
  });

  describe('404 for unknown routes', () => {
    it('returns 404', async () => {
      const res = await fetch(`${baseUrl}/unknown`);
      expect(res.status).toBe(404);
    });
  });
});
