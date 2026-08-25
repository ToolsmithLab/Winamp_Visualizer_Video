import { once } from "node:events";
import { existsSync } from "node:fs";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import path from "node:path";
import type {
  ProjectMFrame,
  ProjectMRenderRequest,
  ProjectMStatus
} from "../../shared/ipc";
import {
  createInputPacket,
  encodeProjectMSeed,
  encodeProjectMUtf8,
  normalizeProjectMSeed,
  PROJECTM_DEFAULT_SEED,
  PROJECTM_FRAME_META_SIZE,
  PROJECTM_PROTOCOL_VERSION,
  ProjectMInputType,
  ProjectMOutputType,
  ProjectMPacketWriter,
  ProjectMPacketParser,
  type ProjectMPacket
} from "./projectMProtocol";

interface PendingRequest {
  type: ProjectMInputType;
  expectedType: ProjectMOutputType;
  resolve: (packet: ProjectMPacket) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

interface RecentCommand {
  requestId: number;
  type: ProjectMInputType;
  payloadBytes: number;
  arg0: number;
  arg1: number;
}

export interface ProjectMRuntimePaths {
  hostPath: string;
  libraryPath: string;
  presetPath: string;
}

export interface ProjectMLoadPresetOptions {
  smoothTransition?: boolean;
  transitionSeconds?: number;
}

const unavailableStatus = (
  paths: ProjectMRuntimePaths,
  error = ""
): ProjectMStatus => ({
  available: false,
  running: false,
  enabled: true,
  version: "",
  preset: "",
  error,
  glRenderer: "",
  glVersion: "",
  pid: null,
  pcmMaxSamples: 0,
  receivedPresetPath: "",
  presetPathUtf8Bytes: 0,
  activeCodePage: 0,
  protocolVersion: PROJECTM_PROTOCOL_VERSION,
  deterministicSeed: PROJECTM_DEFAULT_SEED.toString(),
  ...paths
});

export class ProjectMHostService {
  private paths: ProjectMRuntimePaths;
  private child: ChildProcessWithoutNullStreams | null = null;
  private parser = new ProjectMPacketParser();
  private writer: ProjectMPacketWriter | null = null;
  private readonly pending = new Map<number, PendingRequest>();
  private readonly recentCommands: RecentCommand[] = [];
  private nextRequestId = 1;
  private lastValidResponseId = 0;
  private renderInFlight = false;
  private droppedFrames = 0;
  private stderrTail = "";
  private statusValue: ProjectMStatus;
  private shutdownPromise: Promise<void> | null = null;
  private shuttingDown = false;
  private deterministicSeed = PROJECTM_DEFAULT_SEED;

  constructor(paths: ProjectMRuntimePaths) {
    this.paths = paths;
    this.statusValue = unavailableStatus(paths);
  }

  configure(paths: ProjectMRuntimePaths): void {
    if (this.child) {
      throw new Error("Impossibile cambiare i percorsi con projectM in esecuzione.");
    }
    this.paths = paths;
    this.statusValue = unavailableStatus(paths);
  }

  get status(): ProjectMStatus {
    return { ...this.statusValue };
  }

  get diagnostics(): {
    pendingRequestIds: number[];
    renderInFlight: boolean;
    droppedFrames: number;
    recentCommands: RecentCommand[];
    writerPackets: number;
    hostPid: number | null;
  } {
    return {
      pendingRequestIds: [...this.pending.keys()].slice(0, 16),
      renderInFlight: this.renderInFlight,
      droppedFrames: this.droppedFrames,
      recentCommands: this.recentCommands.map((command) => ({ ...command })),
      writerPackets: this.writer?.count ?? 0,
      hostPid: this.child?.pid ?? null
    };
  }

