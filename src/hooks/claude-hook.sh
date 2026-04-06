#!/usr/bin/env bash
# Claude Code Discord Status — Hook Script
# Reads lifecycle events from stdin and forwards to the daemon.
# Auto-starts the daemon if it's not running.
# Always exits 0 to never block Claude Code.

set -euo pipefail

# Config directory with legacy fallback
CONFIG_DIR="$HOME/.claude-presence"
if [ ! -d "$CONFIG_DIR" ] && [ -d "$HOME/.claude-discord-status" ]; then
  CONFIG_DIR="$HOME/.claude-discord-status"
fi

CONFIG_FILE="$CONFIG_DIR/config.json"
LOG_FILE="$CONFIG_DIR/daemon.log"
PID_FILE="$CONFIG_DIR/daemon.pid"
LOCK_DIR="$CONFIG_DIR/autostart.lock"
AUTOSTART_COOLDOWN=10

# Env var resolution: new names first, old names as fallback
DAEMON_PORT="${CLAUDE_PRESENCE_PORT:-${CLAUDE_DISCORD_PORT:-19452}}"
DAEMON_URL="${CLAUDE_PRESENCE_URL:-${CLAUDE_DISCORD_URL:-http://127.0.0.1:${DAEMON_PORT}}}"
CURL_OPTS="--connect-timeout 1 --max-time 1 -s -o /dev/null"

# Cross-platform file modification time (epoch seconds)
file_mtime() {
  stat -f %m "$1" 2>/dev/null || stat -c %Y "$1" 2>/dev/null || echo 0
}

# Auto-start daemon if not reachable
ensure_daemon() {
  # Step 1: Quick health check — if reachable, we're done
  if curl --connect-timeout 0.5 --max-time 1 -s -o /dev/null "${DAEMON_URL}/health" 2>/dev/null; then
    return 0
  fi

  # Step 2: Check PID file for stale process detection
  if [ -f "$PID_FILE" ]; then
    local pid
    pid=$(cat "$PID_FILE" 2>/dev/null) || true

    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      # Process is alive but HTTP not ready — wait briefly
      local attempts=0
      while [ "$attempts" -lt 5 ]; do
        sleep 0.3
        if curl --connect-timeout 0.3 --max-time 0.5 -s -o /dev/null "${DAEMON_URL}/health" 2>/dev/null; then
          return 0
        fi
        attempts=$((attempts + 1))
      done
      # Daemon is alive but not responding — probably starting from another hook
      return 1
    else
      # Stale PID — process is dead. Clean up and fall through to restart.
      rm -f "$PID_FILE"
      rmdir "$LOCK_DIR" 2>/dev/null || true
    fi
  fi

  # Step 3: Check cooldown lock
  if [ -d "$LOCK_DIR" ]; then
    local lock_age
    lock_age=$(( $(date +%s) - $(file_mtime "$LOCK_DIR") ))
    if [ "$lock_age" -lt "$AUTOSTART_COOLDOWN" ]; then
      return 1
    fi
    rmdir "$LOCK_DIR" 2>/dev/null || true
  fi

  # Step 4: Acquire lock (atomic mkdir)
  if ! mkdir "$LOCK_DIR" 2>/dev/null; then
    return 1
  fi

  # Step 5: Resolve daemon path
  local daemon_path=""

  # Strategy 1: Read from config file
  if [ -f "$CONFIG_FILE" ]; then
    daemon_path=$(jq -r '.daemonPath // empty' "$CONFIG_FILE" 2>/dev/null) || true
  fi

  # Strategy 2: Derive from hook script location
  if [ -z "$daemon_path" ] || [ ! -f "$daemon_path" ]; then
    local script_dir
    script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    daemon_path="${script_dir}/../../dist/daemon/index.js"
  fi

  # Validate daemon path exists
  if [ ! -f "$daemon_path" ]; then
    rmdir "$LOCK_DIR" 2>/dev/null || true
    return 1
  fi

  # Ensure config dir exists
  mkdir -p "$CONFIG_DIR" 2>/dev/null || true

  # Step 6: Spawn daemon in background
  nohup node "$daemon_path" >> "$LOG_FILE" 2>&1 &

  # Step 7: Poll for readiness (10 attempts, 300ms each = 3s max)
  local attempts=0
  while [ "$attempts" -lt 10 ]; do
    sleep 0.3
    if curl --connect-timeout 0.3 --max-time 0.5 -s -o /dev/null "${DAEMON_URL}/health" 2>/dev/null; then
      # Success — remove lock so future hooks don't hit cooldown
      rmdir "$LOCK_DIR" 2>/dev/null || true
      return 0
    fi
    attempts=$((attempts + 1))
  done

  # Failed to start — leave lock for cooldown
  return 1
}

