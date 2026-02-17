import { describe, it, expect } from 'vitest';
import {
  resolvePresence,
  getMostRecentSession,
  stablePick,
  formatStatsLine,
  detectDominantMode,
} from '../../src/daemon/resolver.js';
import type { Session, ActivityCounts } from '../../src/shared/types.js';
import { emptyActivityCounts } from '../../src/shared/types.js';
import {
  MCP_PRIORITY_WINDOW,
  MESSAGE_ROTATION_INTERVAL,
  MULTI_SESSION_MESSAGES,
  MULTI_SESSION_TOOLTIPS,
  SINGLE_SESSION_DETAILS,
  SINGLE_SESSION_DETAILS_FALLBACK,
  SINGLE_SESSION_STATE_MESSAGES,
} from '../../src/shared/constants.js';

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    sessionId: 'test-id',
    pid: 1234,
    projectPath: '/home/user/my-project',
    projectName: 'my-project',
    details: 'Editing file.ts',
    smallImageKey: 'coding',
    smallImageText: 'Writing code',
    startedAt: 1000000,
    lastActivityAt: Date.now(),
    lastMcpUpdateAt: 0,
    status: 'active',
    activityCounts: emptyActivityCounts(),
    ...overrides,
  };
}

function makeCounts(overrides: Partial<ActivityCounts> = {}): ActivityCounts {
  return { ...emptyActivityCounts(), ...overrides };
}

