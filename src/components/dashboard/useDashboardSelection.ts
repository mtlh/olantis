"use client";
import { useCallback, useMemo, useSyncExternalStore } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

// The dashboard is rendered by the (workspace) layout, so the page below it
// never re-renders. The URL is the single source of truth for what is open:
// writing it with the History API keeps deep links, the browser's arrows and
// the desktop window's arrows intact without ever waiting on an RSC response.
//
// Deriving the selection from the URL is what clears it when the user leaves:
// /watchlist and /settings carry no selection params, so no portfolio, provider
// or holding stays highlighted after switching sections.
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

function selectionFromLocation(location: string): DashboardSelection {
  const [pathname, query = ""] = location.split("?");
  if (pathname !== "/dashboard") return EMPTY_SELECTION;
  const params = new URLSearchParams(query);
  return {
    portfolioId: params.get("portfolio"),
    providerId: params.get("provider"),
    accountId: params.get("account"),
    holdingId: params.get("holding"),
  };
}

function selectionUrl({ portfolioId, providerId, accountId, holdingId }: DashboardSelection): string {
  const params = new URLSearchParams();
  if (portfolioId) params.set("portfolio", portfolioId);
  if (providerId) params.set("provider", providerId);
  if (accountId) params.set("account", accountId);
  if (holdingId) params.set("holding", holdingId);
  const query = params.toString();
  return query ? `/dashboard?${query}` : "/dashboard";
}

// Clicks inside the dashboard write the URL themselves instead of going
// through the router, so they stay instant. The App Router does not always
// re-render for those raw history writes — clicking a second portfolio updated
// the address bar while the first portfolio stayed on screen — so the last URL
// this hook wrote is kept and read back through a tiny external store.
let writtenLocation: string | null = null;
const writeListeners = new Set<() => void>();

function readBrowserLocation() {
  return `${window.location.pathname}${window.location.search}`;
}

function readWrittenLocation() {
  // A navigation from anywhere else (arrows, a link, the section nav) wins over
  // the URL we wrote last, otherwise the old view would come back with it.
  if (writtenLocation === null || readBrowserLocation() !== writtenLocation) return null;
  return writtenLocation;
}

function subscribeToWrites(listener: () => void) {
  writeListeners.add(listener);
  window.addEventListener("popstate", listener);
  return () => {
    writeListeners.delete(listener);
    window.removeEventListener("popstate", listener);
  };
}

function writeLocation(url: string, mode: "push" | "replace") {
  if (mode === "push") window.history.pushState(window.history.state, "", url);
  else window.history.replaceState(window.history.state, "", url);
  writtenLocation = url;
  writeListeners.forEach((listener) => listener());
}

export function useDashboardSelection() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  // Everything the router itself rendered with: updates in the same pass as the
  // section, so a click from /goals opens the portfolio it names, not the
  // overview. Null only before the first history write.
  const routerLocation = searchParams.size > 0 ? `${pathname}?${searchParams}` : pathname;
  const written = useSyncExternalStore(subscribeToWrites, readWrittenLocation, () => null);
  // A raw write only means anything while the router still says the dashboard is
  // the section on screen; leaving it has to clear the highlight even if the
  // browser URL has not been committed yet.
  const location = written !== null && pathname === "/dashboard" ? written : routerLocation;
  const selection = useMemo(() => selectionFromLocation(location), [location]);

  const apply = useCallback((next: DashboardSelection, mode: "push" | "replace") => {
    const url = selectionUrl(next);
    // Selection normally only mirrors the URL. From another workspace section
    // (settings, watchlist, …) it has to open the dashboard as well, otherwise
    // the old section stays on screen until the user navigates manually.
    if (window.location.pathname !== "/dashboard") {
      router.push(url);
      return;
    }
    if (readBrowserLocation() === url) return;
    // Each drill-down (portfolio → provider → account → holding) is its own
    // history entry, so the browser and desktop window arrows walk back through
    // the views the user actually opened.
    writeLocation(url, mode);
  }, [router]);

  const select = useCallback((next: DashboardSelection) => apply(next, "push"), [apply]);

  const clear = useCallback(() => select(EMPTY_SELECTION), [select]);

  // Deleting the item the URL points at is not a navigation the user made, so
  // it rewrites the current entry instead of leaving a dead one behind.
  const reset = useCallback(() => apply(EMPTY_SELECTION, "replace"), [apply]);

  return { selection, select, clear, reset };
}
