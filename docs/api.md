# HTTP API Reference

The daemon exposes a local HTTP API on `127.0.0.1:{port}` (default: `19452`). All request/response bodies are JSON.

## Endpoints

### GET /health

Returns daemon health information.

**Response** `200`
```json
{
  "connected": true,
  "sessions": 2,
  "uptime": 3600
}
```

| Field | Type | Description |
|---|---|---|
| `connected` | boolean | Whether the Discord RPC connection is active |
| `sessions` | number | Number of tracked sessions |
| `uptime` | number | Daemon uptime in seconds |

---

### GET /sessions

Returns all active sessions.

**Response** `200`
```json
[
  {
    "sessionId": "abc-123",
    "pid": 12345,
    "projectPath": "/home/user/my-project",
    "projectName": "my-project",
    "details": "Editing auth.ts",
    "smallImageKey": "coding",
    "smallImageText": "Writing code",
    "startedAt": 1700000000000,
    "lastActivityAt": 1700000060000,
    "lastMcpUpdateAt": 0,
    "status": "active",
    "activityCounts": {
      "edits": 15,
      "commands": 3,
      "searches": 2,
      "reads": 8,
      "thinks": 5
    }
  }
]
```

---

### POST /sessions/:sessionId/start

Register a new session. If a session with the same `projectPath` and `pid` already exists, returns the existing session instead (deduplication).

**Request Body**
```json
{
  "pid": 12345,
  "projectPath": "/home/user/my-project"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `pid` | number | Yes | PID of the Claude Code process (used for liveness checks and dedup) |
| `projectPath` | string | Yes | Absolute path to the project directory |

**Response** `201` (new session)
```json
{
  "sessionId": "abc-123",
  "projectName": "my-project"
}
```

**Response** `200` (deduplicated — existing session returned)
```json
{
  "sessionId": "existing-456",
  "projectName": "my-project"
}
```

**Response** `400` (validation error)
```json
{
  "error": "Invalid request body",
  "details": [...]
}
```

---

### POST /sessions/:sessionId/activity

Update session activity. Triggers a presence resolution and Discord update.

**Request Body**
```json
{
  "details": "Editing auth.ts",
  "smallImageKey": "coding",
  "smallImageText": "Writing code",
  "priority": "hook"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `details` | string \| null | No | Status text (max 128 chars). `null` keeps current value |
| `smallImageKey` | string | No | Icon key — must match a Discord art asset |
| `smallImageText` | string | No | Hover text for the small icon |
| `priority` | `"hook"` \| `"mcp"` | No | Update source. `mcp` starts a 30-second priority window |

**MCP Priority Window**: When `priority` is `"mcp"`, subsequent `"hook"` updates are suppressed for 30 seconds. This prevents Claude's intentional status messages from being overwritten by frequent tool-use hooks.

**Activity Counters**: After updating fields, the daemon increments the activity counter based on `smallImageKey`:

| smallImageKey | Counter |
|---|---|
| `coding` | `edits` |
| `terminal` | `commands` |
| `searching` | `searches` |
| `reading` | `reads` |
| `thinking` | `thinks` |
| `starting`, `idle` | (none) |

**Response** `200`
```json
{
  "sessionId": "abc-123",
  "details": "Editing auth.ts"
}
```

**Response** `404`
```json
{
  "error": "Session not found"
}
```

---

### POST /sessions/:sessionId/end

Remove a session. Triggers presence resolution (may clear Discord activity if no sessions remain).

**Request Body**: Empty object `{}`

**Response** `200`
```json
{
  "ok": true
}
```

**Response** `404`
```json
{
  "error": "Session not found"
}
```

## Valid smallImageKey Values

These must match art assets uploaded to the Discord application:

| Key | Meaning |
|---|---|
| `starting` | Session just started |
| `thinking` | Processing / reasoning |
| `coding` | Writing or editing code |
| `terminal` | Running shell commands |
| `reading` | Reading files |
| `searching` | Searching codebase or web |
| `idle` | No recent activity |
| `multi-session` | Multiple sessions active (used by resolver) |

## Session Lifecycle

```
start → active ──(updates)──> active
                      │
                      ├──(10 min no activity)──> idle
                      │
                      └──(30 min no activity)──> removed

                      ├──(PID dies)──> removed

                      └──(end called)──> removed
```

Sessions are checked for staleness every 30 seconds (configurable via `staleCheckInterval`).
