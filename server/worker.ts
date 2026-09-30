import path from "path";
import fs from "fs";
import { defaultVideoProcessor } from "./services/videoProcessor";
import { startPeriodicCleanup } from "./utils/tempCleaner";

const TEMP_DIR = process.env.TEMP_DIR || path.join(process.cwd(), "temp_clips");

async function startWorker() {
  console.log("=========================================");
  console.log("   🚀 CLIPFORGE CLOUD PROCESSING WORKER  ");
  console.log("=========================================");
  console.log(`[Worker] Temp Directory: ${TEMP_DIR}`);
  console.log(`[Worker] Redis Connection: ${process.env.REDIS_URL ? "Configured" : "Standalone/Local"}`);

  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }

  // Periodic cleaner for expired files
  startPeriodicCleanup(TEMP_DIR, 15 * 60 * 1000, 60 * 60 * 1000);

  // Health check stream worker and ffmpeg
  const health = await defaultVideoProcessor.checkHealth();
  console.log(`[Worker] Stream Worker available: ${health.streamWorker ? "YES" : "NO"}`);
  console.log(`[Worker] FFmpeg available: ${health.ffmpeg ? "YES" : "NO"}`);

  if (!health.ready) {
    console.warn("[Worker Warning] FFmpeg missing in worker environment. Ensure environment has ffmpeg installed.");
  } else {
    console.log("[Worker] Ready to process video clip jobs 24/7.");
  }
}

if (process.env.NODE_ENV !== "test") {
  startWorker();
}
