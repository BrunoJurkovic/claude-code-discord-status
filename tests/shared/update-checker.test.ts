import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  existsSync: vi.fn(),
}));

vi.mock('../../src/shared/version.js', () => ({
  VERSION: '0.1.0',
}));

describe('compareVersions', () => {
  async function loadCompare() {
    const mod = await import('../../src/shared/update-checker.js');
    return mod.compareVersions;
  }

  it('returns 0 for equal versions', async () => {
    const compare = await loadCompare();
    expect(compare('1.2.3', '1.2.3')).toBe(0);
  });

  it('returns -1 when a < b (major)', async () => {
    const compare = await loadCompare();
    expect(compare('1.0.0', '2.0.0')).toBe(-1);
  });

  it('returns -1 when a < b (minor)', async () => {
    const compare = await loadCompare();
    expect(compare('1.0.0', '1.1.0')).toBe(-1);
  });

  it('returns -1 when a < b (patch)', async () => {
    const compare = await loadCompare();
    expect(compare('1.0.0', '1.0.1')).toBe(-1);
  });

  it('returns 1 when a > b', async () => {
    const compare = await loadCompare();
    expect(compare('2.0.0', '1.9.9')).toBe(1);
  });

  it('returns 0 for malformed input', async () => {
    const compare = await loadCompare();
    expect(compare('not-a-version', 'also-not')).toBe(0);
  });

  it('handles prerelease suffix by ignoring it', async () => {
    const compare = await loadCompare();
    expect(compare('1.0.0-beta', '1.0.0')).toBe(0);
    expect(compare('1.0.0', '1.0.1-rc.1')).toBe(-1);
  });
});

describe('readCachedUpdate', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  async function loadReadCached() {
    const mod = await import('../../src/shared/update-checker.js');
    return mod.readCachedUpdate;
  }

  it('returns null for missing file', async () => {
    vi.mocked(readFileSync).mockImplementation(() => {
      throw new Error('ENOENT');
    });
    const readCached = await loadReadCached();
    expect(readCached()).toBeNull();
  });

  it('returns null for malformed JSON', async () => {
    vi.mocked(readFileSync).mockReturnValue('not json');
    const readCached = await loadReadCached();
    expect(readCached()).toBeNull();
  });

  it('returns null for incomplete data', async () => {
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ latestVersion: '1.0.0' }));
    const readCached = await loadReadCached();
    expect(readCached()).toBeNull();
  });

  it('returns valid cached data', async () => {
    const data = {
      latestVersion: '0.2.0',
      currentVersion: '0.1.0',
      updateAvailable: true,
      checkedAt: Date.now(),
    };
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(data));
    const readCached = await loadReadCached();
    expect(readCached()).toEqual(data);
  });
});

describe('checkForUpdate', () => {
  const originalEnv = process.env;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    delete process.env.NO_UPDATE_NOTIFIER;
    delete process.env.CLAUDE_DISCORD_UPDATE_CHECK;
    vi.mocked(readFileSync).mockImplementation(() => {
      throw new Error('ENOENT');
    });
    vi.mocked(writeFileSync).mockImplementation(() => {});
    vi.mocked(mkdirSync).mockImplementation(() => undefined as unknown as string);
  });

  afterEach(() => {
    process.env = originalEnv;
    globalThis.fetch = originalFetch;
  });

  async function loadCheckForUpdate() {
    const mod = await import('../../src/shared/update-checker.js');
    return mod.checkForUpdate;
  }

  it('returns null when disabled via config', async () => {
    const check = await loadCheckForUpdate();
    expect(await check(false)).toBeNull();
  });

  it('returns null when disabled via NO_UPDATE_NOTIFIER=1', async () => {
    process.env.NO_UPDATE_NOTIFIER = '1';
    const check = await loadCheckForUpdate();
    expect(await check(true)).toBeNull();
  });

  it('returns null when disabled via CLAUDE_DISCORD_UPDATE_CHECK=0', async () => {
    process.env.CLAUDE_DISCORD_UPDATE_CHECK = '0';
    const check = await loadCheckForUpdate();
    expect(await check(true)).toBeNull();
  });

  it('returns fresh cache without fetching', async () => {
    const cached = {
      latestVersion: '0.2.0',
      currentVersion: '0.1.0',
      updateAvailable: true,
      checkedAt: Date.now(),
    };
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(cached));

    const mockFetch = vi.fn();
    globalThis.fetch = mockFetch;

    const check = await loadCheckForUpdate();
    const result = await check(true);
    expect(result).toEqual(cached);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('fetches when cache is stale', async () => {
    const staleCache = {
      latestVersion: '0.1.0',
      currentVersion: '0.1.0',
      updateAvailable: false,
      checkedAt: Date.now() - 7 * 60 * 60 * 1000, // 7 hours ago
    };
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(staleCache));

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ version: '0.2.0' }),
    });

    const check = await loadCheckForUpdate();
    const result = await check(true);
    expect(result).not.toBeNull();
    expect(result!.latestVersion).toBe('0.2.0');
    expect(result!.updateAvailable).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('returns stale cache on network failure', async () => {
    const staleCache = {
      latestVersion: '0.1.0',
      currentVersion: '0.1.0',
      updateAvailable: false,
      checkedAt: Date.now() - 7 * 60 * 60 * 1000,
    };
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(staleCache));

    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network error'));

    const check = await loadCheckForUpdate();
    const result = await check(true);
    expect(result).toEqual(staleCache);
  });
});
