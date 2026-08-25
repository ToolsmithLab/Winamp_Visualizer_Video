"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const yazl = require("yazl");
const {
  PresetSecurityError,
  assertSafeRelativePath,
  classifyAsset,
  sha256File,
  validateRegularAsset
} = require("../dist/main/presets/presetSecurity");
const {
  PresetLibraryService
} = require("../dist/main/presets/presetLibraryService");
const {
  PresetImportService,
  parsePresetMetadata
} = require("../dist/main/presets/presetImportService");
const {
  ProjectMHostService
} = require("../dist/main/projectm/projectMHostService");
const {
  createDefaultProject,
  normalizeProject
} = require("../dist/shared/project");

const root = path.resolve(__dirname, "..");
const fixtures = path.join(root, "tests", "fixtures", "preset-import");
const validFixture = path.join(fixtures, "valid.milk");
const corruptFixture = path.join(fixtures, "corrupt.milk");
const unicodeFixture = path.join(fixtures, "unicode", "Visualità Ω.milk");
const missingTextureFixture = path.join(fixtures, "missing-texture.milk");
const nativePaths = {
  hostPath: path.join(root, "native", "bin", "win-x64", "projectm-host.exe"),
  libraryPath: path.join(root, "native", "bin", "win-x64", "projectM-4.dll")
};
const nativeAvailable =
  process.platform === "win32" &&
  Object.values(nativePaths).every((filePath) => fsSync.existsSync(filePath));

async function temporary(t, label) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), `AVSPreset_${label}_`));
  t.after(async () => {
    await fs.rm(directory, { recursive: true, force: true });
  });
  return directory;
}

function fakeValidation(valid = true, error = "") {
  return async () => ({
    valid,
    error,
    version: valid ? "4.1.6" : "",
    frameHash: valid ? "frame-hash" : ""
  });
}

async function services(t, label, validator = fakeValidation()) {
  const directory = await temporary(t, label);
  const library = new PresetLibraryService(path.join(directory, "library"));
  await library.initialize();
  return {
    directory,
    library,
    importer: new PresetImportService(library, validator)
  };
}

async function writeZip(destination, entries) {
  await new Promise((resolve, reject) => {
    const zip = new yazl.ZipFile();
    const output = fsSync.createWriteStream(destination, { flags: "wx" });
    output.once("close", resolve);
    output.once("error", reject);
    zip.outputStream.once("error", reject);
    zip.outputStream.pipe(output);
    for (const entry of entries) {
      zip.addBuffer(Buffer.from(entry.contents), entry.name, {
        mode: entry.mode
      });
    }
    zip.end();
  });
}

function replaceAllEqualLength(buffer, from, to) {
  assert.equal(Buffer.byteLength(from), Buffer.byteLength(to));
  let offset = 0;
  while ((offset = buffer.indexOf(from, offset, "utf8")) >= 0) {
    buffer.write(to, offset, "utf8");
    offset += Buffer.byteLength(to);
  }
  return buffer;
}

test("normalizzazione rifiuta traversal, assoluti, device path e nomi Windows", () => {
  assert.equal(assertSafeRelativePath("cartella/preset.milk"), path.join("cartella", "preset.milk"));
  for (const hostile of [
    "../escape.milk",
    "C:/escape.milk",
    "/escape.milk",
    "\\\\?\\C:\\escape.milk",
    "\\\\.\\PhysicalDrive0",
    "folder/file.milk:stream",
    "CON/preset.milk"
  ]) {
    assert.throws(() => assertSafeRelativePath(hostile), PresetSecurityError);
  }
  const longSafe = Array.from({ length: 12 }, (_, index) =>
    `segmento-lungo-${index.toString().padStart(2, "0")}`
  ).join("/") + "/Visualità Ω.milk";
  assert.ok(assertSafeRelativePath(longSafe).length > 220);
});

test("tipo reale e file vietati vengono verificati", async (t) => {
  const directory = await temporary(t, "types");
  const fakeMilk = path.join(directory, "fake.milk");
  await fs.writeFile(fakeMilk, Buffer.from("MZ\x00\x00not milk", "binary"));
  await assert.rejects(validateRegularAsset(fakeMilk, "milk"), /MilkDrop riconoscibile/);
  assert.throws(() => classifyAsset("payload.EXE"), /eseguibile|script/);
  assert.throws(() => classifyAsset("payload.ps1"), /eseguibile|script/);
  await validateRegularAsset(validFixture, "milk");
});

