import { readFile } from "node:fs/promises";
import {
  normalizeProject,
  serializeProject,
  type VisualizerProject
} from "../../shared/project";
import {
  atomicWriteJson,
  type AtomicWriteOptions
} from "./atomicWrite";

export async function loadProjectFile(
  projectPath: string
): Promise<VisualizerProject> {
  const raw = await readFile(projectPath, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Il file progetto contiene JSON non valido.");
  }
  return normalizeProject(parsed);
}

export async function saveProjectFile(
  projectPath: string,
  project: VisualizerProject,
  options: AtomicWriteOptions = {}
): Promise<VisualizerProject> {
  const normalized = normalizeProject({
    ...project,
    modifiedAt: new Date().toISOString()
  });
  const serialized = serializeProject(normalized);
  await atomicWriteJson(projectPath, serialized, options);
  return normalized;
}

