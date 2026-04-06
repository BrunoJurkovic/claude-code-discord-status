import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { HOOK_FILE } from '../../src/shared/constants.js';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  unlinkSync: vi.fn(),
  copyFileSync: vi.fn(),
  chmodSync: vi.fn(),
  statSync: vi.fn(),
  rmSync: vi.fn(),
  renameSync: vi.fn(),
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

  // --- checkNodeVersion ---

  describe('checkNodeVersion', () => {
    it('passes for current node version', async () => {
      const { checkNodeVersion } = await import('../../src/doctor.js');
      const result = checkNodeVersion();
      // Running tests requires Node >= 18, so this always passes in practice
      expect(result.status).toBe('pass');
      expect(result.message).toContain('Node.js');
    });
  });

  // --- checkJq ---

  describe('checkJq', () => {
    it('passes when jq is installed', async () => {
      vi.mocked(execSync).mockReturnValue(Buffer.from('jq-1.7.1'));
      const { checkJq } = await import('../../src/doctor.js');
      const result = checkJq();
      expect(result.status).toBe('pass');
      expect(result.message).toContain('jq-1.7.1');
    });

    it('fails when jq is not installed', async () => {
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('not found');
      });
      const { checkJq } = await import('../../src/doctor.js');
      const result = checkJq();
      expect(result.status).toBe('fail');
      expect(result.message).toContain('not found');
    });
  });

  // --- checkConfigFile ---

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
      expect(result.message).toContain('not found');
    });

    it('fails when config contains invalid JSON', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('not valid json {{{');
      const { checkConfigFile } = await import('../../src/doctor.js');
      const result = checkConfigFile();
      expect(result.status).toBe('fail');
      expect(result.message).toContain('Invalid JSON');
    });
  });

  // --- checkLegacyConfigDir ---

  describe('checkLegacyConfigDir', () => {
    it('passes when no legacy dir exists', async () => {
      vi.mocked(existsSync).mockImplementation((p) => {
        const path = String(p);
        if (path.includes('.claude-discord-status')) return false;
        if (path.includes('.claude-presence')) return true;
        return false;
      });
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
      expect(result.message).toContain('Both');
    });

    it('fails when only legacy dir exists', async () => {
      vi.mocked(existsSync).mockImplementation((p) => {
        const path = String(p);
        if (path.includes('.claude-discord-status')) return true;
        if (path.includes('.claude-presence')) return false;
        return false;
      });
      const { checkLegacyConfigDir } = await import('../../src/doctor.js');
      const result = checkLegacyConfigDir();
      expect(result.status).toBe('fail');
      expect(result.fix).toBeDefined();
      expect(result.message).toContain('migration');
    });
  });

  // --- checkHookScript ---

  describe('checkHookScript', () => {
    it('passes when hook exists and is executable', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(statSync).mockReturnValue({ mode: 0o100755 } as ReturnType<typeof statSync>);
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

    it('fails when hook is not executable', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(statSync).mockReturnValue({ mode: 0o100644 } as ReturnType<typeof statSync>);
      const { checkHookScript } = await import('../../src/doctor.js');
      const result = checkHookScript();
      expect(result.status).toBe('fail');
      expect(result.message).toContain('not executable');
      expect(result.fix).toBeDefined();
    });

    it('fails when statSync throws', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(statSync).mockImplementation(() => {
        throw new Error('EACCES');
      });
      const { checkHookScript } = await import('../../src/doctor.js');
      const result = checkHookScript();
      expect(result.status).toBe('fail');
      expect(result.message).toContain('Cannot stat');
    });
  });

  // --- checkHookPaths ---

  describe('checkHookPaths', () => {
    it('passes when all hooks point to stable path', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({
          hooks: {
            SessionStart: [
              {
                hooks: [{ command: HOOK_FILE }],
              },
            ],
          },
        }),
      );
      const { checkHookPaths } = await import('../../src/doctor.js');
      const result = checkHookPaths();
      expect(result.status).toBe('pass');
      expect(result.message).toContain('1 hooks configured');
    });

    it('fails when hooks point to wrong path', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({
          hooks: {
            SessionStart: [
              {
                hooks: [{ command: '/opt/homebrew/lib/node_modules/something/claude-hook.sh' }],
              },
            ],
          },
        }),
      );
      const { checkHookPaths } = await import('../../src/doctor.js');
      const result = checkHookPaths();
      expect(result.status).toBe('fail');
      expect(result.fix).toBeDefined();
    });

    it('warns when no hooks configured', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({}));
      const { checkHookPaths } = await import('../../src/doctor.js');
      const result = checkHookPaths();
      expect(result.status).toBe('warn');
    });

    it('warns when no settings.json exists', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      const { checkHookPaths } = await import('../../src/doctor.js');
      const result = checkHookPaths();
      expect(result.status).toBe('warn');
      expect(result.message).toContain('No Claude settings.json');
    });

    it('warns when hooks exist but none are claude-presence hooks', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({
          hooks: {
            Stop: [{ hooks: [{ command: '/some/other-hook.sh' }] }],
          },
        }),
      );
      const { checkHookPaths } = await import('../../src/doctor.js');
      const result = checkHookPaths();
      expect(result.status).toBe('warn');
      expect(result.message).toContain('No claude-presence hooks');
    });

    it('fails when settings.json is malformed JSON', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('not json {{');
      const { checkHookPaths } = await import('../../src/doctor.js');
      const result = checkHookPaths();
      expect(result.status).toBe('fail');
      expect(result.message).toContain('Cannot parse');
    });

    it('counts multiple mismatched hooks correctly', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({
          hooks: {
            SessionStart: [{ hooks: [{ command: '/wrong/path/claude-hook.sh' }] }],
            PreToolUse: [{ hooks: [{ command: '/also/wrong/claude-hook.sh' }] }],
            Stop: [{ hooks: [{ command: '/nope/claude-hook.sh' }] }],
          },
        }),
      );
      const { checkHookPaths } = await import('../../src/doctor.js');
      const result = checkHookPaths();
      expect(result.status).toBe('fail');
      expect(result.message).toContain('3 hook(s)');
    });
  });

  // --- checkDuplicateHooks ---

  describe('checkDuplicateHooks', () => {
    it('passes when no settings file exists', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      const { checkDuplicateHooks } = await import('../../src/doctor.js');
      const result = checkDuplicateHooks();
      expect(result.status).toBe('pass');
    });

    it('passes when no duplicates', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({
          hooks: {
            SessionStart: [{ hooks: [{ command: '/path/claude-hook.sh' }] }],
            Stop: [{ hooks: [{ command: '/path/claude-hook.sh' }] }],
          },
        }),
      );
      const { checkDuplicateHooks } = await import('../../src/doctor.js');
      const result = checkDuplicateHooks();
      expect(result.status).toBe('pass');
      expect(result.message).toBe('No duplicates');
    });

    it('fails when duplicate hook entries exist for the same event', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({
          hooks: {
            SessionStart: [
              { hooks: [{ command: '/path/a/claude-hook.sh' }] },
              { hooks: [{ command: '/path/b/claude-hook.sh' }] },
            ],
          },
        }),
      );
      const { checkDuplicateHooks } = await import('../../src/doctor.js');
      const result = checkDuplicateHooks();
      expect(result.status).toBe('fail');
      expect(result.message).toContain('duplicate');
      expect(result.fix).toBeDefined();
    });

    it('passes when settings has no hooks key', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ permissions: {} }));
      const { checkDuplicateHooks } = await import('../../src/doctor.js');
      const result = checkDuplicateHooks();
      expect(result.status).toBe('pass');
    });
  });

  // --- checkStalePid ---

  describe('checkStalePid', () => {
    it('passes when no PID file exists', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      const { checkStalePid } = await import('../../src/doctor.js');
      const result = checkStalePid();
      expect(result.status).toBe('pass');
      expect(result.message).toBe('No PID file');
    });

    it('passes when PID file exists and process is alive', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(String(process.pid));

      const { checkStalePid } = await import('../../src/doctor.js');
      const result = checkStalePid();
      expect(result.status).toBe('pass');
      expect(result.message).toContain(`PID ${process.pid}`);
    });

    it('fails when PID file points to a dead process', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      // Use a PID that almost certainly doesn't exist
      vi.mocked(readFileSync).mockReturnValue('999999');

      const killSpy = vi.spyOn(process, 'kill').mockImplementation((_pid, _signal?) => {
        throw new Error('ESRCH: no such process');
      });

      const { checkStalePid } = await import('../../src/doctor.js');
      const result = checkStalePid();
      expect(result.status).toBe('fail');
      expect(result.message).toContain('Stale PID');
      expect(result.message).toContain('999999');
      expect(result.fix).toBeDefined();

      killSpy.mockRestore();
    });

    it('fails when PID file contains invalid content', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('not-a-number');

      const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => {
        throw new Error('ESRCH');
      });

      const { checkStalePid } = await import('../../src/doctor.js');
      const result = checkStalePid();
      expect(result.status).toBe('fail');
      expect(result.fix).toBeDefined();

      killSpy.mockRestore();
    });
  });

  // --- checkStaleLock ---

  describe('checkStaleLock', () => {
    it('passes when no lock dir exists', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      const { checkStaleLock } = await import('../../src/doctor.js');
      const result = checkStaleLock();
      expect(result.status).toBe('pass');
    });

    it('warns when lock dir exists', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      const { checkStaleLock } = await import('../../src/doctor.js');
      const result = checkStaleLock();
      expect(result.status).toBe('warn');
      expect(result.fix).toBeDefined();
    });
  });

  // --- checkDaemonHealth ---

  describe('checkDaemonHealth', () => {
    const originalFetch = globalThis.fetch;

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it('passes when daemon is connected', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ connected: true, sessions: 2, uptime: 3600 }),
      });

      const { checkDaemonHealth } = await import('../../src/doctor.js');
      const result = await checkDaemonHealth(19452);
      expect(result.status).toBe('pass');
      expect(result.message).toContain('Connected');
      expect(result.message).toContain('2 session(s)');
    });

    it('warns when daemon is running but Discord not connected', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ connected: false, sessions: 0, uptime: 10 }),
      });

      const { checkDaemonHealth } = await import('../../src/doctor.js');
      const result = await checkDaemonHealth(19452);
      expect(result.status).toBe('warn');
      expect(result.message).toContain('Discord not connected');
    });

    it('fails when daemon is not reachable', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

      const { checkDaemonHealth } = await import('../../src/doctor.js');
      const result = await checkDaemonHealth(19452);
      expect(result.status).toBe('fail');
      expect(result.message).toBe('Not reachable');
    });

    it('fails when daemon returns non-OK response', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      });

      const { checkDaemonHealth } = await import('../../src/doctor.js');
      const result = await checkDaemonHealth(19452);
      expect(result.status).toBe('fail');
    });
  });

  // --- checkOldEnvVars ---

  describe('checkOldEnvVars', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
      delete process.env.CLAUDE_DISCORD_CLIENT_ID;
      delete process.env.CLAUDE_DISCORD_PORT;
      delete process.env.CLAUDE_DISCORD_PRESET;
      delete process.env.CLAUDE_DISCORD_UPDATE_CHECK;
      delete process.env.CLAUDE_DISCORD_URL;
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('passes when no old env vars set', async () => {
      const { checkOldEnvVars } = await import('../../src/doctor.js');
      const result = checkOldEnvVars();
      expect(result.status).toBe('pass');
    });

    it('warns when a single old env var is set', async () => {
      process.env.CLAUDE_DISCORD_PORT = '19452';
      const { checkOldEnvVars } = await import('../../src/doctor.js');
      const result = checkOldEnvVars();
      expect(result.status).toBe('warn');
      expect(result.message).toContain('CLAUDE_DISCORD_PORT');
      expect(result.message).toContain('CLAUDE_PRESENCE_PORT');
    });

    it('warns and lists all old env vars when multiple are set', async () => {
      process.env.CLAUDE_DISCORD_CLIENT_ID = '123';
      process.env.CLAUDE_DISCORD_PORT = '19452';
      process.env.CLAUDE_DISCORD_PRESET = 'minimal';
      const { checkOldEnvVars } = await import('../../src/doctor.js');
      const result = checkOldEnvVars();
      expect(result.status).toBe('warn');
      expect(result.message).toContain('CLAUDE_DISCORD_CLIENT_ID');
      expect(result.message).toContain('CLAUDE_DISCORD_PORT');
      expect(result.message).toContain('CLAUDE_DISCORD_PRESET');
      expect(result.message).toContain('CLAUDE_PRESENCE_CLIENT_ID');
      expect(result.message).toContain('CLAUDE_PRESENCE_PORT');
      expect(result.message).toContain('CLAUDE_PRESENCE_PRESET');
    });
  });

  // --- runAllChecks ---

  describe('runAllChecks', () => {
    const originalFetch = globalThis.fetch;

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it('returns results for all checks', async () => {
      // Stub enough for checks to run without crashing
      vi.mocked(execSync).mockReturnValue(Buffer.from('jq-1.7'));
      vi.mocked(existsSync).mockReturnValue(false);
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

      const { runAllChecks } = await import('../../src/doctor.js');
      const results = await runAllChecks(19452);

      // Should have results for all 11 checks
      expect(results.length).toBe(11);
      // Each result has the expected shape
      for (const r of results) {
        expect(r).toHaveProperty('status');
        expect(r).toHaveProperty('label');
        expect(r).toHaveProperty('message');
        expect(['pass', 'fail', 'warn']).toContain(r.status);
      }
    });

    it('includes async checkDaemonHealth result', async () => {
      vi.mocked(execSync).mockReturnValue(Buffer.from('jq-1.7'));
      vi.mocked(existsSync).mockReturnValue(false);
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ connected: true, sessions: 1, uptime: 100 }),
      });

      const { runAllChecks } = await import('../../src/doctor.js');
      const results = await runAllChecks(19452);

      const discordCheck = results.find((r) => r.label === 'Discord');
      expect(discordCheck).toBeDefined();
      expect(discordCheck!.status).toBe('pass');
    });
  });
});
