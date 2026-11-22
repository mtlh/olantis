"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

export type DesktopUpdateState =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "ready"
  | "up-to-date"
  | "error"
  | "disabled";

/** Update state pushed by electron/main.cjs through electron/app-preload.cjs. */
export type DesktopUpdatePayload = {
  state: DesktopUpdateState;
  version: string | null;
  /** Download progress (0-100) while a build is downloading, else null. */
  percent?: number | null;
  enabled?: boolean;
  canRetry?: boolean;
  errorContext?: "check" | "download" | "install" | null;
  /** Changelog lines parsed from the GitHub release notes. */
  notes?: string[];
  releaseUrl?: string | null;
  releasedAt?: string | null;
};

type DesktopBridge = {
  updateStatus?: () => Promise<unknown>;
  checkForUpdates?: () => Promise<unknown>;
  restartToUpdate?: () => void;
  onUpdateStatus?: (callback: (payload: unknown) => void) => (() => void) | void;
};

const IDLE: DesktopUpdatePayload = {
  state: "idle",
  version: null,
  percent: null,
  enabled: false,
  canRetry: false,
  errorContext: null,
  notes: [],
  releaseUrl: null,
  releasedAt: null,
};

const MAX_NOTES = 8;

function isUpdateState(value: unknown): value is DesktopUpdateState {
  return (
    value === "idle" ||
    value === "checking" ||
    value === "available" ||
    value === "downloading" ||
    value === "ready" ||
    value === "up-to-date" ||
    value === "error" ||
    value === "disabled"
  );
}

function isErrorContext(value: unknown): value is "check" | "download" | "install" {
  return value === "check" || value === "download" || value === "install";
}

function desktopBridge(): DesktopBridge | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as Window & { olantisDesktop?: DesktopBridge }).olantisDesktop;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readPercent(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.min(100, Math.max(0, Math.round(value)));
}

/**
 * The bridge hands over whatever the preload received. Normalize it once so a
 * missing or malformed field cannot crash the control or render junk.
 */
export function normalizeUpdatePayload(value: unknown): DesktopUpdatePayload {
  if (typeof value !== "object" || value === null) return IDLE;
  const raw = value as Record<string, unknown>;
  const notes = Array.isArray(raw.notes)
    ? [...new Set(raw.notes.filter((note): note is string => typeof note === "string" && note.length > 0))].slice(0, MAX_NOTES)
    : [];
  return {
    state: isUpdateState(raw.state) ? raw.state : "idle",
    version: readString(raw.version),
    percent: readPercent(raw.percent),
    enabled: raw.enabled === true,
    canRetry: raw.canRetry === true,
    errorContext: isErrorContext(raw.errorContext) ? raw.errorContext : null,
    notes,
    releaseUrl: readString(raw.releaseUrl),
    releasedAt: readString(raw.releasedAt),
  };
}

// The bridge is static for the life of the page, so the store never notifies.
// Reading it this way keeps the server render (no bridge) and the hydrated
// client render (bridge inside Electron) from disagreeing about the control.
const subscribeDesktop = () => () => {};
const getDesktopSnapshot = () => Boolean(desktopBridge());
const getDesktopServerSnapshot = () => false;

/**
 * Follows the desktop updater. The web app has no bridge at all, so this stays
 * idle in a browser and only turns on inside the packaged Electron shell.
 */
export function useDesktopUpdate() {
  const desktop = useSyncExternalStore(subscribeDesktop, getDesktopSnapshot, getDesktopServerSnapshot);
  const [payload, setPayload] = useState<DesktopUpdatePayload>(IDLE);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    const bridge = desktopBridge();
    if (!bridge?.updateStatus) return;

    let active = true;
    // The download can finish before this effect runs, so ask once as well as
    // subscribing to later changes.
    void bridge
      .updateStatus()
      .then((next) => {
        if (active) setPayload(normalizeUpdatePayload(next));
      })
      .catch(() => {});

    const unsubscribe = bridge.onUpdateStatus?.((next) => {
      if (active) setPayload(normalizeUpdatePayload(next));
    });

    return () => {
      active = false;
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, []);

  return {
    /** True only inside the packaged Electron shell. */
    desktop,
    state: payload.state,
    /** An update is offered, downloading, ready, or failed and retryable. */
    offered:
      payload.state === "available" ||
      payload.state === "downloading" ||
      payload.state === "ready" ||
      payload.state === "error",
    ready: payload.state === "ready",
    version: payload.version,
    /** Download progress (0-100) while a build downloads; null otherwise. */
    percent: payload.percent ?? null,
    /** Changelog for the offered build, newest commit first. */
    notes: payload.notes ?? [],
    releaseUrl: payload.releaseUrl ?? null,
    releasedAt: payload.releasedAt ?? null,
    /** Which step failed, so the panel can explain the retry. */
    errorContext: payload.errorContext ?? null,
    /** A check or a download is in flight, so the control spins instead of idling. */
    busy: checking || payload.state === "checking" || payload.state === "downloading",
    /** Ask the desktop shell to check now. False when there is no updater (web). */
    check: async () => {
      const bridge = desktopBridge();
      if (!bridge?.checkForUpdates) return false;
      setChecking(true);
      try {
        setPayload(normalizeUpdatePayload(await bridge.checkForUpdates().catch(() => null)));
      } finally {
        setChecking(false);
      }
      return true;
    },
    restart: () => desktopBridge()?.restartToUpdate?.(),
  };
}
