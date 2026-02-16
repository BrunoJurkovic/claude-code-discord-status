import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

describe('loadConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    delete process.env.CLAUDE_DISCORD_CLIENT_ID;
    delete process.env.CLAUDE_DISCORD_PORT;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  async function loadConfig() {
    const mod = await import('../../src/shared/config.js');
    return mod.loadConfig();
  }

  it('returns defaults when no config file and no env vars', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    const config = await loadConfig();
    expect(config.discordClientId).toBe('1472915568930848829');
    expect(config.daemonPort).toBe(19452);
    expect(config.staleCheckInterval).toBe(30_000);
    expect(config.idleTimeout).toBe(600_000);
    expect(config.removeTimeout).toBe(1_800_000);
  });

  it('reads from config file', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({
        discordClientId: 'file-client-id',
        daemonPort: 9999,
      }),
    );

    const config = await loadConfig();
    expect(config.discordClientId).toBe('file-client-id');
    expect(config.daemonPort).toBe(9999);
  });

  it('env vars override config file', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({
        discordClientId: 'file-client-id',
        daemonPort: 9999,
      }),
    );

    process.env.CLAUDE_DISCORD_CLIENT_ID = 'env-client-id';
    process.env.CLAUDE_DISCORD_PORT = '8888';

    const config = await loadConfig();
    expect(config.discordClientId).toBe('env-client-id');
    expect(config.daemonPort).toBe(8888);
  });

  it('handles invalid JSON in config file gracefully', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('not json');

    const config = await loadConfig();
    expect(config.discordClientId).toBe('1472915568930848829');
    expect(config.daemonPort).toBe(19452);
  });
});
