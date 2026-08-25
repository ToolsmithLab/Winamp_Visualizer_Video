import { createHash, randomUUID } from "node:crypto";
import {
  copyFile,
  lstat,
  mkdir,
  open,
  readdir,
  readFile,
  rm,
  stat,
  writeFile
} from "node:fs/promises";
import path from "node:path";
import type {
  ExternalPresetFolder,
  PresetImportIssue,
  PresetImportMode,
  PresetImportReport,
  PresetRecord,
  PresetTextureInfo,
  PresetValidationResult
} from "../../shared/presets";
import { PresetLibraryService } from "./presetLibraryService";
import {
  PRESET_LIMITS,
  PresetSecurityError,
  assertNoSymlinkDirectory,
  assertSafeRelativePath,
  classifyAsset,
  safeJoin,
  sha256File,
  textureExtensions,
  validateRegularAsset,
  type SafeAssetKind
} from "./presetSecurity";
import {
  extractZipSecure,
  type ExtractedPresetAsset
} from "./zipSecurity";

interface SourceAsset {
  path: string;
  relativePath: string;
  kind: Exclude<SafeAssetKind, "ignored">;
  size: number;
}

export interface PresetRuntimeValidation extends PresetValidationResult {
  thumbnailBmp?: Uint8Array;
}

export type PresetRuntimeValidator = (
  presetPath: string
) => Promise<PresetRuntimeValidation>;

interface ParsedMetadata {
  name: string;
  author: string | null;
  license: string;
  textureReferences: string[];
}

const textDecoder = new TextDecoder("utf-8", { fatal: false });

function issue(error: unknown, target = ""): PresetImportIssue {
  if (error instanceof PresetSecurityError) {
    return {
      path: error.target || target,
      code: error.code,
      message: error.message,
      fatal: true
    };
  }
  return {
    path: target,
    code: "IMPORT_ERROR",
    message: error instanceof Error ? error.message : String(error),
    fatal: true
  };
}

