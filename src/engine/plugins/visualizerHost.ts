import type { AudioSnapshot } from "../../shared/audioAnalysis";
import type {
  AudioBand,
  ProjectLayer,
  ReactiveSettings
} from "../../shared/project";
import { PluginRegistry, pluginRegistry } from "./registry";
import type {
  PluginDescriptor,
  PluginInstance,
  PluginRuntimeStatus,
  PluginSettings
} from "./types";
import { normalizePluginSettings } from "./validation";

export const PLUGIN_ERROR_SUSPEND_THRESHOLD = 3;

interface RuntimeEntry {
  descriptor: PluginDescriptor;
  instance: PluginInstance;
  initialized: boolean;
  width: number;
  height: number;
  settingsSignature: string;
  status: PluginRuntimeStatus;
  seed: number;
}

export class VisualizerHost {
  private smoothedEnergy = new Map<string, number>();
  private previousTimes = new Map<string, number>();
  private entries = new Map<string, RuntimeEntry>();
  private particleSeed = 0x12345678;

  constructor(
    private readonly registry: PluginRegistry = pluginRegistry,
    private readonly onStatusChange?: (status: PluginRuntimeStatus) => void
  ) {}

  setParticleSeed(seed: number): void {
    const normalized = seed >>> 0;
    if (normalized === this.particleSeed) return;
    this.particleSeed = normalized;
    this.reset();
  }

  reconcile(layers: readonly ProjectLayer[]): void {
    const retained = new Set(
      layers
        .filter((layer) => layer.kind === "visualizer")
        .map((layer) => layer.id)
    );
    for (const layerId of this.entries.keys()) {
      if (!retained.has(layerId)) this.disposeLayer(layerId);
    }
  }

  render(
    context: CanvasRenderingContext2D,
    width: number,
    height: number,
    layer: ProjectLayer,
    audio: AudioSnapshot,
    time: number,
    frameRate = 60
  ): void {
    const pluginId = layer.plugin?.id || layer.pluginId;
    if (!pluginId) return;
    const descriptor = this.registry.get(pluginId);
    if (!descriptor) {
      this.report({
        layerId: layer.id,
        pluginId,
        state: "missing",
        consecutiveErrors: 0,
        message: `Plugin Canvas non disponibile: ${pluginId}`
      });
      return;
    }
    const entry = this.entryFor(layer, descriptor);
    if (entry.status.state === "suspended") return;
    const rawSettings = {
      ...(layer.plugin?.settings ?? {}),
      ...(descriptor.legacyReactiveSettings
        ? (layer.reactive ?? {})
        : {})
    };
    const settings = normalizePluginSettings(descriptor, rawSettings);
    const signature = JSON.stringify(settings);

    if (!entry.initialized) {
      if (
        !this.guard(entry, "initialize", () =>
          entry.instance.initialize({
            width,
            height,
            layerId: layer.id,
            seed: entry.seed
          })
        )
      ) return;
      entry.initialized = true;
      entry.width = width;
      entry.height = height;
    }
    if (entry.width !== width || entry.height !== height) {
      if (!this.guard(entry, "resize", () => entry.instance.resize(width, height))) {
        return;
      }
      entry.width = width;
      entry.height = height;
    }
    if (entry.settingsSignature !== signature) {
      if (
        !this.guard(entry, "deserialize", () =>
          entry.instance.deserialize(settings)
        )
      ) return;
      entry.settingsSignature = signature;
    }

    const recordedTime = this.previousTimes.get(layer.id);
    const previousTime = recordedTime ?? time - 1 / Math.max(1, frameRate);
    const deltaTime = Math.max(0, time - previousTime);
    this.previousTimes.set(layer.id, time);
    const energy =
      recordedTime !== undefined && Math.abs(recordedTime - time) < 0.000_001
        ? this.smoothedEnergy.get(layer.id) ?? 0
        : this.energyFor(layer.id, settings, audio);
    const commonIntensity = Math.max(
      0,
      Math.min(10, layer.reactive?.intensity ?? 1)
    );
    const renderAudio =
      descriptor.legacyReactiveSettings || commonIntensity === 1
        ? audio
        : this.intensifiedAudio(audio, commonIntensity);

    context.save();
    try {
      if (
        !this.guard(entry, "render", () =>
          entry.instance.render({
            context,
            width,
            height,
            time,
            deltaTime,
            energy: descriptor.legacyReactiveSettings
              ? energy
              : Math.min(1, energy * commonIntensity),
            commonIntensity,
            audio: renderAudio,
            settings,
            layer,
            seed: entry.seed
          })
        )
      ) return;
      if (entry.status.consecutiveErrors) {
        entry.status = {
          ...entry.status,
          state: "ready",
          consecutiveErrors: 0,
          message: ""
        };
        this.report(entry.status);
      }
    } finally {
      context.restore();
    }
  }

  resetLayer(layerId: string): void {
    this.disposeLayer(layerId);
    this.smoothedEnergy.delete(layerId);
    this.previousTimes.delete(layerId);
  }

  reset(): void {
    for (const layerId of [...this.entries.keys()]) this.disposeLayer(layerId);
    this.smoothedEnergy.clear();
    this.previousTimes.clear();
  }

