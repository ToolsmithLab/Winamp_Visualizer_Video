import {
  migrateProjectDocument,
  type ProjectDocument
} from "../engine/project/migrations";
import { assertProjectDocument } from "../engine/project/validation";

export const PROJECT_VERSION = "6.0";

export type AudioBand = "volume" | "bass" | "mid" | "high";
export type LayerKind =
  | "projectM"
  | "visualizer"
  | "cover"
  | "artistText"
  | "titleText";
export type VisualizerPluginId =
  | "spectrumBars"
  | "circularSpectrum"
  | "waveformLine"
  | "particleBurst"
  | "pulseShapes"
  | "dynamicVignette"
  | "radialRays"
  | "mirroredWaveform"
  | "audioGrid"
  | "orbitingParticles";

export type PluginSettingValue = string | number | boolean | null;

export interface VisualizerPluginReference {
  id: string;
  version: string;
  settings: Record<string, PluginSettingValue>;
  unknownData?: Record<string, unknown>;
}

export interface LayerTransform {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
}

export type KeyframeInterpolation =
  | "linear"
  | "ease-in"
  | "ease-out"
  | "ease-in-out"
  | "hold";

export interface ProjectKeyframe {
  id: string;
  property: string;
  time: number;
  value: PluginSettingValue;
  interpolation: KeyframeInterpolation;
}

export type AssetType =
  | "audio"
  | "clip"
  | "cover"
  | "milkdrop-preset"
  | "texture";
export type AssetStatus =
  | "available"
  | "missing"
  | "hash-mismatch"
  | "inaccessible"
  | "unsupported"
  | "relinked"
  | "ignored";

export interface ProjectAssetReference {
  id: string;
  type: AssetType;
  path: string | null;
  originalPath: string | null;
  relativePath: string | null;
  fileName: string | null;
  size: number | null;
  hash: string | null;
  status: AssetStatus;
  required: boolean;
}

export interface ReactiveSettings {
  band: AudioBand;
  sensitivity: number;
  smoothing: number;
  intensity: number;
  color: string;
}

export interface ProjectLayer {
  id: string;
  name: string;
  kind: LayerKind;
  pluginId?: VisualizerPluginId;
  plugin?: VisualizerPluginReference;
  visible: boolean;
  locked: boolean;
  opacity: number;
  blendMode: GlobalCompositeOperation;
  startTime: number;
  endTime: number | null;
  reactive?: ReactiveSettings;
  transform: LayerTransform;
  keyframes: ProjectKeyframe[];
}

export interface CanvasSettings {
  width: number;
  height: number;
  fps: 30 | 60;
  backgroundColor: string;
  accentColor: string;
}

export type CoverFitMode = "contain" | "fill" | "stretch" | "original";

export interface CoverSettings {
  filePath: string | null;
  fitMode: CoverFitMode;
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
  cornerRadius: number;
}

export interface TextSettings {
  artist: string;
  title: string;
  color: string;
  artistColor: string;
  titleColor: string;
  artistX: number;
  artistY: number;
  artistSize: number;
  titleX: number;
  titleY: number;
  titleSize: number;
}

export interface ExportSettings {
  width: number;
  height: number;
  fps: 30 | 60;
  videoBitrate: string;
  audioBitrate: string;
}

export type AudioSourceMode = "clip" | "external";
export type ClipEndMode = "black" | "loop" | "freeze";

export interface ClipSettings {
  filePath: string | null;
  durationSeconds: number;
  audioDurationSeconds: number;
  hasAudio: boolean;
  width: number;
  height: number;
  frameRate: number;
  container: string;
  videoCodec: string;
  audioCodec: string | null;
  endMode: ClipEndMode;
}

export type PresetPlaybackOrder = "sequential" | "random";
export type PresetAutoMode = "interval" | "timeline-markers" | "music-events";
export type PresetChangeSource =
  | "manual"
  | "automatic"
  | "timeline-marker"
  | "music-event"
  | "restart"
  | "restore";

