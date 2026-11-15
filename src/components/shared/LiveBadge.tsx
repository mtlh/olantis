import { cn } from "@/lib/utils";

/** Small "Live" pill for holdings whose price refreshes automatically. */
export function LiveBadge({ className }: { className?: string }) {
  return (
    <span
      title="Price updates automatically"
      className={cn(
        "shrink-0 rounded-full border border-white/[0.06] px-1.5 py-px text-[9px] font-medium uppercase tracking-[0.08em] text-zinc-400",
        className,
      )}
    >
      Live
    </span>
  );
}
