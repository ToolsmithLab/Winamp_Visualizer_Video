import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  lstat,
  open,
  opendir,
  realpath,
  stat
} from "node:fs/promises";
import path from "node:path";
import {
  compareAssetCandidate,
  isSupportedAssetExtension,
  type AssetCandidate,
  type AssetMatch
} from "../../engine/project/assetResolver";
import type {
  AssetStatus,
  AssetType,
  ProjectAssetReference,
  VisualizerProject
} from "../../shared/project";

export const ASSET_SEARCH_LIMITS = Object.freeze({
  files: 10_000,
  depth: 32,
  candidateBytes: 4 * 1024 * 1024 * 1024
});

function unsafePath(filePath: string): boolean {
  return (
    !filePath ||
    filePath.includes("\0") ||
    /^\\\\[.?]\\/.test(filePath) ||
    /^(?:javascript|data|file|https?|shell|powershell):/i.test(filePath)
  );
}

async function hashFile(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

async function hasExpectedMagic(type: AssetType, filePath: string): Promise<boolean> {
  const handle = await open(filePath, "r");
  try {
    const buffer = Buffer.alloc(32);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const bytes = buffer.subarray(0, bytesRead);
    if (type === "audio") {
      return (
        (bytes.toString("ascii", 0, 4) === "RIFF" &&
          bytes.toString("ascii", 8, 12) === "WAVE") ||
        bytes.toString("ascii", 0, 3) === "ID3" ||
        (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)
      );
    }
    if (type === "clip") {
      const isoBmff =
        bytes.length >= 12 && bytes.toString("ascii", 4, 8) === "ftyp";
      const matroska =
        bytes[0] === 0x1a &&
        bytes[1] === 0x45 &&
        bytes[2] === 0xdf &&
        bytes[3] === 0xa3;
      return isoBmff || matroska;
    }
    if (type === "cover" || type === "texture") {
      const png = bytes.subarray(0, 8).equals(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
      );
      const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
      const webp =
        bytes.toString("ascii", 0, 4) === "RIFF" &&
        bytes.toString("ascii", 8, 12) === "WEBP";
      const dds = bytes.toString("ascii", 0, 4) === "DDS ";
      const tga = [1, 2, 3, 9, 10, 11].includes(bytes[2] ?? -1);
      return png || jpeg || webp || (type === "texture" && (dds || tga));
    }
    const text = bytes.toString("utf8").trimStart();
    return (
      text.startsWith("[preset") ||
      text.startsWith("//") ||
      text.startsWith(";") ||
      /^[a-zA-Z_][\w.]*\s*=/.test(text)
    );
  } finally {
    await handle.close();
  }
}

export class MediaRelinkService {
  async synchronizeManifest(
    project: VisualizerProject,
    projectPath?: string
  ): Promise<VisualizerProject> {
    const next = structuredClone(project);
    if (
      next.audioSource === "external" &&
      !next.externalAudioFile &&
      next.audioFile
    ) {
      // Compatibilità con progetti/caller precedenti che impostavano solo
      // audioFile: da qui in avanti la sorgente esterna resta esplicita.
      next.externalAudioFile = next.audioFile;
    }
    const declarations: Array<{
      id: string;
      type: AssetType;
      path: string;
      required: boolean;
    }> = [];
    if (next.externalAudioFile) {
      declarations.push({
        id: "project-external-audio",
        type: "audio",
        path: next.externalAudioFile,
        required: next.audioSource === "external"
      });
    }
    if (next.clip.filePath) {
      declarations.push({
        id: "project-clip",
        type: "clip",
        path: next.clip.filePath,
        required: true
      });
    }
    if (next.cover.filePath) {
      declarations.push({
        id: "project-cover",
        type: "cover",
        path: next.cover.filePath,
        required: false
      });
    }
    if (next.projectM.presetPath) {
      declarations.push({
        id: "project-milkdrop-preset",
        type: "milkdrop-preset",
        path: next.projectM.presetPath,
        required: next.projectM.enabled
      });
    }
    next.projectM.texturePaths.forEach((texturePath, index) => {
      declarations.push({
        id: `project-texture-${String(index + 1).padStart(3, "0")}`,
        type: "texture",
        path: texturePath,
        required: false
      });
    });
    const retained = next.assets.filter(
      (asset) =>
        !declarations.some(
          (declaration) =>
            declaration.type === asset.type &&
            (asset.id === declaration.id ||
              asset.path === declaration.path ||
              asset.originalPath === declaration.path ||
              (Boolean(asset.hash) &&
                next.assets.some(
                  (candidate) =>
                    candidate !== asset &&
                    candidate.type === asset.type &&
                    candidate.hash === asset.hash &&
                    (candidate.path === declaration.path ||
                      candidate.originalPath === declaration.path)
                )))
        )
    );
    const synchronized: ProjectAssetReference[] = [];
    for (const declaration of declarations) {
      const previous = next.assets.find(
        (asset) =>
          asset.type === declaration.type &&
          (asset.path === declaration.path ||
            asset.originalPath === declaration.path)
      );
      let status: AssetStatus = "missing";
      let size: number | null = null;
      let hash: string | null = previous?.hash ?? null;
      try {
        const info = await lstat(declaration.path);
        if (!info.isFile() || info.isSymbolicLink()) {
          status = "unsupported";
        } else if (
          !isSupportedAssetExtension(declaration.type, declaration.path) ||
          !(await hasExpectedMagic(declaration.type, declaration.path))
        ) {
          status = "unsupported";
        } else {
          status = "available";
          size = info.size;
          hash = await hashFile(declaration.path);
        }
      } catch (error) {
        status =
          (error as NodeJS.ErrnoException).code === "EACCES"
            ? "inaccessible"
            : "missing";
      }
      let relativePath: string | null = null;
      if (projectPath) {
        const projectDirectory = path.dirname(projectPath);
        const relative = path.relative(projectDirectory, declaration.path);
        if (
          relative &&
          relative !== ".." &&
          !relative.startsWith(`..${path.sep}`) &&
          !path.isAbsolute(relative)
        ) {
          relativePath = relative;
        }
      }
      synchronized.push({
        id: previous?.id ?? declaration.id,
        type: declaration.type,
        path: status === "available" ? declaration.path : null,
        originalPath: declaration.path,
        relativePath,
        fileName: path.basename(declaration.path),
        size,
        hash,
        status,
        required: declaration.required
      });
    }
    next.assets = [...synchronized, ...retained];
    return next;
  }

  async inspect(
    asset: ProjectAssetReference,
    candidatePath: string
  ): Promise<AssetMatch> {
    if (unsafePath(candidatePath) || !path.isAbsolute(candidatePath)) {
      throw new Error("Percorso asset non autorizzato.");
    }
    const info = await lstat(candidatePath);
    const canonical = await realpath(candidatePath);
    if (
      !info.isFile() ||
      info.isSymbolicLink() ||
      path.resolve(canonical).toLocaleLowerCase() !==
        path.resolve(candidatePath).toLocaleLowerCase()
    ) {
      throw new Error("Symlink, reparse point o file non regolare rifiutato.");
    }
    if (info.size > ASSET_SEARCH_LIMITS.candidateBytes) {
      throw new Error("Asset oltre il limite dimensionale.");
    }
    const extensionSupported = isSupportedAssetExtension(asset.type, candidatePath);
    const magicSupported =
      extensionSupported && (await hasExpectedMagic(asset.type, candidatePath));
    const candidate: AssetCandidate = {
      path: candidatePath,
      fileName: path.basename(candidatePath),
      size: info.size,
      hash: await hashFile(candidatePath),
      supported: magicSupported
    };
    return compareAssetCandidate(asset, candidate);
  }

  async resolveProject(
    project: VisualizerProject,
    projectPath: string
  ): Promise<VisualizerProject> {
    const next = structuredClone(project);
    const projectDirectory = path.dirname(projectPath);
    for (const asset of next.assets) {
      const candidates = [
        asset.path,
        asset.relativePath
          ? path.resolve(projectDirectory, asset.relativePath)
          : null
      ].filter((item): item is string => Boolean(item));
      const candidate = candidates.find((item) => {
        if (asset.relativePath) {
          const relative = path.relative(projectDirectory, item);
          if (
            relative === ".." ||
            relative.startsWith(`..${path.sep}`) ||
            path.isAbsolute(relative)
          ) {
            return false;
          }
        }
        return !unsafePath(item);
      });
      if (!candidate) {
        asset.path = null;
        asset.status = "missing";
        continue;
      }
      try {
        const match = await this.inspect(asset, candidate);
        asset.path = match.status === "unsupported" ? null : candidate;
        asset.fileName = match.candidate.fileName;
        asset.size = match.candidate.size;
        asset.status = match.status;
      } catch (error) {
        asset.path = null;
        asset.status =
          (error as NodeJS.ErrnoException).code === "EACCES"
            ? "inaccessible"
            : "missing";
      }
    }
    return next;
  }

  async search(
    assets: ProjectAssetReference[],
    root: string,
    recursive: boolean
  ): Promise<AssetMatch[]> {
    if (unsafePath(root) || !path.isAbsolute(root)) {
      throw new Error("Cartella di ricerca non autorizzata.");
    }
    const rootInfo = await lstat(root);
    const canonicalRoot = await realpath(root);
    if (
      !rootInfo.isDirectory() ||
      rootInfo.isSymbolicLink() ||
      path.resolve(canonicalRoot).toLocaleLowerCase() !==
        path.resolve(root).toLocaleLowerCase()
    ) {
      throw new Error("Cartella symlink o non valida rifiutata.");
    }
    const files: string[] = [];
    const visit = async (directory: string, depth: number): Promise<void> => {
      if (depth > ASSET_SEARCH_LIMITS.depth) return;
      const handle = await opendir(directory);
      for await (const entry of handle) {
        if (files.length >= ASSET_SEARCH_LIMITS.files) {
          throw new Error("Ricerca interrotta: limite file raggiunto.");
        }
        const candidate = path.join(directory, entry.name);
        if (entry.isSymbolicLink()) continue;
        if (entry.isDirectory() && recursive) {
          await visit(candidate, depth + 1);
        } else if (entry.isFile()) {
          files.push(candidate);
        }
      }
    };
    await visit(root, 0);
    const matches: AssetMatch[] = [];
    for (const asset of assets) {
      const expectedName = asset.fileName?.toLocaleLowerCase();
      const expectedSize = asset.size;
      const candidates = files.filter((filePath) => {
        if (!isSupportedAssetExtension(asset.type, filePath)) return false;
        if (
          expectedName &&
          path.basename(filePath).toLocaleLowerCase() !== expectedName
        ) {
          return false;
        }
        return true;
      });
      for (const candidatePath of candidates) {
        if (expectedSize !== null) {
          const candidateStat = await stat(candidatePath);
          if (candidateStat.size !== expectedSize) continue;
        }
        const match = await this.inspect(asset, candidatePath);
        if (match.status !== "unsupported") {
          matches.push(match);
          if (match.status === "relinked") break;
        }
      }
    }
    return matches;
  }
}
