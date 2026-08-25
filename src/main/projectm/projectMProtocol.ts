export const PROJECTM_INPUT_MAGIC = 0x4e494d50;
export const PROJECTM_OUTPUT_MAGIC = 0x544f4d50;
export const PROJECTM_PROTOCOL_VERSION = 2;
export const PROJECTM_HEADER_SIZE = 24;
export const PROJECTM_FRAME_META_SIZE = 40;
export const PROJECTM_MAX_CONTROL_PAYLOAD = 16 * 1024 * 1024;
export const PROJECTM_MAX_OUTPUT_PAYLOAD = 128 * 1024 * 1024;
export const PROJECTM_MAX_DIMENSION = 8192;

export const enum ProjectMInputType {
  Initialize = 1,
  Shutdown = 2,
  LoadPreset = 3,
  Step = 4,
  Reset = 5,
  Ping = 6,
  SetPresetLocked = 7
}

export const enum ProjectMOutputType {
  Status = 100,
  Ack = 101,
  Frame = 102,
  Error = 103
}

export interface ProjectMPacket {
  type: ProjectMOutputType;
  requestId: number;
  arg0: number;
  arg1: number;
  payload: Buffer<ArrayBufferLike>;
}

export interface ProjectMParserState {
  packetsParsed: number;
  headerBytesBuffered: number;
  payloadBytesBuffered: number;
  payloadBytesExpected: number;
  currentRequestId: number | null;
  currentType: number | null;
  headerDecoded: {
    magic: number;
    version: number;
    type: number;
    requestId: number;
    payloadBytes: number;
    arg0: number;
    arg1: number;
  } | null;
  failed: boolean;
  finished: boolean;
}

export class ProjectMFramingError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly state: ProjectMParserState
  ) {
    super(message);
    this.name = "ProjectMFramingError";
  }
}

export const PROJECTM_SEED_SIZE = 8;
export const PROJECTM_DEFAULT_SEED = 0x5f3759dfn;

export function normalizeProjectMSeed(seed: number | bigint): bigint {
  if (typeof seed === "number") {
    if (!Number.isSafeInteger(seed) || seed < 0) {
      throw new Error("Il seed projectM deve essere un intero non negativo.");
    }
    seed = BigInt(seed);
  }
  if (seed < 0n || seed > 0xffff_ffff_ffff_ffffn) {
    throw new Error("Il seed projectM non rientra nel formato uint64.");
  }
  return seed;
}

export function encodeProjectMSeed(
  seed: number | bigint
): Buffer<ArrayBufferLike> {
  const payload = Buffer.alloc(PROJECTM_SEED_SIZE);
  payload.writeBigUInt64LE(normalizeProjectMSeed(seed));
  return payload;
}

export function encodeProjectMUtf8(
  value: string,
  fieldName = "stringa projectM"
): Buffer<ArrayBufferLike> {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) {
        throw new Error(`${fieldName}: surrogato UTF-16 alto non accoppiato.`);
      }
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      throw new Error(`${fieldName}: surrogato UTF-16 basso non accoppiato.`);
    }
  }
  const encoded = Buffer.from(value, "utf8");
  if (encoded.toString("utf8") !== value) {
    throw new Error(`${fieldName}: codifica UTF-8 non reversibile.`);
  }
  return encoded;
}

export function createInputPacket(
  type: ProjectMInputType,
  requestId: number,
  payload: Buffer<ArrayBufferLike> = Buffer.alloc(0),
  arg0 = 0,
  arg1 = 0
): Buffer<ArrayBufferLike>[] {
  const header = Buffer.allocUnsafe(PROJECTM_HEADER_SIZE);
  header.writeUInt32LE(PROJECTM_INPUT_MAGIC, 0);
  header.writeUInt16LE(PROJECTM_PROTOCOL_VERSION, 4);
  header.writeUInt16LE(type, 6);
  header.writeUInt32LE(requestId, 8);
  header.writeUInt32LE(payload.byteLength, 12);
  header.writeUInt32LE(arg0, 16);
  header.writeUInt32LE(arg1, 20);
  return payload.byteLength ? [header, payload] : [header];
}

export class ProjectMPacketParser {
  private readonly header = Buffer.alloc(PROJECTM_HEADER_SIZE);
  private headerOffset = 0;
  private payload: Buffer<ArrayBufferLike> | null = null;
  private payloadOffset = 0;
  private current:
    | Omit<ProjectMPacket, "payload">
    | null = null;
  private packetsParsed = 0;
  private failed = false;
  private finished = false;

