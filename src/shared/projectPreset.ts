import {
  createDefaultProject,
  normalizeProject,
  type ProjectAssetReference,
  type VisualizerProject
} from "./project";

export const PROJECT_PRESET_FORMAT = "audio-visualizer-studio-project-preset";
export const PROJECT_PRESET_VERSION = "1.0";

export const PROJECT_PRESET_LIMITS = Object.freeze({
  fileBytes: 2 * 1024 * 1024,
  depth: 32,
  properties: 20_000,
  stringLength: 8_192,
  layers: 128,
  keyframes: 10_000,
  assets: 512
});

export interface ProjectPresetAssetOptions {
  audio: boolean;
  cover: boolean;
  milkdropPreset: boolean;
  textures: boolean;
}

export interface ProjectPresetMetadata {
  id: string;
  name: string;
  description: string;
  author: string | null;
  createdAt: string;
  modifiedAt: string;
}

export interface ProjectPresetVisual {
  canvas: VisualizerProject["canvas"];
  cover: VisualizerProject["cover"];
  text: VisualizerProject["text"];
  projectM: VisualizerProject["projectM"];
  layers: VisualizerProject["layers"];
  exportSettings: VisualizerProject["exportSettings"];
}

export interface ProjectPresetDocument {
  format: typeof PROJECT_PRESET_FORMAT;
  version: typeof PROJECT_PRESET_VERSION;
  metadata: ProjectPresetMetadata;
  includeAssets: ProjectPresetAssetOptions;
  visual: ProjectPresetVisual;
  assets: ProjectAssetReference[];
}

export interface ProjectPresetCompatibility {
  compatible: boolean;
  missingPluginIds: string[];
  missingAssets: ProjectAssetReference[];
  hashMismatches: ProjectAssetReference[];
  warnings: string[];
}

export interface ProjectPresetApplication {
  project: VisualizerProject;
  compatibility: ProjectPresetCompatibility;
  partial: boolean;
}

export interface ProjectPresetLibraryRecord {
  id: string;
  name: string;
  description: string;
  author: string | null;
  createdAt: string;
  modifiedAt: string;
  formatVersion: string;
  path: string;
  compatible: boolean;
  missingPluginIds: string[];
  missingAssetCount: number;
}

export interface ProjectPresetQuery {
  search?: string;
  sort?: "name" | "createdAt" | "modifiedAt";
  direction?: "asc" | "desc";
}

export interface ProjectPresetCreateRequest {
  project: VisualizerProject;
  name: string;
  description?: string;
  author?: string | null;
  includeAssets: ProjectPresetAssetOptions;
}

export interface ProjectPresetPreview {
  preset: ProjectPresetDocument;
  candidate: VisualizerProject;
  compatibility: ProjectPresetCompatibility;
  partial: boolean;
}

const knownPluginIds = new Set([
  "spectrumBars",
  "circularSpectrum",
  "waveformLine",
  "particleBurst",
  "pulseShapes",
  "dynamicVignette",
  "radialRays",
  "mirroredWaveform",
  "audioGrid",
  "orbitingParticles"
]);
const forbiddenKeys = new Set(["__proto__", "prototype", "constructor"]);
const runtimeOrExecutableKeys = new Set([
  "pcm",
  "framebuffer",
  "bitmap",
  "handle",
  "pid",
  "runtimeInstance",
  "command",
  "shell",
  "powershell",
  "javascript",
  "script",
  "html",
  "module",
  "dynamicImport",
  "function"
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requiredString(
  value: unknown,
  label: string,
  allowEmpty = false
): string {
  if (
    typeof value !== "string" ||
    (!allowEmpty && !value.trim()) ||
    value.length > PROJECT_PRESET_LIMITS.stringLength
  ) {
    throw new Error(`${label} non valido nel Preset di progetto.`);
  }
  return value;
}

function nullableString(value: unknown, label: string): string | null {
  if (value === null) return null;
  return requiredString(value, label, true);
}

function inspectValue(
  value: unknown,
  location: string,
  depth: number,
  state: { properties: number; seen: Set<object> }
): void {
  if (depth > PROJECT_PRESET_LIMITS.depth) {
    throw new Error("Preset di progetto troppo annidato.");
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new Error(`Numero non finito in ${location}.`);
  }
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number"
  ) {
    return;
  }
  if (typeof value === "string") {
    if (value.length > PROJECT_PRESET_LIMITS.stringLength) {
      throw new Error(`Stringa troppo lunga in ${location}.`);
    }
    return;
  }
  if (typeof value !== "object") {
    throw new Error(`Valore eseguibile o non serializzabile in ${location}.`);
  }
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) {
    throw new Error(`Dati binari incorporati non ammessi in ${location}.`);
  }
  if (state.seen.has(value)) {
    throw new Error(`Riferimento circolare in ${location}.`);
  }
  state.seen.add(value);
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      inspectValue(value[index], `${location}[${index}]`, depth + 1, state);
    }
  } else {
    for (const key of Object.keys(value)) {
      state.properties += 1;
      if (state.properties > PROJECT_PRESET_LIMITS.properties) {
        throw new Error("Preset di progetto con troppe proprietà.");
      }
      if (forbiddenKeys.has(key)) {
        throw new Error(`Proprietà vietata nel Preset di progetto: ${key}.`);
      }
      if (runtimeOrExecutableKeys.has(key)) {
        throw new Error(`Campo runtime o eseguibile vietato: ${key}.`);
      }
      inspectValue(
        (value as Record<string, unknown>)[key],
        `${location}.${key}`,
        depth + 1,
        state
      );
    }
  }
  state.seen.delete(value);
}

