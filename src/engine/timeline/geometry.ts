export interface TimelineViewport {
  duration: number;
  width: number;
  zoom: number;
  scrollTime: number;
}

export interface TimelineSnapTarget {
  time: number;
  kind: "marker" | "clip" | "frame";
}

export interface TimelineSnapResult {
  time: number;
  snapped: boolean;
  target: TimelineSnapTarget | null;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 100;
const MIN_CLIP_DURATION = 1 / 60;

export function normalizeViewport(viewport: TimelineViewport): TimelineViewport {
  const duration = Math.max(0.001, viewport.duration);
  const width = Math.max(1, viewport.width);
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, viewport.zoom));
  const visibleDuration = duration / zoom;
  return {
    duration,
    width,
    zoom,
    scrollTime: Math.min(
      Math.max(0, viewport.scrollTime),
      Math.max(0, duration - visibleDuration)
    )
  };
}

export function visibleDuration(viewport: TimelineViewport): number {
  const normalized = normalizeViewport(viewport);
  return normalized.duration / normalized.zoom;
}

export function timeToPixel(
  timestamp: number,
  viewport: TimelineViewport
): number {
  const normalized = normalizeViewport(viewport);
  return (
    ((timestamp - normalized.scrollTime) / visibleDuration(normalized)) *
    normalized.width
  );
}

export function pixelToTime(
  pixel: number,
  viewport: TimelineViewport
): number {
  const normalized = normalizeViewport(viewport);
  return clampTime(
    normalized.scrollTime +
      (pixel / normalized.width) * visibleDuration(normalized),
    normalized.duration
  );
}

export function clampTime(timestamp: number, duration: number): number {
  return Math.min(Math.max(0, timestamp), Math.max(0, duration));
}

export function frameTime(timestamp: number, fps: number): number {
  return Math.round(timestamp * fps) / fps;
}

export function snapTimelineTime(
  timestamp: number,
  viewport: TimelineViewport,
  targets: readonly TimelineSnapTarget[],
  thresholdPixels: number,
  enabled = true
): TimelineSnapResult {
  const clamped = clampTime(timestamp, viewport.duration);
  if (!enabled) return { time: clamped, snapped: false, target: null };
  const thresholdTime =
    (thresholdPixels / normalizeViewport(viewport).width) *
    visibleDuration(viewport);
  const priority = { marker: 0, clip: 1, frame: 2 } as const;
  const best = targets
    .map((target) => ({
      target,
      distance: Math.abs(target.time - clamped)
    }))
    .filter((entry) => entry.distance <= thresholdTime)
    .sort(
      (left, right) =>
        left.distance - right.distance ||
        priority[left.target.kind] - priority[right.target.kind] ||
        left.target.time - right.target.time
    )[0];
  return best
    ? {
        time: clampTime(best.target.time, viewport.duration),
        snapped: true,
        target: best.target
      }
    : { time: clamped, snapped: false, target: null };
}

export function hitTestKeyframe(
  pixel: number,
  keyframeTimes: readonly number[],
  viewport: TimelineViewport,
  radiusPixels = 8
): number | null {
  let bestIndex: number | null = null;
  let bestDistance = Infinity;
  keyframeTimes.forEach((time, index) => {
    const distance = Math.abs(timeToPixel(time, viewport) - pixel);
    if (distance <= radiusPixels && distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });
  return bestIndex;
}

export function clampClip(
  start: number,
  end: number,
  duration: number,
  minimumDuration = MIN_CLIP_DURATION
): { start: number; end: number } {
  const boundedDuration = Math.max(minimumDuration, duration);
  const boundedStart = clampTime(start, boundedDuration);
  const boundedEnd = clampTime(end, boundedDuration);
  if (boundedEnd - boundedStart >= minimumDuration) {
    return { start: boundedStart, end: boundedEnd };
  }
  if (boundedStart + minimumDuration <= boundedDuration) {
    return { start: boundedStart, end: boundedStart + minimumDuration };
  }
  return {
    start: Math.max(0, boundedDuration - minimumDuration),
    end: boundedDuration
  };
}