export interface PresetTimelineMarker {
  id: string;
  time: number;
  label: string;
  source: "timeline" | "music";
  presetId: string | null;
}

export interface PresetHistoryEntry {
  presetId: string;
  at: number;
  source: PresetChangeSource;
}

export interface PresetAutoSwitchSettings {
  enabled: boolean;
  mode: PresetAutoMode;
  order: PresetPlaybackOrder;
  intervalSeconds: number;
  minimumSeconds: number;
  maximumSeconds: number;
  noImmediateRepeat: boolean;
}

export interface PresetTransitionSettings {
  enabled: boolean;
  durationSeconds: number;
}

export interface ProjectMSettings {
  enabled: boolean;
  presetId: string;
  presetPath: string | null;
  presetHash: string;
  presetName: string;
  presetStatus: string;
  presetLicense: string;
  presetLicenseVerified: boolean;
  texturePaths: string[];
  missingTextures: string[];
  favoritePresetIds: string[];
  externalFolders: string[];
  librarySchema: 1;
  previewWidth: number;
  previewHeight: number;
  fps: 30 | 60;
  playlistIds: string[];
  sequenceStartPresetId: string;
  playbackOrder: PresetPlaybackOrder;
  randomSeed: number;
  particleSeed: number;
  manualRandomCounter: number;
  locked: boolean;
  autoSwitch: PresetAutoSwitchSettings;
  transition: PresetTransitionSettings;
  history: PresetHistoryEntry[];
  markers: PresetTimelineMarker[];
}

export interface VisualizerProject {
  version: string;
  name: string;
  audioSource: AudioSourceMode;
  externalAudioFile: string | null;
  externalAudioDurationSeconds: number;
  audioFile: string | null;
  clip: ClipSettings;
  canvas: CanvasSettings;
  cover: CoverSettings;
  text: TextSettings;
  projectM: ProjectMSettings;
  layers: ProjectLayer[];
  assets: ProjectAssetReference[];
  exportSettings: ExportSettings;
  modifiedAt: string;
}

const knownPluginIds = new Set<VisualizerPluginId>([
  "spectrumBars",
  "circularSpectrum",
  "waveformLine",
  "particleBurst",
  "pulseShapes",
  "dynamicVignette",
  "radialRays",
  "mirroredWaveform",
  "audioGrid",
  "orbitingParticles"
]);

const blendModes = new Set<GlobalCompositeOperation>([
  "source-over",
  "screen",
  "lighter",
  "multiply",
  "overlay",
  "lighten",
  "darken"
]);

function finite(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function bounded(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number
): number {
  return Math.min(maximum, Math.max(minimum, finite(value, fallback)));
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function nullableString(value: unknown, fallback: string | null): string | null {
  return value === null || typeof value === "string" ? value : fallback;
}

function record(value: unknown): ProjectDocument {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as ProjectDocument)
    : {};
}

function stringArray(value: unknown, fallback: string[] = []): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [...fallback];
}

function defaultTransform(
  kind: LayerKind,
  cover: CoverSettings,
  text: TextSettings
): LayerTransform {
  if (kind === "cover") {
    return { x: cover.x, y: cover.y, scaleX: 1, scaleY: 1, rotation: 0 };
  }
  if (kind === "artistText") {
    return {
      x: text.artistX,
      y: text.artistY,
      scaleX: 1,
      scaleY: 1,
      rotation: 0
    };
  }
  if (kind === "titleText") {
    return {
      x: text.titleX,
      y: text.titleY,
      scaleX: 1,
      scaleY: 1,
      rotation: 0
    };
  }
  return { x: 0.5, y: 0.5, scaleX: 1, scaleY: 1, rotation: 0 };
}

function pluginSettings(reactive: ReactiveSettings): Record<string, PluginSettingValue> {
  return {
    band: reactive.band,
    sensitivity: reactive.sensitivity,
    smoothing: reactive.smoothing,
    intensity: reactive.intensity,
    color: reactive.color
  };
}