test("SHA-256 è stabile e i duplicati sono content-addressed", async (t) => {
  const { importer } = await services(t, "duplicate");
  const expected = await sha256File(validFixture);
  assert.equal(expected, await sha256File(validFixture));
  const first = await importer.importFiles([validFixture], "copy");
  assert.equal(first.imported.length, 1);
  assert.equal(first.imported[0].hash, expected);
  const second = await importer.importFiles([validFixture], "copy");
  assert.equal(second.imported.length, 0);
  assert.equal(second.duplicates.length, 1);
});

test("metadati non inventano autore o licenza", async () => {
  const explicit = parsePresetMetadata(
    await fs.readFile(validFixture, "utf8"),
    validFixture
  );
  assert.equal(explicit.author, "Fixture Author");
  assert.equal(explicit.license, "CC0-1.0");
  const unknown = parsePresetMetadata(
    await fs.readFile(unicodeFixture, "utf8"),
    unicodeFixture
  );
  assert.equal(unknown.author, null);
  assert.equal(unknown.license, "Licenza non verificata");
});

test("selezione multipla e nomi Unicode vengono importati", async (t) => {
  const { importer } = await services(t, "multiple");
  const report = await importer.importFiles([validFixture, unicodeFixture], "copy");
  assert.equal(report.imported.length, 2);
  assert.ok(report.imported.some((preset) => preset.name === "Visualità Ω"));
  assert.ok(report.imported.every((preset) => preset.licenseVerified === false));
});

test("cartella ricorsiva e collegamento esterno persistono", async (t) => {
  const { directory, library, importer } = await services(t, "folder");
  const source = path.join(directory, "Sorgente Ω");
  await fs.mkdir(path.join(source, "annidata"), { recursive: true });
  await fs.copyFile(validFixture, path.join(source, "root.milk"));
  await fs.copyFile(unicodeFixture, path.join(source, "annidata", "Visualità Ω.milk"));
  const report = await importer.importFolder(source, "link");
  assert.equal(report.imported.length, 2);
  assert.equal(report.externalFolder.path, path.resolve(source));
  assert.ok(report.imported.every((preset) => preset.origin.kind === "external-folder"));
  const reopened = new PresetLibraryService(path.join(directory, "library"));
  await reopened.initialize();
  assert.equal(reopened.state.externalFolders.length, 1);
  assert.equal(reopened.list().length, 2);
});

test("cartella ricorsiva segnala un .milk invalido e importa gli altri", async (t) => {
  const { directory, importer } = await services(t, "folder-partial");
  const source = path.join(directory, "Sorgente parziale");
  await fs.mkdir(path.join(source, "annidata"), { recursive: true });
  await fs.copyFile(validFixture, path.join(source, "valido.milk"));
  await fs.copyFile(corruptFixture, path.join(source, "annidata", "corrotto.milk"));
  const report = await importer.importFolder(source, "copy");
  assert.equal(report.imported.length, 1);
  assert.ok(report.issues.some((item) => item.code === "INVALID_MILK_TYPE"));
  assert.ok(report.issues.every((item) => item.fatal === false));
});

test("Collega cartella ricollega per hash un preset esterno mancante", async (t) => {
  const { directory, library, importer } = await services(t, "folder-relink");
  const firstFolder = path.join(directory, "prima");
  const secondFolder = path.join(directory, "seconda");
  await fs.mkdir(firstFolder);
  await fs.mkdir(secondFolder);
  const firstPath = path.join(firstFolder, "origine.milk");
  const secondPath = path.join(secondFolder, "ritrovato.milk");
  await fs.copyFile(validFixture, firstPath);
  const initial = await importer.importFolder(firstFolder, "link");
  assert.equal(initial.imported.length, 1);
  await fs.rm(firstPath);
  await library.refreshMissingState();
  assert.equal(library.findById(initial.imported[0].id).status, "missing");
  await fs.copyFile(validFixture, secondPath);
  const relinked = await importer.importFolder(secondFolder, "link");
  assert.equal(relinked.imported.length, 1);
  assert.equal(relinked.duplicates.length, 0);
  assert.equal(relinked.imported[0].path, path.resolve(secondPath));
  assert.notEqual(relinked.imported[0].status, "missing");
});

