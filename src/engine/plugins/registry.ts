import { audioGridDescriptor } from "./audioGrid";
import { circularSpectrumDescriptor } from "./circularSpectrum";
import { dynamicVignetteDescriptor } from "./dynamicVignette";
import { mirroredWaveformDescriptor } from "./mirroredWaveform";
import { orbitingParticlesDescriptor } from "./orbitingParticles";
import { particleBurstDescriptor } from "./particleBurst";
import { pulseShapesDescriptor } from "./pulseShapes";
import { radialRaysDescriptor } from "./radialRays";
import { spectrumBarsDescriptor } from "./spectrumBars";
import type { PluginDescriptor } from "./types";
import { validatePluginDescriptor } from "./validation";
import { waveformLineDescriptor } from "./waveformLine";

export const PLUGIN_CATALOG_ORDER = [
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
] as const;

export class PluginRegistry {
  private readonly descriptors = new Map<string, PluginDescriptor>();
  private readonly ordered: PluginDescriptor[];

  constructor(descriptors: readonly PluginDescriptor[]) {
    for (const descriptor of descriptors) {
      validatePluginDescriptor(descriptor);
      if (descriptor.id === "projectM") {
        throw new Error("projectM non è un plugin Canvas.");
      }
      if (this.descriptors.has(descriptor.id)) {
        throw new Error(`ID plugin duplicato: ${descriptor.id}`);
      }
      this.descriptors.set(descriptor.id, descriptor);
    }
    this.ordered = [...descriptors];
  }

  get(id: string): PluginDescriptor | undefined {
    return this.descriptors.get(id);
  }

  list(): readonly PluginDescriptor[] {
    return this.ordered;
  }

  get size(): number {
    return this.descriptors.size;
  }
}

export const pluginRegistry = new PluginRegistry([
  spectrumBarsDescriptor,
  circularSpectrumDescriptor,
  waveformLineDescriptor,
  particleBurstDescriptor,
  pulseShapesDescriptor,
  dynamicVignetteDescriptor,
  radialRaysDescriptor,
  mirroredWaveformDescriptor,
  audioGridDescriptor,
  orbitingParticlesDescriptor
]);

if (
  pluginRegistry.size !== PLUGIN_CATALOG_ORDER.length ||
  pluginRegistry
    .list()
    .some((descriptor, index) => descriptor.id !== PLUGIN_CATALOG_ORDER[index])
) {
  throw new Error("Registro plugin Canvas non conforme all'ordine M2.");
}
