import type { Session, DiscordActivity, ActivityCounts } from '../shared/types.js';
import {
  LARGE_IMAGE_KEY,
  LARGE_IMAGE_TEXT,
  MESSAGE_ROTATION_INTERVAL,
  MULTI_SESSION_MESSAGES,
  MULTI_SESSION_MESSAGES_OVERFLOW,
  MULTI_SESSION_TOOLTIPS,
} from '../shared/constants.js';

const MAX_FIELD_LENGTH = 128;
const MIN_FIELD_LENGTH = 2;

export function resolvePresence(sessions: Session[], now: number = Date.now()): DiscordActivity | null {
  if (sessions.length === 0) return null;

  if (sessions.length === 1) {
    return buildSingleSessionActivity(sessions[0]);
  }

  return buildMultiSessionActivity(sessions, now);
}

function buildSingleSessionActivity(session: Session): DiscordActivity {
  const details = sanitizeField(session.details) ?? 'Using Claude Code';
  const state = sanitizeField(`Working on ${session.projectName}`) ?? 'Working';

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

function buildMultiSessionActivity(sessions: Session[], now: number): DiscordActivity {
  const count = sessions.length;
  const earliest = sessions.reduce((a, b) => (a.startedAt < b.startedAt ? a : b));
  const seed = earliest.startedAt;

  // Pick details from tier-appropriate message pool
  const pool = MULTI_SESSION_MESSAGES[count] ?? MULTI_SESSION_MESSAGES_OVERFLOW;
  let details = stablePick(pool, seed, now);
  if (count > 4) {
    details = details.replace(/\{n\}/g, String(count));
  }

  const state = formatStatsLine(sessions, now);
  const dominantMode = detectDominantMode(sessions);
  const smallImageKey = dominantMode === 'mixed' ? 'multi-session' : dominantMode;
  const smallImageText = stablePick(MULTI_SESSION_TOOLTIPS, seed + 1, now);

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
  if (totals.commands > 0) parts.push(`${totals.commands} ${totals.commands === 1 ? 'cmd' : 'cmds'}`);
  if (totals.searches > 0) parts.push(`${totals.searches} ${totals.searches === 1 ? 'search' : 'searches'}`);
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

export function detectDominantMode(sessions: Session[]): 'coding' | 'terminal' | 'searching' | 'thinking' | 'mixed' {
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

export function formatProjectList(sessions: Session[]): string {
  // Count occurrences of each project name
  const counts = new Map<string, number>();
  for (const session of sessions) {
    counts.set(session.projectName, (counts.get(session.projectName) ?? 0) + 1);
  }

  // Build deduplicated list with counts
  const names: string[] = [];
  for (const [name, count] of counts) {
    names.push(count > 1 ? `${name} (\u00d7${count})` : name);
  }

  // Join and truncate
  const joined = names.join(' \u00b7 ');
  if (joined.length <= MAX_FIELD_LENGTH) {
    return sanitizeField(joined) ?? 'Multiple projects';
  }

  // Truncate: add names one by one until we exceed the limit
  let result = '';
  let included = 0;
  for (const name of names) {
    const separator = included > 0 ? ' \u00b7 ' : '';
    const remaining = names.length - included - 1;
    const suffix = remaining > 0 ? ` \u2026 +${remaining} more` : '';
    const candidate = result + separator + name;

    if (candidate.length + suffix.length > MAX_FIELD_LENGTH) {
      const leftover = names.length - included;
      result = result + ` \u2026 +${leftover} more`;
      break;
    }

    result = candidate;
    included++;
  }

  return sanitizeField(result) ?? 'Multiple projects';
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
  const truncated = value.length > MAX_FIELD_LENGTH ? value.slice(0, MAX_FIELD_LENGTH - 1) + '\u2026' : value;
  if (truncated.length < MIN_FIELD_LENGTH) return undefined;
  return truncated;
}
