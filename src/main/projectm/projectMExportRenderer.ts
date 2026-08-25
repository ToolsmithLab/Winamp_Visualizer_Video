import { once } from "node:events";
import { createHash } from "node:crypto";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { access } from "node:fs/promises";
import type { BrowserWindow } from "electron";
import type { PresetRecord } from "../../shared/presets";
import type { VisualizerProject } from "../../shared/project";
import { PcmAnalysisWindow } from "../../shared/audioAnalysis";
import { buildPresetSequence } from "../../shared/presetSequencer";
import { OfflineSceneCompositor } from "../export/offlineSceneCompositor";
import type { FrameCoverage } from "../../engine/composition/frameLayout";
import { ProjectMHostService } from "./projectMHostService";
import { runtimePaths } from "./projectMRuntime";

export interface ProjectMExportMetrics {
  frames: number;
  fps: number;
  durationSeconds: number;
  presetChanges: number;
  failedChanges: number;
  projectMBlackFrames: number;
  blackFrames: number;
  maximumConsecutiveBlackFrames: number;
  duplicateFrames: number;
  averageProjectMRenderMs: number;
  averageCompositeMs: number;
  averageChangeMs: number;
  elapsedMs: number;
  firstFrameMs: number;
  ffmpegStartMs: number;
  cpuPercent: number;
  peakRssBytes: number;
  peakHeapBytes: number;
  peakExternalBytes: number;
  peakArrayBufferBytes: number;
  peakActiveHandles: number;
  rgbaBytesWritten: number;
  preEncodingFrameHashes: string[];
  projectMFrameHashes: string[];
  hostPid: number | null;
  frameCoverage: FrameCoverage | null;
  sequence: Array<{ time: number; presetId: string }>;
  errors: string[];
}

export interface ProjectMExportCallbacks {
  progress(frame: number, message: string): void;
  warning(message: string, presetId?: string): void;
  status?(update: ExportRendererStatus): void;
  captureTimestamps?: readonly number[];
  capture?: (
    timestamp: number,
    frameIndex: number,
    png: Buffer,
    projectMPng: Buffer | null
  ) => void | Promise<void>;
}

export interface ExportRendererStatus {
  phase:
    | "loading-audio"
    | "starting-effects"
    | "composing"
    | "encoding"
    | "finalizing";
  message: string;
  frameCurrent?: number;
  frameTotal?: number;
  elapsedSeconds?: number;
  framesPerSecond?: number;
  estimatedRemainingSeconds?: number | null;
  detail?: Record<string, unknown>;
}

export interface ProjectMExportOptions {
  signal?: AbortSignal;
  durationSeconds?: number;
  outputPath?: string;
  timeouts?: Partial<typeof EXPORT_TIMEOUTS>;
}

export function clipDecoderArguments(
  project: VisualizerProject,
  durationSeconds: number
): string[] {
  if (!project.clip.filePath) return [];
  const { fps } = project.exportSettings;
  const args = ["-hide_banner", "-loglevel", "error"];
  if (project.clip.endMode === "loop") {
    args.push("-stream_loop", "-1");
  }
  args.push("-i", project.clip.filePath, "-an");
  const filters = [
    `fps=${fps}`
  ];
  if (project.clip.endMode === "freeze") {
    filters.push(
      `tpad=stop_mode=clone:stop_duration=${Math.max(
        0,
        durationSeconds
      ).toFixed(6)}`
    );
  }
  args.push(
    "-vf",
    filters.join(","),
    "-t",
    Math.max(0.001, durationSeconds).toFixed(6),
    "-pix_fmt",
    "rgba",
    "-f",
    "rawvideo",
    "pipe:1"
  );
  return args;
}

export const EXPORT_TIMEOUTS = {
  projectMInitializeMs: 20_000,
  presetLoadMs: 20_000,
  renderIpcMs: 32_000,
  firstFramebufferMs: 35_000,
  ffmpegStartMs: 10_000,
  firstAudioFrameMs: 15_000,
  firstFrameWriteMs: 30_000,
  outputOpenMs: 10_000
} as const;

