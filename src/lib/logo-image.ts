import sharp from "sharp";

/**
 * Brand marks arrive as favicons or logo-service tiles: some are transparent
 * PNGs, others are a flat coloured (often white) square. Painting them on a
 * dark UI means stripping that backdrop and lifting near-black marks so every
 * logo reads at sidebar size.
 */
export type NormalizedLogo = { data: Buffer; width: number; height: number };

const BACKGROUND_DISTANCE = 24;
const BACKGROUND_FADE = 56;
const MIN_CONTENT_SHARE = 0.02;

function borderBackground(data: Buffer, width: number, height: number): [number, number, number] | null {
  const cornerPoints: Array<[number, number]> = [
    [1, 1],
    [width - 2, 1],
    [1, height - 2],
    [width - 2, height - 2],
  ];
  const corners = cornerPoints.map(([x, y]) => {
    const i = (y * width + x) * 4;
    return { a: data[i + 3], r: data[i], g: data[i + 1], b: data[i + 2] };
  });

  // Flat app-icon/favicon backgrounds show up as four matching opaque corners.
  // This catches white backdrops even when the artwork touches most of the edge
  // (e.g. Microsoft's four coloured squares).
  if (corners.every((corner) => corner.a > 200)) {
    const [first] = corners;
    const same = corners.every((corner) => Math.max(
      Math.abs(corner.r - first.r),
      Math.abs(corner.g - first.g),
      Math.abs(corner.b - first.b),
    ) < 26);
    if (same) {
      return [
        Math.round(corners.reduce((sum, corner) => sum + corner.r, 0) / corners.length),
        Math.round(corners.reduce((sum, corner) => sum + corner.g, 0) / corners.length),
        Math.round(corners.reduce((sum, corner) => sum + corner.b, 0) / corners.length),
      ];
    }
  }

  const buckets = new Map<number, { count: number; r: number; g: number; b: number }>();
  let opaque = 0;

  const sample = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    if (data[i + 3] < 200) return;
    opaque += 1;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    // Quantise so anti-aliased edges still land in the same bucket.
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const entry = buckets.get(key);
    if (entry) {
      entry.count += 1;
      entry.r += r;
      entry.g += g;
      entry.b += b;
    } else {
      buckets.set(key, { count: 1, r, g, b });
    }
  };

  for (let x = 0; x < width; x += 1) {
    sample(x, 0);
    sample(x, height - 1);
  }
  for (let y = 1; y < height - 1; y += 1) {
    sample(0, y);
    sample(width - 1, y);
  }

  if (opaque === 0) return null;
  let best: { count: number; r: number; g: number; b: number } | null = null;
  for (const entry of buckets.values()) {
    if (!best || entry.count > best.count) best = entry;
  }
  if (!best || best.count < opaque * 0.45) return null;
  return [Math.round(best.r / best.count), Math.round(best.g / best.count), Math.round(best.b / best.count)];
}

function opaqueBounds(data: Buffer, width: number, height: number) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let count = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] < 24) continue;
      count += 1;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  return { minX, minY, maxX, maxY, count };
}

/** Drop specks such as Vanguard's tiny ™ so the mark reads cleanly at 22px. */
function removeSpecks(data: Buffer, width: number, height: number, minimumShare: number) {
  const visited = new Uint8Array(width * height);
  const islands: number[][] = [];
  let largest = 0;

  for (let start = 0; start < width * height; start += 1) {
    if (visited[start] || data[start * 4 + 3] < 40) continue;
    const island: number[] = [];
    const stack = [start];
    visited[start] = 1;
    while (stack.length) {
      const index = stack.pop()!;
      island.push(index);
      const x = index % width;
      const y = (index - x) / width;
      const neighbours = [
        x > 0 ? index - 1 : -1,
        x < width - 1 ? index + 1 : -1,
        y > 0 ? index - width : -1,
        y < height - 1 ? index + width : -1,
      ];
      for (const next of neighbours) {
        if (next < 0 || visited[next] || data[next * 4 + 3] < 40) continue;
        visited[next] = 1;
        stack.push(next);
      }
    }
    islands.push(island);
    if (island.length > largest) largest = island.length;
  }

  const minimum = Math.max(6, Math.round(largest * minimumShare));
  for (const island of islands) {
    if (island.length >= minimum) continue;
    for (const index of island) data[index * 4 + 3] = 0;
  }
}

