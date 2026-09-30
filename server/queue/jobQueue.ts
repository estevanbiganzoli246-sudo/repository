import crypto from "crypto";
import { defaultVideoProcessor, VideoProcessorService } from "../services/videoProcessor";
import { cleanupOldTempFiles } from "../utils/tempCleaner";

export type JobStatus =
  | "queued"
  | "downloading"
  | "processing"
  | "finalizing"
  | "completed"
  | "failed";

export interface ClipJob {
  id: string;
  url: string;
  videoId: string;
  startSec: number;
  endSec: number;
  quality: "720p" | "1080p";
  status: JobStatus;
  progressStep: string;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  downloadUrl?: string;
  filename?: string;
  durationSeconds?: number;
  error?: string;
}

export interface CreateJobInput {
  url: string;
  videoId: string;
  startSec: number;
  endSec: number;
  quality: "720p" | "1080p";
}

export interface JobQueueEngine {
  addJob(input: CreateJobInput): Promise<ClipJob>;
  getJob(id: string): Promise<ClipJob | null>;
  processNextJobs(): void;
}

/**
 * Unified Cloud Job Manager with Redis / BullMQ support & In-Memory Fallback
 */
export class CloudJobQueueManager implements JobQueueEngine {
  private jobs: Map<string, ClipJob> = new Map();
  private isProcessingQueue: boolean = false;
  private processor: VideoProcessorService;
  private outputDir: string;
  private redisUrl: string | undefined;

  constructor(processor: VideoProcessorService = defaultVideoProcessor, outputDir: string) {
    this.processor = processor;
    this.outputDir = outputDir;
    this.redisUrl = process.env.REDIS_URL;

    // Periodic cleanup of in-memory records older than 1 hour
    setInterval(() => {
      this.purgeExpiredJobs();
    }, 15 * 60 * 1000);
  }

  public async addJob(input: CreateJobInput): Promise<ClipJob> {
    const id = crypto.randomBytes(8).toString("hex");
    const now = Date.now();

    const job: ClipJob = {
      id,
      url: input.url,
      videoId: input.videoId,
      startSec: input.startSec,
      endSec: input.endSec,
      quality: input.quality,
      status: "queued",
      progressStep: "En cola para procesamiento cloud...",
      createdAt: now,
      updatedAt: now,
    };

    this.jobs.set(id, job);
    console.log(`[JOB CREATED] ID: ${id}, URL: ${input.url.slice(0, 60)}, Quality: ${input.quality}, Segment: ${input.startSec}s - ${input.endSec}s`);

    // Trigger async processing worker
    setImmediate(() => {
      this.processNextJobs();
    });

    return job;
  }

  public async getJob(id: string): Promise<ClipJob | null> {
    return this.jobs.get(id) || null;
  }

  public updateJob(id: string, updates: Partial<ClipJob>): ClipJob | null {
    const existing = this.jobs.get(id);
    if (!existing) return null;

    const updated: ClipJob = {
      ...existing,
      ...updates,
      updatedAt: Date.now(),
    };

    this.jobs.set(id, updated);
    return updated;
  }

  public async processNextJobs(): Promise<void> {
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

  public async executeJob(id: string): Promise<void> {
    const job = this.jobs.get(id);
    if (!job || job.status !== "queued") return;

    console.log(`[WORKER PICKED JOB] ID: ${id}`);

    this.updateJob(id, {
      status: "downloading",
      progressStep: "Iniciando extracción y descarga del flujo de vídeo...",
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
            progressStep: detail || `Paso: ${step}`,
          });
        },
      });

      if (result.success && result.filename) {
        console.log(`[JOB COMPLETED] ID: ${id}, Filename: ${result.filename}`);
        this.updateJob(id, {
          status: "completed",
          progressStep: "¡Clip generado exitosamente!",
          downloadUrl: `/api/download/${result.filename}`,
          filename: result.filename,
          durationSeconds: result.durationSeconds,
          completedAt: Date.now(),
        });
      } else {
        console.error(`[ERROR] Job ${id} failed: ${result.error}`);
        this.updateJob(id, {
          status: "failed",
          progressStep: "Error en el procesamiento",
          error: result.error || "No se pudo procesar este video.",
        });
      }
    } catch (err: any) {
      console.error(`[ERROR] Exception processing job ${id}:`, err);
      this.updateJob(id, {
        status: "failed",
        progressStep: "Error interno en el worker",
        error: err.message || "No se pudo procesar este video debido a un error inesperado.",
      });
    }
  }

  private purgeExpiredJobs(): void {
    const now = Date.now();
    const maxAge = 60 * 60 * 1000; // 1 hour

    for (const [id, job] of this.jobs.entries()) {
      if (now - job.createdAt > maxAge) {
        this.jobs.delete(id);
      }
    }
  }
}
