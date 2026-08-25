import type { AudioSnapshot } from "../shared/audioAnalysis";
import type { ProjectLayer, VisualizerProject } from "../shared/project";
import type { ProjectMFrame } from "../shared/ipc";
import { convertProjectMBgraToOverlayRgba } from "../shared/projectMOverlay";
import { SceneCompositor } from "../engine/composition/sceneCompositor";
import type { PluginRuntimeStatus } from "../engine/plugins/types";
import { evaluateLayerAtTime } from "../engine/keyframes/keyframeEngine";
import {
  createTransformGeometry,
  geometryHandles,
  hitTestGeometry,
  hitTestHandle,
  inverseTransformPoint,
  snapValue,
  type Point,
  type SnapCandidate,
  type TransformGeometry,
  type TransformHandle
} from "../engine/transforms/geometry";

export interface DirectTransformPatch {
  x?: number;
  y?: number;
  scaleX?: number;
  scaleY?: number;
  rotation?: number;
}

export interface CoverPreviewInfo {
  width: number;
  height: number;
  url: string;
}

export interface ClipPreviewInfo {
  width: number;
  height: number;
  duration: number;
  readyState: number;
  presentedFrames: number;
}

export interface ClipPlaybackState extends ClipPreviewInfo {
  ready: boolean;
  visible: boolean;
  paused: boolean;
  currentTime: number;
  ended: boolean;
}

type GestureMode = "move" | "resize" | "rotate" | null;

interface Guide {
  axis: "x" | "y";
  value: number;
}

