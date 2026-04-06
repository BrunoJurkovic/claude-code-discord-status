# v2.0.0: Rename to claude-presence & UX Overhaul

**Date:** 2026-04-06
**Status:** Draft
**Scope:** CLI rename, migration, setup flow, auto-start reliability, doctor command

## Summary

Rename the project from `claude-code-discord-status` / `claude-discord-status` to `claude-presence`. Simultaneously fix the broken auto-start, add a `doctor` diagnostic command, and streamline the setup flow. Ship as a single v2.0.0 release.

## Motivation

The current state has several compounding issues:

1. **Auto-start is unreliable.** The hook script's `ensure_daemon()` uses a 60-second cooldown lock. If the daemon dies and the lock exists, auto-start silently gives up. There is no distinction between "daemon crashed on startup" and "daemon's PID file is stale."
2. **Hook paths are fragile.** Setup writes hook commands pointing to wherever npm installed the package (e.g., `/opt/homebrew/lib/node_modules/...`). This path breaks on npm updates, nvm switches, or reinstalls.
3. **No diagnostics.** When things break, there is no way to figure out what's wrong without manually checking PID files, log files, and hook paths.
4. **Setup flow is confusing.** The first real question after prereqs is "Use a custom Discord app?" — irrelevant for 99% of users.
5. **The name is long.** `claude-discord-status` is 22 characters to type. `claude-presence` is 15 and equally descriptive.

## 1. Rename

### New identifiers

| What | Old | New |
|------|-----|-----|
| npm package | `claude-code-discord-status` | `claude-presence` |
| Binary | `claude-discord-status` | `claude-presence` |
| Config dir | `~/.claude-discord-status/` | `~/.claude-presence/` |
| Env: client ID | `CLAUDE_DISCORD_CLIENT_ID` | `CLAUDE_PRESENCE_CLIENT_ID` |
| Env: port | `CLAUDE_DISCORD_PORT` | `CLAUDE_PRESENCE_PORT` |
| Env: preset | `CLAUDE_DISCORD_PRESET` | `CLAUDE_PRESENCE_PRESET` |
| Env: update check | `CLAUDE_DISCORD_UPDATE_CHECK` | `CLAUDE_PRESENCE_UPDATE_CHECK` |
| Hook env: URL | `CLAUDE_DISCORD_URL` | `CLAUDE_PRESENCE_URL` |
| Constant: `PACKAGE_NAME` | `claude-code-discord-status` | `claude-presence` |

### Environment variable fallback

Config loading checks new env var names first, then old names as fallback, then config file, then defaults. This means existing env-var users keep working without changes. The `doctor` command flags old env var usage and suggests updating.

### npm transition

- Publish `claude-presence@2.0.0` as the new package.
- Publish `claude-code-discord-status@1.3.0` as a deprecation stub: prints a message telling users to `npm install -g claude-presence` and exits with code 0.
- The GitHub repo can stay at `claude-code-discord-status` or be renamed — orthogonal to this spec.

## 2. Migration

Migration runs automatically at the start of any CLI command (setup, start, stop, status, doctor, preset, update). It is idempotent. The hook script does **not** run migration — it simply checks both `~/.claude-presence/` and `~/.claude-discord-status/` as config dir fallback, preferring the new path.

### Trigger conditions

- `~/.claude-discord-status/` exists
- `~/.claude-presence/` does not exist

If both exist, skip migration (user has already migrated or has a manual setup).

### Steps

1. **Rename config directory:** Move `~/.claude-discord-status/` to `~/.claude-presence/`.
2. **Update hook paths in `~/.claude/settings.json`:** Find any hook entry whose `command` field contains `claude-hook.sh`. Replace the entire command path with `~/.claude-presence/claude-hook.sh` (the stable copy location).
3. **Re-copy hook script:** Copy the current package's `claude-hook.sh` to `~/.claude-presence/claude-hook.sh` to ensure it's up to date.
4. **Update `daemonPath` in config:** Rewrite `config.json`'s `daemonPath` to point to the current package's daemon entry point.
5. **Print:** `Migrated from ~/.claude-discord-status/ to ~/.claude-presence/`

