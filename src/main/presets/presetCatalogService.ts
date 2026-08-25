import { createHash, randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import {
  access,
  copyFile,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile
} from "node:fs/promises";
import https from "node:https";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Transform, type TransformCallback } from "node:stream";
import type {
  CatalogActionResult,
  CatalogPackageView,
  PresetCatalogView,
  VerifiedPresetCatalogManifest,
  VerifiedPresetPackage
} from "../../shared/presetCatalog";
import { PresetImportService } from "./presetImportService";
import { PresetLibraryService } from "./presetLibraryService";
import {
  PRESET_LIMITS,
  assertSafeRelativePath,
  safeJoin,
  sha256File
} from "./presetSecurity";
import { extractZipSecure } from "./zipSecurity";

interface CatalogInstallation {
  id: string;
  version: string;
  archiveSha256: string;
  installedAt: string;
  presetIds: string[];
  ownedPresetIds: string[];
  integrityVerifiedAt: string | null;
  integrityError: string;
}

interface CatalogInstallationState {
  schema: 1;
  catalogVersion: string;
  packages: CatalogInstallation[];
  updatedAt: string;
}

export interface CatalogDownloadResult {
  bytes: number;
  sha256: string;
}

export type CatalogDownloader = (
  url: string,
  destination: string,
  maximumBytes: number
) => Promise<CatalogDownloadResult>;

const emptyInstallations = (catalogVersion: string): CatalogInstallationState => ({
  schema: 1,
  catalogVersion,
  packages: [],
  updatedAt: new Date().toISOString()
});

