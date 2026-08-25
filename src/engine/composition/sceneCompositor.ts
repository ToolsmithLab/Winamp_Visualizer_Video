import type { AudioSnapshot } from "../../shared/audioAnalysis";
import type {
  LayerKind,
  ProjectLayer,
  VisualizerProject
} from "../../shared/project";
import { resolveLayerTransform } from "../../shared/project";
import { evaluateLayerAtTime } from "../keyframes/keyframeEngine";
import { VisualizerHost } from "../plugins/visualizerHost";
import type { PluginRuntimeStatus } from "../plugins/types";
import { coverDrawPlan } from "./coverLayout";
import {
  resolveFrameTarget,
  resolveFullFrameSurface
} from "./frameLayout";

export interface SceneSources {
  clip?: CanvasImageSource | null;
  clipBlack?: boolean;
  projectM: CanvasImageSource | null;
  cover: CanvasImageSource | null;
  visualizer?: {
    canvas: CanvasImageSource;
    context: CanvasRenderingContext2D;
  };
}

export interface SceneRenderOptions {
  frameRate: number;
}

interface ImageDimensions {
  width: number;
  height: number;
}

function dimensions(image: CanvasImageSource): ImageDimensions {
  const candidate = image as unknown as {
    width?: number;
    height?: number;
    naturalWidth?: number;
    naturalHeight?: number;
    videoWidth?: number;
    videoHeight?: number;
  };
  return {
    width:
      candidate.videoWidth ||
      candidate.naturalWidth ||
      candidate.width ||
      1,
    height:
      candidate.videoHeight ||
      candidate.naturalHeight ||
      candidate.height ||
      1
  };
}

export class SceneCompositor {
  private readonly visualizers: VisualizerHost;
  private previousTime = Number.NEGATIVE_INFINITY;

  constructor(onPluginStatusChange?: (status: PluginRuntimeStatus) => void) {
    this.visualizers = new VisualizerHost(undefined, onPluginStatusChange);
  }

  reset(): void {
    this.previousTime = Number.NEGATIVE_INFINITY;
    this.visualizers.reset();
  }

  dispose(): void {
    this.visualizers.dispose();
  }

  pluginStatus(layerId: string): PluginRuntimeStatus | null {
    return this.visualizers.status(layerId);
  }

  resetPlugin(layerId: string): void {
    this.visualizers.resetLayer(layerId);
  }

  render(
    context: CanvasRenderingContext2D,
    width: number,
    height: number,
    project: VisualizerProject,
    audio: AudioSnapshot,
    time: number,
    sources: SceneSources,
    options: SceneRenderOptions
  ): void {
    const target = resolveFrameTarget(width, height);
    if (time + 0.000_001 < this.previousTime) this.reset();
    this.previousTime = time;
    this.visualizers.setParticleSeed(project.projectM.particleSeed);
    this.visualizers.reconcile(project.layers);

    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.globalAlpha = 1;
    context.globalCompositeOperation = "copy";
    const gradient = context.createLinearGradient(
      target.viewport.x,
      target.viewport.y,
      target.viewport.right,
      target.viewport.bottom
    );
    gradient.addColorStop(0, project.canvas.backgroundColor);
    gradient.addColorStop(0.56, "#111427");
    gradient.addColorStop(1, "#05060a");
    context.fillStyle = gradient;
    context.fillRect(
      target.viewport.x,
      target.viewport.y,
      target.viewport.width,
      target.viewport.height
    );
    context.restore();
    context.globalAlpha = 1;
    context.globalCompositeOperation = "source-over";
    this.drawGlow(context, width, height, project, audio);

    for (const sourceLayer of project.layers) {
      const evaluated = evaluateLayerAtTime(sourceLayer, time);
      const layer: ProjectLayer = {
        ...sourceLayer,
        opacity: evaluated.opacity,
        transform: evaluated.transform,
        reactive: sourceLayer.reactive
          ? { ...sourceLayer.reactive, intensity: evaluated.intensity }
          : sourceLayer.reactive
      };
      if (!this.isLayerActive(layer, time)) continue;
      context.save();
      context.globalAlpha = Math.max(0, Math.min(1, layer.opacity));
      context.globalCompositeOperation = layer.blendMode;
      this.drawLayer(
        context,
        width,
        height,
        project,
        layer,
        audio,
        time,
        sources,
        options.frameRate
      );
      context.restore();
    }
  }

