"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { BrandIcon } from "@/components/BrandIcon";
import { PROVIDER_BRANDS, normalizeBrandName, providerBrandForName } from "@/lib/brands";
import type { Provider } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * A provider either already exists inside the account (`id`) or is one of the
 * curated brand marks we ship (`id: null`). A brand-only selection is created
 * when the portfolio is saved, so users never have to manage providers
 * separately.
 */
export type ProviderSelection = { id: string | null; name: string };

export type ProviderPickerProps = {
  id?: string;
  value: ProviderSelection | null;
  onChange: (value: ProviderSelection) => void;
  /** Providers already saved inside the selected account. */
  providers: Provider[];
  disabled?: boolean;
  className?: string;
};

type Option = { key: string; name: string; providerId: string | null };

function sortByName(a: Option, b: Option) {
  return a.name.localeCompare(b.name, "en-GB");
}

export function ProviderPicker({ id, value, onChange, providers, disabled, className }: ProviderPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const options = useMemo<Option[]>(() => {
    const existing = providers.map((provider) => ({
      key: `provider:${provider.id}`,
      name: provider.name,
      providerId: provider.id,
    }));
    // An existing provider already represents its brand, so the brand entry is
    // dropped instead of showing "Vanguard" twice.
    const represented = new Set(
      providers.map((provider) => providerBrandForName(provider.name)?.key ?? `name:${normalizeBrandName(provider.name)}`),
    );
    const brands = PROVIDER_BRANDS
      .filter((brand) => !represented.has(brand.key))
      .map((brand) => ({ key: `brand:${brand.key}`, name: brand.label, providerId: null }));

    return [...existing.sort(sortByName), ...brands];
  }, [providers]);

  const filtered = useMemo(() => {
    const term = normalizeBrandName(query);
    if (!term) return options;
    return options.filter((option) => normalizeBrandName(option.name).includes(term));
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    inputRef.current?.focus();
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    setQuery("");
    setOpen(true);
  };

  const choose = (option: Option) => {
    onChange({ id: option.providerId, name: option.name });
    setOpen(false);
  };

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        id={id}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        disabled={disabled}
        onClick={toggle}
        className={cn(
          "flex h-11 w-full items-center gap-2 rounded-xl border border-white/[.12] bg-black/20 px-3.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 disabled:cursor-not-allowed disabled:opacity-60",
          !disabled && "hover:border-white/20",
        )}
      >
        {value ? (
          <>
            <BrandIcon provider={value.name} size={20} />
            <span className="min-w-0 flex-1 truncate text-zinc-100">{value.name}</span>
          </>
        ) : (
          <span className="min-w-0 flex-1 truncate text-zinc-600">{disabled ? "Select an account first" : "Select a provider"}</span>
        )}
        <ChevronDown className={cn("size-4 shrink-0 text-zinc-500 transition-transform", open && "rotate-180")} aria-hidden="true" />
      </button>

      {open && !disabled && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1.5 overflow-hidden rounded-xl border border-white/10 bg-zinc-900 shadow-[0_24px_60px_rgba(0,0,0,.55)]">
          <div className="relative border-b border-white/[.07]">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-zinc-500" aria-hidden="true" />
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search providers…"
              aria-label="Search providers"
              aria-controls={listId}
              className="h-10 w-full bg-transparent pl-9 pr-3 text-sm text-white outline-none placeholder:text-zinc-600"
            />
          </div>
          <div id={listId} role="listbox" aria-label="Providers" className="max-h-60 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <p className="px-2.5 py-3 text-xs text-zinc-500">No provider matches “{query.trim()}”.</p>
            ) : (
              filtered.map((option) => {
                const selected = value
                  ? option.providerId
                    ? option.providerId === value.id
                    : !value.id && option.name === value.name
                  : false;
                return (
                  <button
                    key={option.key}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => choose(option)}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm transition-colors",
                      selected ? "bg-white/[.08] text-white" : "text-zinc-300 hover:bg-white/[.05] hover:text-white",
                    )}
                  >
                    <BrandIcon provider={option.name} size={20} />
                    <span className="min-w-0 flex-1 truncate">{option.name}</span>
                    {option.providerId === null && (
                      <span className="shrink-0 text-[10px] uppercase tracking-[0.08em] text-zinc-600">New</span>
                    )}
                    {selected && <Check className="size-3.5 shrink-0 text-white" aria-hidden="true" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
