import type { LegacyVisualizerRenderer } from "./types";
import {
  commonReactiveDefaults,
  descriptor,
  numberSetting,
  reactiveParameters,
  stringSetting
} from "./descriptorHelpers";

// Plugin Canvas integrato nel motore condiviso.

export const waveformLine: LegacyVisualizerRenderer = {
  id: "waveformLine",
  render({ context, width, height, audio, settings, energy }) {
    const waveform = audio.waveform;
    const centerY = height * 0.78;
    const amplitude =
      height * 0.08 * numberSetting(settings, "intensity", 1) * (0.7 + energy);
    context.strokeStyle = stringSetting(settings, "color", "#8b5cf6");
    context.lineWidth = 2 + energy * 2;
    context.shadowBlur = 0;
    context.beginPath();

    for (let index = 0; index < waveform.length; index += 1) {
      const x = (index / Math.max(1, waveform.length - 1)) * width;
      const normalized = ((waveform[index] ?? 128) - 128) / 128;
      const y =
        centerY + normalized * amplitude *
          numberSetting(settings, "sensitivity", 1);
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.stroke();
  }
};

export const waveformLineDescriptor = descriptor({
  id: "waveformLine",
  displayName: "Waveform Line",
  category: "waveform",
  version: "1.0.0",
  description: "Linea waveform orizzontale guidata dal PCM.",
  legacyReactiveSettings: true,
  defaultSettings: { ...commonReactiveDefaults, band: "mid" },
  parameters: reactiveParameters({ band: "mid" }),
  renderer: waveformLine
});
