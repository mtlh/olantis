"use client";

import { useState, useSyncExternalStore } from "react";

export type DesktopChangesState = "idle" | "checking" | "ready" | "error";

export type DesktopRelease = {
  version: string | null;
  title: string | null;
  /** ISO timestamp of the release, shown next to its notes. */
  publishedAt: string | null;
  url: string | null;
  notes: string[];
};

/** A newer shell build whose installer can be downloaded from the panel. */
export type DesktopUpdate = {
  version: string | null;
  title: string | null;
  /** "0.1.74": the stamped app version of the offered build. */
  appVersion: string | null;
  publishedAt: string | null;
  releaseUrl: string | null;
  downloadUrl: string | null;
  installerName: string | null;
};

export type DesktopChangesPayload = {
  currentVersion: string | null;
  checkedAt: string | null;
  releases: DesktopRelease[];
  update: DesktopUpdate | null;
};

/** True when a checked feed has anything worth opening the panel for. */
export function hasChangesToShow(payload: DesktopChangesPayload): boolean {
  return payload.releases.length > 0 || payload.update !== null;
}

type DesktopBridge = {
  recentChanges?: () => Promise<unknown>;
};

const IDLE: DesktopChangesPayload = {
  currentVersion: null,
  checkedAt: null,
  releases: [],
  update: null,
};

const MAX_RELEASES = 6;
const MAX_NOTES = 8;

function desktopBridge(): DesktopBridge | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as Window & { olantisDesktop?: DesktopBridge }).olantisDesktop;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readNotes(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((note): note is string => typeof note === "string" && note.length > 0))].slice(0, MAX_NOTES);
}

function readRelease(value: unknown): DesktopRelease | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Record<string, unknown>;
  return {
    version: readString(raw.version),
    title: readString(raw.title),
    publishedAt: readString(raw.publishedAt),
    url: readString(raw.url),
    notes: readNotes(raw.notes),
  };
}

function readUpdate(value: unknown): DesktopUpdate | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Record<string, unknown>;
  const downloadUrl = readString(raw.downloadUrl);
  const releaseUrl = readString(raw.releaseUrl);
  // No usable destination means no offer, even if the main process sent one.
  if (!downloadUrl && !releaseUrl) return null;
  return {
    version: readString(raw.version),
    title: readString(raw.title),
    appVersion: readString(raw.appVersion),
    publishedAt: readString(raw.publishedAt),
    releaseUrl,
    downloadUrl,
    installerName: readString(raw.installerName),
  };
}

/**
 * The bridge hands over whatever the main process fetched. Normalize it once so
 * a missing or malformed field cannot crash the panel or render junk.
 */
export function normalizeChangesPayload(value: unknown): DesktopChangesPayload {
  if (typeof value !== "object" || value === null) return IDLE;
  const raw = value as Record<string, unknown>;
  const releases = Array.isArray(raw.releases)
    ? raw.releases
        .map(readRelease)
        .filter((release): release is DesktopRelease => release !== null)
        .slice(0, MAX_RELEASES)
    : [];
  return {
    currentVersion: readString(raw.currentVersion),
    checkedAt: readString(raw.checkedAt),
    releases,
    update: readUpdate(raw.update),
  };
}

// The bridge is static for the life of the page, so the store never notifies.
// Reading it this way keeps the server render (no bridge) and the hydrated
// client render (bridge inside Electron) from disagreeing about the control.
const subscribeDesktop = () => () => {};
const getDesktopSnapshot = () => Boolean(desktopBridge());
const getDesktopServerSnapshot = () => false;

/**
 * The desktop shell's manual changelog. Nothing is downloaded or installed and
 * no timer checks on its own: the site updates independently, so the sidebar
 * only reads recent releases when someone opens its refresh control.
 */
export function useDesktopChanges() {
  const desktop = useSyncExternalStore(subscribeDesktop, getDesktopSnapshot, getDesktopServerSnapshot);
  const [state, setState] = useState<DesktopChangesState>("idle");
  const [changes, setChanges] = useState<DesktopChangesPayload>(IDLE);

  return {
    /** True only inside the packaged Electron shell. */
    desktop,
    state,
    /** A read is in flight, so the control spins. */
    busy: state === "checking",
    currentVersion: changes.currentVersion,
    checkedAt: changes.checkedAt,
    releases: changes.releases,
    /** A newer shell build with its platform installer, or null. */
    update: changes.update,
    /**
     * Ask the shell for recent published changes. Resolves with the normalized
     * payload, or null when there is no bridge (web) or the read failed.
     */
    check: async (): Promise<DesktopChangesPayload | null> => {
      const bridge = desktopBridge();
      if (!bridge?.recentChanges) return null;
      setState("checking");
      try {
        const payload = normalizeChangesPayload(await bridge.recentChanges());
        setChanges(payload);
        setState("ready");
        return payload;
      } catch {
        setState("error");
        return null;
      }
    },
  };
}
