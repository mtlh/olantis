import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  holdingLogoSources,
  isCashSymbol,
  issuerBrandForHolding,
  providerBrandForName,
  providerLogoSources,
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

type CacheEntry = { promise: Promise<Buffer | null>; touched: number };
const cache = new Map<string, CacheEntry>();

function clean(value: string | null, maxLength: number): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

async function download(url: string): Promise<Buffer | null> {
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
      signal: AbortSignal.timeout(6000),
      headers: { accept: "image/*" },
      cache: "no-store",
    });
    if (!response.ok) return null;
    if (!(response.headers.get("content-type") ?? "").startsWith("image/")) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    return buffer.byteLength > 80 ? buffer : null;
  } catch {
    return null;
  }
}

async function resolveLogo(sources: Array<{ src: string; allowWideMark?: boolean }>, tint?: string): Promise<Buffer | null> {
  for (const { src, allowWideMark } of sources) {
    const raw = await download(src);
    if (!raw) continue;
    try {
      const normalized = await normalizeLogo(raw, {
        tint,
        aggressiveSpecks: Boolean(tint),
        // Below 32px a favicon turns to mush at tile size; let the monogram win.
        minSourceSize: 32,
        allowWideMark,
      });
      if (normalized) return normalized;
    } catch {
      // Try the next source; a broken logo shouldn't blank the row.
    }
  }
  return null;
}

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

  const logo = await cached(key, () => resolveLogo(sources, brand?.markColor));
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
