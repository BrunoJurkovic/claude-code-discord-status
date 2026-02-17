#!/usr/bin/env bash
# Claude Code Discord Status — Hook Script
# Reads lifecycle events from stdin and forwards to the daemon.
# Always exits 0 to never block Claude Code.

set -euo pipefail

DAEMON_URL="${CLAUDE_DISCORD_URL:-http://127.0.0.1:${CLAUDE_DISCORD_PORT:-19452}}"
CURL_OPTS="--connect-timeout 2 --max-time 2 -s -o /dev/null"

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
