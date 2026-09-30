var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server/worker.ts
var import_path3 = __toESM(require("path"), 1);
var import_fs3 = __toESM(require("fs"), 1);

// server/services/videoProcessor.ts
var import_fs = __toESM(require("fs"), 1);
var import_path = __toESM(require("path"), 1);
var import_crypto = __toESM(require("crypto"), 1);
var import_child_process = require("child_process");
var import_util = require("util");
var import_https = __toESM(require("https"), 1);
var import_http = __toESM(require("http"), 1);
var execFileAsync = (0, import_util.promisify)(import_child_process.execFile);
var CloudStreamFfmpegProcessor = class {
  constructor() {
    this.ffmpegPath = import_fs.default.existsSync("/usr/bin/ffmpeg") ? "/usr/bin/ffmpeg" : "ffmpeg";
  }
  async checkHealth() {
    let ffmpeg = false;
    try {
      await execFileAsync(this.ffmpegPath, ["-version"]);
      ffmpeg = true;
    } catch {
      ffmpeg = false;
    }
    return {
      streamWorker: true,
      ffmpeg,
      ready: ffmpeg
    };
  }
  isDirectMediaUrlOrFile(target) {
    if (!target) return false;
    if (import_fs.default.existsSync(target) && import_fs.default.statSync(target).isFile()) {
      return true;
    }
    const cleanUrl = target.split("?")[0].toLowerCase();
    const videoExtensions = [".mp4", ".webm", ".mkv", ".mov", ".m4v", ".ts", ".m3u8", ".ogv", ".avi"];
    return videoExtensions.some((ext) => cleanUrl.endsWith(ext));
  }
  async fetchWithTimeout(url, options = {}, timeoutMs = 15e3) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      return res;
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === "AbortError") {
        console.error(`[TIMEOUT] Request to ${url} timed out after ${timeoutMs}ms`);
        throw new Error(`Tiempo de espera agotado en la petici\xF3n (${timeoutMs}ms)`);
      }
      throw err;
    }
  }
  /**
   * Helper to download file from HTTP/HTTPS stream to a local path with timeout & redirect support
   */
  async downloadStreamToFile(streamUrl, destPath, timeoutMs = 12e4) {
    console.log(`[Processor] Starting download URL: ${streamUrl.slice(0, 80)}... -> Dest: ${destPath}`);
    return new Promise((resolve, reject) => {
      let fileStream;
      try {
        fileStream = import_fs.default.createWriteStream(destPath);
      } catch (e) {
        reject(e);
        return;
      }
      const request = (currentUrl, redirectsRemaining = 5) => {
        if (redirectsRemaining <= 0) {
          try {
            fileStream.close();
          } catch {
          }
          try {
            import_fs.default.unlinkSync(destPath);
          } catch {
          }
          reject(new Error("Demasiadas redirecciones en la descarga"));
          return;
        }
        const isHttps = currentUrl.startsWith("https://");
        const client = isHttps ? import_https.default : import_http.default;
        const req = client.get(
          currentUrl,
          {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
            },
            timeout: timeoutMs
          },
          (res) => {
            if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
              let redirectUrl = res.headers.location;
              if (!redirectUrl.startsWith("http")) {
                const parsed = new URL(currentUrl);
                redirectUrl = new URL(redirectUrl, parsed.origin).toString();
              }
              request(redirectUrl, redirectsRemaining - 1);
              return;
            }
            if (res.statusCode !== 200) {
              try {
                fileStream.close();
              } catch {
              }
              try {
                import_fs.default.unlinkSync(destPath);
              } catch {
              }
              reject(new Error(`Respuesta HTTP no exitosa (${res.statusCode})`));
              return;
            }
            res.pipe(fileStream);
            fileStream.on("finish", () => {
              fileStream.close();
              console.log(`[Processor] Download completed`);
              resolve();
            });
            fileStream.on("error", (err) => {
              try {
                fileStream.close();
              } catch {
              }
              try {
                import_fs.default.unlinkSync(destPath);
              } catch {
              }
              reject(err);
            });
          }
        );
        req.on("error", (err) => {
          console.error(`[ERROR] Download request error:`, err);
          try {
            fileStream.close();
          } catch {
          }
          try {
            import_fs.default.unlinkSync(destPath);
          } catch {
          }
          reject(err);
        });
        req.on("timeout", () => {
          console.error(`[Processor] Timeout downloading stream after ${timeoutMs}ms`);
          req.destroy();
          try {
            fileStream.close();
          } catch {
          }
          try {
            import_fs.default.unlinkSync(destPath);
          } catch {
          }
          reject(new Error("Tiempo de espera agotado al descargar el flujo de v\xEDdeo"));
        });
      };
      request(streamUrl);
    });
  }
  /**
   * Primary method: Resolve YouTube public video stream via cloud extraction pipeline
   */
  async resolveYouTubeStreamUrl(videoUrl, quality, onProgress) {
    console.log(`[Processor] Starting stream acquisition for: ${videoUrl}`);
    const qFormat = quality === "1080p" ? "1080" : "720";
    const initEndpoint = `https://loader.to/ajax/download.php?format=${qFormat}&url=${encodeURIComponent(videoUrl)}`;
    if (onProgress) onProgress("downloading", "Iniciando descarga cloud del v\xEDdeo...");
    console.log(`[Processor] Stream request started -> ${initEndpoint}`);
    const initRes = await this.fetchWithTimeout(initEndpoint, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
      }
    }, 15e3);
    if (!initRes.ok) {
      throw new Error(`Servicio de extracci\xF3n no disponible (${initRes.status})`);
    }
    const initData = await initRes.json();
    if (!initData.success || !initData.id && !initData.progress_url) {
      throw new Error("No se pudo iniciar la extracci\xF3n del flujo de YouTube.");
    }
    if (initData.download_url) {
      console.log(`[Processor] Stream acquired directly`);
      return { directDownloadUrl: initData.download_url, title: initData.title };
    }
    const progressUrl = initData.progress_url || `https://p.oceansaver.in/ajax/progress.php?id=${initData.id}`;
    const maxAttempts = 45;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 2e3));
      if (onProgress) {
        onProgress("downloading", `Extrayendo flujo de v\xEDdeo... (${Math.min(95, attempt * 2)}%)`);
      }
      try {
        const pollRes = await this.fetchWithTimeout(progressUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
          }
        }, 12e3);
        if (pollRes.ok) {
          const pollData = await pollRes.json();
          if (pollData.download_url && pollData.download_url.length > 5) {
            console.log(`[Processor] Stream acquired after polling (attempt ${attempt})`);
            return {
              directDownloadUrl: pollData.download_url,
              title: initData.title
            };
          }
        }
      } catch (pollErr) {
        console.warn(`[ClipForge Stream Worker] Poll attempt ${attempt} warning:`, pollErr);
      }
    }
    console.error(`[Processor] Timeout waiting for stream acquisition after ${maxAttempts * 2}s`);
    throw new Error("Tiempo de espera agotado al obtener el flujo del v\xEDdeo.");
  }
  async processClip(options) {
    const { url, videoId, startSec, endSec, quality, outputDir, onProgress } = options;
    const duration = endSec - startSec;
    if (!import_fs.default.existsSync(outputDir)) {
      import_fs.default.mkdirSync(outputDir, { recursive: true });
    }
    const uniqueId = import_crypto.default.randomBytes(4).toString("hex").toUpperCase();
    const outputFilename = `clipforge_${uniqueId}.mp4`;
    const finalOutputPath = import_path.default.join(outputDir, outputFilename);
    const tempRawPath = import_path.default.join(outputDir, `raw_source_${uniqueId}.mp4`);
    console.log(`[ClipForge Engine] Processing clip (${startSec}s -> ${endSec}s, ${quality}) for target: ${url.slice(0, 80)}`);
    const health = await this.checkHealth();
    if (!health.ffmpeg) {
      return {
        success: false,
        filename: outputFilename,
        filePath: finalOutputPath,
        durationSeconds: duration,
        engineUsed: "cloud-stream+ffmpeg",
        error: "El motor de procesamiento FFmpeg no est\xE1 disponible en el servidor."
      };
    }
    try {
      let sourceInputPath = "";
      if (this.isDirectMediaUrlOrFile(url)) {
        sourceInputPath = url;
      } else {
        const streamInfo = await this.resolveYouTubeStreamUrl(url, quality, onProgress);
        if (!streamInfo.directDownloadUrl) {
          throw new Error("No se pudo obtener la URL de descarga directa del v\xEDdeo.");
        }
        if (onProgress) onProgress("downloading", "Descargando flujo de v\xEDdeo al servidor...");
        console.log(`[Processor] Starting download`);
        await this.downloadStreamToFile(streamInfo.directDownloadUrl, tempRawPath, 12e4);
        sourceInputPath = tempRawPath;
      }
      if (onProgress) onProgress("processing", "Cortando y transcodificando con FFmpeg a H.264 / AAC...");
      console.log(`[FFMPEG START] Input: ${sourceInputPath}, Start: ${startSec}s, Duration: ${duration}s -> Output: ${finalOutputPath}`);
      const ffmpegArgs = [
        "-y",
        "-ss",
        `${startSec}`,
        "-i",
        sourceInputPath,
        "-t",
        `${duration}`,
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "22",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-movflags",
        "+faststart",
        finalOutputPath
      ];
      try {
        const { exitCode } = await new Promise((resolve, reject) => {
          const child = (0, import_child_process.execFile)(this.ffmpegPath, ffmpegArgs, { timeout: 9e4 }, (error, stdout, stderr) => {
            if (error) {
              reject(error);
            } else {
              resolve({ exitCode: 0 });
            }
          });
        });
        console.log(`[Processor] Process exited with code: 0`);
        console.log(`[FFMPEG COMPLETE] Process exited successfully.`);
      } catch (ffmpegErr) {
        const code = ffmpegErr.code !== void 0 ? ffmpegErr.code : ffmpegErr.signal || "unknown";
        console.log(`[Processor] Process exited with code: ${code}`);
        console.error(`[ERROR] FFmpeg execution failed or timed out:`, ffmpegErr);
        if (ffmpegErr.signal === "SIGTERM" || ffmpegErr.killed) {
          console.log(`[Processor] Timeout`);
          console.error(`[TIMEOUT] FFmpeg exceeded 90s timeout limit.`);
        }
        throw new Error(`Error en FFmpeg: ${ffmpegErr.message || "Fallo al recortar v\xEDdeo"}`);
      }
      if (import_fs.default.existsSync(tempRawPath)) {
        try {
          import_fs.default.unlinkSync(tempRawPath);
        } catch {
        }
      }
      if (import_fs.default.existsSync(finalOutputPath)) {
        const stats = import_fs.default.statSync(finalOutputPath);
        console.log(`[OUTPUT EXISTS] Path: ${finalOutputPath}, Size: ${stats.size} bytes`);
        if (stats.size > 1e3) {
          if (onProgress) onProgress("finalizing", "\xA1Clip generado exitosamente!");
          return {
            success: true,
            filename: outputFilename,
            filePath: finalOutputPath,
            durationSeconds: duration,
            sizeBytes: stats.size,
            engineUsed: "cloud-stream+ffmpeg"
          };
        }
      }
      throw new Error("El archivo de clip generado no es v\xE1lido o est\xE1 vac\xEDo.");
    } catch (err) {
      console.error("[ERROR] [ClipForge Engine] Error processing clip:", err);
      if (import_fs.default.existsSync(tempRawPath)) {
        try {
          import_fs.default.unlinkSync(tempRawPath);
        } catch {
        }
      }
      if (import_fs.default.existsSync(finalOutputPath)) {
        try {
          import_fs.default.unlinkSync(finalOutputPath);
        } catch {
        }
      }
      return {
        success: false,
        filename: outputFilename,
        filePath: finalOutputPath,
        durationSeconds: duration,
        engineUsed: "cloud-stream+ffmpeg",
        error: err.message || "Error al procesar el v\xEDdeo."
      };
    }
  }
};
var defaultVideoProcessor = new CloudStreamFfmpegProcessor();