  private drawLayer(
    context: CanvasRenderingContext2D,
    width: number,
    height: number,
    project: VisualizerProject,
    layer: ProjectLayer,
    audio: AudioSnapshot,
    time: number,
    sources: SceneSources,
    frameRate: number
  ): void {
    if (layer.kind === "projectM") {
      if (sources.projectM) {
        const intensity = Math.max(
          0,
          Math.min(2, layer.reactive?.intensity ?? 1)
        );
        if (intensity <= 1) {
          context.globalAlpha *= intensity;
          this.drawTransformedSurface(
            context,
            sources.projectM,
            width,
            height,
            layer,
            project,
            1
          );
        } else {
          this.drawTransformedSurface(
            context,
            sources.projectM,
            width,
            height,
            layer,
            project,
            1
          );
          context.globalCompositeOperation = "screen";
          context.globalAlpha *= intensity - 1;
          this.drawTransformedSurface(
            context,
            sources.projectM,
            width,
            height,
            layer,
            project
          );
        }
      }
      return;
    }
    if (layer.kind === "visualizer") {
      const surface = sources.visualizer;
      if (!surface) {
        this.visualizers.render(
          context,
          width,
          height,
          layer,
          audio,
          time,
          frameRate
        );
        return;
      }
      const surfaceContext = surface.context;
      surfaceContext.save();
      surfaceContext.setTransform(1, 0, 0, 1, 0, 0);
      surfaceContext.globalAlpha = 1;
      surfaceContext.globalCompositeOperation = "source-over";
      surfaceContext.clearRect(0, 0, width, height);
      this.visualizers.render(
        surfaceContext,
        width,
        height,
        layer,
        audio,
        time,
        frameRate
      );
      surfaceContext.restore();
      this.drawTransformedSurface(
        context,
        surface.canvas,
        width,
        height,
        layer,
        project
      );
      return;
    }
    if (layer.kind === "cover") {
      const videoBackground = Boolean(project.clip.filePath);
      this.drawBackground(
        context,
        width,
        height,
        project,
        layer,
        audio,
        videoBackground ? sources.clip ?? null : sources.cover,
        videoBackground,
        videoBackground && Boolean(sources.clipBlack)
      );
      return;
    }
    if (layer.kind === "artistText" || layer.kind === "titleText") {
      this.drawText(context, width, height, project, layer);
    }
  }

  private drawTransformedSurface(
    context: CanvasRenderingContext2D,
    surface: CanvasImageSource,
    width: number,
    height: number,
    layer: ProjectLayer,
    project: VisualizerProject,
    edgeBleedPixels = 0
  ): void {
    const transform = resolveLayerTransform(project, layer);
    const source = dimensions(surface);
    const layout = resolveFullFrameSurface(
      source.width,
      source.height,
      width,
      height,
      edgeBleedPixels
    );
    context.save();
    context.translate(width * transform.x, height * transform.y);
    context.rotate((transform.rotation * Math.PI) / 180);
    context.scale(
      Math.max(0.01, Math.abs(transform.scaleX)),
      Math.max(0.01, Math.abs(transform.scaleY))
    );
    context.drawImage(
      surface,
      layout.source.x,
      layout.source.y,
      layout.source.width,
      layout.source.height,
      -layout.destination.width / 2,
      -layout.destination.height / 2,
      layout.destination.width,
      layout.destination.height
    );
    context.restore();
  }

  private isLayerActive(layer: ProjectLayer, time: number): boolean {
    return layer.visible &&
      time >= layer.startTime &&
      (layer.endTime === null || time <= layer.endTime);
  }

