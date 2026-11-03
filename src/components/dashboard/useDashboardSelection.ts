"use client";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

// The dashboard is rendered by the (workspace) layout, so the page below it
// never re-renders. Selection therefore lives in client state and the URL is
// only a shareable mirror: rewriting it with the History API keeps deep links
// and back/forward intact without ever waiting on an RSC response.
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
  const [selection, setSelection] = useState<DashboardSelection>(() => selectionFromSearchParams(searchParams));

  const select = useCallback((next: DashboardSelection) => {
    setSelection(next);
    // Next.js patches history.replaceState and feeds usePathname/useSearchParams
    // from the new URL, so the section and every shareable link follow along
    // without a server round trip.
    window.history.replaceState(window.history.state, "", selectionUrl(next));
  }, []);

  const clear = useCallback(() => select(EMPTY_SELECTION), [select]);

  useEffect(() => {
    const syncFromLocation = () => {
      setSelection(selectionFromSearchParams(new URLSearchParams(window.location.search)));
    };
    window.addEventListener("popstate", syncFromLocation);
    return () => window.removeEventListener("popstate", syncFromLocation);
  }, []);

  return { selection, select, clear };
}
