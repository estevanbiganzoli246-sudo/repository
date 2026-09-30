import fs from "fs";
import path from "path";

/**
 * Clean up files in directory older than maxAgeMs
 */
export function cleanupOldTempFiles(directory: string, maxAgeMs: number = 60 * 60 * 1000): void {
  try {
    if (!fs.existsSync(directory)) {
      fs.mkdirSync(directory, { recursive: true });
      return;
    }

    const now = Date.now();
    const files = fs.readdirSync(directory);

    for (const file of files) {
      const filePath = path.join(directory, file);
      try {
        const stats = fs.statSync(filePath);
        if (now - stats.mtimeMs > maxAgeMs) {
          fs.unlinkSync(filePath);
          console.log(`[ClipForge TempCleaner] Deleted expired file: ${file}`);
        }
      } catch (err) {
        console.error(`[ClipForge TempCleaner] Error checking file ${file}:`, err);
      }
    }
  } catch (err) {
    console.error(`[ClipForge TempCleaner] Error reading temp directory:`, err);
  }
}

/**
 * Schedules periodic cleanup every intervalMs
 */
export function startPeriodicCleanup(directory: string, intervalMs: number = 15 * 60 * 1000, maxAgeMs: number = 60 * 60 * 1000): NodeJS.Timeout {
  cleanupOldTempFiles(directory, maxAgeMs);
  return setInterval(() => {
    cleanupOldTempFiles(directory, maxAgeMs);
  }, intervalMs);
}
