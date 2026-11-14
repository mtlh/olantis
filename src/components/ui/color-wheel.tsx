"use client";

import { useState, type KeyboardEvent, type PointerEvent, type CSSProperties } from "react";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

type Hsv = { h: number; s: number; v: number };

const HEX_PATTERN = /^#?([0-9a-f]{6})$/i;

/** Hue is undefined for greys and black, so callers keep the last picked one. */
function hexToHsv(hex: string): Hsv {
  const match = HEX_PATTERN.exec(hex.trim());
  if (!match) return { h: 0, s: 0, v: 0 };
  const int = parseInt(match[1], 16);
  const r = ((int >> 16) & 255) / 255;
  const g = ((int >> 8) & 255) / 255;
  const b = (int & 255) / 255;
  const max = Math.max(r, g, b);
  const delta = max - Math.min(r, g, b);
  if (delta === 0) return { h: 0, s: 0, v: max };
  const raw = max === r ? (g - b) / delta : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  return { h: ((raw * 60) % 360 + 360) % 360, s: delta / max, v: max };
}

function hsvToHex({ h, s, v }: Hsv): string {
  const hue = ((h % 360) + 360) % 360;
  const chroma = v * s;
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = v - chroma;
  const [r, g, b] = hue < 60 ? [chroma, x, 0]
    : hue < 120 ? [x, chroma, 0]
    : hue < 180 ? [0, chroma, x]
    : hue < 240 ? [0, x, chroma]
    : hue < 300 ? [x, 0, chroma]
    : [chroma, 0, x];
  const channel = (value: number) => Math.round((value + m) * 255).toString(16).padStart(2, "0");
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

const WHEEL_BACKGROUND = "radial-gradient(circle closest-side, #ffffff 0%, rgba(255,255,255,0) 100%), conic-gradient(from 0deg, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)";

interface ColorWheelProps {
  /** Current colour as a hex string, e.g. `#a78bfa`. */
  value: string;
  onChange: (hex: string) => void;
  /** Accessible name for the swatch that opens the wheel. */
  label: string;
  className?: string;
  /** Controlled open state; omit to let the swatch manage its own popover. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/**
 * Swatch that opens a hue/saturation wheel plus a brightness slider, so a
 * colour can be picked by eye instead of typing a hex code.
 */
export function ColorWheel({ value, onChange, label, className, open, onOpenChange }: ColorWheelProps) {
  const [fallbackHue, setFallbackHue] = useState(() => hexToHsv(value).h);
  const hsv = hexToHsv(value);
  const hue = hsv.s > 0 && hsv.v > 0 ? hsv.h : fallbackHue;

  const update = (next: Hsv) => {
    setFallbackHue(next.h);
    onChange(hsvToHex(next));
  };

  const pick = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const radius = Math.min(rect.width, rect.height) / 2;
    if (radius <= 0) return;
    const dx = event.clientX - (rect.left + rect.width / 2);
    const dy = event.clientY - (rect.top + rect.height / 2);
    const s = Math.min(1, Math.hypot(dx, dy) / radius);
    const h = ((Math.atan2(dy, dx) * 180) / Math.PI + 450) % 360;
    update({ h, s, v: hsv.v > 0 ? hsv.v : 1 });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 10 : 2;
    const base = { h: hue, s: Math.max(hsv.s, 0.35), v: Math.max(hsv.v, 0.35) };
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      update({ ...base, h: hue + (event.key === "ArrowLeft" ? -step : step) });
    } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      const s = Math.min(1, Math.max(0, hsv.s + (event.key === "ArrowUp" ? step / 100 : -step / 100)));
      update({ ...base, s });
    }
  };

  const radians = (hue * Math.PI) / 180;
  const marker: CSSProperties = {
    left: `${50 + Math.sin(radians) * hsv.s * 50}%`,
    top: `${50 - Math.cos(radians) * hsv.s * 50}%`,
    background: value,
  };

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={(next) => onOpenChange?.(next)}>
      <PopoverPrimitive.Trigger
        type="button"
        aria-label={label}
        title={label}
        className={cn(
          "relative block shrink-0 cursor-pointer border border-white/[0.12] transition focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:outline-none",
          className,
        )}
        style={{ background: value }}
      />
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner sideOffset={8} align="start" className="z-50">
          <PopoverPrimitive.Popup initialFocus={false} className="w-60 rounded-2xl border border-white/[0.1] bg-zinc-950/95 p-3 text-white shadow-2xl outline-none backdrop-blur-xl data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95">
            <div className="flex items-center justify-between gap-2">
              <PopoverPrimitive.Title className="text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500">Pick a colour</PopoverPrimitive.Title>
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-[11px] uppercase tracking-tight text-zinc-400">{value}</span>
                <PopoverPrimitive.Close
                  aria-label="Close colour picker"
                  className="grid h-6 w-6 place-items-center rounded-full text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:outline-none"
                >
                  <X className="h-3 w-3" />
                </PopoverPrimitive.Close>
              </div>
            </div>

            <div
              role="slider"
              tabIndex={0}
              aria-label="Hue and saturation"
              aria-valuemin={0}
              aria-valuemax={360}
              aria-valuenow={Math.round(hue)}
              aria-valuetext={`Hue ${Math.round(hue)} degrees, saturation ${Math.round(hsv.s * 100)} percent`}
              onPointerDown={(event) => {
                event.preventDefault();
                event.currentTarget.setPointerCapture(event.pointerId);
                pick(event);
              }}
              onPointerMove={(event) => {
                if (event.currentTarget.hasPointerCapture(event.pointerId)) pick(event);
              }}
              onPointerUp={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
              onPointerCancel={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
              onKeyDown={handleKeyDown}
              className="relative mx-auto mt-3 aspect-square w-full max-w-[11rem] touch-none select-none rounded-full ring-1 ring-inset ring-white/10 outline-none focus-visible:ring-2 focus-visible:ring-white/40"
              style={{ background: WHEEL_BACKGROUND }}
            >
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 rounded-full bg-black"
                style={{ opacity: 1 - hsv.v }}
              />
              <span
                aria-hidden
                className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.6)]"
                style={marker}
              />
            </div>

            <label className="mt-3 block">
              <span className="sr-only">Brightness</span>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={Math.round(hsv.v * 100)}
                aria-label="Brightness"
                onChange={(event) => update({ h: hue, s: hsv.s, v: Number(event.target.value) / 100 })}
                className="h-3 w-full cursor-pointer appearance-none rounded-full ring-1 ring-inset ring-white/10 outline-none focus-visible:ring-2 focus-visible:ring-white/40 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-zinc-900 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-zinc-900"
                style={{ background: `linear-gradient(to right, #000000, ${hsvToHex({ h: hue, s: hsv.s, v: 1 })})` }}
              />
            </label>

            <p className="mt-2 text-[10px] leading-snug text-zinc-600">Click or drag the wheel for hue and saturation, then use the slider for brightness.</p>
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
