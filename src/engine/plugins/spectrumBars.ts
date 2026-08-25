import type { LegacyVisualizerRenderer } from "./types";
import {
  commonReactiveDefaults,
  commonReactiveParameters,
  descriptor,
  numberSetting,
  stringSetting
} from "./descriptorHelpers";

// Plugin Canvas integrato nel motore condiviso.

export const spectrumBars: LegacyVisualizerRenderer = {
  id: "spectrumBars",
  render({ context, width, height, audio, settings, energy }) {
    const barCount = 48;
    const gap = 3;
    const availableWidth = width * 0.88;
    const barWidth = (availableWidth - gap * (barCount - 1)) / barCount;
    const startX = (width - availableWidth) / 2;
    const baseline = height * 0.87;
    const maxHeight = height * 0.19 * numberSetting(settings, "intensity", 1);
    context.fillStyle = stringSetting(settings, "color", "#8b5cf6");
    context.shadowBlur = 0;

    for (let index = 0; index < barCount; index += 1) {
      const sourceIndex = Math.floor(
        (index / barCount) * audio.spectrum.length * 0.55
      );
      const frequencyEnergy =
        Math.min(1, ((audio.spectrum[sourceIndex] ?? 0) / 255) *
          numberSetting(settings, "sensitivity", 1));
      const barHeight = Math.max(3, frequencyEnergy * maxHeight);
      context.globalAlpha *= 0.38 + frequencyEnergy * 0.62;
      context.fillRect(
        startX + index * (barWidth + gap),
        baseline - barHeight,
        barWidth,
        barHeight
      );
      context.globalAlpha /= 0.38 + frequencyEnergy * 0.62;
    }
  }
};

export const spectrumBarsDescriptor = descriptor({
  id: "spectrumBars",
  displayName: "Spectrum Bars",
  category: "spectrum",
  version: "1.0.0",
  description: "Barre lineari guidate dallo spettro audio.",
  legacyReactiveSettings: true,
  defaultSettings: commonReactiveDefaults,
  parameters: commonReactiveParameters,
  renderer: spectrumBars
});
