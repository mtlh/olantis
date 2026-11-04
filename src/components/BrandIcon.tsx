"use client";

import { useCallback, useMemo, useState } from "react";
import { Banknote } from "lucide-react";
import { cn } from "@/lib/utils";
import { brandIconSrc, isCashSymbol, monogramFor } from "@/lib/brands";
import { holdingCurrency } from "@/lib/format";

type BrandIconProps = {
  /** Provider/broker/issuer name. Takes priority over `symbol`. */
  provider?: string | null;
  symbol?: string | null;
  name?: string | null;
  exchange?: string | null;
  /** Quoted currency of the holding, used for the cash glyph. */
  currency?: string | null;
  /** Edge length in px. Defaults to 24. */
  size?: number;
  shape?: "rounded" | "circle";
  className?: string;
};

type MarkProps = {
  src: string | null;
  monogram: string;
  size: number;
  shape: "rounded" | "circle";
  className?: string;
};

function tileRadius(size: number, shape: "rounded" | "circle"): string {
  return shape === "circle" ? "9999px" : `${Math.max(4, Math.round(size * 0.24))}px`;
}

function Monogram({
  monogram,
  size,
  shape,
  className,
}: {
  monogram: string;
  size: number;
  shape: "rounded" | "circle";
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-grid shrink-0 place-items-center border border-white/[0.08] bg-white/[0.06] font-semibold uppercase tracking-wide text-zinc-400",
        className,
      )}
      style={{
        width: size,
        height: size,
        borderRadius: tileRadius(size, shape),
        fontSize: size <= 20 ? 8 : Math.min(12, Math.round(size * 0.34)),
      }}
    >
      {monogram}
    </span>
  );
}

/**
 * Shows the monogram while the remote mark is still arriving, then swaps in the
 * artwork once it has decoded. A pending icon used to paint as an empty square,
 * which read as "the icon didn't load" on a cold cache; the placeholder keeps
 * the row looking finished either way.
 */
function Mark({ src, monogram, size, shape, className }: MarkProps) {
  const [state, setState] = useState<"pending" | "ready" | "failed">("pending");

  // An icon restored from the browser cache can finish before React hydrates,
  // in which case onLoad never fires. Settle the state from the DOM instead.
  const attach = useCallback((node: HTMLImageElement | null) => {
    if (!node?.complete) return;
    setState(node.naturalWidth > 0 ? "ready" : "failed");
  }, []);

  if (!src || state === "failed") {
    return <Monogram monogram={monogram} size={size} shape={shape} className={className} />;
  }

  return (
    <span
      className="relative inline-grid shrink-0 place-items-center"
      style={{ width: size, height: size }}
    >
      {state !== "ready" && <Monogram monogram={monogram} size={size} shape={shape} className={className} />}
      {/* The mark sits straight on the surface: the icon route already stripped
          the source's white/coloured square and trimmed to the artwork. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={attach}
        src={src}
        alt=""
        aria-hidden="true"
        width={size}
        height={size}
        // Icons are tile-sized and cheap; lazy loading only delayed the artwork
        // that the server-rendered HTML already points at.
        loading="eager"
        decoding="async"
        draggable={false}
        referrerPolicy="no-referrer"
        onLoad={() => setState("ready")}
        onError={() => setState("failed")}
        className={cn(
          "shrink-0 object-contain align-middle transition-opacity duration-150",
          state === "ready" ? "opacity-100" : "absolute inset-0 opacity-0",
          className,
        )}
        style={{ width: size, height: size }}
      />
    </span>
  );
}

const CURRENCY_GLYPHS: Record<string, string> = {
  GBP: "£",
  USD: "$",
  EUR: "€",
  JPY: "¥",
  CNY: "¥",
  CNH: "¥",
  INR: "₹",
  KRW: "₩",
  TRY: "₺",
  RUB: "₽",
  ILS: "₪",
  NGN: "₦",
  ZAR: "R",
  BRL: "R$",
  CHF: "Fr",
  SEK: "kr",
  NOK: "kr",
  DKK: "kr",
  AUD: "A$",
  CAD: "C$",
  HKD: "HK$",
  SGD: "S$",
  NZD: "NZ$",
  MXN: "MX$",
};

/** "£" for GBP, "$" for USD, the ISO code for anything we don't have a glyph for. */
function currencyGlyph(currency?: string | null): string | null {
  const code = currency?.trim().toUpperCase();
  if (!code) return null;
  return CURRENCY_GLYPHS[code] ?? (code.length <= 3 ? code : null);
}

/**
 * Cash is not a listed security: show the currency it is held in (the quote
 * currency, e.g. £ for GBP) instead of whatever company owns the CASH ticker.
 * Like the brand marks, it sits straight on the surface at full size.
 */
function CashMark({
  currency,
  size,
  className,
}: {
  currency?: string | null;
  size: number;
  className?: string;
}) {
  const glyph = currencyGlyph(currency);
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-grid shrink-0 place-items-center font-semibold text-zinc-300",
        className,
      )}
      style={{
        width: size,
        height: size,
        fontSize: glyph ? (glyph.length > 1 ? Math.round(size * 0.5) : Math.round(size * 0.9)) : size,
        lineHeight: 1,
      }}
    >
      {glyph ?? <Banknote style={{ width: size, height: size }} strokeWidth={1.5} />}
    </span>
  );
}

/**
 * Renders a brand mark for a holding (company logo, or its ETF issuer's mark)
 * or a provider, with a monogram tile when no remote mark is available. A cash
 * holding renders the glyph for the currency it is held in.
 */
export function BrandIcon({
  provider,
  symbol,
  name,
  exchange,
  currency,
  size = 24,
  shape = "rounded",
  className,
}: BrandIconProps) {
  const src = useMemo(
    () => brandIconSrc({ provider, symbol, name, exchange }),
    [exchange, name, provider, symbol],
  );
  const monogram = useMemo(() => monogramFor({ provider, symbol, name }), [name, provider, symbol]);

  if (!provider && isCashSymbol(symbol)) {
    return <CashMark currency={holdingCurrency({ symbol, currency })} size={size} className={className} />;
  }

  return (
    <Mark
      key={src ?? monogram}
      src={src}
      monogram={monogram}
      size={size}
      shape={shape}
      className={className}
    />
  );
}
