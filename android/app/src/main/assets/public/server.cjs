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

// server.ts
var import_express = __toESM(require("express"), 1);
var import_path3 = __toESM(require("path"), 1);
var import_fs3 = __toESM(require("fs"), 1);
var import_crypto3 = __toESM(require("crypto"), 1);
var import_child_process2 = require("child_process");
var import_util2 = require("util");
var import_multer = __toESM(require("multer"), 1);
var import_vite = require("vite");
var import_dotenv = __toESM(require("dotenv"), 1);
var import_genai = require("@google/genai");

// server/utils/urlValidator.ts
function extractValidYouTubeId(urlStr) {
  if (!urlStr || typeof urlStr !== "string") return null;
  const trimmed = urlStr.trim();
  const match = trimmed.match(
    /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?|shorts)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  );
  if (match && match[1] && match[1].length === 11) {
    return match[1].replace(/[^a-zA-Z0-9_-]/g, "");
  }
  return null;
}
function sanitizeYouTubeUrl(urlStr) {
  const videoId = extractValidYouTubeId(urlStr);
  if (!videoId) {
    return { valid: false };
  }
  return {
    valid: true,
    videoId,
    cleanUrl: `https://www.youtube.com/watch?v=${videoId}`
  };
}

// server/utils/timeValidator.ts
function parseTimeToSeconds(timeStr) {
  if (!timeStr || typeof timeStr !== "string") return null;
  const trimmed = timeStr.trim();
  const parts = trimmed.split(":");
  if (parts.length === 3) {
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    const seconds = parseInt(parts[2], 10);
    if (isNaN(hours) || isNaN(minutes) || isNaN(seconds) || hours < 0 || minutes < 0 || minutes >= 60 || seconds < 0 || seconds >= 60) {
      return null;
    }
    return hours * 3600 + minutes * 60 + seconds;
  }
  if (parts.length === 2) {
    const minutes = parseInt(parts[0], 10);
    const seconds = parseInt(parts[1], 10);
    if (isNaN(minutes) || isNaN(seconds) || minutes < 0 || seconds < 0 || seconds >= 60) {
      return null;
    }
    return minutes * 60 + seconds;
  }
  return null;
}
var MAX_CLIP_DURATION_SECONDS = 30 * 60;

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

// server/queue/jobQueue.ts
var import_crypto2 = __toESM(require("crypto"), 1);
var CloudJobQueueManager = class {
  constructor(processor = defaultVideoProcessor, outputDir) {
    this.jobs = /* @__PURE__ */ new Map();
    this.isProcessingQueue = false;
    this.processor = processor;
    this.outputDir = outputDir;
    this.redisUrl = process.env.REDIS_URL;
    setInterval(() => {
      this.purgeExpiredJobs();
    }, 15 * 60 * 1e3);
  }
  async addJob(input) {
    const id = import_crypto2.default.randomBytes(8).toString("hex");
    const now = Date.now();
    const job = {
      id,
      url: input.url,
      videoId: input.videoId,
      startSec: input.startSec,
      endSec: input.endSec,
      quality: input.quality,
      status: "queued",
      progressStep: "En cola para procesamiento cloud...",
      createdAt: now,
      updatedAt: now
    };
    this.jobs.set(id, job);
    console.log(`[JOB CREATED] ID: ${id}, URL: ${input.url.slice(0, 60)}, Quality: ${input.quality}, Segment: ${input.startSec}s - ${input.endSec}s`);
    setImmediate(() => {
      this.processNextJobs();
    });
    return job;
  }
  async getJob(id) {
    return this.jobs.get(id) || null;
  }
  updateJob(id, updates) {
    const existing = this.jobs.get(id);
    if (!existing) return null;
    const updated = {
      ...existing,
      ...updates,
      updatedAt: Date.now()
    };
    this.jobs.set(id, updated);
    return updated;
  }
  async processNextJobs() {
    if (this.isProcessingQueue) return;
    this.isProcessingQueue = true;
    try {
      let hasQueued = true;
      while (hasQueued) {
        hasQueued = false;
        for (const [id, job] of this.jobs.entries()) {
          if (job.status === "queued") {
            hasQueued = true;
            await this.executeJob(id);
            break;
          }
        }
      }
    } finally {
      this.isProcessingQueue = false;
    }
  }
  async executeJob(id) {
    const job = this.jobs.get(id);
    if (!job || job.status !== "queued") return;
    console.log(`[WORKER PICKED JOB] ID: ${id}`);
    this.updateJob(id, {
      status: "downloading",
      progressStep: "Iniciando extracci\xF3n y descarga del flujo de v\xEDdeo..."
    });
    try {
      const result = await this.processor.processClip({
        url: job.url,
        videoId: job.videoId,
        startSec: job.startSec,
        endSec: job.endSec,
        quality: job.quality,
        outputDir: this.outputDir,
        onProgress: (step, detail) => {
          this.updateJob(id, {
            status: step,
            progressStep: detail || `Paso: ${step}`
          });
        }
      });
      if (result.success && result.filename) {
        console.log(`[JOB COMPLETED] ID: ${id}, Filename: ${result.filename}`);
        this.updateJob(id, {
          status: "completed",
          progressStep: "\xA1Clip generado exitosamente!",
          downloadUrl: `/api/download/${result.filename}`,
          filename: result.filename,
          durationSeconds: result.durationSeconds,
          completedAt: Date.now()
        });
      } else {
        console.error(`[ERROR] Job ${id} failed: ${result.error}`);
        this.updateJob(id, {
          status: "failed",
          progressStep: "Error en el procesamiento",
          error: result.error || "No se pudo procesar este video."
        });
      }
    } catch (err) {
      console.error(`[ERROR] Exception processing job ${id}:`, err);
      this.updateJob(id, {
        status: "failed",
        progressStep: "Error interno en el worker",
        error: err.message || "No se pudo procesar este video debido a un error inesperado."
      });
    }
  }
  purgeExpiredJobs() {
    const now = Date.now();
    const maxAge = 60 * 60 * 1e3;
    for (const [id, job] of this.jobs.entries()) {
      if (now - job.createdAt > maxAge) {
        this.jobs.delete(id);
      }
    }
  }
};

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

