import { descriptor, commonReactiveDefaults } from "./descriptorHelpers";
import { interpolateColor, numeric, text } from "./pluginUtils";
import type {
  LegacyVisualizerRenderer,
  PluginParameterDescriptor
} from "./types";

const parameters: readonly PluginParameterDescriptor[] = [
  {
    key: "rayCount", label: "Numero raggi", type: "number", defaultValue: 96,
    minimum: 8, maximum: 256, step: 1, animatable: false,
    description: "Numero massimo di raggi renderizzati."
  },
  {
    key: "length", label: "Lunghezza", type: "number", defaultValue: 0.18,
    minimum: 0.02, maximum: 0.48, step: 0.01, animatable: true,
    description: "Lunghezza dei raggi rispetto alla larghezza."
  },
  {
    key: "thickness", label: "Spessore", type: "number", defaultValue: 2,
    minimum: 0.5, maximum: 12, step: 0.5, animatable: true,
    description: "Spessore della linea."
  },
  {
    key: "rotation", label: "Rotazione", type: "number", defaultValue: 0,
    minimum: -180, maximum: 180, step: 1, animatable: true,
    description: "Rotazione statica in gradi."
  },
  {
    key: "sensitivity", label: "Sensibilità", type: "number", defaultValue: 1,
    minimum: 0.1, maximum: 3, step: 0.05, animatable: true,
    description: "Amplificazione delle bande."
  },
  {
    key: "startColor", label: "Colore iniziale", type: "color",
    defaultValue: "#22d3ee", animatable: true,
    description: "Colore dei raggi a bassa energia."
  },
  {
    key: "endColor", label: "Colore finale", type: "color",
    defaultValue: "#f43f5e", animatable: true,
    description: "Colore dei raggi ad alta energia."
  },
  {
    key: "smoothing", label: "Smoothing", type: "number", defaultValue: 0.72,
    minimum: 0, maximum: 0.98, step: 0.01, animatable: true,
    description: "Smoothing applicato dall'host."
  },
  {
    key: "symmetry", label: "Simmetria", type: "select",
    defaultValue: "radial", options: [
      { value: "radial", label: "Radiale" },
      { value: "mirror", label: "Speculare" },
      { value: "fourfold", label: "Quattro assi" }
    ], animatable: false, description: "Distribuzione simmetrica dei campioni."
  },
  {
    key: "animatedRotation", label: "Rotazione animata", type: "boolean",
    defaultValue: true, animatable: false,
    description: "Applica una rotazione lenta basata sul timestamp."
  }
];

export const radialRays: LegacyVisualizerRenderer = {
  id: "radialRays",
  render({ context, width, height, audio, settings, time }) {
    const count = Math.round(numeric(settings, "rayCount", 96));
    const length = numeric(settings, "length", 0.18) * width;
    const sensitivity = numeric(settings, "sensitivity", 1);
    const rotation =
      numeric(settings, "rotation", 0) * Math.PI / 180 +
      (settings.animatedRotation === false ? 0 : time * 0.025);
    const symmetry = text(settings, "symmetry", "radial");
    const centerX = width / 2;
    const centerY = height * 0.5;
    const radius = Math.min(width, height) * 0.19;
    context.lineWidth = numeric(settings, "thickness", 2);
    context.lineCap = "round";
    for (let index = 0; index < count; index += 1) {
      const ratio = index / count;
      const sourceRatio =
        symmetry === "mirror"
          ? Math.abs(ratio * 2 - 1)
          : symmetry === "fourfold"
            ? Math.abs(((ratio * 4) % 2) - 1)
            : ratio;
      const sourceIndex = Math.min(
        audio.spectrum.length - 1,
        Math.floor(sourceRatio * audio.spectrum.length * 0.72)
      );
      const value = Math.min(
        1,
        ((audio.spectrum[sourceIndex] ?? 0) / 255) * sensitivity
      );
      const angle = ratio * Math.PI * 2 + rotation;
      const outer = radius + Math.max(2, value * length);
      context.strokeStyle = interpolateColor(
        text(settings, "startColor", "#22d3ee"),
        text(settings, "endColor", "#f43f5e"),
        value
      );
      context.beginPath();
      context.moveTo(
        centerX + Math.cos(angle) * radius,
        centerY + Math.sin(angle) * radius
      );
      context.lineTo(
        centerX + Math.cos(angle) * outer,
        centerY + Math.sin(angle) * outer
      );
      context.stroke();
    }
  }
};

export const radialRaysDescriptor = descriptor({
  id: "radialRays",
  displayName: "Radial Rays",
  category: "spectrum",
  version: "1.0.0",
  description: "Raggi radiali colorati guidati dalle bande audio.",
  defaultSettings: Object.fromEntries(
    parameters.map((parameter) => [parameter.key, parameter.defaultValue])
  ),
  parameters,
  renderer: radialRays
});