// server/utils/tempCleaner.ts
var import_fs2 = __toESM(require("fs"), 1);
var import_path2 = __toESM(require("path"), 1);
function cleanupOldTempFiles(directory, maxAgeMs = 60 * 60 * 1e3) {
  try {
    if (!import_fs2.default.existsSync(directory)) {
      import_fs2.default.mkdirSync(directory, { recursive: true });
      return;
    }
    const now = Date.now();
    const files = import_fs2.default.readdirSync(directory);
    for (const file of files) {
      const filePath = import_path2.default.join(directory, file);
      try {
        const stats = import_fs2.default.statSync(filePath);
        if (now - stats.mtimeMs > maxAgeMs) {
          import_fs2.default.unlinkSync(filePath);
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
function startPeriodicCleanup(directory, intervalMs = 15 * 60 * 1e3, maxAgeMs = 60 * 60 * 1e3) {
  cleanupOldTempFiles(directory, maxAgeMs);
  return setInterval(() => {
    cleanupOldTempFiles(directory, maxAgeMs);
  }, intervalMs);
}

// server/worker.ts
var TEMP_DIR = process.env.TEMP_DIR || import_path3.default.join(process.cwd(), "temp_clips");
async function startWorker() {
  console.log("=========================================");
  console.log("   \u{1F680} CLIPFORGE CLOUD PROCESSING WORKER  ");
  console.log("=========================================");
  console.log(`[Worker] Temp Directory: ${TEMP_DIR}`);
  console.log(`[Worker] Redis Connection: ${process.env.REDIS_URL ? "Configured" : "Standalone/Local"}`);
  if (!import_fs3.default.existsSync(TEMP_DIR)) {
    import_fs3.default.mkdirSync(TEMP_DIR, { recursive: true });
  }
  startPeriodicCleanup(TEMP_DIR, 15 * 60 * 1e3, 60 * 60 * 1e3);
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
//# sourceMappingURL=worker.cjs.map
