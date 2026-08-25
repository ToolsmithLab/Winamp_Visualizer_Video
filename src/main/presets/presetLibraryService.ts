import { randomUUID } from "node:crypto";
import {
  access,
  copyFile,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile
} from "node:fs/promises";
import path from "node:path";
import type {
  ExternalPresetFolder,
  PresetLibraryQuery,
  PresetLibraryState,
  PresetMetadataUpdate,
  PresetRecord
} from "../../shared/presets";
import { sha256File, validateRegularAsset } from "./presetSecurity";

const emptyState = (): PresetLibraryState => ({
  schema: 1,
  presets: [],
  externalFolders: [],
  updatedAt: new Date().toISOString()
});

export class PresetLibraryService {
  readonly libraryRoot: string;
  readonly assetsRoot: string;
  readonly stagingRoot: string;
  readonly thumbnailsRoot: string;
  private readonly catalogPath: string;
  private readonly backupPath: string;
  private readonly trashRoot: string;
  private stateValue = emptyState();
  private initialized = false;

  constructor(root: string) {
    this.libraryRoot = path.resolve(root);
    this.assetsRoot = path.join(this.libraryRoot, "presets");
    this.stagingRoot = path.join(this.libraryRoot, "staging");
    this.thumbnailsRoot = path.join(this.libraryRoot, "thumbnails");
    this.trashRoot = path.join(this.libraryRoot, "trash");
    this.catalogPath = path.join(this.libraryRoot, "catalog.json");
    this.backupPath = path.join(this.libraryRoot, "catalog.backup.json");
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    await Promise.all([
      mkdir(this.assetsRoot, { recursive: true }),
      mkdir(this.stagingRoot, { recursive: true }),
      mkdir(this.thumbnailsRoot, { recursive: true }),
      mkdir(this.trashRoot, { recursive: true })
    ]);
    this.stateValue = await this.loadCatalog();
    await this.refreshMissingState(false);
    this.initialized = true;
  }

  get state(): PresetLibraryState {
    return structuredClone(this.stateValue);
  }

  async ensureBundled(presetPath: string): Promise<void> {
    await this.initialize();
    const hash = await sha256File(presetPath);
    const existing = this.stateValue.presets.find((preset) => preset.id === "bundled-audio-wave");
    const now = new Date().toISOString();
    const bundled: PresetRecord = {
      id: "bundled-audio-wave",
      name: path.basename(presetPath, ".milk"),
      author: "projectM Team",
      path: presetPath,
      origin: {
        kind: "bundled",
        sourcePath: presetPath,
        label: "Incluso nell'applicazione"
      },
      importedAt: existing?.importedAt ?? now,
      updatedAt: now,
      hash,
      status: "valid",
      license: "LGPL-2.1-or-later",
      licenseVerified: true,
      textures: [],
      missingTextures: [],
      compatibility: "projectM-4.1.6",
      favorite: existing?.favorite ?? false,
      quarantined: false,
      quarantineReason: "",
      errorReport: [],
      thumbnailPath: existing?.thumbnailPath ?? null
    };
    if (existing) Object.assign(existing, bundled);
    else this.stateValue.presets.unshift(bundled);
    await this.persist();
  }

  list(query: PresetLibraryQuery = {}): PresetRecord[] {
    const search = (query.search ?? "").trim().toLocaleLowerCase("it");
    const direction = query.direction === "desc" ? -1 : 1;
    const sort = query.sort ?? "name";
    return this.stateValue.presets
      .filter((preset) => {
        if (query.status && query.status !== "all" && preset.status !== query.status) return false;
        if (query.favoritesOnly && !preset.favorite) return false;
        if (query.license === "verified" && !preset.licenseVerified) return false;
        if (query.license === "unverified" && preset.licenseVerified) return false;
        if (!search) return true;
        return [
          preset.name,
          preset.author ?? "",
          preset.path,
          preset.origin.label,
          preset.license,
          preset.hash
        ].some((value) => value.toLocaleLowerCase("it").includes(search));
      })
      .sort((left, right) => {
        const a = sort === "importedAt" ? left.importedAt :
          sort === "status" ? left.status :
          sort === "author" ? left.author ?? "" : left.name;
        const b = sort === "importedAt" ? right.importedAt :
          sort === "status" ? right.status :
          sort === "author" ? right.author ?? "" : right.name;
        return a.localeCompare(b, "it", { sensitivity: "base" }) * direction;
      })
      .map((preset) => structuredClone(preset));
  }