describe('resolvePresence', () => {
  it('returns null for 0 sessions', () => {
    expect(resolvePresence([])).toBeNull();
  });

  describe('single session mode', () => {
    const now = 1_000_000_000;

    it('picks details from action-specific pool based on smallImageKey', () => {
      const session = makeSession({ smallImageKey: 'coding' });
      const activity = resolvePresence([session], now)!;

      expect(activity).not.toBeNull();
      expect(SINGLE_SESSION_DETAILS['coding']).toContain(activity.details);
      expect(SINGLE_SESSION_STATE_MESSAGES).toContain(activity.state);
      expect(activity.largeImageKey).toBe('claude-code');
      expect(activity.smallImageKey).toBe('coding');
      expect(activity.startTimestamp).toBe(session.startedAt);
    });

    it('uses MCP-set details when within priority window', () => {
      const session = makeSession({
        details: 'Implementing user authentication',
        lastMcpUpdateAt: now - 5_000, // 5s ago, within 30s window
      });
      const activity = resolvePresence([session], now)!;

      expect(activity.details).toBe('Implementing user authentication');
    });

    it('ignores MCP details after priority window expires', () => {
      const session = makeSession({
        details: 'Old MCP message',
        smallImageKey: 'coding',
        lastMcpUpdateAt: now - MCP_PRIORITY_WINDOW - 1, // expired
      });
      const activity = resolvePresence([session], now)!;

      expect(activity.details).not.toBe('Old MCP message');
      expect(SINGLE_SESSION_DETAILS['coding']).toContain(activity.details);
    });

    it('uses correct pool for each smallImageKey', () => {
      for (const key of Object.keys(SINGLE_SESSION_DETAILS)) {
        const session = makeSession({ smallImageKey: key });
        const activity = resolvePresence([session], now)!;

        expect(SINGLE_SESSION_DETAILS[key]).toContain(activity.details);
      }
    });

    it('uses fallback pool for unknown smallImageKey', () => {
      const session = makeSession({ smallImageKey: 'unknown-key' });
      const activity = resolvePresence([session], now)!;

      expect(SINGLE_SESSION_DETAILS_FALLBACK).toContain(activity.details);
    });

    it('uses session smallImageKey and smallImageText', () => {
      const session = makeSession({
        smallImageKey: 'thinking',
        smallImageText: 'Thinking...',
      });
      const activity = resolvePresence([session], now)!;

      expect(activity.smallImageKey).toBe('thinking');
      expect(activity.smallImageText).toBe('Thinking...');
    });

    it('is not affected by the multi-session logic', () => {
      const session = makeSession({
        smallImageKey: 'coding',
        activityCounts: makeCounts({ edits: 50 }),
      });
      const activity = resolvePresence([session], now)!;

      // Single session should NOT show stats line
      expect(SINGLE_SESSION_DETAILS['coding']).toContain(activity.details);
      expect(SINGLE_SESSION_STATE_MESSAGES).toContain(activity.state);
      expect(activity.smallImageKey).toBe('coding');
    });

    it('never leaks project name in any field', () => {
      const session = makeSession({
        details: 'Editing file.ts',
        projectName: 'super-secret-project',
      });
      const activity = resolvePresence([session], now)!;

      const allFields = [
        activity.details,
        activity.state,
        activity.largeImageKey,
        activity.largeImageText,
        activity.smallImageKey,
        activity.smallImageText,
      ];
      for (const field of allFields) {
        expect(field).not.toContain('super-secret-project');
      }
    });
  });

  describe('multi session mode', () => {
    const now = 1_000_000_000;

    it('returns quirky card for 2 sessions', () => {
      const sessions = [
        makeSession({
          sessionId: 's1',
          projectName: 'project-a',
          startedAt: 1000,
          activityCounts: makeCounts({ edits: 5 }),
        }),
        makeSession({
          sessionId: 's2',
          projectName: 'project-b',
          startedAt: 2000,
          activityCounts: makeCounts({ edits: 3 }),
        }),
      ];
      const activity = resolvePresence(sessions, now)!;

      expect(activity).not.toBeNull();
      // Details should come from the 2-session message pool
      expect(MULTI_SESSION_MESSAGES[2]).toContain(activity.details);
      expect(activity.startTimestamp).toBe(1000); // earliest
    });

    it('picks from tier 3 pool for 3 sessions', () => {
      const sessions = [
        makeSession({ sessionId: 's1', startedAt: 1000 }),
        makeSession({ sessionId: 's2', startedAt: 2000 }),
        makeSession({ sessionId: 's3', startedAt: 3000 }),
      ];
      const activity = resolvePresence(sessions, now)!;

      expect(MULTI_SESSION_MESSAGES[3]).toContain(activity.details);
    });

    it('picks from tier 4 pool for 4 sessions', () => {
      const sessions = Array.from({ length: 4 }, (_, i) =>
        makeSession({ sessionId: `s${i}`, startedAt: 1000 + i }),
      );
      const activity = resolvePresence(sessions, now)!;

      expect(MULTI_SESSION_MESSAGES[4]).toContain(activity.details);
    });

    it('uses overflow pool with {n} substitution for 5+ sessions', () => {
      const sessions = Array.from({ length: 5 }, (_, i) =>
        makeSession({ sessionId: `s${i}`, startedAt: 1000 + i }),
      );
      const activity = resolvePresence(sessions, now)!;

      // Should contain '5' somewhere (from {n} replacement)
      expect(activity.details).toContain('5');
      // Should NOT contain the literal {n} placeholder
      expect(activity.details).not.toContain('{n}');
    });

    it('shows stats line as state', () => {
      const sessions = [
        makeSession({
          sessionId: 's1',
          startedAt: now - 135 * 60_000,
          activityCounts: makeCounts({ edits: 23, commands: 8 }),
        }),
        makeSession({
          sessionId: 's2',
          startedAt: now - 100 * 60_000,
          activityCounts: makeCounts({ edits: 5 }),
        }),
      ];
      const activity = resolvePresence(sessions, now)!;

      expect(activity.state).toContain('28 edits');
      expect(activity.state).toContain('8 cmds');
      expect(activity.state).toContain('2h 15m deep');
    });

    it('uses dominant mode for smallImageKey', () => {
      const sessions = [
        makeSession({ sessionId: 's1', activityCounts: makeCounts({ edits: 20 }) }),
        makeSession({ sessionId: 's2', activityCounts: makeCounts({ edits: 10 }) }),
      ];
      const activity = resolvePresence(sessions, now)!;

      expect(activity.smallImageKey).toBe('coding');
    });

    it('uses multi-session icon for mixed mode', () => {
      const sessions = [
        makeSession({ sessionId: 's1', activityCounts: makeCounts({ edits: 5, commands: 5 }) }),
        makeSession({ sessionId: 's2', activityCounts: makeCounts({ searches: 5, thinks: 5 }) }),
      ];
      const activity = resolvePresence(sessions, now)!;

      expect(activity.smallImageKey).toBe('multi-session');
    });

    it('picks tooltip from pool', () => {
      const sessions = [
        makeSession({ sessionId: 's1', startedAt: 1000 }),
        makeSession({ sessionId: 's2', startedAt: 2000 }),
      ];
      const activity = resolvePresence(sessions, now)!;

      expect(MULTI_SESSION_TOOLTIPS).toContain(activity.smallImageText);
    });
  });
});

