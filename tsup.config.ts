import { defineConfig } from 'tsup';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));
const define = { __VERSION__: JSON.stringify(pkg.version) };

export default defineConfig([
  {
    entry: { cli: 'src/cli.ts' },
    format: ['esm'],
    target: 'node18',
    platform: 'node',
    splitting: false,
    sourcemap: true,
    clean: true,
    dts: false,
    external: ['@xhayper/discord-rpc', '@modelcontextprotocol/sdk', 'zod'],
    banner: {
      js: '#!/usr/bin/env node',
    },
    define,
  },
  {
    entry: {
      'daemon/index': 'src/daemon/index.ts',
      'mcp/index': 'src/mcp/index.ts',
    },
    format: ['esm'],
    target: 'node18',
    platform: 'node',
    splitting: false,
    sourcemap: true,
    clean: false,
    dts: false,
    external: ['@xhayper/discord-rpc', '@modelcontextprotocol/sdk', 'zod'],
    define,
  },
]);
