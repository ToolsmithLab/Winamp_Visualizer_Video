import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { Transform, type TransformCallback } from "node:stream";
import path from "node:path";
import * as yauzl from "yauzl";
import {
  PRESET_LIMITS,
  PresetSecurityError,
  assertSafeRelativePath,
  classifyAsset,
  safeJoin,
  validateRegularAsset,
  type SafeAssetKind
} from "./presetSecurity";

export interface ExtractedPresetAsset {
  relativePath: string;
  path: string;
  kind: Exclude<SafeAssetKind, "ignored">;
  size: number;
}

export interface SecureZipExtractionOptions {
  includePrefix?: string;
}

const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

class Crc32Guard extends Transform {
  private value = 0xffffffff;
  bytes = 0;

  override _transform(
    chunk: Buffer,
    _encoding: BufferEncoding,
    callback: TransformCallback
  ): void {
    for (const byte of chunk) {
      this.value = crcTable[(this.value ^ byte) & 0xff]! ^ (this.value >>> 8);
    }
    this.bytes += chunk.length;
    callback(null, chunk);
  }

  get crc32(): number {
    return (this.value ^ 0xffffffff) >>> 0;
  }
}

function openZip(zipPath: string): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.open(
      zipPath,
      {
        lazyEntries: true,
        decodeStrings: true,
        validateEntrySizes: true,
        strictFileNames: true,
        autoClose: true
      },
      (error, zipFile) => {
        if (error || !zipFile) reject(error ?? new Error("ZIP non apribile."));
        else resolve(zipFile);
      }
    );
  });
}

function openEntry(zip: yauzl.ZipFile, entry: yauzl.Entry): Promise<NodeJS.ReadableStream> {
  return new Promise((resolve, reject) => {
    zip.openReadStream(entry, (error, stream) => {
      if (error || !stream) reject(error ?? new Error("Entry ZIP non leggibile."));
      else resolve(stream);
    });
  });
}

function isZipSymlink(entry: yauzl.Entry): boolean {
  const unixMode = (entry.externalFileAttributes >>> 16) & 0xffff;
  return (unixMode & 0o170000) === 0o120000;
}

export async function extractZipSecure(
  zipPath: string,
  stagingRoot: string,
  options: SecureZipExtractionOptions = {}
): Promise<ExtractedPresetAsset[]> {
  const zip = await openZip(zipPath);
  const extracted: ExtractedPresetAsset[] = [];
  let fileCount = 0;
  let totalBytes = 0;

  return await new Promise<ExtractedPresetAsset[]>((resolve, reject) => {
    let settled = false;
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      try {
        zip.close();
      } catch {
        // autoClose may already have closed it.
      }
      reject(error);
    };

    zip.once("error", fail);
    zip.once("end", () => {
      if (settled) return;
      settled = true;
      resolve(extracted);
    });
    zip.on("entry", (entry: yauzl.Entry) => {
      void (async () => {
        const rawEntryName = entry.fileName.replace(/\\/g, "/");
        let entryName = rawEntryName;
        if (options.includePrefix) {
          const prefix = options.includePrefix.replace(/^\/+|\/+$/g, "");
          assertSafeRelativePath(prefix);
          if (rawEntryName === `${prefix}/`) {
            zip.readEntry();
            return;
          }
          if (!rawEntryName.startsWith(`${prefix}/`)) {
            zip.readEntry();
            return;
          }
          entryName = rawEntryName.slice(prefix.length + 1);
          if (!entryName) {
            zip.readEntry();
            return;
          }
        }
        if (isZipSymlink(entry)) {
          throw new PresetSecurityError("ZIP_SYMLINK", `Symlink ZIP rifiutato: ${entryName}`, entryName);
        }
        const directory = /\/$/.test(entryName);
        const normalized = assertSafeRelativePath(
          directory ? entryName.replace(/\/+$/, "") : entryName
        );
        if (directory) {
          await mkdir(safeJoin(stagingRoot, normalized), { recursive: true });
          zip.readEntry();
          return;
        }

        fileCount += 1;
        if (fileCount > PRESET_LIMITS.maxFiles) {
          throw new PresetSecurityError("ZIP_FILE_LIMIT", "ZIP con troppi file.", zipPath);
        }
        if (entry.uncompressedSize > PRESET_LIMITS.maxFileBytes) {
          throw new PresetSecurityError("ZIP_ENTRY_TOO_LARGE", `Entry oltre 32 MiB: ${entryName}`, entryName);
        }
        totalBytes += entry.uncompressedSize;
        if (totalBytes > PRESET_LIMITS.maxTotalBytes) {
          throw new PresetSecurityError("ZIP_TOTAL_TOO_LARGE", "ZIP oltre 256 MiB estratti.", zipPath);
        }
        if (
          entry.uncompressedSize > 1024 * 1024 &&
          entry.uncompressedSize / Math.max(1, entry.compressedSize) >
            PRESET_LIMITS.maxCompressionRatio
        ) {
          throw new PresetSecurityError("ZIP_BOMB_RATIO", `Rapporto di compressione anomalo: ${entryName}`, entryName);
        }

        const kind = classifyAsset(entryName);
        if (kind === "ignored") {
          zip.readEntry();
          return;
        }
        const target = safeJoin(stagingRoot, normalized);
        await mkdir(path.dirname(target), { recursive: true });
        const stream = await openEntry(zip, entry);
        const integrity = new Crc32Guard();
        await pipeline(
          stream,
          integrity,
          createWriteStream(target, { flags: "wx", mode: 0o600 })
        );
        if (
          integrity.bytes !== entry.uncompressedSize ||
          integrity.crc32 !== (entry.crc32 >>> 0)
        ) {
          throw new PresetSecurityError(
            "ZIP_CRC",
            `CRC o dimensione ZIP non valida: ${entryName}`,
            entryName
          );
        }
        await validateRegularAsset(target, kind);
        extracted.push({
          relativePath: normalized,
          path: target,
          kind,
          size: entry.uncompressedSize
        });
        zip.readEntry();
      })().catch(fail);
    });
    zip.readEntry();
  });
}
