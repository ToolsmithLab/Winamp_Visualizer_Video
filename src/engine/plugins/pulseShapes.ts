import type { LegacyVisualizerRenderer } from "./types";
import {
  commonReactiveDefaults,
  descriptor,
  numberSetting,
  reactiveParameters,
  stringSetting
} from "./descriptorHelpers";

// Plugin Canvas integrato nel motore condiviso.

export const pulseShapes: LegacyVisualizerRenderer = {
  id: "pulseShapes",
  render({ context, width, height, settings, energy, time }) {
    const centerX = width / 2;
    const centerY = height * 0.72;
    const count = 3;
    context.strokeStyle = stringSetting(settings, "color", "#8b5cf6");
    context.lineWidth = 2;
    context.shadowBlur = 0;

    for (let index = 0; index < count; index += 1) {
      const phase = (time * 0.22 + index / count) % 1;
      const radius =
        width * (0.08 + phase * 0.33) *
        numberSetting(settings, "intensity", 1) * (0.8 + energy * 0.3);
      context.globalAlpha *= (1 - phase) * (0.28 + energy * 0.72);
      context.beginPath();
      context.arc(centerX, centerY, radius, 0, Math.PI * 2);
      context.stroke();
      context.globalAlpha /= Math.max(0.001, (1 - phase) * (0.28 + energy * 0.72));
    }
  }
};

export const pulseShapesDescriptor = descriptor({
  id: "pulseShapes",
  displayName: "Pulse Shapes",
  category: "geometry",
  version: "1.0.0",
  description: "Anelli pulsanti sincronizzati con l'energia audio.",
  legacyReactiveSettings: true,
  defaultSettings: { ...commonReactiveDefaults, band: "bass" },
  parameters: reactiveParameters({ band: "bass" }),
  renderer: pulseShapes
});
