import express from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { execFile } from "child_process";
import { promisify } from "util";
import multer from "multer";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import { sanitizeYouTubeUrl } from "./server/utils/urlValidator";
import { parseTimeToSeconds, MAX_CLIP_DURATION_SECONDS } from "./server/utils/timeValidator";
import { defaultVideoProcessor } from "./server/services/videoProcessor";
import { CloudJobQueueManager } from "./server/queue/jobQueue";
import { startPeriodicCleanup } from "./server/utils/tempCleaner";

const execFileAsync = promisify(execFile);

dotenv.config();

const app = express();
const PORT = 3000;
const TEMP_DIR = process.env.TEMP_DIR || path.join(process.cwd(), "temp_clips");
const UPLOADS_DIR = path.join(TEMP_DIR, "uploads");

// Initialize Gemini AI Client
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

// Ensure temp clips and uploads directory exist
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Multer storage for uploaded video files
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || ".mp4";
    const unique = crypto.randomBytes(6).toString("hex");
    cb(null, `upload_${unique}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB max
});

// Start periodic temp file cleaner (every 15 min, TTL 1 hour)
startPeriodicCleanup(TEMP_DIR, 15 * 60 * 1000, 60 * 60 * 1000);

// Initialize Cloud Job Queue Manager
const jobQueue = new CloudJobQueueManager(defaultVideoProcessor, TEMP_DIR);

app.use(express.json());

// Temporary API request logging & JSON guarantee middleware
app.use("/api/*", (req, res, next) => {
  const startTime = Date.now();
  console.log(`[API REQ RECEIVED] Method: ${req.method} | URL: ${req.originalUrl} | Body:`, req.body ? JSON.stringify(req.body) : "none");

  const originalJson = res.json;
  res.json = function (body) {
    const duration = Date.now() - startTime;
    const contentType = res.getHeader("Content-Type") || "application/json";
    console.log(`[API RES SENT] Method: ${req.method} | URL: ${req.originalUrl} | Status: ${res.statusCode} | Content-Type: ${contentType} | Duration: ${duration}ms`);
    return originalJson.call(this, body);
  };

  next();
});

// AI Coach Chat endpoint: POST /api/chat
app.post("/api/chat", async (req, res) => {
  try {
    const { messages } = req.body;
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ ok: false, error: "Faltan los mensajes de chat." });
    }

    const formattedHistory = messages.slice(0, -1).map((m: any) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));

    const lastMessage = messages[messages.length - 1].content;

    const chat = ai.chats.create({
      model: "gemini-3.5-flash",
      history: formattedHistory,
      config: {
        systemInstruction: "Eres el Entrenador IA oficial de RunWorld, un coach experto en running, atletismo, nutrición deportiva, ritmos (pace), prevención de lesiones, recuperación y motivación. Tus respuestas son motivadoras, científicamente fundamentadas, directas, profesionales y en español.",
      }
    });

    const response = await chat.sendMessage({ message: lastMessage });
    return res.json({ ok: true, text: response.text });
  } catch (err: any) {
    console.error("[RunWorld AI Coach] Error in /api/chat:", err);
    return res.status(500).json({ ok: false, error: err.message || "Error al comunicarse con el Entrenador IA." });
  }
});

// 1. Health check endpoint
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
      redis: process.env.REDIS_URL ? "configured" : "standalone-memory",
    },
    engine: engineHealth,
  });
});

// 2. Video file upload endpoint: POST /api/upload
app.post("/api/upload", upload.single("video"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ ok: false, error: "No se subió ningún archivo de vídeo." });
    }

    const filePath = req.file.path;
    const fileId = path.basename(filePath);

    // Probe duration using ffprobe
    let duration = 0;
    try {
      const { stdout } = await execFileAsync("ffprobe", [
        "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        filePath,
      ]);
      duration = Math.floor(parseFloat(stdout.trim()) || 0);
    } catch {}

    res.json({
      ok: true,
      fileId,
      originalName: req.file.originalname,
      size: req.file.size,
      duration,
    });
  } catch (err: any) {
    console.error("[ClipForge] Error in /api/upload:", err);
    res.status(500).json({ ok: false, error: err.message || "Error al subir el archivo de vídeo." });
  }
});

// 3. YouTube & Direct Media metadata info endpoint
app.post("/api/youtube/info", async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ ok: false, error: "Ingresá una URL." });
    }

    const sanitized = sanitizeYouTubeUrl(url);

    if (sanitized.valid && sanitized.videoId) {
      const { videoId } = sanitized;
      let title = "Vídeo de YouTube";
      let channel = "Canal de YouTube";
      const thumbnail = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;

      try {
        const oembedRes = await fetch(
          `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`
        );
        if (oembedRes.ok) {
          const oembedData = (await oembedRes.json()) as { title?: string; author_name?: string };
          title = oembedData.title || title;
          channel = oembedData.author_name || channel;
        }
      } catch {}

      return res.json({
        ok: true,
        type: "youtube",
        videoId,
        url: sanitized.cleanUrl,
        title,
        channel,
        thumbnail,
      });
    }

    // Check if it is a direct public video URL
    const cleanUrl = url.split("?")[0].toLowerCase();
    const isDirectMedia = [".mp4", ".webm", ".mkv", ".mov", ".m4v", ".ts", ".m3u8"].some((ext) => cleanUrl.endsWith(ext)) || url.includes("github") || url.includes("sample");
    if (isDirectMedia) {
      const filename = path.basename(cleanUrl) || "Vídeo público";
      return res.json({
        ok: true,
        type: "direct",
        videoId: "DIRECT_" + crypto.createHash("md5").update(url).digest("hex").slice(0, 8),
        url: url.trim(),
        title: decodeURIComponent(filename),
        channel: "Flujo de vídeo directo",
        thumbnail: "https://images.unsplash.com/photo-1574717024653-61fd2cf4d44d?w=640&q=80",
      });
    }

    return res.status(400).json({ ok: false, error: "Pegá una URL válida de YouTube o un enlace directo a un archivo de vídeo (.mp4, .webm, etc.)." });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message || "Error al obtener información del vídeo." });
  }
});

// 4. Create Clip Job: POST /api/clip
app.post("/api/clip", async (req, res) => {
  try {
    const { url, fileId, start, end, quality } = req.body;

    let targetUrl = "";
    let videoId = "";

    if (fileId) {
      const filePath = path.join(UPLOADS_DIR, path.basename(fileId));
      if (!fs.existsSync(filePath)) {
        return res.status(400).json({
          ok: false,
          error: "El archivo subido no se encuentra en el servidor temporal.",
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
        // Direct media URL check
        const clean = url.split("?")[0].toLowerCase();
        const isDirect = [".mp4", ".webm", ".mkv", ".mov", ".m4v", ".ts", ".m3u8"].some((ext) => clean.endsWith(ext)) || url.includes("github") || url.includes("sample");
        if (isDirect) {
          targetUrl = url.trim();
          videoId = "DIRECT_" + crypto.createHash("md5").update(url).digest("hex").slice(0, 8);
        } else {
          return res.status(400).json({
            ok: false,
            error: "Pegá una URL válida de YouTube o un enlace directo a un archivo de vídeo (.mp4, .webm).",
          });
        }
      }
    } else {
      return res.status(400).json({
        ok: false,
        error: "Por favor, proporcioná una URL o subí un archivo de vídeo.",
      });
    }

    // Validate Start Time
    const startSec = parseTimeToSeconds(start);
    if (startSec === null) {
      return res.status(400).json({
        ok: false,
        error: "El tiempo de inicio es inválido (formato HH:MM:SS o MM:SS).",
      });
    }

    // Validate End Time
    const endSec = parseTimeToSeconds(end);
    if (endSec === null) {
      return res.status(400).json({
        ok: false,
        error: "El tiempo final es inválido (formato HH:MM:SS o MM:SS).",
      });
    }

    // Validate start < end
    if (endSec <= startSec) {
      return res.status(400).json({
        ok: false,
        error: "El tiempo final debe ser posterior al inicio.",
      });
    }

    // Validate maximum duration limit: 30 minutes
    const clipDuration = endSec - startSec;
    if (clipDuration > MAX_CLIP_DURATION_SECONDS) {
      return res.status(400).json({
        ok: false,
        error: "El clip no puede superar los 30 minutos.",
      });
    }

    // Validate quality
    const selectedQuality = quality === "1080p" ? "1080p" : "720p";

    // Enqueue job in Cloud Job Queue
    const job = await jobQueue.addJob({
      url: targetUrl,
      videoId,
      startSec,
      endSec,
      quality: selectedQuality,
    });

    return res.status(202).json({
      ok: true,
      jobId: job.id,
      status: job.status,
      progressStep: job.progressStep,
    });
  } catch (err: any) {
    console.error("[ClipForge] Error creating job in /api/clip:", err);
    return res.status(500).json({
      ok: false,
      error: "No se pudo encolar el trabajo de procesamiento. Por favor, intentá nuevamente.",
    });
  }
});

// 4. Job Status Polling endpoint: GET /api/clip/:jobId/status
app.get("/api/clip/:jobId/status", async (req, res) => {
  const { jobId } = req.params;
  const job = await jobQueue.getJob(jobId);

  if (!job) {
    return res.status(404).json({
      ok: false,
      jobId,
      status: "failed",
      error: "Trabajo no encontrado o ha expirado.",
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
    error: job.error,
  });
});

// 5. Download endpoint: GET /api/download/:filename
app.get("/api/download/:filename", (req, res) => {
  const { filename } = req.params;

  // Strict filename validation to prevent path traversal
  const safeFilenameRegex = /^clipforge_[A-F0-9]{8}\.mp4$/i;
  if (!safeFilenameRegex.test(filename)) {
    return res.status(400).send("Nombre de archivo inválido.");
  }

  const filePath = path.join(TEMP_DIR, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).send("El clip solicitado ha expirado o no existe.");
  }

  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Content-Type", "video/mp4");

  const fileStream = fs.createReadStream(filePath);
  fileStream.pipe(res);
});

// Guarantee JSON response for unhandled /api/* requests (prevent HTML fallback)
app.use("/api/*", (req, res) => {
  res.status(404).json({
    ok: false,
    error: `Endpoint API no encontrado: ${req.method} ${req.originalUrl}`,
  });
});

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (req.originalUrl.startsWith("/api/")) {
    console.error(`[API ERROR UNCAUGHT] ${req.method} ${req.originalUrl}:`, err);
    if (!res.headersSent) {
      return res.status(500).json({
        ok: false,
        error: err.message || "Error interno del servidor en API",
      });
    }
  }
  next(err);
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`ClipForge Server live on http://localhost:${PORT}`);
  });
}

startServer();
