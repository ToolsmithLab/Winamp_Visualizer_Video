"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const yazl = require("yazl");
const {
  PresetCatalogService,
  validateCatalogManifest
} = require("../dist/main/presets/presetCatalogService");
const {
  PresetLibraryService
} = require("../dist/main/presets/presetLibraryService");
const {
  PresetImportService
} = require("../dist/main/presets/presetImportService");
const {
  sha256File
} = require("../dist/main/presets/presetSecurity");

async function temporary(t, label) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), `AVSCatalog_${label}_`));
  t.after(async () => {
    await fs.rm(directory, { recursive: true, force: true });
  });
  return directory;
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
      zip.addBuffer(Buffer.from(entry.contents), entry.name);
    }
    zip.end();
  });
}

function packageRecord(sha256) {
  return {
    id: "verified-fixture-pack",
    name: "Verified Fixture Pack",
    version: "1.0.0",
    sourceUrl: "https://example.test/source",
    downloadUrl: "https://example.test/package.zip",
    license: "MIT",
    licenseUrl: "https://example.test/license",
    licenseTextPath: "fixture/LICENSE.txt",
    authors: ["Fixture Author"],
    attribution: ["Fixture Author"],
    sha256,
    presetCount: 2,
    textureCount: 0,
    textureInventory: [],
    projectMVersion: "4.1.6",
    releaseDate: "2026-07-01T00:00:00.000Z",
    verifiedAt: "2026-07-28T00:00:00.000Z",
    archive: {
      format: "zip",
      includePrefix: "source/presets/tests"
    }
  };
}

async function fixtureServices(t, archiveHashOverride) {
  const directory = await temporary(t, "service");
  const archive = path.join(directory, "package.zip");
  await writeZip(archive, [
    {
      name: "source/presets/tests/a.milk",
      contents: "[preset00]\nfDecay=0.91\n"
    },
    {
      name: "source/presets/tests/b.milk",
      contents: "[preset00]\nfDecay=0.92\n"
    },
    {
      name: "source/outside/ignored.exe",
      contents: "not extracted"
    }
  ]);
  const actualHash = await sha256File(archive);
  const manifest = {
    schemaVersion: 1,
    catalogVersion: "1.0.0",
    generatedAt: "2026-07-28T00:00:00.000Z",
    packages: [packageRecord(archiveHashOverride ?? actualHash)],
    excluded: []
  };
  const manifestPath = path.join(directory, "catalog.json");
  const licenseRoot = path.join(directory, "licenses");
  await fs.mkdir(path.join(licenseRoot, "fixture"), { recursive: true });
  await fs.writeFile(
    path.join(licenseRoot, "fixture", "LICENSE.txt"),
    "MIT fixture license",
    "utf8"
  );
  await fs.writeFile(manifestPath, JSON.stringify(manifest), "utf8");
  const library = new PresetLibraryService(path.join(directory, "library"));
  await library.initialize();
  const importer = new PresetImportService(library, async () => ({
    valid: true,
    error: "",
    version: "4.1.6",
    frameHash: "fixture-frame"
  }));
  const downloader = async (_url, destination) => {
    await fs.copyFile(archive, destination);
    return {
      bytes: (await fs.stat(destination)).size,
      sha256: await sha256File(destination)
    };
  };
  const catalog = new PresetCatalogService(
    manifestPath,
    licenseRoot,
    path.join(directory, "catalog-state"),
    library,
    importer,
    downloader
  );
  return { directory, archive, actualHash, library, importer, catalog };
}

test("il manifest ufficiale richiede HTTPS, licenza e SHA-256", () => {
  const valid = {
    schemaVersion: 1,
    catalogVersion: "1.0.0",
    generatedAt: "2026-07-28T00:00:00.000Z",
    packages: [packageRecord("a".repeat(64))],
    excluded: []
  };
  assert.equal(validateCatalogManifest(valid).packages.length, 1);
  assert.throws(
    () =>
      validateCatalogManifest({
        ...valid,
        packages: [{ ...valid.packages[0], downloadUrl: "http://example.test/a.zip" }]
      }),
    /HTTPS/
  );
  assert.throws(
    () =>
      validateCatalogManifest({
        ...valid,
        packages: [{ ...valid.packages[0], license: "Licenza non verificata" }]
      }),
    /incompleti/
  );
});

test("installazione catalogo verifica hash, importa, persiste e disinstalla", async (t) => {
  const { catalog, library } = await fixtureServices(t);
  const initial = await catalog.list();
  assert.equal(initial.packages[0].state, "not-installed");
  const installed = await catalog.install("verified-fixture-pack");
  assert.equal(installed.importedPresets, 2);
  assert.equal(installed.package.state, "installed");
  const records = library.list();
  assert.equal(records.length, 2);
  assert.ok(records.every((record) => record.licenseVerified));
  assert.ok(records.every((record) => record.license === "MIT"));
  assert.ok(records.every((record) => record.origin.kind === "catalog"));
  await catalog.verify("verified-fixture-pack");
  const removed = await catalog.uninstall("verified-fixture-pack");
  assert.equal(removed.package.state, "not-installed");
  assert.equal(library.list().length, 0);
});

test("hash errato blocca installazione e lascia la libreria invariata", async (t) => {
  const { catalog, library } = await fixtureServices(t, "f".repeat(64));
  await assert.rejects(
    catalog.install("verified-fixture-pack"),
    /SHA-256 non valido/
  );
  assert.equal(library.list().length, 0);
});

test("la libreria personale accetta preset sicuri con licenza non verificata", async (t) => {
  const { directory, library, importer } = await fixtureServices(t);
  const personal = path.join(directory, "personal.milk");
  await fs.writeFile(personal, "[preset00]\nfDecay=0.95\n", "utf8");
  const report = await importer.importFiles([personal], "copy");
  assert.equal(report.imported.length, 1);
  assert.equal(report.imported[0].license, "Licenza non verificata");
  assert.equal(report.imported[0].licenseVerified, false);
  assert.equal(report.imported[0].quarantined, false);
  assert.notEqual(report.imported[0].status, "incompatible");
  assert.ok(library.findById(report.imported[0].id));
});