  private drawGlow(
    context: CanvasRenderingContext2D,
    width: number,
    height: number,
    project: VisualizerProject,
    audio: AudioSnapshot
  ): void {
    const radius = width * (0.45 + audio.bass * 0.1);
    const glow = context.createRadialGradient(
      width / 2,
      height * 0.72,
      0,
      width / 2,
      height * 0.72,
      radius
    );
    glow.addColorStop(0, `${project.canvas.accentColor}55`);
    glow.addColorStop(1, `${project.canvas.accentColor}00`);
    context.fillStyle = glow;
    context.fillRect(0, 0, width, height);
  }

  private drawBackground(
    context: CanvasRenderingContext2D,
    width: number,
    height: number,
    project: VisualizerProject,
    layer: ProjectLayer,
    audio: AudioSnapshot,
    backgroundMedia: CanvasImageSource | null,
    video: boolean,
    blackFrame: boolean
  ): void {
    if (!backgroundMedia && !blackFrame) return;
    const cover = project.cover;
    const transform = resolveLayerTransform(project, layer);
    const targetWidth = width * cover.width * Math.abs(transform.scaleX);
    const targetHeight = height * cover.height * Math.abs(transform.scaleY);
    const centerX = width * transform.x;
    const centerY = height * transform.y;
    const x = -targetWidth / 2;
    const y = -targetHeight / 2;
    const image = backgroundMedia ? dimensions(backgroundMedia) : null;
    const plan = image
      ? coverDrawPlan(
          image.width,
          image.height,
          targetWidth,
          targetHeight,
          cover.fitMode,
          width / project.canvas.width
        )
      : null;

    if (!video) {
      context.save();
      context.translate(centerX, centerY);
      context.rotate((transform.rotation * Math.PI) / 180);
      context.globalAlpha *= cover.opacity * (0.18 + audio.bass * 0.08);
      context.fillStyle = project.canvas.accentColor;
      const glowInset = width * (0.008 + audio.bass * 0.004);
      context.beginPath();
      context.roundRect(
        x - glowInset,
        y - glowInset,
        targetWidth + glowInset * 2,
        targetHeight + glowInset * 2,
        Math.min(
          width * cover.cornerRadius + glowInset,
          targetWidth / 2,
          targetHeight / 2
        )
      );
      context.fill();
      context.restore();
    }

    context.save();
    context.translate(centerX, centerY);
    context.rotate((transform.rotation * Math.PI) / 180);
    context.globalAlpha *= cover.opacity;
    const radius = Math.min(
      width * cover.cornerRadius,
      targetWidth / 2,
      targetHeight / 2
    );
    context.beginPath();
    context.roundRect(x, y, targetWidth, targetHeight, radius);
    context.clip();
    if (blackFrame) {
      context.fillStyle = "#000000";
      context.fillRect(x, y, targetWidth, targetHeight);
    } else if (backgroundMedia && plan) {
      context.drawImage(
        backgroundMedia,
        plan.sourceX,
        plan.sourceY,
        plan.sourceWidth,
        plan.sourceHeight,
        plan.destinationX,
        plan.destinationY,
        plan.destinationWidth,
        plan.destinationHeight
      );
    }
    context.restore();
  }

  private drawText(
    context: CanvasRenderingContext2D,
    width: number,
    height: number,
    project: VisualizerProject,
    layer: ProjectLayer
  ): void {
    const kind: LayerKind = layer.kind;
    const artist = kind === "artistText";
    const text = artist
      ? project.text.artist.toLocaleUpperCase()
      : project.text.title;
    const transform = resolveLayerTransform(project, layer);
    const x = width * transform.x;
    const y = height * transform.y;
    const size = width * (artist ? project.text.artistSize : project.text.titleSize);
    context.save();
    context.translate(x, y);
    context.rotate((transform.rotation * Math.PI) / 180);
    context.scale(
      Math.max(0.01, Math.abs(transform.scaleX)),
      Math.max(0.01, Math.abs(transform.scaleY))
    );
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillStyle = artist
      ? project.text.artistColor
      : project.text.titleColor;
    context.font =
      `${artist ? 600 : 700} ${Math.round(size)}px "Segoe UI", system-ui, sans-serif`;
    context.lineWidth = Math.max(2, size * 0.055);
    context.strokeStyle = "#000000aa";
    context.strokeText(text, 0, 0);
    context.fillText(text, 0, 0);
    context.restore();
  }
}