export function parsePresetMetadata(
  contents: string,
  filename: string
): ParsedMetadata {
  const authorMatch = contents.match(
    /^\s*(?:\/\/|;|#)\s*(?:author|autore|by)\s*:\s*(.+?)\s*$/im
  );
  const licenseMatch = contents.match(
    /^\s*(?:\/\/|;|#)\s*(?:license|licence|licenza)\s*:\s*(.+?)\s*$/im
  );
  const references = new Set<string>();
  const texturePattern =
    /(["']?)([^"'=\s,;()]+\.(?:png|jpe?g|webp|bmp|tga))\1/gi;
  for (const match of contents.matchAll(texturePattern)) {
    const reference = match[2]?.replace(/\\/g, "/");
    if (reference) references.add(reference);
  }
  return {
    name: path.basename(filename, path.extname(filename)),
    author: authorMatch?.[1]?.trim() || null,
    license: licenseMatch?.[1]?.trim() || "Licenza non verificata",
    textureReferences: [...references]
  };
}

function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function findTextures(
  preset: SourceAsset,
  assets: SourceAsset[],
  references: string[]
): { textures: PresetTextureInfo[]; missing: string[] } {
  const textureAssets = assets.filter((asset) => asset.kind === "texture");
  const presetDirectory = path.dirname(preset.relativePath).replace(/\\/g, "/");
  const textures: PresetTextureInfo[] = [];
  const missing: string[] = [];
  for (const reference of references) {
    const normalizedReference = reference.replace(/\\/g, "/");
    const expected = path.posix
      .normalize(path.posix.join(presetDirectory === "." ? "" : presetDirectory, normalizedReference))
      .toLocaleLowerCase();
    const found =
      textureAssets.find(
        (asset) => asset.relativePath.replace(/\\/g, "/").toLocaleLowerCase() === expected
      ) ??
      textureAssets.find(
        (asset) =>
          path.basename(asset.relativePath).toLocaleLowerCase() ===
          path.basename(normalizedReference).toLocaleLowerCase()
      );
    if (!found) {
      missing.push(reference);
      textures.push({ reference, path: null, hash: null, missing: true });
    } else {
      textures.push({
        reference,
        path: found.path,
        hash: null,
        missing: false
      });
    }
  }
  return { textures, missing };
}

export class PresetImportService {
  constructor(
    private readonly library: PresetLibraryService,
    private readonly validateRuntime: PresetRuntimeValidator
  ) {}

  async importFiles(
    filePaths: string[],
    mode: PresetImportMode
  ): Promise<PresetImportReport> {
    return this.runImport(async (operationRoot) => {
      const assets: SourceAsset[] = [];
      for (const [index, filePath] of filePaths.entries()) {
        await validateRegularAsset(filePath, "milk");
        const info = await stat(filePath);
        const relativePath = assertSafeRelativePath(
          path.join(`selection-${index + 1}`, path.basename(filePath))
        );
        if (mode === "copy") {
          const target = safeJoin(operationRoot, relativePath);
          await mkdir(path.dirname(target), { recursive: true });
          await copyFile(filePath, target, 1);
          assets.push({ path: target, relativePath, kind: "milk", size: info.size });
        } else {
          assets.push({
            path: path.resolve(filePath),
            relativePath,
            kind: "milk",
            size: info.size
          });
        }
      }
      return this.promoteAssets(assets, {
        mode,
        sourcePath: filePaths.length === 1 ? filePaths[0] : path.dirname(filePaths[0] ?? ""),
        label: mode === "copy" ? "File copiato nella libreria" : "File esterno collegato",
        originKind: mode === "copy" ? "internal" : "external-file"
      });
    });
  }

  async importFolder(
    folderPath: string,
    mode: PresetImportMode
  ): Promise<PresetImportReport> {
    return this.runImport(async (operationRoot) => {
      await assertNoSymlinkDirectory(folderPath);
      const scanned = await this.scanDirectory(folderPath);
      const assets =
        mode === "copy"
          ? await this.copyAssets(scanned.assets, operationRoot)
          : scanned.assets;
      const report = await this.promoteAssets(assets, {
        mode,
        sourcePath: path.resolve(folderPath),
        label:
          mode === "copy"
            ? `Cartella copiata: ${path.basename(folderPath)}`
            : `Cartella esterna: ${path.basename(folderPath)}`,
        originKind: mode === "copy" ? "internal" : "external-folder"
      });
      report.issues.unshift(...scanned.issues);
      if (mode === "link") {
        const externalFolder: ExternalPresetFolder = {
          id: `folder-${hashText(path.resolve(folderPath).toLocaleLowerCase()).slice(0, 24)}`,
          path: path.resolve(folderPath),
          linkedAt: new Date().toISOString(),
          recursive: true,
          missing: false
        };
        report.externalFolder = await this.library.addExternalFolder(externalFolder);
      }
      return report;
    });
  }

  async importZip(zipPath: string): Promise<PresetImportReport> {
    return this.runImport(async (operationRoot) => {
      await this.assertRealZip(zipPath);
      const extracted = await extractZipSecure(zipPath, operationRoot);
      const assets: SourceAsset[] = extracted.map((asset: ExtractedPresetAsset) => ({
        ...asset
      }));
      return this.promoteAssets(assets, {
        mode: "copy",
        sourcePath: path.resolve(zipPath),
        label: `Archivio ZIP: ${path.basename(zipPath)}`,
        originKind: "zip"
      });
    });
  }

  private async runImport(
    operation: (
      operationRoot: string
    ) => Promise<Omit<PresetImportReport, "operationId">>
  ): Promise<PresetImportReport> {
    await this.library.initialize();
    const operationId = randomUUID();
    const operationRoot = path.join(this.library.stagingRoot, operationId);
    await mkdir(operationRoot, { recursive: false, mode: 0o700 });
    try {
      const report = await operation(operationRoot);
      return { ...report, operationId };
    } catch (error) {
      return {
        operationId,
        imported: [],
        duplicates: [],
        quarantined: [],
        issues: [issue(error)]
      };
    } finally {
      const relation = path.relative(this.library.stagingRoot, operationRoot);
      if (relation && !relation.startsWith("..") && !path.isAbsolute(relation)) {
        await rm(operationRoot, { recursive: true, force: true }).catch(() => undefined);
      }
    }
  }

  private async scanDirectory(
    root: string
  ): Promise<{ assets: SourceAsset[]; issues: PresetImportIssue[] }> {
    const assets: SourceAsset[] = [];
    const issues: PresetImportIssue[] = [];
    let totalBytes = 0;
    const visit = async (directory: string, relativeDirectory: string): Promise<void> => {
      await assertNoSymlinkDirectory(directory);
      const entries = await readdir(directory, { withFileTypes: true });
      for (const entry of entries) {
        const relativePath = assertSafeRelativePath(
          path.join(relativeDirectory, entry.name)
        );
        const sourcePath = path.join(directory, entry.name);
        const entryStat = await lstat(sourcePath);
        if (entryStat.isSymbolicLink()) {
          throw new PresetSecurityError("SYMLINK", `Symlink rifiutato: ${sourcePath}`, sourcePath);
        }
        if (entryStat.isDirectory()) {
          await visit(sourcePath, relativePath);
          continue;
        }
        if (!entryStat.isFile()) {
          throw new PresetSecurityError("NOT_REGULAR_FILE", `File non regolare: ${sourcePath}`, sourcePath);
        }
        const kind = classifyAsset(sourcePath);
        if (kind === "ignored") continue;
        try {
          await validateRegularAsset(sourcePath, kind);
        } catch (error) {
          if (
            error instanceof PresetSecurityError &&
            ["INVALID_MILK_TYPE", "INVALID_TEXTURE_TYPE", "INVALID_TEXT_TYPE"].includes(
              error.code
            )
          ) {
            issues.push({ ...issue(error, sourcePath), fatal: false });
            continue;
          }
          throw error;
        }
        assets.push({
          path: sourcePath,
          relativePath,
          kind,
          size: entryStat.size
        });
        totalBytes += entryStat.size;
        if (assets.length > PRESET_LIMITS.maxFiles) {
          throw new PresetSecurityError("FILE_LIMIT", "Cartella con troppi file.", root);
        }
        if (totalBytes > PRESET_LIMITS.maxTotalBytes) {
          throw new PresetSecurityError("TOTAL_SIZE_LIMIT", "Cartella oltre 256 MiB.", root);
        }
      }
    };
    await visit(path.resolve(root), "");
    return { assets, issues };
  }

  private async copyAssets(
    assets: SourceAsset[],
    destination: string
  ): Promise<SourceAsset[]> {
    const copied: SourceAsset[] = [];
    for (const asset of assets) {
      const target = safeJoin(destination, asset.relativePath);
      await mkdir(path.dirname(target), { recursive: true });
      await copyFile(asset.path, target, 1);
      copied.push({ ...asset, path: target });
    }
    return copied;
  }

  private async promoteAssets(
    assets: SourceAsset[],
    origin: {
      mode: PresetImportMode;
      sourcePath: string;
      label: string;
      originKind: "internal" | "external-file" | "external-folder" | "zip";
    }
  ): Promise<Omit<PresetImportReport, "operationId">> {
    const report: Omit<PresetImportReport, "operationId"> = {
      imported: [],
      duplicates: [],
      quarantined: [],
      issues: []
    };
    const presets = assets.filter((asset) => asset.kind === "milk");
    if (!presets.length) {
      throw new PresetSecurityError("NO_PRESETS", "Nessun preset MilkDrop valido trovato.", origin.sourcePath);
    }

    for (const preset of presets) {
      try {
        const hash = await sha256File(preset.path);
        const duplicate = this.library.findByHash(hash);
        if (duplicate) {
          if (origin.mode === "link" && duplicate.status === "missing") {
            const relinked = await this.library.relink(duplicate.id, preset.path);
            report.imported.push(relinked);
          } else {
            report.duplicates.push(duplicate);
          }
          continue;
        }
        const contents = textDecoder.decode(await readFile(preset.path));
        const metadata = parsePresetMetadata(contents, preset.relativePath);
        const textureResult = findTextures(preset, assets, metadata.textureReferences);
        for (const texture of textureResult.textures) {
          if (texture.path) texture.hash = await sha256File(texture.path);
        }

        const validation: PresetRuntimeValidation = await this.validateRuntime(preset.path).catch((error) => ({
          valid: false,
          error: error instanceof Error ? error.message : String(error),
          version: "",
          frameHash: "",
          thumbnailBmp: undefined
        }));
        const id = `preset-${hash.slice(0, 24)}`;
        let finalPresetPath = preset.path;
        let finalTextures = textureResult.textures;
        if (origin.mode === "copy") {
          const destinationRoot = path.join(this.library.assetsRoot, hash);
          await mkdir(destinationRoot, { recursive: true });
          const copied = await this.copyAssets(assets, destinationRoot);
          const finalPreset = copied.find(
            (asset) => asset.relativePath === preset.relativePath
          );
          if (!finalPreset) throw new Error("Preset non promosso nella libreria interna.");
          finalPresetPath = finalPreset.path;
          finalTextures = textureResult.textures.map((texture) => {
            if (!texture.path) return texture;
            const original = assets.find((asset) => asset.path === texture.path);
            const promoted = original
              ? copied.find((asset) => asset.relativePath === original.relativePath)
              : undefined;
            return { ...texture, path: promoted?.path ?? null };
          });
        }

        let thumbnailPath: string | null = null;
        if (validation.thumbnailBmp?.byteLength) {
          thumbnailPath = path.join(this.library.thumbnailsRoot, `${id}.bmp`);
          await writeFile(thumbnailPath, validation.thumbnailBmp, { mode: 0o600 });
        }
        const now = new Date().toISOString();
        const quarantined = !validation.valid;
        const record: PresetRecord = {
          id,
          name: metadata.name,
          author: metadata.author,
          path: finalPresetPath,
          origin: {
            kind: origin.originKind,
            sourcePath: origin.sourcePath,
            label: origin.label
          },
          importedAt: now,
          updatedAt: now,
          hash,
          status: quarantined
            ? "quarantined"
            : textureResult.missing.length
              ? "warning"
              : "valid",
          license: metadata.license,
          licenseVerified: false,
          textures: finalTextures,
          missingTextures: textureResult.missing,
          compatibility: validation.valid ? "projectM-4.1.6" : "incompatible",
          favorite: false,
          quarantined,
          quarantineReason: validation.error,
          errorReport: validation.error ? [validation.error] : [],
          thumbnailPath
        };
        const added = await this.library.add(record);
        if (added.duplicate) {
          report.duplicates.push(added.record);
        } else if (quarantined) {
          report.quarantined.push(added.record);
        } else {
          report.imported.push(added.record);
        }
      } catch (error) {
        report.issues.push({
          ...issue(error, preset.path),
          fatal: false
        });
      }
    }
    return report;
  }

  private async assertRealZip(zipPath: string): Promise<void> {
    const fileStat = await lstat(zipPath);
    if (fileStat.isSymbolicLink() || !fileStat.isFile()) {
      throw new PresetSecurityError("ZIP_NOT_REGULAR", "ZIP non regolare o symlink.", zipPath);
    }
    if (
      fileStat.size <= 4 ||
      fileStat.size > PRESET_LIMITS.maxArchiveBytes ||
      path.extname(zipPath).toLowerCase() !== ".zip"
    ) {
      throw new PresetSecurityError("ZIP_SIZE_OR_EXTENSION", "Archivio ZIP non valido.", zipPath);
    }
    const handle = await open(zipPath, "r");
    try {
      const signature = Buffer.alloc(4);
      await handle.read(signature, 0, 4, 0);
      const value = signature.readUInt32LE(0);
      if (![0x04034b50, 0x06054b50, 0x08074b50].includes(value)) {
        throw new PresetSecurityError("ZIP_SIGNATURE", "Firma reale ZIP non valida.", zipPath);
      }
    } finally {
      await handle.close();
    }
  }
}