function abortError(): Error {
  const error = new Error("Esportazione annullata.");
  error.name = "AbortError";
  return error;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError();
}

function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  label: string,
  signal?: AbortSignal,
  onTimeout?: () => void | Promise<void>
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      callback();
    };
    const onAbort = () => finish(() => reject(abortError()));
    const timer = setTimeout(() => {
      finish(() => {
        void Promise.resolve(onTimeout?.()).finally(() => {
          reject(new Error(`${label}: timeout dopo ${(timeoutMs / 1000).toFixed(0)} s.`));
        });
      });
    }, timeoutMs);
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) {
      onAbort();
      return;
    }
    operation.then(
      (value) => finish(() => resolve(value)),
      (error) => finish(() => reject(error))
    );
  });
}

async function waitForSpawn(
  child: ChildProcessWithoutNullStreams,
  timeoutMs: number,
  label: string,
  signal?: AbortSignal
): Promise<void> {
  if (child.pid && child.exitCode === null) return;
  await withTimeout(
    new Promise<void>((resolve, reject) => {
      child.once("spawn", resolve);
      child.once("error", reject);
      child.once("exit", (code) => {
        reject(new Error(`${label} terminato durante l'avvio (${code ?? "?"}).`));
      });
    }),
    timeoutMs,
    label,
    signal,
    () => {
      child.kill();
    }
  );
}

async function waitForOutput(
  outputPath: string,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    throwIfAborted(signal);
    try {
      await access(outputPath);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  throw new Error(
    `Apertura output FFmpeg: timeout dopo ${(timeoutMs / 1000).toFixed(0)} s.`
  );
}

class ExactPcmReader {
  private chunks: Buffer[] = [];
  private offset = 0;
  private ended = false;
  private error: Error | null = null;
  private waiters: Array<() => void> = [];
  private queuedBytes = 0;

  constructor(
    private readonly process: ChildProcessWithoutNullStreams,
    private readonly maximumBufferedBytes: number
  ) {
    process.stdout.on("data", (chunk: Buffer) => {
      this.chunks.push(chunk);
      this.queuedBytes += chunk.byteLength;
      if (this.queuedBytes >= this.maximumBufferedBytes) process.stdout.pause();
      this.wake();
    });
    process.stdout.on("end", () => {
      this.ended = true;
      this.wake();
    });
    process.once("error", (error) => {
      this.error = error;
      this.ended = true;
      this.wake();
    });
  }

  async read(bytes: number, target: Buffer): Promise<number> {
    let written = 0;
    while (written < bytes) {
      if (this.error) throw this.error;
      const chunk = this.chunks[0];
      if (!chunk) {
        if (this.ended) break;
        await new Promise<void>((resolve) => this.waiters.push(resolve));
        continue;
      }
      const available = chunk.byteLength - this.offset;
      const count = Math.min(bytes - written, available);
      chunk.copy(target, written, this.offset, this.offset + count);
      written += count;
      this.offset += count;
      this.queuedBytes -= count;
      if (this.offset === chunk.byteLength) {
        this.chunks.shift();
        this.offset = 0;
      }
      if (
        this.process.stdout.isPaused() &&
        this.queuedBytes < this.maximumBufferedBytes / 2
      ) {
        this.process.stdout.resume();
      }
    }
    return written;
  }

  private wake(): void {
    for (const resolve of this.waiters.splice(0)) resolve();
  }
}

function isNearlyBlack(bytes: Uint8Array): boolean {
  if (!bytes.byteLength) return true;
  let visiblePixels = 0;
  const pixels = bytes.byteLength / 4;
  for (let offset = 0; offset < bytes.byteLength; offset += 4) {
    if (
      Math.max(
        bytes[offset] ?? 0,
        bytes[offset + 1] ?? 0,
        bytes[offset + 2] ?? 0
      ) > 8
    ) {
      visiblePixels += 1;
    }
  }
  return visiblePixels < Math.max(2, pixels * 0.0005);
}

function sha256Frame(bytes: Uint8Array): string {
  return createHash("sha256")
    .update(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength))
    .digest("hex");
}