export function createDefaultLayers(
  cover: CoverSettings = defaultCover(),
  text: TextSettings = defaultText()
): ProjectLayer[] {
  const visualizer = (
    id: VisualizerPluginId,
    name: string,
    visible: boolean,
    band: AudioBand,
    intensity = 1
  ): ProjectLayer => {
    const reactive: ReactiveSettings = {
      band,
      sensitivity: 1,
      smoothing: 0.72,
      intensity,
      color: "#8b5cf6"
    };
    return {
      id: `visualizer-${id}`,
      name,
      kind: "visualizer",
      pluginId: id,
      plugin: { id, version: "1.0.0", settings: pluginSettings(reactive) },
      visible,
      locked: false,
      opacity: 1,
      blendMode: id === "dynamicVignette" ? "multiply" : "screen",
      startTime: 0,
      endTime: null,
      reactive,
      transform: defaultTransform("visualizer", cover, text),
      keyframes: []
    };
  };

  const layer = (
    id: string,
    name: string,
    kind: LayerKind,
    opacity = 1
  ): ProjectLayer => ({
    id,
    name,
    kind,
    visible: true,
    locked: false,
    opacity,
    blendMode: "source-over",
    startTime: 0,
    endTime: null,
    transform: defaultTransform(kind, cover, text),
    keyframes: []
  });

  return [
    layer("projectm", "projectM · MilkDrop", "projectM"),
    visualizer("spectrumBars", "Spectrum Bars", true, "volume"),
    visualizer("circularSpectrum", "Circular Spectrum", false, "bass"),
    visualizer("waveformLine", "Waveform Line", false, "mid"),
    visualizer("particleBurst", "Particle Burst", false, "bass"),
    visualizer("pulseShapes", "Pulse Shapes", false, "bass"),
    layer("cover", "Cover", "cover"),
    layer("artist-text", "Testo artista", "artistText", 0.72),
    layer("title-text", "Testo titolo", "titleText"),
    visualizer("dynamicVignette", "Vignetta dinamica", true, "bass", 0.55)
  ];
}

function defaultCover(): CoverSettings {
  return {
    filePath: null,
    fitMode: "contain",
    x: 0.5,
    y: 0.35,
    width: 0.62,
    height: 0.35,
    opacity: 1,
    cornerRadius: 0.04
  };
}

function defaultText(): TextSettings {
  return {
    artist: "ARTISTA",
    title: "Titolo del brano",
    color: "#ffffff",
    artistColor: "#ffffff",
    titleColor: "#ffffff",
    artistX: 0.5,
    artistY: 0.57,
    artistSize: 0.032,
    titleX: 0.5,
    titleY: 0.625,
    titleSize: 0.062
  };
}

export function createDefaultProject(): VisualizerProject {
  const cover = defaultCover();
  const text = defaultText();
  return {
    version: PROJECT_VERSION,
    name: "Progetto senza titolo",
    audioSource: "external",
    externalAudioFile: null,
    externalAudioDurationSeconds: 0,
    audioFile: null,
    clip: {
      filePath: null,
      durationSeconds: 0,
      audioDurationSeconds: 0,
      hasAudio: false,
      width: 0,
      height: 0,
      frameRate: 0,
      container: "",
      videoCodec: "",
      audioCodec: null,
      endMode: "freeze"
    },
    canvas: {
      width: 1080,
      height: 1920,
      fps: 30,
      backgroundColor: "#080b12",
      accentColor: "#8b5cf6"
    },
    cover,
    text,
    projectM: {
      enabled: true,
      presetId: "bundled-audio-wave",
      presetPath: null,
      presetHash: "",
      presetName: "AVS Audio Wave",
      presetStatus: "valid",
      presetLicense: "LGPL-2.1-or-later",
      presetLicenseVerified: true,
      texturePaths: [],
      missingTextures: [],
      favoritePresetIds: [],
      externalFolders: [],
      librarySchema: 1,
      previewWidth: 540,
      previewHeight: 960,
      fps: 30,
      playlistIds: ["bundled-audio-wave"],
      sequenceStartPresetId: "bundled-audio-wave",
      playbackOrder: "sequential",
      randomSeed: 1597463007,
      particleSeed: 305419896,
      manualRandomCounter: 0,
      locked: false,
      autoSwitch: {
        enabled: false,
        mode: "interval",
        order: "sequential",
        intervalSeconds: 30,
        minimumSeconds: 10,
        maximumSeconds: 120,
        noImmediateRepeat: true
      },
      transition: { enabled: true, durationSeconds: 2 },
      history: [],
      markers: []
    },
    layers: createDefaultLayers(cover, text),
    assets: [],
    exportSettings: {
      width: 1080,
      height: 1920,
      fps: 30,
      videoBitrate: "16M",
      audioBitrate: "320k"
    },
    modifiedAt: new Date().toISOString()
  };
}

