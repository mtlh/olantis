import { Skeleton } from "@/components/ui/skeleton";

// Lightweight chrome for the workspace group. Having a loading file also lets
// Next prefetch these dynamic routes, so a cold navigation paints this shell
// immediately instead of waiting on the server.
export default function WorkspaceLoading() {
  return (
    <div className="flex min-h-screen" aria-busy="true" aria-live="polite">
      <aside className="sticky top-0 hidden h-screen w-[360px] shrink-0 flex-col border-r border-white/[0.07] bg-black p-5 xl:flex">
        <Skeleton className="h-9 w-32 bg-white/[0.06]" />
        <Skeleton className="mt-5 h-9 w-full rounded-lg bg-white/[0.04]" />
        <div className="mt-6 flex items-center justify-between">
          <Skeleton className="h-2.5 w-20 bg-white/[0.05]" />
          <Skeleton className="h-7 w-7 rounded-md bg-white/[0.04]" />
        </div>
        <div className="mt-4 space-y-3">
          {[1, 2, 3, 4].map((index) => (
            <Skeleton key={index} className="h-[68px] w-full rounded-2xl bg-white/[0.035]" />
          ))}
        </div>
        <div className="mt-auto flex items-center gap-1 border-t border-white/[0.06] pt-2">
          <Skeleton className="h-8 w-8 rounded-md bg-white/[0.04]" />
          <Skeleton className="h-8 w-8 rounded-md bg-white/[0.04]" />
          <Skeleton className="h-8 w-8 rounded-md bg-white/[0.04]" />
          <Skeleton className="ml-auto h-8 w-8 rounded-md bg-white/[0.04]" />
        </div>
      </aside>

      <main id="main-content" className="min-w-0 flex-1 pt-12 xl:pt-0">
        <div className="mx-auto w-full max-w-[1600px] space-y-6 px-4 py-6 md:px-8 md:py-8 lg:px-10">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <Skeleton className="h-7 w-40 bg-white/[0.09]" />
              <Skeleton className="mt-3 h-3 w-64 bg-white/[0.05]" />
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-8 w-32 rounded-full bg-white/[0.05]" />
              <Skeleton className="h-8 w-32 rounded-full bg-white/[0.08]" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-6 gap-y-8 border-y border-white/[0.06] py-6 sm:gap-x-10 lg:grid-cols-4 lg:gap-0 lg:py-7">
            {[1, 2, 3, 4].map((index) => (
              <div key={index} className={index === 4 ? "hidden lg:block lg:border-l lg:border-white/[0.06] lg:px-8" : index > 1 ? "lg:border-l lg:border-white/[0.06] lg:px-8" : "lg:pr-8"}>
                <Skeleton className="h-2.5 w-20 bg-white/[0.05]" />
                <Skeleton className="mt-3 h-8 w-28 bg-white/[0.09]" />
                <Skeleton className="mt-2 h-2.5 w-24 bg-white/[0.04]" />
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Skeleton className="h-72 rounded-3xl bg-white/[0.03] lg:col-span-2" />
            <Skeleton className="h-72 rounded-3xl bg-white/[0.03]" />
          </div>

          <Skeleton className="h-44 rounded-3xl bg-white/[0.025]" />
        </div>
      </main>
    </div>
  );
}
