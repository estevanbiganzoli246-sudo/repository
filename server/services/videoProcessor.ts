import fs from "fs";
import path from "path";
import crypto from "crypto";
import { execFile } from "child_process";
import { promisify } from "util";
import https from "https";
import http from "http";

const execFileAsync = promisify(execFile);

export interface ClipProcessOptions {
  url: string;
  videoId: string;
  startSec: number;
  endSec: number;
  quality: "720p" | "1080p";
  outputDir: string;
  onProgress?: (step: "downloading" | "processing" | "finalizing", detail?: string) => void;
}

export interface ClipProcessResult {
  success: boolean;
  filename: string;
  filePath: string;
  durationSeconds: number;
  sizeBytes?: number;
  engineUsed: "cloud-stream+ffmpeg";
  error?: string;
}

export interface VideoProcessorService {
  processClip(options: ClipProcessOptions): Promise<ClipProcessResult>;
  checkHealth(): Promise<{ streamWorker: boolean; ffmpeg: boolean; ready: boolean }>;
}

export class CloudStreamFfmpegProcessor implements VideoProcessorService {
  private ffmpegPath: string;

  constructor() {
    this.ffmpegPath = fs.existsSync("/usr/bin/ffmpeg") ? "/usr/bin/ffmpeg" : "ffmpeg";
  }