function sampledHash(bytes: Uint8Array): number {
  let hash = 0x811c9dc5;
  const step = Math.max(4, Math.floor(bytes.byteLength / 2048 / 4) * 4);
  for (let offset = 0; offset < bytes.byteLength; offset += step) {
    hash ^= bytes[offset] ?? 0;
    hash = Math.imul(hash, 0x01000193);
    hash ^= bytes[offset + 1] ?? 0;
    hash = Math.imul(hash, 0x01000193);
    hash ^= bytes[offset + 2] ?? 0;
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function activeHandles(): number {
  const processWithHandles = process as NodeJS.Process & {
    _getActiveHandles?: () => unknown[];
  };
  return processWithHandles._getActiveHandles?.().length ?? 0;
}

async function writeFrame(
  process: ChildProcessWithoutNullStreams,
  frame: Buffer
): Promise<void> {
  if (process.stdin.destroyed || process.exitCode !== null) {
    throw new Error("FFmpeg encoder non è più disponibile.");
  }
  if (process.stdin.write(frame)) return;
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      process.stdin.off("drain", onDrain);
      process.stdin.off("error", onError);
      process.off("close", onClose);
    };
    const onDrain = () => {
      cleanup();
      resolve();
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const onClose = (code: number | null) => {
      cleanup();
      reject(
        new Error(`FFmpeg encoder terminato con codice ${code ?? "?"}.`)
      );
    };
    process.stdin.once("drain", onDrain);
    process.stdin.once("error", onError);
    process.once("close", onClose);
  });
}

function recordMap(records: readonly PresetRecord[]): Map<string, PresetRecord> {
  return new Map(
    records
      .filter(
        (preset) =>
          !preset.quarantined &&
          preset.status !== "missing" &&
          preset.status !== "incompatible"
      )
      .map((preset) => [preset.id, preset])
  );
}

function shouldCapture(
  timestamps: readonly number[] | undefined,
  captured: Set<number>,
  time: number,
  fps: number
): number | null {
  if (!timestamps) return null;
  for (const timestamp of timestamps) {
    if (
      !captured.has(timestamp) &&
      Math.abs(timestamp - time) <= 0.5 / fps + 0.000_001
    ) {
      return timestamp;
    }
  }
  return null;
}

