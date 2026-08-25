import type { CoverFitMode } from "../../shared/project";
import { resolveFittedSurface } from "./frameLayout";

export interface CoverDrawPlan {
  sourceX: number;
  sourceY: number;
  sourceWidth: number;
  sourceHeight: number;
  destinationX: number;
  destinationY: number;
  destinationWidth: number;
  destinationHeight: number;
}

export interface NormalizedCoverSize {
  width: number;
  height: number;
}

function positive(value: number): number {
  return Number.isFinite(value) ? Math.max(1, value) : 1;
}

export function fittedCoverSize(
  imageWidth: number,
  imageHeight: number,
  canvasWidth: number,
  canvasHeight: number,
  maximumWidth = 0.82,
  maximumHeight = 0.82
): NormalizedCoverSize {
  const imageRatio = positive(imageWidth) / positive(imageHeight);
  const canvasRatio = positive(canvasWidth) / positive(canvasHeight);
  let width = maximumWidth;
  let height = (width * canvasRatio) / imageRatio;
  if (height > maximumHeight) {
    height = maximumHeight;
    width = (height * imageRatio) / canvasRatio;
  }
  return {
    width: Math.max(0.01, Math.min(1, width)),
    height: Math.max(0.01, Math.min(1, height))
  };
}

export function coverDrawPlan(
  imageWidth: number,
  imageHeight: number,
  targetWidth: number,
  targetHeight: number,
  fitMode: CoverFitMode,
  originalScale = 1
): CoverDrawPlan {
  const layout = resolveFittedSurface(
    positive(imageWidth),
    positive(imageHeight),
    positive(targetWidth),
    positive(targetHeight),
    fitMode,
    originalScale
  );
  return {
    sourceX: layout.source.x,
    sourceY: layout.source.y,
    sourceWidth: layout.source.width,
    sourceHeight: layout.source.height,
    destinationX: layout.destination.x,
    destinationY: layout.destination.y,
    destinationWidth: layout.destination.width,
    destinationHeight: layout.destination.height
  };
}
