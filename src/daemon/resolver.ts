import type { Session, DiscordActivity, ActivityCounts, ResolveOptions } from '../shared/types.js';
import type { MessagePreset } from '../presets/types.js';
import {
  LARGE_IMAGE_KEY,
  LARGE_IMAGE_TEXT,
  MESSAGE_ROTATION_INTERVAL,
} from '../shared/constants.js';

const MAX_FIELD_LENGTH = 128;
const MIN_FIELD_LENGTH = 2;

export function resolvePresence(
  sessions: Session[],
  preset: MessagePreset,
  now: number = Date.now(),
  options: ResolveOptions = {},
): DiscordActivity | null {
  if (sessions.length === 0) return null;

  if (options.showDetails) {
    return buildDetailedActivity(sessions, preset, now);
  }

  if (sessions.length === 1) {
    return buildSingleSessionActivity(sessions[0], preset, now);
  }

  return buildMultiSessionActivity(sessions, preset, now);
}

/**
 * Detailed mode: the specific action ("Editing hook.ts") on the top line, and
 * project / session / file / agent counts on the second line.
 */
function buildDetailedActivity(
  sessions: Session[],
  preset: MessagePreset,
  now: number,
): DiscordActivity {
  const count = sessions.length;
  const current = getMostRecentSession(sessions)!;
  const earliest = sessions.reduce((a, b) => (a.startedAt < b.startedAt ? a : b));

  // Top line: the live action, falling back to the preset's pool between tool calls.
  // Not gated on status: on Windows sessions read as idle once the hook's shell exits,
  // and Stop/Notification already clear actionDetail.
  let details = current.actionDetail;
  if (!details) {
    const pool =
      preset.singleSessionDetails[current.smallImageKey] ?? preset.singleSessionDetailsFallback;
    details = stablePick(pool, current.startedAt, now);
  }
  if (count > 1) details = `${details} · ${current.projectName}`;

  const filesEdited = sessions.reduce((n, s) => n + (s.editedFiles?.length ?? 0), 0);
  const activeAgents = sessions.reduce((n, s) => n + (s.activeAgents ?? 0), 0);
  const totalAgents = sessions.reduce((n, s) => n + (s.totalAgents ?? 0), 0);

  const parts: string[] = [];
  parts.push(count === 1 ? current.projectName : `${count} sessions`);
  if (filesEdited > 0) parts.push(plural(filesEdited, 'file', 'files') + ' edited');
  if (activeAgents > 0) {
    parts.push(plural(activeAgents, 'agent', 'agents') + ' running');
  } else if (totalAgents > 0) {
    parts.push(plural(totalAgents, 'agent', 'agents') + ' used');
  }
  const state = parts.join(' · ');

  const hoverParts = [LARGE_IMAGE_TEXT, plural(count, 'session', 'sessions')];
  if (totalAgents > 0) hoverParts.push(plural(totalAgents, 'agent', 'agents') + ' spawned');
  const hover = hoverParts.join(' · ');

  return {
    details: sanitizeField(details) ?? 'Working',
    state: sanitizeField(state) ?? 'Working',
    largeImageKey: LARGE_IMAGE_KEY,
    largeImageText: sanitizeField(hover) ?? LARGE_IMAGE_TEXT,
    smallImageKey: current.smallImageKey,
    smallImageText: sanitizeField(current.smallImageText),
    startTimestamp: earliest.startedAt,
  };
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function buildSingleSessionActivity(
  session: Session,
  preset: MessagePreset,
  now: number,
): DiscordActivity {
  const pool =
    preset.singleSessionDetails[session.smallImageKey] ?? preset.singleSessionDetailsFallback;
  const details = stablePick(pool, session.startedAt, now);

  const state = stablePick(preset.singleSessionStateMessages, session.startedAt + 1, now);

  return {
    details,
    state,
    largeImageKey: LARGE_IMAGE_KEY,
    largeImageText: LARGE_IMAGE_TEXT,
    smallImageKey: session.smallImageKey,
    smallImageText: sanitizeField(session.smallImageText),
    startTimestamp: session.startedAt,
  };
}

function buildMultiSessionActivity(
  sessions: Session[],
  preset: MessagePreset,
  now: number,
): DiscordActivity {
  const count = sessions.length;
  const earliest = sessions.reduce((a, b) => (a.startedAt < b.startedAt ? a : b));
  const seed = earliest.startedAt;

  // Pick details from tier-appropriate message pool
  const pool = preset.multiSessionMessages[count] ?? preset.multiSessionMessagesOverflow;
  let details = stablePick(pool, seed, now);
  if (count > 4) {
    details = details.replace(/\{n\}/g, String(count));
  }

  const state = formatStatsLine(sessions, now);
  const mostRecent = getMostRecentSession(sessions)!;
  const smallImageKey = mostRecent.smallImageKey;
  const smallImageText = stablePick(preset.multiSessionTooltips, seed + 1, now);

  return {
    details,
    state,
    largeImageKey: LARGE_IMAGE_KEY,
    largeImageText: LARGE_IMAGE_TEXT,
    smallImageKey,
    smallImageText: sanitizeField(smallImageText),
    startTimestamp: earliest.startedAt,
  };
}

export function stablePick(pool: string[], seed: number, now: number): string {
  const bucket = Math.floor(now / MESSAGE_ROTATION_INTERVAL);
  const index = ((bucket * 2654435761 + seed) >>> 0) % pool.length;
  return pool[index];
}

export function formatStatsLine(sessions: Session[], now: number): string {
  const totals: ActivityCounts = { edits: 0, commands: 0, searches: 0, reads: 0, thinks: 0 };

  for (const session of sessions) {
    totals.edits += session.activityCounts.edits;
    totals.commands += session.activityCounts.commands;
    totals.searches += session.activityCounts.searches;
    totals.reads += session.activityCounts.reads;
    totals.thinks += session.activityCounts.thinks;
  }

  const parts: string[] = [];
  if (totals.edits > 0) parts.push(`${totals.edits} ${totals.edits === 1 ? 'edit' : 'edits'}`);
  if (totals.commands > 0)
    parts.push(`${totals.commands} ${totals.commands === 1 ? 'cmd' : 'cmds'}`);
  if (totals.searches > 0)
    parts.push(`${totals.searches} ${totals.searches === 1 ? 'search' : 'searches'}`);
  if (totals.reads > 0) parts.push(`${totals.reads} ${totals.reads === 1 ? 'read' : 'reads'}`);
  if (totals.thinks > 0) parts.push(`${totals.thinks} ${totals.thinks === 1 ? 'think' : 'thinks'}`);

  // Append elapsed time from earliest session
  const earliest = sessions.reduce((a, b) => (a.startedAt < b.startedAt ? a : b));
  const elapsedMs = now - earliest.startedAt;
  const elapsedMin = Math.floor(elapsedMs / 60_000);
  if (elapsedMin >= 60) {
    const h = Math.floor(elapsedMin / 60);
    const m = elapsedMin % 60;
    parts.push(m > 0 ? `${h}h ${m}m deep` : `${h}h deep`);
  } else if (elapsedMin > 0) {
    parts.push(`${elapsedMin}m deep`);
  }

  const joined = parts.join(' \u00b7 ');
  if (joined.length === 0) return 'Just getting started';
  if (joined.length > MAX_FIELD_LENGTH) return joined.slice(0, MAX_FIELD_LENGTH - 1) + '\u2026';
  return joined;
}

export function detectDominantMode(
  sessions: Session[],
): 'coding' | 'terminal' | 'searching' | 'thinking' | 'mixed' {
  const totals = { coding: 0, terminal: 0, searching: 0, thinking: 0 };

  for (const session of sessions) {
    totals.coding += session.activityCounts.edits;
    totals.terminal += session.activityCounts.commands;
    totals.searching += session.activityCounts.searches;
    totals.thinking += session.activityCounts.thinks;
  }

  const total = totals.coding + totals.terminal + totals.searching + totals.thinking;
  if (total === 0) return 'mixed';

  const entries = Object.entries(totals) as [keyof typeof totals, number][];
  const [topMode, topCount] = entries.reduce((a, b) => (b[1] > a[1] ? b : a));

  return topCount / total > 0.5 ? topMode : 'mixed';
}

export function getMostRecentSession(sessions: Session[]): Session | null {
  if (sessions.length === 0) return null;

  // Prefer active over idle, then most recent activity
  return sessions.reduce((best, current) => {
    if (best.status === 'active' && current.status === 'idle') return best;
    if (best.status === 'idle' && current.status === 'active') return current;
    return current.lastActivityAt > best.lastActivityAt ? current : best;
  });
}

function sanitizeField(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const truncated =
    value.length > MAX_FIELD_LENGTH ? value.slice(0, MAX_FIELD_LENGTH - 1) + '\u2026' : value;
  if (truncated.length < MIN_FIELD_LENGTH) return undefined;
  return truncated;
}
