"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

// The dashboard is rendered by the (workspace) layout, so the page below it
// never re-renders. Selection therefore lives in client state and the URL is
// only a shareable mirror: writing it with the History API keeps deep links,
// the browser's arrows and the desktop window's arrows intact without ever
// waiting on an RSC response.
export type DashboardSelection = {
  portfolioId: string | null;
  providerId: string | null;
  accountId: string | null;
  holdingId: string | null;
};

export const EMPTY_SELECTION: DashboardSelection = {
  portfolioId: null,
  providerId: null,
  accountId: null,
  holdingId: null,
};

type SearchParamsLike = { get: (key: string) => string | null };

export function selectionFromSearchParams(params: SearchParamsLike): DashboardSelection {
  const selection: DashboardSelection = {
    portfolioId: params.get("portfolio"),
    providerId: params.get("provider"),
    accountId: params.get("account"),
    holdingId: params.get("holding"),
  };
  return selection;
}

export function selectionUrl({ portfolioId, providerId, accountId, holdingId }: DashboardSelection): string {
  const params = new URLSearchParams();
  if (portfolioId) params.set("portfolio", portfolioId);
  if (providerId) params.set("provider", providerId);
  if (accountId) params.set("account", accountId);
  if (holdingId) params.set("holding", holdingId);
  const query = params.toString();
  return query ? `/dashboard?${query}` : "/dashboard";
}

export function useDashboardSelection() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [selection, setSelection] = useState<DashboardSelection>(() => selectionFromSearchParams(searchParams));

  const apply = useCallback((next: DashboardSelection, mode: "push" | "replace") => {
    setSelection(next);
    const url = selectionUrl(next);
    // Selection normally only mirrors the URL. From another workspace section
    // (settings, watchlist, …) it has to open the dashboard as well, otherwise
    // the URL changes while the old section stays on screen until the user
    // navigates manually.
    if (window.location.pathname !== "/dashboard") {
      router.push(url);
      return;
    }
    // Next.js patches pushState/replaceState and feeds usePathname/useSearchParams
    // from the new URL, so the section and every shareable link follow along
    // without a server round trip.
    if (window.location.pathname + window.location.search === url) return;
    // Each drill-down (portfolio → provider → account → holding) is its own
    // history entry, so the browser and desktop window arrows walk back through
    // the views the user actually opened. Replacing the URL instead left the
    // title-bar arrows permanently dead: nothing was ever pushed to go back to.
    if (mode === "push") window.history.pushState(window.history.state, "", url);
    else window.history.replaceState(window.history.state, "", url);
  }, [router]);

  const select = useCallback((next: DashboardSelection) => apply(next, "push"), [apply]);

  const clear = useCallback(() => select(EMPTY_SELECTION), [select]);

  // Deleting the item the URL points at is not a navigation the user made, so
  // it rewrites the current entry instead of leaving a dead one behind.
  const reset = useCallback(() => apply(EMPTY_SELECTION, "replace"), [apply]);

  useEffect(() => {
    const syncFromLocation = () => {
      setSelection(selectionFromSearchParams(new URLSearchParams(window.location.search)));
    };
    window.addEventListener("popstate", syncFromLocation);
    return () => window.removeEventListener("popstate", syncFromLocation);
  }, []);

  return { selection, select, clear, reset };
}
