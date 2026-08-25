import { randomUUID } from "node:crypto";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { access, appendFile, mkdir, rm, stat, statfs } from "node:fs/promises";
import path from "node:path";
import type { BrowserWindow } from "electron";
import { app } from "electron";
import { IPC, type ExportProgress } from "../shared/ipc";
import type { VisualizerProject } from "../shared/project";
import type { PresetRecord } from "../shared/presets";
import {
  renderProjectMExport,
  type ProjectMExportMetrics
} from "./projectm/projectMExportRenderer";

interface ExportJob {
  id: string;
  window: BrowserWindow;
  controller: AbortController;
  runtime: {
    encoder: ChildProcessWithoutNullStreams;
    decoder: ChildProcessWithoutNullStreams;
    clipDecoder: ChildProcessWithoutNullStreams | null;
    host: import("./projectm/projectMHostService").ProjectMHostService | null;
  } | null;
  completion: Promise<void>;
  cancelled: boolean;
  destination: string;
  phase: ExportProgress["phase"];
  phaseLabel: string;
  cancellationReported: boolean;
}

let activeJob: ExportJob | null = null;

interface FfmpegProbe {
  durationSeconds: number;
  videoEncoder: "libopenh264";
  audioEncoder: "aac";
  openH264Path: string;
}

class ExportDiagnosticLog {
  readonly path: string;
  private queue = Promise.resolve();
  private readonly started = performance.now();
  private writeError: Error | null = null;

  constructor(jobId: string) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    this.path = path.join(
      app.getPath("logs"),
      "exports",
      `export-${stamp}-${jobId.slice(0, 8)}.jsonl`
    );
  }

  record(
    phase: string,
    message: string,
    detail: Record<string, unknown> = {}
  ): void {
    const entry = {
      timestamp: new Date().toISOString(),
      elapsedMs: Math.round((performance.now() - this.started) * 1000) / 1000,
      phase,
      message,
      ...detail
    };
    this.queue = this.queue
      .then(async () => {
        await mkdir(path.dirname(this.path), { recursive: true });
        await appendFile(this.path, `${JSON.stringify(entry)}\n`, "utf8");
      })
      .catch((error: unknown) => {
        this.writeError =
          error instanceof Error ? error : new Error(String(error));
      });
  }

  async flush(): Promise<void> {
    await this.queue;
    if (this.writeError) {
      throw new Error(
        `Scrittura log export non riuscita: ${this.writeError.message}`
      );
    }
  }
}

function abortError(): Error {
  const error = new Error("Esportazione annullata.");
  error.name = "AbortError";
  return error;
}

async function runProbe(
  ffmpeg: string,
  args: string[],
  timeoutMs: number,
  signal: AbortSignal
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  if (signal.aborted) throw abortError();
  const child = spawn(ffmpeg, args, {
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    stdout = (stdout + chunk).slice(-512_000);
  });
  child.stderr.on("data", (chunk: string) => {
    stderr = (stderr + chunk).slice(-512_000);
  });
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      callback();
    };
    const onAbort = () => {
      if (child.exitCode === null) child.kill();
      finish(() => reject(abortError()));
    };
    const timer = setTimeout(() => {
      if (child.exitCode === null) child.kill();
      finish(() =>
        reject(
          new Error(
            `Diagnostica FFmpeg: timeout dopo ${(timeoutMs / 1000).toFixed(0)} s.`
          )
        )
      );
    }, timeoutMs);
    signal.addEventListener("abort", onAbort, { once: true });
    child.once("error", (error) => finish(() => reject(error)));
    child.once("close", (code) =>
      finish(() => resolve({ stdout, stderr, code }))
    );
  });
}

