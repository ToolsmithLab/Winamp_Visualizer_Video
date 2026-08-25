"use strict";

const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const {
  PROJECTM_FRAME_META_SIZE,
  PROJECTM_HEADER_SIZE,
  PROJECTM_OUTPUT_MAGIC,
  PROJECTM_PROTOCOL_VERSION,
  ProjectMPacketParser,
  ProjectMPacketWriter
} = require("../dist/main/projectm/projectMProtocol");
const {
  ProjectMHostService
} = require("../dist/main/projectm/projectMHostService");

const root = path.resolve(__dirname, "..");
const runtimePaths = {
  hostPath: path.join(root, "native", "bin", "win-x64", "projectm-host.exe"),
  libraryPath: path.join(root, "native", "bin", "win-x64", "projectM-4.dll"),
  presetPath: path.join(
    root,
    "assets",
    "projectm",
    "presets",
    "AVS Audio Wave.milk"
  )
};
const nativeAvailable =
  process.platform === "win32" &&
  Object.values(runtimePaths).every((value) => fs.existsSync(value));
const ProjectMOutputType = Object.freeze({
  Status: 100,
  Ack: 101,
  Frame: 102,
  Error: 103
});

function outputPacket(
  type,
  requestId,
  payload = Buffer.alloc(0),
  arg0 = 0,
  arg1 = 0
) {
  const header = Buffer.alloc(PROJECTM_HEADER_SIZE);
  header.writeUInt32LE(PROJECTM_OUTPUT_MAGIC, 0);
  header.writeUInt16LE(PROJECTM_PROTOCOL_VERSION, 4);
  header.writeUInt16LE(type, 6);
  header.writeUInt32LE(requestId, 8);
  header.writeUInt32LE(payload.length, 12);
  header.writeUInt32LE(arg0, 16);
  header.writeUInt32LE(arg1, 20);
  return Buffer.concat([header, payload]);
}

function framePacket(requestId, width = 4, height = 3) {
  const stride = width * 4;
  const payload = Buffer.alloc(PROJECTM_FRAME_META_SIZE + stride * height);
  payload.writeUInt32LE(width, 0);
  payload.writeUInt32LE(height, 4);
  payload.writeUInt32LE(stride, 8);
  payload.writeUInt32LE(128, 12);
  payload.writeBigUInt64LE(7n, 16);
  payload.writeBigUInt64LE(1000n, 24);
  payload.writeUInt32LE(1, 32);
  return outputPacket(
    ProjectMOutputType.Frame,
    requestId,
    payload,
    width,
    height
  );
}

function feed(parser, bytes, chunkSizes) {
  const packets = [];
  let offset = 0;
  for (const size of chunkSizes) {
    if (offset >= bytes.length) break;
    packets.push(...parser.push(bytes.subarray(offset, offset + size)));
    offset += size;
  }
  if (offset < bytes.length) packets.push(...parser.push(bytes.subarray(offset)));
  return packets;
}

test("IPC 01 - header frammentato byte per byte", () => {
  const parser = new ProjectMPacketParser();
  const packet = outputPacket(ProjectMOutputType.Status, 1, Buffer.from("{}"));
  const result = feed(parser, packet, Array(packet.length).fill(1));
  assert.equal(result.length, 1);
  assert.equal(result[0].requestId, 1);
});

test("IPC 02 - payload frammentato byte per byte", () => {
  const parser = new ProjectMPacketParser();
  const payload = Buffer.from("payload-frammentato");
  const result = feed(
    parser,
    outputPacket(ProjectMOutputType.Status, 2, payload),
    [PROJECTM_HEADER_SIZE, ...Array(payload.length).fill(1)]
  );
  assert.equal(result[0].payload.toString(), payload.toString());
});

test("IPC 03 - più pacchetti concatenati in un chunk", () => {
  const parser = new ProjectMPacketParser();
  const bytes = Buffer.concat([
    outputPacket(ProjectMOutputType.Status, 3, Buffer.from("{}")),
    outputPacket(ProjectMOutputType.Ack, 4, Buffer.from("{}")),
    framePacket(5)
  ]);
  assert.deepEqual(
    parser.push(bytes).map((packet) => packet.requestId),
    [3, 4, 5]
  );
});

test("IPC 04 - chunk terminato esattamente a fine header", () => {
  const parser = new ProjectMPacketParser();
  const bytes = outputPacket(ProjectMOutputType.Status, 6, Buffer.from("ok"));
  assert.equal(parser.push(bytes.subarray(0, PROJECTM_HEADER_SIZE)).length, 0);
  assert.equal(parser.push(bytes.subarray(PROJECTM_HEADER_SIZE)).length, 1);
});

