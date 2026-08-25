import type {
  PluginDescriptor,
  PluginParameterDescriptor,
  PluginSettings
} from "./types";

const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

function normalizeNumber(
  parameter: Extract<PluginParameterDescriptor, { type: "number" }>,
  value: unknown
): number {
  const candidate =
    typeof value === "number" && Number.isFinite(value)
      ? value
      : parameter.defaultValue;
  const bounded = Math.min(parameter.maximum, Math.max(parameter.minimum, candidate));
  const steps = Math.round((bounded - parameter.minimum) / parameter.step);
  const stepped = parameter.minimum + steps * parameter.step;
  return Number(
    Math.min(parameter.maximum, Math.max(parameter.minimum, stepped)).toFixed(8)
  );
}

export function normalizePluginParameter(
  parameter: PluginParameterDescriptor,
  value: unknown
): string | number | boolean {
  if (parameter.type === "number") return normalizeNumber(parameter, value);
  if (parameter.type === "boolean") {
    return typeof value === "boolean" ? value : parameter.defaultValue;
  }
  if (parameter.type === "color") {
    return typeof value === "string" && COLOR_PATTERN.test(value)
      ? value.toLowerCase()
      : parameter.defaultValue.toLowerCase();
  }
  return typeof value === "string" &&
    parameter.options.some((option) => option.value === value)
    ? value
    : parameter.defaultValue;
}

export function normalizePluginSettings(
  descriptor: PluginDescriptor,
  value: unknown
): PluginSettings {
  const source =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const normalized: PluginSettings = {};
  for (const parameter of descriptor.parameters) {
    normalized[parameter.key] = normalizePluginParameter(
      parameter,
      source[parameter.key]
    );
  }
  return normalized;
}

export function validatePluginDescriptor(descriptor: PluginDescriptor): void {
  if (!/^[a-z][A-Za-z0-9]*$/.test(descriptor.id)) {
    throw new Error(`ID plugin non valido: ${descriptor.id}`);
  }
  if (!descriptor.displayName.trim() || !descriptor.version.trim()) {
    throw new Error(`Descriptor incompleto: ${descriptor.id}`);
  }
  const keys = new Set<string>();
  for (const parameter of descriptor.parameters) {
    if (keys.has(parameter.key)) {
      throw new Error(`Parametro duplicato ${descriptor.id}.${parameter.key}`);
    }
    keys.add(parameter.key);
    if (parameter.type === "number") {
      if (
        !Number.isFinite(parameter.minimum) ||
        !Number.isFinite(parameter.maximum) ||
        !Number.isFinite(parameter.step) ||
        parameter.minimum > parameter.maximum ||
        parameter.step <= 0
      ) {
        throw new Error(`Range non valido ${descriptor.id}.${parameter.key}`);
      }
    }
    if (parameter.type === "select" && !parameter.options.length) {
      throw new Error(`Select senza opzioni ${descriptor.id}.${parameter.key}`);
    }
  }
  const normalized = normalizePluginSettings(
    descriptor,
    descriptor.defaultSettings
  );
  for (const parameter of descriptor.parameters) {
    if (normalized[parameter.key] === undefined) {
      throw new Error(`Default mancante ${descriptor.id}.${parameter.key}`);
    }
  }
}
