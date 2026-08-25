export const PROJECTM_BLACK_THRESHOLD = 8;
export const PROJECTM_ALPHA_FULL = 112;

function smoothStep(edge0: number, edge1: number, value: number): number {
  const normalized = Math.max(
    0,
    Math.min(1, (value - edge0) / Math.max(1, edge1 - edge0))
  );
  return normalized * normalized * (3 - 2 * normalized);
}

export function projectMOverlayAlpha(
  red: number,
  green: number,
  blue: number
): number {
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
  const saturation = maximum - minimum;
  const signal = Math.max(luminance, maximum * 0.72 + saturation * 0.18);
  return Math.round(
    smoothStep(PROJECTM_BLACK_THRESHOLD, PROJECTM_ALPHA_FULL, signal) * 255
  );
}

export function convertProjectMBgraToOverlayRgba(
  bytes: Uint8Array,
  width: number,
  height: number,
  stride: number,
  target?: Uint8ClampedArray
): Uint8ClampedArray {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    stride !== width * 4 ||
    bytes.byteLength !== stride * height
  ) {
    throw new Error(
      `Framebuffer projectM non valido: ${width}x${height}, ` +
        `stride ${stride}, ${bytes.byteLength} byte.`
    );
  }
  const rgba =
    target?.byteLength === bytes.byteLength
      ? target
      : new Uint8ClampedArray(bytes.byteLength);
  for (let row = 0; row < height; row += 1) {
    const rowOffset = row * stride;
    for (let column = 0; column < width; column += 1) {
      const offset = rowOffset + column * 4;
      const blue = bytes[offset]!;
      const green = bytes[offset + 1]!;
      const red = bytes[offset + 2]!;
      rgba[offset] = red;
      rgba[offset + 1] = green;
      rgba[offset + 2] = blue;
      rgba[offset + 3] = projectMOverlayAlpha(red, green, blue);
    }
  }
  return rgba;
}
