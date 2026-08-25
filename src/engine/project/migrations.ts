export type ProjectDocument = Record<string, unknown>;

export class FutureProjectVersionError extends Error {
  constructor(readonly version: string) {
    super(
      `Il progetto usa lo schema ${version}, più recente del formato 6.0 supportato. ` +
        "Il file non è stato modificato."
    );
    this.name = "FutureProjectVersionError";
  }
}

function isRecord(value: unknown): value is ProjectDocument {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cloneRecord(value: ProjectDocument): ProjectDocument {
  return structuredClone(value);
}

function parseMajorVersion(value: unknown): number {
  const version = typeof value === "string" && value ? value : "1.0";
  const match = /^(\d+)(?:\.\d+)?$/.exec(version);
  if (!match) {
    throw new Error(`Versione progetto non valida: ${String(value)}`);
  }
  const major = Number(match[1]);
  if (!Number.isSafeInteger(major) || major < 1) {
    throw new Error(`Versione progetto non valida: ${version}`);
  }
  if (major > 6) throw new FutureProjectVersionError(version);
  return major;
}

function withVersion(
  document: ProjectDocument,
  version: `${number}.0`
): ProjectDocument {
  return { ...document, version };
}

export function migrate1To2(document: ProjectDocument): ProjectDocument {
  return withVersion(cloneRecord(document), "2.0");
}

export function migrate2To3(document: ProjectDocument): ProjectDocument {
  return withVersion(cloneRecord(document), "3.0");
}

export function migrate3To4(document: ProjectDocument): ProjectDocument {
  return withVersion(cloneRecord(document), "4.0");
}

export function migrate4To5(document: ProjectDocument): ProjectDocument {
  return withVersion(cloneRecord(document), "5.0");
}

function legacyTransform(
  layer: ProjectDocument,
  document: ProjectDocument
): ProjectDocument {
  const cover = isRecord(document.cover) ? document.cover : {};
  const text = isRecord(document.text) ? document.text : {};
  const kind = layer.kind;
  if (kind === "cover") {
    return {
      x: typeof cover.x === "number" ? cover.x : 0.5,
      y: typeof cover.y === "number" ? cover.y : 0.35,
      scaleX: 1,
      scaleY: 1,
      rotation: 0
    };
  }
  if (kind === "artistText") {
    return {
      x: typeof text.artistX === "number" ? text.artistX : 0.5,
      y: typeof text.artistY === "number" ? text.artistY : 0.57,
      scaleX: 1,
      scaleY: 1,
      rotation: 0
    };
  }
  if (kind === "titleText") {
    return {
      x: typeof text.titleX === "number" ? text.titleX : 0.5,
      y: typeof text.titleY === "number" ? text.titleY : 0.625,
      scaleX: 1,
      scaleY: 1,
      rotation: 0
    };
  }
  return { x: 0.5, y: 0.5, scaleX: 1, scaleY: 1, rotation: 0 };
}

function migrateLayerTo6(
  value: unknown,
  document: ProjectDocument
): unknown {
  if (!isRecord(value)) return value;
  const layer = cloneRecord(value);
  if (!isRecord(layer.transform)) {
    layer.transform = legacyTransform(layer, document);
  }
  if (!Array.isArray(layer.keyframes)) layer.keyframes = [];
  if (layer.kind === "visualizer" && !isRecord(layer.plugin)) {
    const id = typeof layer.pluginId === "string" ? layer.pluginId : "";
    layer.plugin = {
      id,
      version: "1.0.0",
      settings: isRecord(layer.reactive) ? cloneRecord(layer.reactive) : {}
    };
  }
  return layer;
}

function assetReferences(document: ProjectDocument): ProjectDocument[] {
  if (Array.isArray(document.assets)) {
    return structuredClone(document.assets.filter(isRecord));
  }
  const assets: ProjectDocument[] = [];
  if (typeof document.audioFile === "string" && document.audioFile) {
    assets.push({
      id: "audio-main",
      type: "audio",
      path: document.audioFile,
      hash: null
    });
  }
  const cover = isRecord(document.cover) ? document.cover : {};
  if (typeof cover.filePath === "string" && cover.filePath) {
    assets.push({
      id: "cover-main",
      type: "cover",
      path: cover.filePath,
      hash: null
    });
  }
  const projectM = isRecord(document.projectM) ? document.projectM : {};
  if (typeof projectM.presetPath === "string" && projectM.presetPath) {
    assets.push({
      id: "projectm-preset",
      type: "milkdrop-preset",
      path: projectM.presetPath,
      hash: typeof projectM.presetHash === "string" ? projectM.presetHash : null
    });
  }
  if (Array.isArray(projectM.texturePaths)) {
    projectM.texturePaths.forEach((texturePath, index) => {
      if (typeof texturePath !== "string" || !texturePath) return;
      assets.push({
        id: `projectm-texture-${index}`,
        type: "texture",
        path: texturePath,
        hash: null
      });
    });
  }
  return assets;
}

export function migrate5To6(document: ProjectDocument): ProjectDocument {
  const migrated = cloneRecord(document);
  if (Array.isArray(migrated.layers)) {
    migrated.layers = migrated.layers.map((layer) =>
      migrateLayerTo6(layer, migrated)
    );
  }
  migrated.assets = assetReferences(migrated);
  migrated.version = "6.0";
  return migrated;
}

export function migrateProjectDocument(value: unknown): ProjectDocument {
  if (!isRecord(value)) {
    throw new Error("Il file progetto deve contenere un oggetto JSON.");
  }
  let document = cloneRecord(value);
  let version = parseMajorVersion(document.version);
  while (version < 6) {
    if (version === 1) document = migrate1To2(document);
    else if (version === 2) document = migrate2To3(document);
    else if (version === 3) document = migrate3To4(document);
    else if (version === 4) document = migrate4To5(document);
    else if (version === 5) document = migrate5To6(document);
    version += 1;
  }
  return document;
}
