"use client";

import { useEffect, useState } from "react";

// Recharts animates every path point of a series, so on a long range the
// animation costs far more than it shows. Short ranges still animate.
const ANIMATION_ROW_LIMIT = 60;

/**
 * Whether a chart series of `rowCount` points should animate. Long series stay
 * static, and so does everything for users who asked for reduced motion.
 */
export function useChartAnimation(rowCount: number) {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  return rowCount <= ANIMATION_ROW_LIMIT && !reducedMotion;
}
