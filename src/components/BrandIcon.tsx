"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { brandIconSrc, monogramFor } from "@/lib/brands";

type BrandIconProps = {
  /** Provider/broker/issuer name. Takes priority over `symbol`. */
  provider?: string | null;
  symbol?: string | null;
  name?: string | null;
  exchange?: string | null;
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

function Mark({ src, monogram, size, shape, className }: MarkProps) {
  const [failed, setFailed] = useState(false);
  const radius = shape === "circle" ? "9999px" : `${Math.max(4, Math.round(size * 0.24))}px`;

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

/**
 * Renders a brand mark for a holding (company logo, or its ETF issuer's mark)
 * or a provider, with a monogram tile when no remote mark is available.
 */
export function BrandIcon({
  provider,
  symbol,
  name,
  exchange,
  size = 24,
  shape = "rounded",
  className,
}: BrandIconProps) {
  const src = useMemo(
    () => brandIconSrc({ provider, symbol, name, exchange }),
    [exchange, name, provider, symbol],
  );
  const monogram = useMemo(() => monogramFor({ provider, symbol, name }), [name, provider, symbol]);

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
