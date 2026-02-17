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
export const UPDATE_CHECK_FILE = join(CONFIG_DIR, 'update-check.json');
export const LAST_SEEN_VERSION_FILE = join(CONFIG_DIR, 'last-seen-version');
export const PENDING_CHANGELOG_FILE = join(CONFIG_DIR, 'pending-changelog');

export const UPDATE_CHECK_INTERVAL = 6 * 60 * 60 * 1000; // 6 hours
export const NPM_REGISTRY_URL = 'https://registry.npmjs.org';
export const PACKAGE_NAME = 'claude-code-discord-status';

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
    "Third time's the charm (right?)",
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
  "Not a phase, it's {n} projects",
];

export const MULTI_SESSION_TOOLTIPS: string[] = [
  "Each codebase thinks it's the favorite",
  "Technically I'm one Claude in a trenchcoat",
  'My context window needs a vacation',
  'Alt-tabbing at the speed of thought',
  "They don't know I'm also in other repos",
  'Running on vibes and vector embeddings',
  'Parallel execution unlocked',
  'One model, many dreams',
  'I contain multitudes (of sessions)',
  "Plot twist: they're all the same monorepo",
  'Task manager: sweating nervously',
  'Living rent-free in multiple repos',
  'Born to code, forced to context-switch',
  'Multithreaded by necessity',
  "Schrödinger's codebase: all edited at once",
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

export const SINGLE_SESSION_STATE_MESSAGES: string[] = [
  'No thoughts just code',
  'In my coding era',
  'Locked in fr',
  'Vibe coding',
  'Understood the assignment',
  'The code is coding',
  'Ate and left no crumbs',
  'Trust the process fr',
  'Lowkey shipping',
  'Unhinged and compiling',
  'Not me actually being productive',
  "It's giving... code",
  'Real ones are coding rn',
  'Brain rot but make it code',
  'Main character in one repo',
  'Gone nonverbal (coding)',
  'The voices said ship it',
  'Slay (but in TypeScript)',
  'This is my Roman Empire',
  'Chronically online and coding',
  'Feral and writing functions',
  'Core memory: writing code',
  'Aura +100 (coding)',
  'No cap just commits',
];

export const SINGLE_SESSION_DETAILS: Record<string, string[]> = {
  coding: [
    'Writing code',
    'Making some edits',
    'Hands in the codebase',
    'Shipping changes',
    'Refactoring away',
    'Crafting new code',
    'Building something',
    'Diff incoming...',
    'Rewriting things',
    'In the editor',
  ],
  terminal: [
    'Running commands',
    'Living in the terminal',
    'Executing builds',
    'Shell session active',
    'Running some scripts',
    'Commands in flight',
    'Build in progress',
    'In the shell',
  ],
  searching: [
    'Searching the codebase',
    'Exploring the code',
    'Hunting for something',
    'Following references',
    'Tracing the code path',
    'Digging through files',
    'On a code treasure hunt',
    'Pattern matching',
  ],
  thinking: [
    'Thinking it through',
    'Reasoning about this',
    'Mulling over the options',
    'Processing...',
    'Cooking up a plan',
    'Analyzing the problem',
    'Pondering architecture',
    'Deep in thought',
  ],
  reading: [
    'Reading the code',
    'Studying the codebase',
    'Loading context',
    'Absorbing the source',
    'Reviewing files',
    'Reading through things',
    'Understanding the code',
    'Learning the patterns',
  ],
  idle: [
    'Waiting for input',
    'Standing by',
    'Ready when you are',
    'On standby',
    'Between tasks',
    'Awaiting the next prompt',
  ],
  starting: [
    'Starting up',
    'Booting up',
    'Initializing...',
    'Coming online',
    'Getting ready',
    'Warming up',
  ],
};

export const SINGLE_SESSION_DETAILS_FALLBACK: string[] = [
  'Working on something',
  'Doing things',
  'Busy busy busy',
  'In progress',
  'On it',
  'Working...',
];
