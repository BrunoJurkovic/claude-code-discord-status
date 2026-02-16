import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SessionRegistry } from '../../src/daemon/sessions.js';

describe('SessionRegistry', () => {
  let registry: SessionRegistry;

  beforeEach(() => {
    registry = new SessionRegistry();
  });

  describe('startSession', () => {
    it('creates a new session', () => {
      const session = registry.startSession('s1', {
        pid: process.pid,
        projectPath: '/home/user/my-project',
      });

      expect(session.sessionId).toBe('s1');
      expect(session.projectName).toBe('my-project');
      expect(session.pid).toBe(process.pid);
      expect(session.status).toBe('active');
      expect(session.details).toBe('Starting session...');
    });

    it('triggers onChange callback', () => {
      const onChange = vi.fn();
      registry.onChange(onChange);

      registry.startSession('s1', { pid: process.pid, projectPath: '/tmp/project' });

      expect(onChange).toHaveBeenCalledTimes(1);
    });
  });

  describe('updateActivity', () => {
    it('updates session details', () => {
      registry.startSession('s1', { pid: process.pid, projectPath: '/tmp/project' });

      const updated = registry.updateActivity('s1', {
        details: 'Editing file.ts',
        smallImageKey: 'coding',
        smallImageText: 'Writing code',
        priority: 'hook',
      });

      expect(updated?.details).toBe('Editing file.ts');
      expect(updated?.smallImageKey).toBe('coding');
    });

    it('returns null for unknown session', () => {
      const result = registry.updateActivity('nonexistent', { details: 'test' });
      expect(result).toBeNull();
    });

    it('marks session as active on update', () => {
      const session = registry.startSession('s1', {
        pid: process.pid,
        projectPath: '/tmp/project',
      });
      // Manually set idle for testing
      Object.assign(session, { status: 'idle' });

      registry.updateActivity('s1', { details: 'Working', priority: 'hook' });

      expect(registry.getSession('s1')?.status).toBe('active');
    });

    it('triggers onChange callback', () => {
      registry.startSession('s1', { pid: process.pid, projectPath: '/tmp/project' });

      const onChange = vi.fn();
      registry.onChange(onChange);

      registry.updateActivity('s1', { details: 'test', priority: 'hook' });

      expect(onChange).toHaveBeenCalledTimes(1);
    });
  });

  describe('MCP priority window', () => {
    it('suppresses hook updates within 30s of MCP update', () => {
      registry.startSession('s1', { pid: process.pid, projectPath: '/tmp/project' });

      // MCP update
      registry.updateActivity('s1', {
        details: 'MCP status',
        priority: 'mcp',
      });

      // Hook update should be suppressed
      const result = registry.updateActivity('s1', {
        details: 'Hook status',
        priority: 'hook',
      });

      expect(result?.details).toBe('MCP status');
    });

    it('allows hook updates after MCP window expires', () => {
      registry.startSession('s1', { pid: process.pid, projectPath: '/tmp/project' });

      // MCP update with old timestamp
      const session = registry.getSession('s1')!;
      session.lastMcpUpdateAt = Date.now() - 31_000; // 31 seconds ago

      const result = registry.updateActivity('s1', {
        details: 'Hook status',
        priority: 'hook',
      });

      expect(result?.details).toBe('Hook status');
    });

    it('always allows MCP updates', () => {
      registry.startSession('s1', { pid: process.pid, projectPath: '/tmp/project' });

      registry.updateActivity('s1', { details: 'First MCP', priority: 'mcp' });
      registry.updateActivity('s1', { details: 'Second MCP', priority: 'mcp' });

      expect(registry.getSession('s1')?.details).toBe('Second MCP');
    });
  });

  describe('endSession', () => {
    it('removes the session', () => {
      registry.startSession('s1', { pid: process.pid, projectPath: '/tmp/project' });

      const result = registry.endSession('s1');

      expect(result).toBe(true);
      expect(registry.getSession('s1')).toBeUndefined();
      expect(registry.getSessionCount()).toBe(0);
    });

    it('returns false for unknown session', () => {
      expect(registry.endSession('nonexistent')).toBe(false);
    });

    it('triggers onChange callback', () => {
      registry.startSession('s1', { pid: process.pid, projectPath: '/tmp/project' });

      const onChange = vi.fn();
      registry.onChange(onChange);

      registry.endSession('s1');

      expect(onChange).toHaveBeenCalledTimes(1);
    });
  });

  describe('getAllSessions', () => {
    it('returns all sessions', () => {
      registry.startSession('s1', { pid: process.pid, projectPath: '/tmp/a' });
      registry.startSession('s2', { pid: process.pid, projectPath: '/tmp/b' });

      const sessions = registry.getAllSessions();
      expect(sessions).toHaveLength(2);
    });
  });

  describe('checkStaleSessions', () => {
    it('removes sessions with dead PIDs', () => {
      // Use a PID that definitely doesn't exist
      registry.startSession('s1', { pid: 999999, projectPath: '/tmp/project' });

      registry.checkStaleSessions(600_000, 1_800_000);

      expect(registry.getSessionCount()).toBe(0);
    });

    it('marks sessions idle after idleTimeout', () => {
      registry.startSession('s1', { pid: process.pid, projectPath: '/tmp/project' });

      // Manually set lastActivityAt to past
      const session = registry.getSession('s1')!;
      session.lastActivityAt = Date.now() - 700_000; // 11+ minutes ago

      registry.checkStaleSessions(600_000, 1_800_000);

      expect(registry.getSession('s1')?.status).toBe('idle');
    });

    it('removes sessions after removeTimeout', () => {
      registry.startSession('s1', { pid: process.pid, projectPath: '/tmp/project' });

      const session = registry.getSession('s1')!;
      session.lastActivityAt = Date.now() - 2_000_000; // 33+ minutes ago

      registry.checkStaleSessions(600_000, 1_800_000);

      expect(registry.getSessionCount()).toBe(0);
    });

    it('triggers onChange when sessions are cleaned up', () => {
      registry.startSession('s1', { pid: 999999, projectPath: '/tmp/project' });

      const onChange = vi.fn();
      registry.onChange(onChange);

      registry.checkStaleSessions(600_000, 1_800_000);

      expect(onChange).toHaveBeenCalledTimes(1);
    });
  });

  describe('activity counters', () => {
    it('initializes counters at zero', () => {
      const session = registry.startSession('s1', {
        pid: process.pid,
        projectPath: '/tmp/project',
      });

      expect(session.activityCounts).toEqual({
        edits: 0,
        commands: 0,
        searches: 0,
        reads: 0,
        thinks: 0,
      });
    });

    it('increments edits for coding smallImageKey', () => {
      registry.startSession('s1', { pid: process.pid, projectPath: '/tmp/project' });

      registry.updateActivity('s1', { smallImageKey: 'coding', priority: 'hook' });
      registry.updateActivity('s1', { smallImageKey: 'coding', priority: 'hook' });

      expect(registry.getSession('s1')?.activityCounts.edits).toBe(2);
    });

    it('increments commands for terminal smallImageKey', () => {
      registry.startSession('s1', { pid: process.pid, projectPath: '/tmp/project' });

      registry.updateActivity('s1', { smallImageKey: 'terminal', priority: 'hook' });

      expect(registry.getSession('s1')?.activityCounts.commands).toBe(1);
    });

    it('increments searches for searching smallImageKey', () => {
      registry.startSession('s1', { pid: process.pid, projectPath: '/tmp/project' });

      registry.updateActivity('s1', { smallImageKey: 'searching', priority: 'hook' });

      expect(registry.getSession('s1')?.activityCounts.searches).toBe(1);
    });

    it('increments reads for reading smallImageKey', () => {
      registry.startSession('s1', { pid: process.pid, projectPath: '/tmp/project' });

      registry.updateActivity('s1', { smallImageKey: 'reading', priority: 'hook' });

      expect(registry.getSession('s1')?.activityCounts.reads).toBe(1);
    });

    it('increments thinks for thinking smallImageKey', () => {
      registry.startSession('s1', { pid: process.pid, projectPath: '/tmp/project' });

      registry.updateActivity('s1', { smallImageKey: 'thinking', priority: 'hook' });

      expect(registry.getSession('s1')?.activityCounts.thinks).toBe(1);
    });

    it('does not increment for starting smallImageKey', () => {
      registry.startSession('s1', { pid: process.pid, projectPath: '/tmp/project' });

      registry.updateActivity('s1', { smallImageKey: 'starting', priority: 'hook' });

      const counts = registry.getSession('s1')?.activityCounts;
      expect(counts?.edits).toBe(0);
      expect(counts?.commands).toBe(0);
      expect(counts?.searches).toBe(0);
      expect(counts?.reads).toBe(0);
      expect(counts?.thinks).toBe(0);
    });

    it('does not increment for idle smallImageKey', () => {
      registry.startSession('s1', { pid: process.pid, projectPath: '/tmp/project' });

      registry.updateActivity('s1', { smallImageKey: 'idle', priority: 'hook' });

      const counts = registry.getSession('s1')?.activityCounts;
      expect(counts?.edits).toBe(0);
      expect(counts?.commands).toBe(0);
      expect(counts?.searches).toBe(0);
      expect(counts?.reads).toBe(0);
      expect(counts?.thinks).toBe(0);
    });

    it('does not increment when MCP-suppressed', () => {
      registry.startSession('s1', { pid: process.pid, projectPath: '/tmp/project' });

      // MCP update first
      registry.updateActivity('s1', {
        smallImageKey: 'coding',
        priority: 'mcp',
      });

      // Hook update suppressed by MCP window
      registry.updateActivity('s1', {
        smallImageKey: 'terminal',
        priority: 'hook',
      });

      const counts = registry.getSession('s1')?.activityCounts;
      expect(counts?.edits).toBe(1); // from the MCP update
      expect(counts?.commands).toBe(0); // suppressed hook
    });

    it('accumulates across multiple updates', () => {
      registry.startSession('s1', { pid: process.pid, projectPath: '/tmp/project' });

      registry.updateActivity('s1', { smallImageKey: 'coding', priority: 'hook' });
      registry.updateActivity('s1', { smallImageKey: 'coding', priority: 'hook' });
      registry.updateActivity('s1', { smallImageKey: 'terminal', priority: 'hook' });
      registry.updateActivity('s1', { smallImageKey: 'searching', priority: 'hook' });
      registry.updateActivity('s1', { smallImageKey: 'reading', priority: 'hook' });
      registry.updateActivity('s1', { smallImageKey: 'thinking', priority: 'hook' });
      registry.updateActivity('s1', { smallImageKey: 'coding', priority: 'hook' });

      const counts = registry.getSession('s1')?.activityCounts;
      expect(counts?.edits).toBe(3);
      expect(counts?.commands).toBe(1);
      expect(counts?.searches).toBe(1);
      expect(counts?.reads).toBe(1);
      expect(counts?.thinks).toBe(1);
    });
  });

  describe('findSessionByProjectPath', () => {
    it('finds a session by project path', () => {
      registry.startSession('s1', { pid: process.pid, projectPath: '/tmp/my-project' });

      const found = registry.findSessionByProjectPath('/tmp/my-project');
      expect(found?.sessionId).toBe('s1');
    });

    it('returns undefined for unknown path', () => {
      expect(registry.findSessionByProjectPath('/unknown')).toBeUndefined();
    });
  });
});
