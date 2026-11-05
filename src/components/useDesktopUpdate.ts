"use client";

import { useEffect, useState } from "react";

/** Update state pushed by electron/main.cjs through electron/app-preload.cjs. */
type DesktopUpdatePayload = { state: string; version: string | null };

type DesktopBridge = {
  updateStatus?: () => Promise<DesktopUpdatePayload>;
  restartToUpdate?: () => void;
  onUpdateStatus?: (callback: (payload: DesktopUpdatePayload) => void) => (() => void) | void;
};

const IDLE: DesktopUpdatePayload = { state: "idle", version: null };

function desktopBridge(): DesktopBridge | undefined {
  return (window as Window & { olantisDesktop?: DesktopBridge }).olantisDesktop;
}

/**
 * Follows the desktop updater. The web app has no bridge at all, so this stays
 * idle in a browser and only turns on inside the packaged Electron shell.
 */
export function useDesktopUpdate() {
  const [payload, setPayload] = useState<DesktopUpdatePayload>(IDLE);

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
    ready: payload.state === "ready",
    version: payload.version,
    restart: () => desktopBridge()?.restartToUpdate?.(),
  };
}
