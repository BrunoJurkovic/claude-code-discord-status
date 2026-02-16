import { defineConfig } from 'tsup';

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
  },
]);
