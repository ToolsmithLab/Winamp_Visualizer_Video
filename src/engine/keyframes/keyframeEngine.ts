import type {
  KeyframeInterpolation,
  LayerTransform,
  ProjectKeyframe,
  ProjectLayer
} from "../../shared/project";

export const ANIMATABLE_PROPERTIES = [
  "x",
  "y",
  "scale",
  "rotation",
  "opacity",
  "intensity"
] as const;

export type AnimatableProperty = (typeof ANIMATABLE_PROPERTIES)[number];

export interface EvaluatedLayerState {
  transform: LayerTransform;
  opacity: number;
  intensity: number;
}

export interface KeyframeIndex {
  readonly tracks: ReadonlyMap<AnimatableProperty, readonly ProjectKeyframe[]>;
}

const propertySet = new Set<string>(ANIMATABLE_PROPERTIES);
const EPSILON = 1e-7;
const indexCache = new WeakMap<
  readonly ProjectKeyframe[],
  KeyframeIndex
>();

export function isAnimatableProperty(value: string): value is AnimatableProperty {
  return propertySet.has(value);
}

export function clampPropertyValue(
  property: AnimatableProperty,
  value: number
): number {
  if (!Number.isFinite(value)) {
    throw new TypeError(`Valore keyframe non finito per ${property}.`);
  }
  switch (property) {
    case "opacity":
      return Math.min(1, Math.max(0, value));
    case "scale":
      return Math.min(20, Math.max(0.01, value));
    case "intensity":
      return Math.min(10, Math.max(0, value));
    case "rotation":
      return Math.min(36000, Math.max(-36000, value));
    default:
      return Math.min(100, Math.max(-100, value));
  }
}

export function interpolationProgress(
  interpolation: KeyframeInterpolation,
  progress: number
): number {
  const t = Math.min(1, Math.max(0, progress));
  switch (interpolation) {
    case "hold":
      return 0;
    case "ease-in":
      return t * t;
    case "ease-out":
      return 1 - (1 - t) * (1 - t);
    case "ease-in-out":
      return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    default:
      return t;
  }
}

export function compareKeyframes(
  left: ProjectKeyframe,
  right: ProjectKeyframe
): number {
  return left.time - right.time || left.id.localeCompare(right.id);
}

export function canonicalizeKeyframes(
  keyframes: readonly ProjectKeyframe[]
): ProjectKeyframe[] {
  const valid = keyframes.filter(
    (keyframe) =>
      isAnimatableProperty(keyframe.property) &&
      typeof keyframe.value === "number" &&
      Number.isFinite(keyframe.value) &&
      Number.isFinite(keyframe.time) &&
      keyframe.time >= 0
  );
  const winners = new Map<string, ProjectKeyframe>();
  for (const keyframe of [...valid].sort(compareKeyframes)) {
    const property = keyframe.property as AnimatableProperty;
    const normalized = {
      ...keyframe,
      property,
      time: Math.max(0, keyframe.time),
      value: clampPropertyValue(property, keyframe.value as number)
    };
    // Collision policy: stable lexical-last ID wins for a property/timestamp.
    winners.set(`${property}\u0000${normalized.time}`, normalized);
  }
  return [...winners.values()].sort(compareKeyframes);
}

export function buildKeyframeIndex(
  keyframes: readonly ProjectKeyframe[]
): KeyframeIndex {
  const tracks = new Map<AnimatableProperty, ProjectKeyframe[]>();
  for (const keyframe of canonicalizeKeyframes(keyframes)) {
    const property = keyframe.property as AnimatableProperty;
    const track = tracks.get(property) ?? [];
    track.push(keyframe);
    tracks.set(property, track);
  }
  return { tracks };
}

export function cachedKeyframeIndex(
  keyframes: readonly ProjectKeyframe[]
): KeyframeIndex {
  const cached = indexCache.get(keyframes);
  if (cached) return cached;
  const created = buildKeyframeIndex(keyframes);
  indexCache.set(keyframes, created);
  return created;
}

function upperBound(
  track: readonly ProjectKeyframe[],
  timestamp: number
): number {
  let low = 0;
  let high = track.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if ((track[middle]?.time ?? Infinity) <= timestamp) low = middle + 1;
    else high = middle;
  }
  return low;
}

