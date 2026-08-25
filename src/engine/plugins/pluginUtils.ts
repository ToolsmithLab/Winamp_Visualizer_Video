import type { PluginSettings } from "./types";

export function numeric(
  settings: PluginSettings,
  key: string,
  fallback: number
): number {
  const value = settings[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function text(
  settings: PluginSettings,
  key: string,
  fallback: string
): string {
  return typeof settings[key] === "string" ? settings[key] : fallback;
}

export function flag(
  settings: PluginSettings,
  key: string,
  fallback: boolean
): boolean {
  return typeof settings[key] === "boolean" ? settings[key] : fallback;
}

export function hashUnit(seed: number, index: number): number {
  let value = (seed ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x21f0aaad);
  value = Math.imul(value ^ (value >>> 15), 0x735a2d97);
  return ((value ^ (value >>> 15)) >>> 0) / 0x1_0000_0000;
}

function component(color: string, offset: number): number {
  return Number.parseInt(color.slice(offset, offset + 2), 16);
}

export function interpolateColor(
  start: string,
  end: string,
  amount: number
): string {
  const t = Math.max(0, Math.min(1, amount));
  const value = [1, 3, 5]
    .map((offset) =>
      Math.round(component(start, offset) * (1 - t) + component(end, offset) * t)
        .toString(16)
        .padStart(2, "0")
    )
    .join("");
  return `#${value}`;
}
