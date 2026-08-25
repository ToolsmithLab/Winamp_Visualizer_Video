"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const yazl = require("yazl");

const root = path.resolve(__dirname, "..");
const sourceDirectory = path.resolve(process.argv[2]);
const outputDirectory = path.resolve(process.argv[3]);
const corruptFixture = path.join(
  root,
  "tests",
  "fixtures",
  "preset-import",
  "corrupt.milk"
);

async function listMilkFiles(directory) {
  const result = [];
  async function visit(current) {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) await visit(fullPath);
      else if (entry.isFile() && path.extname(entry.name).toLowerCase() === ".milk") {
        result.push(fullPath);
      }
    }
  }
  await visit(directory);
  return result.sort((left, right) => left.localeCompare(right, "en"));
}

async function writeVariant(sourceFiles, destination, index, suffix = "") {
  const source = sourceFiles[index % sourceFiles.length];
  const sourceText = await fs.readFile(source, "utf8");
  const sourceName = path.basename(source, ".milk").replace(/[^\w.-]+/g, "-");
  const fileName = `Runtime-${String(index + 1).padStart(3, "0")}-${sourceName}.milk`;
  const target = path.join(destination, fileName);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(
    target,
    `${sourceText}\n// AVS simple-library runtime variant: ${index + 1}${suffix}\n`,
    "utf8"
  );
  return target;
}

async function createZip(zipPath, presetPath, texturePath) {
  await fs.mkdir(path.dirname(zipPath), { recursive: true });
  const archive = new yazl.ZipFile();
  archive.addFile(presetPath, `visuals/${path.basename(presetPath)}`);
  archive.addFile(texturePath, "visuals/runtime-texture.png");
  const completion = new Promise((resolve, reject) => {
    archive.outputStream
      .pipe(require("node:fs").createWriteStream(zipPath))
      .once("close", resolve)
      .once("error", reject);
  });
  archive.end();
  await completion;
}

async function main() {
  const sourceFiles = await listMilkFiles(sourceDirectory);
  if (sourceFiles.length < 10) {
    throw new Error(`Servono almeno 10 preset reali; trovati ${sourceFiles.length}.`);
  }
  const relativeOutput = path.relative(root, outputDirectory);
  if (!relativeOutput || relativeOutput.startsWith("..") || path.isAbsolute(relativeOutput)) {
    throw new Error("La cartella di output runtime deve essere interna al workspace.");
  }
  await fs.rm(outputDirectory, { recursive: true, force: true });
  await fs.mkdir(outputDirectory, { recursive: true });

  const singleDirectory = path.join(outputDirectory, "single");
  const multiDirectory = path.join(outputDirectory, "multiple");
  const copyFolder = path.join(outputDirectory, "recursive-folder");
  const linkFolder = path.join(outputDirectory, "linked-folder");
  const zipSource = path.join(outputDirectory, "zip-source");
  await Promise.all(
    [singleDirectory, multiDirectory, copyFolder, linkFolder, zipSource].map((entry) =>
      fs.mkdir(entry, { recursive: true })
    )
  );

  const single = await writeVariant(sourceFiles, singleDirectory, 0);
  const multiple = [];
  for (let index = 1; index <= 10; index += 1) {
    multiple.push(await writeVariant(sourceFiles, multiDirectory, index));
  }

  const recursive = [];
  for (let index = 11; index < 16; index += 1) {
    const destination =
      index % 2 === 0 ? copyFolder : path.join(copyFolder, "Sottocartella");
    recursive.push(await writeVariant(sourceFiles, destination, index));
  }
  const missingTexture = await writeVariant(
    sourceFiles,
    path.join(copyFolder, "Sottocartella"),
    16,
    "\n// texture: texture-runtime-mancante.png"
  );
  await fs.copyFile(corruptFixture, path.join(copyFolder, "Preset-corrotto.milk"));

  const linked = [];
  for (let index = 17; index < 117; index += 1) {
    const destination =
      index % 3 === 0 ? path.join(linkFolder, "Gruppo-B") : linkFolder;
    linked.push(await writeVariant(sourceFiles, destination, index));
  }

  const zipPreset = await writeVariant(
    sourceFiles,
    zipSource,
    117,
    "\n// texture: runtime-texture.png"
  );
  const texturePath = path.join(zipSource, "runtime-texture.png");
  const onePixelPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64"
  );
  await fs.writeFile(texturePath, onePixelPng);
  const zipPath = path.join(outputDirectory, "preset-con-texture.zip");
  await createZip(zipPath, zipPreset, texturePath);

  const manifest = {
    generatedAt: new Date().toISOString(),
    sourceDirectory,
    sourcePresetCount: sourceFiles.length,
    single,
    multiple,
    recursiveFolder: copyFolder,
    recursive,
    missingTexture,
    corrupt: path.join(copyFolder, "Preset-corrotto.milk"),
    zip: zipPath,
    zipPreset,
    zipTexture: texturePath,
    linkedFolder: linkFolder,
    linked,
    expectedValidMinimum: 117,
    audio: path.join(root, "tests", "fixtures", "audio", "phase2-multiband.wav")
  };
  const manifestPath = path.join(outputDirectory, "manifest.json");
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  process.stdout.write(`${manifestPath}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
