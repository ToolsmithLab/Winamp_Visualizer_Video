import type { LegacyVisualizerRenderer } from "./types";
import {
  commonReactiveDefaults,
  descriptor,
  numberSetting,
  reactiveParameters,
  stringSetting
} from "./descriptorHelpers";

// Plugin Canvas integrato nel motore condiviso.

export const circularSpectrum: LegacyVisualizerRenderer = {
  id: "circularSpectrum",
  render({ context, width, height, audio, settings, energy, time }) {
    const centerX = width / 2;
    const centerY = height * 0.36;
    const count = 72;
    const baseRadius = width * (0.2 + energy * 0.018);
    const maxLength = width * 0.12 * numberSetting(settings, "intensity", 1);
    context.strokeStyle = stringSetting(settings, "color", "#8b5cf6");
    context.lineWidth = Math.max(1.5, width * 0.004);
    context.shadowBlur = 0;
    context.beginPath();

    for (let index = 0; index < count; index += 1) {
      const angle = (index / count) * Math.PI * 2 - Math.PI / 2 + time * 0.035;
      const sourceIndex = Math.floor(
        (index / count) * audio.spectrum.length * 0.6
      );
      const value = Math.min(
        1,
        ((audio.spectrum[sourceIndex] ?? 0) / 255) *
          numberSetting(settings, "sensitivity", 1)
      );
      const inner = baseRadius;
      const outer = inner + Math.max(2, value * maxLength);
      const x1 = centerX + Math.cos(angle) * inner;
      const y1 = centerY + Math.sin(angle) * inner;
      const x2 = centerX + Math.cos(angle) * outer;
      const y2 = centerY + Math.sin(angle) * outer;
      context.moveTo(x1, y1);
      context.lineTo(x2, y2);
    }
    context.stroke();
  }
};

export const circularSpectrumDescriptor = descriptor({
  id: "circularSpectrum",
  displayName: "Circular Spectrum",
  category: "spectrum",
  version: "1.0.0",
  description: "Spettro circolare audio-reattivo.",
  legacyReactiveSettings: true,
  defaultSettings: { ...commonReactiveDefaults, band: "bass" },
  parameters: reactiveParameters({ band: "bass" }),
  renderer: circularSpectrum
});
