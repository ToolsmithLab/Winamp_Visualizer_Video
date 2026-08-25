import { createHash } from "node:crypto";
import {
  lstat,
  open,
  realpath,
  type FileHandle
} from "node:fs/promises";
import path from "node:path";

export const PRESET_LIMITS = {
  maxFiles: 2_000,
  maxFileBytes: 32 * 1024 * 1024,
  maxTotalBytes: 256 * 1024 * 1024,
  maxArchiveBytes: 256 * 1024 * 1024,
  maxCompressionRatio: 200,
  maxDepth: 16,
  maxPathLength: 1_024
} as const;

const forbiddenExtensions = new Set([
  ".exe", ".dll", ".com", ".scr", ".msi", ".bat", ".cmd", ".ps1",
  ".psm1", ".js", ".jse", ".vbs", ".vbe", ".wsf", ".wsh", ".hta",
  ".lnk", ".url", ".reg", ".cpl", ".sys", ".drv"
]);
export const textureExtensions = new Set([
  ".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tga"
]);
const metadataExtensions = new Set([".txt", ".md", ".license"]);
const windowsReserved = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;

export type SafeAssetKind = "milk" | "texture" | "metadata" | "ignored";

export class PresetSecurityError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly target = ""
  ) {
    super(message);
    this.name = "PresetSecurityError";
  }
}

export function assertSafeRelativePath(input: string): string {
  if (!input || input.includes("\0")) {
    throw new PresetSecurityError("INVALID_PATH", "Percorso vuoto o con NUL.", input);
  }
  const slashes = input.replace(/\\/g, "/");
  if (
    slashes.startsWith("/") ||
    slashes.startsWith("//") ||
    /^[a-z]:/i.test(slashes) ||
    /^\\\\[?.]\\/.test(input) ||
    /^(?:file|https?):/i.test(slashes)
  ) {
    throw new PresetSecurityError(
      "ABSOLUTE_OR_DEVICE_PATH",
      `Percorso assoluto o device path rifiutato: ${input}`,
      input
    );
  }
  const parts = slashes.split("/").filter(Boolean);
  if (!parts.length || parts.length > PRESET_LIMITS.maxDepth) {
    throw new PresetSecurityError("PATH_DEPTH", `Profondità non consentita: ${input}`, input);
  }
  for (const part of parts) {
    if (
      part === "." ||
      part === ".." ||
      part.endsWith(" ") ||
      part.endsWith(".") ||
      part.includes(":") ||
      windowsReserved.test(part)
    ) {
      throw new PresetSecurityError("UNSAFE_PATH_SEGMENT", `Segmento non sicuro: ${part}`, input);
    }
  }
  const normalized = parts.join(path.sep);
  if (normalized.length > PRESET_LIMITS.maxPathLength) {
    throw new PresetSecurityError("PATH_TOO_LONG", `Percorso oltre il limite: ${input}`, input);
  }
  return normalized;
}

export function safeJoin(root: string, relative: string): string {
  const normalized = assertSafeRelativePath(relative);
  const resolvedRoot = path.resolve(root);
  const target = path.resolve(resolvedRoot, normalized);
  const relation = path.relative(resolvedRoot, target);
  if (!relation || relation.startsWith("..") || path.isAbsolute(relation)) {
    if (!relation) return target;
    throw new PresetSecurityError("PATH_TRAVERSAL", `Traversal rifiutato: ${relative}`, relative);
  }
  return target;
}

export function classifyAsset(filePath: string): SafeAssetKind {
  const extension = path.extname(filePath).toLowerCase();
  if (forbiddenExtensions.has(extension)) {
    throw new PresetSecurityError(
      "FORBIDDEN_FILE",
      `File eseguibile o script rifiutato: ${path.basename(filePath)}`,
      filePath
    );
  }
  if (extension === ".milk") return "milk";
  if (textureExtensions.has(extension)) return "texture";
  if (metadataExtensions.has(extension)) return "metadata";
  return "ignored";
}

