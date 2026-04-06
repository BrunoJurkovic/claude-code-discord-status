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
    // Clean new env vars
    delete process.env.CLAUDE_PRESENCE_CLIENT_ID;
    delete process.env.CLAUDE_PRESENCE_PORT;
    delete process.env.CLAUDE_PRESENCE_UPDATE_CHECK;
    delete process.env.CLAUDE_PRESENCE_PRESET;
    // Clean old env vars
    delete process.env.CLAUDE_DISCORD_CLIENT_ID;
    delete process.env.CLAUDE_DISCORD_PORT;
    delete process.env.CLAUDE_DISCORD_UPDATE_CHECK;
    delete process.env.CLAUDE_DISCORD_PRESET;
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
    expect(config.updateCheck).toBe(true);
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

  it('CLAUDE_PRESENCE_* env vars override config file', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({
        discordClientId: 'file-client-id',
        daemonPort: 9999,
      }),
    );

    process.env.CLAUDE_PRESENCE_CLIENT_ID = 'env-client-id';
    process.env.CLAUDE_PRESENCE_PORT = '8888';

    const config = await loadConfig();
    expect(config.discordClientId).toBe('env-client-id');
    expect(config.daemonPort).toBe(8888);
  });

  it('reads updateCheck: false from config file', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({
        updateCheck: false,
      }),
    );

    const config = await loadConfig();
    expect(config.updateCheck).toBe(false);
  });

  it('CLAUDE_PRESENCE_UPDATE_CHECK=0 overrides config', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({
        updateCheck: true,
      }),
    );

    process.env.CLAUDE_PRESENCE_UPDATE_CHECK = '0';

    const config = await loadConfig();
    expect(config.updateCheck).toBe(false);
  });

  it('handles invalid JSON in config file gracefully', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('not json');

    const config = await loadConfig();
    expect(config.discordClientId).toBe('1472915568930848829');
    expect(config.daemonPort).toBe(19452);
  });

  it('defaults preset to minimal', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    const config = await loadConfig();
    expect(config.preset).toBe('minimal');
  });

  it('reads preset from config file', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({
        preset: 'professional',
      }),
    );

    const config = await loadConfig();
    expect(config.preset).toBe('professional');
  });

  it('CLAUDE_PRESENCE_PRESET env var overrides config file', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({
        preset: 'gen-z',
      }),
    );

    process.env.CLAUDE_PRESENCE_PRESET = 'minimal';

    const config = await loadConfig();
    expect(config.preset).toBe('minimal');
  });

  it('old CLAUDE_DISCORD_* env vars work as fallback', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    process.env.CLAUDE_DISCORD_CLIENT_ID = 'legacy-id';
    process.env.CLAUDE_DISCORD_PORT = '7777';

    const config = await loadConfig();
    expect(config.discordClientId).toBe('legacy-id');
    expect(config.daemonPort).toBe(7777);
  });

  it('new CLAUDE_PRESENCE_* takes precedence over old CLAUDE_DISCORD_*', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    process.env.CLAUDE_PRESENCE_CLIENT_ID = 'new-id';
    process.env.CLAUDE_DISCORD_CLIENT_ID = 'old-id';

    const config = await loadConfig();
    expect(config.discordClientId).toBe('new-id');
  });
});