function requireHttps(value: string, field: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${field}: URL non valido.`);
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    !parsed.hostname
  ) {
    throw new Error(`${field}: è richiesto un URL HTTPS senza credenziali.`);
  }
  return parsed;
}

function validDate(value: string): boolean {
  return Boolean(value) && Number.isFinite(Date.parse(value));
}

export function validateCatalogManifest(
  input: unknown
): VerifiedPresetCatalogManifest {
  if (!input || typeof input !== "object") {
    throw new Error("Manifest catalogo non valido.");
  }
  const manifest = input as VerifiedPresetCatalogManifest;
  if (
    manifest.schemaVersion !== 1 ||
    !manifest.catalogVersion ||
    !validDate(manifest.generatedAt) ||
    !Array.isArray(manifest.packages) ||
    !Array.isArray(manifest.excluded)
  ) {
    throw new Error("Schema manifest catalogo non supportato.");
  }
  const ids = new Set<string>();
  for (const item of manifest.packages) {
    if (!/^[a-z0-9][a-z0-9._-]{2,80}$/i.test(item.id) || ids.has(item.id)) {
      throw new Error(`ID pacchetto non valido o duplicato: ${item.id}`);
    }
    ids.add(item.id);
    if (
      !item.name ||
      !item.version ||
      !item.license ||
      /non verificata|unknown|unspecified/i.test(item.license) ||
      !Array.isArray(item.authors) ||
      item.authors.length === 0 ||
      item.authors.some((author) => !author.trim()) ||
      !Array.isArray(item.attribution) ||
      !/^[a-f0-9]{64}$/i.test(item.sha256) ||
      !Number.isInteger(item.presetCount) ||
      item.presetCount <= 0 ||
      !Number.isInteger(item.textureCount) ||
      item.textureCount < 0 ||
      !Array.isArray(item.textureInventory) ||
      item.textureInventory.length !== item.textureCount ||
      !item.projectMVersion ||
      !validDate(item.releaseDate) ||
      !validDate(item.verifiedAt) ||
      item.archive?.format !== "zip"
    ) {
      throw new Error(`Metadati incompleti nel pacchetto ${item.id}.`);
    }
    requireHttps(item.sourceUrl, `${item.id}.sourceUrl`);
    requireHttps(item.downloadUrl, `${item.id}.downloadUrl`);
    requireHttps(item.licenseUrl, `${item.id}.licenseUrl`);
    assertSafeRelativePath(item.licenseTextPath);
    assertSafeRelativePath(item.archive.includePrefix);
    for (const texture of item.textureInventory) {
      assertSafeRelativePath(texture.path);
      if (!texture.license) {
        throw new Error(`Licenza texture mancante in ${item.id}.`);
      }
      requireHttps(texture.licenseUrl, `${item.id}.texture.licenseUrl`);
    }
  }
  return structuredClone(manifest);
}

class DownloadGuard extends Transform {
  private readonly hash = createHash("sha256");
  bytes = 0;

  constructor(private readonly maximumBytes: number) {
    super();
  }

  override _transform(
    chunk: Buffer,
    _encoding: BufferEncoding,
    callback: TransformCallback
  ): void {
    this.bytes += chunk.length;
    if (this.bytes > this.maximumBytes) {
      callback(new Error("Download oltre il limite di dimensione consentito."));
      return;
    }
    this.hash.update(chunk);
    callback(null, chunk);
  }

  digest(): string {
    return this.hash.digest("hex");
  }
}

async function downloadResponse(
  url: URL,
  destination: string,
  maximumBytes: number,
  redirects: number
): Promise<CatalogDownloadResult> {
  if (redirects > 5) throw new Error("Troppi reindirizzamenti durante il download.");
  return await new Promise<CatalogDownloadResult>((resolve, reject) => {
    const request = https.get(
      url,
      {
        headers: {
          "User-Agent": "Audio-Visualizer-Studio/0.2 preset-catalog",
          Accept: "application/zip, application/octet-stream"
        },
        timeout: 30_000
      },
      (response) => {
        const status = response.statusCode ?? 0;
        if (status >= 300 && status < 400 && response.headers.location) {
          response.resume();
          try {
            const redirected = new URL(response.headers.location, url);
            requireHttps(redirected.href, "redirect");
            resolve(
              downloadResponse(
                redirected,
                destination,
                maximumBytes,
                redirects + 1
              )
            );
          } catch (error) {
            reject(error);
          }
          return;
        }
        if (status !== 200) {
          response.resume();
          reject(new Error(`Download fallito con stato HTTP ${status}.`));
          return;
        }
        const declaredLength = Number(response.headers["content-length"] ?? 0);
        if (declaredLength > maximumBytes) {
          response.resume();
          reject(new Error("Il pacchetto supera il limite di download."));
          return;
        }
        const guard = new DownloadGuard(maximumBytes);
        const output = createWriteStream(destination, {
          flags: "wx",
          mode: 0o600
        });
        pipeline(response, guard, output)
          .then(() =>
            resolve({
              bytes: guard.bytes,
              sha256: guard.digest()
            })
          )
          .catch(reject);
      }
    );
    request.once("timeout", () => {
      request.destroy(new Error("Timeout durante il download del pacchetto."));
    });
    request.once("error", reject);
  });
}

export const downloadCatalogPackage: CatalogDownloader = (
  url,
  destination,
  maximumBytes
) => downloadResponse(requireHttps(url, "downloadUrl"), destination, maximumBytes, 0);

export class PresetCatalogService {
  private manifest: VerifiedPresetCatalogManifest | null = null;
  private state: CatalogInstallationState | null = null;
  private initialized = false;
  private readonly statePath: string;
  private readonly backupPath: string;
  private readonly stagingRoot: string;

  constructor(
    private readonly manifestPath: string,
    private readonly licenseRoot: string,
    private readonly catalogRoot: string,
    private readonly library: PresetLibraryService,
    private readonly importer: PresetImportService,
    private readonly downloader: CatalogDownloader = downloadCatalogPackage
  ) {
    this.statePath = path.join(catalogRoot, "installations.json");
    this.backupPath = path.join(catalogRoot, "installations.backup.json");
    this.stagingRoot = path.join(catalogRoot, "staging");
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    const parsed = JSON.parse(await readFile(this.manifestPath, "utf8")) as unknown;
    this.manifest = validateCatalogManifest(parsed);
    await mkdir(this.stagingRoot, { recursive: true });
    await this.library.initialize();
    for (const item of this.manifest.packages) {
      await access(safeJoin(this.licenseRoot, item.licenseTextPath));
    }
    this.state = await this.loadState();
    this.state.catalogVersion = this.manifest.catalogVersion;
    this.initialized = true;
  }

  async list(): Promise<PresetCatalogView> {
    await this.initialize();
    return {
      catalogVersion: this.requireManifest().catalogVersion,
      generatedAt: this.requireManifest().generatedAt,
      packages: this.requireManifest().packages.map((item) => this.packageView(item))
    };
  }

  async licenseText(id: string): Promise<string> {
    await this.initialize();
    const item = this.requirePackage(id);
    return readFile(safeJoin(this.licenseRoot, item.licenseTextPath), "utf8");
  }

  async install(id: string): Promise<CatalogActionResult> {
    await this.initialize();
    const item = this.requirePackage(id);
    const operationRoot = path.join(
      this.stagingRoot,
      `${Date.now()}-${randomUUID()}`
    );
    const archivePath = path.join(operationRoot, "package.zip");
    const extractedRoot = path.join(operationRoot, "extracted");
    const beforeIds = new Set(this.library.list().map((preset) => preset.id));
    const addedIds = new Set<string>();

    await mkdir(extractedRoot, { recursive: true });
    try {
      const download = await this.downloader(
        item.downloadUrl,
        archivePath,
        PRESET_LIMITS.maxArchiveBytes
      );
      if (download.sha256.toLowerCase() !== item.sha256.toLowerCase()) {
        throw new Error(
          `SHA-256 non valido: atteso ${item.sha256}, ricevuto ${download.sha256}.`
        );
      }
      const extracted = await extractZipSecure(archivePath, extractedRoot, {
        includePrefix: item.archive.includePrefix
      });
      const presetAssets = extracted.filter((asset) => asset.kind === "milk");
      const textureAssets = extracted.filter((asset) => asset.kind === "texture");
      if (
        presetAssets.length !== item.presetCount ||
        textureAssets.length !== item.textureCount
      ) {
        throw new Error(
          `Inventario non valido: ${presetAssets.length}/${item.presetCount} preset e ` +
          `${textureAssets.length}/${item.textureCount} texture.`
        );
      }

      const report = await this.importer.importFolder(extractedRoot, "copy");
      for (const preset of report.imported) {
        if (!beforeIds.has(preset.id)) addedIds.add(preset.id);
      }
      const records = [...report.imported, ...report.duplicates];
      const uniqueRecords = new Map(records.map((record) => [record.id, record]));
      if (
        report.quarantined.length ||
        report.issues.some((issue) => issue.fatal) ||
        uniqueRecords.size !== item.presetCount
      ) {
        const detail = report.issues.map((issue) => issue.message).join(" ");
        throw new Error(
          `Validazione projectM incompleta: ${uniqueRecords.size}/${item.presetCount}. ${detail}`
        );
      }
      for (const record of uniqueRecords.values()) {
        if (
          record.compatibility !== `projectM-${item.projectMVersion}` ||
          record.quarantined ||
          record.status === "incompatible"
        ) {
          throw new Error(`Preset non compatibile con projectM ${item.projectMVersion}: ${record.name}`);
        }
      }

      const previous = this.installation(id);
      const allIds = [...uniqueRecords.keys()];
      const ownedIds = new Set(addedIds);
      for (const previousOwned of previous?.ownedPresetIds ?? []) {
        if (allIds.includes(previousOwned)) ownedIds.add(previousOwned);
      }
      await this.library.markCatalogRecords(allIds, ownedIds, {
        packageId: item.id,
        packageVersion: item.version,
        archiveSha256: item.sha256,
        author: item.authors.join(", "),
        license: item.license,
        sourceUrl: item.sourceUrl,
        label: `Catalogo ufficiale · ${item.name} ${item.version}`
      });

      const now = new Date().toISOString();
      const installation: CatalogInstallation = {
        id: item.id,
        version: item.version,
        archiveSha256: item.sha256,
        installedAt: now,
        presetIds: allIds,
        ownedPresetIds: [...ownedIds],
        integrityVerifiedAt: now,
        integrityError: ""
      };
      this.replaceInstallation(installation);
      await this.persist();

      for (const stale of previous?.ownedPresetIds ?? []) {
        if (!allIds.includes(stale)) await this.library.remove(stale);
      }
      return {
        package: this.packageView(item),
        importedPresets: addedIds.size,
        duplicatePresets: item.presetCount - addedIds.size,
        message: `${item.name} ${item.version} installato e verificato.`
      };
    } catch (error) {
      for (const added of addedIds) {
        await this.library.remove(added).catch(() => undefined);
      }
      throw error;
    } finally {
      await rm(operationRoot, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  async uninstall(id: string): Promise<CatalogActionResult> {
    await this.initialize();
    const item = this.requirePackage(id);
    const installed = this.installation(id);
    if (!installed) throw new Error("Il pacchetto non è installato.");
    for (const presetId of installed.ownedPresetIds) {
      await this.library.remove(presetId);
    }
    const linked = installed.presetIds.filter(
      (presetId) => !installed.ownedPresetIds.includes(presetId)
    );
    await this.library.clearCatalogAssociation(linked, id);
    this.requireState().packages = this.requireState().packages.filter(
      (entry) => entry.id !== id
    );
    await this.persist();
    return {
      package: this.packageView(item),
      importedPresets: 0,
      duplicatePresets: 0,
      message: `${item.name} disinstallato. I preset personali preesistenti sono stati conservati.`
    };
  }

  async verify(id: string): Promise<CatalogActionResult> {
    await this.initialize();
    const item = this.requirePackage(id);
    const installed = this.installation(id);
    if (!installed) throw new Error("Il pacchetto non è installato.");
    let error = "";
    try {
      if (
        installed.version !== item.version ||
        installed.archiveSha256 !== item.sha256 ||
        installed.presetIds.length !== item.presetCount
      ) {
        throw new Error("Versione, hash archivio o inventario installato non corrispondono.");
      }
      for (const id of installed.presetIds) {
        const record = this.library.findById(id);
        if (!record) throw new Error(`Preset installato mancante: ${id}`);
        const actual = await sha256File(record.path);
        if (actual !== record.hash) {
          throw new Error(`Integrità file non valida: ${record.name}`);
        }
      }
      installed.integrityVerifiedAt = new Date().toISOString();
      installed.integrityError = "";
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught);
      installed.integrityError = error;
      installed.integrityVerifiedAt = new Date().toISOString();
    }
    await this.persist();
    if (error) throw new Error(error);
    return {
      package: this.packageView(item),
      importedPresets: 0,
      duplicatePresets: 0,
      message: `Integrità verificata per ${item.name}.`
    };
  }

  private packageView(item: VerifiedPresetPackage): CatalogPackageView {
    const installed = this.installation(item.id);
    const state = !installed
      ? "not-installed"
      : installed.integrityError
        ? "integrity-error"
        : installed.version !== item.version ||
            installed.archiveSha256 !== item.sha256
          ? "update-available"
          : "installed";
    return {
      ...structuredClone(item),
      state,
      installedVersion: installed?.version ?? null,
      installedAt: installed?.installedAt ?? null,
      integrityVerifiedAt: installed?.integrityVerifiedAt ?? null,
      integrityError: installed?.integrityError ?? ""
    };
  }

  private requireManifest(): VerifiedPresetCatalogManifest {
    if (!this.manifest) throw new Error("Catalogo non inizializzato.");
    return this.manifest;
  }

  private requireState(): CatalogInstallationState {
    if (!this.state) throw new Error("Stato catalogo non inizializzato.");
    return this.state;
  }

  private requirePackage(id: string): VerifiedPresetPackage {
    const item = this.requireManifest().packages.find((entry) => entry.id === id);
    if (!item) throw new Error(`Pacchetto non presente nel catalogo verificato: ${id}`);
    return item;
  }

  private installation(id: string): CatalogInstallation | undefined {
    return this.state?.packages.find((entry) => entry.id === id);
  }

  private replaceInstallation(value: CatalogInstallation): void {
    const state = this.requireState();
    const index = state.packages.findIndex((entry) => entry.id === value.id);
    if (index >= 0) state.packages[index] = value;
    else state.packages.push(value);
  }

  private async loadState(): Promise<CatalogInstallationState> {
    for (const candidate of [this.statePath, this.backupPath]) {
      try {
        const parsed = JSON.parse(await readFile(candidate, "utf8")) as CatalogInstallationState;
        if (parsed.schema === 1 && Array.isArray(parsed.packages)) return parsed;
      } catch {
        // Try backup, then start from an empty installation state.
      }
    }
    return emptyInstallations(this.requireManifest().catalogVersion);
  }

  private async persist(): Promise<void> {
    const state = this.requireState();
    state.updatedAt = new Date().toISOString();
    const temporary = path.join(this.catalogRoot, `installations-${randomUUID()}.tmp`);
    await mkdir(this.catalogRoot, { recursive: true });
    await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600
    });
    try {
      await copyFile(this.statePath, this.backupPath);
    } catch {
      // First catalog write has no previous state.
    }
    try {
      await rename(temporary, this.statePath);
    } catch {
      await rm(this.statePath, { force: true });
      await rename(temporary, this.statePath);
    }
  }
}
