"use client";

import { useEffect, useMemo } from "react";
import { brandIconSrc } from "@/lib/brands";

/**
 * Marks the browser has already been asked to fetch this session. Icon URLs are
 * stable for a given BRAND_ICON_VERSION, so one warm-up per session is enough.
 */
const warmed = new Set<string>();

const MAX_CONCURRENT = 4;
const queue: string[] = [];
let active = 0;

function pump() {
  while (active < MAX_CONCURRENT && queue.length) {
    const src = queue.shift();
    if (!src) return;
    if (warmed.has(src)) continue;

    warmed.add(src);
    active += 1;

    const image = new Image();
    image.decoding = "async";
    image.fetchPriority = "low";

    const done = () => {
      active -= 1;
      pump();
    };
    image.onload = done;
    image.onerror = done;
    image.src = src;
  }
}

/**
 * Warm the browser cache for marks that are not on screen yet: holdings inside
 * collapsed sidebar portfolios, other dashboard sections, and anything the user
 * can open from the current view. A low-priority queue keeps this from
 * competing with the marks the server already put in the HTML.
 */
export function warmBrandIcons(sources: Iterable<string>) {
  for (const src of sources) {
    if (src && !warmed.has(src)) queue.push(src);
  }
  pump();
}

type IconSubject = {
  provider?: string | null;
  symbol?: string | null;
  name?: string | null;
  exchange?: string | null;
  currency?: string | null;
};

type WarmupInput = {
  providers?: Array<{ id: string; name: string }>;
  portfolios?: Array<{ providerId?: string | null }>;
  holdings?: IconSubject[];
};

/**
 * Collects every mark the workspace can render and warms them once the page is
 * idle. Icons already in the HTML load eagerly on their own; this covers the
 * hidden ones, so expanding a portfolio or opening a view no longer starts the
 * remote lookup at that moment.
 */
export function useBrandIconWarmup({ providers, portfolios, holdings }: WarmupInput) {
  const sources = useMemo(() => {
    const out = new Set<string>();
    const providerNames = new Map<string, string>();

    for (const provider of providers ?? []) {
      providerNames.set(provider.id, provider.name);
      const src = brandIconSrc({ provider: provider.name });
      if (src) out.add(src);
    }
    for (const portfolio of portfolios ?? []) {
      const name = portfolio.providerId ? providerNames.get(portfolio.providerId) : null;
      if (!name) continue;
      const src = brandIconSrc({ provider: name });
      if (src) out.add(src);
    }
    for (const holding of holdings ?? []) {
      const src = brandIconSrc(holding);
      if (src) out.add(src);
    }
    return [...out];
  }, [holdings, portfolios, providers]);

  useEffect(() => {
    if (!sources.length) return;
    let cancelled = false;
    const run = () => {
      if (!cancelled) warmBrandIcons(sources);
    };

    const win = window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
      cancelIdleCallback?: (handle: number) => void;
    };

    const handle = win.requestIdleCallback?.(run, { timeout: 1500 });
    // Without an idle scheduler the fallback still stays out of the TTI quiet
    // window; the icons load on demand regardless, this only prefetches.
    const timer = handle === undefined ? window.setTimeout(run, 2000) : null;

    return () => {
      cancelled = true;
      if (handle !== undefined) win.cancelIdleCallback?.(handle);
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [sources]);
}
