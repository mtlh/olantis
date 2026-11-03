import { Logo } from "@/components/Logo";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * First paint for the workspace while the server resolves its data.
 *
 * This is the hand-off screen for the demo flow: "Try demo" seeds the tenant and
 * redirects, and the dashboard has to read it back before it can render real
 * numbers. Streaming the read behind this fallback keeps something on screen the
 * whole way instead of a blank tab.
 */
export function WorkspaceBootScreen({ isDemo }: { isDemo: boolean }) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center px-4 sm:px-6 md:px-10 py-4 border-b border-white/[0.06]">
        <Logo size={34} />
      </header>
      <div className="flex-1 grid place-items-center px-6 py-12">
        <div className="glass-card rounded-2xl w-full max-w-sm p-6 text-center" role="status" aria-live="polite">
          <div className="mx-auto w-7 h-7 rounded-full border-2 border-white/15 border-t-white animate-spin" aria-hidden />
          <p className="mt-4 text-sm font-medium text-white">
            {isDemo ? "Setting up your demo" : "Loading your workspace"}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            {isDemo ? "Three portfolios with three years of history." : "Fetching portfolios, holdings and prices."}
          </p>
          <div className="mt-5 space-y-2">
            <Skeleton className="h-2.5 w-3/4 mx-auto" />
            <Skeleton className="h-2.5 w-1/2 mx-auto" />
          </div>
        </div>
      </div>
    </div>
  );
}