async function probeFfmpeg(
  ffmpeg: string,
  audioPath: string,
  signal: AbortSignal
): Promise<FfmpegProbe> {
  const encoders = await runProbe(
    ffmpeg,
    ["-hide_banner", "-encoders"],
    10_000,
    signal
  );
  const encoderText = `${encoders.stdout}\n${encoders.stderr}`;
  if (!/\blibopenh264\b/.test(encoderText)) {
    throw new Error("Encoder video libopenh264 non disponibile nella build FFmpeg.");
  }
  if (!/^\s*A\S*\s+aac\s/im.test(encoderText)) {
    throw new Error("Encoder audio AAC non disponibile nella build FFmpeg.");
  }
  const media = await runProbe(
    ffmpeg,
    ["-hide_banner", "-i", audioPath],
    10_000,
    signal
  );
  const durationMatch = media.stderr.match(
    /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/
  );
  if (!durationMatch) {
    throw new Error("Durata audio non rilevabile da FFmpeg.");
  }
  const durationSeconds =
    Number(durationMatch[1]) * 3600 +
    Number(durationMatch[2]) * 60 +
    Number(durationMatch[3]);
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error("Durata audio non valida.");
  }
  return {
    durationSeconds,
    videoEncoder: "libopenh264",
    audioEncoder: "aac",
    openH264Path: path.join(path.dirname(ffmpeg), "avcodec-61.dll")
  };
}

async function resolveFfmpeg(): Promise<string> {
  const configured = process.env.AVS_FFMPEG_PATH;
  if (configured) {
    await access(configured);
    return configured;
  }
  const resolved = app.isPackaged
    ? path.join(process.resourcesPath, "native", "ffmpeg", "win-x64", "ffmpeg.exe")
    : path.resolve(__dirname, "../../native/ffmpeg/win-x64/ffmpeg.exe");
  await access(resolved);
  return resolved;
}

function bitrateBytesPerSecond(value: string): number {
  const match = value.trim().match(/^(\d+(?:\.\d+)?)\s*([kmg])?$/i);
  if (!match) return 2_000_000;
  const unit = match[2]?.toLowerCase();
  const multiplier = unit === "g"
    ? 1_000_000_000
    : unit === "m"
      ? 1_000_000
      : unit === "k"
        ? 1_000
        : 1;
  return (Number(match[1]) * multiplier) / 8;
}

export function requiredOutputSpaceBytes(
  project: VisualizerProject,
  audioBytes: number
): number {
  const conservativeSeconds = Math.max(
    60,
    Math.min(4 * 60 * 60, audioBytes / 12_000)
  );
  const estimated =
    bitrateBytesPerSecond(project.exportSettings.videoBitrate) *
      conservativeSeconds +
    bitrateBytesPerSecond(project.exportSettings.audioBitrate) *
      conservativeSeconds;
  return Math.max(512 * 1024 * 1024, estimated * 1.25);
}

export function assertFreeOutputSpace(
  freeBytes: number,
  requiredBytes: number
): void {
  if (freeBytes >= requiredBytes) return;
  throw new Error(
    `Spazio su disco insufficiente: richiesti almeno ${Math.ceil(
      requiredBytes / 1024 / 1024
    )} MB liberi.`
  );
}

async function assertOutputSpace(
  destination: string,
  project: VisualizerProject
): Promise<void> {
  const directory = path.dirname(path.resolve(destination));
  const [filesystem, audio] = await Promise.all([
    statfs(directory),
    project.audioFile ? stat(project.audioFile) : Promise.resolve(null)
  ]);
  const free = Number(filesystem.bavail) * Number(filesystem.bsize);
  const required = requiredOutputSpaceBytes(project, audio?.size ?? 0);
  assertFreeOutputSpace(free, required);
}

function sendProgress(window: BrowserWindow, progress: ExportProgress): void {
  if (!window.isDestroyed()) {
    window.webContents.send(IPC.exportProgress, {
      timestamp: new Date().toISOString(),
      ...progress
    });
  }
}

export function encoderArguments(
  project: VisualizerProject,
  destination: string
): string[] {
  const { width, height, fps } = project.exportSettings;
  return [
    "-hide_banner",
    "-y",
    "-f",
    "rawvideo",
    "-pixel_format",
    "rgba",
    "-video_size",
    `${width}x${height}`,
    "-framerate",
    String(fps),
    "-i",
    "pipe:0",
    "-i",
    project.audioFile as string,
    "-map",
    "0:v:0",
    "-map",
    "1:a:0",
    "-c:v",
    "libopenh264",
    "-profile:v",
    "high",
    "-allow_skip_frames",
    "0",
    "-rc_mode",
    "bitrate",
    "-b:v",
    project.exportSettings.videoBitrate,
    "-maxrate",
    project.exportSettings.videoBitrate,
    "-bufsize",
    "32M",
    "-pix_fmt",
    "yuv420p",
    "-r",
    String(fps),
    "-fps_mode",
    "cfr",
    "-video_track_timescale",
    "90000",
    "-c:a",
    "aac",
    "-b:a",
    project.exportSettings.audioBitrate,
    "-movflags",
    "+faststart",
    "-shortest",
    destination
  ];
}

