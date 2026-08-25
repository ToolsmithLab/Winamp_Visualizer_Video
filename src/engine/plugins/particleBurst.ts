import type {
  LegacyVisualizerRenderer,
  PluginDescriptor,
  PluginSettings,
  VisualizerRenderContext
} from "./types";
import {
  commonReactiveDefaults,
  numberSetting,
  reactiveParameters,
  stringSetting
} from "./descriptorHelpers";

// Plugin Canvas stateful integrato nel motore condiviso.

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  size: number;
}

export class ParticleBurstPlugin implements LegacyVisualizerRenderer {
  readonly id = "particleBurst" as const;
  private particles: Particle[] = [];
  private previousEnergy = 0;
  private randomIndex = 0;

  constructor(private seed = 0x12345678) {}

  setSeed(seed: number): void {
    this.seed = seed >>> 0;
    this.reset();
  }

  private random(): number {
    let value = (this.seed ^ Math.imul(++this.randomIndex, 0x9e3779b1)) >>> 0;
    value = Math.imul(value ^ (value >>> 16), 0x21f0aaad);
    value = Math.imul(value ^ (value >>> 15), 0x735a2d97);
    return ((value ^ (value >>> 15)) >>> 0) / 0x1_0000_0000;
  }

  render(frame: VisualizerRenderContext): void {
    const { context, width, height, energy, settings, deltaTime } = frame;
    const delta = Math.min(0.05, Math.max(0, deltaTime));
    const onset = energy - this.previousEnergy;
    this.previousEnergy = energy;

    if (energy > 0.38 && onset > 0.025) {
      const amount = Math.round(
        6 + energy * 22 * numberSetting(settings, "intensity", 1)
      );
      for (let index = 0; index < amount; index += 1) {
        const angle = (index / amount) * Math.PI * 2 + this.random() * 0.22;
        const speed = width * (0.08 + this.random() * 0.24) * (0.65 + energy);
        this.particles.push({
          x: width / 2,
          y: height * 0.72,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 0.55 + this.random() * 0.75,
          size: 1.5 + this.random() * 4
        });
      }
    }

    context.fillStyle = stringSetting(settings, "color", "#8b5cf6");
    context.shadowBlur = 0;
    this.particles = this.particles.filter((particle) => {
      particle.life -= delta;
      if (particle.life <= 0) return false;
      particle.x += particle.vx * delta;
      particle.y += particle.vy * delta;
      particle.vx *= 0.985;
      particle.vy = particle.vy * 0.985 + height * 0.03 * delta;
      context.globalAlpha *= Math.min(1, particle.life * 1.8);
      context.beginPath();
      context.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      context.fill();
      context.globalAlpha /= Math.max(0.001, Math.min(1, particle.life * 1.8));
      return true;
    }).slice(-500);
  }

  reset(): void {
    this.particles = [];
    this.previousEnergy = 0;
    this.randomIndex = 0;
  }
}

export const particleBurstDescriptor: PluginDescriptor = {
  id: "particleBurst",
  displayName: "Particle Burst",
  category: "particles",
  version: "1.0.0",
  description: "Esplosioni deterministiche di particelle sui transienti.",
  legacyReactiveSettings: true,
  defaultSettings: { ...commonReactiveDefaults, band: "bass" },
  parameters: reactiveParameters({ band: "bass" }),
  create(context) {
    const renderer = new ParticleBurstPlugin(context.seed);
    let settings: PluginSettings = {
      ...this.defaultSettings
    } as PluginSettings;
    return {
      initialize() {},
      render(frame) {
        renderer.render({ ...frame, settings, seed: context.seed });
      },
      resize() {},
      reset() {
        renderer.reset();
      },
      serialize() {
        return structuredClone(settings);
      },
      deserialize(next) {
        settings = structuredClone(next);
      },
      dispose() {
        renderer.reset();
        settings = {};
      }
    };
  }
};
