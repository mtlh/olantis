"use client";

import { useMemo, useState } from "react";
import { Banknote } from "lucide-react";
import { cn } from "@/lib/utils";
import { brandIconSrc, isCashSymbol, monogramFor } from "@/lib/brands";

type BrandIconProps = {
  /** Provider/broker/issuer name. Takes priority over `symbol`. */
  provider?: string | null;
  symbol?: string | null;
  name?: string | null;
  exchange?: string | null;
  /** Quoted currency of the holding, used for the cash tile glyph. */
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

function Mark({ src, monogram, size, shape, className }: MarkProps) {
  const [failed, setFailed] = useState(false);
  const radius = tileRadius(size, shape);

  if (src && !failed) {
    return (
      // The mark sits straight on the surface: the icon route already stripped
      // the source's white/coloured square and trimmed to the artwork.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        aria-hidden="true"
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        draggable={false}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className={cn("shrink-0 object-contain align-middle", className)}
        style={{ width: size, height: size }}
      />
    );
  }

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
        borderRadius: radius,
        fontSize: size <= 20 ? 8 : Math.min(12, Math.round(size * 0.34)),
      }}
    >
      {monogram}
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
 */
function CashMark({
  currency,
  size,
  shape,
  className,
}: {
  currency?: string | null;
  size: number;
  shape: "rounded" | "circle";
  className?: string;
}) {
  const glyph = currencyGlyph(currency);
  const iconSize = Math.round(size * 0.52);
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-grid shrink-0 place-items-center border border-white/[0.08] bg-white/[0.06] font-semibold text-zinc-300",
        className,
      )}
      style={{
        width: size,
        height: size,
        borderRadius: tileRadius(size, shape),
        fontSize: glyph && glyph.length > 1 ? Math.max(9, Math.round(size * 0.34)) : Math.round(size * 0.52),
        lineHeight: 1,
      }}
    >
      {glyph ?? <Banknote style={{ width: iconSize, height: iconSize }} strokeWidth={1.75} />}
    </span>
  );
}

/**
 * Renders a brand mark for a holding (company logo, or its ETF issuer's mark)
 * or a provider, with a monogram tile when no remote mark is available. A cash
 * holding renders a currency tile for the currency it is held in.
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
    return <CashMark currency={currency} size={size} shape={shape} className={className} />;
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
