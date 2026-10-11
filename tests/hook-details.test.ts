import { describe, it, expect } from 'vitest';
import { describeToolCall, summarizeCommand } from '../src/hook.js';

describe('summarizeCommand', () => {
  it('keeps only the program name', () => {
    expect(summarizeCommand('curl -H "Authorization: Bearer abc" https://x.io')).toBe('curl');
  });

  it('includes the subcommand for common CLIs', () => {
    expect(summarizeCommand('npm test -- --watch')).toBe('npm test');
    expect(summarizeCommand('git commit -m "msg"')).toBe('git commit');
  });

  it('skips cd and env assignments', () => {
    expect(summarizeCommand('cd /repo && API_KEY=secret npm run build')).toBe('npm run');
  });

  it('strips paths and .exe', () => {
    expect(summarizeCommand('C:\\tools\\node.exe script.js')).toBe('node');
    expect(summarizeCommand('/usr/bin/python3 -m pytest')).toBe('python3');
  });

  it('ignores flag-like subcommands', () => {
    expect(summarizeCommand('git --version')).toBe('git');
  });
});

describe('describeToolCall', () => {
  it('names the file being edited', () => {
    expect(describeToolCall('Edit', { file_path: 'C:\\repo\\src\\hook.ts' })).toEqual({
      actionDetail: 'Editing hook.ts',
      filePath: 'C:\\repo\\src\\hook.ts',
    });
  });

  it('names the file being read without marking it edited', () => {
    expect(describeToolCall('Read', { file_path: '/repo/README.md' })).toEqual({
      actionDetail: 'Reading README.md',
    });
  });

  it('describes agents by type', () => {
    expect(describeToolCall('Agent', { subagent_type: 'Explore' }).actionDetail).toBe(
      'Running Explore agent',
    );
    expect(describeToolCall('Task', {}).actionDetail).toBe('Running an agent');
  });

  it('shows only the host for web fetches', () => {
    expect(describeToolCall('WebFetch', { url: 'https://www.github.com/a/b?token=x' })).toEqual({
      actionDetail: 'Browsing github.com',
    });
  });

  it('returns nothing for tools without useful detail', () => {
    expect(describeToolCall('Grep', { pattern: 'password' })).toEqual({});
    expect(describeToolCall('Edit', undefined)).toEqual({});
  });
});
