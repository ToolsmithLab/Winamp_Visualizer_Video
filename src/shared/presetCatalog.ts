export type CatalogPackageState =
  | "not-installed"
  | "installed"
  | "update-available"
  | "integrity-error";

export interface VerifiedPresetPackage {
  id: string;
  name: string;
  version: string;
  sourceUrl: string;
  downloadUrl: string;
  license: string;
  licenseUrl: string;
  licenseTextPath: string;
  authors: string[];
  attribution: string[];
  sha256: string;
  presetCount: number;
  textureCount: number;
  textureInventory: Array<{
    path: string;
    license: string;
    licenseUrl: string;
  }>;
  projectMVersion: string;
  releaseDate: string;
  verifiedAt: string;
  archive: {
    format: "zip";
    includePrefix: string;
  };
}

export interface VerifiedPresetCatalogManifest {
  schemaVersion: 1;
  catalogVersion: string;
  generatedAt: string;
  packages: VerifiedPresetPackage[];
  excluded: Array<{
    name: string;
    sourceUrl: string;
    reason: string;
    reviewedAt: string;
  }>;
}

export interface CatalogPackageView extends VerifiedPresetPackage {
  state: CatalogPackageState;
  installedVersion: string | null;
  installedAt: string | null;
  integrityVerifiedAt: string | null;
  integrityError: string;
}

export interface PresetCatalogView {
  catalogVersion: string;
  generatedAt: string;
  packages: CatalogPackageView[];
}

export interface CatalogActionResult {
  package: CatalogPackageView;
  importedPresets: number;
  duplicatePresets: number;
  message: string;
}