function parseHex(value: string | undefined): [number, number, number] | null {
  if (!value) return null;
  const match = /^#?([0-9a-f]{6})$/i.exec(value.trim());
  if (!match) return null;
  const numeric = Number.parseInt(match[1], 16);
  return [(numeric >> 16) & 255, (numeric >> 8) & 255, numeric & 255];
}

/** Recolour a flat white/black mark (e.g. Vanguard's V) to its brand colour. */
function tintMonochrome(data: Buffer, tint: [number, number, number]) {
  let opaque = 0;
  let monochrome = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 40) continue;
    opaque += 1;
    const spread = Math.max(data[i], data[i + 1], data[i + 2]) - Math.min(data[i], data[i + 1], data[i + 2]);
    if (spread <= 10) monochrome += 1;
  }
  if (!opaque || monochrome / opaque < 0.85) return;
  const [r, g, b] = tint;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 10) continue;
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }
}

/**
 * Returns a transparent, tightly-cropped PNG, or null when the image has no
 * usable mark left after background removal.
 */
export async function normalizeLogo(
  input: Buffer,
  options: { size?: number; tint?: string; aggressiveSpecks?: boolean } = {},
): Promise<Buffer | null> {
  const size = options.size ?? 128;
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const pixels = Buffer.from(data);
  const background = borderBackground(pixels, width, height);

  const transparent = Buffer.from(pixels);
  if (background) {
    const [br, bg, bb] = background;
    for (let i = 0; i < transparent.length; i += 4) {
      const alpha = transparent[i + 3];
      if (alpha === 0) continue;
      const distance = Math.hypot(transparent[i] - br, transparent[i + 1] - bg, transparent[i + 2] - bb);
      if (distance < BACKGROUND_DISTANCE) transparent[i + 3] = 0;
      else if (distance < BACKGROUND_FADE) {
        transparent[i + 3] = Math.round(alpha * ((distance - BACKGROUND_DISTANCE) / (BACKGROUND_FADE - BACKGROUND_DISTANCE)));
      }
    }
  }

  const before = opaqueBounds(pixels, width, height).count;
  const after = opaqueBounds(transparent, width, height).count;
  const cleaned = background && after / Math.max(1, width * height) < MIN_CONTENT_SHARE
    ? pixels // The "background" was the mark itself; keep the original.
    : transparent;

  // Lift near-black marks (Apple, iShares, dark wordmarks) so they read on the
  // dark surface. Saturated blues/reds keep their colour.
  const maxChannels: number[] = [];
  for (let i = 0; i < cleaned.length; i += 4) {
    if (cleaned[i + 3] < 40) continue;
    maxChannels.push(Math.max(cleaned[i], cleaned[i + 1], cleaned[i + 2]));
  }
  maxChannels.sort((a, b) => a - b);
  const p70 = maxChannels.length ? maxChannels[Math.floor((maxChannels.length - 1) * 0.7)] : 255;
  if (p70 < 105) {
    for (let i = 0; i < cleaned.length; i += 4) {
      if (cleaned[i + 3] === 0) continue;
      cleaned[i] = 245;
      cleaned[i + 1] = 245;
      cleaned[i + 2] = 245;
    }
  }

  removeSpecks(cleaned, width, height, options.aggressiveSpecks ? 0.03 : 0.01);
  const tint = parseHex(options.tint);
  if (tint) tintMonochrome(cleaned, tint);

  const bounds = opaqueBounds(cleaned, width, height);
  if (bounds.count < 8 || bounds.maxX < bounds.minX) return null;

  const markWidth = bounds.maxX - bounds.minX + 1;
  const markHeight = bounds.maxY - bounds.minY + 1;
  const padding = Math.round(size * 0.04);
  const inner = Math.max(8, size - padding * 2);
  const output = await sharp(cleaned, { raw: { width, height, channels: 4 } })
    .extract({ left: bounds.minX, top: bounds.minY, width: markWidth, height: markHeight })
    .resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .extend({
      top: padding,
      bottom: padding,
      left: padding,
      right: padding,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png({ compressionLevel: 9 })
    .toBuffer();

  // Guard against a source so small that the crop was a single pixel, and
  // against an almost entirely empty result.
  return before > 0 && output.byteLength > 80 ? output : null;
}
