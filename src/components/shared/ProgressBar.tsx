import { cn } from "@/lib/utils";

type ProgressBarProps = {
  /** Percentage complete, clamped to 0–100. */
  value: number;
  label: string;
  color?: string;
  opacity?: number;
  className?: string;
  barClassName?: string;
};

/** Accessible single-value progress track (goals, onboarding). */
export function ProgressBar({
  value,
  label,
  color = "#34d399",
  opacity = 0.8,
  className,
  barClassName,
}: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped)}
      className={cn("h-1 w-full overflow-hidden rounded-full bg-white/[0.07]", className)}
    >
      <div
        className={cn("h-full rounded-full transition-all", barClassName)}
        style={{ width: `${clamped}%`, backgroundColor: color, opacity }}
      />
    </div>
  );
}

type DistributionBarProps = {
  segments: Array<{ key: string; value: number; color: string }>;
  label: string;
  className?: string;
};

/** Decorative multi-segment track, e.g. gaining / falling / unchanged. */
export function DistributionBar({ segments, label, className }: DistributionBarProps) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  return (
    <div role="img" aria-label={label} className={cn("flex h-1 overflow-hidden rounded-full bg-white/[0.06]", className)}>
      {total > 0 && segments.filter((segment) => segment.value > 0).map((segment) => (
        <span
          key={segment.key}
          style={{ width: `${(segment.value / total) * 100}%`, backgroundColor: segment.color }}
        />
      ))}
    </div>
  );
}