  async initialize(
    width = 540,
    height = 960,
    seed: number | bigint = this.deterministicSeed,
    loadInitialPreset = true
  ): Promise<ProjectMStatus> {
    if (this.shutdownPromise) await this.shutdownPromise;
    const normalizedSeed = normalizeProjectMSeed(seed);
    if (this.child && this.statusValue.running) {
      if (normalizedSeed !== this.deterministicSeed) {
        return this.reset(width, height, normalizedSeed);
      }
      return this.status;
    }
    if (!existsSync(this.paths.hostPath)) {
      this.statusValue = unavailableStatus(
        this.paths,
        `Host projectM mancante: ${this.paths.hostPath}`
      );
      return this.status;
    }
    if (!existsSync(this.paths.libraryPath)) {
      this.statusValue = unavailableStatus(
        this.paths,
        `Libreria projectM mancante: ${this.paths.libraryPath}`
      );
      return this.status;
    }
    if (!existsSync(this.paths.presetPath)) {
      this.statusValue = unavailableStatus(
        this.paths,
        `Preset projectM mancante: ${this.paths.presetPath}`
      );
      return this.status;
    }

    this.spawnHost();
    try {
      const initialized = await this.request(
        ProjectMInputType.Initialize,
        encodeProjectMSeed(normalizedSeed),
        width,
        height,
        15_000
      );
      this.applyStatus(initialized);
      this.deterministicSeed = normalizedSeed;
      if (!this.statusValue.available) {
        await this.shutdown();
        return this.status;
      }
      if (this.statusValue.version !== "4.1.6") {
        this.statusValue.available = false;
        this.statusValue.error =
          `Versione projectM non compatibile: ${this.statusValue.version || "ignota"}. ` +
          "È richiesta esattamente la 4.1.6.";
        await this.shutdown();
        return this.status;
      }
      if (!loadInitialPreset) return this.status;
      const loaded = await this.request(
        ProjectMInputType.LoadPreset,
        encodeProjectMUtf8(this.paths.presetPath, "percorso preset"),
        0,
        0,
        15_000
      );
      this.applyStatus(loaded);
      this.statusValue.preset = path.basename(this.paths.presetPath);
      return this.status;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.statusValue = {
        ...unavailableStatus(this.paths, message),
        pid: this.child?.pid ?? null
      };
      await this.shutdown();
      return this.status;
    }
  }

  async reset(
    width = 540,
    height = 960,
    seed: number | bigint = this.deterministicSeed
  ): Promise<ProjectMStatus> {
    const normalizedSeed = normalizeProjectMSeed(seed);
    if (!this.child || !this.statusValue.running) {
      return this.initialize(width, height, normalizedSeed);
    }
    try {
      const packet = await this.request(
        ProjectMInputType.Reset,
        encodeProjectMSeed(normalizedSeed),
        width,
        height,
        15_000
      );
      this.applyStatus(packet);
      this.deterministicSeed = normalizedSeed;
      this.statusValue.preset = path.basename(this.paths.presetPath);
      return this.status;
    } catch (error) {
      this.statusValue.error =
        error instanceof Error ? error.message : String(error);
      return this.status;
    }
  }

  async loadPreset(
    presetPath: string,
    options: ProjectMLoadPresetOptions = {}
  ): Promise<ProjectMStatus> {
    const encodedPresetPath = encodeProjectMUtf8(
      presetPath,
      "percorso preset"
    );
    if (!existsSync(presetPath)) {
      throw new Error(`Preset MilkDrop mancante: ${presetPath}`);
    }
    if (!this.child || !this.statusValue.running) {
      this.paths = { ...this.paths, presetPath };
      return this.initialize();
    }
    const loaded = await this.request(
      ProjectMInputType.LoadPreset,
      encodedPresetPath,
      options.smoothTransition ? 1 : 0,
      Math.round(
        Math.min(30, Math.max(0, options.transitionSeconds ?? 0)) * 1000
      ),
      15_000
    );
    this.paths = { ...this.paths, presetPath };
    this.applyStatus(loaded);
    this.statusValue.preset = path.basename(presetPath);
    this.statusValue.presetPath = presetPath;
    return this.status;
  }

  async setPresetLocked(locked: boolean): Promise<ProjectMStatus> {
    if (!this.child || !this.statusValue.running) {
      const status = await this.initialize();
      if (!status.available) return status;
    }
    const packet = await this.request(
      ProjectMInputType.SetPresetLocked,
      Buffer.alloc(0),
      locked ? 1 : 0,
      0,
      5_000
    );
    this.applyStatus(packet);
    return this.status;
  }

