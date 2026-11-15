import type { ComponentProps, ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** Shared type rhythm for the label above a metric value. */
export const METRIC_LABEL = "text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-400";
/** Shared type rhythm for the supporting line under a metric value. */
export const METRIC_SUB = "mt-2 text-[11px] text-zinc-400";

export type MetricStripVariant =
  | "overview"
  | "portfolio"
  | "holding"
  | "performance"
  | "watchlist"
  | "settings"
  | "goals"
  | "goals-empty";

const STRIP_BASE = "grid grid-cols-2 gap-x-6 gap-y-8 border-y border-white/[0.06] py-6 sm:gap-x-10 lg:gap-0 lg:py-7";

const STRIP_VARIANTS: Record<MetricStripVariant, string> = {
  overview: "lg:grid-cols-[1.3fr_1fr_1fr_0.75fr]",
  portfolio: "lg:grid-cols-[1.4fr_1fr_1fr]",
  holding: "gap-y-7 lg:grid-cols-[1.4fr_1fr_1fr_1fr_1fr]",
  performance: "gap-y-7 sm:grid-cols-3 lg:grid-cols-[1.35fr_1fr_1fr_1fr]",
  watchlist: "lg:grid-cols-[1.6fr_1fr_1fr]",
  settings: "gap-y-6 sm:grid-cols-4 sm:gap-x-0",
  goals: "sm:grid-cols-3 lg:grid-cols-[1.3fr_1fr_1fr_1fr]",
  "goals-empty": "sm:grid-cols-2 lg:grid-cols-[1.3fr_1fr_1fr]",
};

export type MetricPosition =
  | "none"
  | "first"
  | "middle"
  | "last"
  | "tight-first"
  | "tight-middle"
  | "tight-last";

/** The divider treatment that turns sibling metrics into one band. */
const POSITION_CLASSES: Record<MetricPosition, string> = {
  none: "",
  first: "lg:pr-8",
  middle: "lg:border-l lg:border-white/[0.06] lg:px-8",
  last: "lg:border-l lg:border-white/[0.06] lg:pl-8",
  "tight-first": "lg:pr-6",
  "tight-middle": "lg:border-l lg:border-white/[0.06] lg:px-6",
  "tight-last": "lg:border-l lg:border-white/[0.06] lg:pl-6",
};

/** The three value sizes used across dashboards. */
const VALUE_CLASSES = {
  hero: "mt-2 text-[38px] font-semibold leading-none tracking-tight tabular-nums sm:text-[42px]",
  default: "mt-2 text-xl font-semibold tracking-tight tabular-nums sm:text-2xl",
  compact: "mt-2 text-2xl font-semibold leading-none tracking-tight tabular-nums",
} as const;

type MetricStripProps = ComponentProps<"div"> & { variant?: MetricStripVariant };

/**
 * The hairline metric band every dashboard level leads with. Children should be
 * `Metric` (or `MetricSkeleton` while loading) so the label/value/sub rhythm and
 * the vertical dividers stay identical across pages.
 */
export function MetricStrip({ variant = "overview", className, children, ...props }: MetricStripProps) {
  return (
    <div className={cn(STRIP_BASE, STRIP_VARIANTS[variant], className)} {...props}>
      {children}
    </div>
  );
}

type MetricProps = {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  /** Text colour for the value, usually `signedTone(...)`. */
  tone?: string;
  size?: keyof typeof VALUE_CLASSES;
  position?: MetricPosition;
  /** Hero metrics span both mobile columns. */
  wide?: boolean;
  className?: string;
  labelClassName?: string;
  valueClassName?: string;
  subClassName?: string;
  title?: string;
};

export function Metric({
  label,
  value,
  sub,
  tone = "text-white",
  size = "default",
  position = "none",
  wide = false,
  className,
  labelClassName,
  valueClassName,
  subClassName,
  title,
}: MetricProps) {
  return (
    <div className={cn("min-w-0", wide && "col-span-2 lg:col-span-1", POSITION_CLASSES[position], className)}>
      <div className={cn(METRIC_LABEL, labelClassName)} title={typeof label === "string" ? title : undefined}>{label}</div>
      <div className={cn(VALUE_CLASSES[size], tone, valueClassName)}>{value}</div>
      {sub != null && (
        <div className={cn(METRIC_SUB, subClassName)} title={typeof sub === "string" ? sub : undefined}>{sub}</div>
      )}
    </div>
  );
}

export function MetricSkeleton({
  emphasis = false,
  position = "none",
  wide = false,
  className,
}: {
  emphasis?: boolean;
  position?: MetricPosition;
  wide?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", wide && "col-span-2 lg:col-span-1", POSITION_CLASSES[position], className)}>
      <Skeleton className="h-2.5 w-20 bg-white/[0.05]" />
      <Skeleton className={emphasis ? "mt-2 h-[38px] w-28 bg-white/[0.09] sm:h-[42px]" : "mt-2 h-7 w-20 bg-white/[0.05] sm:h-8"} />
      <Skeleton className="mt-2 h-2.5 w-16 bg-white/[0.04]" />
    </div>
  );
}

/** Placeholder that keeps a metric band's exact frame while its chunk loads. */
export function MetricStripSkeleton({
  variant = "overview",
  cells = 3,
  hideLastOnMobile = true,
  className,
}: {
  variant?: MetricStripVariant;
  cells?: number;
  hideLastOnMobile?: boolean;
  className?: string;
}) {
  return (
    <MetricStrip variant={variant} className={className} aria-busy="true">
      <MetricSkeleton emphasis wide position="first" />
      {Array.from({ length: cells }, (_, index) => (
        <MetricSkeleton
          key={index}
          position={index === cells - 1 ? "last" : "middle"}
          className={hideLastOnMobile && index === cells - 1 ? "hidden lg:block" : undefined}
        />
      ))}
    </MetricStrip>
  );
}
