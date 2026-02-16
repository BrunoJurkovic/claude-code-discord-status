export type SessionStatus = 'active' | 'idle';

export type UpdatePriority = 'hook' | 'mcp';

export interface ActivityCounts {
  edits: number;
  commands: number;
  searches: number;
  reads: number;
  thinks: number;
}

export function emptyActivityCounts(): ActivityCounts {
  return { edits: 0, commands: 0, searches: 0, reads: 0, thinks: 0 };
}

export interface Session {
  sessionId: string;
  pid: number;
  projectPath: string;
  projectName: string;
  details: string;
  smallImageKey: string;
  smallImageText: string;
  startedAt: number;
  lastActivityAt: number;
  lastMcpUpdateAt: number;
  status: SessionStatus;
  activityCounts: ActivityCounts;
}

export interface SessionStartRequest {
  pid: number;
  projectPath: string;
}

export interface SessionActivityRequest {
  details?: string | null;
  smallImageKey?: string;
  smallImageText?: string;
  priority?: UpdatePriority;
}

export interface DiscordActivity {
  details: string;
  state: string;
  largeImageKey: string;
  largeImageText: string;
  smallImageKey?: string;
  smallImageText?: string;
  startTimestamp: number;
}

export interface AppConfig {
  discordClientId: string;
  daemonPort: number;
  staleCheckInterval: number;
  idleTimeout: number;
  removeTimeout: number;
}

export interface HealthResponse {
  connected: boolean;
  sessions: number;
  uptime: number;
}