  get state(): ProjectMParserState {
    return {
      packetsParsed: this.packetsParsed,
      headerBytesBuffered: this.headerOffset,
      payloadBytesBuffered: this.payloadOffset,
      payloadBytesExpected: this.payload?.byteLength ?? 0,
      currentRequestId: this.current?.requestId ?? null,
      currentType: this.current?.type ?? null,
      headerDecoded:
        this.headerOffset === PROJECTM_HEADER_SIZE || this.current
          ? {
              magic: this.header.readUInt32LE(0),
              version: this.header.readUInt16LE(4),
              type: this.header.readUInt16LE(6),
              requestId: this.header.readUInt32LE(8),
              payloadBytes: this.header.readUInt32LE(12),
              arg0: this.header.readUInt32LE(16),
              arg1: this.header.readUInt32LE(20)
            }
          : null,
      failed: this.failed,
      finished: this.finished
    };
  }

  push(chunk: Buffer<ArrayBufferLike>): ProjectMPacket[] {
    if (this.failed) {
      throw this.framingError(
        "PARSER_FAILED",
        "Il parser IPC projectM richiede un reset dopo un errore di framing."
      );
    }
    if (this.finished) {
      throw this.framingError(
        "DATA_AFTER_EOF",
        "Dati IPC projectM ricevuti dopo la fine dello stream."
      );
    }
    const packets: ProjectMPacket[] = [];
    let offset = 0;
    while (offset < chunk.byteLength) {
      if (!this.current) {
        const copied = chunk.copy(
          this.header,
          this.headerOffset,
          offset,
          offset + Math.min(
            PROJECTM_HEADER_SIZE - this.headerOffset,
            chunk.byteLength - offset
          )
        );
        offset += copied;
        this.headerOffset += copied;
        if (this.headerOffset < PROJECTM_HEADER_SIZE) continue;
        if (this.header.readUInt32LE(0) !== PROJECTM_OUTPUT_MAGIC) {
          throw this.fail(
            "INVALID_MAGIC",
            `Magic del protocollo projectM non valido (header=${this.safeHeaderHex()}).`
          );
        }
        if (this.header.readUInt16LE(4) !== PROJECTM_PROTOCOL_VERSION) {
          throw this.fail(
            "INVALID_VERSION",
            `Versione del protocollo projectM incompatibile: ${this.header.readUInt16LE(4)}.`
          );
        }
        const type = this.header.readUInt16LE(6);
        if (!isProjectMOutputType(type)) {
          throw this.fail(
            "INVALID_OUTPUT_TYPE",
            `Tipo di risposta projectM non valido: ${type}.`
          );
        }
        const requestId = this.header.readUInt32LE(8);
        if (requestId === 0) {
          throw this.fail(
            "INVALID_REQUEST_ID",
            "Identificatore richiesta projectM nullo."
          );
        }
        const payloadSize = this.header.readUInt32LE(12);
        if (payloadSize > PROJECTM_MAX_OUTPUT_PAYLOAD) {
          throw this.fail(
            "PAYLOAD_TOO_LARGE",
            `Payload projectM oltre il limite di sicurezza: ${payloadSize} byte.`
          );
        }
        if (
          type !== ProjectMOutputType.Frame &&
          payloadSize > PROJECTM_MAX_CONTROL_PAYLOAD
        ) {
          throw this.fail(
            "CONTROL_PAYLOAD_TOO_LARGE",
            `Payload di controllo projectM oltre il limite: ${payloadSize} byte.`
          );
        }
        this.current = {
          type,
          requestId,
          arg0: this.header.readUInt32LE(16),
          arg1: this.header.readUInt32LE(20)
        };
        this.payload = Buffer.allocUnsafe(payloadSize);
        this.payloadOffset = 0;
        this.headerOffset = 0;
        if (payloadSize === 0) {
          const packet = { ...this.current, payload: this.payload };
          this.validatePacket(packet);
          packets.push(packet);
          this.packetsParsed += 1;
          this.current = null;
          this.payload = null;
        }
        continue;
      }

      const payload = this.payload as Buffer<ArrayBufferLike>;
      const copied = chunk.copy(
        payload,
        this.payloadOffset,
        offset,
        offset + Math.min(
          payload.byteLength - this.payloadOffset,
          chunk.byteLength - offset
        )
      );
      offset += copied;
      this.payloadOffset += copied;
      if (this.payloadOffset === payload.byteLength) {
        const packet = { ...this.current, payload };
        this.validatePacket(packet);
        packets.push(packet);
        this.packetsParsed += 1;
        this.current = null;
        this.payload = null;
        this.payloadOffset = 0;
      }
    }
    return packets;
  }

  finish(): void {
    if (this.finished) return;
    this.finished = true;
    if (this.failed) return;
    if (this.headerOffset !== 0 || this.current) {
      throw this.fail(
        "TRUNCATED_PACKET",
        this.current
          ? `EOF durante il payload projectM: ${this.payloadOffset}/${this.payload?.byteLength ?? 0} byte.`
          : `EOF durante l'header projectM: ${this.headerOffset}/${PROJECTM_HEADER_SIZE} byte.`
      );
    }
  }

  reset(): void {
    this.headerOffset = 0;
    this.payload = null;
    this.payloadOffset = 0;
    this.current = null;
    this.packetsParsed = 0;
    this.failed = false;
    this.finished = false;
  }

