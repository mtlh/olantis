"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import type { VariantProps } from "class-variance-authority";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type DemoButtonProps = VariantProps<typeof buttonVariants> & {
  className?: string;
  label?: string;
  pendingLabel?: string;
  /** The hero button carries the arrow; the quieter in-page links do not. */
  showArrow?: boolean;
};

/**
 * The one-click demo entry point.
 *
 * `/api/demo` has to seed a throwaway tenant before it can redirect, which
 * takes a noticeable moment on a cold database. As a plain link that window was
 * completely silent — the landing page just sat there — so the button now owns
 * the pending state: it locks itself and swaps to a spinner and a "setting up"
 * label the instant it is clicked, then hands over to the real navigation.
 */
export function DemoButton({
  className,
  label = "Try demo",
  pendingLabel = "Setting up demo…",
  showArrow = true,
  variant,
  size,
}: DemoButtonProps) {
  const [pending, setPending] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // A back/forward restore brings the page back with the pending flag still
    // set, and an aborted navigation never fires a fresh load.
    const unlock = () => setPending(false);
    window.addEventListener("pageshow", unlock);
    return () => window.removeEventListener("pageshow", unlock);
  }, []);

  useEffect(() => {
    if (!pending) return;
    // Safety net so a cancelled navigation (Esc, dead network) cannot leave the
    // button stuck in its pending state for the life of the page.
    resetTimer.current = setTimeout(() => setPending(false), 20_000);
    return () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    };
  }, [pending]);

  return (
    <a
      href="/api/demo"
      aria-busy={pending}
      aria-disabled={pending}
      onClick={(event) => {
        if (pending) {
          event.preventDefault();
          return;
        }
        setPending(true);
      }}
      className={cn(
        buttonVariants({ variant, size }),
        pending && "pointer-events-none",
        className,
      )}
    >
      {pending ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
          {pendingLabel}
        </>
      ) : (
        <>
          {label}
          {showArrow && <ArrowRight className="w-4 h-4" />}
        </>
      )}
    </a>
  );
}
