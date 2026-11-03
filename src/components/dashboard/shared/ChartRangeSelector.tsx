import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ChartRange = "1M" | "3M" | "1Y" | "MAX";

const CHART_RANGES: ChartRange[] = ["1M", "3M", "1Y", "MAX"];

type ChartRangeSelectorProps = {
  range: ChartRange;
  onRangeChange: (range: ChartRange) => void;
  maxLabel?: string;
  className?: string;
  buttonClassName?: string;
  /** Render as a compact pill switch instead of loose buttons. */
  segmented?: boolean;
};

export function ChartRangeSelector({
  range,
  onRangeChange,
  maxLabel = "MAX",
  // `contents` keeps the buttons as direct flex children of whatever wraps this,
  // so callers that relied on `flex-wrap` between individual buttons still work.
  className = "contents",
  buttonClassName,
  segmented = false,
}: ChartRangeSelectorProps) {
  if (segmented) {
    return (
      <div className={cn("flex items-center gap-0.5 rounded-full border border-white/[0.06] bg-white/[0.03] p-0.5", className === "contents" ? undefined : className)}>
        {CHART_RANGES.map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={range === item}
            onClick={() => onRangeChange(item)}
            className={cn(
              "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
              range === item ? "bg-white/[0.09] text-white" : "text-zinc-500 hover:text-zinc-300",
              buttonClassName,
            )}
          >
            {item === "MAX" ? maxLabel : item}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className={className}>
      {CHART_RANGES.map((item) => (
        <Button
          key={item}
          type="button"
          variant={range === item ? "secondary" : "ghost"}
          size="xs"
          className={buttonClassName}
          onClick={() => onRangeChange(item)}
        >
          {item === "MAX" ? maxLabel : item}
        </Button>
      ))}
    </div>
  );
}
