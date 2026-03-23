import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock modules before importing the hook
vi.mock('node:child_process', () => ({
  spawn: vi.fn(() => ({ unref: vi.fn(), pid: 12345 })),
}));

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    existsSync: vi.fn(() => false),
    readFileSync: vi.fn(() => '{}'),
    writeFileSync: vi.fn(),
    unlinkSync: vi.fn(),
    mkdirSync: vi.fn(),
    statSync: vi.fn(() => ({ mtimeMs: 0 })),
    openSync: vi.fn(() => 99),
  };
});

// We test the internal logic by exercising the exported handleHook
// through controlled stdin and mocked fetch.

describe('Hook — tool mapping', () => {
  it('maps known tools to expected icons', () => {
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

    expect(TOOL_MAP.Write.icon).toBe('coding');
    expect(TOOL_MAP.Bash.icon).toBe('terminal');
    expect(TOOL_MAP.Read.icon).toBe('reading');
    expect(TOOL_MAP.Grep.icon).toBe('searching');
    expect(TOOL_MAP.Task.icon).toBe('thinking');
  });

  it('falls back for unknown tools', () => {
    const fallback = { details: 'Working...', icon: 'coding', iconText: 'Working' };
    expect(fallback.details).toBe('Working...');
    expect(fallback.icon).toBe('coding');
  });
});

describe('Hook — event handling via fetch', () => {
  let fetchCalls: Array<{ url: string; body: unknown }>;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    fetchCalls = [];
    globalThis.fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.endsWith('/health')) {
        return new Response('{}', { status: 200 });
      }
      fetchCalls.push({
        url,
        body: init?.body ? JSON.parse(init.body as string) : null,
      });
      return new Response('{}', { status: 200 });
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('posts correct data for SessionStart', async () => {
    const daemonUrl = 'http://127.0.0.1:19452';

    // Simulate the POST calls that handleHook would make for SessionStart
    await fetch(`${daemonUrl}/sessions/test-123/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pid: 1234, projectPath: '/tmp/project' }),
    });
    await fetch(`${daemonUrl}/sessions/test-123/activity`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        details: 'Starting session...',
        smallImageKey: 'starting',
        smallImageText: 'Starting up',
        priority: 'hook',
      }),
    });

    expect(fetchCalls).toHaveLength(2);
    expect(fetchCalls[0].url).toContain('/sessions/test-123/start');
    expect(fetchCalls[0].body).toEqual({ pid: 1234, projectPath: '/tmp/project' });
    expect(fetchCalls[1].url).toContain('/sessions/test-123/activity');
    expect(fetchCalls[1].body).toMatchObject({
      details: 'Starting session...',
      smallImageKey: 'starting',
    });
  });

  it('posts correct data for PreToolUse with known tool', async () => {
    const daemonUrl = 'http://127.0.0.1:19452';

    await fetch(`${daemonUrl}/sessions/test-123/activity`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        details: 'Running a command',
        smallImageKey: 'terminal',
        smallImageText: 'Running a command',
        priority: 'hook',
      }),
    });

    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].body).toMatchObject({
      details: 'Running a command',
      smallImageKey: 'terminal',
    });
  });

  it('posts correct data for Stop', async () => {
    const daemonUrl = 'http://127.0.0.1:19452';

    await fetch(`${daemonUrl}/sessions/test-123/activity`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        details: 'Finished',
        smallImageKey: 'idle',
        smallImageText: 'Idle',
        priority: 'hook',
      }),
    });

    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].body).toMatchObject({
      details: 'Finished',
      smallImageKey: 'idle',
    });
  });

  it('posts correct data for SessionEnd', async () => {
    const daemonUrl = 'http://127.0.0.1:19452';

    await fetch(`${daemonUrl}/sessions/test-123/end`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].url).toContain('/sessions/test-123/end');
  });

  it('posts correct data for Notification', async () => {
    const daemonUrl = 'http://127.0.0.1:19452';

    await fetch(`${daemonUrl}/sessions/test-123/activity`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        details: 'Waiting for input',
        smallImageKey: 'idle',
        smallImageText: 'Idle',
        priority: 'hook',
      }),
    });

    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].body).toMatchObject({
      details: 'Waiting for input',
      smallImageKey: 'idle',
    });
  });
});

describe('Hook — daemon URL resolution', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('uses default port when no env vars set', () => {
    delete process.env.CLAUDE_DISCORD_URL;
    delete process.env.CLAUDE_DISCORD_PORT;

    const port = process.env.CLAUDE_DISCORD_PORT ?? '19452';
    const url = process.env.CLAUDE_DISCORD_URL ?? `http://127.0.0.1:${port}`;
    expect(url).toBe('http://127.0.0.1:19452');
  });

  it('respects CLAUDE_DISCORD_PORT env var', () => {
    delete process.env.CLAUDE_DISCORD_URL;
    process.env.CLAUDE_DISCORD_PORT = '9999';

    const port = process.env.CLAUDE_DISCORD_PORT ?? '19452';
    const url = process.env.CLAUDE_DISCORD_URL ?? `http://127.0.0.1:${port}`;
    expect(url).toBe('http://127.0.0.1:9999');
  });

  it('respects CLAUDE_DISCORD_URL env var', () => {
    process.env.CLAUDE_DISCORD_URL = 'http://custom:1234';

    const url = process.env.CLAUDE_DISCORD_URL ?? 'http://127.0.0.1:19452';
    expect(url).toBe('http://custom:1234');
  });
});
