# Multi-Session Presence

When two or more Claude Code sessions are active simultaneously, the Discord card switches from the standard single-session view to a quirky aggregate view.

## What It Looks Like

**Single session (unchanged):**
```
Using Claude Code                          [claude-logo]
Refactoring the auth middleware
Working on my-project         [coding-icon]
```

**Multi-session (2+):**
```
Using Claude Code                          [claude-logo]
Dual-wielding codebases                     ← quirky message
23 edits · 8 cmds · 2h 15m deep            ← aggregate stats
                                 [coding-icon] ← dominant mode
```

Hover tooltip: *"Technically I'm one Claude in a trenchcoat"*

## Message Tiers

Messages are selected from tier-specific pools based on session count:

| Sessions | Pool | Example |
|---|---|---|
| 2 | `MULTI_SESSION_MESSAGES[2]` | "Dual-wielding codebases" |
| 3 | `MULTI_SESSION_MESSAGES[3]` | "Triple threat detected" |
| 4 | `MULTI_SESSION_MESSAGES[4]` | "4 parallel universes deep" |
| 5+ | `MULTI_SESSION_MESSAGES_OVERFLOW` | "Send help (5 projects)" |

Overflow messages use `{n}` as a placeholder that gets replaced with the actual count.

## Message Rotation

Messages rotate every 5 minutes using a deterministic hash function (`stablePick`):

1. Current time is divided into 5-minute buckets
2. The bucket number is combined with a seed (earliest session's `startedAt`) via Knuth multiplicative hash
3. The hash determines which message to show from the pool

This ensures:
- **No flicker** — Same message for 5 minutes regardless of how many activity updates occur
- **Variety** — Different message each rotation
- **Stability** — Same sessions produce the same sequence

## Stats Line

The second line aggregates `ActivityCounts` across all sessions:

```
23 edits · 8 cmds · 2h 15m deep
```

Rules:
- Only non-zero stats are shown
- Singular form for count of 1 (`"1 edit"`, `"1 cmd"`)
- Elapsed time calculated from the earliest session's `startedAt`
- Hours shown when >= 60 minutes (`"2h 15m deep"`)
- Minutes only when < 60 (`"45m deep"`)
- Falls back to `"Just getting started"` when no activity yet
- Truncated to 128 characters (Discord field limit)

### Counter Mapping

| Activity | smallImageKey | Counter |
|---|---|---|
| Writing/editing code | `coding` | `edits` |
| Running commands | `terminal` | `commands` |
| Searching code/web | `searching` | `searches` |
| Reading files | `reading` | `reads` |
| Thinking/reasoning | `thinking` | `thinks` |

`starting` and `idle` don't increment any counter.

## Dominant Mode Detection

The small icon reflects the dominant activity type across all sessions:

1. Sum each counter type across all sessions
2. If one type exceeds 50% of the total → use that mode's icon
3. Otherwise → use `multi-session` (mixed) icon

| Mode | Icon Key | When |
|---|---|---|
| Coding | `coding` | Edits > 50% of total |
| Terminal | `terminal` | Commands > 50% |
| Searching | `searching` | Searches > 50% |
| Thinking | `thinking` | Thinks > 50% |
| Mixed | `multi-session` | No dominant mode |

## Tooltips

The small icon's hover text is selected from `MULTI_SESSION_TOOLTIPS` using the same `stablePick` mechanism (with a different seed offset so it doesn't correlate with the main message).

Examples:
- "Technically I'm one Claude in a trenchcoat"
- "Each codebase thinks it's the favorite"
- "Gaslit, gatekept, git rebased"
- "In my parallel processing era"

## Adding Messages

All pools are in `src/shared/constants.ts`. To add new messages:

1. Add strings to the appropriate array
2. Run `npm test` — resolver tests verify pools are used correctly
3. No build step needed for the constants themselves, but run `npm run build` before testing with the daemon

Keep messages under 128 characters (Discord limit). For overflow messages, use `{n}` for the session count placeholder.