# Read JSON from stdin
INPUT=$(cat)

# Extract fields using jq
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty' 2>/dev/null) || true
HOOK_EVENT=$(echo "$INPUT" | jq -r '.hook_event_name // empty' 2>/dev/null) || true
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty' 2>/dev/null) || true
CWD=$(echo "$INPUT" | jq -r '.cwd // empty' 2>/dev/null) || true

if [ -z "$SESSION_ID" ] || [ -z "$HOOK_EVENT" ]; then
  exit 0
fi

# Ensure daemon is running (auto-start if needed)
ensure_daemon || true

# Helper: POST JSON to daemon
post_json() {
  local endpoint="$1"
  local data="$2"
  curl $CURL_OPTS -X POST \
    -H "Content-Type: application/json" \
    -d "$data" \
    "${DAEMON_URL}${endpoint}" 2>/dev/null || true
}

case "$HOOK_EVENT" in
  SessionStart)
    MATCHER=$(echo "$INPUT" | jq -r '.matcher // empty' 2>/dev/null) || true
    if [ "$MATCHER" = "resume" ]; then
      DETAILS="Resuming session..."
    else
      DETAILS="Starting session..."
    fi
    # Synchronous start — register session with daemon
    post_json "/sessions/${SESSION_ID}/start" \
      "{\"pid\": ${PPID}, \"projectPath\": \"${CWD}\"}"
    post_json "/sessions/${SESSION_ID}/activity" \
      "{\"details\": \"${DETAILS}\", \"smallImageKey\": \"starting\", \"smallImageText\": \"Starting up\", \"priority\": \"hook\"}"
    ;;

  SessionEnd)
    post_json "/sessions/${SESSION_ID}/end" "{}"
    ;;

  UserPromptSubmit)
    post_json "/sessions/${SESSION_ID}/activity" \
      '{"details": "Thinking...", "smallImageKey": "thinking", "smallImageText": "Thinking...", "priority": "hook"}'
    ;;

  PreToolUse)
    DETAILS=""
    ICON="coding"
    ICON_TEXT="Writing code"
    case "$TOOL_NAME" in
      Write|Edit)
        DETAILS="Editing a file"
        ICON="coding"
        ICON_TEXT="Writing code"
        ;;
      Bash)
        DETAILS="Running a command"
        ICON="terminal"
        ICON_TEXT="Running a command"
        ;;
      Read)
        DETAILS="Reading a file"
        ICON="reading"
        ICON_TEXT="Reading files"
        ;;
      Grep|Glob)
        DETAILS="Searching codebase"
        ICON="searching"
        ICON_TEXT="Searching"
        ;;
      WebSearch|WebFetch)
        DETAILS="Searching the web"
        ICON="searching"
        ICON_TEXT="Searching"
        ;;
      Task)
        DETAILS="Running a subtask"
        ICON="thinking"
        ICON_TEXT="Thinking..."
        ;;
      *)
        DETAILS="Working..."
        ICON="coding"
        ICON_TEXT="Working"
        ;;
    esac

    # Truncate details to 128 chars
    DETAILS=$(echo "$DETAILS" | cut -c1-128)

    post_json "/sessions/${SESSION_ID}/activity" \
      "{\"details\": \"${DETAILS}\", \"smallImageKey\": \"${ICON}\", \"smallImageText\": \"${ICON_TEXT}\", \"priority\": \"hook\"}"
    ;;

  Stop)
    post_json "/sessions/${SESSION_ID}/activity" \
      '{"details": "Finished", "smallImageKey": "idle", "smallImageText": "Idle", "priority": "hook"}'
    ;;

  Notification)
    post_json "/sessions/${SESSION_ID}/activity" \
      '{"details": "Waiting for input", "smallImageKey": "idle", "smallImageText": "Idle", "priority": "hook"}'
    ;;

  *)
    # Unknown event, ignore
    ;;
esac

exit 0