test("ZIP valido con preset e texture viene estratto e catalogato", async (t) => {
  const { directory, importer } = await services(t, "zip-valid");
  const zipPath = path.join(directory, "bundle.zip");
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z9ZsAAAAASUVORK5CYII=",
    "base64"
  );
  await writeZip(zipPath, [
    {
      name: "pack/texture.png",
      contents: png
    },
    {
      name: "pack/visual.milk",
      contents:
        "[preset00]\n// Author: ZIP Author\nsampler_custom=texture.png\nfDecay=0.9\n"
    }
  ]);
  const report = await importer.importZip(zipPath);
  assert.equal(report.imported.length, 1);
  assert.equal(report.imported[0].textures.length, 1);
  assert.equal(report.imported[0].missingTextures.length, 0);
  assert.ok(report.imported[0].textures[0].path.endsWith("texture.png"));
});

test("ZIP danneggiato è rifiutato e la staging viene pulita", async (t) => {
  const { directory, library, importer } = await services(t, "zip-broken");
  const zipPath = path.join(directory, "broken.zip");
  await fs.writeFile(zipPath, Buffer.from("PK\x03\x04damaged"));
  const report = await importer.importZip(zipPath);
  assert.equal(report.imported.length, 0);
  assert.equal(report.issues.length, 1);
  assert.equal((await fs.readdir(library.stagingRoot)).length, 0);
});

test("ZIP traversal non può scrivere fuori dalla staging", async (t) => {
  const { directory, library, importer } = await services(t, "zip-traversal");
  const zipPath = path.join(directory, "traversal.zip");
  await writeZip(zipPath, [
    { name: "aa/evil.milk", contents: "[preset00]\nfDecay=0.9\n" }
  ]);
  const patched = replaceAllEqualLength(
    await fs.readFile(zipPath),
    "aa/evil.milk",
    "../evil.milk"
  );
  await fs.writeFile(zipPath, patched);
  const report = await importer.importZip(zipPath);
  assert.equal(report.imported.length, 0);
  assert.ok(report.issues.some((item) => item.fatal));
  assert.equal(fsSync.existsSync(path.join(library.libraryRoot, "evil.milk")), false);
  assert.equal((await fs.readdir(library.stagingRoot)).length, 0);
});

test("ZIP con file eseguibile viene rifiutato integralmente", async (t) => {
  const { directory, importer } = await services(t, "zip-executable");
  const zipPath = path.join(directory, "executable.zip");
  await writeZip(zipPath, [
    { name: "safe.milk", contents: "[preset00]\nfDecay=0.9\n" },
    { name: "payload.CMD", contents: "@echo unsafe" }
  ]);
  const report = await importer.importZip(zipPath);
  assert.equal(report.imported.length, 0);
  assert.ok(report.issues.some((item) => item.code === "FORBIDDEN_FILE"));
});

test("entry ZIP symlink viene rifiutata", async (t) => {
  const { directory, importer } = await services(t, "zip-symlink");
  const zipPath = path.join(directory, "symlink.zip");
  await writeZip(zipPath, [
    {
      name: "linked.milk",
      contents: "[preset00]\nfDecay=0.9\n",
      mode: 0o120777
    }
  ]);
  const report = await importer.importZip(zipPath);
  assert.equal(report.imported.length, 0);
  assert.ok(report.issues.some((item) => item.code === "ZIP_SYMLINK"));
});

test("symlink del filesystem viene rifiutato quando supportato", async (t) => {
  const { directory, importer } = await services(t, "fs-symlink");
  const folder = path.join(directory, "folder");
  await fs.mkdir(folder);
  const link = path.join(folder, "linked.milk");
  try {
    await fs.symlink(validFixture, link, "file");
  } catch (error) {
    if (error && ["EPERM", "EACCES"].includes(error.code)) {
      t.skip("Creazione symlink non consentita dall'account di test.");
      return;
    }
    throw error;
  }
  const report = await importer.importFolder(folder, "link");
  assert.equal(report.imported.length, 0);
  assert.ok(report.issues.some((item) => item.code === "SYMLINK"));
});

test("texture mancante produce warning senza inventare asset", async (t) => {
  const { importer } = await services(t, "missing-texture");
  const report = await importer.importFiles([missingTextureFixture], "copy");
  assert.equal(report.imported.length, 1);
  assert.equal(report.imported[0].status, "warning");
  assert.deepEqual(report.imported[0].missingTextures, ["missing-nebula.png"]);
});

test("preset corrotto è gestito senza bloccare il catalogo", async (t) => {
  const { importer, library } = await services(t, "corrupt");
  const report = await importer.importFiles([corruptFixture], "copy");
  assert.equal(report.imported.length, 0);
  assert.ok(report.issues.some((item) => item.code === "INVALID_MILK_TYPE"));
  assert.equal(library.list().length, 0);
});

