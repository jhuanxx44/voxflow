/**
 * Time formatting utilities
 */

/**
 * Converts milliseconds to MM:SS format
 * @param ms - Time in milliseconds
 * @returns Formatted time string (MM:SS)
 *
 * @example
 * msToTime(0) // "00:00"
 * msToTime(65000) // "01:05"
 * msToTime(3661000) // "61:01"
 */
export function msToTime(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

/**
 * Converts milliseconds to HH:MM:SS.mmm format (for debugging/advanced use)
 * @param ms - Time in milliseconds
 * @returns Formatted time string (HH:MM:SS.mmm)
 *
 * @example
 * msToTimeDetailed(0) // "00:00:00.000"
 * msToTimeDetailed(65432) // "00:01:05.432"
 */
export function msToTimeDetailed(ms: number): string {
  const totalMs = Math.max(0, ms);
  const hours = Math.floor(totalMs / 3600000);
  const minutes = Math.floor((totalMs % 3600000) / 60000);
  const seconds = Math.floor((totalMs % 60000) / 1000);
  const milliseconds = Math.floor(totalMs % 1000);

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`;
}