// server.ts
var execFileAsync2 = (0, import_util2.promisify)(import_child_process2.execFile);
import_dotenv.default.config();
var app = (0, import_express.default)();
var PORT = 3e3;
var TEMP_DIR = process.env.TEMP_DIR || import_path3.default.join(process.cwd(), "temp_clips");
var UPLOADS_DIR = import_path3.default.join(TEMP_DIR, "uploads");
var ai = new import_genai.GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build"
    }
  }
});
if (!import_fs3.default.existsSync(TEMP_DIR)) {
  import_fs3.default.mkdirSync(TEMP_DIR, { recursive: true });
}
if (!import_fs3.default.existsSync(UPLOADS_DIR)) {
  import_fs3.default.mkdirSync(UPLOADS_DIR, { recursive: true });
}
var storage = import_multer.default.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const ext = import_path3.default.extname(file.originalname) || ".mp4";
    const unique = import_crypto3.default.randomBytes(6).toString("hex");
    cb(null, `upload_${unique}${ext}`);
  }
});
var upload = (0, import_multer.default)({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }
  // 500MB max
});
startPeriodicCleanup(TEMP_DIR, 15 * 60 * 1e3, 60 * 60 * 1e3);
var jobQueue = new CloudJobQueueManager(defaultVideoProcessor, TEMP_DIR);
app.use(import_express.default.json());
app.use("/api/*", (req, res, next) => {
  const startTime = Date.now();
  console.log(`[API REQ RECEIVED] Method: ${req.method} | URL: ${req.originalUrl} | Body:`, req.body ? JSON.stringify(req.body) : "none");
  const originalJson = res.json;
  res.json = function(body) {
    const duration = Date.now() - startTime;
    const contentType = res.getHeader("Content-Type") || "application/json";
    console.log(`[API RES SENT] Method: ${req.method} | URL: ${req.originalUrl} | Status: ${res.statusCode} | Content-Type: ${contentType} | Duration: ${duration}ms`);
    return originalJson.call(this, body);
  };
  next();
});
app.post("/api/chat", async (req, res) => {
  try {
    const { messages } = req.body;
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ ok: false, error: "Faltan los mensajes de chat." });
    }
    const formattedHistory = messages.slice(0, -1).map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }]
    }));
    const lastMessage = messages[messages.length - 1].content;
    const chat = ai.chats.create({
      model: "gemini-3.5-flash",
      history: formattedHistory,
      config: {
        systemInstruction: "Eres el Entrenador IA oficial de RunWorld, un coach experto en running, atletismo, nutrici\xF3n deportiva, ritmos (pace), prevenci\xF3n de lesiones, recuperaci\xF3n y motivaci\xF3n. Tus respuestas son motivadoras, cient\xEDficamente fundamentadas, directas, profesionales y en espa\xF1ol."
      }
    });
    const response = await chat.sendMessage({ message: lastMessage });
    return res.json({ ok: true, text: response.text });
  } catch (err) {
    console.error("[RunWorld AI Coach] Error in /api/chat:", err);
    return res.status(500).json({ ok: false, error: err.message || "Error al comunicarse con el Entrenador IA." });
  }
});
app.get("/api/health", async (req, res) => {
  const engineHealth = await defaultVideoProcessor.checkHealth();
  res.json({
    status: "ok",
    service: "ClipForge Engine",
    version: "2.1.0",
    architecture: {
      webApi: "online",
      jobQueue: "ready",
      uploads: "enabled",
      redis: process.env.REDIS_URL ? "configured" : "standalone-memory"
    },
    engine: engineHealth
  });
});
app.post("/api/upload", upload.single("video"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ ok: false, error: "No se subi\xF3 ning\xFAn archivo de v\xEDdeo." });
    }
    const filePath = req.file.path;
    const fileId = import_path3.default.basename(filePath);
    let duration = 0;
    try {
      const { stdout } = await execFileAsync2("ffprobe", [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        filePath
      ]);
      duration = Math.floor(parseFloat(stdout.trim()) || 0);
    } catch {
    }
    res.json({
      ok: true,
      fileId,
      originalName: req.file.originalname,
      size: req.file.size,
      duration
    });
  } catch (err) {
    console.error("[ClipForge] Error in /api/upload:", err);
    res.status(500).json({ ok: false, error: err.message || "Error al subir el archivo de v\xEDdeo." });
  }
});
app.post("/api/youtube/info", async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ ok: false, error: "Ingres\xE1 una URL." });
    }
    const sanitized = sanitizeYouTubeUrl(url);
    if (sanitized.valid && sanitized.videoId) {
      const { videoId } = sanitized;
      let title = "V\xEDdeo de YouTube";
      let channel = "Canal de YouTube";
      const thumbnail = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
      try {
        const oembedRes = await fetch(
          `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`
        );
        if (oembedRes.ok) {
          const oembedData = await oembedRes.json();
          title = oembedData.title || title;
          channel = oembedData.author_name || channel;
        }
      } catch {
      }
      return res.json({
        ok: true,
        type: "youtube",
        videoId,
        url: sanitized.cleanUrl,
        title,
        channel,
        thumbnail
      });
    }
    const cleanUrl = url.split("?")[0].toLowerCase();
    const isDirectMedia = [".mp4", ".webm", ".mkv", ".mov", ".m4v", ".ts", ".m3u8"].some((ext) => cleanUrl.endsWith(ext)) || url.includes("github") || url.includes("sample");
    if (isDirectMedia) {
      const filename = import_path3.default.basename(cleanUrl) || "V\xEDdeo p\xFAblico";
      return res.json({
        ok: true,
        type: "direct",
        videoId: "DIRECT_" + import_crypto3.default.createHash("md5").update(url).digest("hex").slice(0, 8),
        url: url.trim(),
        title: decodeURIComponent(filename),
        channel: "Flujo de v\xEDdeo directo",
        thumbnail: "https://images.unsplash.com/photo-1574717024653-61fd2cf4d44d?w=640&q=80"
      });
    }
    return res.status(400).json({ ok: false, error: "Peg\xE1 una URL v\xE1lida de YouTube o un enlace directo a un archivo de v\xEDdeo (.mp4, .webm, etc.)." });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || "Error al obtener informaci\xF3n del v\xEDdeo." });
  }
});
app.post("/api/clip", async (req, res) => {
  try {
    const { url, fileId, start, end, quality } = req.body;
    let targetUrl = "";
    let videoId = "";
    if (fileId) {
      const filePath = import_path3.default.join(UPLOADS_DIR, import_path3.default.basename(fileId));
      if (!import_fs3.default.existsSync(filePath)) {
        return res.status(400).json({
          ok: false,
          error: "El archivo subido no se encuentra en el servidor temporal."
        });
      }
      targetUrl = filePath;
      videoId = "FILE_" + fileId.slice(0, 10);
    } else if (url && typeof url === "string") {
      const sanitizedUrl = sanitizeYouTubeUrl(url);
      if (sanitizedUrl.valid && sanitizedUrl.videoId && sanitizedUrl.cleanUrl) {
        targetUrl = sanitizedUrl.cleanUrl;
        videoId = sanitizedUrl.videoId;
      } else {
        const clean = url.split("?")[0].toLowerCase();
        const isDirect = [".mp4", ".webm", ".mkv", ".mov", ".m4v", ".ts", ".m3u8"].some((ext) => clean.endsWith(ext)) || url.includes("github") || url.includes("sample");
        if (isDirect) {
          targetUrl = url.trim();
          videoId = "DIRECT_" + import_crypto3.default.createHash("md5").update(url).digest("hex").slice(0, 8);
        } else {
          return res.status(400).json({
            ok: false,
            error: "Peg\xE1 una URL v\xE1lida de YouTube o un enlace directo a un archivo de v\xEDdeo (.mp4, .webm)."
          });
        }
      }
    } else {
      return res.status(400).json({
        ok: false,
        error: "Por favor, proporcion\xE1 una URL o sub\xED un archivo de v\xEDdeo."
      });
    }
    const startSec = parseTimeToSeconds(start);
    if (startSec === null) {
      return res.status(400).json({
        ok: false,
        error: "El tiempo de inicio es inv\xE1lido (formato HH:MM:SS o MM:SS)."
      });
    }
    const endSec = parseTimeToSeconds(end);
    if (endSec === null) {
      return res.status(400).json({
        ok: false,
        error: "El tiempo final es inv\xE1lido (formato HH:MM:SS o MM:SS)."
      });
    }
    if (endSec <= startSec) {
      return res.status(400).json({
        ok: false,
        error: "El tiempo final debe ser posterior al inicio."
      });
    }
    const clipDuration = endSec - startSec;
    if (clipDuration > MAX_CLIP_DURATION_SECONDS) {
      return res.status(400).json({
        ok: false,
        error: "El clip no puede superar los 30 minutos."
      });
    }
    const selectedQuality = quality === "1080p" ? "1080p" : "720p";
    const job = await jobQueue.addJob({
      url: targetUrl,
      videoId,
      startSec,
      endSec,
      quality: selectedQuality
    });
    return res.status(202).json({
      ok: true,
      jobId: job.id,
      status: job.status,
      progressStep: job.progressStep
    });
  } catch (err) {
    console.error("[ClipForge] Error creating job in /api/clip:", err);
    return res.status(500).json({
      ok: false,
      error: "No se pudo encolar el trabajo de procesamiento. Por favor, intent\xE1 nuevamente."
    });
  }
});
app.get("/api/clip/:jobId/status", async (req, res) => {
  const { jobId } = req.params;
  const job = await jobQueue.getJob(jobId);
  if (!job) {
    return res.status(404).json({
      ok: false,
      jobId,
      status: "failed",
      error: "Trabajo no encontrado o ha expirado."
    });
  }
  return res.json({
    ok: true,
    jobId: job.id,
    status: job.status,
    progressStep: job.progressStep,
    download: job.downloadUrl,
    filename: job.filename,
    durationSeconds: job.durationSeconds,
    quality: job.quality,
    error: job.error
  });
});
app.get("/api/download/:filename", (req, res) => {
  const { filename } = req.params;
  const safeFilenameRegex = /^clipforge_[A-F0-9]{8}\.mp4$/i;
  if (!safeFilenameRegex.test(filename)) {
    return res.status(400).send("Nombre de archivo inv\xE1lido.");
  }
  const filePath = import_path3.default.join(TEMP_DIR, filename);
  if (!import_fs3.default.existsSync(filePath)) {
    return res.status(404).send("El clip solicitado ha expirado o no existe.");
  }
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Content-Type", "video/mp4");
  const fileStream = import_fs3.default.createReadStream(filePath);
  fileStream.pipe(res);
});
app.use("/api/*", (req, res) => {
  res.status(404).json({
    ok: false,
    error: `Endpoint API no encontrado: ${req.method} ${req.originalUrl}`
  });
});
app.use((err, req, res, next) => {
  if (req.originalUrl.startsWith("/api/")) {
    console.error(`[API ERROR UNCAUGHT] ${req.method} ${req.originalUrl}:`, err);
    if (!res.headersSent) {
      return res.status(500).json({
        ok: false,
        error: err.message || "Error interno del servidor en API"
      });
    }
  }
  next(err);
});
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await (0, import_vite.createServer)({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path3.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(import_path3.default.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`ClipForge Server live on http://localhost:${PORT}`);
  });
}
startServer();
//# sourceMappingURL=server.cjs.map
