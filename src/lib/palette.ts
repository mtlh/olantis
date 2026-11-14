"use client";

import { useSyncExternalStore } from "react";
import { PALETTE, type PaletteColor } from "@/lib/colors";

/**
 * The data palette is a per-device preference: the defaults live in
 * `lib/colors`, this store overlays whatever the user saved, and every colour
 * resolver accepts the list so custom entries drive auto-tints too.
 */
const STORAGE_KEY = "olantis.data-palette";
export const MAX_PALETTE_COLORS = 24;

const HEX_PATTERN = /^#[0-9a-f]{6}$/i;

export const DEFAULT_PALETTE: readonly PaletteColor[] = PALETTE;

let cached: PaletteColor[] | null = null;
const listeners = new Set<() => void>();

/** Names a hex colour by hue so custom swatches read like the defaults. */
export function colorLabel(hex: string): string {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!match) return "Custom";

  const [r, g, b] = [match[1], match[2], match[3]].map((channel) => parseInt(channel, 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  const delta = max - min;

  if (delta < 0.06) return lightness > 0.8 ? "Mist" : lightness > 0.25 ? "Zinc" : "Slate";
  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  if (saturation < 0.18) return lightness > 0.5 ? "Stone" : "Graphite";

  let hue = 0;
  if (max === r) hue = ((g - b) / delta) % 6;
  else if (max === g) hue = (b - r) / delta + 2;
  else hue = (r - g) / delta + 4;
  hue = (hue * 60 + 360) % 360;

  if (hue < 15 || hue >= 345) return "Rose";
  if (hue < 40) return "Orange";
  if (hue < 60) return "Amber";
  if (hue < 80) return "Lime";
  if (hue < 150) return "Green";
  if (hue < 178) return "Teal";
  if (hue < 200) return "Cyan";
  if (hue < 222) return "Sky";
  if (hue < 250) return "Blue";
  if (hue < 275) return "Indigo";
  if (hue < 300) return "Violet";
  if (hue < 330) return "Pink";
  return "Rose";
}

function isPaletteColor(value: unknown): value is PaletteColor {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<PaletteColor>;
  return typeof item.id === "string"
    && item.id.length > 0
    && typeof item.label === "string"
    && typeof item.value === "string"
    && HEX_PATTERN.test(item.value);
}

function normalizePalette(raw: unknown): PaletteColor[] | null {
  if (!Array.isArray(raw)) return null;
  const seen = new Set<string>();
  const palette: PaletteColor[] = [];
  for (const entry of raw) {
    if (!isPaletteColor(entry)) continue;
    const value = entry.value.toLowerCase();
    if (seen.has(value)) continue;
    seen.add(value);
    palette.push({ id: entry.id, label: entry.label.trim() || colorLabel(value), value });
    if (palette.length >= MAX_PALETTE_COLORS) break;
  }
  return palette.length > 0 ? palette : null;
}

function readStoredPalette(): readonly PaletteColor[] {
  if (cached) return cached;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    cached = raw ? normalizePalette(JSON.parse(raw)) ?? [...DEFAULT_PALETTE] : [...DEFAULT_PALETTE];
  } catch {
    cached = [...DEFAULT_PALETTE];
  }
  return cached;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return;
    cached = null;
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function persist(next: PaletteColor[]) {
  cached = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Private mode still gets the palette for this session.
  }
  listeners.forEach((listener) => listener());
}

/** The user's data palette, hydrated from storage without an effect. */
export function usePalette(): readonly PaletteColor[] {
  return useSyncExternalStore(subscribe, readStoredPalette, () => DEFAULT_PALETTE);
}

export function isDefaultPalette(palette: readonly PaletteColor[]) {
  return palette.length === DEFAULT_PALETTE.length
    && palette.every((color, index) => color.value.toLowerCase() === DEFAULT_PALETTE[index]?.value);
}

export function addPaletteColor(value: string, label?: string): boolean {
  const hex = value.trim().toLowerCase();
  if (!HEX_PATTERN.test(hex)) return false;
  const current = readStoredPalette();
  if (current.length >= MAX_PALETTE_COLORS) return false;
  if (current.some((color) => color.value === hex)) return false;
  const id = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `custom-${hex.slice(1)}-${current.length}`;
  persist([...current, { id, label: label?.trim() || colorLabel(hex), value: hex }]);
  return true;
}

export function updatePaletteColor(id: string, value: string): boolean {
  const hex = value.trim().toLowerCase();
  if (!HEX_PATTERN.test(hex)) return false;
  const current = readStoredPalette();
  if (!current.some((color) => color.id === id)) return false;
  if (current.some((color) => color.id !== id && color.value === hex)) return false;
  persist(current.map((color) => (color.id === id ? { ...color, value: hex, label: colorLabel(hex) } : color)));
  return true;
}

export function removePaletteColor(id: string): boolean {
  const current = readStoredPalette();
  if (current.length <= 1) return false;
  const next = current.filter((color) => color.id !== id);
  if (next.length === current.length) return false;
  persist(next);
  return true;
}

export function resetPalette() {
  persist([...DEFAULT_PALETTE]);
}
