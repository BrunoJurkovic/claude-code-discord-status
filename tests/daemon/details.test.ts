import { describe, it, expect } from 'vitest';
import { SessionRegistry } from '../../src/daemon/sessions.js';
import { resolvePresence } from '../../src/daemon/resolver.js';
import { professionalPreset } from '../../src/presets/professional.js';

const detailed = { showDetails: true };

function startRegistry(): SessionRegistry {
  const registry = new SessionRegistry('linux');
  registry.startSession('s1', { pid: process.pid, projectPath: '/home/user/my-app' });
  return registry;
}

describe('detailed session tracking', () => {
  it('tracks unique edited files', () => {
    const registry = startRegistry();
    for (const filePath of ['/a/x.ts', '/a/y.ts', '/a/x.ts']) {
      registry.updateActivity('s1', { smallImageKey: 'coding', filePath });
    }
    expect(registry.getSession('s1')?.editedFiles).toEqual(['/a/x.ts', '/a/y.ts']);
  });

  it('does not count read files as edited', () => {
    const registry = startRegistry();
    registry.updateActivity('s1', { smallImageKey: 'reading', filePath: '/a/x.ts' });
    expect(registry.getSession('s1')?.editedFiles).toEqual([]);
  });

  it('counts running and total agents', () => {
    const registry = startRegistry();
    registry.updateActivity('s1', { smallImageKey: 'thinking', agentEvent: 'start' });
    registry.updateActivity('s1', { smallImageKey: 'thinking', agentEvent: 'start' });
    registry.updateActivity('s1', { agentEvent: 'stop' });
    const session = registry.getSession('s1')!;
    expect(session.activeAgents).toBe(1);
    expect(session.totalAgents).toBe(2);
    // The stop event is bookkeeping and must not inflate the thinking counter
    expect(session.activityCounts.thinks).toBe(2);
  });

  it('never lets running agents go negative', () => {
    const registry = startRegistry();
    registry.updateActivity('s1', { agentEvent: 'stop' });
    expect(registry.getSession('s1')?.activeAgents).toBe(0);
  });

  it('clears running agents when the session goes idle', () => {
    const registry = startRegistry();
    registry.updateActivity('s1', { agentEvent: 'start' });
    registry.getSession('s1')!.lastActivityAt = Date.now() - 20_000;
    registry.checkStaleSessions(10_000, 60_000);
    expect(registry.getSession('s1')?.activeAgents).toBe(0);
  });
});

describe('resolvePresence with showDetails', () => {
  it('shows the specific action and project for one session', () => {
    const registry = startRegistry();
    registry.updateActivity('s1', {
      smallImageKey: 'coding',
      actionDetail: 'Editing hook.ts',
      filePath: '/home/user/my-app/hook.ts',
    });
    const activity = resolvePresence(
      registry.getAllSessions(),
      professionalPreset,
      Date.now(),
      detailed,
    )!;
    expect(activity.details).toBe('Editing hook.ts');
    expect(activity.state).toBe('my-app · 1 file edited');
    expect(activity.largeImageText).toBe('Claude Code · 1 session');
  });

  it('shows running agents, then total agents once they finish', () => {
    const registry = startRegistry();
    registry.updateActivity('s1', {
      smallImageKey: 'thinking',
      actionDetail: 'Running Explore agent',
      agentEvent: 'start',
    });
    registry.updateActivity('s1', { agentEvent: 'start' });
    let activity = resolvePresence(
      registry.getAllSessions(),
      professionalPreset,
      Date.now(),
      detailed,
    )!;
    expect(activity.state).toBe('my-app · 2 agents running');
    expect(activity.largeImageText).toBe('Claude Code · 1 session · 2 agents spawned');

    registry.updateActivity('s1', { agentEvent: 'stop' });
    registry.updateActivity('s1', { agentEvent: 'stop' });
    activity = resolvePresence(
      registry.getAllSessions(),
      professionalPreset,
      Date.now(),
      detailed,
    )!;
    expect(activity.state).toBe('my-app · 2 agents used');
  });

  it('falls back to the preset pool when there is no live action', () => {
    const registry = startRegistry();
    registry.updateActivity('s1', { smallImageKey: 'idle', actionDetail: null });
    const activity = resolvePresence(
      registry.getAllSessions(),
      professionalPreset,
      Date.now(),
      detailed,
    )!;
    expect(professionalPreset.singleSessionDetails.idle).toContain(activity.details);
  });

  it('shows session count and the latest project across sessions', () => {
    const registry = startRegistry();
    registry.startSession('s2', { pid: process.pid, projectPath: '/home/user/api' });
    registry.updateActivity('s1', { smallImageKey: 'coding', filePath: '/a.ts' });
    registry.updateActivity('s2', { smallImageKey: 'coding', filePath: '/b.ts' });
    registry.updateActivity('s2', { actionDetail: 'Running npm test', smallImageKey: 'terminal' });
    // s1 last acted earlier, so s2 is the most recent session
    registry.getSession('s1')!.lastActivityAt = Date.now() - 1000;
    const activity = resolvePresence(
      registry.getAllSessions(),
      professionalPreset,
      Date.now(),
      detailed,
    )!;
    expect(activity.details).toBe('Running npm test · api');
    expect(activity.state).toBe('2 sessions · 2 files edited');
  });

  it('keeps the original behaviour when showDetails is off', () => {
    const registry = startRegistry();
    registry.updateActivity('s1', { smallImageKey: 'coding', actionDetail: 'Editing secret.ts' });
    const activity = resolvePresence(registry.getAllSessions(), professionalPreset, Date.now())!;
    expect(activity.details).not.toContain('secret.ts');
    expect(professionalPreset.singleSessionDetails.coding).toContain(activity.details);
  });
});
