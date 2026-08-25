import type { VisualizerProject } from "../../shared/project";
import { fittedCoverSize } from "./coverLayout";

export interface CoverImageMetrics {
  width: number;
  height: number;
}

function coverLayer(project: VisualizerProject) {
  return project.layers.find((layer) => layer.kind === "cover");
}

export function loadCoverIntoProject(
  project: VisualizerProject,
  filePath: string,
  image: CoverImageMetrics
): void {
  project.cover.filePath = filePath;
  project.cover.fitMode = "contain";
  const layer = coverLayer(project);
  if (layer) {
    layer.visible = true;
    layer.locked = false;
  }
  fitCoverToCanvas(project, image);
  centerCover(project);
}

export function setCoverVisible(
  project: VisualizerProject,
  visible: boolean
): void {
  const layer = coverLayer(project);
  if (layer) layer.visible = visible;
}

export function centerCover(project: VisualizerProject): void {
  const layer = coverLayer(project);
  if (!layer || layer.locked) return;
  layer.transform.x = 0.5;
  layer.transform.y = 0.5;
  layer.keyframes = layer.keyframes.filter(
    (keyframe) => keyframe.property !== "x" && keyframe.property !== "y"
  );
}

export function fitCoverToCanvas(
  project: VisualizerProject,
  image: CoverImageMetrics
): void {
  const size = fittedCoverSize(
    image.width,
    image.height,
    project.canvas.width,
    project.canvas.height,
    1,
    1
  );
  project.cover.width = size.width;
  project.cover.height = size.height;
  const layer = coverLayer(project);
  if (!layer || layer.locked) return;
  layer.transform.scaleX = 1;
  layer.transform.scaleY = 1;
  layer.keyframes = layer.keyframes.filter(
    (keyframe) => keyframe.property !== "scale"
  );
}

export function resetCoverPresentation(
  project: VisualizerProject,
  image: CoverImageMetrics
): void {
  const layer = coverLayer(project);
  project.cover.fitMode = "contain";
  project.cover.opacity = 1;
  project.cover.cornerRadius = 0.04;
  fitCoverToCanvas(project, image);
  if (!layer || layer.locked) return;
  layer.visible = true;
  layer.opacity = 1;
  layer.blendMode = "source-over";
  layer.transform = {
    x: 0.5,
    y: 0.5,
    scaleX: 1,
    scaleY: 1,
    rotation: 0
  };
  layer.keyframes = layer.keyframes.filter(
    (keyframe) =>
      keyframe.property !== "x" &&
      keyframe.property !== "y" &&
      keyframe.property !== "scale" &&
      keyframe.property !== "rotation" &&
      keyframe.property !== "opacity"
  );
}

export function removeCoverFromProject(project: VisualizerProject): void {
  project.cover.filePath = null;
  const layer = coverLayer(project);
  if (layer) {
    layer.visible = false;
    layer.locked = false;
  }
  project.assets = project.assets.filter((asset) => asset.type !== "cover");
}
