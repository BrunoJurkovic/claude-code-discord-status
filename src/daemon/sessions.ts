import { basename } from 'node:path';
import type { Session, SessionStartRequest, SessionActivityRequest, ActivityCounts } from '../shared/types.js';
import { emptyActivityCounts } from '../shared/types.js';
import { MCP_PRIORITY_WINDOW } from '../shared/constants.js';

const COUNTER_MAP: Record<string, keyof ActivityCounts> = {
  coding: 'edits',
  terminal: 'commands',
  searching: 'searches',
  reading: 'reads',
  thinking: 'thinks',
};

export class SessionRegistry {
  private sessions = new Map<string, Session>();
  private onChangeCallback: (() => void) | null = null;

  onChange(callback: () => void): void {
    this.onChangeCallback = callback;
  }

  private notifyChange(): void {
    this.onChangeCallback?.();
  }

  startSession(sessionId: string, request: SessionStartRequest): Session {
    const now = Date.now();
    const session: Session = {
      sessionId,
      pid: request.pid,
      projectPath: request.projectPath,
      projectName: basename(request.projectPath),
      details: 'Starting session...',
      smallImageKey: 'starting',
      smallImageText: 'Starting up',
      startedAt: now,
      lastActivityAt: now,
      lastMcpUpdateAt: 0,
      status: 'active',
      activityCounts: emptyActivityCounts(),
    };
    this.sessions.set(sessionId, session);
    this.notifyChange();
    return session;
  }

  updateActivity(sessionId: string, request: SessionActivityRequest): Session | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    const now = Date.now();

    // MCP priority window: suppress hook updates within 30s of an MCP update
    if (request.priority === 'hook' && this.isInMcpWindow(session, now)) {
      return session;
    }

    if (request.details !== undefined) {
      session.details = request.details ?? session.details;
    }
    if (request.smallImageKey !== undefined) {
      session.smallImageKey = request.smallImageKey;
    }
    if (request.smallImageText !== undefined) {
      session.smallImageText = request.smallImageText;
    }
    if (request.priority === 'mcp') {
      session.lastMcpUpdateAt = now;
    }

    const counterKey = COUNTER_MAP[session.smallImageKey];
    if (counterKey) {
      session.activityCounts[counterKey]++;
    }

    session.lastActivityAt = now;
    session.status = 'active';

    this.notifyChange();
    return session;
  }

  endSession(sessionId: string): boolean {
    const existed = this.sessions.delete(sessionId);
    if (existed) {
      this.notifyChange();
    }
    return existed;
  }

  getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  getAllSessions(): Session[] {
    return Array.from(this.sessions.values());
  }

  getSessionCount(): number {
    return this.sessions.size;
  }

  isInMcpWindow(session: Session, now?: number): boolean {
    const currentTime = now ?? Date.now();
    return session.lastMcpUpdateAt > 0 && currentTime - session.lastMcpUpdateAt < MCP_PRIORITY_WINDOW;
  }

  checkStaleSessions(idleTimeout: number, removeTimeout: number): void {
    const now = Date.now();
    let changed = false;

    for (const [id, session] of this.sessions) {
      // Check PID liveness
      if (!this.isPidAlive(session.pid)) {
        this.sessions.delete(id);
        changed = true;
        continue;
      }

      // Check activity timeout
      const elapsed = now - session.lastActivityAt;

      if (elapsed >= removeTimeout) {
        this.sessions.delete(id);
        changed = true;
      } else if (elapsed >= idleTimeout && session.status !== 'idle') {
        session.status = 'idle';
        changed = true;
      }
    }

    if (changed) {
      this.notifyChange();
    }
  }

  private isPidAlive(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  findSessionByProjectPath(projectPath: string): Session | undefined {
    for (const session of this.sessions.values()) {
      if (session.projectPath === projectPath) {
        return session;
      }
    }
    return undefined;
  }
}
