import { randomUUID } from "node:crypto";
import {
  copyFile,
  open,
  rename,
  rm,
  stat
} from "node:fs/promises";
import path from "node:path";

export type AtomicWriteFault =
  | "invalid-json"
  | "write"
  | "disk-full"
  | "interrupt"
  | "rename";

export interface AtomicWriteOptions {
  fault?: AtomicWriteFault;
}

function injectedError(
  fault: AtomicWriteFault,
  code = "EIO"
): NodeJS.ErrnoException {
  const error = new Error(`Fault injection atomic write: ${fault}`) as NodeJS.ErrnoException;
  error.code = code;
  return error;
}

async function syncExistingFile(filePath: string): Promise<void> {
  const handle = await open(filePath, "r+");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

export async function atomicWriteJson(
  targetPath: string,
  json: string,
  options: AtomicWriteOptions = {}
): Promise<{ backupPath: string | null }> {
  if (options.fault === "invalid-json") {
    throw injectedError("invalid-json", "EINVAL");
  }
  try {
    JSON.parse(json);
  } catch {
    throw new Error("Serializzazione progetto non valida: JSON non valido.");
  }

  const directory = path.dirname(targetPath);
  const base = path.basename(targetPath);
  const nonce = `${process.pid}-${randomUUID()}`;
  const temporaryPath = path.join(directory, `.${base}.${nonce}.tmp`);
  const backupPath = `${targetPath}.bak`;
  const temporaryBackupPath = path.join(directory, `.${base}.${nonce}.bak.tmp`);
  let handle: Awaited<ReturnType<typeof open>> | null = null;

  try {
    handle = await open(temporaryPath, "wx");
    if (options.fault === "write") throw injectedError("write");
    if (options.fault === "disk-full") throw injectedError("disk-full", "ENOSPC");
    await handle.writeFile(json, "utf8");
    await handle.sync();
    await handle.close();
    handle = null;

    if (options.fault === "interrupt") {
      throw injectedError("interrupt", "ECANCELED");
    }

    const targetExists = await exists(targetPath);
    if (targetExists) {
      await copyFile(targetPath, temporaryBackupPath);
      await syncExistingFile(temporaryBackupPath);
      await rename(temporaryBackupPath, backupPath);
    }

    if (options.fault === "rename") throw injectedError("rename");
    await rename(temporaryPath, targetPath);
    await syncExistingFile(targetPath);
    return { backupPath: targetExists ? backupPath : null };
  } finally {
    if (handle) await handle.close().catch(() => undefined);
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    await rm(temporaryBackupPath, { force: true }).catch(() => undefined);
  }
}
