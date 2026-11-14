"use client";
import { useAccounts, useProviders, usePortfolios, useHoldings, useSettings, applyWorkspaceOrder, type AppSettings, type Portfolio } from "@/lib/store";
import { useMemo, useState, type DragEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { Building2, Briefcase, Folder, FolderOpen, Trash2, Download, Upload, ChevronUp, ChevronDown, GripVertical, Info, Plus, RotateCcw, X } from "lucide-react";
import { tintColor, resolveAccountColor, resolvePortfolioColor, resolveProviderColor } from "@/lib/colors";
import { MAX_PALETTE_COLORS, addPaletteColor, colorLabel, isDefaultPalette, removePaletteColor, resetPalette, updatePaletteColor, usePalette } from "@/lib/palette";
import { ENTITY_ICON_OPTIONS } from "@/lib/entity-icons";
import { EntityIcon } from "@/components/EntityIcon";
import { BrandIcon } from "@/components/BrandIcon";
import { ChartRangeSelector, type ChartRange } from "@/components/dashboard/shared/ChartRangeSelector";
import { AllocationCard } from "@/components/dashboard/shared/AllocationCard";
import { usePortfolioAllocation } from "@/components/dashboard/usePortfolioAllocation";

interface SettingsState {
  currency: string;
  dateFormat: string;
  defaultRange: AppSettings["defaultRange"];
  showTradeMarkers: number;
}

/** The three sortable tables behind /api/reorder. */
type OrderTable = "accounts" | "providers" | "portfolios";

const LABEL = "text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-600";
const ROW_HINT = "mt-0.5 text-[11px] text-zinc-600";
const FIELD = "w-full border-white/[0.08] bg-white/[0.03]";
const ACTION = "justify-start rounded-full text-zinc-300 sm:justify-center";

function parseCsv(source: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') { cell += '"'; i++; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(cell); cell = ""; }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += char;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  if (quoted) throw new Error("CSV contains an unclosed quoted field");
  return rows;
}

function Swatch({ color, active, onClick }: { color: string; active?: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={!!active}
      aria-label={`Use colour ${color}`}
      className={`h-7 w-7 rounded-full border-2 transition-all ${active ? "scale-110 border-white" : "border-white/10 hover:border-white/30"}`}
      style={{ background: color }}
    />
  );
}

const ICON_TILE = "grid size-8 shrink-0 place-items-center rounded-lg border transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30";

/**
 * Icon grid for one account/provider. The first tile is the default (folder or
 * fetched brand mark); choosing it clears the override.
 */
function IconGrid({
  value,
  color,
  fallback,
  fallbackLabel,
  onChange,
}: {
  value: string | null;
  color: string;
  fallback: ReactNode;
  fallbackLabel: string;
  onChange: (icon: string | null) => void;
}) {
  const tile = (active: boolean) =>
    `${ICON_TILE} ${active ? "border-white/30 bg-white/[0.12]" : "border-white/[0.06] bg-white/[0.02] hover:border-white/20"}`;
  return (
    <div role="group" aria-label="Choose an icon" className="mt-2.5 flex flex-wrap items-center gap-1.5 rounded-xl border border-white/[0.06] bg-black/25 p-2">
      <button
        type="button"
        aria-pressed={!value}
        aria-label={`Use the default ${fallbackLabel}`}
        title={`Default ${fallbackLabel}`}
        onClick={() => onChange(null)}
        className={`${tile(!value)} text-zinc-400`}
      >
        {fallback}
      </button>
      {ENTITY_ICON_OPTIONS.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          aria-pressed={value === id}
          aria-label={label}
          title={label}
          onClick={() => onChange(id)}
          className={`${tile(value === id)} ${value === id ? "" : "text-zinc-500 hover:text-zinc-200"}`}
        >
          <EntityIcon icon={id} size={15} color={value === id ? color : undefined} />
        </button>
      ))}
    </div>
  );
}

function CsvFormatBlock({ label, required, sample }: { label: string; required: string; sample: string }) {
  return (
    <div>
      <p className="text-[11px] font-medium text-zinc-200">{label}</p>
      <p className="mt-0.5 text-[10px] leading-snug text-zinc-500">{required}</p>
      <pre className="mt-1.5 overflow-x-auto rounded-lg border border-white/[0.07] bg-black/50 px-2.5 py-1.5 font-mono text-[10px] leading-relaxed text-zinc-300">{sample}</pre>
    </div>
  );
}

