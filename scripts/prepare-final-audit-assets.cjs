"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { createCanvas } = require("@napi-rs/canvas");
const yazl = require("yazl");
const {
  extractZipSecure
} = require("../dist/main/presets/zipSecurity");

const root = path.resolve(__dirname, "..");
const archive = path.resolve(process.argv[2] || "");
const output = path.resolve(process.argv[3] || "");
if (!archive || !output) {
  throw new Error("Uso: prepare-final-audit-assets.cjs <projectm.zip> <output>");
}
if (!path.basename(output).startsWith("AVSPhase2FinalAudit_")) {
  throw new Error("La directory temporanea deve iniziare con AVSPhase2FinalAudit_.");
}

const selectedNames = [
  "001-line.milk",
  "100-square.milk",
  "101-per_frame.milk",
  "110-per_pixel.milk",
  "200-wave.milk",
  "201-wave.milk",
  "240-wave-smooth-00.milk",
  "250-wavecode.milk",
  "260-compshader-noise_lq.milk",
  "300-beatdetect-bassmidtreb.milk"
];

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function runFfmpeg(arguments_) {
  const ffmpeg = path.join(root, "native", "ffmpeg", "win-x64", "ffmpeg.exe");
  const result = spawnSync(ffmpeg, arguments_, {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024
  });
  if (result.status !== 0) throw new Error(result.stderr || "FFmpeg non riuscito.");
}

async function zipFiles(files, destination) {
  await new Promise((resolve, reject) => {
    const zip = new yazl.ZipFile();
    zip.outputStream.pipe(fs.createWriteStream(destination))
      .once("close", resolve)
      .once("error", reject);
    for (const entry of files) zip.addFile(entry.source, entry.archivePath);
    zip.end();
  });
}

async function main() {
  await fsp.rm(output, { recursive: true, force: true });
  await fsp.mkdir(output, { recursive: true });
  const extracted = path.join(output, "official-source");
  await extractZipSecure(archive, extracted, {
    includePrefix: "projectm-4.1.6/presets/tests"
  });
  const available = new Map(
    (await fsp.readdir(extracted, { recursive: true, withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.endsWith(".milk"))
      .map((entry) => [entry.name, path.join(entry.parentPath, entry.name)])
  );
  const selected = selectedNames.map((name) => {
    const source = available.get(name);
    if (!source) throw new Error(`Preset ufficiale mancante: ${name}`);
    return source;
  });

  const single = path.join(output, "imports", "single");
  const multi = path.join(output, "imports", "multi");
  const folder = path.join(output, "imports", "folder");
  const nested = path.join(folder, "Sottocartella");
  const zipSource = path.join(output, "imports", "zip-source");
  await Promise.all(
    [single, multi, folder, nested, zipSource].map((directory) =>
      fsp.mkdir(directory, { recursive: true })
    )
  );

  const destinations = [
    path.join(single, selectedNames[0]),
    path.join(multi, selectedNames[1]),
    path.join(multi, selectedNames[2]),
    path.join(folder, selectedNames[3]),
    path.join(folder, selectedNames[4]),
    path.join(nested, selectedNames[5]),
    path.join(nested, selectedNames[6]),
    path.join(zipSource, selectedNames[7]),
    path.join(zipSource, selectedNames[8]),
    path.join(zipSource, selectedNames[9])
  ];
  await Promise.all(
    selected.map((source, index) => fsp.copyFile(source, destinations[index]))
  );
  const zipPath = path.join(output, "imports", "preset-audit.zip");
  await zipFiles(
    destinations.slice(7).map((source) => ({
      source,
      archivePath: `Preset audit/${path.basename(source)}`
    })),
    zipPath
  );

  const coverPath = path.join(output, "cover-audit.png");
  const canvas = createCanvas(900, 900);
  const context = canvas.getContext("2d");
  const gradient = context.createLinearGradient(0, 0, 900, 900);
  gradient.addColorStop(0, "#ff3f86");
  gradient.addColorStop(0.5, "#6738d7");
  gradient.addColorStop(1, "#00c7d9");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 900, 900);
  context.fillStyle = "#fff";
  context.font = "700 88px Segoe UI";
  context.textAlign = "center";
  context.fillText("FASE 2", 450, 410);
  context.font = "600 42px Segoe UI";
  context.fillText("AUDIT FINALE", 450, 485);
  await fsp.writeFile(coverPath, canvas.toBuffer("image/png"));

  const audio600 = path.join(output, "audit-multiband-600s.wav");
  const audio60 = path.join(output, "audit-multiband-60s.wav");
  const makeAudio = (duration, destination) =>
    runFfmpeg([
      "-hide_banner", "-y",
      "-f", "lavfi", "-i", `sine=frequency=72:sample_rate=48000:duration=${duration}`,
      "-f", "lavfi", "-i", `sine=frequency=440:sample_rate=48000:duration=${duration}`,
      "-f", "lavfi", "-i", `sine=frequency=2200:sample_rate=48000:duration=${duration}`,
      "-filter_complex",
      "[0:a]volume=0.6[a0];[1:a]volume=0.3[a1];[2:a]volume=0.16[a2];" +
        "[a0][a1][a2]amix=inputs=3:normalize=0,apulsator=hz=1.1:amount=0.5,alimiter=limit=0.92[a]",
      "-map", "[a]", "-c:a", "pcm_s16le", destination
    ]);
  makeAudio(600, audio600);
  makeAudio(60, audio60);

  const records = selected.map((source, index) => ({
    index: index + 1,
    name: path.basename(source, ".milk"),
    fileName: path.basename(source),
    source:
      `https://github.com/projectM-visualizer/projectm/blob/v4.1.6/presets/tests/${path.basename(source)}`,
    repositoryProject: "projectM Development Team",
    individualAuthor: "Non dichiarato nel preset",
    declaredLicense: "LGPL-2.1-or-later (licenza principale del repository)",
    legalQualification:
      "Provenienza e licenza dichiarata verificate tecnicamente; titolarità storica individuale non certificata.",
    textureCount: 0,
    path: destinations[index],
    originalPath: source,
    sha256: sha256(source)
  }));
  const manifest = {
    generatedAt: new Date().toISOString(),
    archive,
    archiveSha256: sha256(archive),
    sourcePrefix: "projectm-4.1.6/presets/tests",
    output,
    imports: {
      single: [destinations[0]],
      multiple: destinations.slice(1, 3),
      folder,
      zip: zipPath
    },
    coverPath,
    audio600,
    audio60,
    records
  };
  await fsp.writeFile(
    path.join(output, "audit-assets.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8"
  );
  process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
