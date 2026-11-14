"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type SegmentedOption<T extends string | number> = {
  value: T;
  label: string;
  icon?: ReactNode;
};

type SegmentedControlProps<T extends string | number> = {
  value: T;
  options: ReadonlyArray<SegmentedOption<T>>;
  onChange: (value: T) => void;
  /** Accessible name for the group. */
  ariaLabel?: string;
  size?: "sm" | "md";
  className?: string;
  buttonClassName?: string;
};

/**
 * The pill switch used for chart ranges, allocation modes, settings toggles and
 * other small mutually-exclusive choices. One implementation keeps padding,
 * selected state and `aria-pressed` consistent everywhere.
 */
export function SegmentedControl<T extends string | number>({
  value,
  options,
  onChange,
  ariaLabel,
  size = "sm",
  className,
  buttonClassName,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(
        "flex w-fit items-center gap-0.5 rounded-full border border-white/[0.06] bg-white/[0.03] p-0.5",
        className,
      )}
    >
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "flex items-center justify-center gap-1.5 rounded-full font-medium transition-colors",
            size === "sm" ? "px-2.5 py-1 text-[11px]" : "px-3 py-1.5 text-xs",
            value === option.value ? "bg-white/[0.09] text-white" : "text-zinc-500 hover:text-zinc-300",
            buttonClassName,
          )}
        >
          {option.icon}
          {option.label}
        </button>
      ))}
    </div>
  );
}
