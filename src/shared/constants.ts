import { join } from 'node:path';
import { homedir } from 'node:os';

export const DEFAULT_PORT = 19452;
export const MCP_PRIORITY_WINDOW = 30_000; // 30 seconds
export const LARGE_IMAGE_KEY = 'claude-code';
export const LARGE_IMAGE_TEXT = 'Claude Code';

export const CONFIG_DIR = join(homedir(), '.claude-discord-status');
export const CONFIG_FILE = join(CONFIG_DIR, 'config.json');
export const PID_FILE = join(CONFIG_DIR, 'daemon.pid');
export const LOG_FILE = join(CONFIG_DIR, 'daemon.log');

export const DEFAULT_DISCORD_CLIENT_ID = '1472915568930848829';

export const STALE_CHECK_INTERVAL = 30_000; // 30 seconds
export const IDLE_TIMEOUT = 600_000; // 10 minutes
export const REMOVE_TIMEOUT = 1_800_000; // 30 minutes
export const RECONNECT_INTERVAL = 5_000; // 5 seconds

export const SMALL_IMAGE_MAP: Record<string, { key: string; text: string }> = {
  starting: { key: 'starting', text: 'Starting up' },
  thinking: { key: 'thinking', text: 'Thinking...' },
  coding: { key: 'coding', text: 'Writing code' },
  terminal: { key: 'terminal', text: 'Running a command' },
  reading: { key: 'reading', text: 'Reading files' },
  searching: { key: 'searching', text: 'Searching' },
  idle: { key: 'idle', text: 'Idle' },
  'multi-session': { key: 'multi-session', text: 'Multiple sessions' },
};

export const MESSAGE_ROTATION_INTERVAL = 300_000; // 5 minutes

export const MULTI_SESSION_MESSAGES: Record<number, string[]> = {
  2: [
    'Dual-wielding codebases',
    'Split-brain mode engaged',
    'Two tabs, zero regrets',
    'Pair programming with myself',
    'Double-dipping in code',
    'Ambidextrous coding',
    'Main character in two repos',
    'Living my best double life',
    'Two codebases, one vibe',
    'Multiverse of madness (lite)',
    'Bilingual in TypeScript',
    'Plot twist: two repos at once',
  ],
  3: [
    'Juggling 3 codebases somehow',
    'Triple threat detected',
    'Three-ring circus',
    'Hat trick of repositories',
    'Tri-wielding codebases',
    'Three projects walk into a bar...',
    'Hitting a 3-pointer in code',
    'Trilogy arc in progress',
    'Doing a code speedrun x3',
    'Three repos no thoughts',
    'Third time\'s the charm (right?)',
    'Triforce of productivity',
  ],
  4: [
    '4 parallel universes deep',
    'Quadruple-booked and shipping',
    'One for each brain cell',
    'Four-dimensional debugging',
    'Context-switching at the speed of light',
    'Four projects, one trenchcoat',
    'This is my 4th personality',
    'Quad-core workflow unlocked',
    '4 repos and a dream',
    'Into the quadraverse',
    'Fantastic 4 (repositories)',
    'Hitting the quad combo',
  ],
};

export const MULTI_SESSION_MESSAGES_OVERFLOW: string[] = [
  'Send help ({n} projects)',
  'This is fine. ({n} projects)',
  '{n} projects, no thoughts, just vibes',
  '{n}-way merge conflict with reality',
  'Someone stop me ({n} projects)',
  'My RAM filed a complaint ({n} projects)',
  'Achieving {n}-lightenment',
  'Operating on {n} codebases simultaneously',
  '{n} repos and no signs of stopping',
  'Gone feral ({n} projects)',
  '{n} tabs open, emotionally unavailable',
  '{n} projects deep, send snacks',
  'Built different ({n} projects)',
  '{n} repos, running on caffeine',
  'We call this the {n}x developer',
  'Not a phase, it\'s {n} projects',
];

export const MULTI_SESSION_TOOLTIPS: string[] = [
  'Each codebase thinks it\'s the favorite',
  'Technically I\'m one Claude in a trenchcoat',
  'My context window needs a vacation',
  'Alt-tabbing at the speed of thought',
  'They don\'t know I\'m also in other repos',
  'Running on vibes and vector embeddings',
  'Parallel execution unlocked',
  'One model, many dreams',
  'I contain multitudes (of sessions)',
  'Plot twist: they\'re all the same monorepo',
  'Task manager: sweating nervously',
  'Living rent-free in multiple repos',
  'Born to code, forced to context-switch',
  'Multithreaded by necessity',
  'Schrödinger\'s codebase: all edited at once',
  'No thoughts, just git diffs',
  'POV: you opened one more terminal',
  'This is my multiverse era',
  'Gaslit, gatekept, git rebased',
  'Not me context-switching again',
  'Main character energy across repos',
  'Slay (multiple codebases)',
  'The voices (terminals) are talking to me',
  'Rotating between existential code crises',
  'In my parallel processing era',
];

export const MODE_FLAVOR: Record<string, string[]> = {
  coding: [
    'In the zone',
    'Keyboard on fire',
    'Code goes brrr',
    'Edits per second: yes',
    'Locked in',
    'Typing arc activated',
    'Diff machine',
    'Ship it energy',
  ],
  searching: [
    'Research mode',
    'Grep-powered',
    'Down the rabbit hole',
    'Ctrl+F through reality',
    'Lore hunting',
    'Where did that function go',
    'Deep in the sauce',
    'Detective arc',
  ],
  terminal: [
    'DevOps mode',
    'Shell shocked',
    'Living in the terminal',
    'sudo make it work',
    'Command line warrior',
    'Bash scripting arc',
    'Trust the process (literally)',
    'Terminal velocity',
  ],
  thinking: [
    'Deep in thought',
    'Brain cycles maxed',
    'Contemplating the void(0)',
    'Processing...',
    'Loading thoughts...',
    'Buffering genius',
    'Internal monologue active',
    'Reasoning era',
  ],
  mixed: [
    'Full stack chaos',
    'Jack of all codebases',
    'Maximum multitasking',
    'Controlled chaos',
    'Doing a little bit of everything',
    'Chaotic neutral workflow',
    'All over the place (affectionate)',
    'Renaissance dev energy',
  ],
};
