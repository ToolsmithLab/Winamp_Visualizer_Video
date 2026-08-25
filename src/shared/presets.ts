export type PresetOriginKind =
  | "bundled"
  | "internal"
  | "external-file"
  | "external-folder"
  | "zip"
  | "catalog";
export type PresetStatus =
  | "valid"
  | "warning"
  | "quarantined"
  | "missing"
  | "incompatible";
export type PresetCompatibility = "projectM-4.1.6" | "unknown" | "incompatible";
export type PresetImportKind = "files" | "folder" | "zip";
export type PresetImportMode = "copy" | "link";

export interface PresetTextureInfo {
  reference: string;
  path: string | null;
  hash: string | null;
  missing: boolean;
}

export interface PresetRecord {
  id: string;
  name: string;
  author: string | null;
  path: string;
  origin: {
    kind: PresetOriginKind;
    sourcePath: string;
    label: string;
  };
  importedAt: string;
  updatedAt: string;
  hash: string;
  status: PresetStatus;
  license: string;
  licenseVerified: boolean;
  textures: PresetTextureInfo[];
  missingTextures: string[];
  compatibility: PresetCompatibility;
  favorite: boolean;
  quarantined: boolean;
  quarantineReason: string;
  errorReport: string[];
  thumbnailPath: string | null;
  catalogPackage?: {
    id: string;
    version: string;
    archiveSha256: string;
  };
}

export interface ExternalPresetFolder {
  id: string;
  path: string;
  linkedAt: string;
  recursive: boolean;
  missing: boolean;
}

export interface PresetLibraryState {
  schema: 1;
  presets: PresetRecord[];
  externalFolders: ExternalPresetFolder[];
  updatedAt: string;
}

export interface PresetLibraryQuery {
  search?: string;
  status?: PresetStatus | "all";
  favoritesOnly?: boolean;
  license?: "all" | "verified" | "unverified";
  sort?: "name" | "importedAt" | "status" | "author";
  direction?: "asc" | "desc";
}

export interface PresetImportIssue {
  path: string;
  code: string;
  message: string;
  fatal: boolean;
}

export interface PresetImportReport {
  operationId: string;
  imported: PresetRecord[];
  duplicates: PresetRecord[];
  quarantined: PresetRecord[];
  issues: PresetImportIssue[];
  externalFolder?: ExternalPresetFolder;
}

export interface PresetImportRequest {
  kind: PresetImportKind;
  mode: PresetImportMode;
  /** Percorsi espliciti accettati esclusivamente con --avs-runtime-test. */
  auditPaths?: string[];
}

export interface PresetMetadataUpdate {
  id: string;
  name?: string;
  author?: string | null;
  license?: string;
  licenseVerified?: boolean;
}

export interface PresetRelinkRequest {
  id: string;
  candidatePath?: string;
}

export interface PresetValidationResult {
  valid: boolean;
  error: string;
  version: string;
  frameHash: string;
}