function normalizeReactive(
  value: unknown,
  fallback: ReactiveSettings
): ReactiveSettings {
  const source = record(value);
  const band: AudioBand =
    source.band === "bass" || source.band === "mid" || source.band === "high"
      ? source.band
      : "volume";
  return {
    band,
    sensitivity: bounded(source.sensitivity, fallback.sensitivity, 0.1, 3),
    smoothing: bounded(source.smoothing, fallback.smoothing, 0, 0.98),
    intensity: bounded(source.intensity, fallback.intensity, 0.1, 2.5),
    color: stringValue(source.color, fallback.color)
  };
}

function normalizeTransform(
  value: unknown,
  fallback: LayerTransform
): LayerTransform {
  const source = record(value);
  return {
    x: finite(source.x, fallback.x),
    y: finite(source.y, fallback.y),
    scaleX: finite(source.scaleX, fallback.scaleX),
    scaleY: finite(source.scaleY, fallback.scaleY),
    rotation: finite(source.rotation, fallback.rotation)
  };
}

function normalizeKeyframes(value: unknown): ProjectKeyframe[] {
  if (!Array.isArray(value)) return [];
  const supportedProperties = new Set([
    "x",
    "y",
    "scale",
    "rotation",
    "opacity",
    "intensity"
  ]);
  const normalized = value
    .filter((item) => item && typeof item === "object" && !Array.isArray(item))
    .flatMap((item, index): ProjectKeyframe[] => {
      const source = item as ProjectDocument;
      const property = stringValue(source.property, "");
      if (
        !supportedProperties.has(property) ||
        typeof source.value !== "number" ||
        !Number.isFinite(source.value) ||
        typeof source.time !== "number" ||
        !Number.isFinite(source.time) ||
        source.time < 0
      ) return [];
      const interpolation: KeyframeInterpolation =
        source.interpolation === "ease-in" ||
        source.interpolation === "ease-out" ||
        source.interpolation === "ease-in-out" ||
        source.interpolation === "hold"
          ? source.interpolation
          : "linear";
      const bounds =
        property === "opacity"
          ? [0, 1]
          : property === "scale"
            ? [0.01, 20]
            : property === "intensity"
              ? [0, 10]
              : property === "rotation"
                ? [-36000, 36000]
                : [-100, 100];
      return [{
        id: stringValue(source.id, `keyframe-${index}`),
        property,
        time: source.time,
        value: Math.min(bounds[1]!, Math.max(bounds[0]!, source.value)),
        interpolation
      }];
    })
    .sort((left, right) => left.time - right.time || left.id.localeCompare(right.id));
  const collisions = new Map<string, ProjectKeyframe>();
  for (const keyframe of normalized) {
    collisions.set(`${keyframe.property}\u0000${keyframe.time}`, keyframe);
  }
  return [...collisions.values()].sort(
    (left, right) => left.time - right.time || left.id.localeCompare(right.id)
  );
}