function isAbsoluteOrUnsafeRelativePath(value: string): boolean {
  const normalized = value.replace(/\\/g, "/");
  return (
    /^[a-zA-Z]:/.test(value) ||
    value.startsWith("\\\\") ||
    value.startsWith("//") ||
    value.startsWith("\\\\.\\") ||
    value.startsWith("\\\\?\\") ||
    value.includes("\0") ||
    /(^|\/)\.\.(\/|$)/.test(normalized) ||
    /^(?:file|javascript|data|https?|shell|powershell):/i.test(value)
  );
}

function validateAsset(asset: unknown, index: number): ProjectAssetReference {
  if (!isRecord(asset)) {
    throw new Error(`Riferimento asset ${index + 1} non valido.`);
  }
  const type = asset.type;
  if (
    type !== "audio" &&
    type !== "cover" &&
    type !== "milkdrop-preset" &&
    type !== "texture"
  ) {
    throw new Error(`Tipo asset non supportato all'indice ${index + 1}.`);
  }
  const relativePath =
    asset.relativePath === null || asset.relativePath === undefined
      ? null
      : requiredString(asset.relativePath, "Percorso relativo asset");
  if (relativePath && isAbsoluteOrUnsafeRelativePath(relativePath)) {
    throw new Error(`Percorso asset non sicuro: ${relativePath}.`);
  }
  for (const key of ["path", "originalPath"] as const) {
    if (asset[key] !== null && asset[key] !== undefined) {
      throw new Error(
        `Il campo ${key} non può contenere percorsi assoluti in un .avspreset.`
      );
    }
  }
  const fileName =
    asset.fileName === null || asset.fileName === undefined
      ? null
      : requiredString(asset.fileName, "Nome asset");
  if (fileName && (fileName.includes("/") || fileName.includes("\\") || fileName.includes("\0"))) {
    throw new Error(`Nome asset non sicuro: ${fileName}.`);
  }
  if (
    fileName &&
    /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(fileName)
  ) {
    throw new Error(`Nome device Windows rifiutato: ${fileName}.`);
  }
  const accepted: Record<ProjectAssetReference["type"], RegExp> = {
    audio: /\.(?:wav|mp3)$/i,
    clip: /\.(?:mp4|m4v|mov|mkv|webm)$/i,
    cover: /\.(?:png|jpe?g|webp)$/i,
    "milkdrop-preset": /\.milk$/i,
    texture: /\.(?:png|jpe?g|webp|dds|tga)$/i
  };
  if (fileName && !accepted[type].test(fileName)) {
    throw new Error(`Estensione asset non ammessa: ${fileName}.`);
  }
  const size =
    asset.size === null || asset.size === undefined
      ? null
      : Number(asset.size);
  if (size !== null && (!Number.isSafeInteger(size) || size < 0)) {
    throw new Error(`Dimensione asset non valida all'indice ${index + 1}.`);
  }
  const statusValues = new Set([
    "available",
    "missing",
    "hash-mismatch",
    "inaccessible",
    "unsupported",
    "relinked",
    "ignored"
  ]);
  const status =
    typeof asset.status === "string" && statusValues.has(asset.status)
      ? (asset.status as ProjectAssetReference["status"])
      : "missing";
  const hash = nullableString(asset.hash, "Hash asset");
  if (hash && !/^[a-f0-9]{64}$/i.test(hash)) {
    throw new Error(`Hash SHA-256 non valido all'indice ${index + 1}.`);
  }
  return {
    id: requiredString(asset.id, "ID asset"),
    type,
    path: null,
    originalPath: null,
    relativePath,
    fileName,
    size,
    hash,
    status,
    required: asset.required === true
  };
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${label} non valido.`);
  return value;
}

function requireFinite(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} deve essere un numero finito.`);
  }
  return value;
}

function requireBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${label} deve essere booleano.`);
  return value;
}

function assertVisualShape(visual: Record<string, unknown>): void {
  const canvas = requireRecord(visual.canvas, "Canvas");
  requireFinite(canvas.width, "Larghezza canvas");
  requireFinite(canvas.height, "Altezza canvas");
  if (canvas.fps !== 30 && canvas.fps !== 60) {
    throw new Error("FPS canvas non validi.");
  }
  requiredString(canvas.backgroundColor, "Colore sfondo");
  requiredString(canvas.accentColor, "Colore accento");

  const cover = requireRecord(visual.cover, "Copertina");
  if (cover.filePath !== null) {
    throw new Error("La copertina nel .avspreset deve usare il manifest asset.");
  }
  for (const key of ["x", "y", "width", "height", "opacity", "cornerRadius"]) {
    requireFinite(cover[key], `Copertina.${key}`);
  }

  const text = requireRecord(visual.text, "Testo");
  for (const key of ["artist", "title", "color"]) {
    requiredString(text[key], `Testo.${key}`, true);
  }
  for (const key of [
    "artistX",
    "artistY",
    "artistSize",
    "titleX",
    "titleY",
    "titleSize"
  ]) {
    requireFinite(text[key], `Testo.${key}`);
  }
  const projectM = requireRecord(visual.projectM, "Motore projectM");
  requireBoolean(projectM.enabled, "projectM.enabled");
  for (const key of [
    "presetId",
    "presetHash",
    "presetName",
    "presetStatus",
    "presetLicense",
    "sequenceStartPresetId",
    "playbackOrder"
  ]) {
    requiredString(projectM[key], `projectM.${key}`, true);
  }
  if (projectM.presetPath !== null) {
    throw new Error("Il Preset MilkDrop nel .avspreset deve usare il manifest asset.");
  }
  for (const key of [
    "texturePaths",
    "missingTextures",
    "favoritePresetIds",
    "externalFolders",
    "playlistIds",
    "history",
    "markers"
  ]) {
    if (!Array.isArray(projectM[key])) {
      throw new Error(`projectM.${key} deve essere un array.`);
    }
  }
  if (
    (projectM.texturePaths as unknown[]).length ||
    (projectM.missingTextures as unknown[]).length ||
    (projectM.externalFolders as unknown[]).length
  ) {
    throw new Error(
      "Percorsi texture o cartelle esterne devono essere rappresentati nel manifest asset."
    );
  }
  for (const key of [
    "previewWidth",
    "previewHeight",
    "fps",
    "randomSeed",
    "particleSeed",
    "manualRandomCounter"
  ]) {
    requireFinite(projectM[key], `projectM.${key}`);
  }
  requireBoolean(projectM.presetLicenseVerified, "projectM.presetLicenseVerified");
  requireBoolean(projectM.locked, "projectM.locked");
  const automatic = requireRecord(projectM.autoSwitch, "Cambio automatico");
  requireBoolean(automatic.enabled, "Cambio automatico.enabled");
  requireBoolean(
    automatic.noImmediateRepeat,
    "Cambio automatico.noImmediateRepeat"
  );
  for (const key of ["intervalSeconds", "minimumSeconds", "maximumSeconds"]) {
    requireFinite(automatic[key], `Cambio automatico.${key}`);
  }
  requiredString(automatic.mode, "Cambio automatico.mode");
  requiredString(automatic.order, "Cambio automatico.order");
  const transition = requireRecord(projectM.transition, "Transizione");
  requireBoolean(transition.enabled, "Transizione.enabled");
  requireFinite(transition.durationSeconds, "Transizione.durationSeconds");

  const exportSettings = requireRecord(
    visual.exportSettings,
    "Profilo esportazione"
  );
  requireFinite(exportSettings.width, "Larghezza esportazione");
  requireFinite(exportSettings.height, "Altezza esportazione");
  if (exportSettings.fps !== 30 && exportSettings.fps !== 60) {
    throw new Error("FPS esportazione non validi.");
  }
  requiredString(exportSettings.videoBitrate, "Bitrate video");
  requiredString(exportSettings.audioBitrate, "Bitrate audio");
}

function assertLayerShape(layer: Record<string, unknown>, index: number): void {
  const label = `Livello ${index + 1}`;
  requiredString(layer.id, `${label}.id`);
  requiredString(layer.name, `${label}.name`);
  requiredString(layer.kind, `${label}.kind`);
  requireBoolean(layer.visible, `${label}.visible`);
  requireBoolean(layer.locked, `${label}.locked`);
  requireFinite(layer.opacity, `${label}.opacity`);
  requireFinite(layer.startTime, `${label}.startTime`);
  if (layer.endTime !== null) requireFinite(layer.endTime, `${label}.endTime`);
  requiredString(layer.blendMode, `${label}.blendMode`);
  const transform = requireRecord(layer.transform, `${label}.transform`);
  for (const key of ["x", "y", "scaleX", "scaleY", "rotation"]) {
    requireFinite(transform[key], `${label}.transform.${key}`);
  }
  if (!Array.isArray(layer.keyframes)) {
    throw new Error(`${label}.keyframes deve essere un array.`);
  }
  layer.keyframes.forEach((item, keyframeIndex) => {
    const keyframe = requireRecord(
      item,
      `${label}.keyframes[${keyframeIndex}]`
    );
    requiredString(keyframe.id, "ID keyframe");
    requiredString(keyframe.property, "Proprietà keyframe");
    requireFinite(keyframe.time, "Tempo keyframe");
    requiredString(keyframe.interpolation, "Interpolazione keyframe");
    if (
      ![
        "string",
        "number",
        "boolean"
      ].includes(typeof keyframe.value) &&
      keyframe.value !== null
    ) {
      throw new Error("Valore keyframe non valido.");
    }
  });
}

function assertIsoDate(value: unknown, label: string): string {
  const text = requiredString(value, label);
  if (!Number.isFinite(Date.parse(text))) {
    throw new Error(`${label} non valida.`);
  }
  return text;
}

export function validateProjectPreset(
  value: unknown
): ProjectPresetDocument {
  inspectValue(value, "preset", 0, { properties: 0, seen: new Set() });
  if (!isRecord(value)) {
    throw new Error("Il Preset di progetto deve contenere un oggetto JSON.");
  }
  if (value.format !== PROJECT_PRESET_FORMAT) {
    throw new Error("Formato Preset di progetto non riconosciuto.");
  }
  if (value.version !== PROJECT_PRESET_VERSION) {
    const version =
      typeof value.version === "string" ? value.version : "assente";
    throw new Error(
      `Versione Preset di progetto ${version} non supportata; richiesta ${PROJECT_PRESET_VERSION}.`
    );
  }
  if (!isRecord(value.metadata)) {
    throw new Error("Metadati Preset di progetto mancanti.");
  }
  if (!isRecord(value.includeAssets)) {
    throw new Error("Opzioni asset del Preset di progetto mancanti.");
  }
  if (!isRecord(value.visual)) {
    throw new Error("Configurazione visuale del Preset di progetto mancante.");
  }
  assertVisualShape(value.visual);
  if (!Array.isArray(value.assets)) {
    throw new Error("Manifest asset del Preset di progetto non valido.");
  }
  if (value.assets.length > PROJECT_PRESET_LIMITS.assets) {
    throw new Error("Troppi asset nel Preset di progetto.");
  }
  const layers = value.visual.layers;
  if (!Array.isArray(layers)) {
    throw new Error("I livelli del Preset di progetto devono essere un array.");
  }
  if (layers.length > PROJECT_PRESET_LIMITS.layers) {
    throw new Error("Troppi livelli nel Preset di progetto.");
  }
  let keyframeCount = 0;
  for (const layer of layers) {
    if (!isRecord(layer)) {
      throw new Error("Livello non valido nel Preset di progetto.");
    }
    if (layer.keyframes !== undefined && !Array.isArray(layer.keyframes)) {
      throw new Error("Lista keyframe non valida nel Preset di progetto.");
    }
    keyframeCount += Array.isArray(layer.keyframes) ? layer.keyframes.length : 0;
  }
  layers.forEach((layer, index) =>
    assertLayerShape(layer as Record<string, unknown>, index)
  );
  if (keyframeCount > PROJECT_PRESET_LIMITS.keyframes) {
    throw new Error("Troppi keyframe nel Preset di progetto.");
  }

  const metadata: ProjectPresetMetadata = {
    id: requiredString(value.metadata.id, "ID"),
    name: requiredString(value.metadata.name, "Nome"),
    description: requiredString(value.metadata.description, "Descrizione", true),
    author: nullableString(value.metadata.author, "Autore"),
    createdAt: assertIsoDate(value.metadata.createdAt, "Data creazione"),
    modifiedAt: assertIsoDate(value.metadata.modifiedAt, "Data modifica")
  };
  const includeAssets: ProjectPresetAssetOptions = {
    audio: value.includeAssets.audio === true,
    cover: value.includeAssets.cover === true,
    milkdropPreset: value.includeAssets.milkdropPreset === true,
    textures: value.includeAssets.textures === true
  };
  for (const key of ["audio", "cover", "milkdropPreset", "textures"] as const) {
    if (typeof value.includeAssets[key] !== "boolean") {
      throw new Error(`Opzione asset ${key} non valida.`);
    }
  }

  const scaffold = createDefaultProject();
  const normalized = normalizeProject({
    ...scaffold,
    canvas: value.visual.canvas,
    cover: value.visual.cover,
    text: value.visual.text,
    projectM: value.visual.projectM,
    layers: value.visual.layers,
    exportSettings: value.visual.exportSettings,
    assets: []
  });
  return {
    format: PROJECT_PRESET_FORMAT,
    version: PROJECT_PRESET_VERSION,
    metadata,
    includeAssets,
    visual: {
      canvas: normalized.canvas,
      cover: normalized.cover,
      text: normalized.text,
      projectM: normalized.projectM,
      layers: normalized.layers,
      exportSettings: normalized.exportSettings
    },
    assets: value.assets.map(validateAsset)
  };
}

export function inspectProjectPresetCompatibility(
  preset: ProjectPresetDocument
): ProjectPresetCompatibility {
  const missingPluginIds = [
    ...new Set(
      preset.visual.layers
        .filter((layer) => layer.kind === "visualizer")
        .map((layer) => layer.plugin?.id ?? layer.pluginId ?? "")
        .filter((id) => id && !knownPluginIds.has(id))
    )
  ].sort();
  const missingAssets = preset.assets.filter(
    (asset) =>
      asset.status === "missing" ||
      asset.status === "inaccessible" ||
      asset.status === "unsupported"
  );
  const hashMismatches = preset.assets.filter(
    (asset) => asset.status === "hash-mismatch"
  );
  const warnings: string[] = [];
  if (missingPluginIds.length) {
    warnings.push(`Plugin integrati mancanti: ${missingPluginIds.join(", ")}.`);
  }
  if (missingAssets.length) {
    warnings.push(`${missingAssets.length} asset non disponibili.`);
  }
  if (hashMismatches.length) {
    warnings.push(`${hashMismatches.length} asset con hash differente.`);
  }
  return {
    compatible: missingPluginIds.length === 0,
    missingPluginIds,
    missingAssets,
    hashMismatches,
    warnings
  };
}

function assetPath(
  assets: ProjectAssetReference[],
  type: ProjectAssetReference["type"]
): string | null {
  return (
    assets.find(
      (asset) =>
        asset.type === type &&
        asset.status !== "missing" &&
        asset.status !== "inaccessible" &&
        asset.status !== "unsupported" &&
        asset.status !== "hash-mismatch" &&
        asset.status !== "ignored"
    )?.path ?? null
  );
}

function applyValidatedProjectPreset(
  current: VisualizerProject,
  preset: ProjectPresetDocument,
  allowPartial = false
): ProjectPresetApplication {
  const compatibility = inspectProjectPresetCompatibility(preset);
  if (!compatibility.compatible && !allowPartial) {
    throw new Error(
      "Il Preset di progetto richiede plugin mancanti. Conferma esplicitamente l'applicazione parziale."
    );
  }
  const includesAssetType = (type: ProjectAssetReference["type"]): boolean => {
    if (type === "audio") return preset.includeAssets.audio;
    if (type === "cover") return preset.includeAssets.cover;
    if (type === "milkdrop-preset") return preset.includeAssets.milkdropPreset;
    return preset.includeAssets.textures;
  };
  const candidateAssets = [
    ...current.assets.filter((asset) => !includesAssetType(asset.type)),
    ...preset.assets.filter((asset) => includesAssetType(asset.type))
  ];
  const candidate = normalizeProject({
    ...structuredClone(current),
    canvas: preset.visual.canvas,
    cover: preset.visual.cover,
    text: preset.visual.text,
    projectM: preset.visual.projectM,
    layers: preset.visual.layers,
    exportSettings: preset.visual.exportSettings,
    assets: candidateAssets
  });
  if (!preset.includeAssets.audio) {
    candidate.audioFile = current.audioFile;
  } else {
    candidate.audioFile = assetPath(preset.assets, "audio");
  }
  if (!preset.includeAssets.cover) {
    candidate.cover.filePath = current.cover.filePath;
  } else {
    candidate.cover.filePath = assetPath(preset.assets, "cover");
  }
  if (!preset.includeAssets.milkdropPreset) {
    candidate.projectM.presetId = current.projectM.presetId;
    candidate.projectM.presetPath = current.projectM.presetPath;
    candidate.projectM.presetHash = current.projectM.presetHash;
    candidate.projectM.presetName = current.projectM.presetName;
  } else {
    candidate.projectM.presetPath = assetPath(
      preset.assets,
      "milkdrop-preset"
    );
  }
  if (!preset.includeAssets.textures) {
    candidate.projectM.texturePaths = [...current.projectM.texturePaths];
    candidate.projectM.missingTextures = [...current.projectM.missingTextures];
  } else {
    candidate.projectM.texturePaths = preset.assets
      .filter(
        (asset) =>
          asset.type === "texture" &&
          Boolean(asset.path) &&
          asset.status !== "missing" &&
          asset.status !== "ignored"
      )
      .map((asset) => asset.path!);
  }
  return {
    project: candidate,
    compatibility,
    partial: !compatibility.compatible
  };
}

export function applyProjectPreset(
  current: VisualizerProject,
  input: ProjectPresetDocument,
  allowPartial = false
): ProjectPresetApplication {
  return applyValidatedProjectPreset(
    current,
    validateProjectPreset(input),
    allowPartial
  );
}

export function applyResolvedProjectPreset(
  current: VisualizerProject,
  input: ProjectPresetDocument,
  allowPartial = false
): ProjectPresetApplication {
  const safe = validateProjectPreset({
    ...input,
    assets: input.assets.map((asset) => ({
      ...asset,
      path: null,
      originalPath: null
    }))
  });
  safe.assets = safe.assets.map((asset, index) => {
    const resolved = input.assets[index];
    const resolvedPath =
      resolved?.path && typeof resolved.path === "string" ? resolved.path : null;
    return {
      ...asset,
      path: resolvedPath,
      originalPath:
        resolved?.originalPath && typeof resolved.originalPath === "string"
          ? resolved.originalPath
          : resolvedPath,
      status: resolved?.status ?? asset.status
    };
  });
  return applyValidatedProjectPreset(current, safe, allowPartial);
}

export function createProjectPresetDocument(
  project: VisualizerProject,
  metadata: ProjectPresetMetadata,
  includeAssets: ProjectPresetAssetOptions,
  assets: ProjectAssetReference[] = project.assets
): ProjectPresetDocument {
  const selectedAssets = assets.filter((asset) => {
    if (asset.type === "audio") return includeAssets.audio;
    if (asset.type === "cover") return includeAssets.cover;
    if (asset.type === "milkdrop-preset") return includeAssets.milkdropPreset;
    return includeAssets.textures;
  });
  return validateProjectPreset({
    format: PROJECT_PRESET_FORMAT,
    version: PROJECT_PRESET_VERSION,
    metadata,
    includeAssets,
    visual: {
      canvas: project.canvas,
      cover: {
        ...project.cover,
        filePath: null
      },
      text: project.text,
      projectM: {
        ...project.projectM,
        presetPath: null,
        texturePaths: [],
        missingTextures: [],
        externalFolders: []
      },
      layers: project.layers,
      exportSettings: project.exportSettings
    },
    assets: selectedAssets.map((asset) => ({
      ...asset,
      path: null,
      originalPath: null
    }))
  });
}
