import path from "node:path";
import { createHash } from "node:crypto";
import { app } from "electron";
import {
  ProjectMHostService,
  type ProjectMRuntimePaths
} from "./projectMHostService";

export function runtimePaths(): ProjectMRuntimePaths {
  const electronApp = app as typeof app | undefined;
  if (electronApp?.isPackaged) {
    const nativeDir = path.join(process.resourcesPath, "native", "win-x64");
    return {
      hostPath: path.join(nativeDir, "projectm-host.exe"),
      libraryPath: path.join(nativeDir, "projectM-4.dll"),
      presetPath: path.join(
        process.resourcesPath,
        "assets",
        "projectm",
        "presets",
        "AVS Audio Wave.milk"
      )
    };
  }
  const root = electronApp?.getAppPath?.() ?? process.cwd();
  const nativeDir = path.join(root, "native", "bin", "win-x64");
  return {
    hostPath: path.join(nativeDir, "projectm-host.exe"),
    libraryPath: path.join(nativeDir, "projectM-4.dll"),
    presetPath: path.join(
      root,
      "assets",
      "projectm",
      "presets",
      "AVS Audio Wave.milk"
    )
  };
}

export const projectMRuntime = new ProjectMHostService(runtimePaths());

function bgraToBmp(
  width: number,
  height: number,
  bgra: Uint8Array
): Uint8Array {
  const stride = width * 4;
  const pixelBytes = stride * height;
  const output = Buffer.allocUnsafe(54 + pixelBytes);
  output.write("BM", 0, "ascii");
  output.writeUInt32LE(output.length, 2);
  output.writeUInt32LE(54, 10);
  output.writeUInt32LE(40, 14);
  output.writeInt32LE(width, 18);
  output.writeInt32LE(-height, 22);
  output.writeUInt16LE(1, 26);
  output.writeUInt16LE(32, 28);
  output.writeUInt32LE(0, 30);
  output.writeUInt32LE(pixelBytes, 34);
  output.writeInt32LE(2835, 38);
  output.writeInt32LE(2835, 42);
  output.writeUInt32LE(0, 46);
  output.writeUInt32LE(0, 50);
  Buffer.from(bgra.buffer, bgra.byteOffset, bgra.byteLength).copy(output, 54);
  return new Uint8Array(output);
}

export async function validateProjectMPreset(presetPath: string) {
  const validation = new ProjectMHostService({
    ...runtimePaths(),
    presetPath
  });
  try {
    const status = await validation.initialize(270, 480);
    if (!status.available) {
      return {
        valid: false,
        error: status.error || "projectM non ha caricato il preset.",
        version: status.version,
        frameHash: ""
      };
    }
    const frame = await validation.render({
      width: 270,
      height: 480,
      steps: 2,
      channels: 2,
      samples: new Float32Array(960)
    });
    if (!frame) {
      return {
        valid: false,
        error: "projectM non ha prodotto il framebuffer di validazione.",
        version: status.version,
        frameHash: ""
      };
    }
    return {
      valid: true,
      error: "",
      version: status.version,
      frameHash: createHash("sha256").update(frame.bytes).digest("hex"),
      thumbnailBmp: bgraToBmp(frame.width, frame.height, frame.bytes)
    };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : String(error),
      version: "",
      frameHash: ""
    };
  } finally {
    await validation.shutdown();
  }
}