  dispose(): void {
    this.reset();
  }

  statuses(): PluginRuntimeStatus[] {
    return [...this.entries.values()].map((entry) => ({ ...entry.status }));
  }

  status(layerId: string): PluginRuntimeStatus | null {
    const entry = this.entries.get(layerId);
    return entry ? { ...entry.status } : null;
  }

  serializeLayer(layerId: string): PluginSettings | null {
    const entry = this.entries.get(layerId);
    if (!entry) return null;
    try {
      return entry.instance.serialize();
    } catch (error) {
      this.report({
        ...entry.status,
        state: "error",
        message:
          `${entry.descriptor.displayName}: errore serialize: ` +
          (error instanceof Error ? error.message : String(error))
      });
      return null;
    }
  }

  private entryFor(
    layer: ProjectLayer,
    descriptor: PluginDescriptor
  ): RuntimeEntry {
    const current = this.entries.get(layer.id);
    if (current?.descriptor.id === descriptor.id) return current;
    if (current) this.disposeLayer(layer.id);
    const seed = this.derivedSeed(layer.id);
    const entry: RuntimeEntry = {
      descriptor,
      instance: descriptor.create({ layerId: layer.id, seed }),
      initialized: false,
      width: 0,
      height: 0,
      settingsSignature: "",
      seed,
      status: {
        layerId: layer.id,
        pluginId: descriptor.id,
        state: "ready",
        consecutiveErrors: 0,
        message: ""
      }
    };
    this.entries.set(layer.id, entry);
    this.report(entry.status);
    return entry;
  }

  private guard(
    entry: RuntimeEntry,
    operation: string,
    callback: () => void
  ): boolean {
    try {
      callback();
      return true;
    } catch (error) {
      const consecutiveErrors = entry.status.consecutiveErrors + 1;
      const suspended =
        consecutiveErrors >= PLUGIN_ERROR_SUSPEND_THRESHOLD;
      entry.status = {
        ...entry.status,
        state: suspended ? "suspended" : "error",
        consecutiveErrors,
        message:
          `${entry.descriptor.displayName}: errore ${operation}: ` +
          (error instanceof Error ? error.message : String(error))
      };
      this.report(entry.status);
      return false;
    }
  }

  private disposeLayer(layerId: string): void {
    const entry = this.entries.get(layerId);
    if (!entry) return;
    try {
      entry.instance.reset();
    } catch (error) {
      this.report({
        ...entry.status,
        state: "error",
        message:
          `${entry.descriptor.displayName}: errore reset: ` +
          (error instanceof Error ? error.message : String(error))
      });
    }
    try {
      entry.instance.dispose();
    } catch (error) {
      this.report({
        ...entry.status,
        state: "error",
        message:
          `${entry.descriptor.displayName}: errore dispose: ` +
          (error instanceof Error ? error.message : String(error))
      });
    } finally {
      this.entries.delete(layerId);
    }
  }

  private report(status: PluginRuntimeStatus): void {
    this.onStatusChange?.({ ...status });
  }

  private derivedSeed(layerId: string): number {
    const layerSalt = [...layerId].reduce(
      (value, character) =>
        (Math.imul(value, 31) + character.charCodeAt(0)) >>> 0,
      0
    );
    return (this.particleSeed ^ layerSalt) >>> 0;
  }

  private energyFor(
    layerId: string,
    settings: PluginSettings,
    audio: AudioSnapshot
  ): number {
    const band =
      settings.band === "bass" ||
      settings.band === "mid" ||
      settings.band === "high" ||
      settings.band === "volume"
        ? (settings.band as AudioBand)
        : "volume";
    const sensitivity =
      typeof settings.sensitivity === "number" ? settings.sensitivity : 1;
    const smoothingValue =
      typeof settings.smoothing === "number" ? settings.smoothing : 0.72;
    const raw = this.bandValue(audio, band) * sensitivity;
    const previous = this.smoothedEnergy.get(layerId) ?? 0;
    const smoothing = Math.max(0, Math.min(0.98, smoothingValue));
    const value = previous * smoothing + Math.min(1, raw) * (1 - smoothing);
    this.smoothedEnergy.set(layerId, value);
    return value;
  }

  private bandValue(audio: AudioSnapshot, band: AudioBand): number {
    if (band === "bass") return audio.bass;
    if (band === "mid") return audio.mid;
    if (band === "high") return audio.high;
    return audio.volume;
  }

  private intensifiedAudio(
    audio: AudioSnapshot,
    intensity: number
  ): AudioSnapshot {
    const scaleByte = (value: number, midpoint = 0) =>
      Math.max(0, Math.min(255, Math.round(midpoint + (value - midpoint) * intensity)));
    return {
      volume: Math.min(1, audio.volume * intensity),
      bass: Math.min(1, audio.bass * intensity),
      mid: Math.min(1, audio.mid * intensity),
      high: Math.min(1, audio.high * intensity),
      spectrum: Uint8Array.from(audio.spectrum, (value) => scaleByte(value)),
      waveform: Uint8Array.from(audio.waveform, (value) =>
        scaleByte(value, 128)
      )
    };
  }
}