test("IPC 05 - chunk terminato a metà payload", () => {
  const parser = new ProjectMPacketParser();
  const bytes = outputPacket(ProjectMOutputType.Status, 7, Buffer.alloc(101, 7));
  assert.equal(parser.push(bytes.subarray(0, 37)).length, 0);
  assert.equal(parser.state.payloadBytesBuffered, 13);
  assert.equal(parser.push(bytes.subarray(37)).length, 1);
});

test("IPC 06 - pacchetto Ack con payload vuoto", () => {
  const parser = new ProjectMPacketParser();
  const [packet] = parser.push(outputPacket(ProjectMOutputType.Ack, 8));
  assert.equal(packet.payload.length, 0);
});

test("IPC 06b - EOF pulito senza dati non è framing corrotto", () => {
  const parser = new ProjectMPacketParser();
  parser.finish();
  assert.equal(parser.state.finished, true);
  assert.equal(parser.state.failed, false);
});

test("IPC 06c - dieci pacchetti concatenati sono consumati nello stesso push", () => {
  const parser = new ProjectMPacketParser();
  const bytes = Buffer.concat(
    Array.from({ length: 10 }, (_, index) =>
      outputPacket(ProjectMOutputType.Status, 100 + index, Buffer.from("{}"))
    )
  );
  assert.equal(parser.push(bytes).length, 10);
});

test("IPC 06d - chunk a metà del secondo pacchetto conserva il primo", () => {
  const parser = new ProjectMPacketParser();
  const first = outputPacket(ProjectMOutputType.Status, 200, Buffer.from("{}"));
  const second = outputPacket(
    ProjectMOutputType.Status,
    201,
    Buffer.alloc(40, 2)
  );
  const split = first.length + PROJECTM_HEADER_SIZE + 7;
  const bytes = Buffer.concat([first, second]);
  const firstPush = parser.push(bytes.subarray(0, split));
  assert.deepEqual(firstPush.map((packet) => packet.requestId), [200]);
  assert.equal(parser.state.payloadBytesBuffered, 7);
  assert.equal(parser.push(bytes.subarray(split))[0].requestId, 201);
});

test("IPC 07 - framebuffer grande e molto frammentato", () => {
  const parser = new ProjectMPacketParser();
  const bytes = framePacket(9, 320, 180);
  const result = feed(parser, bytes, Array(700).fill(347));
  assert.equal(result.length, 1);
  assert.equal(result[0].payload.length, PROJECTM_FRAME_META_SIZE + 320 * 180 * 4);
});

test("IPC 08 - frammentazione pseudo-casuale deterministica", () => {
  const parser = new ProjectMPacketParser();
  const bytes = Buffer.concat(
    Array.from({ length: 100 }, (_, index) =>
      outputPacket(ProjectMOutputType.Status, index + 1, Buffer.alloc(index, index))
    )
  );
  let state = 0x5a17c0de;
  const sizes = [];
  while (sizes.reduce((sum, value) => sum + value, 0) < bytes.length) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    sizes.push(1 + (state % 257));
  }
  assert.equal(feed(parser, bytes, sizes).length, 100);
});

test("IPC 09 - diecimila pacchetti senza perdita né duplicazione", () => {
  const parser = new ProjectMPacketParser();
  const bytes = Buffer.concat(
    Array.from({ length: 10_000 }, (_, index) =>
      outputPacket(ProjectMOutputType.Status, index + 1, Buffer.from("{}"))
    )
  );
  const packets = feed(parser, bytes, Array(20_000).fill(31));
  assert.equal(packets.length, 10_000);
  assert.equal(packets.at(-1).requestId, 10_000);
});

test("IPC 10 - magic errato rifiutato", () => {
  const parser = new ProjectMPacketParser();
  const bytes = outputPacket(ProjectMOutputType.Status, 10);
  bytes.writeUInt32LE(0xdeadbeef, 0);
  assert.throws(() => parser.push(bytes), /Magic.*non valido/);
});

test("IPC 11 - versione errata rifiutata", () => {
  const parser = new ProjectMPacketParser();
  const bytes = outputPacket(ProjectMOutputType.Status, 11);
  bytes.writeUInt16LE(PROJECTM_PROTOCOL_VERSION + 1, 4);
  assert.throws(() => parser.push(bytes), /Versione.*incompatibile/);
});

test("IPC 12 - tipo risposta sconosciuto rifiutato", () => {
  const parser = new ProjectMPacketParser();
  assert.throws(() => parser.push(outputPacket(65535, 12)), /Tipo.*non valido/);
});

test("IPC 13 - request ID nullo rifiutato", () => {
  const parser = new ProjectMPacketParser();
  assert.throws(
    () => parser.push(outputPacket(ProjectMOutputType.Status, 0)),
    /Identificatore.*nullo/
  );
});

test("IPC 14 - dimensione payload oltre limite rifiutata prima dell'allocazione", () => {
  const parser = new ProjectMPacketParser();
  const header = outputPacket(ProjectMOutputType.Status, 14);
  header.writeUInt32LE(0xffffffff, 12);
  assert.throws(() => parser.push(header), /oltre il limite/);
});

