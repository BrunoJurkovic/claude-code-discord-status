import { Client } from '@xhayper/discord-rpc';
import type { DiscordActivity } from '../shared/types.js';
import { RECONNECT_INTERVAL } from '../shared/constants.js';

export class DiscordClient {
  private client: Client;
  private connected = false;
  private reconnectTimer: ReturnType<typeof setInterval> | null = null;
  private destroyed = false;

  constructor(clientId: string) {
    this.client = new Client({ clientId });

    this.client.on('ready', () => {
      console.log('Connected to Discord RPC');
      this.connected = true;
    });

    this.client.on('disconnected', () => {
      console.log('Disconnected from Discord RPC');
      this.connected = false;
      this.startReconnect();
    });
  }

  async connect(): Promise<void> {
    try {
      await this.client.login();
    } catch (err) {
      console.error('Failed to connect to Discord:', (err as Error).message);
      this.startReconnect();
    }
  }

  private startReconnect(): void {
    if (this.destroyed || this.reconnectTimer) return;

    this.reconnectTimer = setInterval(async () => {
      if (this.destroyed) {
        this.stopReconnect();
        return;
      }
      try {
        await this.client.login();
        this.stopReconnect();
      } catch {
        // Will retry on next interval
      }
    }, RECONNECT_INTERVAL);
  }

  private stopReconnect(): void {
    if (this.reconnectTimer) {
      clearInterval(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  async setActivity(activity: DiscordActivity): Promise<void> {
    if (!this.connected) return;

    try {
      await this.client.user?.setActivity({
        details: activity.details,
        state: activity.state,
        largeImageKey: activity.largeImageKey,
        largeImageText: activity.largeImageText,
        smallImageKey: activity.smallImageKey,
        smallImageText: activity.smallImageText,
        startTimestamp: new Date(activity.startTimestamp),
        type: 0, // Playing
      });
    } catch (err) {
      console.error('Failed to set Discord activity:', (err as Error).message);
    }
  }

  async clearActivity(): Promise<void> {
    if (!this.connected) return;

    try {
      await this.client.user?.clearActivity();
    } catch (err) {
      console.error('Failed to clear Discord activity:', (err as Error).message);
    }
  }

  async destroy(): Promise<void> {
    this.destroyed = true;
    this.stopReconnect();

    if (this.connected) {
      try {
        await this.clearActivity();
        await this.client.destroy();
      } catch {
        // Best effort cleanup
      }
    }

    this.connected = false;
  }
}
