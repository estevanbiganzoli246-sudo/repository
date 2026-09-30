/**
 * Backend Time Validator and Parser for ClipForge
 */

export function parseTimeToSeconds(timeStr: string): number | null {
  if (!timeStr || typeof timeStr !== "string") return null;

  const trimmed = timeStr.trim();
  const parts = trimmed.split(":");

  if (parts.length === 3) {
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    const seconds = parseInt(parts[2], 10);

    if (
      isNaN(hours) || isNaN(minutes) || isNaN(seconds) ||
      hours < 0 || minutes < 0 || minutes >= 60 || seconds < 0 || seconds >= 60
    ) {
      return null;
    }

    return hours * 3600 + minutes * 60 + seconds;
  }

  if (parts.length === 2) {
    const minutes = parseInt(parts[0], 10);
    const seconds = parseInt(parts[1], 10);

    if (
      isNaN(minutes) || isNaN(seconds) ||
      minutes < 0 || seconds < 0 || seconds >= 60
    ) {
      return null;
    }

    return minutes * 60 + seconds;
  }

  return null;
}

export function formatSecondsToTime(totalSeconds: number): string {
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = Math.floor(totalSeconds % 60);

  return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

export const MAX_CLIP_DURATION_SECONDS = 30 * 60; // 30 minutes limit