function normalizePlugin(
  value: unknown,
  pluginId: VisualizerPluginId | undefined,
  reactive: ReactiveSettings | undefined
): VisualizerPluginReference | undefined {
  const source = record(value);
  const id = stringValue(source.id, pluginId ?? "");
  if (!id && !pluginId) return undefined;
  const rawSettings = record(source.settings);
  const settings: Record<string, PluginSettingValue> = {};
  for (const [key, setting] of Object.entries(rawSettings)) {
    if (
      setting === null ||
      typeof setting === "string" ||
      typeof setting === "boolean" ||
      (typeof setting === "number" && Number.isFinite(setting))
    ) {
      settings[key] = setting;
    }
  }
  if (!Object.keys(settings).length && reactive) {
    Object.assign(settings, pluginSettings(reactive));
  }
  const unknownData = record(source.unknownData);
  return {
    id: id || (pluginId as string),
    version: stringValue(source.version, "1.0.0"),
    settings,
    ...(Object.keys(unknownData).length
      ? { unknownData: structuredClone(unknownData) }
      : {})
  };
}

function normalizeAsset(value: unknown, index: number): ProjectAssetReference | null {
  const source = record(value);
  const type = source.type;
  if (
    type !== "audio" &&
    type !== "clip" &&
    type !== "cover" &&
    type !== "milkdrop-preset" &&
    type !== "texture"
  ) {
    return null;
  }
  return {
    id: stringValue(source.id, `asset-${index}`),
    type,
    path: nullableString(source.path, null),
    originalPath: nullableString(
      source.originalPath,
      nullableString(source.path, null)
    ),
    relativePath: nullableString(source.relativePath, null),
    fileName: nullableString(source.fileName, null),
    size:
      typeof source.size === "number" &&
      Number.isSafeInteger(source.size) &&
      source.size >= 0
        ? source.size
        : null,
    hash: nullableString(source.hash, null),
    status:
      source.status === "missing" ||
      source.status === "hash-mismatch" ||
      source.status === "inaccessible" ||
      source.status === "unsupported" ||
      source.status === "relinked" ||
      source.status === "ignored"
        ? source.status
        : "available",
    required: source.required === true
  };
}

