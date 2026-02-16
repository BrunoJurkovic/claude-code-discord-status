import { writeFileSync, mkdirSync } from 'node:fs';
import { loadConfig } from '../shared/config.js';
import { CONFIG_DIR, PID_FILE } from '../shared/constants.js';
import { SessionRegistry } from './sessions.js';
import { resolvePresence } from './resolver.js';
import { DiscordClient } from './discord.js';
import { createDaemonServer } from './server.js';

const config = loadConfig();
const startTime = Date.now();

// Ensure config directory exists
mkdirSync(CONFIG_DIR, { recursive: true });

// Write PID file
writeFileSync(PID_FILE, process.pid.toString(), 'utf-8');

// Initialize components
const registry = new SessionRegistry();
const discord = new DiscordClient(config.discordClientId);
const server = createDaemonServer(registry, () => ({
  connected: discord.isConnected(),
  uptime: Math.floor((Date.now() - startTime) / 1000),
}));

// Wire registry changes to presence resolver
registry.onChange(() => {
  const sessions = registry.getAllSessions();
  const activity = resolvePresence(sessions);

  if (activity) {
    discord.setActivity(activity);
  } else {
    discord.clearActivity();
  }
});

// Stale session cleanup
const staleInterval = setInterval(() => {
  registry.checkStaleSessions(config.idleTimeout, config.removeTimeout);
}, config.staleCheckInterval);

// Graceful shutdown
async function shutdown(): Promise<void> {
  console.log('Shutting down...');
  clearInterval(staleInterval);

  server.close();
  await discord.destroy();

  try {
    const { unlinkSync } = await import('node:fs');
    unlinkSync(PID_FILE);
  } catch {
    // PID file may not exist
  }

  process.exit(0);
}

process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());

// Start
server.listen(config.daemonPort, '127.0.0.1', () => {
  console.log(`Daemon listening on http://127.0.0.1:${config.daemonPort}`);
});

discord.connect().catch((err) => {
  console.error('Initial Discord connection failed:', err);
});
