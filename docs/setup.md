# Setup Guide

## Prerequisites

Before installing, make sure you have:

- **Node.js >= 18** — Check with `node --version`
- **jq** — JSON processor used by the hook script
  - macOS: `brew install jq`
  - Ubuntu/Debian: `sudo apt install jq`
  - Arch: `sudo pacman -S jq`
- **Discord desktop app** — Must be running locally (Rich Presence uses local IPC)
- **Claude Code CLI** — [Install guide](https://docs.anthropic.com/en/docs/claude-code)

## Installation

### From npm (recommended)

```bash
npm install -g claude-code-discord-status
```

### From source

```bash
git clone https://github.com/brunojabs/claude-code-discord-status.git
cd claude-code-discord-status
npm install
npm run build
npm link
```

## Running Setup

```bash
claude-discord-status setup
```

The setup wizard will:

1. **Check prerequisites** — Verifies Node.js version and jq availability
2. **Prompt for Discord Client ID** — Press Enter to use the default, or paste your own (see [Custom Discord App](#custom-discord-application))
3. **Write config** — Creates `~/.claude-discord-status/config.json`
4. **Register MCP server** — Runs `claude mcp add` to register the `set_discord_status` tool
5. **Configure hooks** — Merges lifecycle hooks into `~/.claude/settings.json`
6. **Start daemon** — Launches the background daemon and verifies Discord connection

After setup, your Discord status updates automatically whenever you use Claude Code. No manual steps needed.

## Verifying It Works

```bash
# Check daemon status
claude-discord-status status
```

You should see:
```
Daemon PID: 12345
Discord connected: true
Active sessions: 0
Uptime: 10s
```

Then open Claude Code in any project. Your Discord should show:
```
Using Claude Code
Starting session...
Working on my-project
```

## CLI Commands

| Command | Description |
|---|---|
| `claude-discord-status setup` | Interactive setup wizard |
| `claude-discord-status status` | Show daemon status and active sessions |
| `claude-discord-status start -d` | Start daemon in background |
| `claude-discord-status start` | Start daemon in foreground (for debugging) |
| `claude-discord-status stop` | Stop the daemon |
| `claude-discord-status uninstall` | Remove all hooks, MCP server, config, and stop daemon |

## Configuration

Config file location: `~/.claude-discord-status/config.json`

```json
{
  "discordClientId": "1472915568930848829",
  "daemonPort": 19452
}
```

### All Options

| Key | Default | Description |
|---|---|---|
| `discordClientId` | `1472915568930848829` | Discord Application Client ID |
| `daemonPort` | `19452` | Port for the daemon's local HTTP server |
| `staleCheckInterval` | `30000` | Milliseconds between PID liveness checks |
| `idleTimeout` | `600000` | Milliseconds before marking a session idle (10 min) |
| `removeTimeout` | `1800000` | Milliseconds before removing an idle session (30 min) |

### Environment Variable Overrides

| Variable | Overrides |
|---|---|
| `CLAUDE_DISCORD_CLIENT_ID` | `discordClientId` |
| `CLAUDE_DISCORD_PORT` | `daemonPort` |

Environment variables take highest priority, then config file, then defaults.

## Custom Discord Application

The default client ID works out of the box. If you want your own app (custom name, custom assets):

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click **New Application**
3. Name it whatever you want (e.g., "Claude Code")
4. Go to **Rich Presence** > **Art Assets**
5. Upload images for these asset keys:
   - `claude-code` — Large image (main logo)
   - `starting` — Starting up icon
   - `thinking` — Thinking icon
   - `coding` — Writing code icon
   - `terminal` — Terminal/command icon
   - `reading` — Reading files icon
   - `searching` — Searching icon
   - `idle` — Idle icon
   - `multi-session` — Multiple sessions icon
6. Copy your **Application ID** from the General Information page
7. Either:
   - Run `claude-discord-status setup` and paste it when prompted
   - Or edit `~/.claude-discord-status/config.json` directly
   - Or set `CLAUDE_DISCORD_CLIENT_ID=your-id`

## What Gets Installed

The setup command touches these files:

| File | What |
|---|---|
| `~/.claude-discord-status/config.json` | App configuration |
| `~/.claude-discord-status/daemon.pid` | PID file (auto-managed) |
| `~/.claude-discord-status/daemon.log` | Daemon log output |
| `~/.claude/settings.json` | Claude Code hooks (merged, not overwritten) |
| Claude MCP registry | `discord-status` MCP server |

## Uninstalling

```bash
claude-discord-status uninstall
```

This removes:
- Daemon process (stopped)
- MCP server registration
- Hook entries from `~/.claude/settings.json`
- Config directory `~/.claude-discord-status/`

## Troubleshooting

### Daemon won't start

Check if the port is already in use:
```bash
lsof -i :19452
```

Check daemon logs:
```bash
cat ~/.claude-discord-status/daemon.log
```

### Discord not showing status

1. Make sure Discord desktop app is running (not just the browser version)
2. Check that "Activity Status" is enabled in Discord Settings > Activity Privacy
3. Verify connection: `claude-discord-status status` should show `Discord connected: true`
4. The daemon auto-reconnects every 5 seconds if disconnected

### Hooks not firing

Verify hooks are in your settings:
```bash
cat ~/.claude/settings.json | jq '.hooks'
```

You should see entries for `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `Stop`, `Notification`, and `SessionEnd`.

### MCP tool not available

Check MCP registration:
```bash
claude mcp list
```

You should see `discord-status` in the list. If not, re-run setup or manually add:
```bash
claude mcp add --transport stdio --scope user discord-status -- node /path/to/dist/mcp/index.js
```