function normalizedProject(value: ProjectDocument): VisualizerProject {
  const fallback = createDefaultProject();
  fallback.modifiedAt = "1970-01-01T00:00:00.000Z";
  const canvas = record(value.canvas);
  const coverValue = record(value.cover);
  const textValue = record(value.text);
  const cover: CoverSettings = {
    filePath: nullableString(coverValue.filePath, fallback.cover.filePath),
    fitMode:
      coverValue.fitMode === "fill" ||
      coverValue.fitMode === "stretch" ||
      coverValue.fitMode === "original"
        ? coverValue.fitMode
        : "contain",
    x: finite(coverValue.x, fallback.cover.x),
    y: finite(coverValue.y, fallback.cover.y),
    width: finite(coverValue.width, fallback.cover.width),
    height: finite(coverValue.height, fallback.cover.height),
    opacity: bounded(coverValue.opacity, fallback.cover.opacity, 0, 1),
    cornerRadius: Math.max(0, finite(coverValue.cornerRadius, fallback.cover.cornerRadius))
  };
  const text: TextSettings = {
    artist: stringValue(textValue.artist, fallback.text.artist),
    title: stringValue(textValue.title, fallback.text.title),
    color: stringValue(textValue.color, fallback.text.color),
    artistColor: stringValue(
      textValue.artistColor,
      stringValue(textValue.color, fallback.text.artistColor)
    ),
    titleColor: stringValue(
      textValue.titleColor,
      stringValue(textValue.color, fallback.text.titleColor)
    ),
    artistX: finite(textValue.artistX, fallback.text.artistX),
    artistY: finite(textValue.artistY, fallback.text.artistY),
    artistSize: finite(textValue.artistSize, fallback.text.artistSize),
    titleX: finite(textValue.titleX, fallback.text.titleX),
    titleY: finite(textValue.titleY, fallback.text.titleY),
    titleSize: finite(textValue.titleSize, fallback.text.titleSize)
  };
  const layerFallbacks = createDefaultLayers(cover, text);
  const sourceLayers = Array.isArray(value.layers) ? value.layers : layerFallbacks;
  const layers = sourceLayers
    .filter((item) => item && typeof item === "object" && !Array.isArray(item))
    .map((item, index): ProjectLayer => {
      const source = item as ProjectDocument;
      const matching =
        layerFallbacks.find((candidate) => candidate.id === source.id) ??
        layerFallbacks[Math.min(index, layerFallbacks.length - 1)] ??
        layerFallbacks[0]!;
      const kind: LayerKind =
        source.kind === "projectM" ||
        source.kind === "visualizer" ||
        source.kind === "cover" ||
        source.kind === "artistText" ||
        source.kind === "titleText"
          ? source.kind
          : matching.kind;
      const rawPluginId =
        typeof source.pluginId === "string" && knownPluginIds.has(source.pluginId as VisualizerPluginId)
          ? (source.pluginId as VisualizerPluginId)
          : undefined;
      const fallbackReactive =
        matching.reactive ?? {
          band: "volume" as const,
          sensitivity: 1,
          smoothing: 0.72,
          intensity: 1,
          color: fallback.canvas.accentColor
        };
      const reactive =
        kind === "visualizer" || kind === "projectM"
          ? normalizeReactive(source.reactive, fallbackReactive)
          : undefined;
      const transformFallback = defaultTransform(kind, cover, text);
      const blendMode = blendModes.has(source.blendMode as GlobalCompositeOperation)
        ? (source.blendMode as GlobalCompositeOperation)
        : matching.blendMode;
      return {
        id: stringValue(source.id, matching.id),
        name: stringValue(source.name, matching.name),
        kind,
        ...(rawPluginId ? { pluginId: rawPluginId } : {}),
        ...(kind === "visualizer"
          ? { plugin: normalizePlugin(source.plugin, rawPluginId, reactive) }
          : {}),
        visible: source.visible !== false,
        locked: source.locked === true,
        opacity: bounded(source.opacity, matching.opacity, 0, 1),
        blendMode,
        startTime: Math.max(0, finite(source.startTime, 0)),
        endTime:
          source.endTime === null
            ? null
            : Math.max(0, finite(source.endTime, 0)),
        ...(reactive ? { reactive } : {}),
        transform: normalizeTransform(source.transform, transformFallback),
        keyframes: normalizeKeyframes(source.keyframes)
      };
    });
  if (!layers.some((layer) => layer.kind === "projectM")) {
    layers.unshift(structuredClone(layerFallbacks[0]!));
  }

  const projectMValue = record(value.projectM);
  const autoValue = record(projectMValue.autoSwitch);
  const transitionValue = record(projectMValue.transition);
  const exportValue = record(value.exportSettings);
  const markers = Array.isArray(projectMValue.markers)
    ? projectMValue.markers
        .filter((item) => item && typeof item === "object" && !Array.isArray(item))
        .map((item, index): PresetTimelineMarker => {
          const marker = item as ProjectDocument;
          return {
            id: stringValue(marker.id, `marker-${index}`),
            time: Math.max(0, finite(marker.time, 0)),
            label: stringValue(marker.label, ""),
            source: marker.source === "music" ? "music" : "timeline",
            presetId: nullableString(marker.presetId, null)
          };
        })
        .sort((left, right) => left.time - right.time)
    : [];
  const history = Array.isArray(projectMValue.history)
    ? projectMValue.history
        .filter((item) => item && typeof item === "object" && !Array.isArray(item))
        .map((item): PresetHistoryEntry => {
          const entry = item as ProjectDocument;
          const source = entry.source;
          const normalizedSource: PresetChangeSource =
            source === "automatic" ||
            source === "timeline-marker" ||
            source === "music-event" ||
            source === "restart" ||
            source === "restore"
              ? source
              : "manual";
          return {
            presetId: stringValue(entry.presetId, ""),
            at: Math.max(0, finite(entry.at, 0)),
            source: normalizedSource
          };
        })
        .slice(-500)
    : [];

  const legacyAudioFile = nullableString(value.audioFile, null);
  const explicitExternalAudioFile = nullableString(
    value.externalAudioFile,
    legacyAudioFile
  );
  const externalAudioFile =
    explicitExternalAudioFile ??
    (value.audioSource === "clip" ? null : legacyAudioFile);
  const externalAudioDurationSeconds = Math.max(
    0,
    finite(value.externalAudioDurationSeconds, 0)
  );
  const clipValue = record(value.clip);
  const clip: ClipSettings = {
    filePath: nullableString(clipValue.filePath, null),
    durationSeconds: Math.max(0, finite(clipValue.durationSeconds, 0)),
    audioDurationSeconds: Math.max(
      0,
      finite(
        clipValue.audioDurationSeconds,
        finite(clipValue.durationSeconds, 0)
      )
    ),
    hasAudio: clipValue.hasAudio === true,
    width: Math.max(0, Math.round(finite(clipValue.width, 0))),
    height: Math.max(0, Math.round(finite(clipValue.height, 0))),
    frameRate: Math.max(0, finite(clipValue.frameRate, 0)),
    container: stringValue(clipValue.container, ""),
    videoCodec: stringValue(clipValue.videoCodec, ""),
    audioCodec: nullableString(clipValue.audioCodec, null),
    endMode:
      clipValue.endMode === "loop"
        ? clipValue.endMode
        : clipValue.endMode === "black" || clipValue.endMode === "trim"
          ? "black"
          : "freeze"
  };
  const requestedAudioSource: AudioSourceMode =
    value.audioSource === "clip" ? "clip" : "external";
  const audioSource: AudioSourceMode =
    requestedAudioSource === "clip" && clip.filePath && clip.hasAudio
      ? "clip"
      : "external";
  const audioFile =
    audioSource === "clip" ? clip.filePath : externalAudioFile;

  return {
    version: PROJECT_VERSION,
    name: stringValue(value.name, fallback.name),
    audioSource,
    externalAudioFile,
    externalAudioDurationSeconds,
    audioFile,
    clip,
    canvas: {
      width: Math.max(1, Math.round(finite(canvas.width, fallback.canvas.width))),
      height: Math.max(1, Math.round(finite(canvas.height, fallback.canvas.height))),
      fps: canvas.fps === 60 ? 60 : 30,
      backgroundColor: stringValue(canvas.backgroundColor, fallback.canvas.backgroundColor),
      accentColor: stringValue(canvas.accentColor, fallback.canvas.accentColor)
    },
    cover,
    text,
    projectM: {
      ...fallback.projectM,
      enabled: projectMValue.enabled !== false,
      presetId: stringValue(projectMValue.presetId, fallback.projectM.presetId),
      presetPath: nullableString(projectMValue.presetPath, fallback.projectM.presetPath),
      presetHash: stringValue(projectMValue.presetHash, ""),
      presetName: stringValue(projectMValue.presetName, fallback.projectM.presetName),
      presetStatus: stringValue(projectMValue.presetStatus, fallback.projectM.presetStatus),
      presetLicense: stringValue(projectMValue.presetLicense, fallback.projectM.presetLicense),
      presetLicenseVerified: projectMValue.presetLicenseVerified === true,
      texturePaths: stringArray(projectMValue.texturePaths),
      missingTextures: stringArray(projectMValue.missingTextures),
      favoritePresetIds: stringArray(projectMValue.favoritePresetIds),
      externalFolders: stringArray(projectMValue.externalFolders),
      librarySchema: 1,
      previewWidth: Math.max(1, Math.round(finite(projectMValue.previewWidth, 540))),
      previewHeight: Math.max(1, Math.round(finite(projectMValue.previewHeight, 960))),
      fps: projectMValue.fps === 60 ? 60 : 30,
      playlistIds: [
        ...new Set(
          stringArray(projectMValue.playlistIds, fallback.projectM.playlistIds).filter(Boolean)
        )
      ],
      sequenceStartPresetId: stringValue(
        projectMValue.sequenceStartPresetId,
        stringValue(projectMValue.presetId, fallback.projectM.sequenceStartPresetId)
      ),
      playbackOrder: projectMValue.playbackOrder === "random" ? "random" : "sequential",
      randomSeed: Math.max(0, Math.floor(finite(projectMValue.randomSeed, fallback.projectM.randomSeed))) >>> 0,
      particleSeed: Math.max(0, Math.floor(finite(projectMValue.particleSeed, fallback.projectM.particleSeed))) >>> 0,
      manualRandomCounter: Math.max(0, Math.floor(finite(projectMValue.manualRandomCounter, 0))),
      locked: projectMValue.locked === true,
      autoSwitch: {
        enabled: autoValue.enabled === true,
        mode:
          autoValue.mode === "timeline-markers" || autoValue.mode === "music-events"
            ? autoValue.mode
            : "interval",
        order: autoValue.order === "random" ? "random" : "sequential",
        intervalSeconds: bounded(autoValue.intervalSeconds, 30, 1, 3600),
        minimumSeconds: bounded(autoValue.minimumSeconds, 10, 1, 3600),
        maximumSeconds: bounded(autoValue.maximumSeconds, 120, 1, 3600),
        noImmediateRepeat: autoValue.noImmediateRepeat !== false
      },
      transition: {
        enabled: transitionValue.enabled !== false,
        durationSeconds: bounded(transitionValue.durationSeconds, 2, 0, 30)
      },
      history,
      markers
    },
    layers,
    assets: Array.isArray(value.assets)
      ? value.assets
          .map(normalizeAsset)
          .filter((asset): asset is ProjectAssetReference => Boolean(asset))
      : [],
    exportSettings: {
      width: Math.max(1, Math.round(finite(exportValue.width, 1080))),
      height: Math.max(1, Math.round(finite(exportValue.height, 1920))),
      fps: exportValue.fps === 60 ? 60 : 30,
      videoBitrate: stringValue(exportValue.videoBitrate, "16M"),
      audioBitrate: stringValue(exportValue.audioBitrate, "320k")
    },
    modifiedAt: stringValue(value.modifiedAt, fallback.modifiedAt)
  };
}