  private validatePacket(packet: ProjectMPacket): void {
    if (packet.type !== ProjectMOutputType.Frame) return;
    if (packet.payload.byteLength < PROJECTM_FRAME_META_SIZE) {
      throw this.fail(
        "FRAME_META_TRUNCATED",
        `Metadati framebuffer projectM incompleti: ${packet.payload.byteLength}/${PROJECTM_FRAME_META_SIZE} byte.`
      );
    }
    const width = packet.payload.readUInt32LE(0);
    const height = packet.payload.readUInt32LE(4);
    const stride = packet.payload.readUInt32LE(8);
    if (
      width === 0 ||
      height === 0 ||
      width > PROJECTM_MAX_DIMENSION ||
      height > PROJECTM_MAX_DIMENSION
    ) {
      throw this.fail(
        "FRAME_DIMENSIONS_INVALID",
        `Dimensioni framebuffer projectM non valide: ${width}x${height}.`
      );
    }
    if (packet.arg0 !== width || packet.arg1 !== height) {
      throw this.fail(
        "FRAME_HEADER_MISMATCH",
        `Dimensioni framebuffer incoerenti tra header (${packet.arg0}x${packet.arg1}) e payload (${width}x${height}).`
      );
    }
    const minimumStride = BigInt(width) * 4n;
    const pixelBytes = BigInt(stride) * BigInt(height);
    const expectedPayload = BigInt(PROJECTM_FRAME_META_SIZE) + pixelBytes;
    if (
      BigInt(stride) < minimumStride ||
      expectedPayload !== BigInt(packet.payload.byteLength)
    ) {
      throw this.fail(
        "FRAME_SIZE_INVALID",
        `Dimensione framebuffer projectM incoerente: stride=${stride}, altezza=${height}, payload=${packet.payload.byteLength}.`
      );
    }
  }

  private safeHeaderHex(): string {
    return this.header.subarray(0, PROJECTM_HEADER_SIZE).toString("hex");
  }

  private framingError(code: string, message: string): ProjectMFramingError {
    return new ProjectMFramingError(code, message, this.state);
  }

  private fail(code: string, message: string): ProjectMFramingError {
    this.failed = true;
    return this.framingError(code, message);
  }
}

function isProjectMOutputType(value: number): value is ProjectMOutputType {
  return (
    value === ProjectMOutputType.Status ||
    value === ProjectMOutputType.Ack ||
    value === ProjectMOutputType.Frame ||
    value === ProjectMOutputType.Error
  );
}

export interface ProjectMPacketWritable {
  readonly destroyed?: boolean;
  readonly writableEnded?: boolean;
  write(chunk: Buffer<ArrayBufferLike>): boolean;
  once(event: "drain", listener: () => void): unknown;
  once(event: "close", listener: () => void): unknown;
  once(event: "error", listener: (error: Error) => void): unknown;
  removeListener(event: "drain", listener: () => void): unknown;
  removeListener(event: "close", listener: () => void): unknown;
  removeListener(event: "error", listener: (error: Error) => void): unknown;
}

/**
 * Serializza un pacchetto logico per volta. Header e payload possono restare
 * buffer distinti (nessuna copia del PCM), ma nessun altro comando può
 * inserirsi fra i due mentre la pipe applica backpressure.
 */
export class ProjectMPacketWriter {
  private tail: Promise<void> = Promise.resolve();
  private closed = false;
  private packetsWritten = 0;

  constructor(private readonly output: ProjectMPacketWritable) {}

  get count(): number {
    return this.packetsWritten;
  }

  enqueue(parts: readonly Buffer<ArrayBufferLike>[]): Promise<void> {
    if (this.closed) {
      return Promise.reject(
        new Error("Writer IPC projectM già chiuso.")
      );
    }
    const operation = this.tail.then(async () => {
      if (this.closed) {
        throw new Error("Writer IPC projectM chiuso prima della scrittura.");
      }
      for (const part of parts) {
        if (this.output.destroyed || this.output.writableEnded) {
          throw new Error("Pipe di input projectM chiusa durante la scrittura.");
        }
        if (!this.output.write(part)) await this.waitForDrain();
      }
      this.packetsWritten += 1;
    });
    this.tail = operation.catch(() => undefined);
    return operation;
  }

  async finish(): Promise<void> {
    await this.tail;
  }

  close(): void {
    this.closed = true;
  }

  private waitForDrain(): Promise<void> {
    return new Promise((resolve, reject) => {
      const cleanup = (): void => {
        this.output.removeListener("drain", onDrain);
        this.output.removeListener("close", onClose);
        this.output.removeListener("error", onError);
      };
      const onDrain = (): void => {
        cleanup();
        resolve();
      };
      const onClose = (): void => {
        cleanup();
        reject(new Error("Pipe projectM chiusa durante la backpressure."));
      };
      const onError = (error: Error): void => {
        cleanup();
        reject(error);
      };
      this.output.once("drain", onDrain);
      this.output.once("close", onClose);
      this.output.once("error", onError);
    });
  }
}
