"use client";

import { useEffect, useMemo, useState } from "react";
import type { Holding, Portfolio } from "@/lib/store";

const MANUAL_SECTORS = new Set(["cash", "property", "real estate", "manual", "other"]);
const STALE_AFTER_SECONDS = 36 * 60 * 60;

export function useStaleHoldings(holdings: Holding[], portfolios: Portfolio[]) {
  const [now, setNow] = useState(0);

  useEffect(() => {
    const timer = window.setTimeout(() => setNow(Math.floor(Date.now() / 1000)), 0);
    return () => window.clearTimeout(timer);
  }, []);

  return useMemo(() => {
    const manualPortfolioIds = new Set(portfolios.filter((portfolio) => portfolio.type === "manual").map((portfolio) => portfolio.id));
    return [...holdings]
      .filter((holding) => {
        if (holding.portfolioId && manualPortfolioIds.has(holding.portfolioId)) return false;
        if (/^cash$/i.test(holding.symbol.trim()) || MANUAL_SECTORS.has(holding.sector?.trim().toLowerCase() ?? "")) return false;
        return !holding.lastRefreshedAt || (now > 0 && now - holding.lastRefreshedAt > STALE_AFTER_SECONDS);
      })
      .sort((a, b) => (a.lastRefreshedAt ?? 0) - (b.lastRefreshedAt ?? 0));
  }, [holdings, now, portfolios]);
}
