import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type SectionHeadingProps = {
  title: ReactNode;
  /** Right-aligned count or qualifier, e.g. "12 tracked". */
  meta?: ReactNode;
  /** Right-aligned control, e.g. an "Add" button or refresh link. */
  action?: ReactNode;
  id?: string;
  /** Draw the hairline that introduces a list or table. */
  divider?: boolean;
  spacing?: "none" | "tight" | "normal";
  className?: string;
  titleClassName?: string;
};

/**
 * The heading row used above every list, table and panel: title, optional
 * count/metadata and an optional action, with consistent hairline spacing.
 */
export function SectionHeading({
  title,
  meta,
  action,
  id,
  divider = false,
  spacing = "normal",
  className,
  titleClassName,
}: SectionHeadingProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-baseline justify-between gap-3",
        divider && "border-b border-white/[0.06]",
        spacing === "tight" && "pb-2",
        spacing === "normal" && "pb-3",
        className,
      )}
    >
      <div className="flex min-w-0 items-baseline gap-2">
        <h2 id={id} className={cn("text-sm font-medium text-white", titleClassName)}>{title}</h2>
        {meta != null && <span className="text-[11px] tabular-nums text-zinc-400">{meta}</span>}
      </div>
      {action}
    </div>
  );
}
