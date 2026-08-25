"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const output = path.resolve(
  process.argv[2] || "test-results/phase2-blocker-fixes/unicode-assets"
);

const labels = [
  "Ω",
  "è à ò ù ì",
  "ä ö ü ß",
  "é ç œ",
  "ą ć ę ł ń",
  "Кириллица",
  "Ελληνικά",
  "日本語",
  "中文",
  "emoji 🚀",
  "spazi (parentesi) l'apostrofo-trattini",
  "NFC-é",
  "NFD-e\u0301"
];

async function main() {
  await fs.mkdir(output, { recursive: true });
  const template = await fs.readFile(
    path.join(root, "tests", "fixtures", "preset-import", "missing-texture.milk"),
    "utf8"
  );
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlK7ZkAAAAASUVORK5CYII=",
    "base64"
  );
  const cases = [];
  for (const [index, label] of labels.entries()) {
    const directory = path.join(output, `Cartella ${label}`);
    const copyDirectory = path.join(directory, "copia");
    const linkDirectory = path.join(directory, "collegamento");
    await fs.mkdir(copyDirectory, { recursive: true });
    await fs.mkdir(linkDirectory, { recursive: true });
    const copyPath = path.join(copyDirectory, `Copia ${label}.milk`);
    const linkPath = path.join(linkDirectory, `Collegato ${label}.milk`);
    await fs.writeFile(
      copyPath,
      `${template}\n// unicode-copy:${index}:${label}\n`,
      "utf8"
    );
    await fs.writeFile(
      linkPath,
      `${template}\n// unicode-link:${index}:${label}\n`,
      "utf8"
    );
    await fs.writeFile(path.join(copyDirectory, "missing-nebula.png"), png);
    await fs.writeFile(path.join(linkDirectory, "missing-nebula.png"), png);
    cases.push({
      label,
      copyDirectory,
      linkDirectory,
      copyPath,
      linkPath,
      longPath: false
    });
  }

  let longDirectory = path.join(output, "Percorso lungo Ω");
  while (longDirectory.length < 235) {
    longDirectory = path.join(
      longDirectory,
      `segmento-${String(longDirectory.length).padStart(3, "0")}-abcdefghijklmnop`
    );
  }
  const longCopyDirectory = path.join(longDirectory, "copia");
  const longLinkDirectory = path.join(longDirectory, "collegamento");
  await fs.mkdir(longCopyDirectory, { recursive: true });
  await fs.mkdir(longLinkDirectory, { recursive: true });
  const longCopyPath = path.join(
    longCopyDirectory,
    "Copia percorso lungo Ω.milk"
  );
  const longLinkPath = path.join(
    longLinkDirectory,
    "Collegato percorso lungo Ω.milk"
  );
  await fs.writeFile(longCopyPath, `${template}\n// long-copy\n`, "utf8");
  await fs.writeFile(longLinkPath, `${template}\n// long-link\n`, "utf8");
  await fs.writeFile(path.join(longCopyDirectory, "missing-nebula.png"), png);
  await fs.writeFile(path.join(longLinkDirectory, "missing-nebula.png"), png);
  cases.push({
    label: "percorso lungo vicino al limite",
    copyDirectory: longCopyDirectory,
    linkDirectory: longLinkDirectory,
    copyPath: longCopyPath,
    linkPath: longLinkPath,
    longPath: true
  });

  const manifest = {
    generatedAt: new Date().toISOString(),
    output,
    audioPath:
      "C:\\Users\\Lorenz\\AppData\\Local\\Temp\\AVSPhase2FinalAudit_20260728_ASCII\\audit-multiband-60s.wav",
    cases,
    copyFolders: cases.map((item) => item.copyDirectory),
    linkFolders: cases.map((item) => item.linkDirectory),
    copyPaths: cases.map((item) => item.copyPath),
    linkPaths: cases.map((item) => item.linkPath)
  };
  const manifestPath = path.join(output, "unicode-assets.json");
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ manifestPath, ...manifest }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.stack ?? error.message : String(error)}\n`
  );
  process.exitCode = 1;
});
