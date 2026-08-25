import type { ProjectDocument } from "./migrations";

const runtimeOnlyKeys = new Set([
  "pcm",
  "framebuffer",
  "bitmap",
  "errorCount",
  "metrics",
  "playhead",
  "handle",
  "pid",
  "runtimeInstance"
]);

function isRecord(value: unknown): value is ProjectDocument {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function inspectSerializable(
  value: unknown,
  path: string,
  seen: Set<object>
): void {
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new Error(`Valore numerico non finito nel progetto: ${path}`);
  }
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    typeof value === "number"
  ) {
    return;
  }
  if (typeof value !== "object") {
    throw new Error(`Valore non serializzabile nel progetto: ${path}`);
  }
  if (seen.has(value)) {
    throw new Error(`Riferimento circolare nel progetto: ${path}`);
  }
  seen.add(value);
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) {
    throw new Error(`Dati binari runtime non ammessi nel progetto: ${path}`);
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      inspectSerializable(item, `${path}[${index}]`, seen)
    );
  } else {
    for (const [key, item] of Object.entries(value)) {
      if (runtimeOnlyKeys.has(key)) {
        throw new Error(`Campo runtime non ammesso nel progetto: ${path}.${key}`);
      }
      inspectSerializable(item, `${path}.${key}`, seen);
    }
  }
  seen.delete(value);
}

export function assertProjectDocument(value: unknown): asserts value is ProjectDocument {
  if (!isRecord(value)) {
    throw new Error("Il file progetto deve contenere un oggetto JSON.");
  }
  if (value.version !== undefined && typeof value.version !== "string") {
    throw new Error("La versione del progetto deve essere una stringa.");
  }
  if (value.name !== undefined && typeof value.name !== "string") {
    throw new Error("Il nome del progetto deve essere una stringa.");
  }
  if (value.layers !== undefined && !Array.isArray(value.layers)) {
    throw new Error("I livelli del progetto devono essere un array.");
  }
  if (value.cover !== undefined && !isRecord(value.cover)) {
    throw new Error("Le impostazioni della copertina non sono valide.");
  }
  if (value.text !== undefined && !isRecord(value.text)) {
    throw new Error("Le impostazioni testo non sono valide.");
  }
  if (value.projectM !== undefined && !isRecord(value.projectM)) {
    throw new Error("Le impostazioni projectM non sono valide.");
  }
  inspectSerializable(value, "project", new Set());
}