  findById(id: string): PresetRecord | undefined {
    const preset = this.stateValue.presets.find((candidate) => candidate.id === id);
    return preset ? structuredClone(preset) : undefined;
  }

  findByHash(hash: string): PresetRecord | undefined {
    const preset = this.stateValue.presets.find((candidate) => candidate.hash === hash);
    return preset ? structuredClone(preset) : undefined;
  }

  async add(record: PresetRecord): Promise<{ record: PresetRecord; duplicate: boolean }> {
    await this.initialize();
    const duplicate = this.stateValue.presets.find((preset) => preset.hash === record.hash);
    if (duplicate) return { record: structuredClone(duplicate), duplicate: true };
    this.stateValue.presets.push(structuredClone(record));
    await this.persist();
    return { record: structuredClone(record), duplicate: false };
  }

  async addExternalFolder(folder: ExternalPresetFolder): Promise<ExternalPresetFolder> {
    await this.initialize();
    const existing = this.stateValue.externalFolders.find(
      (candidate) => candidate.path.toLocaleLowerCase() === folder.path.toLocaleLowerCase()
    );
    if (existing) return structuredClone(existing);
    this.stateValue.externalFolders.push(structuredClone(folder));
    await this.persist();
    return structuredClone(folder);
  }

  async setFavorite(id: string, favorite: boolean): Promise<PresetRecord> {
    const record = this.requireRecord(id);
    record.favorite = favorite;
    record.updatedAt = new Date().toISOString();
    await this.persist();
    return structuredClone(record);
  }

  async updateMetadata(update: PresetMetadataUpdate): Promise<PresetRecord> {
    const record = this.requireRecord(update.id);
    if (update.name !== undefined) record.name = update.name.trim() || record.name;
    if (update.author !== undefined) record.author = update.author?.trim() || null;
    if (update.license !== undefined) record.license = update.license.trim() || "Licenza non verificata";
    if (update.licenseVerified !== undefined) record.licenseVerified = update.licenseVerified;
    record.updatedAt = new Date().toISOString();
    await this.persist();
    return structuredClone(record);
  }

  async markCatalogRecords(
    ids: readonly string[],
    ownedIds: ReadonlySet<string>,
    metadata: {
      packageId: string;
      packageVersion: string;
      archiveSha256: string;
      author: string;
      license: string;
      sourceUrl: string;
      label: string;
    }
  ): Promise<PresetRecord[]> {
    const updated: PresetRecord[] = [];
    const now = new Date().toISOString();
    for (const id of ids) {
      const record = this.requireRecord(id);
      record.author ||= metadata.author;
      record.license = metadata.license;
      record.licenseVerified = true;
      record.catalogPackage = {
        id: metadata.packageId,
        version: metadata.packageVersion,
        archiveSha256: metadata.archiveSha256
      };
      if (ownedIds.has(id)) {
        record.origin = {
          kind: "catalog",
          sourcePath: metadata.sourceUrl,
          label: metadata.label
        };
      }
      record.updatedAt = now;
      updated.push(structuredClone(record));
    }
    await this.persist();
    return updated;
  }

  async clearCatalogAssociation(
    ids: readonly string[],
    packageId: string
  ): Promise<void> {
    let changed = false;
    for (const id of ids) {
      const record = this.stateValue.presets.find((preset) => preset.id === id);
      if (record?.catalogPackage?.id === packageId) {
        delete record.catalogPackage;
        record.updatedAt = new Date().toISOString();
        changed = true;
      }
    }
    if (changed) await this.persist();
  }

  async quarantine(id: string, reason: string): Promise<PresetRecord> {
    const record = this.requireRecord(id);
    record.quarantined = true;
    record.status = "quarantined";
    record.quarantineReason = reason;
    record.errorReport = [...record.errorReport, reason].slice(-20);
    record.updatedAt = new Date().toISOString();
    await this.persist();
    return structuredClone(record);
  }

