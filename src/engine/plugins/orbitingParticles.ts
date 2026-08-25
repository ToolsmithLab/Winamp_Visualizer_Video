import { descriptor } from "./descriptorHelpers";
import { hashUnit, numeric, text } from "./pluginUtils";
import type {
  LegacyVisualizerRenderer,
  PluginParameterDescriptor
} from "./types";

const parameters: readonly PluginParameterDescriptor[] = [
  {
    key: "particleCount", label: "Numero particelle", type: "number",
    defaultValue: 120, minimum: 8, maximum: 256, step: 1, animatable: false,
    description: "Numero particelle, massimo 256."
  },
  {
    key: "orbitRadius", label: "Raggio orbita", type: "number",
    defaultValue: 0.24, minimum: 0.04, maximum: 0.48, step: 0.01,
    animatable: true, description: "Raggio base dell'orbita."
  },
  {
    key: "speed", label: "Velocità", type: "number", defaultValue: 0.28,
    minimum: -2, maximum: 2, step: 0.02, animatable: true,
    description: "Velocità angolare."
  },
  {
    key: "size", label: "Dimensione", type: "number", defaultValue: 2.8,
    minimum: 0.5, maximum: 12, step: 0.5, animatable: true,
    description: "Raggio delle particelle."
  },
  {
    key: "dispersion", label: "Dispersione", type: "number", defaultValue: 0.32,
    minimum: 0, maximum: 1, step: 0.01, animatable: true,
    description: "Variazione deterministica delle orbite."
  },
  {
    key: "bassResponse", label: "Risposta bassi", type: "number",
    defaultValue: 1, minimum: 0, maximum: 3, step: 0.05, animatable: true,
    description: "Influenza dei bassi sul raggio."
  },
  {
    key: "midResponse", label: "Risposta medi", type: "number",
    defaultValue: 0.7, minimum: 0, maximum: 3, step: 0.05, animatable: true,
    description: "Influenza dei medi sulla velocità."
  },
  {
    key: "highResponse", label: "Risposta alti", type: "number",
    defaultValue: 0.5, minimum: 0, maximum: 3, step: 0.05, animatable: true,
    description: "Influenza degli alti sulla dimensione."
  },
  {
    key: "color", label: "Colore", type: "color", defaultValue: "#facc15",
    animatable: true, description: "Colore delle particelle."
  },
  {
    key: "trail", label: "Trail", type: "number", defaultValue: 2,
    minimum: 0, maximum: 6, step: 1, animatable: true,
    description: "Numero limitato di copie lungo l'orbita."
  },
  {
    key: "seed", label: "Seed", type: "number", defaultValue: 1337,
    minimum: 0, maximum: 4294967295, step: 1, animatable: false,
    description: "Seed serializzato combinato con progetto e layer."
  }
];

export const orbitingParticles: LegacyVisualizerRenderer = {
  id: "orbitingParticles",
  render({ context, width, height, audio, settings, time, seed }) {
    const count = Math.round(numeric(settings, "particleCount", 120));
    const baseRadius = numeric(settings, "orbitRadius", 0.24) * width;
    const speed =
      numeric(settings, "speed", 0.28) *
      (1 + audio.mid * numeric(settings, "midResponse", 0.7));
    const dispersion = numeric(settings, "dispersion", 0.32);
    const size =
      numeric(settings, "size", 2.8) *
      (1 + audio.high * numeric(settings, "highResponse", 0.5));
    const bass =
      audio.bass * numeric(settings, "bassResponse", 1);
    const trail = Math.round(numeric(settings, "trail", 2));
    const ownSeed = numeric(settings, "seed", 1337) >>> 0;
    const combinedSeed = (seed ^ ownSeed) >>> 0;
    const centerX = width / 2;
    const centerY = height * 0.52;
    context.fillStyle = text(settings, "color", "#facc15");
    // Skia rasterizza lo shadow blur separatamente per ogni arco: con centinaia
    // di particelle il costo cresceva fino a secondi per frame in export 1080p.
    // Il trail fornisce già la persistenza visiva richiesta senza quel filtro.
    context.shadowBlur = 0;
    for (let index = 0; index < count; index += 1) {
      const phase = hashUnit(combinedSeed, index) * Math.PI * 2;
      const radiusVariation =
        (hashUnit(combinedSeed ^ 0xa5a5a5a5, index) - 0.5) * dispersion;
      const radius = baseRadius * (1 + radiusVariation + bass * 0.16);
      const yScale = 0.42 + hashUnit(combinedSeed ^ 0x5a5a5a5a, index) * 0.38;
      for (let trailIndex = trail; trailIndex >= 0; trailIndex -= 1) {
        const angle =
          phase + time * speed * (0.65 + hashUnit(combinedSeed, index + 512)) -
          trailIndex * 0.025;
        const alpha = 1 - trailIndex / Math.max(1, trail + 1);
        context.globalAlpha *= alpha;
        context.beginPath();
        context.arc(
          centerX + Math.cos(angle) * radius,
          centerY + Math.sin(angle) * radius * yScale,
          Math.max(0.5, size * (0.55 + hashUnit(combinedSeed, index + 1024))),
          0,
          Math.PI * 2
        );
        context.fill();
        context.globalAlpha /= Math.max(0.001, alpha);
      }
    }
  }
};

export const orbitingParticlesDescriptor = descriptor({
  id: "orbitingParticles",
  displayName: "Orbiting Particles",
  category: "particles",
  version: "1.0.0",
  description: "Particelle orbitanti deterministiche e audio-reattive.",
  defaultSettings: Object.fromEntries(
    parameters.map((parameter) => [parameter.key, parameter.defaultValue])
  ),
  parameters,
  renderer: orbitingParticles
});