export class PreviewRenderer {
  private context: CanvasRenderingContext2D;
  private coverImage: HTMLImageElement | null = null;
  private coverUrl: string | null = null;
  private readonly clipVideo = document.createElement("video");
  private clipUrl: string | null = null;
  private clipReady = false;
  private clipVisible = false;
  private clipFrameCallbackId: number | null = null;
  private clipPresentedFrames = 0;
  private gestureMode: GestureMode = null;
  private gestureHandle: TransformHandle | null = null;
  private lastPointer: Point = { x: 0, y: 0 };
  private project: VisualizerProject;
  private selectedLayerId = "cover";
  private snapshot: AudioSnapshot = {
    volume: 0,
    bass: 0,
    mid: 0,
    high: 0,
    spectrum: new Uint8Array(128),
    waveform: new Uint8Array(128).fill(128)
  };
  private animationFrame = 0;
  private currentTime = 0;
  private readonly sceneCompositor = new SceneCompositor();
  private readonly projectMCanvas = document.createElement("canvas");
  private readonly projectMContext: CanvasRenderingContext2D;
  private readonly visualizerCanvas = document.createElement("canvas");
  private readonly visualizerContext: CanvasRenderingContext2D;
  private projectMImageData: ImageData | null = null;
  private projectMFrameReady = false;
  private dirty = true;
  private lastFrameIndex = -1;
  private guides: Guide[] = [];
  private snappingEnabled = true;
  private selectionLocked = true;
  private editorGuidesVisible = true;
  private keyboardGesture = false;
  private activePointerId: number | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    project: VisualizerProject,
    private readonly onSelectLayer: (layerId: string) => void,
    private readonly onTransformLayer: (
      layerId: string,
      transform: DirectTransformPatch
    ) => void,
    private readonly onTransformStart: () => void,
    private readonly onTransformEnd: (commit: boolean) => void
  ) {
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas 2D non disponibile.");
    this.context = context;
    const projectMContext = this.projectMCanvas.getContext("2d");
    if (!projectMContext) throw new Error("Canvas projectM non disponibile.");
    this.projectMContext = projectMContext;
    const visualizerContext = this.visualizerCanvas.getContext("2d");
    if (!visualizerContext) throw new Error("Canvas effetti non disponibile.");
    this.visualizerContext = visualizerContext;
    this.project = project;
    this.clipVideo.muted = true;
    this.clipVideo.playsInline = true;
    this.clipVideo.preload = "auto";
    this.canvas.tabIndex = 0;
    this.canvas.setAttribute(
      "aria-label",
      "Anteprima: seleziona e trasforma sfondo, effetto o testi"
    );
    this.bindEvents();
    this.renderLoop();
  }

  update(project: VisualizerProject, snapshot: AudioSnapshot, currentTime = 0): void {
    const frameIndex = Math.max(0, Math.floor(currentTime * project.canvas.fps));
    if (project !== this.project || frameIndex !== this.lastFrameIndex) this.dirty = true;
    this.project = project;
    this.snapshot = snapshot;
    this.currentTime = currentTime;
    this.synchronizeClip(currentTime, !this.clipVideo.paused);
    this.lastFrameIndex = frameIndex;
  }

  selectLayer(layerId: string): void {
    this.selectedLayerId = layerId;
    this.dirty = true;
  }

  setSnappingEnabled(enabled: boolean): void {
    this.snappingEnabled = enabled;
    if (!enabled) this.guides = [];
    this.dirty = true;
  }

  setSelectionLocked(locked: boolean): void {
    this.selectionLocked = locked;
  }

  setEditorGuidesVisible(visible: boolean): void {
    this.editorGuidesVisible = visible;
    this.dirty = true;
  }

  selectionHandles(): Record<TransformHandle, Point> | null {
    const layer = this.project.layers.find(
      (item) => item.id === this.selectedLayerId
    );
    const geometry = layer ? this.geometry(layer) : null;
    return geometry ? geometryHandles(geometry) : null;
  }

  async setCover(
    bytes: Uint8Array,
    mimeType: string
  ): Promise<CoverPreviewInfo> {
    if (this.coverUrl) URL.revokeObjectURL(this.coverUrl);
    this.coverUrl = URL.createObjectURL(
      new Blob([bytes.slice().buffer as ArrayBuffer], { type: mimeType })
    );
    const image = new Image();
    try {
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("Immagine non valida."));
        image.src = this.coverUrl as string;
      });
    } catch (error) {
      URL.revokeObjectURL(this.coverUrl);
      this.coverUrl = null;
      throw error;
    }
    this.coverImage = image;
    this.dirty = true;
    return {
      width: image.naturalWidth,
      height: image.naturalHeight,
      url: this.coverUrl
    };
  }

  clearCover(): void {
    this.coverImage = null;
    if (this.coverUrl) URL.revokeObjectURL(this.coverUrl);
    this.coverUrl = null;
    this.dirty = true;
  }

  async setClip(
    bytes: Uint8Array,
    mimeType: string
  ): Promise<ClipPreviewInfo> {
    this.clearClip();
    this.clipUrl = URL.createObjectURL(
      new Blob([bytes.slice().buffer as ArrayBuffer], { type: mimeType })
    );
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        cleanup();
        reject(
          new Error(
            `Timeout decoder preview (${mimeType}): loadeddata non raggiunto.`
          )
        );
      }, 12_000);
      const cleanup = () => {
        window.clearTimeout(timer);
        this.clipVideo.removeEventListener("loadedmetadata", onMetadata);
        this.clipVideo.removeEventListener("loadeddata", onReady);
        this.clipVideo.removeEventListener("error", onError);
      };
      const onMetadata = () => {
        if (!this.clipVideo.videoWidth || !this.clipVideo.videoHeight) {
          cleanup();
          reject(
            new Error(
              `Metadata video non valide (${mimeType}): dimensioni non disponibili.`
            )
          );
        }
      };
      const onReady = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(
          new Error(
            `Decoder preview non disponibile per ${mimeType}: ` +
              `${this.clipVideo.error?.message || "frame video non decodificabile"}. ` +
              "Convertire la clip in MP4 H.264."
          )
        );
      };
      this.clipVideo.addEventListener("loadedmetadata", onMetadata);
      this.clipVideo.addEventListener("loadeddata", onReady);
      this.clipVideo.addEventListener("error", onError);
      this.clipVideo.src = this.clipUrl as string;
      this.clipVideo.load();
    }).catch((error) => {
      this.clearClip();
      throw error;
    });
    this.clipReady = true;
    this.clipVisible = true;
    this.clipPresentedFrames = 0;
    await this.waitForFirstVideoFrame(mimeType).catch((error) => {
      this.clearClip();
      throw error;
    });
    this.scheduleVideoFrame();
    this.dirty = true;
    return {
      width: this.clipVideo.videoWidth,
      height: this.clipVideo.videoHeight,
      duration: Number.isFinite(this.clipVideo.duration)
        ? this.clipVideo.duration
        : 0,
      readyState: this.clipVideo.readyState,
      presentedFrames: this.clipPresentedFrames
    };
  }

  clearClip(): void {
    this.cancelVideoFrameCallback();
    this.clipVideo.pause();
    this.clipVideo.removeAttribute("src");
    this.clipVideo.load();
    if (this.clipUrl) URL.revokeObjectURL(this.clipUrl);
    this.clipUrl = null;
    this.clipReady = false;
    this.clipVisible = false;
    this.clipPresentedFrames = 0;
    this.dirty = true;
  }

  setClipPlayback(playing: boolean, time: number): void {
    this.synchronizeClip(time, playing);
  }

  clipPlaybackState(): ClipPlaybackState {
    return {
      width: this.clipVideo.videoWidth,
      height: this.clipVideo.videoHeight,
      duration: Number.isFinite(this.clipVideo.duration)
        ? this.clipVideo.duration
        : 0,
      readyState: this.clipVideo.readyState,
      presentedFrames: this.clipPresentedFrames,
      ready: this.clipReady,
      visible: this.clipVisible,
      paused: this.clipVideo.paused,
      currentTime: this.clipVideo.currentTime,
      ended: this.clipVideo.ended
    };
  }

  resetEffects(): void {
    this.sceneCompositor.reset();
    this.lastFrameIndex = -1;
    this.dirty = true;
  }

  pluginStatus(layerId: string): PluginRuntimeStatus | null {
    return this.sceneCompositor.pluginStatus(layerId);
  }

  resetPlugin(layerId: string): void {
    this.sceneCompositor.resetPlugin(layerId);
    this.dirty = true;
  }

  dispose(): void {
    cancelAnimationFrame(this.animationFrame);
    this.sceneCompositor.dispose();
    this.clearCover();
    this.clearClip();
    this.clearProjectMFrame();
  }

  setProjectMFrame(frame: ProjectMFrame): void {
    if (
      frame.width <= 0 ||
      frame.height <= 0 ||
      frame.stride !== frame.width * 4 ||
      frame.bytes.byteLength !== frame.stride * frame.height
    ) throw new Error("Framebuffer projectM non valido.");
    if (
      !this.projectMImageData ||
      this.projectMImageData.width !== frame.width ||
      this.projectMImageData.height !== frame.height
    ) {
      this.projectMCanvas.width = frame.width;
      this.projectMCanvas.height = frame.height;
      this.projectMImageData = this.projectMContext.createImageData(frame.width, frame.height);
    }
    const rgba = convertProjectMBgraToOverlayRgba(
      frame.bytes,
      frame.width,
      frame.height,
      frame.stride,
      this.projectMImageData.data
    );
    if (rgba !== this.projectMImageData.data) {
      const imageBytes = new Uint8ClampedArray(rgba.byteLength);
      imageBytes.set(rgba);
      this.projectMImageData = new ImageData(
        imageBytes,
        frame.width,
        frame.height
      );
    }
    this.projectMContext.clearRect(0, 0, frame.width, frame.height);
    this.projectMContext.putImageData(this.projectMImageData, 0, 0);
    this.projectMFrameReady = true;
    this.dirty = true;
  }

  clearProjectMFrame(): void {
    this.projectMContext.clearRect(0, 0, this.projectMCanvas.width, this.projectMCanvas.height);
    this.projectMImageData = null;
    this.projectMFrameReady = false;
    this.dirty = true;
  }

  private renderLoop = (): void => {
    if (this.dirty) this.draw();
    this.animationFrame = requestAnimationFrame(this.renderLoop);
  };

  private draw(): void {
    const { width, height } = this.canvas;
    if (
      this.visualizerCanvas.width !== width ||
      this.visualizerCanvas.height !== height
    ) {
      this.visualizerCanvas.width = width;
      this.visualizerCanvas.height = height;
    }
    const frameTime = Math.max(0, this.lastFrameIndex / this.project.canvas.fps);
    this.sceneCompositor.render(
      this.context,
      width,
      height,
      this.project,
      this.snapshot,
      frameTime,
      {
        clip:
          this.clipReady && this.clipVisible
            ? this.clipVideo
            : null,
        clipBlack:
          this.clipReady &&
          !this.clipVisible &&
          this.project.clip.endMode === "black" &&
          this.currentTime >= this.project.clip.durationSeconds,
        projectM: this.projectMFrameReady ? this.projectMCanvas : null,
        cover: this.coverImage,
        visualizer: {
          canvas: this.visualizerCanvas,
          context: this.visualizerContext
        }
      },
      { frameRate: this.project.canvas.fps }
    );
    this.drawSelection();
    this.drawGuides();
    this.drawSafeArea();
    this.dirty = false;
  }

  private synchronizeClip(time: number, shouldPlay: boolean): void {
    if (!this.clipReady || !this.project.clip.filePath) {
      this.clipVisible = false;
      return;
    }
    const duration =
      this.project.clip.durationSeconds ||
      (Number.isFinite(this.clipVideo.duration) ? this.clipVideo.duration : 0);
    if (duration <= 0) {
      this.clipVisible = false;
      return;
    }
    let mappedTime = Math.max(0, time);
    if (this.project.clip.endMode === "loop") {
      mappedTime %= duration;
      this.clipVideo.loop = true;
      this.clipVisible = true;
    } else if (time >= duration) {
      this.clipVideo.loop = false;
      if (this.project.clip.endMode === "black") {
        this.clipVisible = false;
        this.clipVideo.pause();
        this.dirty = true;
        return;
      }
      mappedTime = Math.max(0, duration - 0.001);
      this.clipVisible = true;
      shouldPlay = false;
    } else {
      this.clipVideo.loop = false;
      this.clipVisible = true;
    }
    if (
      Number.isFinite(this.clipVideo.duration) &&
      Math.abs(this.clipVideo.currentTime - mappedTime) > 0.12
    ) {
      this.clipVideo.currentTime = Math.min(
        Math.max(0, mappedTime),
        Math.max(0, this.clipVideo.duration - 0.001)
      );
      this.clipVideo.addEventListener(
        "seeked",
        () => {
          this.dirty = true;
          this.scheduleVideoFrame();
        },
        { once: true }
      );
    }
    if (shouldPlay && this.clipVideo.paused) {
      void this.clipVideo.play().then(
        () => this.scheduleVideoFrame(),
        () => undefined
      );
    } else if (!shouldPlay && !this.clipVideo.paused) {
      this.clipVideo.pause();
    }
    this.dirty = true;
  }

  private editable(layer: ProjectLayer): boolean {
    return (
      layer.kind === "cover" ||
      layer.kind === "visualizer" ||
      layer.kind === "projectM" ||
      layer.kind === "artistText" ||
      layer.kind === "titleText"
    );
  }

  private waitForFirstVideoFrame(mimeType: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const video = this.clipVideo as HTMLVideoElement & {
        requestVideoFrameCallback?: (
          callback: (now: number, metadata: VideoFrameCallbackMetadata) => void
        ) => number;
      };
      if (!video.requestVideoFrameCallback) {
        requestAnimationFrame(() => {
          this.clipPresentedFrames = 1;
          resolve();
        });
        return;
      }
      const timer = window.setTimeout(
        () =>
          reject(
            new Error(
              `Il decoder ${mimeType} non ha prodotto il primo fotogramma entro 8 secondi.`
            )
          ),
        8_000
      );
      video.requestVideoFrameCallback(() => {
        window.clearTimeout(timer);
        this.clipPresentedFrames = 1;
        this.dirty = true;
        resolve();
      });
      // Chromium may defer the callback for a paused element exactly at t=0.
      // An explicit tiny seek initializes the decoder without starting playback.
      if (
        Number.isFinite(video.duration) &&
        video.duration > 0.002 &&
        video.currentTime === 0
      ) {
        video.currentTime = 0.001;
      }
    });
  }

  private scheduleVideoFrame(): void {
    if (!this.clipReady || this.clipFrameCallbackId !== null) return;
    const video = this.clipVideo as HTMLVideoElement & {
      requestVideoFrameCallback?: (
        callback: (now: number, metadata: VideoFrameCallbackMetadata) => void
      ) => number;
    };
    if (!video.requestVideoFrameCallback) {
      this.dirty = true;
      return;
    }
    this.clipFrameCallbackId = video.requestVideoFrameCallback(() => {
      this.clipFrameCallbackId = null;
      this.clipPresentedFrames += 1;
      this.dirty = true;
      if (!this.clipVideo.paused && !this.clipVideo.ended) {
        this.scheduleVideoFrame();
      }
    });
  }

  private cancelVideoFrameCallback(): void {
    if (this.clipFrameCallbackId === null) return;
    const video = this.clipVideo as HTMLVideoElement & {
      cancelVideoFrameCallback?: (handle: number) => void;
    };
    video.cancelVideoFrameCallback?.(this.clipFrameCallbackId);
    this.clipFrameCallbackId = null;
  }

  private baseSize(layer: ProjectLayer): { width: number; height: number } | null {
    if (layer.kind === "cover") {
      return {
        width: this.canvas.width * this.project.cover.width,
        height: this.canvas.height * this.project.cover.height
      };
    }
    if (layer.kind === "visualizer" || layer.kind === "projectM") {
      // A full-bleed effect still needs reachable corner and rotation handles.
      // The inset box is the transform control cage; the compositor continues
      // to render the underlying alpha surface at full resolution.
      return { width: this.canvas.width * 0.84, height: this.canvas.height * 0.84 };
    }
    if (layer.kind !== "artistText" && layer.kind !== "titleText") return null;
    const artist = layer.kind === "artistText";
    const text = artist
      ? this.project.text.artist.toLocaleUpperCase()
      : this.project.text.title;
    const size =
      this.canvas.width *
      (artist ? this.project.text.artistSize : this.project.text.titleSize);
    this.context.save();
    this.context.font =
      `${artist ? 600 : 700} ${Math.round(size)}px "Segoe UI", system-ui, sans-serif`;
    const width = Math.max(40, this.context.measureText(text).width + 18);
    this.context.restore();
    return { width, height: Math.max(12, size * 1.5) };
  }

  private geometry(layer: ProjectLayer): TransformGeometry | null {
    const base = this.baseSize(layer);
    if (!base) return null;
    const evaluated = evaluateLayerAtTime(layer, this.currentTime);
    return createTransformGeometry(
      evaluated.transform,
      this.canvas.width,
      this.canvas.height,
      base.width,
      base.height
    );
  }

  private drawSelection(): void {
    const layer = this.project.layers.find((item) => item.id === this.selectedLayerId);
    if (!layer || !layer.visible || !this.editable(layer)) return;
    const geometry = this.geometry(layer);
    if (!geometry) return;
    const [first, ...remaining] = geometry.corners;
    this.context.save();
    this.context.strokeStyle = layer.locked ? "#f59e0b" : "#b49cff";
    this.context.fillStyle = "#ffffff";
    this.context.lineWidth = 2;
    this.context.setLineDash([5, 4]);
    this.context.beginPath();
    this.context.moveTo(first.x, first.y);
    for (const point of remaining) this.context.lineTo(point.x, point.y);
    this.context.closePath();
    this.context.stroke();
    this.context.setLineDash([]);
    if (!layer.locked) {
      for (const [name, point] of Object.entries(geometryHandles(geometry))) {
        this.context.beginPath();
        if (name === "rotate") this.context.arc(point.x, point.y, 6, 0, Math.PI * 2);
        else this.context.rect(point.x - 5, point.y - 5, 10, 10);
        this.context.fill();
        this.context.stroke();
      }
    }
    const label = layer.kind === "projectM"
      ? "projectM / MilkDrop"
      : layer.kind === "visualizer"
        ? layer.name
        : "";
    if (label) {
      const labelX = Math.max(4, Math.min(this.canvas.width - 180, first.x));
      const labelY = Math.max(22, first.y - 8);
      this.context.font = '600 14px "Segoe UI", system-ui, sans-serif';
      this.context.fillStyle = "#171421e8";
      this.context.fillRect(labelX, labelY - 18, 176, 22);
      this.context.fillStyle = "#ffffff";
      this.context.fillText(label.slice(0, 24), labelX + 7, labelY - 3);
    }
    this.context.restore();
  }

  private drawGuides(): void {
    this.context.save();
    this.context.strokeStyle = "#22d3ee";
    this.context.lineWidth = 1;
    this.context.setLineDash([4, 3]);
    for (const guide of this.guides) {
      this.context.beginPath();
      if (guide.axis === "x") {
        const x = guide.value * this.canvas.width;
        this.context.moveTo(x, 0);
        this.context.lineTo(x, this.canvas.height);
      } else {
        const y = guide.value * this.canvas.height;
        this.context.moveTo(0, y);
        this.context.lineTo(this.canvas.width, y);
      }
      this.context.stroke();
    }
    this.context.restore();
  }

  private drawSafeArea(): void {
    if (!this.editorGuidesVisible) return;
    this.context.save();
    this.context.strokeStyle = "#ffffff2e";
    this.context.lineWidth = 1;
    this.context.setLineDash([6, 8]);
    this.context.beginPath();
    this.context.moveTo(this.canvas.width / 2, 0);
    this.context.lineTo(this.canvas.width / 2, this.canvas.height);
    this.context.moveTo(0, this.canvas.height / 2);
    this.context.lineTo(this.canvas.width, this.canvas.height / 2);
    this.context.stroke();
    this.context.strokeStyle = "#ffffff45";
    this.context.strokeRect(
      this.canvas.width * 0.06,
      this.canvas.height * 0.05,
      this.canvas.width * 0.88,
      this.canvas.height * 0.9
    );
    this.context.restore();
  }

  private bindEvents(): void {
    this.canvas.addEventListener("pointerdown", (event) => {
      const point = this.toCanvasPoint(event);
      const selectedBefore = this.project.layers.find(
        (layer) => layer.id === this.selectedLayerId
      );
      const selectedGeometry = selectedBefore ? this.geometry(selectedBefore) : null;
      const handle =
        selectedBefore && !selectedBefore.locked && selectedGeometry
          ? hitTestHandle(selectedGeometry, point, 12)
          : null;
      if (!handle) {
        const selectedContainsPoint =
          selectedBefore?.visible &&
          this.editable(selectedBefore) &&
          selectedGeometry &&
          hitTestGeometry(selectedGeometry, point, 10);
        if (this.selectionLocked) {
          if (!selectedContainsPoint) return;
        } else {
          const hit = this.hitTest(point);
          if (hit) {
            this.selectedLayerId = hit.id;
            this.onSelectLayer(hit.id);
          } else {
            this.selectedLayerId = "";
            this.onSelectLayer("");
            this.dirty = true;
            return;
          }
        }
        if (!this.selectedLayerId) {
          return;
        }
      }
      const selected = this.project.layers.find(
        (layer) => layer.id === this.selectedLayerId
      );
      const geometry = selected ? this.geometry(selected) : null;
      if (
        !selected ||
        !geometry ||
        selected.locked ||
        !hitTestGeometry(geometry, point, 10) && !handle
      ) return;
      this.gestureHandle = handle;
      this.gestureMode = handle === "rotate" ? "rotate" : handle ? "resize" : "move";
      this.lastPointer = point;
      this.guides = [];
      this.onTransformStart();
      this.activePointerId = event.pointerId;
      this.canvas.setPointerCapture(event.pointerId);
      this.canvas.classList.add("is-dragging");
      event.preventDefault();
    });

    this.canvas.addEventListener("pointermove", (event) => {
      if (!this.gestureMode) {
        this.updatePointerCursor(this.toCanvasPoint(event));
        return;
      }
      const selected = this.project.layers.find(
        (layer) => layer.id === this.selectedLayerId
      );
      const geometry = selected ? this.geometry(selected) : null;
      const base = selected ? this.baseSize(selected) : null;
      if (!selected || !geometry || !base) return;
      const point = this.toCanvasPoint(event);
      if (this.gestureMode === "move") {
        const evaluated = evaluateLayerAtTime(selected, this.currentTime).transform;
        let x = evaluated.x + (point.x - this.lastPointer.x) / this.canvas.width;
        let y = evaluated.y + (point.y - this.lastPointer.y) / this.canvas.height;
        this.guides = [];
        const snapEnabled = this.snappingEnabled && !event.altKey;
        const xResult = snapValue(
          x,
          this.snapCandidates("x", geometry, selected),
          8 / this.canvas.width,
          snapEnabled
        );
        const yResult = snapValue(
          y,
          this.snapCandidates("y", geometry, selected),
          8 / this.canvas.height,
          snapEnabled
        );
        x = xResult.value;
        y = yResult.value;
        if (xResult.guide !== null) this.guides.push({ axis: "x", value: xResult.guide });
        if (yResult.guide !== null) this.guides.push({ axis: "y", value: yResult.guide });
        this.onTransformLayer(selected.id, { x, y });
      } else if (this.gestureMode === "rotate") {
        const angle =
          (Math.atan2(point.y - geometry.center.y, point.x - geometry.center.x) *
            180) /
            Math.PI +
          90;
        const rotation =
          this.snappingEnabled && !event.altKey ? Math.round(angle / 15) * 15 : angle;
        this.onTransformLayer(selected.id, { rotation });
      } else {
        const local = inverseTransformPoint(geometry, point);
        const scaleX = Math.max(0.01, (Math.abs(local.x) * 2) / base.width);
        const scaleY = Math.max(0.01, (Math.abs(local.y) * 2) / base.height);
        const uniformScale =
          selected.kind === "cover" || event.shiftKey
            ? Math.max(scaleX, scaleY)
            : null;
        this.onTransformLayer(selected.id, {
          scaleX: uniformScale ?? scaleX,
          scaleY: uniformScale ?? scaleY
        });
      }
      this.lastPointer = point;
      this.dirty = true;
    });

    const finish = (event: PointerEvent, commit: boolean) => {
      if (!this.gestureMode) return;
      this.gestureMode = null;
      this.gestureHandle = null;
      this.activePointerId = null;
      this.guides = [];
      if (this.canvas.hasPointerCapture(event.pointerId)) {
        this.canvas.releasePointerCapture(event.pointerId);
      }
      this.canvas.classList.remove("is-dragging");
      this.onTransformEnd(commit);
      this.dirty = true;
    };
    this.canvas.addEventListener("pointerup", (event) => finish(event, true));
    this.canvas.addEventListener("pointercancel", (event) => finish(event, false));

    this.canvas.addEventListener("keydown", (event) => {
      const layer = this.project.layers.find((item) => item.id === this.selectedLayerId);
      if (event.key === "Escape" && this.gestureMode) {
        this.gestureMode = null;
        this.gestureHandle = null;
        this.guides = [];
        if (
          this.activePointerId !== null &&
          this.canvas.hasPointerCapture(this.activePointerId)
        ) {
          this.canvas.releasePointerCapture(this.activePointerId);
        }
        this.activePointerId = null;
        this.canvas.classList.remove("is-dragging");
        this.onTransformEnd(false);
        this.dirty = true;
        return;
      }
      if (!layer || layer.locked || !this.editable(layer)) return;
      const delta = event.shiftKey ? 0.01 : 0.001;
      const transform = evaluateLayerAtTime(layer, this.currentTime).transform;
      let patch: DirectTransformPatch | null = null;
      if (event.key === "ArrowLeft") patch = { x: transform.x - delta };
      if (event.key === "ArrowRight") patch = { x: transform.x + delta };
      if (event.key === "ArrowUp") patch = { y: transform.y - delta };
      if (event.key === "ArrowDown") patch = { y: transform.y + delta };
      if (!patch) return;
      if (!this.keyboardGesture) {
        this.keyboardGesture = true;
        this.onTransformStart();
      }
      this.onTransformLayer(layer.id, patch);
      event.preventDefault();
    });
    this.canvas.addEventListener("keyup", (event) => {
      if (this.keyboardGesture && event.key.startsWith("Arrow")) {
        this.keyboardGesture = false;
        this.onTransformEnd(true);
      }
    });
  }

  private snapCandidates(
    axis: "x" | "y",
    geometry: TransformGeometry,
    selected: ProjectLayer
  ): SnapCandidate[] {
    const canvasSize = axis === "x" ? this.canvas.width : this.canvas.height;
    const halfSize = (axis === "x" ? geometry.width : geometry.height) / 2 / canvasSize;
    const candidates: SnapCandidate[] = [
      { value: 0.5, kind: "center" },
      { value: halfSize, kind: "edge" },
      { value: 1 - halfSize, kind: "edge" }
    ];
    for (let index = 0; index <= 10; index += 1) {
      candidates.push({ value: index / 10, kind: "grid" });
    }
    for (const layer of this.project.layers) {
      if (layer.id === selected.id || !layer.visible || !this.editable(layer)) continue;
      const other = this.geometry(layer);
      if (!other) continue;
      candidates.push({
        value:
          (axis === "x" ? other.center.x : other.center.y) / canvasSize,
        kind: "element"
      });
    }
    return candidates;
  }

  private hitTest(point: Point): ProjectLayer | null {
    for (const layer of [...this.project.layers].reverse()) {
      if (!layer.visible || !this.editable(layer)) continue;
      const geometry = this.geometry(layer);
      if (!geometry || !hitTestGeometry(geometry, point)) continue;
      if (
        (layer.kind === "visualizer" || layer.kind === "projectM") &&
        !this.effectPixelVisible(layer, point)
      ) {
        continue;
      }
      return layer;
    }
    return null;
  }

  private effectPixelVisible(layer: ProjectLayer, point: Point): boolean {
    const geometry = this.geometry(layer);
    if (!geometry) return false;
    const local = inverseTransformPoint(geometry, point);
    const normalizedX = local.x / this.canvas.width + 0.5;
    const normalizedY = local.y / this.canvas.height + 0.5;
    if (
      normalizedX < 0 ||
      normalizedX > 1 ||
      normalizedY < 0 ||
      normalizedY > 1
    ) return false;
    const context =
      layer.kind === "projectM" ? this.projectMContext : this.visualizerContext;
    const source =
      layer.kind === "projectM" ? this.projectMCanvas : this.visualizerCanvas;
    if (!source.width || !source.height) return false;
    try {
      const x = Math.min(
        source.width - 1,
        Math.max(0, Math.floor(normalizedX * source.width))
      );
      const y = Math.min(
        source.height - 1,
        Math.max(0, Math.floor(normalizedY * source.height))
      );
      return context.getImageData(x, y, 1, 1).data[3]! > 8;
    } catch {
      return true;
    }
  }

  private updatePointerCursor(point: Point): void {
    const selected = this.project.layers.find(
      (layer) => layer.id === this.selectedLayerId
    );
    const geometry = selected ? this.geometry(selected) : null;
    const handle =
      selected && geometry && !selected.locked
        ? hitTestHandle(geometry, point, 12)
        : null;
    if (handle === "rotate") {
      this.canvas.style.cursor = "crosshair";
      return;
    }
    if (handle) {
      this.canvas.style.cursor = "nwse-resize";
      return;
    }
    this.canvas.style.cursor = this.hitTest(point) ? "move" : "default";
  }

  private toCanvasPoint(event: PointerEvent): Point {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * this.canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * this.canvas.height
    };
  }
}