export function evaluateTrack(
  track: readonly ProjectKeyframe[],
  timestamp: number,
  baseValue: number
): { value: number; source: "base" | "keyframe" | "interpolated" } {
  if (!Number.isFinite(timestamp)) {
    throw new TypeError("Il timestamp del frame evaluator deve essere finito.");
  }
  if (!track.length || timestamp < (track[0]?.time ?? 0) - EPSILON) {
    return { value: baseValue, source: "base" };
  }
  const nextIndex = upperBound(track, timestamp);
  const left = track[nextIndex - 1];
  const right = track[nextIndex];
  if (!left || typeof left.value !== "number") {
    return { value: baseValue, source: "base" };
  }
  if (
    !right ||
    typeof right.value !== "number" ||
    Math.abs(timestamp - left.time) <= EPSILON
  ) {
    return { value: left.value, source: "keyframe" };
  }
  const duration = right.time - left.time;
  if (duration <= EPSILON || left.interpolation === "hold") {
    return { value: left.value, source: "keyframe" };
  }
  const t = interpolationProgress(
    left.interpolation,
    (timestamp - left.time) / duration
  );
  return {
    value: left.value + (right.value - left.value) * t,
    source: "interpolated"
  };
}

export function basePropertyValue(
  layer: ProjectLayer,
  property: AnimatableProperty
): number {
  switch (property) {
    case "x":
    case "y":
    case "rotation":
      return layer.transform[property];
    case "scale":
      return Math.sqrt(
        Math.max(0.0001, Math.abs(layer.transform.scaleX * layer.transform.scaleY))
      );
    case "opacity":
      return layer.opacity;
    case "intensity":
      return layer.reactive?.intensity ?? 1;
  }
}

export function evaluateProperty(
  index: KeyframeIndex,
  layer: ProjectLayer,
  timestamp: number,
  property: AnimatableProperty
): ReturnType<typeof evaluateTrack> {
  return evaluateTrack(
    index.tracks.get(property) ?? [],
    timestamp,
    basePropertyValue(layer, property)
  );
}

export function evaluateLayerAtTime(
  layer: ProjectLayer,
  timestamp: number,
  index = cachedKeyframeIndex(layer.keyframes)
): EvaluatedLayerState {
  const x = evaluateProperty(index, layer, timestamp, "x").value;
  const y = evaluateProperty(index, layer, timestamp, "y").value;
  const rotation = evaluateProperty(index, layer, timestamp, "rotation").value;
  const opacity = evaluateProperty(index, layer, timestamp, "opacity").value;
  const intensity = evaluateProperty(index, layer, timestamp, "intensity").value;
  const scaleTrack = index.tracks.get("scale") ?? [];
  const scale = evaluateTrack(
    scaleTrack,
    timestamp,
    basePropertyValue(layer, "scale")
  ).value;
  const hasEffectiveScale =
    scaleTrack.length > 0 && timestamp >= (scaleTrack[0]?.time ?? Infinity);
  return {
    transform: {
      x,
      y,
      rotation,
      scaleX: hasEffectiveScale ? scale : layer.transform.scaleX,
      scaleY: hasEffectiveScale ? scale : layer.transform.scaleY
    },
    opacity,
    intensity
  };
}

export function upsertKeyframe(
  keyframes: readonly ProjectKeyframe[],
  next: ProjectKeyframe
): ProjectKeyframe[] {
  if (!isAnimatableProperty(next.property)) {
    throw new TypeError(`Proprietà keyframe non supportata: ${next.property}`);
  }
  if (typeof next.value !== "number" || !Number.isFinite(next.value)) {
    throw new TypeError("Il valore del keyframe deve essere un numero finito.");
  }
  if (!Number.isFinite(next.time) || next.time < 0) {
    throw new TypeError("Il tempo del keyframe deve essere finito e non negativo.");
  }
  const withoutCollision = keyframes.filter(
    (keyframe) =>
      keyframe.id !== next.id &&
      !(
        keyframe.property === next.property &&
        Math.abs(keyframe.time - next.time) <= EPSILON
      )
  );
  return canonicalizeKeyframes([
    ...withoutCollision,
    {
      ...next,
      value: clampPropertyValue(next.property, next.value)
    }
  ]);
}

export function removeKeyframe(
  keyframes: readonly ProjectKeyframe[],
  id: string
): ProjectKeyframe[] {
  return canonicalizeKeyframes(keyframes.filter((keyframe) => keyframe.id !== id));
}

export function adjacentKeyframe(
  keyframes: readonly ProjectKeyframe[],
  property: AnimatableProperty,
  timestamp: number,
  direction: -1 | 1
): ProjectKeyframe | null {
  const track = canonicalizeKeyframes(keyframes).filter(
    (keyframe) => keyframe.property === property
  );
  const candidates =
    direction < 0
      ? track.filter((keyframe) => keyframe.time < timestamp - EPSILON).reverse()
      : track.filter((keyframe) => keyframe.time > timestamp + EPSILON);
  return candidates[0] ?? null;
}
