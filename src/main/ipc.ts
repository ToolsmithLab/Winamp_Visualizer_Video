import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { cancelExport, startExport } from "./exportService";
import {
  projectMRuntime,
  validateProjectMPreset
} from "./projectm/projectMRuntime";
import {
  initializePresetLibrary,
  presetCatalog,
  presetImporter,
  presetLibrary
} from "./presets/presetRuntime";
import { IPC, type ExportRequest, type MediaPayload } from "../shared/ipc";
import type { VisualizerProject } from "../shared/project";
import type { PresetRecord } from "../shared/presets";
import {
  loadProjectFile,
  saveProjectFile
} from "./project/projectFileService";
import { ProjectPresetService } from "./project/projectPresetService";
import { MediaRelinkService } from "./project/mediaRelinkService";
import { exportBlockingAssets } from "../engine/project/assetResolver";
import { decodeClipAudio, inspectClip } from "./mediaService";

const audioFilters = [
  { name: "Audio supportato", extensions: ["mp3", "wav"] }
];
const clipFilters = [
  {
    name: "Clip video compatibile",
    extensions: ["mp4", "m4v", "mov", "webm"]
  }
];
const imageFilters = [
  { name: "Immagini", extensions: ["png", "jpg", "jpeg", "webp"] }
];
const projectFilters = [
  { name: "Progetto Audio Visualizer Studio", extensions: ["avsproject"] }
];
const projectPresetFilters = [
  { name: "Preset di progetto", extensions: ["avspreset"] }
];

function assetFilters(type: import("../shared/project").AssetType) {
  if (type === "audio") return audioFilters;
  if (type === "clip") return clipFilters;
  if (type === "cover") return imageFilters;
  if (type === "milkdrop-preset") {
    return [{ name: "Preset MilkDrop", extensions: ["milk"] }];
  }
  return [
    {
      name: "Texture projectM",
      extensions: ["png", "jpg", "jpeg", "webp", "dds", "tga"]
    }
  ];
}

function mimeTypeFor(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  const mimeTypes: Record<string, string> = {
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".mp4": "video/mp4",
    ".m4v": "video/mp4",
    ".mov": "video/quicktime",
    ".mkv": "video/x-matroska",
    ".webm": "video/webm",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp"
  };
  return mimeTypes[extension] ?? "application/octet-stream";
}