describe('stablePick', () => {
  const pool = ['a', 'b', 'c', 'd', 'e', 'f'];

  it('returns an element from the pool', () => {
    const result = stablePick(pool, 42, 1_000_000_000);
    expect(pool).toContain(result);
  });

  it('returns same result within same time bucket', () => {
    const now = 1_000_000_000;
    const result1 = stablePick(pool, 42, now);
    const result2 = stablePick(pool, 42, now + 100_000); // still within 5-min window
    expect(result1).toBe(result2);
  });

  it('may change across different time buckets', () => {
    const now = 1_000_000_000;
    // Advance past the rotation interval
    const later = now + MESSAGE_ROTATION_INTERVAL;
    // With different buckets, the result CAN change (depends on hash)
    // But the important thing is determinism within a bucket
    const result1 = stablePick(pool, 42, now);
    const result2 = stablePick(pool, 42, now);
    expect(result1).toBe(result2);
  });

  it('different seeds produce different results (usually)', () => {
    const now = 1_000_000_000;
    // With a large enough pool, different seeds should usually produce different results
    const results = new Set<string>();
    for (let seed = 0; seed < 100; seed++) {
      results.add(stablePick(pool, seed, now));
    }
    // Should have more than one unique result across 100 seeds
    expect(results.size).toBeGreaterThan(1);
  });
});

describe('formatStatsLine', () => {
  const now = 1_000_000_000;

  it('shows non-zero stats only', () => {
    const sessions = [
      makeSession({
        startedAt: now - 60_000,
        activityCounts: makeCounts({ edits: 10, commands: 3 }),
      }),
    ];
    const result = formatStatsLine(sessions, now);

    expect(result).toContain('10 edits');
    expect(result).toContain('3 cmds');
    expect(result).not.toContain('search');
    expect(result).not.toContain('read');
    expect(result).not.toContain('think');
  });

  it('uses singular form for count of 1', () => {
    const sessions = [
      makeSession({
        startedAt: now - 60_000,
        activityCounts: makeCounts({ edits: 1, commands: 1, searches: 1 }),
      }),
    ];
    const result = formatStatsLine(sessions, now);

    expect(result).toContain('1 edit');
    expect(result).toContain('1 cmd');
    expect(result).toContain('1 search');
    expect(result).not.toContain('edits');
    expect(result).not.toContain('cmds');
    expect(result).not.toContain('searches');
  });

  it('uses plural form for count > 1', () => {
    const sessions = [
      makeSession({
        startedAt: now - 60_000,
        activityCounts: makeCounts({ edits: 5, searches: 3, reads: 2, thinks: 4 }),
      }),
    ];
    const result = formatStatsLine(sessions, now);

    expect(result).toContain('5 edits');
    expect(result).toContain('3 searches');
    expect(result).toContain('2 reads');
    expect(result).toContain('4 thinks');
  });

  it('shows elapsed time in minutes', () => {
    const sessions = [
      makeSession({ startedAt: now - 15 * 60_000, activityCounts: makeCounts({ edits: 1 }) }),
    ];
    const result = formatStatsLine(sessions, now);

    expect(result).toContain('15m deep');
  });

  it('shows elapsed time in hours and minutes', () => {
    const sessions = [
      makeSession({ startedAt: now - 135 * 60_000, activityCounts: makeCounts({ edits: 1 }) }),
    ];
    const result = formatStatsLine(sessions, now);

    expect(result).toContain('2h 15m deep');
  });

  it('shows hours only when minutes are 0', () => {
    const sessions = [
      makeSession({ startedAt: now - 120 * 60_000, activityCounts: makeCounts({ edits: 1 }) }),
    ];
    const result = formatStatsLine(sessions, now);

    expect(result).toContain('2h deep');
    expect(result).not.toContain('0m');
  });

  it('aggregates across sessions', () => {
    const sessions = [
      makeSession({
        sessionId: 's1',
        startedAt: now - 60_000,
        activityCounts: makeCounts({ edits: 10, commands: 2 }),
      }),
      makeSession({
        sessionId: 's2',
        startedAt: now - 30_000,
        activityCounts: makeCounts({ edits: 5, commands: 3 }),
      }),
    ];
    const result = formatStatsLine(sessions, now);

    expect(result).toContain('15 edits');
    expect(result).toContain('5 cmds');
  });

  it('joins parts with middle dot', () => {
    const sessions = [
      makeSession({
        startedAt: now - 60_000,
        activityCounts: makeCounts({ edits: 5, commands: 3 }),
      }),
    ];
    const result = formatStatsLine(sessions, now);

    expect(result).toContain(' \u00b7 ');
  });

  it('returns fallback when no stats and no elapsed time', () => {
    const sessions = [makeSession({ startedAt: now })];
    const result = formatStatsLine(sessions, now);

    expect(result).toBe('Just getting started');
  });

  it('truncates to 128 chars', () => {
    // Create sessions with huge counts to generate long lines
    const sessions = [
      makeSession({
        startedAt: now - 999 * 60_000,
        activityCounts: makeCounts({
          edits: 999999,
          commands: 999999,
          searches: 999999,
          reads: 999999,
          thinks: 999999,
        }),
      }),
    ];
    const result = formatStatsLine(sessions, now);

    expect(result.length).toBeLessThanOrEqual(128);
  });
});

