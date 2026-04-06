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

  it('returns false when renameSync throws', async () => {
    vi.mocked(existsSync).mockImplementation((p) => {
      const path = String(p);
      if (path.includes('.claude-discord-status')) return true;
      if (path.includes('.claude-presence')) return false;
      return false;
    });
    vi.mocked(renameSync).mockImplementation(() => {
      throw new Error('EXDEV: cross-device link not permitted');
    });

    const { migrateFromLegacy } = await import('../../src/shared/migration.js');
    const result = migrateFromLegacy();

    expect(result).toBe(false);
  });

  it('calls updateHookPaths, copyHookToStablePath, and updateDaemonPathInConfig on success', async () => {
    // Make migration trigger (old exists, new does not)
    // After renameSync, the new dir "exists" for subsequent calls
    let renamed = false;
    vi.mocked(existsSync).mockImplementation((p) => {
      const path = String(p);
      if (path.includes('.claude-discord-status') && !renamed) return true;
      if (path.includes('.claude-presence') && !renamed) return false;
      // After rename, settings.json exists for updateHookPaths
      if (path.includes('settings.json')) return true;
      // Config file exists for updateDaemonPathInConfig
      if (path.includes('config.json')) return true;
      return false;
    });
    vi.mocked(renameSync).mockImplementation(() => {
      renamed = true;
    });
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ hooks: {} }));

    const { migrateFromLegacy } = await import('../../src/shared/migration.js');
    migrateFromLegacy();

    expect(renameSync).toHaveBeenCalledTimes(1);
    // updateHookPaths reads settings.json
    expect(readFileSync).toHaveBeenCalled();
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

    const writeCall = vi
      .mocked(writeFileSync)
      .mock.calls.find((call) => typeof call[0] === 'string' && call[0].includes('settings.json'));
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

  it('does nothing when settings has no hooks key', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ permissions: {} }));

    const { updateHookPaths } = await import('../../src/shared/migration.js');
    updateHookPaths();

    expect(writeFileSync).not.toHaveBeenCalled();
  });

  it('handles malformed JSON silently', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('not valid json {{{');

    const { updateHookPaths } = await import('../../src/shared/migration.js');
    // Should not throw
    updateHookPaths();

    expect(writeFileSync).not.toHaveBeenCalled();
  });

  it('rewrites hooks across multiple events', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({
        hooks: {
          SessionStart: [{ hooks: [{ command: '/old/path/claude-hook.sh' }] }],
          PreToolUse: [
            { matcher: 'Write|Edit', hooks: [{ command: '/different/old/claude-hook.sh' }] },
          ],
          Stop: [{ hooks: [{ command: '/yet/another/claude-hook.sh' }] }],
        },
      }),
    );

    const { updateHookPaths } = await import('../../src/shared/migration.js');
    updateHookPaths();

    const writeCall = vi
      .mocked(writeFileSync)
      .mock.calls.find((call) => typeof call[0] === 'string' && call[0].includes('settings.json'));
    expect(writeCall).toBeDefined();
    const written = JSON.parse(writeCall![1] as string);

    // All three events should point to the stable path
    expect(written.hooks.SessionStart[0].hooks[0].command).toContain('.claude-presence');
    expect(written.hooks.PreToolUse[0].hooks[0].command).toContain('.claude-presence');
    expect(written.hooks.Stop[0].hooks[0].command).toContain('.claude-presence');

    // Matcher should be preserved
    expect(written.hooks.PreToolUse[0].matcher).toBe('Write|Edit');
  });

  it('skips entries without inner hooks array', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({
        hooks: {
          SessionStart: [{ matcher: '' }, { hooks: [{ command: '/old/claude-hook.sh' }] }],
        },
      }),
    );

    const { updateHookPaths } = await import('../../src/shared/migration.js');
    updateHookPaths();

    // Should still write — the second entry had a match
    expect(writeFileSync).toHaveBeenCalled();
  });

  it('preserves non-hook entries in settings', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({
        permissions: { allow: ['Bash'] },
        hooks: {
          Stop: [
            { hooks: [{ command: '/other/vault-stop.sh' }] },
            { hooks: [{ command: '/old/claude-hook.sh' }] },
          ],
        },
      }),
    );

    const { updateHookPaths } = await import('../../src/shared/migration.js');
    updateHookPaths();

    const writeCall = vi
      .mocked(writeFileSync)
      .mock.calls.find((call) => typeof call[0] === 'string' && call[0].includes('settings.json'));
    const written = JSON.parse(writeCall![1] as string);

    // Non-hook settings preserved
    expect(written.permissions.allow).toEqual(['Bash']);
    // vault-stop.sh left alone
    expect(written.hooks.Stop[0].hooks[0].command).toBe('/other/vault-stop.sh');
    // claude-hook.sh rewritten
    expect(written.hooks.Stop[1].hooks[0].command).toContain('.claude-presence');
  });
});

