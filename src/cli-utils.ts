const green = (s: string) => `\x1b[32m${s}\x1b[39m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[39m`;
export const dim = (s: string) => `\x1b[2m${s}\x1b[22m`;

export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) {
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

export function statusBadge(status: string): string {
  if (status === 'active') return green('active');
  if (status === 'idle') return yellow('idle');
  return dim(status);
}

export function connectionBadge(connected: boolean): string {
  return connected ? green('Connected') : yellow('Connecting...');
}