async function removePartialOutput(destination: string): Promise<void> {
  await rm(destination, { force: true }).catch(() => undefined);
}

function exportMetadata(
  project: VisualizerProject,
  destination: string,
  diagnosticLogPath: string,
  ffmpeg = "",
  probe: FfmpegProbe | null = null
): Partial<ExportProgress> {
  return {
    videoCodec: "libopenh264",
    audioCodec: "aac",
    encoder: probe
      ? "FFmpeg libopenh264 disponibile"
      : "FFmpeg libopenh264",
    width: project.exportSettings.width,
    height: project.exportSettings.height,
    fps: project.exportSettings.fps,
    durationSeconds: probe?.durationSeconds,
    outputPath: destination,
    ffmpegPath: ffmpeg || undefined,
    openH264Path:
      probe?.openH264Path ||
      (ffmpeg ? path.join(path.dirname(ffmpeg), "avcodec-61.dll") : undefined),
    diagnosticLogPath
  };
}

function rendererPhaseLabel(
  phase: NonNullable<ExportProgress["phase"]>
): string {
  switch (phase) {
    case "loading-audio":
      return "Caricamento audio";
    case "starting-effects":
      return "Avvio motore effetti";
    case "composing":
      return "Composizione frame";
    case "encoding":
      return "Codifica video";
    case "finalizing":
      return "Finalizzazione file";
    default:
      return "Preparazione progetto";
  }
}

