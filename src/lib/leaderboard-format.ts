/**
 * Formats seconds into competitive programming duration strings.
 * e.g. 113296 seconds -> "31H:28M:16S" (hours can exceed 24)
 */
export function formatEffectiveDuration(totalSeconds: number): string {
  if (totalSeconds < 0 || !Number.isFinite(totalSeconds)) {
    return '00H:00M:00S';
  }
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);

  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(hours)}H:${pad(minutes)}M:${pad(seconds)}S`;
}

/**
 * Formats question solve duration into "M m S sec" or "H h M m S sec"
 * e.g. 2132 seconds -> "35 m 32 sec"
 */
export function formatSolveDuration(seconds: number): string {
  if (seconds <= 0 || !Number.isFinite(seconds)) {
    return '0 m 0 sec';
  }
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours} h ${minutes} m ${secs} sec`;
  }
  return `${minutes} m ${secs} sec`;
}

/**
 * Derives initial letter avatar from handle or name.
 */
export function getAvatarInitial(nameOrHandle?: string | null): string {
  if (!nameOrHandle || !nameOrHandle.trim()) return '?';
  const clean = nameOrHandle.trim().replace(/^[^a-zA-Z0-9]+/, '');
  return (clean[0] || '?').toUpperCase();
}
