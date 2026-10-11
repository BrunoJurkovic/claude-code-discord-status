export type SessionStatus = 'active' | 'idle';

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
  status: SessionStatus;
  activityCounts: ActivityCounts;
  /** Specific current action, e.g. "Editing hook.ts" — null when between tool calls */
  actionDetail: string | null;
  /** Unique file paths edited this session */
  editedFiles: string[];
  /** Subagents currently running */
  activeAgents: number;
  /** Subagents spawned this session */
  totalAgents: number;
}

export interface SessionStartRequest {
  pid: number;
  projectPath: string;
}

export type AgentEvent = 'start' | 'stop';

export interface SessionActivityRequest {
  details?: string | null;
  smallImageKey?: string;
  smallImageText?: string;
  actionDetail?: string | null;
  filePath?: string;
  agentEvent?: AgentEvent;
}

export interface ResolveOptions {
  /** Show file names, commands and agent/file counts instead of generic preset messages */
  showDetails?: boolean;
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
  updateCheck: boolean;
  preset: string;
  showDetails: boolean;
}

export interface HealthResponse {
  connected: boolean;
  sessions: number;
  uptime: number;
  version: string;
  latestVersion?: string;
  updateAvailable?: boolean;
}

export interface UpdateCheckResult {
  latestVersion: string;
  currentVersion: string;
  updateAvailable: boolean;
  checkedAt: number;
}
