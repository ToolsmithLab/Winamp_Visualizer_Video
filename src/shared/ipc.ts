import type { VisualizerProject } from "./project";
import type {
  PresetImportReport,
  PresetImportRequest,
  PresetLibraryQuery,
  PresetMetadataUpdate,
  PresetRecord,
  PresetRelinkRequest
} from "./presets";
import type {
  CatalogActionResult,
  PresetCatalogView
} from "./presetCatalog";
import type {
  ProjectPresetCreateRequest,
  ProjectPresetLibraryRecord,
  ProjectPresetPreview,
  ProjectPresetQuery
} from "./projectPreset";
import type { AssetMatch } from "../engine/project/assetResolver";
import type { ProjectAssetReference } from "./project";

export const IPC = {
  chooseAudio: "dialog:choose-audio",
  chooseClip: "dialog:choose-clip",
  chooseCover: "dialog:choose-cover",
  readMedia: "media:read",
  inspectClip: "media:inspect-clip",
  readClipAudio: "media:read-clip-audio",
  saveProject: "project:save",
  openProject: "project:open",
  openProjectPath: "project:open-path",
  exportVideo: "export:start",
  exportVideoPath: "export:start-path",
  cancelExport: "export:cancel",
  exportProgress: "export:progress",
  projectMStatus: "projectm:status",
  projectMInitialize: "projectm:initialize",
  projectMReset: "projectm:reset",
  projectMRender: "projectm:render",
  projectMShutdown: "projectm:shutdown",
  presetList: "presets:list",
  presetImport: "presets:import",
  presetSelect: "presets:select",
  presetLock: "presets:lock",
  presetFavorite: "presets:favorite",
  presetDelete: "presets:delete",
  presetOpenPath: "presets:open-path",
  presetUpdateMetadata: "presets:update-metadata",
  presetRelink: "presets:relink",
  presetRefresh: "presets:refresh",
  presetClearQuarantine: "presets:clear-quarantine",
  presetThumbnail: "presets:thumbnail",
  presetCatalogList: "preset-catalog:list",
  presetCatalogInstall: "preset-catalog:install",
  presetCatalogUpdate: "preset-catalog:update",
  presetCatalogUninstall: "preset-catalog:uninstall",
  presetCatalogVerify: "preset-catalog:verify",
  presetCatalogOpenSource: "preset-catalog:open-source",
  presetCatalogReadLicense: "preset-catalog:read-license"
  ,
  projectPresetList: "project-presets:list",
  projectPresetCreate: "project-presets:create",
  projectPresetImport: "project-presets:import",
  projectPresetPreview: "project-presets:preview",
  projectPresetRename: "project-presets:rename",
  projectPresetDuplicate: "project-presets:duplicate",
  projectPresetDelete: "project-presets:delete",
  projectPresetExport: "project-presets:export",
  projectPresetImportPath: "project-presets:import-path",
  projectPresetExportPath: "project-presets:export-path",
  assetChooseReplacement: "assets:choose-replacement",
  assetSearchFolder: "assets:search-folder",
  assetInspectPath: "assets:inspect-path"
} as const;

export type {
  PresetImportReport,
  PresetImportRequest,
  PresetLibraryQuery,
  PresetMetadataUpdate,
  PresetRecord,
  PresetRelinkRequest
};
export type { CatalogActionResult, PresetCatalogView };
export type {
  ProjectPresetCreateRequest,
  ProjectPresetLibraryRecord,
  ProjectPresetPreview,
  ProjectPresetQuery
};
export type { AssetMatch };

export interface PresetSelectionResult {
  preset: PresetRecord;
  status: ProjectMStatus;
}

export interface PresetSelectionRequest {
  id: string;
  smoothTransition?: boolean;
  transitionSeconds?: number;
}

export interface MediaSelection {
  path: string;
  name: string;
}

export interface MediaPayload extends MediaSelection {
  bytes: Uint8Array;
  mimeType: string;
}

export interface ClipMetadata extends MediaSelection {
  durationSeconds: number;
  hasVideo: boolean;
  hasAudio: boolean;
  width: number;
  height: number;
  frameRate: number;
  container: string;
  videoCodec: string;
  audioCodec: string | null;
  previewSupported: boolean;
  compatibilityReason: string;
}

export interface ProjectFileResult {
  path: string;
  project: VisualizerProject;
}

export interface ProjectPresetPreviewRequest {
  id: string;
  project: VisualizerProject;
}

export interface AssetReplacementRequest {
  asset: ProjectAssetReference;
}

export interface AssetSearchRequest {
  assets: ProjectAssetReference[];
  recursive: boolean;
}

export interface ExportRequest {
  project: VisualizerProject;
  destination: string;
}

export interface ExportProgress {
  percent: number;
  message: string;
  phase?:
    | "preparing"
    | "loading-audio"
    | "starting-effects"
    | "composing"
    | "encoding"
    | "finalizing"
    | "completed"
    | "cancelled"
    | "error";
  frameCurrent?: number;
  frameTotal?: number;
  elapsedSeconds?: number;
  framesPerSecond?: number;
  estimatedRemainingSeconds?: number | null;
  videoCodec?: string;
  audioCodec?: string;
  encoder?: string;
  width?: number;
  height?: number;
  fps?: number;
  durationSeconds?: number;
  ffmpegPath?: string;
  openH264Path?: string;
  diagnosticLogPath?: string;
  timestamp?: string;
  done?: boolean;
  cancelled?: boolean;
  outputPath?: string;
  error?: string;
}

export interface ProjectMStatus {
  available: boolean;
  running: boolean;
  enabled: boolean;
  version: string;
  preset: string;
  error: string;
  glRenderer: string;
  glVersion: string;
  pid: number | null;
  pcmMaxSamples: number;
  hostPath: string;
  libraryPath: string;
  presetPath: string;
  receivedPresetPath: string;
  presetPathUtf8Bytes: number;
  activeCodePage: number;
  protocolVersion: number;
  deterministicSeed: string;
}

export interface ProjectMRenderRequest {
  width: number;
  height: number;
  steps: number;
  channels: 1 | 2;
  samples: Float32Array;
}

export interface ProjectMFrame {
  width: number;
  height: number;
  stride: number;
  pcmSamples: number;
  frameIndex: number;
  advancedFrames: number;
  renderMs: number;
  latencyMs: number;
  bandwidthMbps: number;
  droppedFrames: number;
  bytes: Uint8Array;
}
