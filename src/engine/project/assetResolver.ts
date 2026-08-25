import type {
  AssetStatus,
  AssetType,
  ProjectAssetReference,
  VisualizerProject
} from "../../shared/project";

export interface AssetCandidate {
  path: string;
  fileName: string;
  size: number;
  hash: string;
  supported: boolean;
}

export interface AssetMatch {
  assetId: string;
  candidate: AssetCandidate;
  status: AssetStatus;
  requiresConfirmation: boolean;
  reason: string;
}

const acceptedExtensions: Record<AssetType, Set<string>> = {
  audio: new Set([".wav", ".mp3"]),
  clip: new Set([".mp4", ".m4v", ".mov", ".mkv", ".webm"]),
  cover: new Set([".png", ".jpg", ".jpeg", ".webp"]),
  "milkdrop-preset": new Set([".milk"]),
  texture: new Set([".png", ".jpg", ".jpeg", ".webp", ".dds", ".tga"])
};

export function extensionForPath(filePath: string): string {
  const slash = Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\"));
  const dot = filePath.lastIndexOf(".");
  return dot > slash ? filePath.slice(dot).toLowerCase() : "";
}

export function isSupportedAssetExtension(
  type: AssetType,
  filePath: string
): boolean {
  return acceptedExtensions[type].has(extensionForPath(filePath));
}

export function compareAssetCandidate(
  asset: ProjectAssetReference,
  candidate: AssetCandidate
): AssetMatch {
  if (!candidate.supported || !isSupportedAssetExtension(asset.type, candidate.path)) {
    return {
      assetId: asset.id,
      candidate,
      status: "unsupported",
      requiresConfirmation: false,
      reason: "Il tipo reale o l'estensione non corrisponde all'asset."
    };
  }
  if (asset.hash && asset.hash.toLowerCase() !== candidate.hash.toLowerCase()) {
    return {
      assetId: asset.id,
      candidate,
      status: "hash-mismatch",
      requiresConfirmation: true,
      reason: "Il file è compatibile, ma l'hash SHA-256 è differente."
    };
  }
  return {
    assetId: asset.id,
    candidate,
    status: "relinked",
    requiresConfirmation: false,
    reason: asset.hash ? "Hash SHA-256 verificato." : "Tipo reale verificato."
  };
}

export function updateProjectAsset(
  project: VisualizerProject,
  match: AssetMatch,
  confirmHashMismatch = false
): VisualizerProject {
  if (match.status === "unsupported") {
    throw new Error(match.reason);
  }
  if (match.requiresConfirmation && !confirmHashMismatch) {
    throw new Error("Hash differente: è richiesta una conferma esplicita.");
  }
  const next = structuredClone(project);
  const asset = next.assets.find((item) => item.id === match.assetId);
  if (!asset) throw new Error("Asset da ricollegare non trovato.");
  const replacedPath = asset.path ?? asset.originalPath;
  asset.path = match.candidate.path;
  asset.originalPath ??= match.candidate.path;
  asset.fileName = match.candidate.fileName;
  asset.size = match.candidate.size;
  asset.hash = match.candidate.hash;
  asset.status = "relinked";

  if (asset.type === "audio") {
    next.externalAudioFile = match.candidate.path;
    if (next.audioSource === "external") next.audioFile = match.candidate.path;
  }
  if (asset.type === "clip") {
    next.clip.filePath = match.candidate.path;
    if (next.audioSource === "clip") next.audioFile = match.candidate.path;
  }
  if (asset.type === "cover") next.cover.filePath = match.candidate.path;
  if (asset.type === "milkdrop-preset") {
    next.projectM.presetPath = match.candidate.path;
    next.projectM.presetHash = match.candidate.hash;
    next.projectM.presetStatus = "warning";
  }
  if (asset.type === "texture") {
    next.projectM.texturePaths = [
      ...new Set(
        next.projectM.texturePaths
          .filter((item) => item !== replacedPath)
          .concat(match.candidate.path)
      )
    ];
    next.projectM.missingTextures = next.projectM.missingTextures.filter(
      (item) => item !== replacedPath && item !== asset.fileName
    );
  }
  return next;
}

export function updateProjectAssets(
  project: VisualizerProject,
  matches: AssetMatch[],
  confirmedMismatchIds: ReadonlySet<string> = new Set()
): VisualizerProject {
  return matches.reduce(
    (current, match) =>
      updateProjectAsset(
        current,
        match,
        confirmedMismatchIds.has(match.assetId)
      ),
    project
  );
}

export function markAssetIgnored(
  project: VisualizerProject,
  assetId: string
): VisualizerProject {
  const next = structuredClone(project);
  const asset = next.assets.find((item) => item.id === assetId);
  if (!asset) throw new Error("Asset da ignorare non trovato.");
  if (asset.required) {
    throw new Error("Un asset essenziale non può essere ignorato.");
  }
  asset.status = "ignored";
  return next;
}

export function removeProjectAsset(
  project: VisualizerProject,
  assetId: string
): VisualizerProject {
  const next = structuredClone(project);
  const asset = next.assets.find((item) => item.id === assetId);
  if (!asset) throw new Error("Asset da rimuovere non trovato.");
  if (asset.required) {
    throw new Error("Un asset essenziale non può essere rimosso.");
  }
  next.assets = next.assets.filter((item) => item.id !== assetId);
  const referencedPath = asset.path ?? asset.originalPath;
  if (asset.type === "cover" && next.cover.filePath === referencedPath) {
    next.cover.filePath = null;
  }
  if (asset.type === "clip" && next.clip.filePath === referencedPath) {
    next.clip.filePath = null;
    if (next.audioSource === "clip") next.audioFile = null;
  }
  if (asset.type === "texture" && referencedPath) {
    next.projectM.texturePaths = next.projectM.texturePaths.filter(
      (item) => item !== referencedPath
    );
    next.projectM.missingTextures = next.projectM.missingTextures.filter(
      (item) => item !== referencedPath && item !== asset.fileName
    );
  }
  return next;
}

export function unresolvedAssets(
  project: VisualizerProject
): ProjectAssetReference[] {
  return project.assets.filter((asset) =>
    ["missing", "hash-mismatch", "inaccessible", "unsupported"].includes(
      asset.status
    )
  );
}

export function exportBlockingAssets(
  project: VisualizerProject
): ProjectAssetReference[] {
  return unresolvedAssets(project).filter((asset) => asset.required);
}