  async render(
    request: ProjectMRenderRequest,
    timeoutMs = 30_000
  ): Promise<ProjectMFrame | null> {
    if (this.renderInFlight) {
      this.droppedFrames += Math.max(1, request.steps);
      return null;
    }
    if (!this.child || !this.statusValue.running) {
      const status = await this.initialize(request.width, request.height);
      if (!status.available) return null;
    }
    this.renderInFlight = true;
    const started = performance.now();
    try {
      const channels = request.channels;
      if (request.samples.length % channels !== 0) {
        throw new Error("Il buffer PCM non contiene frame completi.");
      }
      const pcmBytes = Buffer.from(
        request.samples.buffer,
        request.samples.byteOffset,
        request.samples.byteLength
      );
      const payload = Buffer.allocUnsafe(20 + pcmBytes.byteLength);
      payload.writeUInt32LE(request.width, 0);
      payload.writeUInt32LE(request.height, 4);
      payload.writeUInt32LE(Math.max(1, Math.min(240, request.steps)), 8);
      payload.writeUInt32LE(channels, 12);
      payload.writeUInt32LE(request.samples.length / channels, 16);
      pcmBytes.copy(payload, 20);
      const packet = await this.request(
        ProjectMInputType.Step,
        payload,
        0,
        0,
        timeoutMs
      );
      if (
        packet.type !== ProjectMOutputType.Frame ||
        packet.payload.byteLength < PROJECTM_FRAME_META_SIZE
      ) {
        throw new Error("Risposta framebuffer projectM non valida.");
      }
      const latencyMs = performance.now() - started;
      const pixelBytes = packet.payload.subarray(PROJECTM_FRAME_META_SIZE);
      const bandwidthMbps =
        latencyMs > 0
          ? (pixelBytes.byteLength * 8) / (latencyMs / 1000) / 1_000_000
          : 0;
      return {
        width: packet.payload.readUInt32LE(0),
        height: packet.payload.readUInt32LE(4),
        stride: packet.payload.readUInt32LE(8),
        pcmSamples: packet.payload.readUInt32LE(12),
        frameIndex: Number(packet.payload.readBigUInt64LE(16)),
        renderMs: Number(packet.payload.readBigUInt64LE(24)) / 1000,
        advancedFrames: packet.payload.readUInt32LE(32),
        latencyMs,
        bandwidthMbps,
        droppedFrames: this.droppedFrames,
        bytes: new Uint8Array(
          pixelBytes.buffer,
          pixelBytes.byteOffset,
          pixelBytes.byteLength
        )
      };
    } catch (error) {
      this.statusValue.error =
        error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      this.renderInFlight = false;
    }
  }

  async shutdown(): Promise<void> {
    if (this.shutdownPromise) return this.shutdownPromise;
    const operation = this.performShutdown();
    this.shutdownPromise = operation;
    try {
      await operation;
    } finally {
      if (this.shutdownPromise === operation) this.shutdownPromise = null;
    }
  }

  async terminate(reason = "Host projectM terminato."): Promise<void> {
    const child = this.child;
    this.statusValue.error = reason;
    this.statusValue.running = false;
    this.statusValue.pid = null;
    this.shuttingDown = true;
    this.failAll(new Error(reason));
    this.writer?.close();
    if (child?.exitCode === null) {
      const exited = once(child, "exit");
      child.kill();
      await Promise.race([
        exited,
        new Promise<void>((resolve) => setTimeout(resolve, 1_000))
      ]);
    }
    if (this.child === child) {
      this.child = null;
      this.writer = null;
    }
    this.renderInFlight = false;
    this.shuttingDown = false;
  }

  private async performShutdown(): Promise<void> {
    const child = this.child;
    if (!child) {
      this.statusValue.running = false;
      this.statusValue.pid = null;
      return;
    }
    this.shuttingDown = true;
    try {
      await this.request(
        ProjectMInputType.Shutdown,
        Buffer.alloc(0),
        0,
        0,
        2_000,
        true
      );
    } catch {
      // The host may already have exited; cleanup below remains authoritative.
    }
    if (child.exitCode === null) {
      const exited = once(child, "exit");
      const forced = new Promise<void>((resolve) => {
        setTimeout(() => {
          if (child.exitCode === null) child.kill();
          resolve();
        }, 2_000);
      });
      await Promise.race([exited, forced]);
    }
    this.writer?.close();
    this.child = null;
    this.writer = null;
    this.statusValue.running = false;
    this.statusValue.pid = null;
    this.renderInFlight = false;
    this.shuttingDown = false;
  }

