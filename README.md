<p align="center">
  <img src="./assets/hero-banner.svg" alt="claude-presence" width="900" />
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/claude-presence"><img src="https://img.shields.io/npm/v/claude-presence?color=5865f2&style=flat-square" alt="npm version" /></a>
  <a href="https://github.com/BrunoJurkovic/claude-presence/actions"><img src="https://img.shields.io/github/actions/workflow/status/BrunoJurkovic/claude-presence/ci.yml?style=flat-square" alt="CI" /></a>
  <a href="https://github.com/BrunoJurkovic/claude-presence/blob/main/LICENSE"><img src="https://img.shields.io/github/license/BrunoJurkovic/claude-presence?style=flat-square" alt="License" /></a>
  <img src="https://img.shields.io/node/v/claude-presence?style=flat-square" alt="Node version" />
</p>

<p align="center">
  Show what Claude Code is doing as a live Discord Rich Presence card.<br/>
  Hooks into Claude Code's lifecycle events and updates your Discord status in real time.
</p>

---

## Preview

<p align="center">
  <img src="./assets/card-single.svg" alt="Single session card" width="340" />
  &nbsp;&nbsp;
  <img src="./assets/card-multi.svg" alt="Multi-session card" width="340" />
</p>

<p align="center">
  <b>Single session</b> (professional preset) &nbsp;·&nbsp; <b>Multiple sessions</b> (dev-humor preset)
</p>

## Features

- **Live activity updates** — Your Discord card reflects what Claude is doing right now (editing, searching, running commands, thinking)
- **Self-healing daemon** — If the daemon dies (system restart, sleep/wake), it auto-restarts on the next Claude Code session
- **Multi-session support** — Running multiple Claude Code instances? The card escalates with quirky messages and aggregated stats
- **Activity mode detection** — Dominant activity type (coding, terminal, searching, thinking) changes the card icon
- **Rotating tooltips** — Hidden easter eggs on hover, rotating every 5 minutes
- **Auto-reconnect** — Daemon handles Discord RPC disconnects gracefully

## Quick Start

### Prerequisites

- Node.js >= 18
- [jq](https://jqlang.github.io/jq/) (`brew install jq` / `apt install jq`)
- Discord desktop app running
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI installed

### Install & Setup

```bash
npm install -g claude-presence
claude-presence setup
```

Or try it without installing globally:

```bash
npx claude-presence setup
```

> **Tip:** The global install (`npm install -g`) is recommended — it puts the CLI on your PATH and keeps files in a stable location. The `npx` approach works for a quick try but relies on npm's cache directory.

Setup will:

1. Create a config at `~/.claude-presence/config.json`
2. Copy the hook script to `~/.claude-presence/` for persistence
3. Add lifecycle hooks to `~/.claude/settings.json`
4. Start the daemon in the background

The daemon auto-restarts when needed — if it gets killed (system restart, sleep/wake), the next Claude Code session brings it back automatically.

## Upgrading from v1.x

```bash
npm install -g claude-presence
claude-presence doctor --fix
```

Migration is automatic — your config, hooks, and settings are moved to the new `~/.claude-presence/` directory on first run. The old `claude-code-discord-status` package can be uninstalled after upgrading.

## How It Works

<p align="center">
  <img src="./assets/architecture.svg" alt="Architecture diagram" width="800" />
</p>

Two components work together:

1. **Hooks** — Bash scripts fired by Claude Code lifecycle events (session start/end, tool use, prompt submit). They POST updates to the daemon's HTTP API. If the daemon isn't running, the hook auto-starts it.
2. **Daemon** — Background process that holds the Discord RPC connection, tracks all sessions, resolves what to show, and pushes it to Discord.

> See [docs/architecture.md](./docs/architecture.md) for the full deep dive.

## CLI

```bash
claude-presence setup            # Interactive setup wizard
claude-presence status           # Check daemon status and active sessions
claude-presence start -d         # Start daemon in background
claude-presence stop             # Stop the daemon
claude-presence preset [name]    # Change message style
claude-presence doctor            # Diagnose and fix issues
claude-presence doctor --fix     # Auto-fix all issues
claude-presence update           # Update to latest version
claude-presence uninstall        # Remove everything
```

> All commands also work with `npx claude-presence <command>`.

## Configuration

Config file: `~/.claude-presence/config.json`

| Key | Env Override | Default | Description |
| --- | --- | --- | --- |
| `discordClientId` | `CLAUDE_PRESENCE_CLIENT_ID` | `1472915568930848829` | Discord Application Client ID |
| `daemonPort` | `CLAUDE_PRESENCE_PORT` | `19452` | Local HTTP server port |
| `preset` | `CLAUDE_PRESENCE_PRESET` | `minimal` | Message style preset |

The default client ID works out of the box — it's a public app identifier, not a secret.

> See [docs/setup.md](./docs/setup.md) for all config options, timeouts, and how to use a custom Discord application.

## Message Presets

Choose how your Discord status sounds. Set during setup, or change anytime:

```bash
claude-presence preset            # Interactive selection
claude-presence preset dev-humor   # Set directly
```

| Preset | Style | Example |
| --- | --- | --- |
| `minimal` | Terse, just the facts (default) | _"Coding"_ |
| `professional` | Clean, understated | _"Actively developing"_ |
| `dev-humor` | Classic programmer jokes | _"// TODO: sleep"_ |
| `gen-z` | Quirky, meme-flavored | _"No thoughts just code"_ |
| `chaotic` | Pushing to main, living dangerously | _"Deploying on a Friday"_ |

Override via environment variable:

```bash
export CLAUDE_PRESENCE_PRESET=professional
```

## Multi-Session Fun

When you're running multiple Claude Code sessions, the card gets quirky:

- **2 sessions** — _"Dual-wielding codebases"_, _"Pair programming with myself"_
- **3 sessions** — _"Triple threat detected"_, _"Three-ring circus"_
- **4 sessions** — _"4 parallel universes deep"_, _"One for each brain cell"_
- **5+ sessions** — _"Send help (5 projects)"_, _"Gone feral (6 projects)"_

Plus aggregate stats like `23 edits · 8 cmds · 2h 15m deep` and rotating hover tooltips like _"Technically I'm one Claude in a trenchcoat"_.

> See [docs/multi-session.md](./docs/multi-session.md) for the full message pool and how the resolver works.

## Development

```bash
git clone https://github.com/BrunoJurkovic/claude-presence.git
cd claude-presence
npm install
npm run build
npm test
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

## License

MIT
