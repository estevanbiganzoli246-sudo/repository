/**
 * YouTube URL Validator and Sanitizer for ClipForge Backend
 */

export function extractValidYouTubeId(urlStr: string): string | null {
  if (!urlStr || typeof urlStr !== "string") return null;

  const trimmed = urlStr.trim();

  // Basic regex match for standard YouTube URL patterns
  const match = trimmed.match(
    /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?|shorts)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  );

  if (match && match[1] && match[1].length === 11) {
    // Return sanitized video ID (letters, numbers, underscore, dash only)
    return match[1].replace(/[^a-zA-Z0-9_-]/g, "");
  }

  return null;
}

export function sanitizeYouTubeUrl(urlStr: string): { valid: boolean; videoId?: string; cleanUrl?: string } {
  const videoId = extractValidYouTubeId(urlStr);
  if (!videoId) {
    return { valid: false };
  }

  return {
    valid: true,
    videoId,
    cleanUrl: `https://www.youtube.com/watch?v=${videoId}`,
  };
}