### Hook path update detail

The migration scans all hook events in `~/.claude/settings.json`. For each hook entry, if the `command` field contains `claude-hook.sh` (anywhere in the string), replace it with the absolute path `{HOME}/.claude-presence/claude-hook.sh`. This handles:
- Old paths like `/opt/homebrew/lib/node_modules/.../claude-hook.sh`
- Old paths like `/Users/x/.nvm/versions/.../claude-hook.sh`
- The old stable path `~/.claude-discord-status/claude-hook.sh`

## 3. Setup Flow Revamp

### Current flow
1. Prereq checks (Node, jq)
2. "Use a custom Discord app?" — confusing first question
3. Preset selection
4. Write config, install hooks, start daemon
5. Verify Discord connection

### New flow
1. Prereq checks (Node, jq)
2. Run migration if applicable (silent if nothing to migrate)
3. Preset selection (same as before)
4. "Use a custom Discord Application ID?" — moved to end, pre-selected "No", with hint text: `The default works out of the box — only change this if you've created your own Discord app`
5. Write config, copy hook to stable path, install hooks pointing to stable path, start daemon
6. Verify Discord connection
7. Show next-steps note

### Hook installation

Setup always:
1. Copies `claude-hook.sh` to `~/.claude-presence/claude-hook.sh`
2. Removes any existing `claude-hook.sh` entries from `~/.claude/settings.json` (regardless of path)
3. Adds new entries all pointing to `~/.claude-presence/claude-hook.sh`

This is already what the code does — the change is that setup now also runs migration first, and the stable path uses the new directory name.

## 4. Smart Auto-Start

The hook script's `ensure_daemon()` function is rewritten with smarter logic.

### Current behavior
1. Health check daemon → if reachable, done
2. Check cooldown lock → if locked and < 60s old, give up
3. Acquire lock
4. Resolve daemon path
5. Spawn daemon, poll for readiness (8 attempts, 200ms each)

### New behavior
1. Health check daemon → if reachable, done
2. **Check PID file** → if PID file exists:
   - Send signal 0 to the PID. If the process is alive, the daemon is running but the HTTP server hasn't started yet or is on a different port. Wait briefly (poll health 5 times, 300ms apart). If it comes up, done. If not, give up for this hook invocation (the daemon is likely starting up from another hook).
   - If the process is dead: **stale PID**. Remove the PID file and the lock dir. Fall through to restart.
3. **Check cooldown lock** → if lock exists and < 10s old, give up (reduced from 60s). If >= 10s old, remove it and continue.
4. Acquire lock (atomic mkdir)
5. Resolve daemon path (config file → derive from hook script location)
6. Spawn daemon in background
7. Poll for readiness (10 attempts, 300ms each = 3s max)
8. On success: remove lock. On failure: leave lock (cooldown prevents rapid retry from next hook event).

### Key changes
- **Stale PID detection:** If the PID file points to a dead process, clean up and restart immediately instead of waiting for cooldown.
- **Reduced cooldown:** 10 seconds instead of 60. Only applies when the daemon genuinely failed to start.
- **Lock cleanup on success:** Remove the lock dir after a successful start so subsequent sessions don't hit a false cooldown.
- **More poll attempts:** 10x300ms = 3s instead of 8x200ms = 1.6s. Gives the daemon more time to boot, especially on cold starts.

## 5. Doctor Command

`claude-presence doctor` runs a series of health checks and offers to fix issues it finds.

### Checks (in order)

| # | Check | Pass | Fail | Auto-fix |
|---|-------|------|------|----------|
| 1 | Node.js >= 18 | Show version | Error + exit | No |
| 2 | jq installed | Show version | Error with install instructions | No |
| 3 | Config file exists and parses | Show path | Warn | Offer to run `setup` |
| 4 | Config dir uses new name | OK | Detect old `~/.claude-discord-status/` | Offer migration |
| 5 | Hook script exists at stable path | Show path | Missing | Offer to copy it |
| 6 | Hook script is executable | OK | Wrong permissions | Offer `chmod +x` |
| 7 | All hooks in settings.json point to stable path | OK | Show mismatched paths | Offer to rewrite hook paths |
| 8 | No duplicate hook entries | OK | Show duplicates | Offer to deduplicate |
| 9 | Daemon PID file state | Running (PID) | Stale PID / no PID file | Offer cleanup + restart |
| 10 | Daemon HTTP health | Connected, N sessions, uptime | Unreachable | Offer to start daemon |
| 11 | Discord RPC connected | Connected | Disconnected | Suggest opening Discord app |
| 12 | Old env vars in use | OK | Detect `CLAUDE_DISCORD_*` in environment | Suggest renaming |