  async checkHealth(): Promise<{ streamWorker: boolean; ffmpeg: boolean; ready: boolean }> {
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
      ready: ffmpeg,
    };
  }

  private isDirectMediaUrlOrFile(target: string): boolean {
    if (!target) return false;
    // Local filesystem path
    if (fs.existsSync(target) && fs.statSync(target).isFile()) {
      return true;
    }
    // Direct media URL extensions
    const cleanUrl = target.split("?")[0].toLowerCase();
    const videoExtensions = [".mp4", ".webm", ".mkv", ".mov", ".m4v", ".ts", ".m3u8", ".ogv", ".avi"];
    return videoExtensions.some((ext) => cleanUrl.endsWith(ext));
  }

  private async fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs: number = 15000): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return res;
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === "AbortError") {
        console.error(`[TIMEOUT] Request to ${url} timed out after ${timeoutMs}ms`);
        throw new Error(`Tiempo de espera agotado en la petición (${timeoutMs}ms)`);
      }
      throw err;
    }
  }

  /**
   * Helper to download file from HTTP/HTTPS stream to a local path with timeout & redirect support
   */
  private async downloadStreamToFile(streamUrl: string, destPath: string, timeoutMs: number = 120000): Promise<void> {
    console.log(`[Processor] Starting download URL: ${streamUrl.slice(0, 80)}... -> Dest: ${destPath}`);
    return new Promise((resolve, reject) => {
      let fileStream: fs.WriteStream;
      try {
        fileStream = fs.createWriteStream(destPath);
      } catch (e) {
        reject(e);
        return;
      }

      const request = (currentUrl: string, redirectsRemaining: number = 5) => {
        if (redirectsRemaining <= 0) {
          try { fileStream.close(); } catch {}
          try { fs.unlinkSync(destPath); } catch {}
          reject(new Error("Demasiadas redirecciones en la descarga"));
          return;
        }

        const isHttps = currentUrl.startsWith("https://");
        const client = isHttps ? https : http;

        const req = client.get(
          currentUrl,
          {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            },
            timeout: timeoutMs,
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
              try { fileStream.close(); } catch {}
              try { fs.unlinkSync(destPath); } catch {}
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
              try { fileStream.close(); } catch {}
              try { fs.unlinkSync(destPath); } catch {}
              reject(err);
            });
          }
        );

        req.on("error", (err) => {
          console.error(`[ERROR] Download request error:`, err);
          try { fileStream.close(); } catch {}
          try { fs.unlinkSync(destPath); } catch {}
          reject(err);
        });

        req.on("timeout", () => {
          console.error(`[Processor] Timeout downloading stream after ${timeoutMs}ms`);
          req.destroy();
          try { fileStream.close(); } catch {}
          try { fs.unlinkSync(destPath); } catch {}
          reject(new Error("Tiempo de espera agotado al descargar el flujo de vídeo"));
        });
      };

      request(streamUrl);
    });
  }

  /**
   * Primary method: Resolve YouTube public video stream via cloud extraction pipeline
   */
  private async resolveYouTubeStreamUrl(
    videoUrl: string,
    quality: "720p" | "1080p",
    onProgress?: (step: "downloading" | "processing" | "finalizing", detail?: string) => void
  ): Promise<{ directDownloadUrl?: string; title?: string }> {
    console.log(`[Processor] Starting stream acquisition for: ${videoUrl}`);
    const qFormat = quality === "1080p" ? "1080" : "720";
    const initEndpoint = `https://loader.to/ajax/download.php?format=${qFormat}&url=${encodeURIComponent(videoUrl)}`;

    if (onProgress) onProgress("downloading", "Iniciando descarga cloud del vídeo...");

    console.log(`[Processor] Stream request started -> ${initEndpoint}`);
    const initRes = await this.fetchWithTimeout(initEndpoint, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    }, 15000);

    if (!initRes.ok) {
      throw new Error(`Servicio de extracción no disponible (${initRes.status})`);
    }

    const initData = (await initRes.json()) as {
      success?: boolean;
      id?: string;
      title?: string;
      progress_url?: string;
      download_url?: string;
    };

    if (!initData.success || (!initData.id && !initData.progress_url)) {
      throw new Error("No se pudo iniciar la extracción del flujo de YouTube.");
    }

    if (initData.download_url) {
      console.log(`[Processor] Stream acquired directly`);
      return { directDownloadUrl: initData.download_url, title: initData.title };
    }

    const progressUrl = initData.progress_url || `https://p.oceansaver.in/ajax/progress.php?id=${initData.id}`;

    // Poll until ready (up to 90 seconds - 45 attempts * 2s)
    const maxAttempts = 45;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 2000));

      if (onProgress) {
        onProgress("downloading", `Extrayendo flujo de vídeo... (${Math.min(95, attempt * 2)}%)`);
      }

      try {
        const pollRes = await this.fetchWithTimeout(progressUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          },
        }, 12000);

        if (pollRes.ok) {
          const pollData = (await pollRes.json()) as {
            success?: number | boolean;
            progress?: number;
            text?: string;
            download_url?: string;
          };

          if (pollData.download_url && pollData.download_url.length > 5) {
            console.log(`[Processor] Stream acquired after polling (attempt ${attempt})`);
            return {
              directDownloadUrl: pollData.download_url,
              title: initData.title,
            };
          }
        }
      } catch (pollErr) {
        console.warn(`[ClipForge Stream Worker] Poll attempt ${attempt} warning:`, pollErr);
      }
    }

    console.error(`[Processor] Timeout waiting for stream acquisition after ${maxAttempts * 2}s`);
    throw new Error("Tiempo de espera agotado al obtener el flujo del vídeo.");
  }

  async processClip(options: ClipProcessOptions): Promise<ClipProcessResult> {
    const { url, videoId, startSec, endSec, quality, outputDir, onProgress } = options;
    const duration = endSec - startSec;

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const uniqueId = crypto.randomBytes(4).toString("hex").toUpperCase();
    const outputFilename = `clipforge_${uniqueId}.mp4`;
    const finalOutputPath = path.join(outputDir, outputFilename);
    const tempRawPath = path.join(outputDir, `raw_source_${uniqueId}.mp4`);

    console.log(`[ClipForge Engine] Processing clip (${startSec}s -> ${endSec}s, ${quality}) for target: ${url.slice(0, 80)}`);

    const health = await this.checkHealth();
    if (!health.ffmpeg) {
      return {
        success: false,
        filename: outputFilename,
        filePath: finalOutputPath,
        durationSeconds: duration,
        engineUsed: "cloud-stream+ffmpeg",
        error: "El motor de procesamiento FFmpeg no está disponible en el servidor.",
      };
    }

    try {
      let sourceInputPath = "";

      // CASE A: Direct Media URL or Uploaded Local File
      if (this.isDirectMediaUrlOrFile(url)) {
        sourceInputPath = url;
      } else {
        // CASE B: YouTube Video URL -> Extract real stream through cloud engine
        const streamInfo = await this.resolveYouTubeStreamUrl(url, quality, onProgress);
        if (!streamInfo.directDownloadUrl) {
          throw new Error("No se pudo obtener la URL de descarga directa del vídeo.");
        }

        if (onProgress) onProgress("downloading", "Descargando flujo de vídeo al servidor...");

        console.log(`[Processor] Starting download`);
        await this.downloadStreamToFile(streamInfo.directDownloadUrl, tempRawPath, 120000);
        sourceInputPath = tempRawPath;
      }

      // STEP 2: FFmpeg exact segment slice & transcode
      if (onProgress) onProgress("processing", "Cortando y transcodificando con FFmpeg a H.264 / AAC...");

      console.log(`[FFMPEG START] Input: ${sourceInputPath}, Start: ${startSec}s, Duration: ${duration}s -> Output: ${finalOutputPath}`);

      const ffmpegArgs = [
        "-y",
        "-ss", `${startSec}`,
        "-i", sourceInputPath,
        "-t", `${duration}`,
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-crf", "22",
        "-c:a", "aac",
        "-b:a", "128k",
        "-movflags", "+faststart",
        finalOutputPath,
      ];

      try {
        const { exitCode } = await new Promise<{ exitCode: number }>((resolve, reject) => {
          const child = execFile(this.ffmpegPath, ffmpegArgs, { timeout: 90000 }, (error, stdout, stderr) => {
            if (error) {
              reject(error);
            } else {
              resolve({ exitCode: 0 });
            }
          });
        });
        console.log(`[Processor] Process exited with code: 0`);
        console.log(`[FFMPEG COMPLETE] Process exited successfully.`);
      } catch (ffmpegErr: any) {
        const code = ffmpegErr.code !== undefined ? ffmpegErr.code : (ffmpegErr.signal || 'unknown');
        console.log(`[Processor] Process exited with code: ${code}`);
        console.error(`[ERROR] FFmpeg execution failed or timed out:`, ffmpegErr);
        if (ffmpegErr.signal === 'SIGTERM' || ffmpegErr.killed) {
          console.log(`[Processor] Timeout`);
          console.error(`[TIMEOUT] FFmpeg exceeded 90s timeout limit.`);
        }
        throw new Error(`Error en FFmpeg: ${ffmpegErr.message || "Fallo al recortar vídeo"}`);
      }

      // Clean up raw source if temporary
      if (fs.existsSync(tempRawPath)) {
        try { fs.unlinkSync(tempRawPath); } catch {}
      }

      // Verify generated clip file
      if (fs.existsSync(finalOutputPath)) {
        const stats = fs.statSync(finalOutputPath);
        console.log(`[OUTPUT EXISTS] Path: ${finalOutputPath}, Size: ${stats.size} bytes`);
        if (stats.size > 1000) {
          if (onProgress) onProgress("finalizing", "¡Clip generado exitosamente!");
          return {
            success: true,
            filename: outputFilename,
            filePath: finalOutputPath,
            durationSeconds: duration,
            sizeBytes: stats.size,
            engineUsed: "cloud-stream+ffmpeg",
          };
        }
      }

      throw new Error("El archivo de clip generado no es válido o está vacío.");
    } catch (err: any) {
      console.error("[ERROR] [ClipForge Engine] Error processing clip:", err);

      // Cleanup
      if (fs.existsSync(tempRawPath)) {
        try { fs.unlinkSync(tempRawPath); } catch {}
      }
      if (fs.existsSync(finalOutputPath)) {
        try { fs.unlinkSync(finalOutputPath); } catch {}
      }

      return {
        success: false,
        filename: outputFilename,
        filePath: finalOutputPath,
        durationSeconds: duration,
        engineUsed: "cloud-stream+ffmpeg",
        error: err.message || "Error al procesar el vídeo.",
      };
    }
  }
}

export const defaultVideoProcessor = new CloudStreamFfmpegProcessor();