export function registerIpc(window: BrowserWindow): void {
  const runtimeAudit = process.argv.includes("--avs-runtime-test");
  const projectPresetService = new ProjectPresetService(
    path.join(app.getPath("userData"), "project-presets")
  );
  const mediaRelinkService = new MediaRelinkService();
  const loadProjectPath = async (projectPath: string) => {
    let project = await loadProjectFile(projectPath);
    project = await mediaRelinkService.synchronizeManifest(project, projectPath);
    project = await mediaRelinkService.resolveProject(project, projectPath);
    await initializePresetLibrary();
    let libraryPreset =
      presetLibrary().findById(project.projectM.presetId) ||
      (project.projectM.presetHash
        ? presetLibrary().findByHash(project.projectM.presetHash)
        : undefined);
    if (!libraryPreset && project.projectM.presetHash && project.projectM.presetPath) {
      const now = new Date().toISOString();
      const restored: PresetRecord = {
        id: project.projectM.presetId,
        name: project.projectM.presetName || path.basename(project.projectM.presetPath, ".milk"),
        author: null,
        path: project.projectM.presetPath,
        origin: {
          kind: "external-file",
          sourcePath: project.projectM.presetPath,
          label: "Ripristinato dal progetto"
        },
        importedAt: now,
        updatedAt: now,
        hash: project.projectM.presetHash,
        status: existsSync(project.projectM.presetPath) ? "warning" : "missing",
        license: project.projectM.presetLicense || "Licenza non verificata",
        licenseVerified: project.projectM.presetLicenseVerified,
        textures: project.projectM.texturePaths.map((texturePath) => ({
          reference: path.basename(texturePath),
          path: texturePath,
          hash: null,
          missing: !existsSync(texturePath)
        })),
        missingTextures: [...project.projectM.missingTextures],
        compatibility: "unknown",
        favorite: project.projectM.favoritePresetIds.includes(project.projectM.presetId),
        quarantined: false,
        quarantineReason: "",
        errorReport: ["Record ricostruito dal progetto; richiede rivalidazione."],
        thumbnailPath: null
      };
      libraryPreset = (await presetLibrary().add(restored)).record;
    }
    if (libraryPreset) {
      project.projectM.presetId = libraryPreset.id;
      project.projectM.presetPath = libraryPreset.path;
    }
    return { path: projectPath, project };
  };

  ipcMain.handle(IPC.chooseAudio, async () => {
    const result = await dialog.showOpenDialog(window, {
      title: "Scegli un file audio",
      properties: ["openFile"],
      filters: audioFilters
    });
    if (result.canceled || !result.filePaths[0]) {
      return null;
    }
    return {
      path: result.filePaths[0],
      name: path.basename(result.filePaths[0])
    };
  });

  ipcMain.handle(IPC.chooseClip, async () => {
    const result = await dialog.showOpenDialog(window, {
      title: "Scegli una clip video",
      properties: ["openFile"],
      filters: clipFilters
    });
    if (result.canceled || !result.filePaths[0]) {
      return null;
    }
    return {
      path: result.filePaths[0],
      name: path.basename(result.filePaths[0])
    };
  });

  ipcMain.handle(IPC.chooseCover, async () => {
    const result = await dialog.showOpenDialog(window, {
      title: "Scegli una copertina",
      properties: ["openFile"],
      filters: imageFilters
    });
    if (result.canceled || !result.filePaths[0]) {
      return null;
    }
    return {
      path: result.filePaths[0],
      name: path.basename(result.filePaths[0])
    };
  });

  ipcMain.handle(IPC.readMedia, async (_event, filePath: string): Promise<MediaPayload> => {
    const bytes = await readFile(filePath);
    return {
      path: filePath,
      name: path.basename(filePath),
      bytes: new Uint8Array(bytes),
      mimeType: mimeTypeFor(filePath)
    };
  });

  ipcMain.handle(IPC.inspectClip, async (_event, filePath: string) =>
    inspectClip(filePath)
  );

  ipcMain.handle(IPC.readClipAudio, async (_event, filePath: string) =>
    decodeClipAudio(filePath)
  );

  ipcMain.handle(
    IPC.saveProject,
    async (
      _event,
      project: VisualizerProject,
      currentPath?: string
    ) => {
      let targetPath = currentPath;
      if (!targetPath) {
        const result = await dialog.showSaveDialog(window, {
          title: "Salva progetto",
          defaultPath: `${project.name || "progetto"}.avsproject`,
          filters: projectFilters
        });
        if (result.canceled || !result.filePath) {
          return null;
        }
        targetPath = result.filePath;
      }

      const withManifest = await mediaRelinkService.synchronizeManifest(
        project,
        targetPath
      );
      const normalized = await saveProjectFile(targetPath, withManifest);
      return { path: targetPath, project: normalized };
    }
  );

  ipcMain.handle(IPC.openProject, async () => {
    const result = await dialog.showOpenDialog(window, {
      title: "Apri progetto",
      properties: ["openFile"],
      filters: projectFilters
    });
    if (result.canceled || !result.filePaths[0]) {
      return null;
    }
    return loadProjectPath(result.filePaths[0]);
  });

  ipcMain.handle(IPC.openProjectPath, async (_event, projectPath: string) => {
    if (!runtimeAudit) throw new Error("Apertura diretta disponibile solo nei test runtime.");
    return loadProjectPath(projectPath);
  });

  ipcMain.handle(
    IPC.exportVideo,
    async (_event, request: Omit<ExportRequest, "destination">) => {
      const result = await dialog.showSaveDialog(window, {
        title: "Esporta video MP4",
        defaultPath: `${request.project.name || "visualizer"}.mp4`,
        filters: [{ name: "Video MP4", extensions: ["mp4"] }]
      });
      if (result.canceled || !result.filePath) {
        return null;
      }
      const project = await mediaRelinkService.synchronizeManifest(
        request.project
      );
      const blockers = exportBlockingAssets(project);
      if (blockers.length) {
        throw new Error(
          `Esportazione bloccata: asset essenziali irrisolti (${blockers
            .map((asset) => asset.fileName || asset.id)
            .join(", ")}).`
        );
      }
      await initializePresetLibrary();
      await startExport(
        window,
        project,
        result.filePath,
        presetLibrary().list()
      );
      return result.filePath;
    }
  );

  ipcMain.handle(
    IPC.exportVideoPath,
    async (
      _event,
      request: Omit<ExportRequest, "destination">,
      destination: string
    ) => {
      if (!runtimeAudit) throw new Error("Export diretto disponibile solo nei test runtime.");
      const project = await mediaRelinkService.synchronizeManifest(
        request.project
      );
      const blockers = exportBlockingAssets(project);
      if (blockers.length) {
        throw new Error(
          `Esportazione bloccata: asset essenziali irrisolti (${blockers
            .map((asset) => asset.fileName || asset.id)
            .join(", ")}).`
        );
      }
      await initializePresetLibrary();
      await startExport(window, project, destination, presetLibrary().list());
      return destination;
    }
  );

  ipcMain.handle(IPC.cancelExport, () => cancelExport());

  ipcMain.handle(IPC.projectMStatus, () => projectMRuntime.status);
  ipcMain.handle(
    IPC.projectMInitialize,
    (_event, width: number, height: number, seed: number) =>
      projectMRuntime.initialize(width, height, seed)
  );
  ipcMain.handle(
    IPC.projectMReset,
    (_event, width: number, height: number, seed: number) =>
      projectMRuntime.reset(width, height, seed)
  );
  ipcMain.handle(IPC.projectMRender, (_event, request) =>
    projectMRuntime.render(request)
  );
  ipcMain.handle(IPC.projectMShutdown, () => projectMRuntime.shutdown());

  ipcMain.handle(IPC.presetList, async (_event, query) => {
    await initializePresetLibrary();
    await presetLibrary().refreshMissingState();
    return presetLibrary().list(query);
  });

  ipcMain.handle(IPC.presetImport, async (_event, request) => {
    await initializePresetLibrary();
    const auditPaths =
      runtimeAudit && Array.isArray(request.auditPaths)
        ? request.auditPaths.filter((entry: unknown): entry is string => typeof entry === "string")
        : [];
    if (request.kind === "files") {
      if (auditPaths.length) {
        return presetImporter().importFiles(auditPaths, request.mode);
      }
      const result = await dialog.showOpenDialog(window, {
        title: "Importa preset MilkDrop",
        properties: ["openFile", "multiSelections"],
        filters: [{ name: "Preset MilkDrop", extensions: ["milk"] }]
      });
      if (result.canceled || !result.filePaths.length) return null;
      return presetImporter().importFiles(result.filePaths, request.mode);
    }
    if (request.kind === "folder") {
      if (auditPaths[0]) {
        return presetImporter().importFolder(auditPaths[0], request.mode);
      }
      const result = await dialog.showOpenDialog(window, {
        title:
          request.mode === "link"
            ? "Collega cartella di preset MilkDrop"
            : "Copia cartella nella libreria preset",
        properties: ["openDirectory"]
      });
      if (result.canceled || !result.filePaths[0]) return null;
      return presetImporter().importFolder(result.filePaths[0], request.mode);
    }
    if (auditPaths[0]) {
      return presetImporter().importZip(auditPaths[0]);
    }
    const result = await dialog.showOpenDialog(window, {
      title: "Importa archivio ZIP di preset MilkDrop",
      properties: ["openFile"],
      filters: [{ name: "Archivio ZIP", extensions: ["zip"] }]
    });
    if (result.canceled || !result.filePaths[0]) return null;
    return presetImporter().importZip(result.filePaths[0]);
  });

  ipcMain.handle(IPC.presetSelect, async (_event, input) => {
    const request =
      typeof input === "string"
        ? { id: input, smoothTransition: false, transitionSeconds: 0 }
        : input;
    const id = request.id as string;
    await initializePresetLibrary();
    await presetLibrary().refreshMissingState();
    const preset = presetLibrary().findById(id);
    if (!preset) throw new Error("Preset MilkDrop non trovato nella libreria.");
    if (preset.status === "missing") {
      throw new Error("Preset mancante. Usa Ricollega prima di caricarlo.");
    }
    if (preset.quarantined) {
      throw new Error(`Preset in quarantena: ${preset.quarantineReason || "errore precedente"}`);
    }
    try {
      const status = await projectMRuntime.loadPreset(preset.path, {
        smoothTransition: Boolean(request.smoothTransition),
        transitionSeconds: Number(request.transitionSeconds) || 0
      });
      return { preset, status };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await presetLibrary().quarantine(id, message);
      throw new Error(`projectM ha rifiutato il preset; spostato in quarantena. ${message}`);
    }
  });

  ipcMain.handle(IPC.presetLock, async (_event, locked: boolean) =>
    projectMRuntime.setPresetLocked(Boolean(locked))
  );

  ipcMain.handle(
    IPC.presetFavorite,
    async (_event, id: string, favorite: boolean) => {
      await initializePresetLibrary();
      return presetLibrary().setFavorite(id, favorite);
    }
  );
  ipcMain.handle(IPC.presetDelete, async (_event, id: string) => {
    await initializePresetLibrary();
    await presetLibrary().remove(id);
  });
  ipcMain.handle(IPC.presetOpenPath, async (_event, id: string) => {
    await initializePresetLibrary();
    const preset = presetLibrary().findById(id);
    if (!preset) throw new Error("Preset non trovato.");
    shell.showItemInFolder(preset.path);
  });
  ipcMain.handle(IPC.presetUpdateMetadata, async (_event, update) => {
    await initializePresetLibrary();
    return presetLibrary().updateMetadata(update);
  });
  ipcMain.handle(IPC.presetRelink, async (_event, request) => {
    await initializePresetLibrary();
    const preset = presetLibrary().findById(request.id);
    if (!preset) throw new Error("Preset da ricollegare non trovato.");
    let candidatePath = request.candidatePath;
    if (!candidatePath) {
      const result = await dialog.showOpenDialog(window, {
        title: `Ricollega ${preset.name}`,
        properties: ["openFile"],
        filters: [{ name: "Preset MilkDrop", extensions: ["milk"] }]
      });
      if (result.canceled || !result.filePaths[0]) return null;
      candidatePath = result.filePaths[0];
    }
    const relinked = await presetLibrary().relink(request.id, candidatePath);
    const validation = await validateProjectMPreset(relinked.path);
    if (!validation.valid) {
      return presetLibrary().quarantine(relinked.id, validation.error);
    }
    return relinked;
  });
  ipcMain.handle(IPC.presetRefresh, async () => {
    await initializePresetLibrary();
    await presetLibrary().refreshMissingState();
    return presetLibrary().list();
  });
  ipcMain.handle(IPC.presetClearQuarantine, async (_event, id: string) => {
    await initializePresetLibrary();
    const preset = presetLibrary().findById(id);
    if (!preset) throw new Error("Preset non trovato.");
    const validation = await validateProjectMPreset(preset.path);
    if (!validation.valid) {
      throw new Error(`Preset ancora non compatibile: ${validation.error}`);
    }
    return presetLibrary().clearQuarantine(id);
  });
  ipcMain.handle(IPC.presetThumbnail, async (_event, id: string) => {
    await initializePresetLibrary();
    return presetLibrary().readThumbnail(id);
  });
  ipcMain.handle(IPC.presetCatalogList, async () => {
    await initializePresetLibrary();
    return presetCatalog().list();
  });
  ipcMain.handle(IPC.presetCatalogInstall, async (_event, id: string) => {
    await initializePresetLibrary();
    return presetCatalog().install(id);
  });
  ipcMain.handle(IPC.presetCatalogUpdate, async (_event, id: string) => {
    await initializePresetLibrary();
    return presetCatalog().install(id);
  });
  ipcMain.handle(IPC.presetCatalogUninstall, async (_event, id: string) => {
    await initializePresetLibrary();
    return presetCatalog().uninstall(id);
  });
  ipcMain.handle(IPC.presetCatalogVerify, async (_event, id: string) => {
    await initializePresetLibrary();
    return presetCatalog().verify(id);
  });
  ipcMain.handle(IPC.presetCatalogOpenSource, async (_event, id: string) => {
    await initializePresetLibrary();
    const catalog = await presetCatalog().list();
    const item = catalog.packages.find((entry) => entry.id === id);
    if (!item) throw new Error("Pacchetto non trovato nel catalogo verificato.");
    await shell.openExternal(item.sourceUrl);
  });
  ipcMain.handle(IPC.presetCatalogReadLicense, async (_event, id: string) => {
    await initializePresetLibrary();
    return presetCatalog().licenseText(id);
  });

  ipcMain.handle(IPC.projectPresetList, async (_event, query) =>
    projectPresetService.list(query)
  );
  ipcMain.handle(IPC.projectPresetCreate, async (_event, request) => {
    const project = await mediaRelinkService.synchronizeManifest(
      request.project
    );
    return projectPresetService.create({ ...request, project });
  });
  ipcMain.handle(IPC.projectPresetImport, async () => {
    const result = await dialog.showOpenDialog(window, {
      title: "Importa Preset di progetto",
      properties: ["openFile"],
      filters: projectPresetFilters
    });
    if (result.canceled || !result.filePaths[0]) return null;
    return projectPresetService.importPreset(result.filePaths[0]);
  });
  ipcMain.handle(IPC.projectPresetPreview, async (_event, request) =>
    projectPresetService.preview(request.id, request.project, true)
  );
  ipcMain.handle(
    IPC.projectPresetRename,
    async (_event, id: string, name: string) =>
      projectPresetService.rename(id, name)
  );
  ipcMain.handle(IPC.projectPresetDuplicate, async (_event, id: string) =>
    projectPresetService.duplicate(id)
  );
  ipcMain.handle(IPC.projectPresetDelete, async (_event, id: string) =>
    projectPresetService.delete(id)
  );
  ipcMain.handle(IPC.projectPresetExport, async (_event, id: string) => {
    const records = await projectPresetService.list();
    const record = records.find((item) => item.id === id);
    if (!record) throw new Error("Preset di progetto non trovato.");
    const result = await dialog.showSaveDialog(window, {
      title: "Esporta Preset di progetto",
      defaultPath: `${record.name}.avspreset`,
      filters: projectPresetFilters
    });
    if (result.canceled || !result.filePath) return null;
    await projectPresetService.export(id, result.filePath);
    return result.filePath;
  });
  ipcMain.handle(
    IPC.projectPresetImportPath,
    async (_event, sourcePath: string) => {
      if (!runtimeAudit) {
        throw new Error("Import diretto disponibile solo nei test runtime.");
      }
      return projectPresetService.importPreset(sourcePath);
    }
  );
  ipcMain.handle(
    IPC.projectPresetExportPath,
    async (_event, id: string, destination: string) => {
      if (!runtimeAudit) {
        throw new Error("Export diretto disponibile solo nei test runtime.");
      }
      await projectPresetService.export(id, destination);
      return destination;
    }
  );
  ipcMain.handle(IPC.assetChooseReplacement, async (_event, request) => {
    const asset = request.asset;
    const result = await dialog.showOpenDialog(window, {
      title: `Ricollega ${asset.fileName || asset.id}`,
      properties: ["openFile"],
      filters: assetFilters(asset.type)
    });
    if (result.canceled || !result.filePaths[0]) return null;
    return mediaRelinkService.inspect(asset, result.filePaths[0]);
  });
  ipcMain.handle(IPC.assetSearchFolder, async (_event, request) => {
    const result = await dialog.showOpenDialog(window, {
      title: "Cerca asset mancanti nella cartella",
      properties: ["openDirectory"]
    });
    if (result.canceled || !result.filePaths[0]) return null;
    return mediaRelinkService.search(
      request.assets,
      result.filePaths[0],
      request.recursive === true
    );
  });
  ipcMain.handle(
    IPC.assetInspectPath,
    async (_event, request, candidatePath: string) => {
      if (!runtimeAudit) {
        throw new Error("Ricollegamento diretto disponibile solo nei test runtime.");
      }
      return mediaRelinkService.inspect(request.asset, candidatePath);
    }
  );
}
