"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

/** Update state pushed by electron/main.cjs through electron/app-preload.cjs. */
type DesktopUpdatePayload = { state: string; version: string | null };

type DesktopBridge = {
  updateStatus?: () => Promise<DesktopUpdatePayload>;
  checkForUpdates?: () => Promise<DesktopUpdatePayload>;
  restartToUpdate?: () => void;
  onUpdateStatus?: (callback: (payload: DesktopUpdatePayload) => void) => (() => void) | void;
};

const IDLE: DesktopUpdatePayload = { state: "idle", version: null };

function desktopBridge(): DesktopBridge | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as Window & { olantisDesktop?: DesktopBridge }).olantisDesktop;
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
        if (active && next) setPayload(next);
      })
      .catch(() => {});

    const unsubscribe = bridge.onUpdateStatus?.((next) => {
      if (active && next) setPayload(next);
    });

    return () => {
      active = false;
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, []);

  return {
    /** True only inside the packaged Electron shell. */
    desktop,
    ready: payload.state === "ready",
    version: payload.version,
    /** A check or a download is in flight, so the control spins instead of idling. */
    busy: checking || payload.state === "checking" || payload.state === "downloading",
    /** Ask the desktop shell to check now. False when there is no updater (web). */
    check: async () => {
      const bridge = desktopBridge();
      if (!bridge?.checkForUpdates) return false;
      setChecking(true);
      try {
        const next = await bridge.checkForUpdates().catch(() => null);
        if (next) setPayload(next);
      } finally {
        setChecking(false);
      }
      return true;
    },
    restart: () => desktopBridge()?.restartToUpdate?.(),
  };
}
