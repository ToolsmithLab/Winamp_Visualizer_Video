import type { LegacyVisualizerRenderer } from "./types";
import {
  commonReactiveDefaults,
  descriptor,
  numberSetting,
  reactiveParameters
} from "./descriptorHelpers";

// Plugin Canvas integrato nel motore condiviso.

export const dynamicVignette: LegacyVisualizerRenderer = {
  id: "dynamicVignette",
  render({ context, width, height, settings, energy }) {
    const strength = Math.min(
      0.88,
      (0.3 + energy * 0.38 * numberSetting(settings, "sensitivity", 1)) *
        numberSetting(settings, "intensity", 0.55)
    );
    const gradient = context.createRadialGradient(
      width / 2,
      height * 0.48,
      width * 0.15,
      width / 2,
      height * 0.48,
      height * 0.67
    );
    gradient.addColorStop(0, "rgba(0, 0, 0, 0)");
    gradient.addColorStop(0.64, `rgba(0, 0, 0, ${strength * 0.2})`);
    gradient.addColorStop(1, `rgba(0, 0, 0, ${strength})`);
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
  }
};

export const dynamicVignetteDescriptor = descriptor({
  id: "dynamicVignette",
  displayName: "Dynamic Vignette",
  category: "effect",
  version: "1.0.0",
  description: "Vignetta dinamica controllata dalle basse frequenze.",
  legacyReactiveSettings: true,
  defaultSettings: {
    ...commonReactiveDefaults,
    band: "bass",
    intensity: 0.55
  },
  parameters: reactiveParameters({ band: "bass", intensity: 0.55 }),
  renderer: dynamicVignette
});
