import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  copyFile,
  lstat,
  mkdir,
  readFile,
  realpath,
  readdir,
  rm,
  stat
} from "node:fs/promises";
import path from "node:path";
import {
  PROJECT_PRESET_LIMITS,
  PROJECT_PRESET_VERSION,
  applyResolvedProjectPreset,
  createProjectPresetDocument,
  inspectProjectPresetCompatibility,
  validateProjectPreset,
  type ProjectPresetCreateRequest,
  type ProjectPresetDocument,
  type ProjectPresetLibraryRecord,
  type ProjectPresetPreview,
  type ProjectPresetQuery
} from "../../shared/projectPreset";
import type {
  ProjectAssetReference,
  AssetStatus,
  VisualizerProject
} from "../../shared/project";
import { atomicWriteJson } from "./atomicWrite";

interface StoredProjectPresetRecord {
  id: string;
  fileName: string;
  sourceDirectory: string | null;
  assetPaths: Record<string, string>;
}

interface StoredProjectPresetIndex {
  version: 1;
  records: StoredProjectPresetRecord[];
}

const emptyIndex = (): StoredProjectPresetIndex => ({
  version: 1,
  records: []
});

function safeFileComponent(value: string): string {
  const cleaned = value
    .normalize("NFC")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/[. ]+$/g, "")
    .slice(0, 80);
  return cleaned || "preset-progetto";
}

function decodeStrictUtf8(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("Il Preset di progetto non è UTF-8 valido.");
  }
}

function parseProjectPreset(bytes: Uint8Array): ProjectPresetDocument {
  if (!bytes.byteLength) {
    throw new Error("Il file Preset di progetto è vuoto.");
  }
  if (bytes.byteLength > PROJECT_PRESET_LIMITS.fileBytes) {
    throw new Error(
      `Preset di progetto troppo grande: limite ${PROJECT_PRESET_LIMITS.fileBytes} byte.`
    );
  }
  const raw = decodeStrictUtf8(bytes);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Il Preset di progetto contiene JSON non valido.");
  }
  return validateProjectPreset(parsed);
}

