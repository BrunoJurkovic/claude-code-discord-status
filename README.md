# claude-code-discord-status

Show what Claude Code is doing as a Discord Rich Presence card.

<p align="center">

**Single session:**
```
Using Claude Code                          [claude-logo]
Refactoring the auth middleware
Working on my-project         [coding-icon]
```

**Multiple sessions:**
```
Using Claude Code                          [claude-logo]
Dual-wielding codebases
23 edits · 8 cmds · 2h 15m deep  [coding-icon]
```
*Hover: "Technically I'm one Claude in a trenchcoat"*

</p>

## How It Works

Three components work together:

1. **Daemon** — Background process that holds the Discord RPC connection, tracks all Claude Code sessions, and resolves what to show.
2. **Hooks** — Claude Code lifecycle hooks that fire on state transitions (session start/end, tool use, prompt submit) and POST updates to the daemon.
3. **MCP Server** — An MCP tool (`set_discord_status`) that Claude can call to set a custom, contextual status message — these take priority for 30 seconds.

## Quick Start

### Prerequisites

- Node.js >= 18
- [jq](https://jqlang.github.io/jq/) (`brew install jq` / `apt install jq`)
- Discord desktop app running
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI installed

### Install

```bash
npm install -g claude-code-discord-status
```

### Setup

```bash
claude-discord-status setup
```

This will:
1. Create a config at `~/.claude-discord-status/config.json`
2. Register the MCP server with Claude Code
3. Add lifecycle hooks to `~/.claude/settings.json`
4. Start the daemon in the background

That's it. Your Discord status updates automatically whenever you use Claude Code.

### Commands

```bash
claude-discord-status status       # Check daemon status and active sessions
claude-discord-status start -d     # Start daemon in background
claude-discord-status stop         # Stop the daemon
claude-discord-status uninstall    # Remove everything
```

## Multi-Session

When you're running multiple Claude Code sessions, the card gets quirky:

- **Escalating messages** per session count — "Dual-wielding codebases" (2), "Triple threat detected" (3), "Send help (5 projects)" (5+)
- **Aggregate stats** — `23 edits · 8 cmds · 2h 15m deep`
- **Activity mode detection** — dominant activity type changes the icon (coding, terminal, searching, thinking)
- **Rotating tooltips** — hidden easter eggs on hover, rotating every 5 minutes

Single session cards show the current action and project name as usual.

### Session Lifecycle

- PID liveness checks every 30 seconds
- Marked idle after 10 minutes of inactivity
- Removed after 30 minutes of inactivity

## MCP Priority

When Claude calls the `set_discord_status` MCP tool, its message takes priority over hook-generated status for 30 seconds. This means Claude's self-authored descriptions (like "Fixing the login redirect bug") won't be immediately overwritten by generic tool-use messages (like "Editing auth.ts").

## Configuration

Config file: `~/.claude-discord-status/config.json`

| Key | Env Override | Default | Description |
|---|---|---|---|
| `discordClientId` | `CLAUDE_DISCORD_CLIENT_ID` | `1472915568930848829` | Discord Application Client ID |
| `daemonPort` | `CLAUDE_DISCORD_PORT` | `19452` | Local HTTP server port |
| `staleCheckInterval` | — | `30000` | Ms between PID liveness checks |
| `idleTimeout` | — | `600000` | Ms before marking session idle |
| `removeTimeout` | — | `1800000` | Ms before removing idle session |

### Custom Discord Application

The default client ID (`1472915568930848829`) works out of the box — it's a public app identifier, not a secret.

To use your own Discord application instead:

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application named "Claude Code"
3. Upload Rich Presence art assets (see `assets/` for reference)
4. Copy the Application ID
5. Set it during `claude-discord-status setup` or in the config file

## Development

```bash
git clone https://github.com/brunojabs/claude-code-discord-status.git
cd claude-code-discord-status
npm install
npm run build
npm test
```

### Project Structure

```
src/
├── daemon/           # Background daemon
│   ├── index.ts      # Entry point
│   ├── server.ts     # HTTP API
│   ├── discord.ts    # Discord RPC wrapper
│   ├── sessions.ts   # Session registry
│   └── resolver.ts   # Presence resolver
├── mcp/              # MCP server
│   └── index.ts      # stdio MCP entry point
├── hooks/            # Hook script
│   └── claude-hook.sh
├── shared/           # Shared types, config, constants
│   ├── types.ts
│   ├── config.ts
│   └── constants.ts
└── cli.ts            # CLI entry point
```

## License

MIT
