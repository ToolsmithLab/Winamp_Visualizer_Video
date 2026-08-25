import { spawn } from "node:child_process";
import { access, lstat, realpath } from "node:fs/promises";
import path from "node:path";
import { app } from "electron";
import type { ClipMetadata, MediaPayload } from "../shared/ipc";

const MAX_AUDIO_BYTES = 512 * 1024 * 1024;
const PROBE_TIMEOUT_MS = 15_000;
const DECODE_TIMEOUT_MS = 120_000;

export async function resolveMediaFfmpeg(): Promise<string> {
  const configured = process.env.AVS_FFMPEG_PATH;
  if (configured) {
    await access(configured);
    return configured;
  }
  const inElectronMainProcess =
    (process as NodeJS.Process & { type?: string }).type === "browser";
  const resolved = inElectronMainProcess && app.isPackaged
    ? path.join(
        process.resourcesPath,
        "native",
        "ffmpeg",
        "win-x64",
        "ffmpeg.exe"
      )
    : path.resolve(__dirname, "../../native/ffmpeg/win-x64/ffmpeg.exe");
  await access(resolved);
  return resolved;
}

async function regularMediaPath(filePath: string): Promise<string> {
  if (!path.isAbsolute(filePath) || filePath.includes("\0")) {
    throw new Error("Percorso clip non valido.");
  }
  const [info, canonical] = await Promise.all([
    lstat(filePath),
    realpath(filePath)
  ]);
  if (!info.isFile() || info.isSymbolicLink()) {
    throw new Error("La clip deve essere un file regolare.");
  }
  if (
    path.resolve(canonical).toLocaleLowerCase() !==
    path.resolve(filePath).toLocaleLowerCase()
  ) {
    throw new Error("Collegamenti simbolici o reparse point non consentiti.");
  }
  return canonical;
}

function runFfmpeg(
  executable: string,
  args: string[],
  timeoutMs: number,
  maximumStdoutBytes = 4 * 1024 * 1024
): Promise<{ stdout: Buffer; stderr: string; code: number | null }> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });
    const stdout: Buffer[] = [];
    let stdoutBytes = 0;
    let stderr = "";
    let settled = false;
    const finish = (
      callback: () => void
    ) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback();
    };
    const timer = setTimeout(() => {
      child.kill();
      finish(() =>
        reject(
          new Error(
            `FFmpeg non ha risposto entro ${(timeoutMs / 1000).toFixed(0)} secondi.`
          )
        )
      );
    }, timeoutMs);
    child.stdout.on("data", (chunk: Buffer) => {
      stdoutBytes += chunk.byteLength;
      if (stdoutBytes > maximumStdoutBytes) {
        child.kill();
        finish(() =>
          reject(new Error("Audio della clip oltre il limite di 512 MB."))
        );
        return;
      }
      stdout.push(chunk);
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr = (stderr + chunk).slice(-2 * 1024 * 1024);
    });
    child.once("error", (error) => finish(() => reject(error)));
    child.once("close", (code) =>
      finish(() =>
        resolve({ stdout: Buffer.concat(stdout), stderr, code })
      )
    );
  });
}

export async function inspectClip(filePath: string): Promise<ClipMetadata> {
  const canonical = await regularMediaPath(filePath);
  const ffmpeg = await resolveMediaFfmpeg();
  const result = await runFfmpeg(
    ffmpeg,
    ["-hide_banner", "-i", canonical],
    PROBE_TIMEOUT_MS
  );
  const durationMatch = result.stderr.match(
    /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/
  );
  const durationSeconds = durationMatch
    ? Number(durationMatch[1]) * 3600 +
      Number(durationMatch[2]) * 60 +
      Number(durationMatch[3])
    : 0;
  const videoLine = result.stderr.match(
    /Stream #\d+:\d+(?:\[[^\]]+\])?(?:\([^)]*\))?: Video:([^\r\n]+)/i
  )?.[1] ?? "";
  const audioLine = result.stderr.match(
    /Stream #\d+:\d+(?:\[[^\]]+\])?(?:\([^)]*\))?: Audio:([^\r\n]+)/i
  )?.[1] ?? "";
  const hasVideo = Boolean(videoLine);
  const hasAudio = Boolean(audioLine);
  const dimensions = videoLine.match(/(\d{2,5})x(\d{2,5})(?:[,\s])/);
  const frameRateMatch = videoLine.match(/(\d+(?:\.\d+)?)\s+fps\b/i);
  const videoCodec = videoLine.match(/^\s*([a-z0-9_]+)/i)?.[1]?.toLowerCase() ?? "";
  const audioCodec = audioLine.match(/^\s*([a-z0-9_]+)/i)?.[1]?.toLowerCase() ?? null;
  const extension = path.extname(canonical).slice(1).toLowerCase();
  const container =
    extension === "m4v"
      ? "M4V"
      : extension === "mov"
        ? "MOV"
        : extension === "webm"
          ? "WEBM"
          : extension === "mkv"
            ? "MKV"
            : "MP4";
  const chromiumCompatible =
    ((extension === "mp4" || extension === "m4v" || extension === "mov") &&
      (videoCodec === "h264" || videoCodec === "av1")) ||
    (extension === "webm" &&
      (videoCodec === "vp8" || videoCodec === "vp9" || videoCodec === "av1"));
  const compatibilityReason = chromiumCompatible
    ? "Codec e contenitore compatibili con il decoder Chromium."
    : extension === "mkv"
      ? "Il contenitore MKV non è supportato in modo affidabile nell’anteprima. Convertire in MP4 H.264."
      : `Codec ${videoCodec || "sconosciuto"} non supportato nell’anteprima ${container}. Convertire in MP4 H.264.`;
  if (!hasVideo) {
    throw new Error("Il file selezionato non contiene una traccia video.");
  }
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error("Durata della clip non rilevabile.");
  }
  return {
    path: canonical,
    name: path.basename(canonical),
    durationSeconds,
    hasVideo,
    hasAudio,
    width: dimensions ? Number(dimensions[1]) : 0,
    height: dimensions ? Number(dimensions[2]) : 0,
    frameRate: frameRateMatch ? Number(frameRateMatch[1]) : 0,
    container,
    videoCodec,
    audioCodec,
    previewSupported: chromiumCompatible,
    compatibilityReason
  };
}

export async function decodeClipAudio(filePath: string): Promise<MediaPayload> {
  const metadata = await inspectClip(filePath);
  if (!metadata.hasAudio) {
    throw new Error("La clip non contiene una traccia audio");
  }
  const ffmpeg = await resolveMediaFfmpeg();
  const result = await runFfmpeg(
    ffmpeg,
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      metadata.path,
      "-map",
      "0:a:0",
      "-vn",
      "-ac",
      "2",
      "-ar",
      "48000",
      "-c:a",
      "pcm_s16le",
      "-f",
      "wav",
      "pipe:1"
    ],
    DECODE_TIMEOUT_MS,
    MAX_AUDIO_BYTES
  );
  if (result.code !== 0 || result.stdout.byteLength < 44) {
    throw new Error(
      result.stderr.trim() || "Audio della clip non decodificabile."
    );
  }
  return {
    path: metadata.path,
    name: metadata.name,
    bytes: new Uint8Array(result.stdout),
    mimeType: "audio/wav"
  };
}