  private spawnHost(): void {
    this.parser = new ProjectMPacketParser();
    const child = spawn(this.paths.hostPath, [], {
      cwd: path.dirname(this.paths.hostPath),
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"]
    });
    this.child = child;
    this.writer = new ProjectMPacketWriter(child.stdin);
    this.shuttingDown = false;
    this.stderrTail = "";
    let stdoutFinished = false;
    const finishStdout = (): void => {
      if (stdoutFinished) return;
      stdoutFinished = true;
      try {
        this.parser.finish();
      } catch (error) {
        this.handleTransportFailure(
          error instanceof Error ? error : new Error(String(error)),
          child
        );
      }
    };
    child.stdout.on("data", (chunk: Buffer<ArrayBufferLike>) => {
      try {
        for (const packet of this.parser.push(chunk)) {
          this.handlePacket(packet);
        }
      } catch (error) {
        this.handleTransportFailure(
          error instanceof Error ? error : new Error(String(error)),
          child
        );
      }
    });
    child.stdout.once("end", finishStdout);
    child.stdout.once("close", finishStdout);
    child.stderr.on("data", (chunk: Buffer<ArrayBufferLike>) => {
      this.stderrTail = (this.stderrTail + chunk.toString("utf8")).slice(-8192);
    });
    child.once("error", (error) => {
      this.statusValue.error = `Avvio projectM fallito: ${error.message}`;
      this.failAll(error);
    });
    child.once("exit", (code, signal) => {
      finishStdout();
      const detail = this.stderrTail.trim();
      this.statusValue.running = false;
      this.statusValue.pid = null;
      if (code !== 0 && this.statusValue.error === "") {
        this.statusValue.error =
          `Il processo projectM è terminato (codice ${code ?? "?"}, ` +
          `segnale ${signal ?? "nessuno"}).${detail ? ` ${detail}` : ""}`;
      }
      this.failAll(new Error(this.statusValue.error || "Host projectM chiuso."));
      if (this.child === child) {
        this.writer?.close();
        this.writer = null;
        this.child = null;
      }
    });
  }