describe('copyHookToStablePath', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.resetModules();
  });

  it('copies hook when source candidate exists', async () => {
    vi.mocked(existsSync).mockReturnValue(true);

    const { copyHookToStablePath } = await import('../../src/shared/migration.js');
    copyHookToStablePath();

    expect(mkdirSync).toHaveBeenCalledWith(expect.stringContaining('.claude-presence'), {
      recursive: true,
    });
    expect(copyFileSync).toHaveBeenCalled();
    expect(chmodSync).toHaveBeenCalledWith(expect.stringContaining('claude-hook.sh'), 0o755);
  });

  it('does nothing when no source candidate exists', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    const { copyHookToStablePath } = await import('../../src/shared/migration.js');
    copyHookToStablePath();

    expect(copyFileSync).not.toHaveBeenCalled();
    expect(chmodSync).not.toHaveBeenCalled();
  });

  it('handles copyFileSync errors silently', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(copyFileSync).mockImplementation(() => {
      throw new Error('EACCES: permission denied');
    });

    const { copyHookToStablePath } = await import('../../src/shared/migration.js');
    // Should not throw
    copyHookToStablePath();
  });
});

describe('updateDaemonPathInConfig', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.resetModules();
  });

  it('updates daemonPath when config exists and daemon path differs', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({ daemonPath: '/old/daemon/index.js', preset: 'minimal' }),
    );

    const { updateDaemonPathInConfig } = await import('../../src/shared/migration.js');
    updateDaemonPathInConfig();

    const writeCall = vi
      .mocked(writeFileSync)
      .mock.calls.find((call) => typeof call[0] === 'string' && call[0].includes('config.json'));
    expect(writeCall).toBeDefined();
    const written = JSON.parse(writeCall![1] as string);
    expect(written.daemonPath).not.toBe('/old/daemon/index.js');
    // Preset should be preserved
    expect(written.preset).toBe('minimal');
  });

  it('does nothing when config file does not exist', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    const { updateDaemonPathInConfig } = await import('../../src/shared/migration.js');
    updateDaemonPathInConfig();

    expect(writeFileSync).not.toHaveBeenCalled();
  });

  it('does nothing when daemon path does not exist on disk', async () => {
    vi.mocked(existsSync).mockImplementation((p) => {
      const path = String(p);
      if (path.includes('config.json')) return true;
      if (path.includes('daemon/index.js')) return false;
      return false;
    });
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ daemonPath: '/old/daemon/index.js' }));

    const { updateDaemonPathInConfig } = await import('../../src/shared/migration.js');
    updateDaemonPathInConfig();

    expect(writeFileSync).not.toHaveBeenCalled();
  });

  it('handles malformed config JSON silently', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('not json');

    const { updateDaemonPathInConfig } = await import('../../src/shared/migration.js');
    // Should not throw
    updateDaemonPathInConfig();

    expect(writeFileSync).not.toHaveBeenCalled();
  });
});