### UX

```
$ claude-presence doctor

  claude-presence v2.0.0

  Checking health...

  ✓ Node.js 22.22.0
  ✓ jq 1.7.1
  ✓ Config ~/.claude-presence/config.json
  ✗ Hook paths — 6 hooks point to /opt/homebrew/lib/...
  ✗ Daemon — PID file is stale (process 42867 not running)
  ✗ Discord — daemon not reachable

  Found 3 issues. Fix them? (Y/n)

  ✓ Hook paths updated to ~/.claude-presence/claude-hook.sh
  ✓ Stale PID file removed
  ✓ Daemon started (PID 51234)

  All checks passed.
```

### Implementation

The doctor command is a new function in `cli.ts`. Each check is a simple function returning `{ status: 'pass' | 'fail' | 'warn', message: string, fix?: () => Promise<void> }`. After all checks run, if there are fixable issues, prompt the user once ("Fix N issues?"), then run all fixes in order.

## 6. Files Changed

### Renamed/moved constants
- `constants.ts`: `CONFIG_DIR`, `CONFIG_FILE`, `PID_FILE`, `LOG_FILE`, `HOOK_FILE`, `PACKAGE_NAME` all point to new `~/.claude-presence/` paths and `claude-presence` package name.
- `constants.ts`: Add `LEGACY_CONFIG_DIR` pointing to `~/.claude-discord-status/` for migration detection.

### New files
- None. All new logic lives in existing files (`cli.ts` for doctor + migration, `claude-hook.sh` for smart auto-start).

### Modified files
- `package.json`: name → `claude-presence`, bin → `claude-presence`
- `src/shared/constants.ts`: paths, package name, legacy constants
- `src/shared/config.ts`: env var names (new + old fallback)
- `src/cli.ts`: migration logic, doctor command, setup flow reorder, help text
- `src/hooks/claude-hook.sh`: smart auto-start, new env var names (with old fallback), new config dir path
- `README.md`: all references updated
- `tests/`: update any hardcoded paths or names

### Not changed
- `src/daemon/`: no changes needed. The daemon doesn't care about its own name.
- `src/presets/`: no changes.
- Resolver, sessions, discord client: no changes.

## 7. Testing

### Migration
- Test: old dir exists, new doesn't → moves correctly
- Test: both dirs exist → skips
- Test: neither exists → skips
- Test: hook paths in settings.json are rewritten correctly
- Test: `daemonPath` in config is updated

### Doctor
- Test: each check returns correct status for pass/fail scenarios
- Test: auto-fix functions work (mock filesystem)
- Test: prompt flow (fixable issues → user confirms → fixes applied)

### Smart auto-start
- Test: stale PID detection (PID file with dead process) → cleanup + restart
- Test: cooldown lock respected when < 10s old
- Test: cooldown lock cleared when >= 10s old
- Test: lock removed on successful daemon start

### Setup flow
- Test: preset question comes before custom app question
- Test: custom app question defaults to "No"
- Test: migration runs during setup if applicable

## 8. Breaking Changes

- Binary name changes from `claude-discord-status` to `claude-presence`
- npm package name changes from `claude-code-discord-status` to `claude-presence`
- Config directory moves from `~/.claude-discord-status/` to `~/.claude-presence/`
- Environment variables renamed from `CLAUDE_DISCORD_*` to `CLAUDE_PRESENCE_*` (old names still work as fallback)

All breaking changes are handled by automatic migration. Users running `claude-presence setup` or any command will be migrated transparently.
