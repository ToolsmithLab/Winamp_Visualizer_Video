import { contextBridge, ipcRenderer } from "electron";
import { IPC } from "../shared/ipc";
import type {
  ExportProgress,
  ExportRequest,
  MediaPayload,
  MediaSelection,
  ProjectFileResult,
  ProjectMFrame,
  ProjectMRenderRequest,
  ProjectMStatus,
  PresetImportReport,
  PresetImportRequest,
  PresetLibraryQuery,
  PresetMetadataUpdate,
  PresetRecord,
  PresetRelinkRequest,
  PresetSelectionRequest,
  PresetSelectionResult,
  CatalogActionResult,
  PresetCatalogView
  ,
  ProjectPresetCreateRequest,
  ProjectPresetLibraryRecord,
  ProjectPresetPreview,
  ProjectPresetPreviewRequest,
  ProjectPresetQuery,
  AssetMatch,
  AssetReplacementRequest,
  AssetSearchRequest
  ,
  ClipMetadata
} from "../shared/ipc";
import type { VisualizerProject } from "../shared/project";

const api = {
  chooseAudio: (): Promise<MediaSelection | null> =>
    ipcRenderer.invoke(IPC.chooseAudio),
  chooseClip: (): Promise<MediaSelection | null> =>
    ipcRenderer.invoke(IPC.chooseClip),
  chooseCover: (): Promise<MediaSelection | null> =>
    ipcRenderer.invoke(IPC.chooseCover),
  readMedia: (path: string): Promise<MediaPayload> =>
    ipcRenderer.invoke(IPC.readMedia, path),
  inspectClip: (path: string): Promise<ClipMetadata> =>
    ipcRenderer.invoke(IPC.inspectClip, path),
  readClipAudio: (path: string): Promise<MediaPayload> =>
    ipcRenderer.invoke(IPC.readClipAudio, path),
  saveProject: (
    project: VisualizerProject,
    currentPath?: string
  ): Promise<ProjectFileResult | null> =>
    ipcRenderer.invoke(IPC.saveProject, project, currentPath),
  openProject: (): Promise<ProjectFileResult | null> =>
    ipcRenderer.invoke(IPC.openProject),
  openProjectPath: (path: string): Promise<ProjectFileResult> =>
    ipcRenderer.invoke(IPC.openProjectPath, path),
  exportVideo: (request: Omit<ExportRequest, "destination">): Promise<string | null> =>
    ipcRenderer.invoke(IPC.exportVideo, request),
  exportVideoPath: (
    request: Omit<ExportRequest, "destination">,
    destination: string
  ): Promise<string> =>
    ipcRenderer.invoke(IPC.exportVideoPath, request, destination),
  cancelExport: (): Promise<boolean> =>
    ipcRenderer.invoke(IPC.cancelExport),
  onExportProgress: (callback: (progress: ExportProgress) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: ExportProgress) =>
      callback(progress);
    ipcRenderer.on(IPC.exportProgress, listener);
    return () => ipcRenderer.removeListener(IPC.exportProgress, listener);
  },
  projectMStatus: (): Promise<ProjectMStatus> =>
    ipcRenderer.invoke(IPC.projectMStatus),
  projectMInitialize: (
    width = 540,
    height = 960,
    seed = 0x5f3759df
  ): Promise<ProjectMStatus> =>
    ipcRenderer.invoke(IPC.projectMInitialize, width, height, seed),
  projectMReset: (
    width = 540,
    height = 960,
    seed = 0x5f3759df
  ): Promise<ProjectMStatus> =>
    ipcRenderer.invoke(IPC.projectMReset, width, height, seed),
  projectMRender: (request: ProjectMRenderRequest): Promise<ProjectMFrame | null> =>
    ipcRenderer.invoke(IPC.projectMRender, request),
  projectMShutdown: (): Promise<void> =>
    ipcRenderer.invoke(IPC.projectMShutdown),
  presetList: (query: PresetLibraryQuery = {}): Promise<PresetRecord[]> =>
    ipcRenderer.invoke(IPC.presetList, query),
  presetImport: (request: PresetImportRequest): Promise<PresetImportReport | null> =>
    ipcRenderer.invoke(IPC.presetImport, request),
  presetSelect: (
    request: string | PresetSelectionRequest
  ): Promise<PresetSelectionResult> =>
    ipcRenderer.invoke(IPC.presetSelect, request),
  presetLock: (locked: boolean): Promise<ProjectMStatus> =>
    ipcRenderer.invoke(IPC.presetLock, locked),
  presetFavorite: (id: string, favorite: boolean): Promise<PresetRecord> =>
    ipcRenderer.invoke(IPC.presetFavorite, id, favorite),
  presetDelete: (id: string): Promise<void> =>
    ipcRenderer.invoke(IPC.presetDelete, id),
  presetOpenPath: (id: string): Promise<void> =>
    ipcRenderer.invoke(IPC.presetOpenPath, id),
  presetUpdateMetadata: (update: PresetMetadataUpdate): Promise<PresetRecord> =>
    ipcRenderer.invoke(IPC.presetUpdateMetadata, update),
  presetRelink: (request: PresetRelinkRequest): Promise<PresetRecord | null> =>
    ipcRenderer.invoke(IPC.presetRelink, request),
  presetRefresh: (): Promise<PresetRecord[]> =>
    ipcRenderer.invoke(IPC.presetRefresh),
  presetClearQuarantine: (id: string): Promise<PresetRecord> =>
    ipcRenderer.invoke(IPC.presetClearQuarantine, id),
  presetThumbnail: (id: string): Promise<Uint8Array | null> =>
    ipcRenderer.invoke(IPC.presetThumbnail, id),
  presetCatalogList: (): Promise<PresetCatalogView> =>
    ipcRenderer.invoke(IPC.presetCatalogList),
  presetCatalogInstall: (id: string): Promise<CatalogActionResult> =>
    ipcRenderer.invoke(IPC.presetCatalogInstall, id),
  presetCatalogUpdate: (id: string): Promise<CatalogActionResult> =>
    ipcRenderer.invoke(IPC.presetCatalogUpdate, id),
  presetCatalogUninstall: (id: string): Promise<CatalogActionResult> =>
    ipcRenderer.invoke(IPC.presetCatalogUninstall, id),
  presetCatalogVerify: (id: string): Promise<CatalogActionResult> =>
    ipcRenderer.invoke(IPC.presetCatalogVerify, id),
  presetCatalogOpenSource: (id: string): Promise<void> =>
    ipcRenderer.invoke(IPC.presetCatalogOpenSource, id),
  presetCatalogReadLicense: (id: string): Promise<string> =>
    ipcRenderer.invoke(IPC.presetCatalogReadLicense, id),
  projectPresetList: (
    query: ProjectPresetQuery = {}
  ): Promise<ProjectPresetLibraryRecord[]> =>
    ipcRenderer.invoke(IPC.projectPresetList, query),
  projectPresetCreate: (
    request: ProjectPresetCreateRequest
  ): Promise<ProjectPresetLibraryRecord> =>
    ipcRenderer.invoke(IPC.projectPresetCreate, request),
  projectPresetImport: (): Promise<ProjectPresetLibraryRecord | null> =>
    ipcRenderer.invoke(IPC.projectPresetImport),
  projectPresetPreview: (
    request: ProjectPresetPreviewRequest
  ): Promise<ProjectPresetPreview> =>
    ipcRenderer.invoke(IPC.projectPresetPreview, request),
  projectPresetRename: (
    id: string,
    name: string
  ): Promise<ProjectPresetLibraryRecord> =>
    ipcRenderer.invoke(IPC.projectPresetRename, id, name),
  projectPresetDuplicate: (id: string): Promise<ProjectPresetLibraryRecord> =>
    ipcRenderer.invoke(IPC.projectPresetDuplicate, id),
  projectPresetDelete: (id: string): Promise<void> =>
    ipcRenderer.invoke(IPC.projectPresetDelete, id),
  projectPresetExport: (id: string): Promise<string | null> =>
    ipcRenderer.invoke(IPC.projectPresetExport, id),
  projectPresetImportPath: (
    sourcePath: string
  ): Promise<ProjectPresetLibraryRecord> =>
    ipcRenderer.invoke(IPC.projectPresetImportPath, sourcePath),
  projectPresetExportPath: (
    id: string,
    destination: string
  ): Promise<string> =>
    ipcRenderer.invoke(IPC.projectPresetExportPath, id, destination),
  assetChooseReplacement: (
    request: AssetReplacementRequest
  ): Promise<AssetMatch | null> =>
    ipcRenderer.invoke(IPC.assetChooseReplacement, request),
  assetSearchFolder: (
    request: AssetSearchRequest
  ): Promise<AssetMatch[] | null> =>
    ipcRenderer.invoke(IPC.assetSearchFolder, request),
  assetInspectPath: (
    request: AssetReplacementRequest,
    candidatePath: string
  ): Promise<AssetMatch> =>
    ipcRenderer.invoke(IPC.assetInspectPath, request, candidatePath)
};

contextBridge.exposeInMainWorld("avs", api);

export type AvsApi = typeof api;
