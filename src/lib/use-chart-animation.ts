"use client";

import { useSyncExternalStore } from "react";

// Recharts animates every path point of a series, so on a long range the
// animation costs far more than it shows. Short ranges still animate.
const ANIMATION_ROW_LIMIT = 60;
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

// matchMedia is the external store here: subscribing and reading the snapshot
// keeps the value correct without an effect writing state on mount.
function subscribeReducedMotion(onChange: () => void) {
  if (typeof window === "undefined") return () => {};
  const query = window.matchMedia(REDUCED_MOTION_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function readReducedMotion() {
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

/**
 * Whether a chart series of `rowCount` points should animate. Long series stay
 * static, and so does everything for users who asked for reduced motion.
 */
export function useChartAnimation(rowCount: number) {
  const reducedMotion = useSyncExternalStore(subscribeReducedMotion, readReducedMotion, () => false);
  return rowCount <= ANIMATION_ROW_LIMIT && !reducedMotion;
}
