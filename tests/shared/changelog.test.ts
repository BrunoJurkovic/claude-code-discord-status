import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, writeFileSync, unlinkSync, mkdirSync } from 'node:fs';

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  unlinkSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

const SAMPLE_CHANGELOG = `# Changelog

## 1.2.0 (2026-02-20)

### Features

* add changelog display after updating ([abc1234](https://github.com/example/commit/abc1234))
* support multi-version changelog ranges ([def5678](https://github.com/example/commit/def5678))

### Bug Fixes

* fix edge case in version comparison ([ghi9012](https://github.com/example/commit/ghi9012))

## 1.1.0 (2026-02-18)

### Features

* add update management system ([4e4512d](https://github.com/example/commit/4e4512d))

## 1.0.0 (2026-02-16)

### Features

* initial release ([aaa1111](https://github.com/example/commit/aaa1111))

### Bug Fixes

* fix formatting ([bbb2222](https://github.com/example/commit/bbb2222))
`;

const LINKED_VERSION_CHANGELOG = `# Changelog

## [1.1.0](https://github.com/example/compare/v1.0.0...v1.1.0) (2026-02-18)

### Features

* linked version format ([ccc3333](https://github.com/example/commit/ccc3333))

## [1.0.0](https://github.com/example/releases/tag/v1.0.0) (2026-02-16)

### Features

* initial release ([ddd4444](https://github.com/example/commit/ddd4444))
`;

describe('parseChangelog', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  async function getParseChangelog() {
    const mod = await import('../../src/shared/changelog.js');
    return mod.parseChangelog;
  }

  it('parses standard release-please format', async () => {
    const parseChangelog = await getParseChangelog();
    const sections = parseChangelog(SAMPLE_CHANGELOG);

    expect(sections).toHaveLength(3);
    expect(sections[0].version).toBe('1.2.0');
    expect(sections[0].date).toBe('2026-02-20');
    expect(sections[0].content).toContain('add changelog display');
    expect(sections[1].version).toBe('1.1.0');
    expect(sections[1].date).toBe('2026-02-18');
    expect(sections[2].version).toBe('1.0.0');
    expect(sections[2].date).toBe('2026-02-16');
  });

  it('parses linked version format', async () => {
    const parseChangelog = await getParseChangelog();
    const sections = parseChangelog(LINKED_VERSION_CHANGELOG);

    expect(sections).toHaveLength(2);
    expect(sections[0].version).toBe('1.1.0');
    expect(sections[1].version).toBe('1.0.0');
  });

  it('returns empty array for empty input', async () => {
    const parseChangelog = await getParseChangelog();
    expect(parseChangelog('')).toEqual([]);
  });

  it('returns empty array for malformed input', async () => {
    const parseChangelog = await getParseChangelog();
    expect(parseChangelog('just some text\nwith no version headings')).toEqual([]);
  });

  it('skips sections with empty content', async () => {
    const parseChangelog = await getParseChangelog();
    const input = `# Changelog

## 1.1.0 (2026-02-18)

## 1.0.0 (2026-02-16)

### Features

* something useful`;

    const sections = parseChangelog(input);
    expect(sections).toHaveLength(1);
    expect(sections[0].version).toBe('1.0.0');
  });
});

describe('getChangelogSections', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  async function getGetChangelogSections() {
    const mod = await import('../../src/shared/changelog.js');
    return mod.getChangelogSections;
  }

  it('filters sections within version range', async () => {
    vi.mocked(readFileSync).mockReturnValue(SAMPLE_CHANGELOG);
    const getChangelogSections = await getGetChangelogSections();

    const sections = getChangelogSections('1.0.0', '1.2.0');
    expect(sections).toHaveLength(2);
    expect(sections[0].version).toBe('1.1.0');
    expect(sections[1].version).toBe('1.2.0');
  });

  it('excludes the lower bound version', async () => {
    vi.mocked(readFileSync).mockReturnValue(SAMPLE_CHANGELOG);
    const getChangelogSections = await getGetChangelogSections();

    const sections = getChangelogSections('1.0.0', '1.1.0');
    expect(sections).toHaveLength(1);
    expect(sections[0].version).toBe('1.1.0');
  });

  it('includes the upper bound version', async () => {
    vi.mocked(readFileSync).mockReturnValue(SAMPLE_CHANGELOG);
    const getChangelogSections = await getGetChangelogSections();

    const sections = getChangelogSections('0.9.0', '1.0.0');
    expect(sections).toHaveLength(1);
    expect(sections[0].version).toBe('1.0.0');
  });

  it('returns empty array when CHANGELOG.md is missing', async () => {
    vi.mocked(readFileSync).mockImplementation(() => {
      throw new Error('ENOENT');
    });
    const getChangelogSections = await getGetChangelogSections();

    const sections = getChangelogSections('1.0.0', '1.2.0');
    expect(sections).toEqual([]);
  });

  it('returns sections in ascending order', async () => {
    vi.mocked(readFileSync).mockReturnValue(SAMPLE_CHANGELOG);
    const getChangelogSections = await getGetChangelogSections();

    const sections = getChangelogSections('0.0.0', '1.2.0');
    expect(sections.map((s) => s.version)).toEqual(['1.0.0', '1.1.0', '1.2.0']);
  });
});

