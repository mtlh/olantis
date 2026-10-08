import { Button } from "@/components/ui/button";

export type ChartRange = "1M" | "3M" | "1Y" | "MAX";

const CHART_RANGES: ChartRange[] = ["1M", "3M", "1Y", "MAX"];

type ChartRangeSelectorProps = {
  range: ChartRange;
  onRangeChange: (range: ChartRange) => void;
  maxLabel?: string;
  className?: string;
  buttonClassName?: string;
};

export function ChartRangeSelector({
  range,
  onRangeChange,
  maxLabel = "MAX",
  // `contents` keeps the buttons as direct flex children of whatever wraps this,
  // so callers that relied on `flex-wrap` between individual buttons still work.
  className = "contents",
  buttonClassName,
}: ChartRangeSelectorProps) {
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
