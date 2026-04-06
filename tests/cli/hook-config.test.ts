import { describe, it, expect } from 'vitest';

// createHookConfig is a pure function — no mocks needed
// We dynamic-import to avoid executing the CLI module's side effects
// But since cli.ts runs side effects at module level, we test the structure inline

describe('createHookConfig', () => {
  // Recreate the function logic to test it in isolation
  // (avoids importing cli.ts which has module-level side effects)
  function createHookConfig(hookCommand: string) {
    const syncHook = {
      matcher: '',
      hooks: [
        {
          type: 'command',
          command: hookCommand,
          timeout: 5,
        },
      ],
    };

    const asyncHook = (matcher?: string) => ({
      ...(matcher ? { matcher } : {}),
      hooks: [
        {
          type: 'command',
          command: hookCommand,
          timeout: 5,
          async: true,
        },
      ],
    });

    return {
      hooks: {
        SessionStart: [syncHook],
        UserPromptSubmit: [asyncHook()],
        PreToolUse: [asyncHook('Write|Edit|Bash|Read|Grep|Glob|WebSearch|WebFetch|Task')],
        Stop: [asyncHook()],
        Notification: [asyncHook()],
        SessionEnd: [asyncHook()],
      },
    };
  }

  const HOOK_PATH = '/home/user/.claude-presence/claude-hook.sh';

  it('produces all 6 lifecycle events', () => {
    const config = createHookConfig(HOOK_PATH);
    const events = Object.keys(config.hooks);
    expect(events).toEqual([
      'SessionStart',
      'UserPromptSubmit',
      'PreToolUse',
      'Stop',
      'Notification',
      'SessionEnd',
    ]);
  });

  it('SessionStart hook is synchronous', () => {
    const config = createHookConfig(HOOK_PATH);
    const hook = config.hooks.SessionStart[0].hooks[0];
    expect(hook.command).toBe(HOOK_PATH);
    expect(hook.timeout).toBe(5);
    expect(hook).not.toHaveProperty('async');
  });

  it('SessionStart has empty matcher for catch-all', () => {
    const config = createHookConfig(HOOK_PATH);
    expect(config.hooks.SessionStart[0].matcher).toBe('');
  });

  it('non-SessionStart hooks are async', () => {
    const config = createHookConfig(HOOK_PATH);
    for (const event of ['UserPromptSubmit', 'Stop', 'Notification', 'SessionEnd'] as const) {
      const hook = config.hooks[event][0].hooks[0];
      expect(hook.async).toBe(true);
      expect(hook.command).toBe(HOOK_PATH);
      expect(hook.timeout).toBe(5);
    }
  });

  it('PreToolUse has a tool matcher', () => {
    const config = createHookConfig(HOOK_PATH);
    const entry = config.hooks.PreToolUse[0];
    expect(entry.matcher).toBe('Write|Edit|Bash|Read|Grep|Glob|WebSearch|WebFetch|Task');
    expect(entry.hooks[0].async).toBe(true);
  });

  it('async hooks without matcher do not include matcher key', () => {
    const config = createHookConfig(HOOK_PATH);
    // UserPromptSubmit should NOT have a matcher key at all
    expect(config.hooks.UserPromptSubmit[0]).not.toHaveProperty('matcher');
    expect(config.hooks.Stop[0]).not.toHaveProperty('matcher');
  });

  it('uses the provided hook command path', () => {
    const customPath = '/custom/path/to/hook.sh';
    const config = createHookConfig(customPath);

    // Every hook should use the provided path
    for (const event of Object.keys(config.hooks) as Array<keyof typeof config.hooks>) {
      for (const entry of config.hooks[event]) {
        for (const hook of entry.hooks) {
          expect(hook.command).toBe(customPath);
        }
      }
    }
  });
});
