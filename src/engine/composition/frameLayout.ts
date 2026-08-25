export interface FrameRectangle {
  x: number;
  y: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
}

export interface FrameTargetLayout {
  width: number;
  height: number;
  stride: number;
  byteLength: number;
  viewport: FrameRectangle;
  scissor: FrameRectangle;
}

export interface SurfaceFrameLayout {
  source: FrameRectangle;
  destination: FrameRectangle;
  target: FrameTargetLayout;
}

export type SurfaceFitMode = "contain" | "fill" | "stretch" | "original";

export interface SurfaceDrawLayout {
  source: FrameRectangle;
  destination: FrameRectangle;
}

export interface FrameCoverage {
  width: number;
  height: number;
  stride: number;
  byteLength: number;
  writtenRows: number;
  invalidAlphaPixels: number;
  firstRowWritten: boolean;
  lastRowWritten: boolean;
  lastTenRowsWritten: boolean;
  trailingIdenticalRows: number;
}

function positiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} deve essere un intero positivo.`);
  }
  return value;
}

function rectangle(
  x: number,
  y: number,
  width: number,
  height: number
): FrameRectangle {
  return {
    x,
    y,
    width,
    height,
    right: x + width,
    bottom: y + height
  };
}

export function resolveFrameTarget(
  widthValue: number,
  heightValue: number
): FrameTargetLayout {
  const width = positiveInteger(widthValue, "Larghezza frame");
  const height = positiveInteger(heightValue, "Altezza frame");
  const stride = width * 4;
  const byteLength = stride * height;
  if (!Number.isSafeInteger(byteLength)) {
    throw new Error("Dimensione frame oltre il limite numerico.");
  }
  const bounds = rectangle(0, 0, width, height);
  return {
    width,
    height,
    stride,
    byteLength,
    viewport: bounds,
    scissor: { ...bounds }
  };
}

export function resolveFullFrameSurface(
  sourceWidthValue: number,
  sourceHeightValue: number,
  outputWidthValue: number,
  outputHeightValue: number,
  edgeBleedPixels = 0
): SurfaceFrameLayout {
  const sourceWidth = positiveInteger(sourceWidthValue, "Larghezza sorgente");
  const sourceHeight = positiveInteger(sourceHeightValue, "Altezza sorgente");
  const target = resolveFrameTarget(outputWidthValue, outputHeightValue);
  const maximumBleed = Math.max(
    0,
    Math.floor((Math.min(sourceWidth, sourceHeight) - 1) / 2)
  );
  const bleed = Math.min(
    maximumBleed,
    Math.max(0, Math.floor(edgeBleedPixels))
  );
  return {
    source: rectangle(
      bleed,
      bleed,
      sourceWidth - bleed * 2,
      sourceHeight - bleed * 2
    ),
    destination: rectangle(0, 0, target.width, target.height),
    target
  };
}

export function resolveFittedSurface(
  sourceWidthValue: number,
  sourceHeightValue: number,
  targetWidthValue: number,
  targetHeightValue: number,
  fitMode: SurfaceFitMode,
  originalScale = 1
): SurfaceDrawLayout {
  const sourceWidth = positiveInteger(
    Math.max(1, Math.round(sourceWidthValue)),
    "Larghezza sorgente"
  );
  const sourceHeight = positiveInteger(
    Math.max(1, Math.round(sourceHeightValue)),
    "Altezza sorgente"
  );
  const targetWidth = Math.max(1, targetWidthValue);
  const targetHeight = Math.max(1, targetHeightValue);
  let source = rectangle(0, 0, sourceWidth, sourceHeight);
  let destinationWidth = targetWidth;
  let destinationHeight = targetHeight;

  if (fitMode === "fill") {
    const sourceRatio = sourceWidth / sourceHeight;
    const targetRatio = targetWidth / targetHeight;
    if (sourceRatio > targetRatio) {
      const width = sourceHeight * targetRatio;
      source = rectangle((sourceWidth - width) / 2, 0, width, sourceHeight);
    } else {
      const height = sourceWidth / targetRatio;
      source = rectangle(0, (sourceHeight - height) / 2, sourceWidth, height);
    }
  } else if (fitMode !== "stretch") {
    const scale =
      fitMode === "original"
        ? Math.min(
            Number.isFinite(originalScale) && originalScale > 0
              ? originalScale
              : 1,
            targetWidth / sourceWidth,
            targetHeight / sourceHeight
          )
        : Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight);
    destinationWidth = sourceWidth * scale;
    destinationHeight = sourceHeight * scale;
  }

  return {
    source,
    destination: rectangle(
      -destinationWidth / 2,
      -destinationHeight / 2,
      destinationWidth,
      destinationHeight
    )
  };
}

export function assertFrameBufferLayout(
  bytes: ArrayBufferView,
  layout: FrameTargetLayout,
  stride = layout.stride
): void {
  if (
    stride !== layout.stride ||
    bytes.byteLength !== layout.byteLength
  ) {
    throw new Error(
      `Buffer frame non coerente: stride ${stride}, ${bytes.byteLength} byte; ` +
        `attesi stride ${layout.stride}, ${layout.byteLength} byte.`
    );
  }
}

export function inspectRgbaFrameCoverage(
  bytes: Uint8Array,
  width: number,
  height: number,
  stride = width * 4
): FrameCoverage {
  const target = resolveFrameTarget(width, height);
  assertFrameBufferLayout(bytes, target, stride);
  let writtenRows = 0;
  let invalidAlphaPixels = 0;
  const rowWritten: boolean[] = [];
  for (let row = 0; row < height; row += 1) {
    const start = row * stride;
    let written = true;
    for (let column = 0; column < width; column += 1) {
      const alpha = bytes[start + column * 4 + 3]!;
      if (alpha !== 255) {
        written = false;
        invalidAlphaPixels += 1;
      }
    }
    rowWritten.push(written);
    if (written) writtenRows += 1;
  }

  const lastRowStart = (height - 1) * stride;
  let trailingIdenticalRows = 1;
  for (let row = height - 2; row >= 0; row -= 1) {
    const start = row * stride;
    let identical = true;
    for (let offset = 0; offset < stride; offset += 1) {
      if (bytes[start + offset] !== bytes[lastRowStart + offset]) {
        identical = false;
        break;
      }
    }
    if (!identical) break;
    trailingIdenticalRows += 1;
  }

  return {
    width,
    height,
    stride,
    byteLength: bytes.byteLength,
    writtenRows,
    invalidAlphaPixels,
    firstRowWritten: rowWritten[0] === true,
    lastRowWritten: rowWritten[height - 1] === true,
    lastTenRowsWritten: rowWritten
      .slice(Math.max(0, height - 10))
      .every(Boolean),
    trailingIdenticalRows
  };
}

export function assertOpaqueFrameCoverage(
  bytes: Uint8Array,
  width: number,
  height: number,
  stride = width * 4
): FrameCoverage {
  const coverage = inspectRgbaFrameCoverage(bytes, width, height, stride);
  if (
    coverage.invalidAlphaPixels !== 0 ||
    coverage.writtenRows !== height ||
    !coverage.firstRowWritten ||
    !coverage.lastRowWritten ||
    !coverage.lastTenRowsWritten
  ) {
    throw new Error(
      `Frame RGBA non completamente inizializzato: ` +
        `${coverage.writtenRows}/${height} righe opache, ` +
        `${coverage.invalidAlphaPixels} pixel con alpha non valido.`
    );
  }
  return coverage;
}