function SegmentedToggle<T extends string | number>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (value: T) => void }) {
  return (
    <div className="flex w-fit items-center gap-0.5 rounded-full border border-white/[0.06] bg-white/[0.03] p-0.5 md:justify-self-end">
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${value === option.value ? "bg-white/[0.09] text-white" : "text-zinc-500 hover:text-zinc-300"}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

interface OrderRowProps {
  name: string;
  meta?: string;
  color: string;
  index: number;
  count: number;
  dragging: boolean;
  dropTarget: boolean;
  onDragStart: () => void;
  onDragOver: (event: DragEvent<HTMLDivElement>) => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

function OrderRow({ name, meta, color, index, count, dragging, dropTarget, onDragStart, onDragOver, onDrop, onDragEnd, onMoveUp, onMoveDown }: OrderRowProps) {
  return (
    <div
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", name);
        onDragStart();
      }}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className={`group/row flex cursor-grab items-center gap-1.5 rounded-md py-1 pl-1 pr-0.5 transition-colors active:cursor-grabbing ${dragging ? "opacity-40" : "hover:bg-white/[0.04]"} ${dropTarget ? "bg-white/[0.06] ring-1 ring-inset ring-white/20" : ""}`}
    >
      <GripVertical aria-hidden className="h-3.5 w-3.5 shrink-0 text-zinc-700 transition-colors group-hover/row:text-zinc-500" />
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
      <span className="min-w-0 flex-1 truncate text-[13px] leading-5 text-zinc-200">{name}</span>
      {meta && <span className="shrink-0 text-[10px] uppercase tracking-[0.1em] text-zinc-600">{meta}</span>}
      <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover/row:opacity-100 group-focus-within/row:opacity-100">
        <Button variant="ghost" size="icon-xs" className="h-5 w-5 text-zinc-500 hover:text-white" aria-label={`Move ${name} up`} disabled={index === 0} onClick={onMoveUp}><ChevronUp className="h-3 w-3" /></Button>
        <Button variant="ghost" size="icon-xs" className="h-5 w-5 text-zinc-500 hover:text-white" aria-label={`Move ${name} down`} disabled={index === count - 1} onClick={onMoveDown}><ChevronDown className="h-3 w-3" /></Button>
      </div>
    </div>
  );
}

function PaletteEditor() {
  const palette = usePalette();
  const [draftHex, setDraftHex] = useState("#a78bfa");
  const [pickerHex, setPickerHex] = useState("#a78bfa");
  const [draftLabel, setDraftLabel] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const validDraft = /^#[0-9a-f]{6}$/i.test(draftHex);
  const duplicate = validDraft && palette.some((color) => color.value === draftHex.toLowerCase());
  const full = palette.length >= MAX_PALETTE_COLORS;

  const hint = notice
    ?? (full
      ? `Palette is full — ${MAX_PALETTE_COLORS} colours is the maximum.`
      : duplicate
        ? "That colour is already in your palette."
        : !validDraft
          ? "Hex colours look like #60a5fa."
          : "Name it yourself, or leave that blank and we will name it for you.");

  const addDraft = () => {
    if (full) { setNotice(`Your palette can hold up to ${MAX_PALETTE_COLORS} colours.`); return; }
    if (!validDraft) { setNotice("Enter a hex colour such as #60a5fa."); return; }
    if (duplicate) { setNotice("That colour is already in your palette."); return; }
    if (!addPaletteColor(draftHex, draftLabel)) { setNotice("Could not add that colour."); return; }
    setNotice(`Added ${draftLabel.trim() || colorLabel(draftHex)}.`);
    setDraftLabel("");
  };

  return (
    <section aria-labelledby="palette-heading" className="py-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <h2 id="palette-heading" className="text-sm font-medium text-white">Palette</h2>
          <span className="text-[11px] text-zinc-600">{palette.length} data {palette.length === 1 ? "colour" : "colours"}</span>
        </div>
        <Button
          variant="ghost"
          size="xs"
          className="rounded-full text-zinc-500 hover:text-white"
          disabled={isDefaultPalette(palette)}
          onClick={() => { resetPalette(); setNotice(null); }}
        >
          <RotateCcw className="h-3 w-3" /> Reset to default
        </Button>
      </div>
      <p className="mt-1 text-[11px] text-zinc-600">Auto-tints cycle through this list. Click a swatch to recolour it; remove the ones you never use.</p>

      <div className="mt-4 flex flex-wrap gap-2">
        {palette.map((color) => (
          <span key={color.id} className="flex items-center gap-1.5 rounded-full border border-white/[0.06] bg-white/[0.03] py-1 pl-1.5 pr-1">
            <label
              title={`Change ${color.label}`}
              className="relative grid h-5 w-5 shrink-0 cursor-pointer place-items-center rounded-full focus-within:ring-2 focus-within:ring-white/40"
            >
              <span className="h-3.5 w-3.5 rounded-full border border-white/20" style={{ background: color.value }} />
              <input
                type="color"
                value={color.value}
                aria-label={`Change ${color.label} colour`}
                onChange={(event) => {
                  if (!updatePaletteColor(color.id, event.target.value)) setNotice("That colour is already in your palette.");
                  else setNotice(null);
                }}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
            </label>
            <span className="text-[11px] text-zinc-400">{color.label}</span>
            <Button
              variant="ghost"
              size="icon-xs"
              className="h-5 w-5 rounded-full text-zinc-600 hover:text-white"
              aria-label={`Remove ${color.label}`}
              title={palette.length <= 1 ? "Keep at least one colour" : `Remove ${color.label}`}
              disabled={palette.length <= 1}
              onClick={() => { removePaletteColor(color.id); setNotice(null); }}
            >
              <X className="h-3 w-3" />
            </Button>
          </span>
        ))}
      </div>

      <div className="mt-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label
            title="Pick a colour"
            className="relative h-8 w-8 shrink-0 cursor-pointer overflow-hidden rounded-lg border border-white/[0.1] focus-within:ring-2 focus-within:ring-white/40"
            style={{ background: pickerHex }}
          >
            <input
              type="color"
              value={pickerHex}
              aria-label="Pick a new palette colour"
              onChange={(event) => {
                const value = event.target.value;
                setPickerHex(value);
                setDraftHex(value);
                setNotice(null);
              }}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
          </label>
          <Input
            value={draftLabel}
            maxLength={24}
            placeholder="Name (optional)"
            aria-label="New palette colour name"
            className="h-8 border-white/[0.08] bg-white/[0.03] sm:w-44"
            onChange={(event) => { setDraftLabel(event.target.value); setNotice(null); }}
          />
          <Input
            value={draftHex}
            maxLength={7}
            spellCheck={false}
            placeholder="#a78bfa"
            aria-label="New palette hex colour"
            className="h-8 border-white/[0.08] bg-white/[0.03] font-mono sm:w-32"
            onChange={(event) => {
              const value = event.target.value;
              setDraftHex(value);
              setNotice(null);
              if (/^#[0-9a-f]{6}$/i.test(value)) setPickerHex(value.toLowerCase());
            }}
          />
          <Button
            size="sm"
            className="rounded-full"
            disabled={full || !validDraft || duplicate}
            onClick={addDraft}
          >
            <Plus className="h-3.5 w-3.5" /> Add colour
          </Button>
        </div>
        <p className="mt-2 text-[11px] text-zinc-600" aria-live="polite">{hint}</p>
      </div>
    </section>
  );
}

export function SettingsView({ isDemo }: { isDemo?: boolean }) {
  const { accounts, setColor: setAccountColor, setIcon: setAccountIcon } = useAccounts();
  const { providers, setColor: setProviderColor, setIcon: setProviderIcon } = useProviders();
  const { portfolios, setColor: setPortfolioColor, refresh: refreshPortfolios } = usePortfolios();
  const { holdings: allHoldings } = useHoldings();
  const { settings: appSettings, save: saveAppSettings } = useSettings();
  const palette = usePalette();
  const { toast } = useToast();
  // The store hook already holds the server settings (bootstrapped or fetched
  // once by the hook), so this view keeps no second copy. A save overlays its
  // patch optimistically until the store refresh lands, then clears it: success
  // shows the fresh store value, failure reverts to it.
  const [settingsPatch, setSettingsPatch] = useState<Partial<SettingsState> | null>(null);
  const settings: SettingsState = {
    currency: settingsPatch?.currency ?? appSettings.currency,
    dateFormat: settingsPatch?.dateFormat ?? appSettings.dateFormat,
    defaultRange: settingsPatch?.defaultRange ?? appSettings.defaultRange,
    showTradeMarkers: settingsPatch?.showTradeMarkers ?? (appSettings.showTradeMarkers ? 1 : 0),
  };
  const [saving, setSaving] = useState<string | null>(null);
  const [colorTab, setColorTab] = useState<"accounts" | "providers" | "portfolios">("accounts");
  const [iconPickerFor, setIconPickerFor] = useState<string | null>(null);
  const [importPortfolioId, setImportPortfolioId] = useState("");
  const [importing, setImporting] = useState(false);
  const [showImportFormat, setShowImportFormat] = useState(false);

  const saveSettings = async (patch: Partial<AppSettings>) => {
    setSettingsPatch((current) => ({
      ...current,
      ...(patch.currency !== undefined ? { currency: patch.currency } : {}),
      ...(patch.dateFormat !== undefined ? { dateFormat: patch.dateFormat } : {}),
      ...(patch.defaultRange !== undefined ? { defaultRange: patch.defaultRange } : {}),
      ...(patch.showTradeMarkers !== undefined ? { showTradeMarkers: patch.showTradeMarkers ? 1 : 0 } : {}),
    }));
    try {
      await saveAppSettings(patch);
      toast({ title: "Settings saved", variant: "success" });
    } catch (e: unknown){ toast({title:"Save failed", description: e instanceof Error ? e.message : String(e), variant:"error"}); }
    finally { setSettingsPatch(null); }
  };

  const handleAccountColor = async (id: string, color: string | null) => {
    setSaving(id);
    try { await setAccountColor(id, color); toast({ title: "Account color updated", variant: "success" }); } catch (e: unknown){ toast({title:"Failed", description: e instanceof Error ? e.message : String(e), variant:"error"});} finally{ setSaving(null); }
  };
  const handleProviderColor = async (id: string, color: string | null) => {
    setSaving(id);
    try { await setProviderColor(id, color); toast({ title: "Provider color updated", variant: "success" }); } catch (e: unknown){ toast({title:"Failed", description: e instanceof Error ? e.message : String(e), variant:"error"});} finally{ setSaving(null); }
  };
  const handlePortfolioColor = async (id: string, color: string | null) => {
    setSaving(id);
    try { await setPortfolioColor(id, color); toast({ title: "Portfolio color updated", variant: "success" }); } catch (e: unknown){ toast({title:"Failed", description: e instanceof Error ? e.message : String(e), variant:"error"});} finally{ setSaving(null); }
  };
  const handleAccountIcon = async (id: string, icon: string | null) => {
    setSaving(id);
    try { await setAccountIcon(id, icon); toast({ title: icon ? "Account icon updated" : "Account icon reset", variant: "success" }); } catch (e: unknown){ toast({title:"Failed", description: e instanceof Error ? e.message : String(e), variant:"error"});} finally{ setSaving(null); }
  };
  const handleProviderIcon = async (id: string, icon: string | null) => {
    setSaving(id);
    try { await setProviderIcon(id, icon); toast({ title: icon ? "Provider icon updated" : "Brand icon restored", variant: "success" }); } catch (e: unknown){ toast({title:"Failed", description: e instanceof Error ? e.message : String(e), variant:"error"});} finally{ setSaving(null); }
  };

  const handleReorder = async (table: OrderTable, ids: string[], previousIds: string[]) => {
    // Paint the accepted order everywhere — the sidebar keeps its own copy of
    // these rows — then persist it in the background. A failed save puts the
    // previous order back so the sidebar never disagrees with the server.
    applyWorkspaceOrder(table, ids);
    try {
      const res = await fetch("/api/reorder", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ table, ids }) });
      if (!res.ok) throw new Error((await res.text()) || `Reorder failed (${res.status})`);
      toast({ title: "Order updated", variant: "success" });
    } catch (e: unknown) {
      applyWorkspaceOrder(table, previousIds);
      toast({ title: "Reorder failed", description: e instanceof Error ? e.message : String(e), variant: "error" });
    }
  };

  const moveItem = (table: OrderTable, list: { id: string }[], from: number, to: number) => {
    if (from === to || to < 0 || to >= list.length) return;
    const ids = list.map(x => x.id);
    const [moved] = ids.splice(from, 1);
    ids.splice(to, 0, moved);
    void handleReorder(table, ids, list.map(x => x.id));
  };

  const [drag, setDrag] = useState<{ group: string; index: number } | null>(null);
  const [dragOver, setDragOver] = useState<{ group: string; index: number } | null>(null);

  // Rows are only droppable inside their own group, so dragging never mixes
  // accounts, providers of different accounts, or portfolios of different accounts.
  const orderProps = (table: OrderTable, group: string, list: { id: string }[], index: number) => ({
    index,
    count: list.length,
    dragging: drag?.group === group && drag.index === index,
    dropTarget: drag?.group === group && drag.index !== index && dragOver?.group === group && dragOver.index === index,
    onDragStart: () => { setDrag({ group, index }); setDragOver(null); },
    onDragOver: (event: DragEvent<HTMLDivElement>) => {
      if (drag?.group !== group) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      if (dragOver?.group !== group || dragOver.index !== index) setDragOver({ group, index });
    },
    onDrop: (event: DragEvent<HTMLDivElement>) => {
      if (drag?.group !== group) return;
      event.preventDefault();
      moveItem(table, list, drag.index, index);
      setDrag(null);
      setDragOver(null);
    },
    onDragEnd: () => { setDrag(null); setDragOver(null); },
    onMoveUp: () => moveItem(table, list, index, index - 1),
    onMoveDown: () => moveItem(table, list, index, index + 1),
  });

  const sortedAccounts = useMemo(() => [...accounts].sort((a, b) => (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999)), [accounts]);
  const sortedProviders = useMemo(() => [...providers].sort((a, b) => (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999)), [providers]);
  const sortedPortfolios = useMemo(() => [...portfolios].sort((a, b) => (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999)), [portfolios]);
  const providersByAccount = useMemo(() => {
    const m = new Map<string, typeof providers>();
    for (const pr of providers) { const arr = m.get(pr.accountId) ?? []; arr.push(pr); m.set(pr.accountId, arr); }
    for (const [, arr] of m) arr.sort((a, b) => (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999));
    return m;
  }, [providers]);

  const directHoldings = useMemo(() => allHoldings.filter((holding) => !holding.portfolioId), [allHoldings]);
  const holdingCount = useMemo(
    () => portfolios.reduce((sum, portfolio) => sum + portfolio.holdings.length, 0) + directHoldings.length,
    [portfolios, directHoldings],
  );
  // Only siblings inside the same group can trade places, so a group with a
  // single row is not a candidate for swapping and is left out entirely.
  const providerGroups = useMemo(
    () => sortedAccounts
      .map((account) => ({ account, items: providersByAccount.get(account.id) ?? [] }))
      .filter((group) => group.items.length > 1),
    [providersByAccount, sortedAccounts],
  );
  const portfolioGroups = useMemo(() => {
    // The sidebar lists portfolios inside their account card (provider is only a
    // subtitle), so an account is the unit whose portfolios can swap places.
    const accountIdByProvider = new Map(providers.map((provider) => [provider.id, provider.accountId]));
    const byAccount = new Map<string, Portfolio[]>();
    const unassigned: Portfolio[] = [];
    for (const portfolio of sortedPortfolios) {
      const accountId = portfolio.providerId ? accountIdByProvider.get(portfolio.providerId) ?? portfolio.accountId : portfolio.accountId;
      if (!accountId) { unassigned.push(portfolio); continue; }
      const items = byAccount.get(accountId) ?? [];
      items.push(portfolio);
      byAccount.set(accountId, items);
    }
    const groups: { key: string; label: string; items: Portfolio[] }[] = [];
    for (const account of sortedAccounts) {
      const items = byAccount.get(account.id) ?? [];
      if (items.length > 1) groups.push({ key: `account:${account.id}`, label: account.name, items });
    }
    if (unassigned.length > 1) groups.push({ key: "unassigned", label: "Unassigned", items: unassigned });
    return groups;
  }, [providers, sortedAccounts, sortedPortfolios]);
  const hasAccountSwaps = sortedAccounts.length > 1;
  const hasSwaps = hasAccountSwaps || providerGroups.length > 0 || portfolioGroups.length > 0;
  const allocation = usePortfolioAllocation({
    activePortfolio: null,
    portfolios,
    directHoldings,
    accounts,
    providers,
    fxRates: appSettings.fxRates,
    activeBaseColor: null,
    mode: "account",
    palette,
  });
  const defaultRange: ChartRange = settings.defaultRange === "1M" || settings.defaultRange === "3M" || settings.defaultRange === "MAX" ? settings.defaultRange : "1Y";

  const exportAll = async () => {
    const data = { accounts, providers, portfolios, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `olantis-export-${new Date().toISOString().slice(0,10)}.json`; a.click(); URL.revokeObjectURL(url);
  };

  return (
    <section className="space-y-6 pb-16 xl:pb-0">
      <h1 className="text-[28px] font-semibold leading-none tracking-tight text-white">Settings</h1>

      <div className="grid grid-cols-2 gap-x-6 gap-y-6 border-y border-white/[0.06] py-6 sm:grid-cols-4 sm:gap-x-0">
        {[
          { label: "Accounts", value: accounts.length },
          { label: "Providers", value: providers.length },
          { label: "Portfolios", value: portfolios.length },
          { label: "Holdings", value: holdingCount },
        ].map((item, index) => (
          <div key={item.label} className={index === 0 ? "sm:pr-8" : "sm:border-l sm:border-white/[0.06] sm:pl-8"}>
            <p className={LABEL}>{item.label}</p>
            <p className="mt-2 text-2xl font-semibold leading-none tracking-tight tabular-nums text-white">{item.value}</p>
          </div>
        ))}
      </div>

      <div className="divide-y divide-white/[0.06] border-b border-white/[0.06]">
        <section aria-labelledby="preferences-heading" className="py-6">
          <h2 id="preferences-heading" className="text-sm font-medium text-white">Preferences</h2>
          <div className="mt-4 divide-y divide-white/[0.05]">
            <div className="grid gap-2 py-3.5 first:pt-0 md:grid-cols-[minmax(0,1fr)_15rem] md:items-center md:gap-8">
              <div>
                <Label htmlFor="setting-currency">Default currency</Label>
                <p className={ROW_HINT}>Applied to new holdings and trades.</p>
              </div>
              <Select value={settings.currency} onValueChange={v=> saveSettings({ currency: v ?? "GBP" })}>
                <SelectTrigger id="setting-currency" className={FIELD}><span className="flex-1 text-left truncate">{settings.currency ?? "GBP"}</span></SelectTrigger>
                <SelectContent>
                  <SelectItem value="GBP">GBP (£)</SelectItem>
                  <SelectItem value="USD">USD ($)</SelectItem>
                  <SelectItem value="EUR">EUR (€)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2 py-3.5 md:grid-cols-[minmax(0,1fr)_15rem] md:items-center md:gap-8">
              <div>
                <Label htmlFor="setting-date-format">Date format</Label>
              </div>
              <Select value={settings.dateFormat} onValueChange={v=> saveSettings({ dateFormat: v ?? "en-GB" })}>
                <SelectTrigger id="setting-date-format" className={FIELD}><span className="flex-1 text-left truncate">{settings.dateFormat ?? "en-GB"}</span></SelectTrigger>
                <SelectContent><SelectItem value="en-GB">Day / month / year</SelectItem><SelectItem value="en-US">Month / day / year</SelectItem><SelectItem value="de-DE">Day.month.year</SelectItem><SelectItem value="fr-FR">Day / month / year (French)</SelectItem></SelectContent>
              </Select>
            </div>

            <div className="grid gap-2 py-3.5 md:grid-cols-[minmax(0,1fr)_15rem] md:items-center md:gap-8">
              <div>
                <p className="text-sm font-medium text-zinc-200">Default chart range</p>
                <p className={ROW_HINT}>Range every chart opens on.</p>
              </div>
              <ChartRangeSelector range={defaultRange} onRangeChange={(value) => saveSettings({ defaultRange: value })} segmented className="w-fit md:justify-self-end" />
            </div>

            <div className="grid gap-2 py-3.5 pb-0 md:grid-cols-[minmax(0,1fr)_15rem] md:items-center md:gap-8">
              <div>
                <p className="text-sm font-medium text-zinc-200">Trade markers</p>
                <p className={ROW_HINT}>Buy and sell dots on portfolio charts.</p>
              </div>
              <SegmentedToggle
                value={settings.showTradeMarkers}
                options={[{ value: 1, label: "On" }, { value: 0, label: "Off" }]}
                onChange={(value) => saveSettings({ showTradeMarkers: value !== 0 })}
              />
            </div>
          </div>
        </section>

        <details className="group py-6" open>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 [&::-webkit-details-marker]:hidden">
            <span className="text-sm font-medium text-white">Colour &amp; icons</span>
            <ChevronDown className="h-4 w-4 shrink-0 text-zinc-500 transition-transform group-open:rotate-180" />
          </summary>
          <div className="grid gap-6 pt-4 xl:grid-cols-[minmax(0,1fr)_20rem] xl:gap-10">
            <div className="min-w-0">
              <div className="grid w-full grid-cols-3 gap-0.5 rounded-full border border-white/[0.06] bg-white/[0.03] p-0.5 sm:inline-flex sm:w-fit sm:items-center">
                {([
                  { key: "accounts" as const, label: "Accounts", icon: Building2 },
                  { key: "providers" as const, label: "Providers", icon: Briefcase },
                  { key: "portfolios" as const, label: "Portfolios", icon: Folder },
                ]).map(({ key, label, icon: Icon }) => (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={colorTab === key}
                    onClick={() => setColorTab(key)}
                    className={`flex items-center justify-center gap-1.5 rounded-full px-2 py-1.5 text-[11px] font-medium transition-colors ${colorTab === key ? "bg-white/[0.09] text-white" : "text-zinc-500 hover:text-zinc-300"}`}
                  >
                    <Icon className="h-3.5 w-3.5" /> {label}
                  </button>
                ))}
              </div>
              <p className="mt-3 text-[11px] text-zinc-600">
                {colorTab === "accounts"
                  ? "Base colour and folder icon for each account; providers and portfolios tint from these."
                  : colorTab === "providers"
                    ? "Inherit the account tint or pin a fixed colour, and swap a provider's brand mark for your own icon."
                    : "Follow the parent tint, or pin a fixed colour."}
              </p>

              {colorTab === "accounts" && (
                accounts.length === 0 ? <p className="mt-3 border-t border-white/[0.05] py-6 text-sm text-zinc-500">No accounts yet. Create one from the sidebar.</p> : (
                  <div className="mt-3 divide-y divide-white/[0.05] border-t border-white/[0.05]">
                    {sortedAccounts.map((acc) => {
                      const base = resolveAccountColor(acc, accounts, palette);
                      return (
                        <div key={acc.id} className="py-4">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex min-w-0 items-center gap-2.5">
                              <span className="grid size-7 shrink-0 place-items-center rounded-lg border" style={{ borderColor: `${base}55`, background: `${base}14`, color: base }}>
                                {acc.icon ? <EntityIcon icon={acc.icon} size={15} /> : <FolderOpen className="h-4 w-4" aria-hidden="true" />}
                              </span>
                              <span className="truncate text-sm font-medium text-white">{acc.name}</span>
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                              <Button variant="ghost" size="xs" aria-expanded={iconPickerFor === acc.id} className="rounded-full text-zinc-500 hover:text-white" onClick={() => setIconPickerFor(iconPickerFor === acc.id ? null : acc.id)} disabled={saving === acc.id}>Icon</Button>
                              {acc.color && <Button variant="ghost" size="xs" className="rounded-full text-zinc-500 hover:text-white" onClick={()=>handleAccountColor(acc.id, null)} disabled={saving===acc.id}>Reset</Button>}
                            </div>
                          </div>
                          <div className="mt-2.5 flex flex-wrap items-center gap-2">
                            {palette.map(c=> <Swatch key={c.value} color={c.value} active={acc.color===c.value} onClick={()=>handleAccountColor(acc.id, c.value)} />)}
                            <div className="ml-1 hidden items-center gap-1.5 border-l border-white/[0.08] pl-2.5 sm:flex">
                              {[0,0.18,-0.18,0.32].map((t,i)=> <span key={i} className="h-6 w-6 rounded-full border border-white/10" style={{ background: tintColor(base, t) }} title={`Tint ${t>0?"+":""}${t}`} />)}
                            </div>
                          </div>
                          {iconPickerFor === acc.id && (
                            <IconGrid
                              value={acc.icon}
                              color={base}
                              fallbackLabel="folder"
                              fallback={<FolderOpen className="h-4 w-4" aria-hidden="true" />}
                              onChange={(icon) => { handleAccountIcon(acc.id, icon).catch(() => {}); setIconPickerFor(null); }}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )
              )}

              {colorTab === "providers" && (
                providers.length === 0 ? <p className="mt-3 border-t border-white/[0.05] py-6 text-sm text-zinc-500">No providers yet.</p> : (
                  <div className="mt-3 divide-y divide-white/[0.05] border-t border-white/[0.05]">
                    {sortedProviders.map((pr)=>{
                      const acc = accounts.find(a=>a.id===pr.accountId);
                      const base = resolveProviderColor(pr, providers, accounts, palette);
                      return (
                        <div key={pr.id} className="py-4">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
                              <span className="grid size-7 shrink-0 place-items-center rounded-lg border" style={{ borderColor: `${base}55`, background: `${base}14` }}>
                                {pr.icon ? <EntityIcon icon={pr.icon} size={15} color={base} /> : <BrandIcon provider={pr.name} size={18} />}
                              </span>
                              <span className="truncate text-sm font-medium text-white">{pr.name}</span>
                              <span className="shrink-0 text-[11px] text-zinc-600">{acc?.name ?? "—"}</span>
                            </div>
                            <Button variant="ghost" size="xs" aria-expanded={iconPickerFor === pr.id} className="shrink-0 rounded-full text-zinc-500 hover:text-white" onClick={() => setIconPickerFor(iconPickerFor === pr.id ? null : pr.id)} disabled={saving === pr.id}>Icon</Button>
                          </div>
                          <div className="mt-2.5 flex flex-wrap items-center gap-2">
                            <button type="button" aria-pressed={!pr.color} onClick={()=>handleProviderColor(pr.id, null)} className={`rounded-full border px-3 py-1 text-[11px] transition-colors ${!pr.color ? "border-white/[0.18] bg-white/[0.09] text-white" : "border-white/[0.06] bg-white/[0.03] text-zinc-500 hover:text-zinc-300"}`}>Auto tint</button>
                            {palette.map(c=> <Swatch key={c.value} color={c.value} active={pr.color===c.value} onClick={()=>handleProviderColor(pr.id, c.value)} />)}
                          </div>
                          {iconPickerFor === pr.id && (
                            <IconGrid
                              value={pr.icon}
                              color={base}
                              fallbackLabel="brand mark"
                              fallback={<BrandIcon provider={pr.name} size={16} />}
                              onChange={(icon) => { handleProviderIcon(pr.id, icon).catch(() => {}); setIconPickerFor(null); }}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )
              )}

              {colorTab === "portfolios" && (
                portfolios.length===0 ? <p className="mt-3 border-t border-white/[0.05] py-6 text-sm text-zinc-500">No portfolios yet.</p> : (
                  <div className="mt-3 divide-y divide-white/[0.05] border-t border-white/[0.05]">
                    {sortedPortfolios.map((p)=>{
                      const prov = providers.find(pr=> pr.id===p.providerId);
                      const acc = accounts.find(a=>a.id===p.accountId) ?? (prov ? accounts.find(a=>a.id===prov.accountId) : null);
                      const tinted = resolvePortfolioColor(p, portfolios, providers, accounts, palette);
                      return (
                        <div key={p.id} className="py-4">
                          <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
                            <span className="h-2.5 w-2.5 shrink-0 rounded-full border border-white/20" style={{ background: tinted }} />
                            <span className="truncate text-sm font-medium text-white">{p.name}</span>
                            <span className="shrink-0 text-[10px] uppercase tracking-[0.12em] text-zinc-600">{p.type}</span>
                            <span className="truncate text-[11px] text-zinc-600">{acc?.name ?? "Unassigned"} {prov ? `/ ${prov.name}` : ""}</span>
                          </div>
                          <div className="mt-2.5 flex flex-wrap items-center gap-2">
                            <button type="button" aria-pressed={!p.color} onClick={()=>handlePortfolioColor(p.id, null)} className={`rounded-full border px-3 py-1 text-[11px] transition-colors ${!p.color ? "border-white/[0.18] bg-white/[0.09] text-white" : "border-white/[0.06] bg-white/[0.03] text-zinc-500 hover:text-zinc-300"}`}>Auto tint</button>
                            {palette.map(c=> <Swatch key={c.value} color={c.value} active={p.color===c.value} onClick={()=>handlePortfolioColor(p.id, c.value)} />)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )
              )}
            </div>

            <div className="min-w-0 xl:self-start">
              <AllocationCard
                allocation={allocation}
                mode="account"
                onModeChange={() => {}}
                showModeSelector={false}
                surface="panel"
                emptyMessage="Add holdings to preview account colours"
              />
            </div>
          </div>
        </details>

        <details className="group py-6">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 [&::-webkit-details-marker]:hidden">
            <span className="text-sm font-medium text-white">Sidebar order</span>
            <ChevronDown className="h-4 w-4 shrink-0 text-zinc-500 transition-transform group-open:rotate-180" />
          </summary>
          <div className="pt-3">
            {!hasSwaps ? (
              <p className="text-sm text-zinc-500">Nothing to reorder yet.</p>
            ) : (
              <div className={`grid max-w-3xl items-start gap-x-10 gap-y-4 ${hasAccountSwaps && providerGroups.length ? "lg:grid-cols-2" : ""}`}>
                <p className="text-[11px] text-zinc-600">Drag a row to move it; the arrows appear on hover.</p>

                {hasAccountSwaps && (
                  <div>
                    <p className={LABEL}>Accounts</p>
                    <div className="mt-1">
                      {sortedAccounts.map((acc, i) => (
                        <OrderRow
                          key={acc.id}
                          name={acc.name}
                          color={resolveAccountColor(acc, accounts, palette)}
                          {...orderProps("accounts", "accounts", sortedAccounts, i)}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {providerGroups.length > 0 && (
                  <div>
                    <p className={LABEL}>Providers</p>
                    <div className="mt-1 space-y-2">
                      {providerGroups.map(({ account, items }) => (
                        <div key={account.id}>
                          <p className="px-1 text-[10px] uppercase tracking-[0.12em] text-zinc-600">{account.name}</p>
                          {items.map((pr, i) => (
                            <OrderRow
                              key={pr.id}
                              name={pr.name}
                              color={resolveProviderColor(pr, providers, accounts, palette)}
                              {...orderProps("providers", `providers:${account.id}`, items, i)}
                            />
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {portfolioGroups.length > 0 && (
                  <div>
                    <p className={LABEL}>Portfolios</p>
                    <div className="mt-1 space-y-2">
                      {portfolioGroups.map((group) => (
                        <div key={group.key}>
                          <p className="px-1 text-[10px] uppercase tracking-[0.12em] text-zinc-600">{group.label}</p>
                          {group.items.map((p, i) => (
                            <OrderRow
                              key={p.id}
                              name={p.name}
                              meta={p.type}
                              color={resolvePortfolioColor(p, portfolios, providers, accounts, palette)}
                              {...orderProps("portfolios", group.key, group.items, i)}
                            />
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </details>

        <section aria-labelledby="data-heading" className="py-6">
          <h2 id="data-heading" className="text-sm font-medium text-white">Data &amp; privacy</h2>
          <div className="mt-4 divide-y divide-white/[0.05]">
            <div className="flex flex-col gap-3 py-3.5 first:pt-0 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
              <div>
                <p className="text-sm text-zinc-200">Export workspace</p>
                <p className={ROW_HINT}>Accounts, providers, portfolios and holdings as JSON.</p>
              </div>
              <Button variant="ghost" size="sm" className={ACTION} onClick={exportAll}><Download className="h-4 w-4" /> Export JSON</Button>
            </div>

            <details className="group">
              <summary className="relative flex cursor-pointer list-none items-center justify-between gap-3 py-3.5 [&::-webkit-details-marker]:hidden">
                <div>
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm text-zinc-200">Import CSV</p>
                    <button
                      type="button"
                      aria-expanded={showImportFormat}
                      aria-controls="import-csv-format"
                      aria-label="Show the expected CSV format"
                      title="Expected CSV format"
                      onClick={(event) => { event.preventDefault(); event.stopPropagation(); setShowImportFormat((open) => !open); }}
                      className={`rounded-full p-0.5 transition-colors ${showImportFormat ? "text-white" : "text-zinc-500 hover:text-zinc-200"}`}
                    >
                      <Info className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <p className={ROW_HINT}>Holdings or buy/sell trades into a portfolio.</p>
                </div>
                <ChevronDown className="h-4 w-4 shrink-0 text-zinc-500 transition-transform group-open:rotate-180" />
                {showImportFormat && (
                  <div
                    id="import-csv-format"
                    role="note"
                    onClick={(event) => event.stopPropagation()}
                    className="absolute left-0 top-full z-30 mt-1 w-[min(30rem,calc(100vw-3rem))] rounded-2xl border border-white/[0.1] bg-zinc-950/95 p-3 shadow-2xl backdrop-blur-xl"
                  >
                    <p className="text-[11px] font-medium text-white">Expected CSV format</p>
                    <p className="mt-0.5 text-[10px] leading-snug text-zinc-500">Comma separated with a header row. Column order doesn&apos;t matter, and headers are matched loosely — e.g. Symbol or Ticker, Shares or Qty, AvgPrice or CostBasis.</p>
                    <div className="mt-2.5 space-y-2.5">
                      <CsvFormatBlock
                        label="Holdings"
                        required="Required: Symbol, Shares, AvgPrice. CurrentPrice is optional."
                        sample={"Symbol,Name,Shares,AvgPrice,CurrentPrice,Currency\nAAPL,Apple Inc.,10,150.25,182.40,USD"}
                      />
                      <CsvFormatBlock
                        label="Trades"
                        required="Required: Symbol, Type, Shares, Price. Type is Buy or Sell."
                        sample={"Symbol,Type,Shares,Price,Date,Currency\nAAPL,Buy,5,152.10,2024-03-11,USD"}
                      />
                    </div>
                    <p className="mt-2.5 text-[10px] leading-snug text-zinc-500">Optional columns: Name, Sector, Exchange, Date. Date defaults to today, Currency to GBP.</p>
                  </div>
                )}
              </summary>
              <div className="space-y-2 pb-4">
                <Label htmlFor="import-portfolio" className="sr-only">Import CSV into portfolio</Label>
                <Select value={importPortfolioId} onValueChange={(value) => setImportPortfolioId(value ?? "")}>
                  <SelectTrigger id="import-portfolio" className={FIELD}><span className="flex-1 text-left truncate">{portfolios.find((p) => p.id === importPortfolioId)?.name ?? "Choose portfolio"}</span></SelectTrigger>
                  <SelectContent>{portfolios.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                </Select>
                <input
                  id="import-csv"
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  disabled={importing || !importPortfolioId}
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (!file || !importPortfolioId) return;
                    setImporting(true);
                    try {
                      const text = await file.text();
                      const lines = parseCsv(text);
                      if (lines.length < 2) throw new Error("CSV must contain a header and at least one data row");
                      const headers = lines[0].map((value) => value.toLowerCase().replace(/[^a-z0-9]/g, ""));
                      const index = (...names: string[]) => headers.findIndex((header) => names.includes(header));
                      const field = (row: string[], ...names: string[]) => row[index(...names)]?.trim() ?? "";
                      let imported = 0;
                      for (const [rowIndex, row] of lines.slice(1).entries()) {
                        if (row.every((cell) => !cell.trim())) continue;
                        const type = field(row, "type", "transactiontype").toLowerCase();
                        const symbol = field(row, "symbol", "ticker").toUpperCase();
                        const shares = Number(field(row, "shares", "quantity", "qty"));
                        const date = field(row, "date", "purchasedate", "tradedate") || new Date().toISOString().slice(0, 10);
                        if (!symbol || !Number.isFinite(shares) || shares <= 0) throw new Error(`Row ${rowIndex + 2}: symbol and positive shares/quantity are required`);
                        let response: Response;
                        if (type === "buy" || type === "sell") {
                          const price = Number(field(row, "price", "pricepershare", "unitprice"));
                          if (!Number.isFinite(price) || price <= 0) throw new Error(`Row ${rowIndex + 2}: positive price is required for a trade`);
                          response = await fetch("/api/transactions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ portfolioId: importPortfolioId, symbol, name: field(row, "name", "description") || symbol, type, shares, price, date, currency: field(row, "currency") || "GBP" }) });
                        } else {
                          const avgPrice = Number(field(row, "avgprice", "averageprice", "costbasis", "pricepershare"));
                          const currentPriceRaw = field(row, "currentprice", "marketprice");
                          const currentPrice = currentPriceRaw ? Number(currentPriceRaw) : avgPrice;
                          if (!Number.isFinite(avgPrice) || avgPrice <= 0 || !Number.isFinite(currentPrice) || currentPrice <= 0) throw new Error(`Row ${rowIndex + 2}: positive AvgPrice (and CurrentPrice, if supplied) are required`);
                          response = await fetch("/api/holdings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ portfolioId: importPortfolioId, symbol, name: field(row, "name", "description") || symbol, shares, avgPrice, currentPrice, currency: field(row, "currency") || "GBP", sector: field(row, "sector", "assetclass"), purchaseDate: date, exchange: field(row, "exchange") || undefined }) });
                        }
                        if (!response.ok) throw new Error(`Row ${rowIndex + 2}: ${(await response.text()).slice(0, 240)}`);
                        imported++;
                      }
                      await refreshPortfolios();
                      toast({ title: "CSV import complete", description: `${imported} rows imported into ${portfolios.find((p) => p.id === importPortfolioId)?.name ?? "portfolio"}.`, variant: "success" });
                    } catch (error) {
                      toast({ title: "CSV import stopped", description: error instanceof Error ? error.message : String(error), variant: "error" });
                    } finally { setImporting(false); }
                  }}
                />
                <Button variant="outline" size="sm" className={`${ACTION} w-full border-white/[0.08] bg-white/[0.03]`} disabled={importing || !importPortfolioId} onClick={() => document.getElementById("import-csv")?.click()}><Upload className="h-4 w-4" />{importing ? "Importing…" : "Choose CSV file"}</Button>
                <p className="text-[11px] text-zinc-600">Holdings: Symbol, Name, Shares, AvgPrice, CurrentPrice, Currency. Trades: Symbol, Type, Shares, Price, Date.</p>
              </div>
            </details>

            <div className="flex flex-col gap-3 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
              <div>
                <p className="text-sm text-zinc-200">Demo data</p>
                <p className={ROW_HINT}>{isDemo ? "This workspace is showing the demo dataset." : "Load a complete example workspace."}</p>
              </div>
              {/* eslint-disable-next-line @next/next/no-location-assign-relative-destination */}
              <Button variant="ghost" size="sm" className={ACTION} onClick={()=> { window.location.href="/api/demo"; }} disabled={isDemo}><Upload className="h-4 w-4" /> {isDemo ? "Demo active" : "Load demo data"}</Button>
            </div>

            <details className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-3.5 [&::-webkit-details-marker]:hidden">
                <div>
                  <p className="text-sm font-medium text-red-300">Danger zone</p>
                  <p className="mt-0.5 text-[11px] text-red-300/50">Delete every portfolio and holding.</p>
                </div>
                <ChevronDown className="h-4 w-4 shrink-0 text-red-300/60 transition-transform group-open:rotate-180" />
              </summary>
              <div className="pb-4">
                <p className="text-[11px] text-red-300/70">Accounts and providers remain. This cannot be undone.</p>
                <Button variant="ghost" size="sm" className="mt-2 rounded-full border border-red-500/20 bg-red-500/10 text-red-300 hover:bg-red-500/20" onClick={async()=>{
                  if(!confirm("Delete ALL portfolios?")) return;
                  for(const p of portfolios){ await fetch(`/api/portfolios?id=${p.id}`, { method:"DELETE" }); }
                  location.reload();
                }}><Trash2 className="h-3.5 w-3.5" /> Delete all portfolios</Button>
              </div>
            </details>
          </div>
        </section>

        <PaletteEditor />
      </div>
    </section>
  );
}