  async clearQuarantine(id: string): Promise<PresetRecord> {
    const record = this.requireRecord(id);
    record.quarantined = false;
    record.quarantineReason = "";
    record.status = record.missingTextures.length ? "warning" : "valid";
    record.updatedAt = new Date().toISOString();
    await this.persist();
    return structuredClone(record);
  }

  async relink(id: string, candidatePath: string): Promise<PresetRecord> {
    const record = this.requireRecord(id);
    await validateRegularAsset(candidatePath, "milk");
    const hash = await sha256File(candidatePath);
    if (hash !== record.hash) {
      throw new Error("Il file scelto non corrisponde allo SHA-256 del preset mancante.");
    }
    record.path = path.resolve(candidatePath);
    record.origin.sourcePath = path.resolve(candidatePath);
    record.status = record.missingTextures.length ? "warning" : "valid";
    record.quarantined = false;
    record.quarantineReason = "";
    record.updatedAt = new Date().toISOString();
    await this.persist();
    return structuredClone(record);
  }

  async remove(id: string): Promise<void> {
    const index = this.stateValue.presets.findIndex((preset) => preset.id === id);
    if (index < 0) return;
    const [record] = this.stateValue.presets.splice(index, 1);
    if (record.origin.kind === "bundled") {
      this.stateValue.presets.splice(index, 0, record);
      throw new Error("Il preset incluso non può essere eliminato.");
    }
    if (
      record.origin.kind === "internal" ||
      record.origin.kind === "zip" ||
      record.origin.kind === "catalog"
    ) {
      const assetDir = path.dirname(record.path);
      const relation = path.relative(this.assetsRoot, assetDir);
      if (relation && !relation.startsWith("..") && !path.isAbsolute(relation)) {
        const destination = path.join(
          this.trashRoot,
          `${Date.now()}-${record.id.replace(/[^a-z0-9_-]/gi, "_")}`
        );
        try {
          await rename(assetDir, destination);
        } catch {
          // Catalog removal still succeeds if antivirus locked the recoverable move.
        }
      }
    }
    await this.persist();
  }

  async refreshMissingState(persist = true): Promise<void> {
    for (const preset of this.stateValue.presets) {
      try {
        await access(preset.path);
        if (preset.status === "missing") {
          preset.status = preset.missingTextures.length ? "warning" : "valid";
        }
      } catch {
        preset.status = "missing";
      }
    }
    for (const folder of this.stateValue.externalFolders) {
      try {
        folder.missing = !(await stat(folder.path)).isDirectory();
      } catch {
        folder.missing = true;
      }
    }
    if (persist) await this.persist();
  }

  async readThumbnail(id: string): Promise<Uint8Array | null> {
    const record = this.requireRecord(id);
    if (!record.thumbnailPath) return null;
    try {
      return new Uint8Array(await readFile(record.thumbnailPath));
    } catch {
      return null;
    }
  }

  private requireRecord(id: string): PresetRecord {
    const record = this.stateValue.presets.find((preset) => preset.id === id);
    if (!record) throw new Error(`Preset non trovato: ${id}`);
    return record;
  }

  private async loadCatalog(): Promise<PresetLibraryState> {
    for (const candidate of [this.catalogPath, this.backupPath]) {
      try {
        const parsed = JSON.parse(await readFile(candidate, "utf8")) as PresetLibraryState;
        if (parsed.schema === 1 && Array.isArray(parsed.presets) && Array.isArray(parsed.externalFolders)) {
          return parsed;
        }
      } catch {
        // Try the backup, then initialize an empty catalog.
      }
    }
    return emptyState();
  }

  private async persist(): Promise<void> {
    this.stateValue.updatedAt = new Date().toISOString();
    const temporary = path.join(this.libraryRoot, `catalog-${randomUUID()}.tmp`);
    const payload = `${JSON.stringify(this.stateValue, null, 2)}\n`;
    await writeFile(temporary, payload, { encoding: "utf8", mode: 0o600 });
    try {
      await copyFile(this.catalogPath, this.backupPath);
    } catch {
      // No previous catalog on first write.
    }
    try {
      await rename(temporary, this.catalogPath);
    } catch {
      await rm(this.catalogPath, { force: true });
      await rename(temporary, this.catalogPath);
    }
  }
}