test("IPC 14b - lunghezza con bit di segno/overflow simulato è rifiutata", () => {
  const parser = new ProjectMPacketParser();
  const header = outputPacket(ProjectMOutputType.Status, 140);
  header.writeUInt32LE(0x80000000, 12);
  assert.throws(() => parser.push(header), /oltre il limite/);
});

test("IPC 15 - EOF dopo header parziale identificato come corruzione", () => {
  const parser = new ProjectMPacketParser();
  parser.push(outputPacket(ProjectMOutputType.Status, 15).subarray(0, 13));
  assert.throws(() => parser.finish(), /EOF durante l'header/);
});

test("IPC 16 - EOF dopo payload parziale identificato come corruzione", () => {
  const parser = new ProjectMPacketParser();
  const bytes = outputPacket(ProjectMOutputType.Status, 16, Buffer.alloc(40));
  parser.push(bytes.subarray(0, 32));
  assert.throws(() => parser.finish(), /EOF durante il payload/);
});

test("IPC 17 - metadati framebuffer troncati rifiutati", () => {
  const parser = new ProjectMPacketParser();
  assert.throws(
    () =>
      parser.push(
        outputPacket(ProjectMOutputType.Frame, 17, Buffer.alloc(12), 1, 1)
      ),
    /Metadati framebuffer.*incompleti/
  );
});

test("IPC 18 - dimensioni framebuffer incoerenti rifiutate", () => {
  const parser = new ProjectMPacketParser();
  const bytes = framePacket(18, 4, 3);
  bytes.writeUInt32LE(99, 16);
  assert.throws(() => parser.push(bytes), /Dimensioni framebuffer incoerenti/);
});

test("IPC 19 - stride o dimensione pixel corrotti rifiutati senza overflow", () => {
  const parser = new ProjectMPacketParser();
  const bytes = framePacket(19, 4, 3);
  bytes.writeUInt32LE(0xffffffff, PROJECTM_HEADER_SIZE + 8);
  assert.throws(() => parser.push(bytes), /Dimensione framebuffer.*incoerente/);
});

test("IPC 20 - reset esplicito consente recupero dopo errore di framing", () => {
  const parser = new ProjectMPacketParser();
  const malformed = outputPacket(ProjectMOutputType.Status, 20);
  malformed.writeUInt32LE(0, 0);
  assert.throws(() => parser.push(malformed));
  assert.throws(() => parser.push(outputPacket(ProjectMOutputType.Status, 21)));
  parser.reset();
  assert.equal(
    parser.push(outputPacket(ProjectMOutputType.Status, 21)).length,
    1
  );
});

class BackpressurePipe extends EventEmitter {
  constructor(backpressureEvery = 2) {
    super();
    this.backpressureEvery = backpressureEvery;
    this.writes = [];
    this.destroyed = false;
    this.writableEnded = false;
  }

  write(chunk) {
    this.writes.push(Buffer.from(chunk));
    const blocked = this.writes.length % this.backpressureEvery === 0;
    if (blocked) setImmediate(() => this.emit("drain"));
    return !blocked;
  }
}

test("IPC 21 - writer serializza header e payload sotto backpressure concorrente", async () => {
  const pipe = new BackpressurePipe(2);
  const writer = new ProjectMPacketWriter(pipe);
  const logicalPackets = Array.from({ length: 1_000 }, (_, index) => [
    Buffer.from(`H${String(index).padStart(4, "0")}`),
    Buffer.alloc(11 + (index % 7), index)
  ]);
  await Promise.all(logicalPackets.map((parts) => writer.enqueue(parts)));
  assert.deepEqual(
    Buffer.concat(pipe.writes),
    Buffer.concat(logicalPackets.flat())
  );
  assert.equal(writer.count, 1_000);
});

test("IPC 22 - chiusura pipe durante backpressure rigetta senza richiesta sospesa", async () => {
  const pipe = new BackpressurePipe(1);
  const writer = new ProjectMPacketWriter(pipe);
  const pending = writer.enqueue([Buffer.from("header"), Buffer.from("payload")]);
  setImmediate(() => pipe.emit("close"));
  await assert.rejects(pending, /chiusa durante la backpressure/);
});

test("IPC 23 - request ID sconosciuto viene diagnosticato senza crash", () => {
  const service = new ProjectMHostService(runtimePaths);
  const originalError = console.error;
  const messages = [];
  console.error = (...parts) => messages.push(parts.join(" "));
  try {
    service.handlePacket({
      type: ProjectMOutputType.Status,
      requestId: 999_999,
      arg0: 0,
      arg1: 0,
      payload: Buffer.from("{}")
    });
  } finally {
    console.error = originalError;
  }
  assert.match(messages.join("\n"), /requestId non atteso/);
  assert.match(messages.join("\n"), /999999/);
});

test("IPC 23b - risposta tardiva dopo dispose viene diagnosticata e non risolve Promise", () => {
  const service = new ProjectMHostService(runtimePaths);
  service.shuttingDown = true;
  const originalError = console.error;
  const messages = [];
  console.error = (...parts) => messages.push(parts.join(" "));
  try {
    service.handlePacket({
      type: ProjectMOutputType.Frame,
      requestId: 1,
      arg0: 1,
      arg1: 1,
      payload: Buffer.alloc(PROJECTM_FRAME_META_SIZE + 4)
    });
  } finally {
    console.error = originalError;
  }
  assert.equal(service.pending.size, 0);
  assert.match(messages.join("\n"), /requestId non atteso/);
  assert.match(messages.join("\n"), /"shuttingDown":true/);
});

test(
  "IPC 24 - host reale chiude e riparte senza stato parser residuo",
  { timeout: 120_000, skip: nativeAvailable ? false : "Host reale assente" },
  async () => {
    const service = new ProjectMHostService(runtimePaths);
    const first = await service.initialize(64, 64, 123n);
    assert.equal(first.available, true);
    await service.shutdown();
    const second = await service.initialize(64, 64, 123n);
    assert.equal(second.available, true);
    await service.shutdown();
  }
);

test(
  "IPC 25 - shutdown durante un render reale completa tutte le Promise",
  { timeout: 120_000, skip: nativeAvailable ? false : "Host reale assente" },
  async () => {
    const service = new ProjectMHostService(runtimePaths);
    const status = await service.initialize(64, 64, 456n);
    assert.equal(status.available, true);
    const render = service.render({
      width: 64,
      height: 64,
      channels: 2,
      steps: 1,
      samples: new Float32Array(2_048)
    });
    const [frame] = await Promise.all([render, service.shutdown()]);
    assert.equal(frame.width, 64);
    assert.equal(service.status.running, false);
  }
);

function stressPcm() {
  const samples = new Float32Array(3_200);
  for (let index = 0; index < samples.length / 2; index += 1) {
    const value = Math.sin((2 * Math.PI * 110 * index) / 48_000) * 0.5;
    samples[index * 2] = value;
    samples[index * 2 + 1] = value;
  }
  return samples;
}

test(
  "IPC 26 - render concorrenti applicano backpressure senza corrompere la pipe",
  { timeout: 120_000, skip: nativeAvailable ? false : "Host reale assente" },
  async () => {
    const service = new ProjectMHostService(runtimePaths);
    try {
      assert.equal((await service.initialize(64, 64, 789n)).available, true);
      const request = {
        width: 64,
        height: 64,
        channels: 2,
        steps: 1,
        samples: stressPcm()
      };
      const [first, obsolete] = await Promise.all([
        service.render(request),
        service.render(request)
      ]);
      assert.equal(first.width, 64);
      assert.equal(obsolete, null);
    } finally {
      await service.shutdown();
    }
  }
);

test(
  "IPC 27 - resize e reset durante render restano pacchetti atomici",
  { timeout: 120_000, skip: nativeAvailable ? false : "Host reale assente" },
  async () => {
    const service = new ProjectMHostService(runtimePaths);
    try {
      assert.equal((await service.initialize(64, 64, 790n)).available, true);
      const [frame, status] = await Promise.all([
        service.render({
          width: 64,
          height: 64,
          channels: 2,
          steps: 1,
          samples: stressPcm()
        }),
        service.reset(80, 48, 790n)
      ]);
      assert.equal(frame.width, 64);
      assert.equal(status.available, true);
      const resized = await service.render({
        width: 80,
        height: 48,
        channels: 2,
        steps: 1,
        samples: stressPcm()
      });
      assert.equal(resized.width, 80);
      assert.equal(resized.height, 48);
    } finally {
      await service.shutdown();
    }
  }
);

test(
  "IPC 28 - transizione preset durante render non interseca header e PCM",
  { timeout: 120_000, skip: nativeAvailable ? false : "Host reale assente" },
  async () => {
    const service = new ProjectMHostService(runtimePaths);
    try {
      assert.equal((await service.initialize(64, 64, 791n)).available, true);
      const [frame, status] = await Promise.all([
        service.render({
          width: 64,
          height: 64,
          channels: 2,
          steps: 1,
          samples: stressPcm()
        }),
        service.loadPreset(
          path.join(
            root,
            "tests",
            "fixtures",
            "preset-import",
            "parity-one.milk"
          ),
          { smoothTransition: true, transitionSeconds: 0.5 }
        )
      ]);
      assert.equal(frame.width, 64);
      assert.equal(status.available, true);
    } finally {
      await service.shutdown();
    }
  }
);
