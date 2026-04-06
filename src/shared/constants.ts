import { join } from 'node:path';
import { homedir } from 'node:os';

export const DEFAULT_PORT = 19452;
export const LARGE_IMAGE_KEY = 'claude-code';
export const LARGE_IMAGE_TEXT = 'Claude Code';

export const CONFIG_DIR = join(homedir(), '.claude-presence');
export const CONFIG_FILE = join(CONFIG_DIR, 'config.json');
export const PID_FILE = join(CONFIG_DIR, 'daemon.pid');
export const LOG_FILE = join(CONFIG_DIR, 'daemon.log');
export const HOOK_FILE = join(CONFIG_DIR, 'claude-hook.sh');
export const UPDATE_CHECK_FILE = join(CONFIG_DIR, 'update-check.json');
export const LAST_SEEN_VERSION_FILE = join(CONFIG_DIR, 'last-seen-version');
export const PENDING_CHANGELOG_FILE = join(CONFIG_DIR, 'pending-changelog');

export const UPDATE_CHECK_INTERVAL = 6 * 60 * 60 * 1000; // 6 hours
export const NPM_REGISTRY_URL = 'https://registry.npmjs.org';
export const PACKAGE_NAME = 'claude-presence';

// Legacy paths for migration
export const LEGACY_CONFIG_DIR = join(homedir(), '.claude-discord-status');

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
    'Ambidextrous coding',
    'Main character in two repos',
    'Multiverse of madness (lite)',
    'Plot twist: two repos at once',
    'Double vision but productive',
    'Two screens, one dream',
    'Splitting the timeline',
    'Both repos get custody',
    'Mirror match in progress',
    'Two branches of reality',
    'Bilingual in codebases',
    'Running a two-front war',
  ],
  3: [
    'Juggling 3 codebases somehow',
    'Triple threat detected',
    'Three-ring circus',
    'Hat trick of repositories',
    'Tri-wielding codebases',
    'Three projects walk into a bar...',
    'Trilogy arc in progress',
    "Third time's the charm (right?)",
    'Triforce of productivity',
    'Triple overtime in effect',
    'Three deep and still going',
    'Splitting into 3 timelines',
    'The holy trinity of repos',
    'Triangulating productivity',
    'Three tabs of pure chaos',
    'Running the triple helix',
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
    'Fantastic 4 (repositories)',
    'Hitting the quad combo',
    'Running on all 4 cylinders',
    'Four-way intersection of code',
    'Quarterbacking 4 repos',
    'The 4 horsemen of shipping',
    'Fourfold path to burnout',
  ],
};

export const MULTI_SESSION_MESSAGES_OVERFLOW: string[] = [
  'Send help ({n} projects)',
  'This is fine. ({n} projects)',
  '{n}-way merge conflict with reality',
  'Someone stop me ({n} projects)',
  'My RAM filed a complaint ({n} projects)',
  'Achieving {n}-lightenment',
  'Operating on {n} codebases simultaneously',
  '{n} repos and no signs of stopping',
  'Gone feral ({n} projects)',
  '{n} tabs open, emotionally unavailable',
  '{n} projects deep, send snacks',
  '{n} repos, running on caffeine',
  'We call this the {n}x developer',
  '{n} simultaneous timelines',
  'Warning: {n} repos in the blast radius',
  'Splitting into {n} parallel selves',
  '{n} repos and a questionable life choice',
  'Terminal count: {n} and climbing',
  'My CPU is filing a restraining order ({n})',
  'At {n} repos you unlock prestige mode',
];

export const MULTI_SESSION_TOOLTIPS: string[] = [
  "Each codebase thinks it's the favorite",
  "Technically I'm one Claude in a trenchcoat",
  'My context window needs a vacation',
  'Alt-tabbing at the speed of thought',
  "They don't know I'm also in other repos",
  'Parallel execution unlocked',
  'One model, many dreams',
  'I contain multitudes (of sessions)',
  "Plot twist: they're all the same monorepo",
  'Task manager: sweating nervously',
  'Living rent-free in multiple repos',
  'Born to code, forced to context-switch',
  'Multithreaded by necessity',
  "Schr\u00F6dinger's codebase: all edited at once",
  'POV: you opened one more terminal',
  'The voices (terminals) are talking to me',
  'Rotating between existential code crises',
  'Every repo thinks I only work on them',
  'My git log is a multiverse',
  'Context windows within context windows',
  'Alt-tabbing is my cardio',
  'Technically this counts as distributed computing',
  'The terminal hydra: close one, two more open',
  'My tabs have tabs',
  'One brain, suspiciously many opinions',
  'Context-switching is a full-contact sport',
];

export const SINGLE_SESSION_STATE_MESSAGES: string[] = [
  'No thoughts just code',
  'Vibe coding',
  'Understood the assignment',
  'Lowkey shipping',
  'Unhinged and compiling',
  'Not me actually being productive',
  'Main character in one repo',
  'The voices said ship it',
  'Chronically online and coding',
  'Feral and writing functions',
  'Suspiciously productive',
  'Dangerously focused',
  'Hyperfixation: activated',
  'Coding with intent',
  'Keyboard go brrr',
  'Tunnelvision: ON',
  'Aggressively shipping',
  'In the trenches',
  'One repo to rule them all',
  'Terminal velocity reached',
  'Cannot be stopped',
  'Possessed by the codebase',
  'Unreasonably locked in',
  'Left on read, busy coding',
  'My code has plot armor',
  'Down the rabbit hole',
  'Entered the flow state, no ETA',
  'Mildly unhinged, fully productive',
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
    'Leaving my mark on the codebase',
    'Sculpting functions',
    'Surgery on the source code',
    'Bending the codebase to my will',
    'Manifesting clean diffs',
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
    'Terminal is my home now',
    'Summoning the build gods',
    'Pressing enter and praying',
    'Pipeline go brrr',
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
    'Ctrl+F and vibes',
    'Spelunking through the source',
    'Tracking down a lead',
    'Following the trail',
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
    'Plotting the next move',
    'Staring into the void (productively)',
    'Loading a big idea',
    'Assembling the master plan',
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
    'Speed-reading the repo',
    'Downloading the codebase into my brain',
    'Absorbing forbidden knowledge',
    'Reading between the lines (of code)',
  ],
  idle: [
    'Waiting for input',
    'Standing by',
    'Ready when you are',
    'On standby',
    'Between tasks',
    'Awaiting the next prompt',
    'Charging up',
    'Buffering...',
  ],
  starting: [
    'Starting up',
    'Booting up',
    'Initializing...',
    'Coming online',
    'Getting ready',
    'Warming up',
    'Entering the arena',
    'Loading into the match',
  ],
};

export const SINGLE_SESSION_DETAILS_FALLBACK: string[] = [
  'Working on something',
  'Doing things',
  'Busy busy busy',
  'In progress',
  'On it',
  'Working...',
  'Up to something',
  'Scheming',
];