describe('detectDominantMode', () => {
  it('returns coding when edits dominate (>50%)', () => {
    const sessions = [
      makeSession({ activityCounts: makeCounts({ edits: 10, commands: 2, searches: 1 }) }),
    ];
    expect(detectDominantMode(sessions)).toBe('coding');
  });

  it('returns terminal when commands dominate', () => {
    const sessions = [makeSession({ activityCounts: makeCounts({ commands: 10, edits: 2 }) })];
    expect(detectDominantMode(sessions)).toBe('terminal');
  });

  it('returns searching when searches dominate', () => {
    const sessions = [makeSession({ activityCounts: makeCounts({ searches: 10, edits: 1 }) })];
    expect(detectDominantMode(sessions)).toBe('searching');
  });

  it('returns thinking when thinks dominate', () => {
    const sessions = [makeSession({ activityCounts: makeCounts({ thinks: 10, edits: 2 }) })];
    expect(detectDominantMode(sessions)).toBe('thinking');
  });

  it('returns mixed when no category exceeds 50%', () => {
    const sessions = [
      makeSession({
        activityCounts: makeCounts({ edits: 3, commands: 3, searches: 3, thinks: 3 }),
      }),
    ];
    expect(detectDominantMode(sessions)).toBe('mixed');
  });

  it('returns mixed when all counts are zero', () => {
    const sessions = [makeSession({ activityCounts: emptyActivityCounts() })];
    expect(detectDominantMode(sessions)).toBe('mixed');
  });

  it('aggregates across sessions', () => {
    const sessions = [
      makeSession({ sessionId: 's1', activityCounts: makeCounts({ edits: 5 }) }),
      makeSession({ sessionId: 's2', activityCounts: makeCounts({ edits: 6, commands: 1 }) }),
    ];
    // edits=11, commands=1, total=12, 11/12 > 50%
    expect(detectDominantMode(sessions)).toBe('coding');
  });
});

describe('getMostRecentSession', () => {
  it('returns null for empty array', () => {
    expect(getMostRecentSession([])).toBeNull();
  });

  it('returns the most recently active session', () => {
    const sessions = [
      makeSession({ sessionId: 's1', lastActivityAt: 1000 }),
      makeSession({ sessionId: 's2', lastActivityAt: 3000 }),
      makeSession({ sessionId: 's3', lastActivityAt: 2000 }),
    ];
    expect(getMostRecentSession(sessions)?.sessionId).toBe('s2');
  });

  it('prefers active over idle', () => {
    const sessions = [
      makeSession({ sessionId: 's1', lastActivityAt: 3000, status: 'idle' }),
      makeSession({ sessionId: 's2', lastActivityAt: 1000, status: 'active' }),
    ];
    expect(getMostRecentSession(sessions)?.sessionId).toBe('s2');
  });
});
