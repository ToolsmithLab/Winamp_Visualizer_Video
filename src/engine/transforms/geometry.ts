import type { LayerTransform } from "../../shared/project";

export interface Point {
  x: number;
  y: number;
}

export interface TransformGeometry {
  center: Point;
  width: number;
  height: number;
  rotationRadians: number;
  corners: readonly [Point, Point, Point, Point];
}

export type TransformHandle =
  | "north-west"
  | "north-east"
  | "south-east"
  | "south-west"
  | "rotate";

export function rotatePoint(point: Point, radians: number): Point {
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return {
    x: point.x * cosine - point.y * sine,
    y: point.x * sine + point.y * cosine
  };
}

export function transformPoint(
  geometry: TransformGeometry,
  localPoint: Point
): Point {
  const rotated = rotatePoint(localPoint, geometry.rotationRadians);
  return {
    x: geometry.center.x + rotated.x,
    y: geometry.center.y + rotated.y
  };
}

export function inverseTransformPoint(
  geometry: TransformGeometry,
  canvasPoint: Point
): Point {
  return rotatePoint(
    {
      x: canvasPoint.x - geometry.center.x,
      y: canvasPoint.y - geometry.center.y
    },
    -geometry.rotationRadians
  );
}

export function createTransformGeometry(
  transform: LayerTransform,
  canvasWidth: number,
  canvasHeight: number,
  baseWidth: number,
  baseHeight: number
): TransformGeometry {
  const width = Math.max(0.01, Math.abs(baseWidth * transform.scaleX));
  const height = Math.max(0.01, Math.abs(baseHeight * transform.scaleY));
  const rotationRadians = (transform.rotation * Math.PI) / 180;
  const center = {
    x: transform.x * canvasWidth,
    y: transform.y * canvasHeight
  };
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const geometry = {
    center,
    width,
    height,
    rotationRadians,
    corners: [] as unknown as [Point, Point, Point, Point]
  };
  geometry.corners = [
    transformPoint(geometry, { x: -halfWidth, y: -halfHeight }),
    transformPoint(geometry, { x: halfWidth, y: -halfHeight }),
    transformPoint(geometry, { x: halfWidth, y: halfHeight }),
    transformPoint(geometry, { x: -halfWidth, y: halfHeight })
  ];
  return geometry;
}

export function hitTestGeometry(
  geometry: TransformGeometry,
  point: Point,
  tolerance = 0
): boolean {
  const local = inverseTransformPoint(geometry, point);
  return (
    Math.abs(local.x) <= geometry.width / 2 + tolerance &&
    Math.abs(local.y) <= geometry.height / 2 + tolerance
  );
}

export function geometryHandles(
  geometry: TransformGeometry,
  rotationOffset = 28
): Record<TransformHandle, Point> {
  const [northWest, northEast, southEast, southWest] = geometry.corners;
  return {
    "north-west": northWest,
    "north-east": northEast,
    "south-east": southEast,
    "south-west": southWest,
    rotate: transformPoint(geometry, {
      x: 0,
      y: -geometry.height / 2 - rotationOffset
    })
  };
}

export function hitTestHandle(
  geometry: TransformGeometry,
  point: Point,
  radius: number
): TransformHandle | null {
  for (const [handle, position] of Object.entries(
    geometryHandles(geometry)
  ) as [TransformHandle, Point][]) {
    if (Math.hypot(point.x - position.x, point.y - position.y) <= radius) {
      return handle;
    }
  }
  return null;
}

export interface SnapCandidate {
  value: number;
  kind: "center" | "edge" | "element" | "grid";
}

export interface SnapResult {
  value: number;
  snapped: boolean;
  guide: number | null;
  kind: SnapCandidate["kind"] | null;
}

const SNAP_PRIORITY: Record<SnapCandidate["kind"], number> = {
  center: 0,
  edge: 1,
  element: 2,
  grid: 3
};

export function snapValue(
  value: number,
  candidates: readonly SnapCandidate[],
  threshold: number,
  enabled = true
): SnapResult {
  if (!enabled) return { value, snapped: false, guide: null, kind: null };
  const matching = candidates
    .map((candidate) => ({
      ...candidate,
      distance: Math.abs(candidate.value - value)
    }))
    .filter((candidate) => candidate.distance <= threshold)
    .sort(
      (left, right) =>
        left.distance - right.distance ||
        SNAP_PRIORITY[left.kind] - SNAP_PRIORITY[right.kind] ||
        left.value - right.value
    );
  const best = matching[0];
  return best
    ? { value: best.value, snapped: true, guide: best.value, kind: best.kind }
    : { value, snapped: false, guide: null, kind: null };
}
