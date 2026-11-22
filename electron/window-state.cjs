/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs");
const path = require("node:path");

// The title bar and the dashboard's first row have to stay usable, so a saved
// window is never restored below this size.
const MIN_WINDOW_WIDTH = 900;
const MIN_WINDOW_HEIGHT = 620;
const DEFAULT_WINDOW_WIDTH = 1440;
const DEFAULT_WINDOW_HEIGHT = 920;
// A saved window counts as visible when at least this much of it still overlaps
// a display. A few stray pixels on a monitor that has since been unplugged are
// not enough to grab the title bar and drag the window back.
const MIN_VISIBLE_OVERLAP = 80;

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function isUsableWorkArea(workArea) {
  return (
    Boolean(workArea) &&
    isFiniteNumber(workArea.x) &&
    isFiniteNumber(workArea.y) &&
    isFiniteNumber(workArea.width) &&
    isFiniteNumber(workArea.height) &&
    workArea.width > 0 &&
    workArea.height > 0
  );
}

// Only the work areas are needed, in the order Electron reported them (primary
// display first), so the caller's display objects can be passed straight in.
function workAreasOf(displays) {
  if (!Array.isArray(displays)) return [];
  return displays.filter((display) => isUsableWorkArea(display?.workArea)).map((display) => display.workArea);
}

function savedBoundsOf(saved) {
  if (!saved || typeof saved !== "object") return null;
  const { x, y, width, height } = saved;
  if (![x, y, width, height].every(isFiniteNumber)) return null;
  if (width <= 0 || height <= 0) return null;
  return { x, y, width, height };
}

function horizontalOverlap(bounds, workArea) {
  return Math.min(bounds.x + bounds.width, workArea.x + workArea.width) - Math.max(bounds.x, workArea.x);
}

function verticalOverlap(bounds, workArea) {
  return Math.min(bounds.y + bounds.height, workArea.y + workArea.height) - Math.max(bounds.y, workArea.y);
}

function isVisibleOn(bounds, workArea) {
  return (
    horizontalOverlap(bounds, workArea) >= MIN_VISIBLE_OVERLAP &&
    verticalOverlap(bounds, workArea) >= MIN_VISIBLE_OVERLAP
  );
}

// Size is clamped to the display (so an oversized window cannot hang off the
// edge) but never below the minimum the title bar needs, and the position is
// pulled inside the work area so the title bar is always reachable.
function fitToWorkArea(bounds, workArea) {
  const width = Math.min(
    Math.max(bounds.width, MIN_WINDOW_WIDTH),
    Math.max(workArea.width, MIN_WINDOW_WIDTH),
  );
  const height = Math.min(
    Math.max(bounds.height, MIN_WINDOW_HEIGHT),
    Math.max(workArea.height, MIN_WINDOW_HEIGHT),
  );
  return {
    x: Math.min(Math.max(bounds.x, workArea.x), Math.max(workArea.x, workArea.x + workArea.width - width)),
    y: Math.min(Math.max(bounds.y, workArea.y), Math.max(workArea.y, workArea.y + workArea.height - height)),
    width,
    height,
  };
}

function centeredIn(workArea) {
  return {
    x: Math.round(workArea.x + (workArea.width - DEFAULT_WINDOW_WIDTH) / 2),
    y: Math.round(workArea.y + (workArea.height - DEFAULT_WINDOW_HEIGHT) / 2),
    width: DEFAULT_WINDOW_WIDTH,
    height: DEFAULT_WINDOW_HEIGHT,
  };
}

function resolveInitialBounds(saved, displays) {
  const workAreas = workAreasOf(displays);
  const maximized = Boolean(saved?.maximized);
  const savedBounds = savedBoundsOf(saved);
  const savedWorkArea = savedBounds
    ? workAreas.find((workArea) => isVisibleOn(savedBounds, workArea))
    : undefined;

  if (savedBounds && savedWorkArea) {
    return { ...fitToWorkArea(savedBounds, savedWorkArea), maximized };
  }

  // Nothing usable to restore: open on the primary display, centred, at a size
  // that fits it. With no display information at all, fall back to the plain
  // default size at the origin.
  const primaryWorkArea = workAreas[0] ?? {
    x: 0,
    y: 0,
    width: DEFAULT_WINDOW_WIDTH,
    height: DEFAULT_WINDOW_HEIGHT,
  };
  return { ...fitToWorkArea(centeredIn(primaryWorkArea), primaryWorkArea), maximized };
}

function readWindowState(file) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!parsed || typeof parsed !== "object") return null;
    const { x, y, width, height, maximized } = parsed;
    if (![x, y, width, height].every(isFiniteNumber)) return null;
    return { x, y, width, height, maximized: Boolean(maximized) };
  } catch {
    // A missing, truncated or hand-edited file is the same thing as no state:
    // the window simply opens at its default bounds.
    return null;
  }
}

function writeWindowState(file, state) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(state, null, 2)}\n`);
  } catch {
    // Remembering the window position is never worth failing a close over.
  }
}

module.exports = {
  DEFAULT_WINDOW_HEIGHT,
  DEFAULT_WINDOW_WIDTH,
  MIN_WINDOW_HEIGHT,
  MIN_WINDOW_WIDTH,
  readWindowState,
  resolveInitialBounds,
  writeWindowState,
};
