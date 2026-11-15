import { fmtGBP, fmtPct } from "@/lib/format";
import { cn } from "@/lib/utils";

/** The one place that decides green/red/neutral for a delta. */
export function signedTone(
  value: number | null | undefined,
  zero: "neutral" | "positive" | "negative" = "neutral",
): string {
  if (value == null || !Number.isFinite(value)) return "text-zinc-400";
  if (value > 0) return "text-emerald-400";
  if (value < 0) return "text-red-400";
  if (zero === "positive") return "text-emerald-400";
  if (zero === "negative") return "text-red-400";
  return "text-zinc-400";
}

type SignedValueProps = {
  value: number;
  /** `gbp` renders "+£1,240"; `pct` renders "+4.20%". */
  format?: "gbp" | "pct";
  /** How a value of exactly zero is toned. */
  zero?: "neutral" | "positive" | "negative";
  className?: string;
};

/**
 * Signed currency or percentage with the dashboard's tone rules. Replaces the
 * local `SignedGain`, `GainValue` and `SignedAmount` helpers that had drifted.
 */
export function SignedValue({ value, format = "gbp", zero = "neutral", className }: SignedValueProps) {
  const text = format === "pct"
    ? fmtPct(value)
    : `${value >= 0 ? "+" : "−"}${fmtGBP(Math.abs(value))}`;

  return <span className={cn("tabular-nums", signedTone(value, zero), className)}>{text}</span>;
}
