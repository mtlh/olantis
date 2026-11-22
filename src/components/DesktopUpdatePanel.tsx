"use client";

import { ArrowUpRight, RefreshCw, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DesktopUpdateState } from "@/components/useDesktopUpdate";

const TITLES: Record<Exclude<DesktopUpdateState, "idle" | "checking" | "up-to-date" | "disabled">, string> = {
  available: "Update available",
  downloading: "Downloading update",
  ready: "Update ready",
  error: "Update failed",
};

const ERROR_TEXT: Record<"check" | "download" | "install", string> = {
  check: "Could not reach the update feed. Check your connection and try again.",
  download: "The download did not finish. Your current build is unaffected — try again.",
  install: "The installer did not start. The downloaded build is still ready to install.",
};

function formatReleasedAt(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/**
 * The changelog panel behind the sidebar's update control. electron-updater
 * offers a build before it downloads, so the commits a relaunch would bring in
 * are readable while the download is in flight and before the explicit restart.
 */
export function DesktopUpdatePanel({ state, version, percent, releasedAt, notes, releaseUrl, errorContext, onRestart, onRetry }: {
  state: DesktopUpdateState;
  version: string | null;
  percent: number | null;
  releasedAt: string | null;
  notes: string[];
  releaseUrl: string | null;
  errorContext: "check" | "download" | "install" | null;
  onRestart: () => void;
  onRetry: () => void;
}) {
  if (state === "idle" || state === "checking" || state === "up-to-date" || state === "disabled") return null;
  const progress = percent == null ? null : Math.round(percent);
  const meta = [
    version ? `v${version}` : null,
    formatReleasedAt(releasedAt),
    state === "downloading" && progress != null ? `${progress}%` : null,
  ].filter((part): part is string => part !== null);

  return (
    <div className="w-full min-w-0 text-left">
      <p className="text-sm font-medium text-zinc-100">{TITLES[state]}</p>
      {meta.length > 0 && <p className="mt-0.5 truncate text-[11px] text-zinc-400">{meta.join(" · ")}</p>}

      {state === "downloading" && progress != null && (
        <div
          className="mt-3 h-1 overflow-hidden rounded-full bg-white/10"
          role="progressbar"
          aria-label="Update download progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
        >
          <div className="h-full rounded-full bg-amber-300 transition-[width] duration-300" style={{ width: `${progress}%` }} />
        </div>
      )}

      {state === "error" && (
        <p className="mt-2 text-[11px] leading-4 text-red-300">
          {ERROR_TEXT[errorContext ?? "check"]}
        </p>
      )}

      {notes.length > 0 ? (
        <div className="mt-3 border-t border-white/[0.06] pt-2.5">
          <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-zinc-400">What&apos;s changed</p>
          <ul className="mt-1.5 list-disc space-y-1 pl-4 text-[11px] leading-4 text-zinc-300 marker:text-zinc-500">
            {notes.map((note) => (
              <li key={note} className="line-clamp-2 break-words">{note}</li>
            ))}
          </ul>
        </div>
      ) : releaseUrl && state !== "error" ? (
        <p className="mt-3 text-[11px] text-zinc-400">The full release notes are on GitHub.</p>
      ) : null}

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-white/[0.06] pt-2.5">
        {releaseUrl ? (
          <a
            href={releaseUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-sm text-[11px] text-zinc-400 underline-offset-2 transition-colors hover:text-zinc-100 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30"
          >
            View release
            <ArrowUpRight className="h-3 w-3" />
          </a>
        ) : <span />}
        {state === "ready" ? (
          <Button variant="secondary" size="sm" onClick={onRestart}>
            <RotateCw className="h-3.5 w-3.5" />
            Restart to update
          </Button>
        ) : state === "downloading" ? (
          <span className="text-[10px] text-zinc-500">You can keep working</span>
        ) : state === "error" ? (
          <Button variant="secondary" size="sm" onClick={onRetry}>
            <RefreshCw className="h-3.5 w-3.5" />
            Try again
          </Button>
        ) : null}
      </div>
    </div>
  );
}