describe('readLastSeenVersion / writeLastSeenVersion', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.mocked(readFileSync).mockReset();
    vi.mocked(writeFileSync).mockReset();
    vi.mocked(mkdirSync).mockReset();
  });

  async function getHelpers() {
    const mod = await import('../../src/shared/changelog.js');
    return {
      readLastSeenVersion: mod.readLastSeenVersion,
      writeLastSeenVersion: mod.writeLastSeenVersion,
    };
  }

  it('returns null when file is missing', async () => {
    vi.mocked(readFileSync).mockImplementation(() => {
      throw new Error('ENOENT');
    });
    const { readLastSeenVersion } = await getHelpers();
    expect(readLastSeenVersion()).toBeNull();
  });

  it('returns null for empty file', async () => {
    vi.mocked(readFileSync).mockReturnValue('');
    const { readLastSeenVersion } = await getHelpers();
    expect(readLastSeenVersion()).toBeNull();
  });

  it('reads and trims version string', async () => {
    vi.mocked(readFileSync).mockReturnValue('1.2.0\n');
    const { readLastSeenVersion } = await getHelpers();
    expect(readLastSeenVersion()).toBe('1.2.0');
  });

  it('writeLastSeenVersion writes the version', async () => {
    const { writeLastSeenVersion } = await getHelpers();
    writeLastSeenVersion('1.3.0');
    expect(vi.mocked(writeFileSync)).toHaveBeenCalledWith(
      expect.stringContaining('last-seen-version'),
      '1.3.0',
      'utf-8',
    );
  });
});

describe('readPendingChangelog', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.mocked(readFileSync).mockReset();
    vi.mocked(unlinkSync).mockReset();
  });

  async function getReadPendingChangelog() {
    const mod = await import('../../src/shared/changelog.js');
    return mod.readPendingChangelog;
  }

  it('returns null when file is missing', async () => {
    vi.mocked(readFileSync).mockImplementation(() => {
      throw new Error('ENOENT');
    });
    const readPendingChangelog = await getReadPendingChangelog();
    expect(readPendingChangelog()).toBeNull();
  });

  it('reads version and deletes the file', async () => {
    vi.mocked(readFileSync).mockReturnValue('1.0.0\n');
    const readPendingChangelog = await getReadPendingChangelog();

    expect(readPendingChangelog()).toBe('1.0.0');
    expect(vi.mocked(unlinkSync)).toHaveBeenCalledWith(
      expect.stringContaining('pending-changelog'),
    );
  });
});

