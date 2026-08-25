import path from "node:path";
import { app } from "electron";
import { runtimePaths, validateProjectMPreset } from "../projectm/projectMRuntime";
import { PresetImportService } from "./presetImportService";
import { PresetLibraryService } from "./presetLibraryService";
import { PresetCatalogService } from "./presetCatalogService";

let libraryValue: PresetLibraryService | null = null;
let importerValue: PresetImportService | null = null;
let catalogValue: PresetCatalogService | null = null;
let initialization: Promise<void> | null = null;

function applicationRoot(): string {
  return app.isPackaged
    ? process.resourcesPath
    : path.resolve(__dirname, "../../..");
}

export function presetLibrary(): PresetLibraryService {
  if (!libraryValue) {
    libraryValue = new PresetLibraryService(
      path.join(app.getPath("userData"), "preset-library")
    );
  }
  return libraryValue;
}

export function presetImporter(): PresetImportService {
  if (!importerValue) {
    importerValue = new PresetImportService(
      presetLibrary(),
      validateProjectMPreset
    );
  }
  return importerValue;
}

export function presetCatalog(): PresetCatalogService {
  if (!catalogValue) {
    const root = applicationRoot();
    catalogValue = new PresetCatalogService(
      app.isPackaged
        ? path.join(root, "preset-catalog", "catalog-v1.json")
        : path.join(root, "assets", "preset-catalog", "catalog-v1.json"),
      path.join(root, "licenses"),
      path.join(app.getPath("userData"), "preset-catalog"),
      presetLibrary(),
      presetImporter()
    );
  }
  return catalogValue;
}

export async function initializePresetLibrary(): Promise<void> {
  if (!initialization) {
    initialization = (async () => {
      const library = presetLibrary();
      await library.initialize();
      await library.ensureBundled(runtimePaths().presetPath);
      await presetCatalog().initialize();
    })();
  }
  await initialization;
}