async function readHead(handle: FileHandle, size = 65_536): Promise<Buffer> {
  const stat = await handle.stat();
  const buffer = Buffer.allocUnsafe(Math.min(size, Number(stat.size)));
  const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
  return buffer.subarray(0, bytesRead);
}

function isTextureSignature(extension: string, head: Buffer): boolean {
  if (extension === ".png") {
    return head.length >= 8 && head.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    );
  }
  if (extension === ".jpg" || extension === ".jpeg") {
    return head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
  }
  if (extension === ".webp") {
    return head.length >= 12 &&
      head.subarray(0, 4).toString("ascii") === "RIFF" &&
      head.subarray(8, 12).toString("ascii") === "WEBP";
  }
  if (extension === ".bmp") {
    return head.length >= 14 && head.subarray(0, 2).toString("ascii") === "BM";
  }
  if (extension === ".tga") {
    return head.length >= 18 &&
      [1, 2, 3, 9, 10, 11].includes(head[2] ?? 0) &&
      head.readUInt16LE(12) > 0 &&
      head.readUInt16LE(14) > 0;
  }
  return false;
}

export async function validateRegularAsset(
  filePath: string,
  expectedKind?: SafeAssetKind
): Promise<SafeAssetKind> {
  if (/^\\\\[?.]\\/.test(filePath)) {
    throw new PresetSecurityError("DEVICE_PATH", "Device path rifiutato.", filePath);
  }
  const stat = await lstat(filePath);
  if (stat.isSymbolicLink()) {
    throw new PresetSecurityError("SYMLINK", `Symlink rifiutato: ${filePath}`, filePath);
  }
  if (!stat.isFile()) {
    throw new PresetSecurityError("NOT_REGULAR_FILE", `File non regolare: ${filePath}`, filePath);
  }
  if (stat.size > PRESET_LIMITS.maxFileBytes) {
    throw new PresetSecurityError("FILE_TOO_LARGE", `File oltre 32 MiB: ${filePath}`, filePath);
  }
  const kind = classifyAsset(filePath);
  if (expectedKind && kind !== expectedKind) {
    throw new PresetSecurityError("TYPE_MISMATCH", `Tipo inatteso: ${filePath}`, filePath);
  }
  if (kind === "ignored") return kind;

  const handle = await open(filePath, "r");
  try {
    const head = await readHead(handle);
    if (kind === "milk") {
      if (head.includes(0) || !/^\s*\[preset\d+\]/im.test(head.toString("utf8"))) {
        throw new PresetSecurityError(
          "INVALID_MILK_TYPE",
          `Il file non contiene un preset MilkDrop riconoscibile: ${filePath}`,
          filePath
        );
      }
    } else if (kind === "texture") {
      const extension = path.extname(filePath).toLowerCase();
      if (!isTextureSignature(extension, head)) {
        throw new PresetSecurityError(
          "INVALID_TEXTURE_TYPE",
          `Firma texture non coerente con l'estensione: ${filePath}`,
          filePath
        );
      }
    } else if (head.includes(0)) {
      throw new PresetSecurityError("INVALID_TEXT_TYPE", `Metadato binario rifiutato: ${filePath}`, filePath);
    }
  } finally {
    await handle.close();
  }
  return kind;
}

export async function assertNoSymlinkDirectory(directory: string): Promise<void> {
  const stat = await lstat(directory);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new PresetSecurityError("SYMLINK_OR_NOT_DIRECTORY", `Cartella non sicura: ${directory}`, directory);
  }
  await realpath(directory);
}

export async function sha256File(filePath: string): Promise<string> {
  const handle = await open(filePath, "r");
  const hash = createHash("sha256");
  try {
    const buffer = Buffer.allocUnsafe(128 * 1024);
    let position = 0;
    while (true) {
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, position);
      if (!bytesRead) break;
      hash.update(buffer.subarray(0, bytesRead));
      position += bytesRead;
    }
  } finally {
    await handle.close();
  }
  return hash.digest("hex");
}
