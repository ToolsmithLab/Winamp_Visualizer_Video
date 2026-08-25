import { descriptor } from "./descriptorHelpers";
import { interpolateColor, numeric, text } from "./pluginUtils";
import type {
  LegacyVisualizerRenderer,
  PluginParameterDescriptor
} from "./types";

const parameters: readonly PluginParameterDescriptor[] = [
  {
    key: "rows", label: "Righe", type: "number", defaultValue: 10,
    minimum: 2, maximum: 32, step: 1, animatable: false,
    description: "Numero righe, massimo 32."
  },
  {
    key: "columns", label: "Colonne", type: "number", defaultValue: 8,
    minimum: 2, maximum: 32, step: 1, animatable: false,
    description: "Numero colonne, massimo 32."
  },
  {
    key: "spacing", label: "Spaziatura", type: "number", defaultValue: 0.18,
    minimum: 0, maximum: 0.65, step: 0.01, animatable: true,
    description: "Spazio relativo fra celle."
  },
  {
    key: "sensitivity", label: "Sensibilità", type: "number", defaultValue: 1,
    minimum: 0.1, maximum: 3, step: 0.05, animatable: true,
    description: "Amplificazione della risposta."
  },
  {
    key: "smoothing", label: "Smoothing", type: "number", defaultValue: 0.55,
    minimum: 0, maximum: 0.98, step: 0.01, animatable: true,
    description: "Smussamento spaziale fra celle."
  },
  {
    key: "minimumSize", label: "Dimensione minima", type: "number",
    defaultValue: 0.18, minimum: 0.05, maximum: 0.8, step: 0.01,
    animatable: true, description: "Scala minima della cella."
  },
  {
    key: "maximumSize", label: "Dimensione massima", type: "number",
    defaultValue: 0.9, minimum: 0.2, maximum: 1, step: 0.01,
    animatable: true, description: "Scala massima della cella."
  },
  {
    key: "lowColor", label: "Colore basso", type: "color",
    defaultValue: "#0ea5e9", animatable: true,
    description: "Colore a bassa energia."
  },
  {
    key: "highColor", label: "Colore alto", type: "color",
    defaultValue: "#f97316", animatable: true,
    description: "Colore ad alta energia."
  },
  {
    key: "frequencyMode", label: "Modalità frequenza", type: "select",
    defaultValue: "spectrum", options: [
      { value: "spectrum", label: "Spettro" },
      { value: "amplitude", label: "Ampiezza" },
      { value: "bands", label: "Bande" }
    ], animatable: false, description: "Fonte audio per le celle."
  },
  {
    key: "shape", label: "Forma cella", type: "select",
    defaultValue: "rounded", options: [
      { value: "square", label: "Quadrato" },
      { value: "rounded", label: "Arrotondato" },
      { value: "circle", label: "Cerchio" }
    ], animatable: false, description: "Geometria delle celle."
  }
];

export const audioGrid: LegacyVisualizerRenderer = {
  id: "audioGrid",
  render({ context, width, height, audio, settings }) {
    const rows = Math.round(numeric(settings, "rows", 10));
    const columns = Math.round(numeric(settings, "columns", 8));
    const cellWidth = width * 0.82 / columns;
    const cellHeight = height * 0.46 / rows;
    const originX = width * 0.09;
    const originY = height * 0.27;
    const spacing = numeric(settings, "spacing", 0.18);
    const sensitivity = numeric(settings, "sensitivity", 1);
    const smoothing = numeric(settings, "smoothing", 0.55);
    const minimumSize = numeric(settings, "minimumSize", 0.18);
    const maximumSize = Math.max(
      minimumSize,
      numeric(settings, "maximumSize", 0.9)
    );
    const mode = text(settings, "frequencyMode", "spectrum");
    const shape = text(settings, "shape", "rounded");
    let previous = 0;
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const index = row * columns + column;
        let raw: number;
        if (mode === "amplitude") raw = audio.volume;
        else if (mode === "bands") {
          raw = [audio.bass, audio.mid, audio.high][column % 3] ?? 0;
        } else {
          const source = Math.floor(
            index / Math.max(1, rows * columns - 1) * audio.spectrum.length * 0.8
          );
          raw = (audio.spectrum[source] ?? 0) / 255;
        }
        const value = Math.min(
          1,
          (previous * smoothing + raw * (1 - smoothing)) * sensitivity
        );
        previous = value;
        const scale = minimumSize + (maximumSize - minimumSize) * value;
        const drawWidth = cellWidth * (1 - spacing) * scale;
        const drawHeight = cellHeight * (1 - spacing) * scale;
        const x = originX + column * cellWidth + (cellWidth - drawWidth) / 2;
        const y = originY + row * cellHeight + (cellHeight - drawHeight) / 2;
        context.fillStyle = interpolateColor(
          text(settings, "lowColor", "#0ea5e9"),
          text(settings, "highColor", "#f97316"),
          value
        );
        context.beginPath();
        if (shape === "circle") {
          context.ellipse(
            x + drawWidth / 2,
            y + drawHeight / 2,
            drawWidth / 2,
            drawHeight / 2,
            0,
            0,
            Math.PI * 2
          );
        } else if (shape === "rounded") {
          context.roundRect(
            x,
            y,
            drawWidth,
            drawHeight,
            Math.min(drawWidth, drawHeight) * 0.22
          );
        } else {
          context.rect(x, y, drawWidth, drawHeight);
        }
        context.fill();
      }
    }
  }
};

export const audioGridDescriptor = descriptor({
  id: "audioGrid",
  displayName: "Audio Grid",
  category: "geometry",
  version: "1.0.0",
  description: "Griglia di celle guidate da spettro, bande o ampiezza.",
  defaultSettings: Object.fromEntries(
    parameters.map((parameter) => [parameter.key, parameter.defaultValue])
  ),
  parameters,
  renderer: audioGrid
});
