import path from "node:path";
import {
  Canvas,
  GlobalFonts,
  Image,
  ImageData,
  clearAllCache,
  createCanvas,
  loadImage
} from "@napi-rs/canvas";
import type { ProjectMFrame } from "../../shared/ipc";
import type { AudioSnapshot } from "../../shared/audioAnalysis";
import type { VisualizerProject } from "../../shared/project";
import { convertProjectMBgraToOverlayRgba } from "../../shared/projectMOverlay";
import { SceneCompositor } from "../../engine/composition/sceneCompositor";
import {
  assertFrameBufferLayout,
  assertOpaqueFrameCoverage,
  resolveFrameTarget,
  type FrameCoverage
} from "../../engine/composition/frameLayout";

let fontsRegistered = false;

function registerWindowsFonts(): void {
  if (fontsRegistered || process.platform !== "win32") return;
  fontsRegistered = true;
  const fonts = path.join(process.env.WINDIR ?? "C:\\Windows", "Fonts");
  GlobalFonts.registerFromPath(path.join(fonts, "segoeui.ttf"), "Segoe UI");
  GlobalFonts.registerFromPath(path.join(fonts, "segoeuib.ttf"), "Segoe UI");
}

export class OfflineSceneCompositor {
  private readonly canvas: Canvas;
  private readonly context: CanvasRenderingContext2D;
  private readonly projectMCanvas: Canvas;
  private readonly projectMContext: CanvasRenderingContext2D;
  private readonly clipCanvas: Canvas;
  private readonly clipContext: CanvasRenderingContext2D;
  private readonly visualizerCanvas: Canvas;
  private readonly visualizerContext: CanvasRenderingContext2D;
  private readonly scene = new SceneCompositor();
  private projectMImageData: ImageData | null = null;
  private projectMRgba: Uint8ClampedArray | null = null;
  private clipImageData: ImageData | null = null;
  private clipBlack = false;
  private cover: Image | null = null;
  private coverage: FrameCoverage | null = null;

  constructor(
    readonly width: number,
    readonly height: number
  ) {
    registerWindowsFonts();
    this.canvas = createCanvas(width, height);
    this.context = this.canvas.getContext("2d") as unknown as CanvasRenderingContext2D;
    this.projectMCanvas = createCanvas(width, height);
    this.projectMContext =
      this.projectMCanvas.getContext("2d") as unknown as CanvasRenderingContext2D;
    this.clipCanvas = createCanvas(width, height);
    this.clipContext =
      this.clipCanvas.getContext("2d") as unknown as CanvasRenderingContext2D;
    this.visualizerCanvas = createCanvas(width, height);
    this.visualizerContext =
      this.visualizerCanvas.getContext("2d") as unknown as CanvasRenderingContext2D;
  }

  async loadCover(filePath: string | null): Promise<void> {
    this.cover = filePath ? await loadImage(filePath) : null;
  }

  setClipFrame(
    rgba: Buffer | null,
    width = this.width,
    height = this.height
  ): void {
    if (!rgba) {
      this.clipContext.clearRect(
        0,
        0,
        this.clipCanvas.width,
        this.clipCanvas.height
      );
      this.clipImageData = null;
      this.clipBlack = true;
      return;
    }
    this.clipBlack = false;
    if (
      this.clipCanvas.width !== width ||
      this.clipCanvas.height !== height
    ) {
      this.clipCanvas.width = width;
      this.clipCanvas.height = height;
    }
    assertFrameBufferLayout(
      rgba,
      resolveFrameTarget(width, height),
      width * 4
    );
    const bytes = new Uint8ClampedArray(
      rgba.buffer,
      rgba.byteOffset,
      rgba.byteLength
    );
    this.clipImageData = new ImageData(bytes, width, height);
    this.clipContext.putImageData(
      this.clipImageData as unknown as globalThis.ImageData,
      0,
      0
    );
  }

  setProjectMFrame(frame: ProjectMFrame | null): void {
    if (!frame) {
      this.projectMContext.clearRect(0, 0, this.width, this.height);
      this.projectMImageData = null;
      this.projectMRgba = null;
      return;
    }
    if (
      frame.width !== this.width ||
      frame.height !== this.height ||
      frame.stride !== frame.width * 4 ||
      frame.bytes.byteLength !== frame.stride * frame.height
    ) {
      throw new Error("Framebuffer projectM incompatibile con il compositor.");
    }
    assertFrameBufferLayout(
      frame.bytes,
      resolveFrameTarget(this.width, this.height),
      frame.stride
    );
    if (!this.projectMRgba || this.projectMRgba.byteLength !== frame.bytes.byteLength) {
      this.projectMRgba = new Uint8ClampedArray(frame.bytes.byteLength);
    }
    const rgba = convertProjectMBgraToOverlayRgba(
      frame.bytes,
      frame.width,
      frame.height,
      frame.stride,
      this.projectMRgba
    );
    this.projectMRgba = rgba;
    // @napi-rs/canvas copia i dati nel costruttore: va creato dopo il fill.
    this.projectMImageData = new ImageData(rgba, frame.width, frame.height);
    this.projectMContext.clearRect(0, 0, this.width, this.height);
    this.projectMContext.putImageData(
      this.projectMImageData as unknown as globalThis.ImageData,
      0,
      0
    );
  }

  render(
    project: VisualizerProject,
    audio: AudioSnapshot,
    time: number,
    frameRate: number,
    hasProjectM: boolean
  ): Buffer {
    this.scene.render(
      this.context,
      this.width,
      this.height,
      project,
      audio,
      time,
      {
        clip: project.clip.filePath
          ? this.clipImageData
            ? (this.clipCanvas as unknown as CanvasImageSource)
            : null
          : null,
        clipBlack:
          Boolean(project.clip.filePath) &&
          project.clip.endMode === "black" &&
          this.clipBlack,
        projectM: hasProjectM
          ? (this.projectMCanvas as unknown as CanvasImageSource)
          : null,
        cover: this.cover as unknown as CanvasImageSource | null,
        visualizer: {
          canvas: this.visualizerCanvas as unknown as CanvasImageSource,
          context: this.visualizerContext
        }
      },
      { frameRate }
    );
    const rgba = this.canvas.data();
    this.coverage = assertOpaqueFrameCoverage(
      rgba,
      this.width,
      this.height,
      this.width * 4
    );
    return rgba;
  }

  frameCoverage(): FrameCoverage | null {
    return this.coverage ? { ...this.coverage } : null;
  }

  png(): Buffer {
    return this.canvas.toBuffer("image/png");
  }

  projectMPng(): Buffer {
    return this.projectMCanvas.toBuffer("image/png");
  }

  reset(): void {
    this.scene.reset();
  }

  dispose(): void {
    this.scene.dispose();
    this.cover = null;
    this.projectMImageData = null;
    this.projectMRgba = null;
    this.clipImageData = null;
    this.clipBlack = false;
    this.coverage = null;
    clearAllCache();
  }
}
