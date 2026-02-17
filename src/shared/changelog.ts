import { readFileSync, writeFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG_DIR, LAST_SEEN_VERSION_FILE, PENDING_CHANGELOG_FILE } from './constants.js';
import { compareVersions } from './update-checker.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface ChangelogSection {
  version: string;
  date: string;
  content: string;
}

export function parseChangelog(raw: string): ChangelogSection[] {
  const sections: ChangelogSection[] = [];
  // Match both `## [1.0.0](url) (2026-02-16)` and `## 1.0.0 (2026-02-16)` formats
  const heading = /^## \[?(\d+\.\d+\.\d+)\]?(?:\([^)]*\))?\s*\(([^)]+)\)/;
  const lines = raw.split('\n');

  let current: { version: string; date: string; startLine: number } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(heading);
    if (match) {
      if (current) {
        const content = lines.slice(current.startLine, i).join('\n').trim();
        if (content) {
          sections.push({ version: current.version, date: current.date, content });
        }
      }
      current = { version: match[1], date: match[2], startLine: i + 1 };
    }
  }

  if (current) {
    const content = lines.slice(current.startLine).join('\n').trim();
    if (content) {
      sections.push({ version: current.version, date: current.date, content });
    }
  }

  return sections;
}

export function getChangelogSections(since: string, upTo: string): ChangelogSection[] {
  let raw: string;
  try {
    const changelogPath = resolve(__dirname, '..', '..', 'CHANGELOG.md');
    raw = readFileSync(changelogPath, 'utf-8');
  } catch {
    return [];
  }

  const all = parseChangelog(raw);
  return all
    .filter((s) => compareVersions(s.version, since) > 0 && compareVersions(s.version, upTo) <= 0)
    .sort((a, b) => compareVersions(a.version, b.version));
}

export function readLastSeenVersion(): string | null {
  try {
    const v = readFileSync(LAST_SEEN_VERSION_FILE, 'utf-8').trim();
    return v || null;
  } catch {
    return null;
  }
}

export function writeLastSeenVersion(version: string): void {
  try {
    mkdirSync(CONFIG_DIR, { recursive: true });
    writeFileSync(LAST_SEEN_VERSION_FILE, version, 'utf-8');
  } catch {
    // fire-and-forget
  }
}

export function readPendingChangelog(): string | null {
  try {
    const v = readFileSync(PENDING_CHANGELOG_FILE, 'utf-8').trim();
    unlinkSync(PENDING_CHANGELOG_FILE);
    return v || null;
  } catch {
    return null;
  }
}

export function writePendingChangelog(version: string): void {
  try {
    mkdirSync(CONFIG_DIR, { recursive: true });
    writeFileSync(PENDING_CHANGELOG_FILE, version, 'utf-8');
  } catch {
    // fire-and-forget
  }
}

export interface ChangelogState {
  shouldShow: boolean;
  previousVersion: string | null;
  sections: ChangelogSection[];
}

export function checkChangelogState(currentVersion: string): ChangelogState {
  const noShow: ChangelogState = { shouldShow: false, previousVersion: null, sections: [] };

  // Dev mode — skip entirely
  if (currentVersion === '0.0.0-dev') return noShow;

  // Priority 1: pending-changelog marker (written by old binary after `update`)
  const pendingVersion = readPendingChangelog();
  if (pendingVersion) {
    const sections = getChangelogSections(pendingVersion, currentVersion);
    writeLastSeenVersion(currentVersion);
    if (sections.length > 0) {
      return { shouldShow: true, previousVersion: pendingVersion, sections };
    }
    return noShow;
  }

  // Priority 2: compare against last-seen-version (catches manual npm upgrades)
  const lastSeen = readLastSeenVersion();

  // First install — no last-seen-version file
  if (!lastSeen) {
    writeLastSeenVersion(currentVersion);
    return noShow;
  }

  // Same version — nothing to show
  if (compareVersions(lastSeen, currentVersion) >= 0) return noShow;

  // Upgraded version
  const sections = getChangelogSections(lastSeen, currentVersion);
  writeLastSeenVersion(currentVersion);
  if (sections.length > 0) {
    return { shouldShow: true, previousVersion: lastSeen, sections };
  }

  return noShow;
}

export function formatChangelogSection(section: ChangelogSection): string {
  let text = section.content;

  // Strip commit hash links: ([abc1234](url)) → removed
  text = text.replace(/\s*\(\[[a-f0-9]+\]\([^)]+\)\)/g, '');

  // Convert ### headings to plain labels
  text = text.replace(/^### (.+)$/gm, (_match, heading: string) => `${heading}:`);

  // Remove empty lines that result from stripping
  text = text.replace(/\n{3,}/g, '\n\n');

  return text.trim();
}