export function normalizeProject(value: unknown): VisualizerProject {
  assertProjectDocument(value);
  const migrated = migrateProjectDocument(value);
  assertProjectDocument(migrated);
  return normalizedProject(migrated);
}

export function selectedAudioFile(
  project: Pick<
    VisualizerProject,
    | "audioSource"
    | "audioFile"
    | "externalAudioFile"
    | "externalAudioDurationSeconds"
    | "clip"
  >
): string | null {
  return project.audioSource === "clip" && project.clip.hasAudio
    ? project.clip.filePath
    : project.externalAudioFile ?? project.audioFile;
}

export function synchronizeSelectedAudio(
  project: VisualizerProject
): string | null {
  if (
    project.audioSource === "clip" &&
    (!project.clip.filePath || !project.clip.hasAudio)
  ) {
    project.audioSource = "external";
    project.audioFile = project.externalAudioFile;
  }
  const selected = selectedAudioFile(project);
  project.audioFile = selected;
  return selected;
}

export function serializeProject(project: VisualizerProject): string {
  const normalized = normalizeProject(project);
  assertProjectDocument(normalized as unknown);
  return JSON.stringify(normalized, null, 2);
}

export function resolveLayerTransform(
  project: VisualizerProject,
  layer: ProjectLayer
): LayerTransform {
  const fallback = defaultTransform(layer.kind, project.cover, project.text);
  return normalizeTransform(layer.transform, fallback);
}