test("errore projectM mette il preset in quarantena e consente rivalidazione", async (t) => {
  const { directory, library } = await services(t, "quarantine");
  const importer = new PresetImportService(
    library,
    fakeValidation(false, "Errore shader di fixture")
  );
  const report = await importer.importFiles([validFixture], "copy");
  assert.equal(report.quarantined.length, 1);
  assert.equal(report.quarantined[0].status, "quarantined");
  assert.match(report.quarantined[0].quarantineReason, /shader/);
  const reopened = new PresetLibraryService(path.join(directory, "library"));
  await reopened.initialize();
  assert.equal(reopened.list()[0].quarantined, true);
  const cleared = await reopened.clearQuarantine(reopened.list()[0].id);
  assert.equal(cleared.quarantined, false);
});

test("persistenza, preferiti, metadati e ricollegamento per hash", async (t) => {
  const { directory, library, importer } = await services(t, "persistence");
  const source = path.join(directory, "source.milk");
  const candidate = path.join(directory, "candidate.milk");
  await fs.copyFile(validFixture, source);
  await fs.copyFile(validFixture, candidate);
  const report = await importer.importFiles([source], "link");
  const id = report.imported[0].id;
  await library.setFavorite(id, true);
  assert.equal(library.findById(id).favorite, true);
  await library.setFavorite(id, false);
  assert.equal(library.findById(id).favorite, false);
  await library.setFavorite(id, true);
  await library.updateMetadata({
    id,
    name: "Nome aggiornato",
    author: null,
    license: "Licenza non verificata",
    licenseVerified: false
  });
  await fs.rm(source);
  await library.refreshMissingState();
  assert.equal(library.findById(id).status, "missing");
  const relinked = await library.relink(id, candidate);
  assert.equal(relinked.path, path.resolve(candidate));
  const reopened = new PresetLibraryService(path.join(directory, "library"));
  await reopened.initialize();
  const persisted = reopened.findById(id);
  assert.equal(persisted.favorite, true);
  assert.equal(persisted.name, "Nome aggiornato");
  assert.equal(persisted.status, "valid");
});

test("il progetto persiste preset, hash, preferiti, texture e cartelle collegate", () => {
  const project = createDefaultProject();
  project.projectM.presetId = "preset-abc";
  project.projectM.presetPath = "D:\\Preset\\visual.milk";
  project.projectM.presetHash = "abc123";
  project.projectM.favoritePresetIds = ["preset-abc", "preset-def"];
  project.projectM.texturePaths = ["D:\\Preset\\texture.png"];
  project.projectM.missingTextures = ["missing.png"];
  project.projectM.externalFolders = ["D:\\Preset"];
  const restored = normalizeProject(JSON.parse(JSON.stringify(project)));
  assert.equal(restored.projectM.presetId, "preset-abc");
  assert.equal(restored.projectM.presetHash, "abc123");
  assert.deepEqual(restored.projectM.favoritePresetIds, ["preset-abc", "preset-def"]);
  assert.deepEqual(restored.projectM.texturePaths, ["D:\\Preset\\texture.png"]);
  assert.deepEqual(restored.projectM.missingTextures, ["missing.png"]);
  assert.deepEqual(restored.projectM.externalFolders, ["D:\\Preset"]);
});

test(
  "un preset importato viene validato e renderizzato da projectM 4.1.6 reale",
  { skip: !nativeAvailable },
  async (t) => {
    const validator = async (presetPath) => {
      const service = new ProjectMHostService({
        ...nativePaths,
        presetPath
      });
      try {
        const status = await service.initialize(270, 480);
        if (!status.available) {
          return { valid: false, error: status.error, version: status.version, frameHash: "" };
        }
        const frame = await service.render({
          width: 270,
          height: 480,
          steps: 2,
          channels: 2,
          samples: new Float32Array(960)
        });
        return {
          valid: Boolean(frame),
          error: frame ? "" : "Framebuffer assente",
          version: status.version,
          frameHash: frame ? String(frame.bytes.reduce((sum, value) => sum + value, 0)) : ""
        };
      } finally {
        await service.shutdown();
      }
    };
    const { importer } = await services(t, "real-projectm", validator);
    const report = await importer.importFiles([validFixture], "copy");
    assert.equal(report.imported.length, 1);
    assert.equal(report.imported[0].compatibility, "projectM-4.1.6");
    assert.equal(report.quarantined.length, 0);
  }
);
