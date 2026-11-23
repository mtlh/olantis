"use client";

import { ArrowDownToLine, ArrowUpRight, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DesktopChangesState, DesktopRelease, DesktopUpdate } from "@/components/useDesktopChanges";
import { fmtDateTime } from "@/lib/format";

function releaseLabel(release: DesktopRelease): string {
  return release.title ?? (release.version ? `Olantis ${release.version}` : "Release");
}

function releaseKey(release: DesktopRelease): string {
  return release.version ?? release.url ?? release.title ?? release.publishedAt ?? "release";
}

/**
 * The changelog panel behind the sidebar's refresh control. It lists what was
 * published recently with the moment each release landed, and offers no
 * download or restart: the deployed site updates on its own, so this is only a
 * way to look at the changes.
 */
export function DesktopChangesPanel({ state, releases, checkedAt, currentVersion, update, onRetry }: {
  state: DesktopChangesState;
  releases: DesktopRelease[];
  checkedAt: string | null;
  currentVersion: string | null;
  update: DesktopUpdate | null;
  onRetry: () => void;
}) {
  return (
    <div className="w-full min-w-0 text-left">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-medium text-zinc-100">Recent changes</p>
        {currentVersion && <span className="shrink-0 text-[10px] tabular-nums text-zinc-500">v{currentVersion}</span>}
      </div>

      {state === "ready" && update && (
        <div className="mt-2 rounded-lg border border-amber-300/20 bg-amber-300/[0.06] p-2">
          <p className="text-[11px] font-medium text-amber-200">
            {update.appVersion ? `Olantis ${update.appVersion} is available` : "A newer desktop build is available"}
          </p>
          <p className="mt-0.5 text-[10px] leading-4 text-zinc-400">
            Only the desktop shell changed — the web app updates on its own.
          </p>
          {update.downloadUrl ? (
            <a
              href={update.downloadUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-1.5 inline-flex items-center gap-1 rounded-sm text-[11px] font-medium text-amber-200 underline-offset-2 transition-colors hover:text-amber-100 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-300/40"
            >
              <ArrowDownToLine className="h-3 w-3" />
              Download installer
            </a>
          ) : update.releaseUrl ? (
            <a
              href={update.releaseUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-1.5 inline-flex items-center gap-1 rounded-sm text-[11px] font-medium text-amber-200 underline-offset-2 transition-colors hover:text-amber-100 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-300/40"
            >
              Open release page
              <ArrowUpRight className="h-3 w-3" />
            </a>
          ) : null}
        </div>
      )}

      {state === "checking" && releases.length === 0 ? (
        <p className="mt-2 flex items-center gap-2 text-[11px] text-zinc-400">
          <RefreshCw className="h-3 w-3 animate-spin" />
          Checking GitHub releases…
        </p>
      ) : state === "error" ? (
        <div className="mt-2">
          <p className="text-[11px] leading-4 text-red-300">
            Could not reach GitHub releases. Check your connection and try again.
          </p>
          <Button variant="secondary" size="sm" className="mt-2" onClick={onRetry}>
            <RefreshCw className="h-3.5 w-3.5" />
            Try again
          </Button>
        </div>
      ) : releases.length === 0 ? (
        <p className="mt-2 text-[11px] text-zinc-400">No published changes yet.</p>
      ) : (
        <ol className="mt-2 max-h-[min(60vh,28rem)] space-y-3 overflow-y-auto pr-1">
          {releases.map((release) => (
            <li key={releaseKey(release)} className="border-t border-white/[0.06] pt-2 first:border-0 first:pt-0">
              <div className="flex items-baseline justify-between gap-2">
                <p className="truncate text-[11px] font-medium text-zinc-100">{releaseLabel(release)}</p>
                {release.publishedAt && (
                  <time dateTime={release.publishedAt} className="shrink-0 text-[10px] tabular-nums text-zinc-500">
                    {fmtDateTime(release.publishedAt)}
                  </time>
                )}
              </div>
              {release.notes.length > 0 && (
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px] leading-4 text-zinc-300 marker:text-zinc-500">
                  {release.notes.map((note) => (
                    <li key={note} className="break-words">{note}</li>
                  ))}
                </ul>
              )}
              {release.url && (
                <a
                  href={release.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-flex items-center gap-1 rounded-sm text-[10px] text-zinc-400 underline-offset-2 transition-colors hover:text-zinc-100 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30"
                >
                  View release
                  <ArrowUpRight className="h-3 w-3" />
                </a>
              )}
            </li>
          ))}
        </ol>
      )}

      {checkedAt && state !== "checking" && (
        <p className="mt-2 border-t border-white/[0.06] pt-2 text-[10px] tabular-nums text-zinc-500">
          Checked {fmtDateTime(checkedAt)}
        </p>
      )}
    </div>
  );
}
