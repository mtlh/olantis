import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type EmptyStateProps = {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  /** `both` draws the hairline above and below; `top` only above. */
  bordered?: boolean | "top";
  size?: "sm" | "md";
  align?: "center" | "start";
  className?: string;
};

/**
 * The shared "nothing here yet" block used by tables, lists and drill-downs.
 */
export function EmptyState({
  title,
  description,
  action,
  icon,
  bordered = false,
  size = "md",
  align = "center",
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "px-4",
        align === "center" ? "text-center" : "text-left",
        bordered === "top" && "border-t border-white/[0.06]",
        bordered === true && "border-y border-white/[0.06]",
        size === "sm" ? "py-6" : "py-12",
        className,
      )}
    >
      {icon}
      <p className="text-sm text-zinc-400">{title}</p>
      {description != null && <p className="mt-1 text-[11px] text-zinc-600">{description}</p>}
      {action != null && (
        <div className={cn("mt-4 flex flex-wrap items-center gap-2", align === "center" && "justify-center")}>
          {action}
        </div>
      )}
    </div>
  );
}
