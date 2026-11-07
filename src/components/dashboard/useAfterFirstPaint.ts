"use client";

import { useSyncExternalStore } from "react";

function subscribeToFirstPaint(_listener: () => void): () => void {
  return () => {};
}

function readClientSnapshot(): boolean {
  return true;
}

function readServerSnapshot(): boolean {
  return false;
}

/**
 * False during SSR and the first client paint, true from the commit after
 * hydration. The dashboard gates below-fold derivations and sections on this
 * (via `useDeferredValue`) so the metric strip, chart and holdings paint
 * first, with no effect involved.
 */
export function useAfterFirstPaint(): boolean {
  return useSyncExternalStore(subscribeToFirstPaint, readClientSnapshot, readServerSnapshot);
}