export async function startExport(
  window: BrowserWindow,
  project: VisualizerProject,
  destination: string,
  presetRecords: readonly PresetRecord[] = []
): Promise<void> {
  if (!project.audioFile) {
    throw new Error("Seleziona un file audio prima di esportare.");
  }
  if (activeJob) {
    throw new Error("È già in corso un'esportazione.");
  }
  if (
    project.exportSettings.width % 2 !== 0 ||
    project.exportSettings.height % 2 !== 0
  ) {
    throw new Error("H.264 yuv420p richiede larghezza e altezza pari.");
  }

  const job: ExportJob = {
    id: randomUUID(),
    window,
    controller: new AbortController(),
    runtime: null,
    completion: Promise.resolve(),
    cancelled: false,
    destination,
    phase: "preparing",
    phaseLabel: "Preparazione progetto",
    cancellationReported: false
  };
  activeJob = job;
  const diagnostic = new ExportDiagnosticLog(job.id);
  const started = performance.now();
  diagnostic.record("preparing", "Job export creato.", {
    jobId: job.id,
    destination,
    audioPath: project.audioFile,
    audioSource: project.audioSource,
    externalAudioPath:
      project.audioSource === "external" ? project.externalAudioFile : null,
    clipPath: project.clip.filePath,
    clipEndMode: project.clip.endMode,
    width: project.exportSettings.width,
    height: project.exportSettings.height,
    fps: project.exportSettings.fps,
    projectMEnabled: project.projectM.enabled
  });
  sendProgress(window, {
    ...exportMetadata(project, destination, diagnostic.path),
    percent: 1,
    phase: "preparing",
    message: "Preparazione progetto e validazione risorse",
    frameCurrent: 0,
    frameTotal: 0,
    elapsedSeconds: 0,
    estimatedRemainingSeconds: null
  });

  job.completion = (async () => {
    let completed = false;
    let latestPercent = 1;
    let ffmpeg = "";
    let probe: FfmpegProbe | null = null;
    try {
      await assertOutputSpace(destination, project);
      await removePartialOutput(destination);
      diagnostic.record("preparing", "Validazione progetto completata.");
      ffmpeg = await resolveFfmpeg();

      job.phase = "loading-audio";
      job.phaseLabel = "Caricamento audio";
      diagnostic.record("loading-audio", "Avvio diagnostica FFmpeg/audio.", {
        ffmpeg,
        audioPath: project.audioFile,
        audioSource: project.audioSource,
        muxedAudioStreams: 1
      });
      sendProgress(window, {
        ...exportMetadata(project, destination, diagnostic.path, ffmpeg),
        percent: 4,
        phase: "loading-audio",
        message: "Verifica encoder e caricamento audio",
        frameCurrent: 0,
        elapsedSeconds: (performance.now() - started) / 1000,
        estimatedRemainingSeconds: null
      });
      probe = await probeFfmpeg(
        ffmpeg,
        project.audioFile as string,
        job.controller.signal
      );
      const frameTotal = Math.ceil(
        probe.durationSeconds * project.exportSettings.fps
      );
      diagnostic.record("loading-audio", "Audio e codec verificati.", {
        durationSeconds: probe.durationSeconds,
        frameTotal,
        videoEncoder: probe.videoEncoder,
        audioEncoder: probe.audioEncoder,
        openH264Path: probe.openH264Path
      });
      sendProgress(window, {
        ...exportMetadata(
          project,
          destination,
          diagnostic.path,
          ffmpeg,
          probe
        ),
        percent: 8,
        phase: "loading-audio",
        message:
          `Audio caricato · ${probe.durationSeconds.toFixed(2)} s · ` +
          `${frameTotal} frame previsti`,
        frameCurrent: 0,
        frameTotal,
        elapsedSeconds: (performance.now() - started) / 1000,
        estimatedRemainingSeconds: null
      });

      const runtime = await renderProjectMExport(
        window,
        ffmpeg,
        encoderArguments(project, destination),
        project,
        presetRecords,
        {
          progress: () => {
            // Lo stato strutturato sottostante è emesso a ogni frame.
          },
          warning: (message, presetId) => {
            diagnostic.record("starting-effects", "Fallback preset.", {
              warning: message,
              presetId
            });
            sendProgress(window, {
              ...exportMetadata(
                project,
                destination,
                diagnostic.path,
                ffmpeg,
                probe
              ),
              percent: latestPercent,
              phase: job.phase,
              message: `Fallback preset: ${message}`,
              frameTotal
            });
          },
          status: (update) => {
            job.phase = update.phase;
            job.phaseLabel = rendererPhaseLabel(update.phase);
            latestPercent =
              update.phase === "starting-effects"
                ? 10
                : update.phase === "loading-audio"
                  ? 12
                  : update.phase === "composing"
                    ? 14
                    : update.phase === "finalizing"
                      ? 98
                      : update.frameCurrent
                        ? 15 + (update.frameCurrent / frameTotal) * 82
                        : 15;
            if (
              !update.frameCurrent ||
              update.frameCurrent === 1 ||
              update.frameCurrent % project.exportSettings.fps === 0 ||
              update.phase === "finalizing"
            ) {
              diagnostic.record(update.phase, update.message, {
                frameCurrent: update.frameCurrent ?? 0,
                frameTotal,
                elapsedSeconds: update.elapsedSeconds,
                framesPerSecond: update.framesPerSecond,
                estimatedRemainingSeconds: update.estimatedRemainingSeconds,
                ...(update.detail ?? {})
              });
            }
            sendProgress(window, {
              ...exportMetadata(
                project,
                destination,
                diagnostic.path,
                ffmpeg,
                probe
              ),
              percent: latestPercent,
              phase: update.phase,
              message: update.message,
              frameCurrent: update.frameCurrent ?? 0,
              frameTotal,
              elapsedSeconds:
                update.elapsedSeconds ?? (performance.now() - started) / 1000,
              framesPerSecond: update.framesPerSecond,
              estimatedRemainingSeconds:
                update.estimatedRemainingSeconds ?? null
            });
          }
        },
        {
          signal: job.controller.signal,
          durationSeconds: probe.durationSeconds,
          outputPath: destination
        }
      );
      job.runtime = runtime;
      if (job.cancelled) {
        job.controller.abort();
        if (runtime.decoder.exitCode === null) runtime.decoder.kill();
        if (runtime.clipDecoder?.exitCode === null) runtime.clipDecoder.kill();
        if (runtime.encoder.exitCode === null) runtime.encoder.kill();
        await runtime.host?.terminate("Esportazione annullata.");
        throw abortError();
      }

      const metrics: ProjectMExportMetrics = await runtime.completion;
      if (job.cancelled) throw abortError();
      completed = true;
      diagnostic.record("completed", "Esportazione completata.", {
        frames: metrics.frames,
        durationSeconds: metrics.durationSeconds,
        elapsedMs: metrics.elapsedMs,
        firstFrameMs: metrics.firstFrameMs,
        ffmpegStartMs: metrics.ffmpegStartMs,
        framesPerSecond:
          metrics.frames / Math.max(0.001, metrics.elapsedMs / 1000),
        blackFrames: metrics.blackFrames,
        duplicateFrames: metrics.duplicateFrames,
        projectMBlackFrames: metrics.projectMBlackFrames,
        frameCoverage: metrics.frameCoverage,
        outputPath: destination
      });
      sendProgress(window, {
        ...exportMetadata(
          project,
          destination,
          diagnostic.path,
          ffmpeg,
          probe
        ),
        percent: 100,
        phase: "completed",
        message:
          `Video creato · ${metrics.frames} frame · ` +
          `${metrics.blackFrames} neri · ${metrics.duplicateFrames} duplicati`,
        frameCurrent: metrics.frames,
        frameTotal,
        elapsedSeconds: metrics.elapsedMs / 1000,
        framesPerSecond:
          metrics.frames / Math.max(0.001, metrics.elapsedMs / 1000),
        estimatedRemainingSeconds: 0,
        done: true
      });
    } catch (error) {
      const cancelled =
        job.cancelled ||
        job.controller.signal.aborted ||
        (error instanceof Error && error.name === "AbortError");
      await removePartialOutput(destination);
      const rawMessage = error instanceof Error ? error.message : String(error);
      const message = cancelled
        ? "Esportazione annullata"
        : `${job.phaseLabel}: ${rawMessage}`;
      diagnostic.record(cancelled ? "cancelled" : "error", message, {
        errorName: error instanceof Error ? error.name : typeof error,
        rawMessage,
        destination
      });
      if (cancelled) {
        if (!job.cancellationReported) {
          job.cancellationReported = true;
          sendProgress(window, {
            ...exportMetadata(
              project,
              destination,
              diagnostic.path,
              ffmpeg,
              probe
            ),
            percent: latestPercent,
            phase: "cancelled",
            message,
            done: true,
            cancelled: true
          });
        }
      } else {
        sendProgress(window, {
          ...exportMetadata(
            project,
            destination,
            diagnostic.path,
            ffmpeg,
            probe
          ),
          percent: latestPercent,
          phase: "error",
          message,
          done: true,
          error: message
        });
      }
    } finally {
      if (!completed) await removePartialOutput(destination);
      if (job.runtime) {
        if (job.runtime.decoder.exitCode === null) job.runtime.decoder.kill();
        if (job.runtime.clipDecoder?.exitCode === null) {
          job.runtime.clipDecoder.kill();
        }
        if (job.runtime.encoder.exitCode === null) job.runtime.encoder.kill();
        if (job.cancelled) {
          await job.runtime.host?.terminate("Esportazione annullata.");
        }
      }
      if (activeJob === job) activeJob = null;
      await diagnostic.flush();
    }
  })();
}

export async function cancelExport(): Promise<boolean> {
  const job = activeJob;
  if (!job) return false;
  job.cancelled = true;
  job.controller.abort();
  if (job.runtime) {
    if (job.runtime.decoder.exitCode === null) job.runtime.decoder.kill();
    if (job.runtime.clipDecoder?.exitCode === null) job.runtime.clipDecoder.kill();
    if (job.runtime.encoder.exitCode === null) job.runtime.encoder.kill();
    await job.runtime.host?.terminate("Esportazione annullata dall'utente.");
  }
  await Promise.race([
    job.completion,
    new Promise<void>((resolve) => setTimeout(resolve, 8_000))
  ]);
  await removePartialOutput(job.destination);
  if (activeJob === job) activeJob = null;
  if (!job.cancellationReported) {
    job.cancellationReported = true;
    sendProgress(job.window, {
      percent: 0,
      phase: "cancelled",
      message: "Esportazione annullata",
      done: true,
      cancelled: true,
      outputPath: job.destination
    });
  }
  return true;
}
