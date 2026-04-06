import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  existsSync,
  renameSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  chmodSync,
  mkdirSync,
} from 'node:fs';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  renameSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  copyFileSync: vi.fn(),
  chmodSync: vi.fn(),
  mkdirSync: vi.fn(),
  unlinkSync: vi.fn(),
}));

describe('migrateFromLegacy', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.resetModules();
  });

  it('migrates when old dir exists and new dir does not', async () => {
    vi.mocked(existsSync).mockImplementation((p) => {
      const path = String(p);
      if (path.includes('.claude-discord-status')) return true;
      if (path.includes('.claude-presence')) return false;
      return false;
    });

    const { migrateFromLegacy } = await import('../../src/shared/migration.js');
    const result = migrateFromLegacy();

    expect(result).toBe(true);
    expect(renameSync).toHaveBeenCalled();
  });

  it('skips when both dirs exist', async () => {
    vi.mocked(existsSync).mockReturnValue(true);

    const { migrateFromLegacy } = await import('../../src/shared/migration.js');
    const result = migrateFromLegacy();

    expect(result).toBe(false);
    expect(renameSync).not.toHaveBeenCalled();
  });

  it('skips when neither dir exists', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    const { migrateFromLegacy } = await import('../../src/shared/migration.js');
    const result = migrateFromLegacy();

    expect(result).toBe(false);
    expect(renameSync).not.toHaveBeenCalled();
  });
});

describe('updateHookPaths', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.resetModules();
  });

  it('rewrites hook commands containing claude-hook.sh', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({
        hooks: {
          SessionStart: [
            {
              hooks: [
                {
                  type: 'command',
                  command:
                    '/opt/homebrew/lib/node_modules/claude-code-discord-status/src/hooks/claude-hook.sh',
                },
              ],
            },
          ],
        },
      }),
    );

    const { updateHookPaths } = await import('../../src/shared/migration.js');
    updateHookPaths();

    const writeCall = vi.mocked(writeFileSync).mock.calls.find(
      (call) => typeof call[0] === 'string' && call[0].includes('settings.json'),
    );
    expect(writeCall).toBeDefined();
    const written = JSON.parse(writeCall![1] as string);
    expect(written.hooks.SessionStart[0].hooks[0].command).toContain('.claude-presence');
    expect(written.hooks.SessionStart[0].hooks[0].command).toContain('claude-hook.sh');
  });

  it('does nothing when no settings.json exists', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    const { updateHookPaths } = await import('../../src/shared/migration.js');
    updateHookPaths();

    expect(writeFileSync).not.toHaveBeenCalled();
  });

  it('does nothing when no hooks contain claude-hook.sh', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({
        hooks: {
          SessionStart: [
            {
              hooks: [{ type: 'command', command: '/some/other/hook.sh' }],
            },
          ],
        },
      }),
    );

    const { updateHookPaths } = await import('../../src/shared/migration.js');
    updateHookPaths();

    expect(writeFileSync).not.toHaveBeenCalled();
  });
});
