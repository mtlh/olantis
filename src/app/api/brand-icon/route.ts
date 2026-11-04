import { readFile } from "node:fs/promises";
import path from "node:path";
import { unstable_cache } from "next/cache";
import {
  holdingLogoSources,
  isCashSymbol,
  issuerBrandForHolding,
  providerBrandForName,
  providerLogoSources,
  type LogoSource,
} from "@/lib/brands";
import { normalizeLogo } from "@/lib/logo-image";

export const runtime = "nodejs";

const ALLOWED_HOSTS = new Set([
  "www.google.com",
  "assets.parqet.com",
  "financialmodelingprep.com",
  "companiesmarketcap.com",
  "www.vanguard.com",
  "www.trading212.com",
  "www.ajbell.co.uk",
  "www.dodl.co.uk",
  "www.ishares.com",
  "www.invesco.com",
  "www.interactivebrokers.com",
  "www.starlingbank.com",
  "www.hsbc.com",
  "www.barclays.co.uk",
  "www.lloydsbank.com",
  "www.pensionbee.com",
  "www.aviva.co.uk",
  "www.robeco.com",
  "www.ssga.com",
  "www.statestreet.com",
  "a.storyblok.com",
  "companieslogo.com",
  "home.saxo",
  "www.sharesies.com",
]);

const MAX_CACHE_ENTRIES = 250;

/**
 * How long a resolved mark stays in the shared data cache. Marks are close to
 * static, so a cold server instance should never have to walk the remote
 * sources again — it reads the already-processed PNG instead.
 */
const RESOLVED_ICON_TTL_SECONDS = 60 * 60 * 24 * 7;

/** One remote source may not hold up the whole request for longer than this. */
const SOURCE_TIMEOUT_MS = 4000;

type CacheEntry = { promise: Promise<Buffer | null>; touched: number };
const cache = new Map<string, CacheEntry>();

function clean(value: string | null, maxLength: number): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

async function download(url: string, signal?: AbortSignal): Promise<Buffer | null> {
  if (url.startsWith("/brands/")) {
    try {
      const file = await readFile(path.join(process.cwd(), "public", url.replace(/^\//, "")));
      return file.byteLength > 80 ? file : null;
    } catch {
      return null;
    }
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (!ALLOWED_HOSTS.has(parsed.hostname)) return null;

  try {
    const response = await fetch(parsed, {
      // Our own abort (the request found a better source) plus a hard timeout.
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(SOURCE_TIMEOUT_MS)]) : AbortSignal.timeout(SOURCE_TIMEOUT_MS),
      headers: { accept: "image/*" },
      // Keep the raw source in Next's data cache as well, so even a fresh
      // process can re-normalise a mark without waiting for the logo services.
      next: { revalidate: RESOLVED_ICON_TTL_SECONDS },
    });
    if (!response.ok) return null;
    if (!(response.headers.get("content-type") ?? "").startsWith("image/")) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    return buffer.byteLength > 80 ? buffer : null;
  } catch {
    return null;
  }
}

/**
 * Fetch every candidate source at once and normalise them in preference order.
 * The old code awaited each source before trying the next one, so a slug with
 * four candidates could spend four timeouts in a row before the row painted.
 * Downloads are the slow part; sharp is cheap, so starting them together makes
 * the worst case one timeout instead of four.
 */
async function resolveLogo(sources: LogoSource[], tint?: string): Promise<Buffer | null> {
  if (!sources.length) return null;

  const controller = new AbortController();
  const downloads = sources.map((source) => download(source.src, controller.signal));
  try {
    for (let index = 0; index < sources.length; index += 1) {
      const raw = await downloads[index];
      if (!raw) continue;
      try {
        const normalized = await normalizeLogo(raw, {
          tint,
          aggressiveSpecks: Boolean(tint),
          // Below 32px a favicon turns to mush at tile size; let the monogram win.
          minSourceSize: 32,
          allowWideMark: sources[index].allowWideMark,
        });
        if (normalized) return normalized;
      } catch {
        // Try the next source; a broken logo shouldn't blank the row.
      }
    }
    return null;
  } finally {
    // Nothing after the winner is needed; release the remaining sockets.
    controller.abort();
  }
}

/**
 * Cross-request, cross-instance cache for the processed mark. The key is the
 * ordered source list (plus its tint), so editing a brand's sources or bumping
 * the renderer invalidates exactly the marks that changed. A resolved PNG is
 * stored as base64 because the data cache is serialised.
 */
const resolveCachedMark = unstable_cache(
  async (input: { sources: LogoSource[]; tint?: string }) => {
    const logo = await resolveLogo(input.sources, input.tint);
    return { data: logo ? logo.toString("base64") : null };
  },
  ["brand-icon"],
  { revalidate: RESOLVED_ICON_TTL_SECONDS },
);

/** De-duplicate concurrent requests for the same mark inside one instance. */
function cached(key: string, load: () => Promise<Buffer | null>): Promise<Buffer | null> {
  const hit = cache.get(key);
  if (hit) {
    hit.touched = Date.now();
    return hit.promise;
  }
  const entry: CacheEntry = { promise: load().catch(() => null), touched: Date.now() };
  cache.set(key, entry);
  if (cache.size > MAX_CACHE_ENTRIES) {
    let oldestKey: string | null = null;
    let oldest = Number.POSITIVE_INFINITY;
    for (const [candidate, value] of cache) {
      if (value.touched < oldest) {
        oldest = value.touched;
        oldestKey = candidate;
      }
    }
    if (oldestKey) cache.delete(oldestKey);
  }
  return entry.promise;
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const provider = clean(params.get("provider"), 80);
  const symbol = clean(params.get("symbol"), 40)?.toUpperCase() ?? null;
  const exchange = clean(params.get("exchange"), 40);
  const name = clean(params.get("name"), 120);
  const version = clean(params.get("v"), 8) ?? "0";

  if (!provider && !symbol) return new Response(null, { status: 404 });

  // Cash is the user's own balance, not a listed security: the UI draws a
  // currency glyph instead, so never look a "CASH" ticker logo up.
  if (!provider && isCashSymbol(symbol)) {
    return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  const key = provider
    ? `${version}:provider:${provider.toLowerCase()}`
    : `${version}:holding:${symbol}:${exchange?.toUpperCase() ?? ""}:${name?.toLowerCase() ?? ""}`;

  const sources = provider
    ? providerLogoSources(provider)
    : holdingLogoSources({ symbol, exchange, name });
  const brand = provider ? providerBrandForName(provider) : issuerBrandForHolding(name);

  const logo = await cached(key, async () => {
    const { data } = await resolveCachedMark({ sources, tint: brand?.markColor });
    return data ? Buffer.from(data, "base64") : null;
  });

  if (!logo) {
    return new Response(null, {
      status: 404,
      headers: { "Cache-Control": "public, max-age=600" },
    });
  }

  return new Response(new Uint8Array(logo), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=604800, stale-while-revalidate=2592000",
    },
  });
}
