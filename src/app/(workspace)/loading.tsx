import { Skeleton } from "@/components/ui/skeleton";

// Lightweight chrome for the workspace group. Having a loading file also lets
// Next prefetch these dynamic routes, so a cold navigation paints this shell
// immediately instead of waiting on the server. Every block below copies the
// frame the real dashboard paints (sidebar, metric strip, chart row, account
// breakdown and insights) so the content does not jump when data arrives.
export default function WorkspaceLoading() {
  return (
    <div className="flex min-h-screen" aria-busy="true" aria-live="polite">
      <aside className="sticky top-0 hidden h-screen w-[360px] shrink-0 flex-col border-r border-white/[0.07] bg-black xl:flex">
        <nav className="flex-1 overflow-y-auto p-3 xl:pt-5">
          <div className="flex items-center gap-1.5">
            <Skeleton className="h-7 w-7 shrink-0 rounded-lg bg-white/[0.04]" />
            <Skeleton className="h-9 min-w-0 flex-1 rounded-lg bg-white/[0.04]" />
          </div>

          <div className="mt-3">
            <div className="mb-2 flex items-center justify-between px-1">
              <Skeleton className="h-2.5 w-20 bg-white/[0.05]" />
              <Skeleton className="h-7 w-14 rounded-lg bg-white/[0.04]" />
            </div>
            <div className="space-y-3">
              {[1, 2, 3].map((index) => (
                <Skeleton key={index} className="h-[92px] w-full rounded-2xl bg-white/[0.035]" />
              ))}
            </div>
          </div>
        </nav>

        <div className="border-t border-white/[0.06] p-2">
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((index) => (
              <Skeleton key={index} className="h-7 w-7 rounded-lg bg-white/[0.04]" />
            ))}
            <div className="ml-auto flex items-center gap-1">
              {[1, 2, 3].map((index) => (
                <Skeleton key={index} className="h-7 w-7 rounded-lg bg-white/[0.04]" />
              ))}
            </div>
          </div>
        </div>
      </aside>

      <main id="main-content" className="min-w-0 flex-1 pt-12 xl:pt-0">
        <div className="mx-auto w-full max-w-[1600px] space-y-6 px-4 py-6 md:px-8 md:py-8 lg:px-10">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <Skeleton className="h-7 w-40 bg-white/[0.09]" />
              <Skeleton className="mt-2 h-4 w-64 bg-white/[0.05]" />
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-7 w-32 rounded-full bg-white/[0.05]" />
              <Skeleton className="h-7 w-[7.5rem] rounded-full bg-white/[0.08]" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-6 gap-y-8 border-y border-white/[0.06] py-6 sm:gap-x-10 lg:grid-cols-[1.3fr_1fr_1fr_0.75fr] lg:gap-0 lg:py-7">
            <div className="col-span-2 lg:col-span-1 lg:pr-8">
              <Skeleton className="h-2.5 w-20 bg-white/[0.05]" />
              <Skeleton className="mt-2 h-[38px] w-28 bg-white/[0.09] sm:h-[42px]" />
              <Skeleton className="mt-2 h-2.5 w-24 bg-white/[0.04]" />
            </div>
            {[1, 2, 3].map((index) => (
              <div key={index} className={index === 3 ? "hidden lg:block lg:border-l lg:border-white/[0.06] lg:pl-8" : "lg:border-l lg:border-white/[0.06] lg:px-8"}>
                <Skeleton className="h-2.5 w-20 bg-white/[0.05]" />
                <Skeleton className="mt-2 h-7 w-20 bg-white/[0.09] sm:h-8" />
                <Skeleton className="mt-2 h-2.5 w-16 bg-white/[0.04]" />
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Skeleton className="h-[440px] rounded-[1.25rem] bg-white/[0.03] lg:col-span-2" />
            <Skeleton className="h-[440px] rounded-[1.25rem] bg-white/[0.03]" />
          </div>

          <div className="grid grid-cols-1 gap-8 xl:grid-cols-3 xl:gap-0">
            <div className="min-w-0 xl:col-span-2 xl:pr-8">
              <div className="flex items-baseline justify-between gap-3 pb-3">
                <Skeleton className="h-5 w-40 bg-white/[0.05]" />
                <Skeleton className="h-3 w-16 bg-white/[0.04]" />
              </div>
              <div className="border-y border-white/[0.06]">
                {[1, 2, 3, 4].map((index) => (
                  <div key={index} className="flex items-center justify-between gap-3 border-b border-white/[0.05] px-1 py-4 last:border-b-0">
                    <Skeleton className="h-4 w-36 bg-white/[0.05]" />
                    <Skeleton className="h-4 w-20 bg-white/[0.05]" />
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-col divide-y divide-white/[0.06] xl:col-span-1 xl:border-l xl:border-white/[0.06] xl:pl-8">
              <div className="pb-4">
                <div className="flex items-baseline justify-between gap-3">
                  <Skeleton className="h-5 w-16 bg-white/[0.05]" />
                  <Skeleton className="h-3 w-8 bg-white/[0.04]" />
                </div>
                <Skeleton className="mt-1 h-3 w-28 bg-white/[0.04]" />
                <Skeleton className="mt-3 h-1 w-full bg-white/[0.05]" />
                <Skeleton className="mt-2.5 h-3 w-full bg-white/[0.04]" />
              </div>
              <div className="py-4">
                <div className="flex items-center justify-between gap-3">
                  <Skeleton className="h-5 w-20 bg-white/[0.05]" />
                  <Skeleton className="h-3 w-16 bg-white/[0.04]" />
                </div>
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-baseline justify-between gap-3 border-b border-white/[0.06] pb-2">
              <Skeleton className="h-5 w-24 bg-white/[0.05]" />
              <Skeleton className="h-3 w-16 bg-white/[0.04]" />
            </div>
            <div className="grid grid-cols-1 gap-6 pt-5 sm:grid-cols-3 sm:gap-0 sm:divide-x sm:divide-white/[0.06]">
              {[1, 2, 3].map((index) => (
                <div key={index} className={index === 1 ? "sm:pr-7" : index === 2 ? "sm:px-7" : "sm:pl-7"}>
                  <Skeleton className="h-2.5 w-20 bg-white/[0.05]" />
                  <Skeleton className="mt-1.5 h-5 w-24 bg-white/[0.07]" />
                  <Skeleton className="mt-2 h-3 w-32 bg-white/[0.04]" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