describe('checkChangelogState', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.mocked(readFileSync).mockReset();
    vi.mocked(writeFileSync).mockReset();
    vi.mocked(unlinkSync).mockReset();
    vi.mocked(mkdirSync).mockReset();
  });

  async function getCheckChangelogState() {
    const mod = await import('../../src/shared/changelog.js');
    return mod.checkChangelogState;
  }

  it('returns shouldShow: false for dev mode', async () => {
    const checkChangelogState = await getCheckChangelogState();
    const result = checkChangelogState('0.0.0-dev');
    expect(result.shouldShow).toBe(false);
  });

  it('first install: writes version and returns shouldShow: false', async () => {
    // readPendingChangelog throws (no file)
    // readLastSeenVersion throws (no file)
    vi.mocked(readFileSync).mockImplementation(() => {
      throw new Error('ENOENT');
    });
    const checkChangelogState = await getCheckChangelogState();

    const result = checkChangelogState('1.0.0');
    expect(result.shouldShow).toBe(false);
    expect(vi.mocked(writeFileSync)).toHaveBeenCalledWith(
      expect.stringContaining('last-seen-version'),
      '1.0.0',
      'utf-8',
    );
  });

  it('same version: returns shouldShow: false', async () => {
    let callCount = 0;
    vi.mocked(readFileSync).mockImplementation((path) => {
      const pathStr = String(path);
      if (pathStr.includes('pending-changelog')) {
        throw new Error('ENOENT');
      }
      if (pathStr.includes('last-seen-version')) {
        return '1.0.0';
      }
      // CHANGELOG.md — shouldn't be reached for same version
      callCount++;
      return SAMPLE_CHANGELOG;
    });

    const checkChangelogState = await getCheckChangelogState();
    const result = checkChangelogState('1.0.0');
    expect(result.shouldShow).toBe(false);
    expect(callCount).toBe(0);
  });

  it('upgraded version via manual install: shows changelog', async () => {
    vi.mocked(readFileSync).mockImplementation((path) => {
      const pathStr = String(path);
      if (pathStr.includes('pending-changelog')) {
        throw new Error('ENOENT');
      }
      if (pathStr.includes('last-seen-version')) {
        return '1.0.0';
      }
      // CHANGELOG.md
      return SAMPLE_CHANGELOG;
    });

    const checkChangelogState = await getCheckChangelogState();
    const result = checkChangelogState('1.2.0');
    expect(result.shouldShow).toBe(true);
    expect(result.previousVersion).toBe('1.0.0');
    expect(result.sections).toHaveLength(2);
    expect(result.sections[0].version).toBe('1.1.0');
    expect(result.sections[1].version).toBe('1.2.0');
  });

  it('pending marker from update command: shows changelog', async () => {
    vi.mocked(readFileSync).mockImplementation((path) => {
      const pathStr = String(path);
      if (pathStr.includes('pending-changelog')) {
        return '1.0.0';
      }
      // CHANGELOG.md
      return SAMPLE_CHANGELOG;
    });

    const checkChangelogState = await getCheckChangelogState();
    const result = checkChangelogState('1.2.0');
    expect(result.shouldShow).toBe(true);
    expect(result.previousVersion).toBe('1.0.0');
    expect(result.sections).toHaveLength(2);
    // Pending file should be deleted
    expect(vi.mocked(unlinkSync)).toHaveBeenCalledWith(
      expect.stringContaining('pending-changelog'),
    );
    // Last-seen-version should be updated
    expect(vi.mocked(writeFileSync)).toHaveBeenCalledWith(
      expect.stringContaining('last-seen-version'),
      '1.2.0',
      'utf-8',
    );
  });

  it('missing CHANGELOG.md after upgrade: returns shouldShow: false', async () => {
    vi.mocked(readFileSync).mockImplementation((path) => {
      const pathStr = String(path);
      if (pathStr.includes('pending-changelog')) {
        throw new Error('ENOENT');
      }
      if (pathStr.includes('last-seen-version')) {
        return '1.0.0';
      }
      // CHANGELOG.md missing
      throw new Error('ENOENT');
    });

    const checkChangelogState = await getCheckChangelogState();
    const result = checkChangelogState('1.2.0');
    expect(result.shouldShow).toBe(false);
  });
});

describe('formatChangelogSection', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  async function getFormatChangelogSection() {
    const mod = await import('../../src/shared/changelog.js');
    return mod.formatChangelogSection;
  }

  it('strips commit hash links', async () => {
    const formatChangelogSection = await getFormatChangelogSection();
    const section = {
      version: '1.0.0',
      date: '2026-02-16',
      content: '### Features\n\n* add something ([abc1234](https://example.com/commit/abc1234))',
    };
    const result = formatChangelogSection(section);
    expect(result).not.toContain('abc1234');
    expect(result).toContain('add something');
  });

  it('converts ### headings to plain labels', async () => {
    const formatChangelogSection = await getFormatChangelogSection();
    const section = {
      version: '1.0.0',
      date: '2026-02-16',
      content: '### Features\n\n* a feature\n\n### Bug Fixes\n\n* a fix',
    };
    const result = formatChangelogSection(section);
    expect(result).toContain('Features:');
    expect(result).toContain('Bug Fixes:');
    expect(result).not.toContain('### ');
  });
});