export async function renderProjectMExport(
  _window: BrowserWindow,
  ffmpeg: string,
  encoderArgs: string[],
  project: VisualizerProject,
  records: readonly PresetRecord[],
  callbacks: ProjectMExportCallbacks,
  options: ProjectMExportOptions = {}
): Promise<{
  encoder: ChildProcessWithoutNullStreams;
  decoder: ChildProcessWithoutNullStreams;
  clipDecoder: ChildProcessWithoutNullStreams | null;
  host: ProjectMHostService | null;
  completion: Promise<ProjectMExportMetrics>;
}> {
  const exportStarted = performance.now();
  const timeouts = { ...EXPORT_TIMEOUTS, ...options.timeouts };
  const signal = options.signal;
  throwIfAborted(signal);
  if (!project.audioFile) throw new Error("Audio export mancante.");
  const width = project.exportSettings.width;
  const height = project.exportSettings.height;
  const fps = project.exportSettings.fps;
  const sampleRate = 48_000;
  const pcmFramesPerVideoFrame = sampleRate / fps;
  const pcmBytesPerVideoFrame = pcmFramesPerVideoFrame * 2 * 4;
  const expectedFrames = options.durationSeconds
    ? Math.max(1, Math.ceil(options.durationSeconds * fps))
    : 0;
  const projectMLayer = project.layers.find((layer) => layer.kind === "projectM");
  const useProjectM = Boolean(
    project.projectM.enabled && projectMLayer?.visible
  );
  const presets = recordMap(records);
  const sequence = useProjectM
    ? buildPresetSequence(project.projectM, [...presets.keys()], 24 * 60 * 60)
    : [];
  const initialEvent = sequence[0];
  const initialPreset = initialEvent && presets.get(initialEvent.presetId);
  if (useProjectM && !initialPreset) {
    throw new Error("Nessun preset compatibile disponibile per l'export.");
  }

  let host: ProjectMHostService | null = null;
  let hostPid: number | null = null;
  if (useProjectM && initialPreset) {
    callbacks.status?.({
      phase: "starting-effects",
      message: `Inizializzazione projectM 4.1.6 · ${initialPreset.name}`,
      frameCurrent: 0,
      frameTotal: expectedFrames || undefined,
      detail: {
        presetId: initialPreset.id,
        presetPath: initialPreset.path,
        presetStatus: initialPreset.status,
        textureCount: initialPreset.textures.length,
        missingTextures: initialPreset.missingTextures,
        layerOpacity: projectMLayer?.opacity,
        layerBlendMode: projectMLayer?.blendMode,
        layerVisible: projectMLayer?.visible,
        effectTransform: projectMLayer?.transform,
        cover: {
          fitMode: project.cover.fitMode,
          x: project.cover.x,
          y: project.cover.y,
          width: project.cover.width,
          height: project.cover.height
        },
        project: {
          canvasWidth: project.canvas.width,
          canvasHeight: project.canvas.height,
          exportWidth: width,
          exportHeight: height
        }
      }
    });
    host = new ProjectMHostService({
      ...runtimePaths(),
      presetPath: initialPreset.path
    });
    const status = await withTimeout(
      host.initialize(width, height, project.projectM.randomSeed, false),
      timeouts.projectMInitializeMs,
      "Inizializzazione projectM",
      signal,
      () => host?.terminate("Timeout inizializzazione projectM.")
    );
    if (!status.available) {
      await host.shutdown();
      throw new Error(status.error || "projectM non disponibile per l'export.");
    }
    callbacks.status?.({
      phase: "starting-effects",
      message: `Caricamento Preset MilkDrop: ${initialPreset.name}`,
      frameCurrent: 0,
      frameTotal: expectedFrames || undefined,
      detail: {
        projectMVersion: status.version,
        glRenderer: status.glRenderer,
        glVersion: status.glVersion,
        hostPid: status.pid,
        pendingRequests: host.diagnostics.pendingRequestIds,
        missingTextures: initialPreset.missingTextures
      }
    });
    const loaded = await withTimeout(
      host.loadPreset(initialPreset.path),
      timeouts.presetLoadMs,
      "Caricamento Preset MilkDrop",
      signal,
      () => host?.terminate("Timeout caricamento preset projectM.")
    );
    if (!loaded.available) {
      await host.terminate(loaded.error || "Preset projectM non disponibile.");
      throw new Error(
        loaded.error || `Preset MilkDrop non caricabile: ${initialPreset.name}.`
      );
    }
    hostPid = status.pid;
    await withTimeout(
      host.setPresetLocked(true),
      timeouts.presetLoadMs,
      "Blocco Preset MilkDrop",
      signal,
      () => host?.terminate("Timeout blocco preset projectM.")
    );
  } else {
    callbacks.status?.({
      phase: "starting-effects",
      message: "Motore effetti disattivato · export senza projectM",
      frameCurrent: 0,
      frameTotal: expectedFrames || undefined,
      detail: { projectMEnabled: false }
    });
  }

  callbacks.status?.({
    phase: "composing",
    message: "Inizializzazione compositor cover, effetti e testi",
    frameCurrent: 0,
    frameTotal: expectedFrames || undefined
  });
  const compositor = new OfflineSceneCompositor(width, height);
  try {
    await compositor.loadCover(project.cover.filePath);
  } catch (error) {
    await host?.shutdown();
    compositor.dispose();
    throw new Error(
      `Copertina non caricabile nel compositor: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  throwIfAborted(signal);
  callbacks.status?.({
    phase: "loading-audio",
    message: "Caricamento e decodifica audio PCM",
    frameCurrent: 0,
    frameTotal: expectedFrames || undefined,
    detail: { audioPath: project.audioFile, sampleRate, channels: 2 }
  });
  const decoder = spawn(
    ffmpeg,
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      project.audioFile,
      "-vn",
      "-f",
      "f32le",
      "-ac",
      "2",
      "-ar",
      String(sampleRate),
      "pipe:1"
    ],
    { windowsHide: true }
  );
  const clipDecoder = project.clip.filePath
    ? spawn(
        ffmpeg,
        clipDecoderArguments(
          project,
          options.durationSeconds ?? project.clip.durationSeconds
        ),
        { windowsHide: true }
      )
    : null;
  const encoder = spawn(ffmpeg, encoderArgs, {
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"]
  });
  try {
    await Promise.all([
      waitForSpawn(
        decoder,
        timeouts.ffmpegStartMs,
        "Avvio FFmpeg decoder",
        signal
      ),
      waitForSpawn(
        encoder,
        timeouts.ffmpegStartMs,
        "Avvio FFmpeg encoder OpenH264",
        signal
      ),
      ...(clipDecoder
        ? [
            waitForSpawn(
              clipDecoder,
              timeouts.ffmpegStartMs,
              "Avvio FFmpeg decoder clip",
              signal
            )
          ]
        : [])
    ]);
  } catch (error) {
    if (decoder.exitCode === null) decoder.kill();
    if (clipDecoder?.exitCode === null) clipDecoder.kill();
    if (encoder.exitCode === null) encoder.kill();
    await host?.terminate("Export interrotto durante avvio FFmpeg.");
    compositor.dispose();
    throw error;
  }
  const ffmpegStartMs = performance.now() - exportStarted;
  callbacks.status?.({
    phase: "encoding",
    message: "FFmpeg OpenH264 avviato · apertura output",
    frameCurrent: 0,
    frameTotal: expectedFrames || undefined,
    elapsedSeconds: ffmpegStartMs / 1000,
    detail: {
      decoderPid: decoder.pid,
      encoderPid: encoder.pid,
      ffmpeg,
      outputPath: options.outputPath
    }
  });
  let encoderErrorTail = "";
  let decoderErrorTail = "";
  let clipDecoderErrorTail = "";
  encoder.stderr.setEncoding("utf8");
  encoder.stderr.on("data", (chunk: string) => {
    encoderErrorTail = (encoderErrorTail + chunk).slice(-16_000);
  });
  encoder.stdin.on("error", () => {
    // L'errore viene riportato dal processo/attesa di backpressure.
  });
  decoder.stderr.setEncoding("utf8");
  decoder.stderr.on("data", (chunk: string) => {
    decoderErrorTail = (decoderErrorTail + chunk).slice(-16_000);
  });
  if (clipDecoder) {
    clipDecoder.stderr.setEncoding("utf8");
    clipDecoder.stderr.on("data", (chunk: string) => {
      clipDecoderErrorTail = (clipDecoderErrorTail + chunk).slice(-16_000);
    });
  }
  const reader = new ExactPcmReader(decoder, pcmBytesPerVideoFrame * 4);
  const clipWidth = Math.max(1, project.clip.width || width);
  const clipHeight = Math.max(1, project.clip.height || height);
  const clipFrameBytes = clipWidth * clipHeight * 4;
  const clipReader = clipDecoder
    ? new ExactPcmReader(clipDecoder, clipFrameBytes * 2)
    : null;

  const completion = (async (): Promise<ProjectMExportMetrics> => {
    const started = performance.now();
    const cpuStarted = process.cpuUsage();
    const pcmBuffer = Buffer.allocUnsafe(pcmBytesPerVideoFrame);
    const clipBuffer = clipReader ? Buffer.allocUnsafe(clipFrameBytes) : null;
    const analysis = new PcmAnalysisWindow(2, sampleRate);
    const captured = new Set<number>();
    let frameIndex = 0;
    let firstFrameMs = 0;
    let eventIndex = 1;
    let projectMRenderTotal = 0;
    let compositeTotal = 0;
    let changeTotal = 0;
    let presetChanges = 0;
    let failedChanges = 0;
    let projectMBlackFrames = 0;
    let blackFrames = 0;
    let consecutiveBlack = 0;
    let maximumConsecutiveBlackFrames = 0;
    let duplicateFrames = 0;
    let previousHash: number | null = null;
    let clipEnded = false;
    let rgbaBytesWritten = 0;
    let peakRssBytes = process.memoryUsage().rss;
    let peakHeapBytes = process.memoryUsage().heapUsed;
    let peakExternalBytes = process.memoryUsage().external;
    let peakArrayBufferBytes = process.memoryUsage().arrayBuffers;
    let peakActiveHandles = activeHandles();
    let lastFrameCoverage: FrameCoverage | null = null;
    const preEncodingFrameHashes: string[] = [];
    const projectMFrameHashes: string[] = [];
    const errors: string[] = [];
    const appliedSequence = initialPreset
      ? [{ time: 0, presetId: initialPreset.id }]
      : [];
    try {
      while (true) {
        throwIfAborted(signal);
        if (expectedFrames > 0 && frameIndex >= expectedFrames) break;
        const received =
          frameIndex === 0
            ? await withTimeout(
                reader.read(pcmBytesPerVideoFrame, pcmBuffer),
                timeouts.firstAudioFrameMs,
                "Caricamento primo frame audio",
                signal,
                () => {
                  decoder.kill();
                }
              )
            : await reader.read(pcmBytesPerVideoFrame, pcmBuffer);
        if (received === 0) break;
        if (received < pcmBytesPerVideoFrame) pcmBuffer.fill(0, received);
        const time = frameIndex / fps;
        if (clipReader && clipBuffer && !clipEnded) {
          const clipBytes =
            frameIndex === 0
              ? await withTimeout(
                  clipReader.read(clipFrameBytes, clipBuffer),
                  timeouts.firstFramebufferMs,
                  "Primo framebuffer clip",
                  signal,
                  () => {
                    clipDecoder?.kill();
                  }
                )
              : await clipReader.read(clipFrameBytes, clipBuffer);
          if (clipBytes === clipFrameBytes) {
            compositor.setClipFrame(clipBuffer, clipWidth, clipHeight);
          } else if (clipBytes === 0 && project.clip.endMode === "black") {
            clipEnded = true;
            compositor.setClipFrame(null);
          } else if (
            clipBytes === 0 &&
            frameIndex > 0 &&
            (project.clip.endMode === "freeze" ||
              (expectedFrames > 0 && frameIndex + 1 >= expectedFrames))
          ) {
            // Alcuni demuxer arrotondano il timestamp finale un frame prima di
            // `-t`. Conservare l'ultimo frame già composto evita un buco nero
            // senza inventare un frame o alterare la traccia audio.
            clipEnded = true;
          } else {
            throw new Error(
              clipDecoderErrorTail ||
                `Framebuffer clip incompleto: ${clipBytes}/${clipFrameBytes} byte.`
            );
          }
        }
        while (
          host &&
          eventIndex < sequence.length &&
          (sequence[eventIndex]?.time ?? Number.POSITIVE_INFINITY) <=
            time + 0.5 / fps
        ) {
          const event = sequence[eventIndex] as (typeof sequence)[number];
          eventIndex += 1;
          const preset = presets.get(event.presetId);
          if (!preset) continue;
          const changeStarted = performance.now();
          try {
            await host.loadPreset(preset.path, {
              smoothTransition: project.projectM.transition.enabled,
              transitionSeconds: project.projectM.transition.durationSeconds
            });
            presetChanges += 1;
            appliedSequence.push({ time: event.time, presetId: event.presetId });
          } catch (error) {
            failedChanges += 1;
            const message =
              error instanceof Error ? error.message : String(error);
            errors.push(`${preset.name}: ${message}`);
            callbacks.warning(message, preset.id);
          } finally {
            changeTotal += performance.now() - changeStarted;
          }
        }

        const samples = new Float32Array(
          pcmBuffer.buffer,
          pcmBuffer.byteOffset,
          pcmBytesPerVideoFrame / 4
        );
        const snapshot = analysis.push(samples);
        if (host) {
          if (frameIndex === 0) {
            callbacks.status?.({
              phase: "composing",
              message: "Generazione primo framebuffer projectM",
              frameCurrent: 0,
              frameTotal: expectedFrames || undefined,
              elapsedSeconds: (performance.now() - exportStarted) / 1000,
              detail: {
                width,
                height,
                pendingRequests: host.diagnostics.pendingRequestIds,
                renderInFlight: host.diagnostics.renderInFlight
              }
            });
          }
          const renderStarted = performance.now();
          const projectMFrame = await withTimeout(
            host.render(
              {
                width,
                height,
                steps: 1,
                channels: 2,
                samples
              },
              timeouts.renderIpcMs
            ),
            frameIndex === 0
              ? timeouts.firstFramebufferMs
              : timeouts.renderIpcMs + 1_000,
            frameIndex === 0
              ? "Primo framebuffer projectM"
              : "Risposta IPC render projectM",
            signal,
            () =>
              host?.terminate(
                frameIndex === 0
                  ? "Timeout primo framebuffer projectM."
                  : "Timeout risposta IPC render projectM."
              )
          );
          projectMRenderTotal += performance.now() - renderStarted;
          if (!projectMFrame) {
            throw new Error("Framebuffer projectM export assente.");
          }
          if (
            projectMFrame.width !== width ||
            projectMFrame.height !== height ||
            projectMFrame.stride !== width * 4 ||
            projectMFrame.bytes.byteLength !== width * height * 4
          ) {
            throw new Error(
              `Framebuffer projectM non coerente: ` +
                `${projectMFrame.width}×${projectMFrame.height}, ` +
                `stride ${projectMFrame.stride}, ${projectMFrame.bytes.byteLength} byte; ` +
                `atteso ${width}×${height}, stride ${width * 4}.`
            );
          }
          if (isNearlyBlack(projectMFrame.bytes)) projectMBlackFrames += 1;
          projectMFrameHashes.push(sha256Frame(projectMFrame.bytes));
          compositor.setProjectMFrame(projectMFrame);
        }

        const compositeStarted = performance.now();
        const rgba = compositor.render(project, snapshot, time, fps, useProjectM);
        lastFrameCoverage = compositor.frameCoverage();
        preEncodingFrameHashes.push(sha256Frame(rgba));
        compositeTotal += performance.now() - compositeStarted;
        if (isNearlyBlack(rgba)) {
          blackFrames += 1;
          consecutiveBlack += 1;
          maximumConsecutiveBlackFrames = Math.max(
            maximumConsecutiveBlackFrames,
            consecutiveBlack
          );
        } else {
          consecutiveBlack = 0;
        }
        const hash = sampledHash(rgba);
        if (previousHash === hash) duplicateFrames += 1;
        previousHash = hash;
        const captureTimestamp = shouldCapture(
          callbacks.captureTimestamps,
          captured,
          time,
          fps
        );
        if (captureTimestamp !== null && callbacks.capture) {
          captured.add(captureTimestamp);
          await callbacks.capture(
            captureTimestamp,
            frameIndex,
            compositor.png(),
            host ? compositor.projectMPng() : null
          );
        }
        if (frameIndex === 0) {
          await withTimeout(
            writeFrame(encoder, rgba),
            timeouts.firstFrameWriteMs,
            "Scrittura primo frame in FFmpeg",
            signal,
            () => {
              encoder.kill();
            }
          );
          if (options.outputPath) {
            await waitForOutput(
              options.outputPath,
              timeouts.outputOpenMs,
              signal
            );
          }
          firstFrameMs = performance.now() - exportStarted;
        } else {
          await writeFrame(encoder, rgba);
        }
        rgbaBytesWritten += rgba.byteLength;
        frameIndex += 1;

        const elapsedSeconds = (performance.now() - exportStarted) / 1000;
        const framesPerSecond = frameIndex / Math.max(0.001, elapsedSeconds);
        const estimatedRemainingSeconds = expectedFrames
          ? Math.max(0, expectedFrames - frameIndex) / framesPerSecond
          : null;
        callbacks.status?.({
          phase: "encoding",
          message:
            frameIndex === 1
              ? `Primo frame scritto · composizione frame 1 di ${expectedFrames || "?"}`
              : `Composizione frame ${frameIndex} di ${expectedFrames || "?"}`,
          frameCurrent: frameIndex,
          frameTotal: expectedFrames || undefined,
          elapsedSeconds,
          framesPerSecond,
          estimatedRemainingSeconds,
          detail:
            frameIndex === 1
              ? {
                  firstFrameMs,
                  rgbaBytes: rgba.byteLength,
                  outputOpened: Boolean(options.outputPath),
                  framebuffer: host
                    ? {
                        width,
                        height,
                        stride: width * 4,
                        byteLength: width * height * 4
                      }
                    : null,
                  frameCoverage: lastFrameCoverage,
                  viewport: { x: 0, y: 0, width, height },
                  scissor: { x: 0, y: 0, width, height }
                }
              : undefined
        });
        callbacks.progress(
          frameIndex,
          `Composizione frame ${frameIndex} di ${expectedFrames || "?"}`
        );

        if (frameIndex % Math.max(1, fps) === 0) {
          const memory = process.memoryUsage();
          peakRssBytes = Math.max(peakRssBytes, memory.rss);
          peakHeapBytes = Math.max(peakHeapBytes, memory.heapUsed);
          peakExternalBytes = Math.max(peakExternalBytes, memory.external);
          peakArrayBufferBytes = Math.max(
            peakArrayBufferBytes,
            memory.arrayBuffers
          );
          peakActiveHandles = Math.max(peakActiveHandles, activeHandles());
        }
        if (received < pcmBytesPerVideoFrame) break;
      }
      if (frameIndex === 0) {
        throw new Error(decoderErrorTail || "FFmpeg non ha decodificato frame audio.");
      }
      callbacks.status?.({
        phase: "finalizing",
        message: "Finalizzazione MP4 e indice faststart",
        frameCurrent: frameIndex,
        frameTotal: expectedFrames || frameIndex,
        elapsedSeconds: (performance.now() - exportStarted) / 1000,
        framesPerSecond:
          frameIndex / Math.max(0.001, (performance.now() - exportStarted) / 1000),
        estimatedRemainingSeconds: null
      });
      encoder.stdin.end();
      const [code] = (await once(encoder, "close")) as [number | null];
      if (code !== 0) {
        const diskFull = /no space left|not enough space|disk full/i.test(
          encoderErrorTail
        );
        throw new Error(
          diskFull
            ? "Spazio su disco insufficiente durante l'esportazione."
            : encoderErrorTail ||
                `FFmpeg encoder terminato con codice ${code ?? "?"}.`
        );
      }
      const elapsedMs = performance.now() - exportStarted;
      const cpu = process.cpuUsage(cpuStarted);
      return {
        frames: frameIndex,
        fps,
        durationSeconds: frameIndex / fps,
        presetChanges,
        failedChanges,
        projectMBlackFrames,
        blackFrames,
        maximumConsecutiveBlackFrames,
        duplicateFrames,
        averageProjectMRenderMs: frameIndex
          ? projectMRenderTotal / frameIndex
          : 0,
        averageCompositeMs: frameIndex ? compositeTotal / frameIndex : 0,
        averageChangeMs: presetChanges ? changeTotal / presetChanges : 0,
        elapsedMs,
        firstFrameMs,
        ffmpegStartMs,
        cpuPercent: ((cpu.user + cpu.system) / 1000 / elapsedMs) * 100,
        peakRssBytes,
        peakHeapBytes,
        peakExternalBytes,
        peakArrayBufferBytes,
        peakActiveHandles,
        rgbaBytesWritten,
        preEncodingFrameHashes,
        projectMFrameHashes,
        hostPid,
        frameCoverage: lastFrameCoverage,
        sequence: appliedSequence,
        errors
      };
    } finally {
      if (decoder.exitCode === null) decoder.kill();
      if (clipDecoder?.exitCode === null) clipDecoder.kill();
      if (encoder.exitCode === null && !encoder.stdin.destroyed) {
        encoder.stdin.destroy();
      }
      await host?.shutdown();
      compositor.dispose();
    }
  })();

  return { encoder, decoder, clipDecoder, host, completion };
}
