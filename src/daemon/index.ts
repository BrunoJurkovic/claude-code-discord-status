import { writeFileSync, mkdirSync } from 'node:fs';
import { loadConfig } from '../shared/config.js';
import { CONFIG_DIR, PID_FILE, UPDATE_CHECK_INTERVAL } from '../shared/constants.js';
import { SessionRegistry } from './sessions.js';
import { resolvePresence } from './resolver.js';
import { DiscordClient } from './discord.js';
import { createDaemonServer } from './server.js';
import { VERSION } from '../shared/version.js';
import { checkForUpdate } from '../shared/update-checker.js';
import type { UpdateCheckResult } from '../shared/types.js';

const config = loadConfig();
const startTime = Date.now();

// Ensure config directory exists
mkdirSync(CONFIG_DIR, { recursive: true });

// Write PID file
writeFileSync(PID_FILE, process.pid.toString(), 'utf-8');

// Update check state
let latestUpdateCheck: UpdateCheckResult | null = null;

async function runUpdateCheck(): Promise<void> {
  try {
    latestUpdateCheck = await checkForUpdate(config.updateCheck);
  } catch {
    // Must never crash the daemon
  }
}

// Initialize components
const registry = new SessionRegistry();
const discord = new DiscordClient(config.discordClientId);
const server = createDaemonServer(registry, () => ({
  connected: discord.isConnected(),
  uptime: Math.floor((Date.now() - startTime) / 1000),
  version: VERSION,
  latestVersion: latestUpdateCheck?.latestVersion,
  updateAvailable: latestUpdateCheck?.updateAvailable,
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

// Background update checks
void runUpdateCheck();
const updateCheckInterval = setInterval(() => void runUpdateCheck(), UPDATE_CHECK_INTERVAL);

// Graceful shutdown
async function shutdown(): Promise<void> {
  console.log('Shutting down...');
  clearInterval(staleInterval);
  clearInterval(updateCheckInterval);

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
