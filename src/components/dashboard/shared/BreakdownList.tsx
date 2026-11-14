import type { ReactNode } from "react";
import { fmtGBP } from "@/lib/format";
import { SignedValue } from "@/components/shared/SignedValue";
import { cn } from "@/lib/utils";

const ROW_GRID =
  "grid w-full grid-cols-[minmax(0,1fr)_5.5rem] items-center gap-3 px-1 py-3.5 text-left transition-colors hover:bg-white/[0.025] sm:grid-cols-[minmax(0,1fr)_5.5rem_6.5rem]";

/** Column labels shared by the account and provider breakdown lists. */
export function BreakdownHeader() {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_5.5rem] gap-3 border-y border-white/[0.06] px-1 py-2 text-[10px] uppercase tracking-[0.12em] text-zinc-600 sm:grid-cols-[minmax(0,1fr)_5.5rem_6.5rem]">
      <span>Name</span>
      <span className="text-right">Value</span>
      <span className="hidden whitespace-nowrap text-right sm:block">Unrealized P/L</span>
    </div>
  );
}

type BreakdownRowProps = {
  icon: ReactNode;
  title: string;
  subtitle: ReactNode;
  value: number;
  gain: number;
  onClick?: () => void;
  className?: string;
};

/** A provider/portfolio/holding line inside an account or provider drill-down. */
export function BreakdownRow({ icon, title, subtitle, value, gain, onClick, className }: BreakdownRowProps) {
  const content = (
    <>
      <span className="flex min-w-0 items-center gap-2.5">
        {icon}
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-white">{title}</span>
          <span className="mt-0.5 block truncate text-[11px] tabular-nums text-zinc-600">{subtitle}</span>
        </span>
      </span>
      <span className="text-right">
        <span className="block text-sm tabular-nums text-zinc-200">{fmtGBP(value)}</span>
        <SignedValue value={gain} className="mt-0.5 block text-[11px] sm:hidden" />
      </span>
      <SignedValue value={gain} className="hidden text-right text-xs sm:block" />
    </>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cn(ROW_GRID, className)}>
        {content}
      </button>
    );
  }

  return <div className={cn(ROW_GRID, className)}>{content}</div>;
}