async function exists(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

async function sha256(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

function within(directory: string, candidate: string): boolean {
  const relative = path.relative(directory, candidate);
  return (
    relative !== "" &&
    !relative.startsWith(`..${path.sep}`) &&
    relative !== ".." &&
    !path.isAbsolute(relative)
  );
}

export class ProjectPresetService {
  private readonly presetsDirectory: string;
  private readonly indexPath: string;
  private index: StoredProjectPresetIndex = emptyIndex();
  private initialized = false;

  constructor(private readonly rootDirectory: string) {
    this.presetsDirectory = path.join(rootDirectory, "files");
    this.indexPath = path.join(rootDirectory, "library.json");
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    await mkdir(this.presetsDirectory, { recursive: true });
    try {
      const raw = await readFile(this.indexPath);
      if (raw.byteLength > PROJECT_PRESET_LIMITS.fileBytes) {
        throw new Error("Indice Preset di progetto troppo grande.");
      }
      const parsed = JSON.parse(decodeStrictUtf8(raw)) as StoredProjectPresetIndex;
      if (parsed.version !== 1 || !Array.isArray(parsed.records)) {
        throw new Error("Indice Preset di progetto non valido.");
      }
      this.index = {
        version: 1,
        records: parsed.records.filter(
          (record) =>
            record &&
            typeof record.id === "string" &&
            typeof record.fileName === "string" &&
            (record.sourceDirectory === null ||
              typeof record.sourceDirectory === "string") &&
            record.assetPaths &&
            typeof record.assetPaths === "object"
        )
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      await this.persist();
    }
    this.initialized = true;
  }

  private async persist(): Promise<void> {
    await mkdir(this.rootDirectory, { recursive: true });
    await atomicWriteJson(
      this.indexPath,
      `${JSON.stringify(this.index, null, 2)}\n`
    );
  }

  private record(id: string): StoredProjectPresetRecord {
    const record = this.index.records.find((item) => item.id === id);
    if (!record) throw new Error("Preset di progetto non trovato.");
    return record;
  }

  private filePath(record: StoredProjectPresetRecord): string {
    const candidate = path.join(this.presetsDirectory, record.fileName);
    if (!within(this.presetsDirectory, candidate)) {
      throw new Error("Percorso libreria Preset di progetto non sicuro.");
    }
    return candidate;
  }

  private async loadStored(
    record: StoredProjectPresetRecord,
    resolveAssets = true
  ): Promise<ProjectPresetDocument> {
    const document = parseProjectPreset(await readFile(this.filePath(record)));
    if (!resolveAssets) return document;
    const assets: ProjectAssetReference[] = [];
    for (const asset of document.assets) {
      let candidate = record.assetPaths[asset.id] ?? null;
      if (!candidate && asset.relativePath && record.sourceDirectory) {
        const resolved = path.resolve(record.sourceDirectory, asset.relativePath);
        if (within(record.sourceDirectory, resolved)) candidate = resolved;
      }
      const available = candidate ? await exists(candidate) : false;
      let status: AssetStatus = available ? "available" : "missing";
      if (available && asset.hash) {
        status =
          (await sha256(candidate!)).toLowerCase() === asset.hash.toLowerCase()
            ? "available"
            : "hash-mismatch";
      }
      assets.push({
        ...asset,
        path: available ? candidate : null,
        originalPath: candidate,
        status
      });
    }
    return { ...document, assets };
  }

  async list(query: ProjectPresetQuery = {}): Promise<ProjectPresetLibraryRecord[]> {
    await this.initialize();
    const records: ProjectPresetLibraryRecord[] = [];
    for (const stored of this.index.records) {
      try {
        const preset = await this.loadStored(stored);
        const compatibility = inspectProjectPresetCompatibility(preset);
        records.push({
          id: preset.metadata.id,
          name: preset.metadata.name,
          description: preset.metadata.description,
          author: preset.metadata.author,
          createdAt: preset.metadata.createdAt,
          modifiedAt: preset.metadata.modifiedAt,
          formatVersion: preset.version,
          path: this.filePath(stored),
          compatible: compatibility.compatible,
          missingPluginIds: compatibility.missingPluginIds,
          missingAssetCount:
            compatibility.missingAssets.length +
            compatibility.hashMismatches.length
        });
      } catch {
        // A damaged library entry is omitted but remains on disk for recovery.
      }
    }
    const needle = query.search?.trim().toLocaleLowerCase() ?? "";
    const filtered = needle
      ? records.filter((record) =>
          [record.name, record.description, record.author ?? "", record.id]
            .join("\n")
            .toLocaleLowerCase()
            .includes(needle)
        )
      : records;
    const sort = query.sort ?? "name";
    const direction = query.direction === "desc" ? -1 : 1;
    return filtered.sort((left, right) =>
      direction *
      String(left[sort]).localeCompare(String(right[sort]), "it", {
        sensitivity: "base",
        numeric: true
      })
    );
  }

  async create(
    request: ProjectPresetCreateRequest
  ): Promise<ProjectPresetLibraryRecord> {
    await this.initialize();
    const now = new Date().toISOString();
    const id = randomUUID();
    const sourceAssets = request.project.assets;
    const document = createProjectPresetDocument(
      request.project,
      {
        id,
        name: request.name.trim(),
        description: request.description?.trim() ?? "",
        author: request.author?.trim() || null,
        createdAt: now,
        modifiedAt: now
      },
      request.includeAssets,
      sourceAssets
    );
    const fileName = `${safeFileComponent(document.metadata.name)}-${id}.avspreset`;
    const assetPaths = Object.fromEntries(
      sourceAssets
        .filter((asset) => Boolean(asset.path))
        .map((asset) => [asset.id, asset.path!])
    );
    const stored: StoredProjectPresetRecord = {
      id,
      fileName,
      sourceDirectory: null,
      assetPaths
    };
    await atomicWriteJson(
      this.filePath(stored),
      `${JSON.stringify(document, null, 2)}\n`
    );
    this.index.records.push(stored);
    await this.persist();
    return (await this.list()).find((record) => record.id === id)!;
  }

  async importPreset(sourcePath: string): Promise<ProjectPresetLibraryRecord> {
    await this.initialize();
    if (path.extname(sourcePath).toLowerCase() !== ".avspreset") {
      throw new Error("Seleziona un file .avspreset.");
    }
    const sourceStat = await lstat(sourcePath);
    const canonical = await realpath(sourcePath);
    if (
      !sourceStat.isFile() ||
      sourceStat.isSymbolicLink() ||
      path.resolve(canonical).toLocaleLowerCase() !==
        path.resolve(sourcePath).toLocaleLowerCase()
    ) {
      throw new Error(
        "Symlink, reparse point o file non regolare rifiutato."
      );
    }
    const document = parseProjectPreset(await readFile(sourcePath));
    if (this.index.records.some((record) => record.id === document.metadata.id)) {
      throw new Error("Un Preset di progetto con lo stesso ID è già presente.");
    }
    const fileName = `${safeFileComponent(document.metadata.name)}-${document.metadata.id}.avspreset`;
    const stored: StoredProjectPresetRecord = {
      id: document.metadata.id,
      fileName,
      sourceDirectory: path.dirname(sourcePath),
      assetPaths: {}
    };
    await atomicWriteJson(
      this.filePath(stored),
      `${JSON.stringify(document, null, 2)}\n`
    );
    this.index.records.push(stored);
    try {
      await this.persist();
    } catch (error) {
      this.index.records = this.index.records.filter(
        (record) => record.id !== stored.id
      );
      await rm(this.filePath(stored), { force: true });
      throw error;
    }
    return (await this.list()).find((record) => record.id === stored.id)!;
  }

  async preview(
    id: string,
    current: VisualizerProject,
    allowPartial = true
  ): Promise<ProjectPresetPreview> {
    await this.initialize();
    const preset = await this.loadStored(this.record(id));
    const application = applyResolvedProjectPreset(current, preset, allowPartial);
    return {
      preset,
      candidate: application.project,
      compatibility: application.compatibility,
      partial: application.partial
    };
  }

  async rename(id: string, name: string): Promise<ProjectPresetLibraryRecord> {
    await this.initialize();
    const stored = this.record(id);
    const document = await this.loadStored(stored, false);
    const updated = validateProjectPreset({
      ...document,
      metadata: {
        ...document.metadata,
        name: name.trim(),
        modifiedAt: new Date().toISOString()
      }
    });
    await atomicWriteJson(
      this.filePath(stored),
      `${JSON.stringify(updated, null, 2)}\n`
    );
    return (await this.list()).find((record) => record.id === id)!;
  }

  async duplicate(id: string): Promise<ProjectPresetLibraryRecord> {
    await this.initialize();
    const source = this.record(id);
    const document = await this.loadStored(source, false);
    const now = new Date().toISOString();
    const duplicateId = randomUUID();
    const duplicate = validateProjectPreset({
      ...document,
      metadata: {
        ...document.metadata,
        id: duplicateId,
        name: `${document.metadata.name} — copia`,
        createdAt: now,
        modifiedAt: now
      }
    });
    const stored: StoredProjectPresetRecord = {
      id: duplicateId,
      fileName: `${safeFileComponent(duplicate.metadata.name)}-${duplicateId}.avspreset`,
      sourceDirectory: source.sourceDirectory,
      assetPaths: { ...source.assetPaths }
    };
    await atomicWriteJson(
      this.filePath(stored),
      `${JSON.stringify(duplicate, null, 2)}\n`
    );
    this.index.records.push(stored);
    await this.persist();
    return (await this.list()).find((record) => record.id === duplicateId)!;
  }

  async delete(id: string): Promise<void> {
    await this.initialize();
    const stored = this.record(id);
    this.index.records = this.index.records.filter((record) => record.id !== id);
    await this.persist();
    await rm(this.filePath(stored), { force: true });
  }

  async export(id: string, destination: string): Promise<void> {
    await this.initialize();
    const document = await this.loadStored(this.record(id), false);
    if (path.extname(destination).toLowerCase() !== ".avspreset") {
      destination += ".avspreset";
    }
    await atomicWriteJson(destination, `${JSON.stringify(document, null, 2)}\n`);
  }

  async verifyLibrary(): Promise<{
    version: string;
    total: number;
    invalidFiles: string[];
  }> {
    await this.initialize();
    const invalidFiles: string[] = [];
    const known = new Set(this.index.records.map((record) => record.fileName));
    for (const entry of await readdir(this.presetsDirectory, {
      withFileTypes: true
    })) {
      if (
        entry.isFile() &&
        entry.name.toLowerCase().endsWith(".avspreset") &&
        !known.has(entry.name)
      ) {
        invalidFiles.push(entry.name);
      }
    }
    return {
      version: PROJECT_PRESET_VERSION,
      total: this.index.records.length,
      invalidFiles
    };
  }
}

export { parseProjectPreset, decodeStrictUtf8 };