  private async request(
    type: ProjectMInputType,
    payload: Buffer<ArrayBufferLike>,
    arg0: number,
    arg1: number,
    timeoutMs: number,
    allowDuringShutdown = false
  ): Promise<ProjectMPacket> {
    const child = this.child;
    const writer = this.writer;
    if (!child || !writer || child.stdin.destroyed) {
      throw new Error("Host projectM non in esecuzione.");
    }
    if (this.shuttingDown && !allowDuringShutdown) {
      throw new Error("Host projectM in fase di chiusura.");
    }
    if (payload.byteLength > 16 * 1024 * 1024) {
      throw new Error(
        `Payload richiesta projectM oltre il limite: ${payload.byteLength} byte.`
      );
    }
    const requestId = this.allocateRequestId();
    const expectedType = expectedOutputType(type);
    this.recentCommands.push({
      requestId,
      type,
      payloadBytes: payload.byteLength,
      arg0,
      arg1
    });
    if (this.recentCommands.length > 8) this.recentCommands.shift();
    const result = new Promise<ProjectMPacket>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(requestId);
        reject(
          new Error(
            type === ProjectMInputType.Step
              ? `Timeout risposta IPC render projectM per richiesta ${requestId}.`
              : `Timeout projectM per richiesta ${requestId} (comando ${type}).`
          )
        );
      }, timeoutMs);
      this.pending.set(requestId, {
        type,
        expectedType,
        resolve,
        reject,
        timeout
      });
    });
    // La risposta nativa può arrivare (o la pipe può chiudersi) prima che
    // questo metodo restituisca la Promise al chiamante. La rejection resta
    // propagata tramite `result`, ma viene marcata subito come osservata.
    void result.catch(() => undefined);
    try {
      await writer.enqueue(
        createInputPacket(type, requestId, payload, arg0, arg1)
      );
    } catch (error) {
      const failure = error instanceof Error ? error : new Error(String(error));
      this.rejectPending(requestId, failure);
      this.handleTransportFailure(failure, child);
      return await result;
    }
    return result;
  }

  private handlePacket(packet: ProjectMPacket): void {
    const pending = this.pending.get(packet.requestId);
    if (!pending) {
      this.logFramingDiagnostic("Risposta con requestId non atteso.", {
        responseRequestId: packet.requestId,
        responseType: packet.type,
        responseBytes: packet.payload.byteLength
      });
      return;
    }
    this.pending.delete(packet.requestId);
    clearTimeout(pending.timeout);
    this.lastValidResponseId = packet.requestId;
    if (packet.type === ProjectMOutputType.Error) {
      let message = packet.payload.toString("utf8");
      try {
        message = JSON.parse(message).error || message;
      } catch {
        // Preserve the raw native error.
      }
      const error = new Error(message);
      if (message.includes("Pacchetto IPC projectM non valido")) {
        this.logFramingDiagnostic("L'host ha rifiutato il framing in ingresso.", {
          responseRequestId: packet.requestId,
          commandType: pending.type,
          nativeError: message
        });
      }
      pending.reject(error);
      return;
    }
    if (packet.type !== pending.expectedType) {
      const error = new Error(
        `Tipo risposta projectM non atteso per richiesta ${packet.requestId}: ` +
        `ricevuto ${packet.type}, atteso ${pending.expectedType}.`
      );
      this.logFramingDiagnostic(error.message, {
        responseRequestId: packet.requestId,
        commandType: pending.type
      });
      pending.reject(error);
      return;
    }
    pending.resolve(packet);
  }

  private applyStatus(packet: ProjectMPacket): void {
    if (packet.type !== ProjectMOutputType.Status) {
      throw new Error("projectM non ha restituito uno stato valido.");
    }
    const native = JSON.parse(packet.payload.toString("utf8")) as Partial<ProjectMStatus>;
    this.statusValue = {
      ...this.statusValue,
      available: Boolean(native.available),
      running: Boolean(native.running),
      version: native.version ?? "",
      preset: native.preset ?? "",
      error: native.error ?? "",
      glRenderer: native.glRenderer ?? "",
      glVersion: native.glVersion ?? "",
      pid: typeof native.pid === "number" ? native.pid : this.child?.pid ?? null,
      pcmMaxSamples: native.pcmMaxSamples ?? 0,
      receivedPresetPath: native.preset ?? this.statusValue.receivedPresetPath,
      presetPathUtf8Bytes:
        native.presetPathUtf8Bytes ?? this.statusValue.presetPathUtf8Bytes,
      activeCodePage: native.activeCodePage ?? this.statusValue.activeCodePage,
      protocolVersion:
        native.protocolVersion ?? this.statusValue.protocolVersion,
      deterministicSeed:
        native.deterministicSeed ?? this.statusValue.deterministicSeed
    };
  }

  private failAll(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pending.clear();
  }

  private rejectPending(requestId: number, error: Error): void {
    const pending = this.pending.get(requestId);
    if (!pending) return;
    this.pending.delete(requestId);
    clearTimeout(pending.timeout);
    pending.reject(error);
  }

  private allocateRequestId(): number {
    for (let attempts = 0; attempts < 0xffff_ffff; attempts += 1) {
      const requestId = this.nextRequestId;
      this.nextRequestId =
        this.nextRequestId >= 0xffff_ffff ? 1 : this.nextRequestId + 1;
      if (!this.pending.has(requestId)) return requestId;
    }
    throw new Error("Spazio requestId projectM esaurito.");
  }

  private handleTransportFailure(
    error: Error,
    child: ChildProcessWithoutNullStreams
  ): void {
    this.statusValue.error = error.message;
    this.logFramingDiagnostic("Errore trasporto IPC projectM.", {
      errorName: error.name,
      errorMessage: error.message
    });
    this.failAll(error);
    if (child.exitCode === null) child.kill();
  }

  private logFramingDiagnostic(
    reason: string,
    detail: Record<string, unknown>
  ): void {
    // Non vengono mai registrati PCM, framebuffer o contenuti dei preset.
    console.error(
      "[projectM IPC]",
      JSON.stringify({
        reason,
        detail,
        parser: this.parser.state,
        pendingRequestIds: [...this.pending.keys()].slice(0, 16),
        lastValidResponseId: this.lastValidResponseId,
        recentCommands: this.recentCommands,
        writerPackets: this.writer?.count ?? 0,
        hostPid: this.child?.pid ?? null,
        hostState: {
          available: this.statusValue.available,
          running: this.statusValue.running,
          error: this.statusValue.error
        },
        shuttingDown: this.shuttingDown
      })
    );
  }
}

function expectedOutputType(type: ProjectMInputType): ProjectMOutputType {
  switch (type) {
    case ProjectMInputType.Shutdown:
      return ProjectMOutputType.Ack;
    case ProjectMInputType.Step:
      return ProjectMOutputType.Frame;
    case ProjectMInputType.Initialize:
    case ProjectMInputType.LoadPreset:
    case ProjectMInputType.Reset:
    case ProjectMInputType.Ping:
    case ProjectMInputType.SetPresetLocked:
      return ProjectMOutputType.Status;
  }
}
