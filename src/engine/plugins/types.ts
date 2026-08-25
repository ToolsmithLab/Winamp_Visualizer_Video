import type { AudioSnapshot } from "../../shared/audioAnalysis";
import type {
  AudioBand,
  PluginSettingValue,
  ProjectLayer
} from "../../shared/project";

export type PluginCategory =
  | "spectrum"
  | "waveform"
  | "particles"
  | "geometry"
  | "effect";

export type PluginParameterType = "number" | "boolean" | "color" | "select";

export interface PluginSelectOption {
  value: string;
  label: string;
}

interface PluginParameterBase {
  key: string;
  label: string;
  type: PluginParameterType;
  defaultValue: PluginSettingValue;
  animatable: boolean;
  description: string;
}

export interface PluginNumberParameter extends PluginParameterBase {
  type: "number";
  defaultValue: number;
  minimum: number;
  maximum: number;
  step: number;
}

export interface PluginBooleanParameter extends PluginParameterBase {
  type: "boolean";
  defaultValue: boolean;
}

export interface PluginColorParameter extends PluginParameterBase {
  type: "color";
  defaultValue: string;
}

export interface PluginSelectParameter extends PluginParameterBase {
  type: "select";
  defaultValue: string;
  options: readonly PluginSelectOption[];
}

export type PluginParameterDescriptor =
  | PluginNumberParameter
  | PluginBooleanParameter
  | PluginColorParameter
  | PluginSelectParameter;

export type PluginSettings = Record<string, PluginSettingValue>;

export interface VisualizerRenderContext {
  context: CanvasRenderingContext2D;
  width: number;
  height: number;
  time: number;
  deltaTime: number;
  energy: number;
  /** Common M3 intensity multiplier, independent from plugin IDs. */
  commonIntensity: number;
  audio: AudioSnapshot;
  settings: PluginSettings;
  layer: ProjectLayer;
  seed: number;
}

export interface PluginInitializeContext {
  width: number;
  height: number;
  layerId: string;
  seed: number;
}

export interface PluginInstance {
  initialize(context: PluginInitializeContext): void;
  render(frame: VisualizerRenderContext): void;
  resize(width: number, height: number): void;
  reset(): void;
  serialize(): PluginSettings;
  deserialize(settings: PluginSettings): void;
  dispose(): void;
}

export interface PluginCreateContext {
  layerId: string;
  seed: number;
}

export interface PluginDescriptor {
  readonly id: string;
  readonly displayName: string;
  readonly category: PluginCategory;
  readonly version: string;
  readonly description: string;
  readonly defaultSettings: Readonly<PluginSettings>;
  readonly parameters: readonly PluginParameterDescriptor[];
  readonly legacyReactiveSettings?: boolean;
  create(context: PluginCreateContext): PluginInstance;
}

export interface LegacyVisualizerRenderer {
  readonly id: string;
  render(frame: VisualizerRenderContext): void;
  reset?(): void;
}

export interface PluginRuntimeStatus {
  layerId: string;
  pluginId: string;
  state: "ready" | "error" | "suspended" | "missing";
  consecutiveErrors: number;
  message: string;
}

export interface CommonReactiveSettings {
  band: AudioBand;
  sensitivity: number;
  smoothing: number;
  intensity: number;
  color: string;
}
