import type {
  LegacyVisualizerRenderer,
  PluginDescriptor,
  PluginInstance,
  PluginParameterDescriptor,
  PluginSettings
} from "./types";

export const bandParameter: PluginParameterDescriptor = {
  key: "band",
  label: "Banda",
  type: "select",
  defaultValue: "volume",
  options: [
    { value: "volume", label: "Volume generale" },
    { value: "bass", label: "Bassi" },
    { value: "mid", label: "Medi" },
    { value: "high", label: "Alti" }
  ],
  animatable: true,
  description: "Banda usata per la risposta principale."
};

export const sensitivityParameter: PluginParameterDescriptor = {
  key: "sensitivity",
  label: "Sensibilità",
  type: "number",
  defaultValue: 1,
  minimum: 0.1,
  maximum: 3,
  step: 0.05,
  animatable: true,
  description: "Amplifica la risposta all'audio."
};

export const smoothingParameter: PluginParameterDescriptor = {
  key: "smoothing",
  label: "Smoothing",
  type: "number",
  defaultValue: 0.72,
  minimum: 0,
  maximum: 0.98,
  step: 0.01,
  animatable: true,
  description: "Smussa le variazioni fra frame."
};

export const intensityParameter: PluginParameterDescriptor = {
  key: "intensity",
  label: "Intensità",
  type: "number",
  defaultValue: 1,
  minimum: 0.1,
  maximum: 2.5,
  step: 0.05,
  animatable: true,
  description: "Scala l'ampiezza visiva."
};

export const colorParameter: PluginParameterDescriptor = {
  key: "color",
  label: "Colore",
  type: "color",
  defaultValue: "#8b5cf6",
  animatable: true,
  description: "Colore principale del visualizzatore."
};

export const commonReactiveParameters = [
  bandParameter,
  sensitivityParameter,
  smoothingParameter,
  intensityParameter,
  colorParameter
] as const;

export const commonReactiveDefaults: PluginSettings = {
  band: "volume",
  sensitivity: 1,
  smoothing: 0.72,
  intensity: 1,
  color: "#8b5cf6"
};

export function reactiveParameters(
  overrides: Partial<{
    band: string;
    sensitivity: number;
    smoothing: number;
    intensity: number;
    color: string;
  }> = {}
): PluginParameterDescriptor[] {
  return commonReactiveParameters.map((parameter) => {
    const override = overrides[parameter.key as keyof typeof overrides];
    return override === undefined
      ? { ...parameter }
      : ({ ...parameter, defaultValue: override } as PluginParameterDescriptor);
  });
}

export function numberSetting(
  settings: PluginSettings,
  key: string,
  fallback: number
): number {
  const value = settings[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function stringSetting(
  settings: PluginSettings,
  key: string,
  fallback: string
): string {
  return typeof settings[key] === "string" ? settings[key] : fallback;
}

export function booleanSetting(
  settings: PluginSettings,
  key: string,
  fallback: boolean
): boolean {
  return typeof settings[key] === "boolean" ? settings[key] : fallback;
}

export function createRendererInstance(
  renderer: LegacyVisualizerRenderer,
  initialSettings: PluginSettings,
  seed: number
): PluginInstance {
  let settings = structuredClone(initialSettings);
  return {
    initialize() {},
    render(frame) {
      renderer.render({ ...frame, settings, seed });
    },
    resize() {},
    reset() {
      renderer.reset?.();
    },
    serialize() {
      return structuredClone(settings);
    },
    deserialize(next) {
      settings = structuredClone(next);
    },
    dispose() {
      renderer.reset?.();
      settings = {};
    }
  };
}

export function descriptor(
  definition: Omit<PluginDescriptor, "create"> & {
    renderer: LegacyVisualizerRenderer;
  }
): PluginDescriptor {
  return {
    id: definition.id,
    displayName: definition.displayName,
    category: definition.category,
    version: definition.version,
    description: definition.description,
    defaultSettings: definition.defaultSettings,
    parameters: definition.parameters,
    legacyReactiveSettings: definition.legacyReactiveSettings,
    create(context) {
      return createRendererInstance(
        definition.renderer,
        definition.defaultSettings as PluginSettings,
        context.seed
      );
    }
  };
}
