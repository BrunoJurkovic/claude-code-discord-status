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

  describe('checkJq', () => {
    it('passes when jq is installed', async () => {
      vi.mocked(execSync).mockReturnValue(Buffer.from('jq-1.7.1'));
      const { checkJq } = await import('../../src/doctor.js');
      const result = checkJq();
      expect(result.status).toBe('pass');
    });

    it('fails when jq is not installed', async () => {
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('not found');
      });
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
    });
  });

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
      expect(result.fix).toBeDefined();
    });
  });

  describe('checkHookPaths', () => {
    it('passes when all hooks point to stable path', async () => {
      const home = process.env.HOME ?? '/Users/test';
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({
          hooks: {
            SessionStart: [
              {
                hooks: [{ command: `${home}/.claude-presence/claude-hook.sh` }],
              },
            ],
          },
        }),
      );
      const { checkHookPaths } = await import('../../src/doctor.js');
      const result = checkHookPaths();
      expect(result.status).toBe('pass');
    });

    it('fails when hooks point to wrong path', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({
          hooks: {
            SessionStart: [
              {
                hooks: [
                  { command: '/opt/homebrew/lib/node_modules/something/claude-hook.sh' },
                ],
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

    it('warns when lock dir exists', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      const { checkStaleLock } = await import('../../src/doctor.js');
      const result = checkStaleLock();
      expect(result.status).toBe('warn');
      expect(result.fix).toBeDefined();
    });
  });

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

    it('warns when old env vars are set', async () => {
      process.env.CLAUDE_DISCORD_PORT = '19452';
      const { checkOldEnvVars } = await import('../../src/doctor.js');
      const result = checkOldEnvVars();
      expect(result.status).toBe('warn');
      expect(result.message).toContain('CLAUDE_DISCORD_PORT');
      expect(result.message).toContain('CLAUDE_PRESENCE_PORT');
    });
  });
});
