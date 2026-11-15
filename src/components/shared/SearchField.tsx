"use client";

import type { ReactNode } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type SearchFieldProps = {
  value: string;
  onChange: (value: string) => void;
  /** Runs before the value is cleared, e.g. to drop suggestions. */
  onClear?: () => void;
  /** Accessible label; also used for the clear button. */
  label: string;
  placeholder?: string;
  id?: string;
  size?: "sm" | "md";
  className?: string;
  inputClassName?: string;
  autoFocus?: boolean;
  maxLength?: number;
  autoComplete?: string;
  ariaAutocomplete?: "list" | "none" | "inline" | "both";
  onFocus?: () => void;
  onBlur?: () => void;
  /** Rendered inside the relative wrapper, usually a suggestion list. */
  children?: ReactNode;
};

/** Search input with the shared magnifier and clear affordances. */
export function SearchField({
  value,
  onChange,
  onClear,
  label,
  placeholder,
  id,
  size = "md",
  className,
  inputClassName,
  autoFocus,
  maxLength,
  autoComplete,
  ariaAutocomplete,
  onFocus,
  onBlur,
  children,
}: SearchFieldProps) {
  const compact = size === "sm";
  const clear = () => {
    onClear?.();
    onChange("");
  };

  return (
    <div className={cn("relative", className)}>
      <Search
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute top-1/2 -translate-y-1/2 text-zinc-400",
          compact ? "left-2.5 h-3.5 w-3.5" : "left-3 h-4 w-4",
        )}
      />
      <Input
        id={id}
        aria-label={label}
        aria-autocomplete={ariaAutocomplete}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
        autoFocus={autoFocus}
        maxLength={maxLength}
        autoComplete={autoComplete}
        className={cn(compact ? "h-8 pl-8 pr-7 text-xs" : "pl-9 pr-9", inputClassName)}
      />
      {value && (
        <button
          type="button"
          onClick={clear}
          aria-label={`Clear ${label}`}
          className={cn(
            "absolute top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded text-zinc-400 transition-colors hover:text-white",
            compact ? "right-1" : "right-1.5",
          )}
        >
          <X className={compact ? "h-3 w-3" : "h-4 w-4"} />
        </button>
      )}
      {children}
    </div>
  );
}
