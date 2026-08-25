import { descriptor } from "./descriptorHelpers";
import { numeric, text } from "./pluginUtils";
import type {
  LegacyVisualizerRenderer,
  PluginParameterDescriptor
} from "./types";

const parameters: readonly PluginParameterDescriptor[] = [
  {
    key: "orientation", label: "Orientamento", type: "select",
    defaultValue: "horizontal", options: [
      { value: "horizontal", label: "Orizzontale" },
      { value: "vertical", label: "Verticale" }
    ], animatable: false, description: "Asse principale della waveform."
  },
  {
    key: "lineWidth", label: "Spessore linea", type: "number", defaultValue: 2,
    minimum: 0.5, maximum: 12, step: 0.5, animatable: true,
    description: "Spessore del profilo."
  },
  {
    key: "amplitude", label: "Scala ampiezza", type: "number", defaultValue: 0.15,
    minimum: 0.02, maximum: 0.45, step: 0.01, animatable: true,
    description: "Ampiezza massima rispetto al canvas."
  },
  {
    key: "smoothing", label: "Smoothing", type: "number", defaultValue: 0.6,
    minimum: 0, maximum: 0.98, step: 0.01, animatable: true,
    description: "Media fra campioni adiacenti."
  },
  {
    key: "separation", label: "Distanza waveform", type: "number", defaultValue: 0.1,
    minimum: 0, maximum: 0.4, step: 0.01, animatable: true,
    description: "Distanza fra le due forme speculari."
  },
  {
    key: "color", label: "Colore", type: "color", defaultValue: "#a78bfa",
    animatable: true, description: "Colore della waveform."
  },
  {
    key: "glow", label: "Glow", type: "number", defaultValue: 4,
    minimum: 0, maximum: 24, step: 1, animatable: true,
    description: "Raggio glow controllato."
  },
  {
    key: "mode", label: "Modalità", type: "select", defaultValue: "line",
    options: [
      { value: "line", label: "Linea" },
      { value: "fill", label: "Riempita" }
    ], animatable: false, description: "Disegno a linea o area."
  }
];

export const mirroredWaveform: LegacyVisualizerRenderer = {
  id: "mirroredWaveform",
  render({ context, width, height, audio, settings }) {
    const horizontal = text(settings, "orientation", "horizontal") === "horizontal";
    const lineWidth = numeric(settings, "lineWidth", 2);
    const amplitude =
      numeric(settings, "amplitude", 0.15) * (horizontal ? height : width);
    const separation =
      numeric(settings, "separation", 0.1) * (horizontal ? height : width);
    const smoothing = numeric(settings, "smoothing", 0.6);
    const fill = text(settings, "mode", "line") === "fill";
    context.strokeStyle = text(settings, "color", "#a78bfa");
    context.fillStyle = text(settings, "color", "#a78bfa");
    context.lineWidth = lineWidth;
    context.shadowColor = text(settings, "color", "#a78bfa");
    context.shadowBlur = numeric(settings, "glow", 4);
    const waveform = audio.waveform;
    for (const side of [-1, 1]) {
      context.beginPath();
      let previous = 0;
      for (let index = 0; index < waveform.length; index += 1) {
        const raw = ((waveform[index] ?? 128) - 128) / 128;
        const sample = previous * smoothing + raw * (1 - smoothing);
        previous = sample;
        const along = index / Math.max(1, waveform.length - 1);
        const offset = side * (separation / 2 + sample * amplitude);
        const x = horizontal ? along * width : width / 2 + offset;
        const y = horizontal ? height / 2 + offset : along * height;
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      if (fill) {
        if (horizontal) context.lineTo(width, height / 2);
        else context.lineTo(width / 2, height);
        context.closePath();
        context.globalAlpha *= 0.28;
        context.fill();
        context.globalAlpha /= 0.28;
      } else {
        context.stroke();
      }
    }
  }
};

export const mirroredWaveformDescriptor = descriptor({
  id: "mirroredWaveform",
  displayName: "Mirrored Waveform",
  category: "waveform",
  version: "1.0.0",
  description: "Waveform PCM speculare configurabile.",
  defaultSettings: Object.fromEntries(
    parameters.map((parameter) => [parameter.key, parameter.defaultValue])
  ),
  parameters,
  renderer: mirroredWaveform
});
