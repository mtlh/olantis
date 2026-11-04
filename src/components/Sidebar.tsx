"use client";
import { Portfolio, Account, Provider, Holding, useSettings } from "@/lib/store";
import Link from "next/link";
import { LayoutDashboard, Eye, Target, Plus, FolderOpen, LogOut, Building2, ChevronDown, Clock, Search, MoreVertical, Pencil, Trash2, X, Menu, Briefcase, Layers, Settings, TrendingUp, RefreshCw, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { memo, useState, useMemo, useEffect, useLayoutEffect, useCallback, useRef, useSyncExternalStore, type ReactNode, type PointerEvent as ReactPointerEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent } from "@/components/ui/dropdown-menu";
import { Logo } from "@/components/Logo";
import { BrandIcon } from "@/components/BrandIcon";
import { useToast } from "@/components/ui/toast";
import { Skeleton } from "@/components/ui/skeleton";
import { PALETTE, resolvePortfolioColor } from "@/lib/colors";
import { fmtRelative, holdingValueGBP, fmtPrice, fmtGBP } from "@/lib/format";

interface SearchResult { symbol: string; name: string; exchange: string; price?: number | null; currency?: string | null }

const TOOL_BUTTON_CLASS = "text-zinc-400 hover:text-white";
const TOOL_ICON_CLASS = "w-4 h-4";

// Tree rows use a bare chevron instead of a boxed icon button so the hierarchy
// reads as one calm list rather than a stack of nested controls.
function TreeToggle({ open, onToggle, label, className = "" }: {
  open: boolean;
  onToggle: () => void;
  label: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-label={label}
      className={`grid h-6 w-5 shrink-0 place-items-center rounded text-zinc-500 transition-colors hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30 ${className}`}
    >
      <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${open ? "" : "-rotate-90"}`} strokeWidth={2.25} />
    </button>
  );
}

// A collapsed rail keeps navigation one click away without stealing width from
// the charts. The choice is remembered per device, like the sidebar width.
const SIDEBAR_WIDTH_KEY = "olantis.sidebar-width";
const SIDEBAR_COLLAPSED_KEY = "olantis.sidebar-collapsed";
const SIDEBAR_DEFAULT_WIDTH = 360;
const SIDEBAR_MIN_WIDTH = 280;
const SIDEBAR_MAX_WIDTH = 560;
const SIDEBAR_COLLAPSED_WIDTH = 68;

function clampSidebarWidth(value: number) {
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, Math.round(value)));
}

// A tiny external store so the stored width can be read during hydration without
// a mount effect (and so other tabs on the same device stay in sync).
const sidebarWidthListeners = new Set<() => void>();

function readStoredSidebarWidth() {
  try {
    const stored = Number(window.localStorage.getItem(SIDEBAR_WIDTH_KEY));
    if (Number.isFinite(stored) && stored > 0) {
      // Keep the sidebar from dominating a narrower laptop screen.
      return clampSidebarWidth(Math.min(stored, Math.round(window.innerWidth * 0.45)));
    }
  } catch {
    // Storage can be unavailable (private mode / blocked cookies).
  }
  return SIDEBAR_DEFAULT_WIDTH;
}

function subscribeSidebarWidth(listener: () => void) {
  sidebarWidthListeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    sidebarWidthListeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function writeStoredSidebarWidth(width: number) {
  try {
    window.localStorage.setItem(SIDEBAR_WIDTH_KEY, String(clampSidebarWidth(width)));
  } catch {
    // Resizing still works for this session when storage is unavailable.
  }
  sidebarWidthListeners.forEach((listener) => listener());
}

function useSidebarWidth() {
  const storedWidth = useSyncExternalStore(subscribeSidebarWidth, readStoredSidebarWidth, () => SIDEBAR_DEFAULT_WIDTH);
  const [overrideWidth, setOverrideWidth] = useState<number | null>(null);
  const width = overrideWidth ?? storedWidth;
  const widthRef = useRef(width);

  useEffect(() => {
    widthRef.current = width;
  }, [width]);

  const applyWidth = useCallback((next: number) => {
    const clamped = clampSidebarWidth(next);
    widthRef.current = clamped;
    setOverrideWidth(clamped);
  }, []);

  const persistWidth = useCallback(() => {
    writeStoredSidebarWidth(widthRef.current);
  }, []);

  return { width, widthRef, applyWidth, persistWidth };
}

const sidebarCollapsedListeners = new Set<() => void>();

function readStoredSidebarCollapsed() {
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

function subscribeSidebarCollapsed(listener: () => void) {
  sidebarCollapsedListeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    sidebarCollapsedListeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function writeStoredSidebarCollapsed(collapsed: boolean) {
  try {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? "1" : "0");
  } catch {
    // The toggle still works for this session when storage is unavailable.
  }
  sidebarCollapsedListeners.forEach((listener) => listener());
}

function useSidebarCollapsed() {
  const collapsed = useSyncExternalStore(subscribeSidebarCollapsed, readStoredSidebarCollapsed, () => false);
  const setCollapsed = useCallback((next: boolean) => writeStoredSidebarCollapsed(next), []);
  return { collapsed, setCollapsed };
}

// Tailwind's `xl` breakpoint. The account tree is only mounted in the container
// that is actually visible, so a phone never renders a `display:none` copy.
const DESKTOP_LAYOUT_QUERY = "(min-width: 80rem)";

function subscribeDesktopLayout(listener: () => void) {
  const query = window.matchMedia(DESKTOP_LAYOUT_QUERY);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}

function readDesktopLayout() {
  return window.matchMedia(DESKTOP_LAYOUT_QUERY).matches;
}

function useDesktopLayout() {
  // Assume desktop on the server so the xl layout hydrates without a flash;
  // narrower viewports drop the tree on the first client check.
  return useSyncExternalStore(subscribeDesktopLayout, readDesktopLayout, () => true);
}

type RailTipRow = { label: string; value: string };

// Per-portfolio valuation is recomputed only when the portfolio data or the FX
// rates change, not on every render of the tree.
type PortfolioValuation = { total: number; holdings: Holding[]; values: Map<string, number> };

const EMPTY_VALUATION: PortfolioValuation = { total: 0, holdings: [], values: new Map() };

// Icon-only rows need their detail somewhere. A portal keeps the card clear of
// the sidebar's scroll container, which would otherwise clip it.
function RailTip({ title, subtitle, rows, children }: {
  title: string;
  subtitle?: string;
  rows?: RailTipRow[];
  children: ReactNode;
}) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

  const show = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const width = 232;
    const gap = 10;
    const left = rect.right + gap + width > window.innerWidth - 8
      ? Math.max(8, rect.left - width - gap)
      : rect.right + gap;
    // Estimate the card height so it can be centred on the icon without a
    // transform (transformed fixed layers rasterise badly in some Chromium
    // screenshots and hurt text sharpness).
    const estimatedHeight = 54 + (subtitle ? 16 : 0) + (rows?.length ? 14 + rows.length * 18 : 0);
    const top = Math.min(
      window.innerHeight - estimatedHeight - 8,
      Math.max(8, rect.top + rect.height / 2 - estimatedHeight / 2),
    );
    setCoords({ top, left });
  }, [rows, subtitle]);

  const hide = useCallback(() => setCoords(null), []);

  useEffect(() => {
    if (!coords) return;
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, [coords, hide]);

  return (
    <span
      ref={anchorRef}
      className="mx-auto block w-fit"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocusCapture={show}
      onBlurCapture={hide}
    >
      {children}
      {coords && createPortal(
        <div
          role="tooltip"
          style={{ position: "fixed", top: coords.top, left: coords.left, width: 232 }}
          className="pointer-events-none z-[100] rounded-xl border border-white/10 bg-zinc-900 p-3 text-left shadow-2xl"
        >
          <span aria-hidden className="absolute left-[-5px] top-1/2 h-2 w-2 -translate-y-1/2 rotate-45 border-b border-l border-white/10 bg-zinc-900" />
          <p className="truncate text-xs font-semibold text-zinc-100">{title}</p>
          {subtitle && <p className="mt-0.5 truncate text-[10px] uppercase tracking-[0.12em] text-zinc-500">{subtitle}</p>}
          {!!rows?.length && (
            <div className="mt-2 space-y-1 border-t border-white/[0.06] pt-2">
              {rows.map((row) => (
                <div key={row.label} className="flex items-center justify-between gap-3 text-[11px]">
                  <span className="text-zinc-500">{row.label}</span>
                  <span className="tabular-nums text-zinc-300">{row.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>,
        document.body,
      )}
    </span>
  );
}

function RailButton({ icon, label, subtitle, rows, active, onClick, href, color, level = 0 }: {
  icon: ReactNode;
  label: string;
  subtitle?: string;
  rows?: RailTipRow[];
  active?: boolean;
  onClick?: () => void;
  href?: string;
  color?: string;
  level?: number;
}) {
  const sizeClass = level === 0 ? "h-9 w-9" : level === 1 ? "h-8 w-8" : "h-7 w-7";
  const className = `grid shrink-0 place-items-center rounded-lg border border-transparent text-zinc-400 transition-colors hover:bg-white/[0.07] hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30 ${sizeClass} ${active ? "bg-white/[0.09] text-white" : ""}`;
  const style = { color: color ?? undefined, borderColor: active ? "rgba(255,255,255,0.12)" : "transparent" };

  return (
    <RailTip title={label} subtitle={subtitle} rows={rows}>
      {href ? (
        <Link href={href} onClick={onClick} aria-label={label} aria-current={active ? "page" : undefined} className={className} style={style}>
          {icon}
        </Link>
      ) : (
        <button type="button" onClick={onClick} aria-label={label} aria-pressed={active} className={className} style={style}>
          {icon}
        </button>
      )}
    </RailTip>
  );
}

function SidebarToolRow({ activeId, onSelect, onClose, lastRefreshLabel, isDemo, onRefreshPrices, refreshing, rail = false }: {
  activeId: string | null;
  onSelect: (id: string | null) => void;
  onClose: () => void;
  lastRefreshLabel: string;
  isDemo?: boolean;
  onRefreshPrices?: () => void;
  refreshing?: boolean;
  rail?: boolean;
}) {
  const pathname = usePathname();
  const page = pathname.split("/").filter(Boolean)[0] ?? "dashboard";
  const goDashboard = () => { onSelect(null); onClose(); };
  const navLink = (href: string, label: string, active: boolean, icon: ReactNode, detail: string) => {
    const link = (
      <Link
        href={href}
        onClick={onClose}
        className={buttonVariants({ variant: active ? "secondary" : "ghost", size: "icon-sm", className: TOOL_BUTTON_CLASS })}
        aria-label={label}
        title={rail ? undefined : label}
        aria-current={active ? "page" : undefined}
      >
        {icon}
      </Link>
    );
    return rail ? <RailTip title={label} subtitle={detail}>{link}</RailTip> : link;
  };
  const withTip = (title: string, subtitle: string, node: ReactNode, rows?: RailTipRow[]) => rail
    ? <RailTip title={title} subtitle={subtitle} rows={rows}>{node}</RailTip>
    : node;

  const dashboardButton = page === "dashboard" ? (
    withTip("Dashboard", "Portfolio overview",
      <Button
        variant={activeId === null ? "secondary" : "ghost"}
        size="icon-sm"
        className={TOOL_BUTTON_CLASS}
        onClick={goDashboard}
        aria-label="Dashboard"
        title={rail ? undefined : "Dashboard"}
      >
        <LayoutDashboard className={TOOL_ICON_CLASS} />
      </Button>,
    )
  ) : navLink("/dashboard", "Dashboard", false, <LayoutDashboard className={TOOL_ICON_CLASS} />, "Portfolio overview");

  const clockButton = (
    <div className="group relative">
      <Button
        variant="ghost"
        size="icon-sm"
        className={TOOL_BUTTON_CLASS}
        aria-label={`Prices update daily at 06:00 UTC. Last refresh ${lastRefreshLabel}.`}
      >
        <Clock className={TOOL_ICON_CLASS} />
      </Button>
      {!rail && (
        <div
          role="tooltip"
          className="pointer-events-none absolute bottom-full right-0 z-30 mb-2 w-52 rounded-xl border border-white/10 bg-zinc-900/95 p-3 text-left opacity-0 shadow-xl backdrop-blur transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
        >
          <p className="text-xs font-semibold text-zinc-200">Prices update daily</p>
          <p className="mt-0.5 text-[11px] text-zinc-500">Scheduled for 06:00 UTC</p>
          <div className="mt-2 flex items-center justify-between border-t border-white/[0.06] pt-2 text-[11px]">
            <span className="text-zinc-600">Last refresh</span>
            <span className="tabular-nums text-zinc-300">{lastRefreshLabel}</span>
          </div>
        </div>
      )}
    </div>
  );

  const refreshButton = onRefreshPrices && (
    <Button
      variant="ghost"
      size="icon-sm"
      className={TOOL_BUTTON_CLASS}
      onClick={onRefreshPrices}
      disabled={refreshing}
      aria-label="Refresh prices"
      title={rail ? undefined : "Refresh prices"}
    >
      <RefreshCw className={`${TOOL_ICON_CLASS} ${refreshing ? "animate-spin" : ""}`} />
    </Button>
  );

  const signOutLink = (
    <a
      href={isDemo ? "/api/demo?clear=1" : "/logout"}
      className={buttonVariants({ variant: "ghost", size: "icon-sm", className: isDemo ? "text-amber-400 hover:text-amber-300" : TOOL_BUTTON_CLASS })}
      aria-label={isDemo ? "Exit demo" : "Sign out"}
      title={rail ? undefined : isDemo ? "Exit demo" : "Sign out"}
    >
      <LogOut className={TOOL_ICON_CLASS} />
    </a>
  );

  if (rail) {
    return (
      <div className="border-t p-2" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
        <div className="flex flex-col items-center gap-1">
          {dashboardButton}
          {navLink("/performance", "Performance", page === "performance", <TrendingUp className={TOOL_ICON_CLASS} />, "Growth over time")}
          {navLink("/watchlist", "Watchlist", page === "watchlist", <Eye className={TOOL_ICON_CLASS} />, "Markets you follow")}
          {navLink("/goals", "Goals", page === "goals", <Target className={TOOL_ICON_CLASS} />, "Savings targets")}
          {navLink("/settings", "Settings", page === "settings", <Settings className={TOOL_ICON_CLASS} />, "Preferences")}
          <div className="my-1 h-px w-6 bg-white/10" />
          {withTip("Prices update daily", "Scheduled for 06:00 UTC", clockButton, [{ label: "Last refresh", value: lastRefreshLabel }])}
          {refreshButton && withTip("Refresh prices", "Pull the latest quotes", refreshButton)}
          {withTip(isDemo ? "Exit demo" : "Sign out", isDemo ? "Return to the landing page" : "End your session", signOutLink)}
        </div>
      </div>
    );
  }

  return (
    <div className="border-t p-2" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
      <div className="flex items-center gap-1">
        {page === "dashboard" ? (
          dashboardButton
        ) : navLink("/dashboard", "Dashboard", false, <LayoutDashboard className={TOOL_ICON_CLASS} />, "Portfolio overview")}
        {navLink("/performance", "Performance", page === "performance", <TrendingUp className={TOOL_ICON_CLASS} />, "Growth over time")}
        {navLink("/watchlist", "Watchlist", page === "watchlist", <Eye className={TOOL_ICON_CLASS} />, "Markets you follow")}
        {navLink("/goals", "Goals", page === "goals", <Target className={TOOL_ICON_CLASS} />, "Savings targets")}
        {navLink("/settings", "Settings", page === "settings", <Settings className={TOOL_ICON_CLASS} />, "Preferences")}

        <div className="ml-auto flex items-center gap-1">
          {clockButton}
          {refreshButton}
          {signOutLink}
        </div>
      </div>
    </div>
  );
}

export const Sidebar = memo(function Sidebar({ accounts, providers, portfolios, holdings, activeId, activeHoldingId, activeProviderId, activeAccountId, onSelect, onSelectProvider, onSelectAccount, onSelectHolding, onCreateAccount, onCreateProvider, onOpenWizard, onRefresh, onRefreshPrices, refreshing, isDemo, accountsReady, portfoliosReady, onRenameAccount, onRenameProvider, onRenamePortfolio, onDeleteAccount, onDeleteProvider, onDeletePortfolio }: {
  accounts: Account[]; providers: Provider[]; portfolios: Portfolio[]; holdings?: Holding[]; activeId: string | null; activeHoldingId?: string | null; activeProviderId?: string | null; activeAccountId?: string | null; onSelect: (id: string | null) => void; onSelectProvider?: (id: string) => void; onSelectAccount?: (id: string) => void; onSelectHolding?: (h: Holding) => void;
  onCreateAccount: (name: string) => void | Promise<void>;
  onCreateProvider?: (name: string, accountId: string) => Promise<void>;
  onOpenWizard: (accountId: string | null, providerId?: string | null) => void;
  onRefresh?: () => Promise<void>;
  onRefreshPrices?: () => void;
  refreshing?: boolean;
  isDemo?: boolean; accountsReady?: boolean; portfoliosReady?: boolean;
  onRenameAccount?: (id: string, name: string) => Promise<void>;
  onRenameProvider?: (id: string, name: string) => Promise<void>;
  onRenamePortfolio?: (id: string, patch: { name?: string; type?: string; accountId?: string | null; providerId?: string | null }) => Promise<void>;
  onDeleteAccount?: (a: Account) => void;
  onDeleteProvider?: (p: Provider) => void;
  onDeletePortfolio?: (p: Portfolio) => void;
}) {
  const { toast } = useToast();
  const [showAccountDialog, setShowAccountDialog] = useState(false);
  const [accountName, setAccountName] = useState("");
  const [accountError, setAccountError] = useState("");
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [editAccountName, setEditAccountName] = useState("");
  const [editingPortfolio, setEditingPortfolio] = useState<Portfolio | null>(null);
  const [editPName, setEditPName] = useState("");
  const [editPType, setEditPType] = useState<"live"|"manual">("live");
  const [editPAccount, setEditPAccount] = useState<string>("__none");
  const [editPProvider, setEditPProvider] = useState<string>("__none");
  const [showProviderDialog, setShowProviderDialog] = useState(false);
  const [providerAccountId, setProviderAccountId] = useState<string | null>(null);
  const [providerName, setProviderName] = useState("");
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null);
  const [editProviderName, setEditProviderName] = useState("");
  const [showDirectHolding, setShowDirectHolding] = useState(false);
  const [directTarget, setDirectTarget] = useState<{ accountId?: string | null; providerId?: string | null } | null>(null);
  const [directForm, setDirectForm] = useState({ symbol: "", name: "", shares: "", avgPrice: "", exchange: "", currentPrice: "", currency: "GBP" });
  const { settings } = useSettings();
  const fxRates = settings.fxRates;
  const blankDirectForm = () => ({ symbol: "", name: "", shares: "", avgPrice: "", exchange: "", currentPrice: "", currency: settings.currency || "GBP" });
  const [editingDirectId, setEditingDirectId] = useState<string | null>(null);
  const [directSaving, setDirectSaving] = useState(false);
  const [directSearchResults, setDirectSearchResults] = useState<SearchResult[]>([]);
  const [directShowMenu, setDirectShowMenu] = useState(false);
  const [directQuery, setDirectQuery] = useState("");
  const [expandedPortfolio, setExpandedPortfolio] = useState<Record<string, boolean>>({});
  const [q, setQ] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const mobileMenuTriggerRef = useRef<HTMLButtonElement>(null);
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);

  const closeMobileMenu = useCallback(() => setMobileOpen(false), []);

  const [resizingSidebar, setResizingSidebar] = useState(false);
  const { width: sidebarWidth, widthRef: sidebarWidthRef, applyWidth: applySidebarWidth, persistWidth: persistSidebarWidth } = useSidebarWidth();
  const { collapsed: sidebarCollapsed, setCollapsed: setSidebarCollapsed } = useSidebarCollapsed();
  const desktopLayout = useDesktopLayout();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const focusSearchOnExpandRef = useRef(false);
  const resizePointerIdRef = useRef<number | null>(null);
  const asideRef = useRef<HTMLElement>(null);

  const toggleSidebar = () => setSidebarCollapsed(!sidebarCollapsed);
  const expandSearch = () => {
    focusSearchOnExpandRef.current = true;
    setSidebarCollapsed(false);
  };

  useEffect(() => {
    if (sidebarCollapsed || !focusSearchOnExpandRef.current) return;
    focusSearchOnExpandRef.current = false;
    const frame = window.requestAnimationFrame(() => searchInputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [sidebarCollapsed]);

  useEffect(() => {
    if (!resizingSidebar) return;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
    };
  }, [resizingSidebar]);

  const startSidebarResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    resizePointerIdRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    setResizingSidebar(true);
  };

  const moveSidebarResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (resizePointerIdRef.current !== event.pointerId) return;
    // Pointer samples arrive far faster than React can paint, and each state
    // write here would re-render the whole sidebar and remeasure every chart
    // inside the main column. The width goes straight to the element instead;
    // state and storage catch up once the drag ends.
    const next = clampSidebarWidth(event.clientX);
    if (next === sidebarWidthRef.current) return;
    sidebarWidthRef.current = next;
    const aside = asideRef.current;
    if (aside) aside.style.width = `${next}px`;
  };

  const commitSidebarWidth = () => {
    applySidebarWidth(sidebarWidthRef.current);
    persistSidebarWidth();
  };

  const endSidebarResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (resizePointerIdRef.current === null) return;
    resizePointerIdRef.current = null;
    setResizingSidebar(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    commitSidebarWidth();
  };

  // An unrelated render mid-drag would put the last committed width back on the
  // aside, so replay the in-flight one before the frame paints.
  useLayoutEffect(() => {
    if (resizePointerIdRef.current === null) return;
    const aside = asideRef.current;
    if (aside) aside.style.width = `${sidebarWidthRef.current}px`;
  });

  const handleSidebarResizeKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 48 : 16;
    let next: number | null = null;
    if (event.key === "ArrowLeft") next = sidebarWidthRef.current - step;
    else if (event.key === "ArrowRight") next = sidebarWidthRef.current + step;
    else if (event.key === "Home") next = SIDEBAR_MIN_WIDTH;
    else if (event.key === "End") next = SIDEBAR_MAX_WIDTH;
    if (next === null) return;
    event.preventDefault();
    applySidebarWidth(next);
    persistSidebarWidth();
  };

  const resetSidebarWidth = () => {
    applySidebarWidth(SIDEBAR_DEFAULT_WIDTH);
    persistSidebarWidth();
  };

  useEffect(() => {
    if (!mobileOpen) return;
    const menu = mobileMenuRef.current;
    const trigger = mobileMenuTriggerRef.current;
    const getFocusableItems = () => Array.from(
      menu?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? [],
    ).filter((element) => element.getClientRects().length > 0);
    const handleKeyDown = (event: KeyboardEvent) => {
      // Let any form dialog opened from the menu handle its own Escape and Tab keys.
      if (document.querySelector('[data-slot="dialog-content"]')) return;

      if (event.key === "Escape") {
        event.preventDefault();
        setMobileOpen(false);
        return;
      }

      if (event.key !== "Tab") return;
      const focusableItems = getFocusableItems();
      const first = focusableItems[0];
      const last = focusableItems.at(-1);
      const activeElement = document.activeElement;

      if (!first || !last) {
        event.preventDefault();
        menu?.focus();
      } else if (event.shiftKey && (activeElement === first || !menu?.contains(activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (activeElement === last || !menu?.contains(activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };

    menu?.querySelector<HTMLElement>('[aria-label="Close menu"]')?.focus();
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      trigger?.focus();
    };
  }, [mobileOpen]);

  const sortByOrder = <T extends { sortOrder?: number | null }>(list: T[]): T[] => [...list].sort((a, b) => (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999));

  const directHoldings = useMemo(() => holdings ?? [], [holdings]);
  const unassigned = useMemo(()=> sortByOrder(portfolios.filter(p=> !p.accountId && !p.providerId)), [portfolios]);

  const providerById = useMemo(() => new Map(providers.map((provider) => [provider.id, provider])), [providers]);
  const accountById = useMemo(() => new Map(accounts.map((account) => [account.id, account])), [accounts]);
  // Portfolios and direct stocks inherit their account from their provider when
  // one is set, so the sidebar groups them under the same account card.
  const accountIdForPortfolio = useCallback((portfolio: Portfolio) => {
    if (portfolio.providerId) return providerById.get(portfolio.providerId)?.accountId ?? portfolio.accountId ?? null;
    return portfolio.accountId ?? null;
  }, [providerById]);
  const accountIdForHolding = useCallback((holding: Holding) => {
    if (holding.providerId) return providerById.get(holding.providerId)?.accountId ?? holding.accountId ?? null;
    return holding.accountId ?? null;
  }, [providerById]);

  const portfolioValuations = useMemo(() => {
    const valuations = new Map<string, PortfolioValuation>();
    for (const portfolio of portfolios) {
      const values = new Map<string, number>();
      const ordered: { holding: Holding; value: number }[] = [];
      let total = 0;
      for (const holding of portfolio.holdings) {
        const value = holdingValueGBP(holding, fxRates);
        values.set(holding.id, value);
        total += value;
        ordered.push({ holding, value });
      }
      ordered.sort((a, b) => b.value - a.value);
      valuations.set(portfolio.id, { total, holdings: ordered.map((entry) => entry.holding), values });
    }
    return valuations;
  }, [portfolios, fxRates]);

  const valuationFor = (portfolio: Portfolio) => portfolioValuations.get(portfolio.id) ?? EMPTY_VALUATION;

  const searchTerm = q.trim().toLowerCase();
  const matchesHolding = (holding: Holding) => holding.symbol.toLowerCase().includes(searchTerm) || holding.name.toLowerCase().includes(searchTerm);
  const matchesPortfolio = (portfolio: Portfolio) => {
    if (portfolio.name.toLowerCase().includes(searchTerm) || portfolio.holdings.some(matchesHolding)) return true;
    if (!searchTerm) return true;
    const providerName = portfolio.providerId ? providerById.get(portfolio.providerId)?.name ?? "" : "";
    const accountId = accountIdForPortfolio(portfolio);
    const accountName = accountId ? accountById.get(accountId)?.name ?? "" : "";
    return providerName.toLowerCase().includes(searchTerm) || accountName.toLowerCase().includes(searchTerm);
  };
  const filteredAccounts = sortByOrder(accounts.filter((account) => {
    if (!searchTerm || account.name.toLowerCase().includes(searchTerm)) return true;
    return portfolios.some((portfolio) => accountIdForPortfolio(portfolio) === account.id && matchesPortfolio(portfolio))
      || directHoldings.some((holding) => accountIdForHolding(holding) === account.id && matchesHolding(holding));
  }));
  const filteredPortfolios = (list: Portfolio[], showAll = false) => sortByOrder(list.filter((portfolio) => !searchTerm || showAll || matchesPortfolio(portfolio)));
  const accountIndex = useMemo(() => new Map(accounts.map((a, i) => [a.id, i])), [accounts]);
  const accountTotalsById = useMemo(() => {
    const totals = new Map<string, number>(accounts.map((account) => [account.id, 0]));
    for (const portfolio of portfolios) {
      const accountId = accountIdForPortfolio(portfolio);
      if (!accountId || !totals.has(accountId)) continue;
      totals.set(accountId, (totals.get(accountId) ?? 0) + (portfolioValuations.get(portfolio.id)?.total ?? 0));
    }
    for (const holding of directHoldings) {
      if (holding.portfolioId) continue;
      const accountId = accountIdForHolding(holding);
      if (!accountId || !totals.has(accountId)) continue;
      totals.set(accountId, (totals.get(accountId) ?? 0) + holdingValueGBP(holding, fxRates));
    }
    return totals;
  }, [accounts, accountIdForHolding, accountIdForPortfolio, directHoldings, fxRates, portfolioValuations, portfolios]);
  const accColorFor = (acc: Account) => acc.color || PALETTE[(accountIndex.get(acc.id) ?? 0) % PALETTE.length].value;

  const togglePortfolio = (id: string) => setExpandedPortfolio((e) => ({ ...e, [id]: !e[id] }));
  const openWizard = (accountId: string | null = null, providerId: string | null = null) => { onOpenWizard(accountId, providerId); setMobileOpen(false); };
  const validateName = (n: string) => n.trim().length >= 2 ? "" : "Min 2 characters";

  const portfolioContext = (portfolio: Portfolio) => {
    const providerName = portfolio.providerId ? providerById.get(portfolio.providerId)?.name : null;
    if (providerName) return providerName;
    return portfolio.accountId ? "Direct portfolio" : "Unassigned";
  };

  const renderPortfolioItem = (portfolio: Portfolio) => {
    const { total, holdings: holdingsInValueOrder, values } = valuationFor(portfolio);
    const portfolioColor = resolvePortfolioColor(portfolio, portfolios, providers, accounts);
    const providerName = portfolio.providerId ? providerById.get(portfolio.providerId)?.name ?? null : null;
    const isActive = activeId === portfolio.id;
    const selectedHolding = holdingsInValueOrder.some((holding) => holding.id === activeHoldingId);
    const searchMatchesHolding = !!searchTerm && holdingsInValueOrder.some(matchesHolding);
    const isOpen = expandedPortfolio[portfolio.id] ?? (isActive || selectedHolding || searchMatchesHolding);
    return (
      <div key={portfolio.id}>
        <div className={`group/portfolio flex items-center gap-1.5 rounded-lg py-1.5 pl-1 pr-2 transition-colors ${isActive ? "bg-white/[0.07]" : "hover:bg-white/[0.035]"}`}>
          <TreeToggle
            open={isOpen}
            onToggle={() => togglePortfolio(portfolio.id)}
            label={`${isOpen ? "Collapse" : "Expand"} ${portfolio.name}`}
          />
          {providerName
            ? <BrandIcon provider={providerName} size={22} />
            : <Layers className="h-3.5 w-3.5 shrink-0" style={{ color: portfolioColor }} />}
          <div className="min-w-0 flex-1">
            <button
              type="button"
              aria-pressed={isActive}
              onClick={() => { onSelect(portfolio.id); setMobileOpen(false); }}
              className={`block w-full truncate rounded text-left text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30 ${isActive ? "text-white" : "text-zinc-200"}`}
            >
              {portfolio.name}
            </button>
            {providerName ? (
              <button type="button" onClick={() => { onSelectProvider?.(portfolio.providerId!); setMobileOpen(false); }} className="mt-0.5 block max-w-full truncate rounded text-left text-[10px] text-zinc-500 transition-colors hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30">
                {providerName}
              </button>
            ) : (
              <span className="mt-0.5 block truncate text-[10px] text-zinc-500">{portfolio.accountId ? "Direct portfolio" : "Unassigned"}</span>
            )}
          </div>
          <span className="shrink-0 rounded-full border border-white/[0.06] px-1.5 py-px text-[9px] font-medium uppercase tracking-[0.08em] text-zinc-500">{portfolio.type}</span>
          <span className="shrink-0 pl-1 text-xs tabular-nums text-zinc-400">{fmtGBP(total)}</span>
          {editMode && (
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="ghost" size="icon-xs" aria-label={`${portfolio.name} actions`} className="text-zinc-500 hover:text-white"><MoreVertical className="h-3 w-3" /></Button>} />
              <DropdownMenuContent className="border-white/10 bg-zinc-900 text-white">
                <DropdownMenuItem onClick={() => { setEditingPortfolio(portfolio); setEditPName(portfolio.name); setEditPType(portfolio.type); setEditPAccount(portfolio.accountId ?? "__none"); setEditPProvider(portfolio.providerId ?? "__none"); }}><Pencil className="h-3 w-3" />Edit</DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onClick={() => onDeletePortfolio?.(portfolio)}><Trash2 className="h-3 w-3" />Delete</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        {isOpen && (
          <div className="ml-[2.375rem] border-l border-white/[0.06] pb-1.5 pl-2 pr-1">
            {holdingsInValueOrder.length ? holdingsInValueOrder.map((holding) => {
              const holdingValue = values.get(holding.id) ?? 0;
              const allocation = total > 0 ? holdingValue / total * 100 : 0;
              const isHoldingActive = holding.id === activeHoldingId;
              return (
                <button key={holding.id} type="button" onClick={() => { onSelectHolding?.(holding); setMobileOpen(false); }} aria-current={isHoldingActive ? "page" : undefined} className={`flex w-full min-w-0 items-center gap-2 rounded-md px-1.5 py-1.5 text-left transition-colors ${isHoldingActive ? "bg-white/[0.08]" : "hover:bg-white/[0.045]"}`}>
                  <BrandIcon symbol={holding.symbol} name={holding.name} exchange={holding.exchange} size={22} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[11px] font-medium text-zinc-200">{holding.symbol}</span>
                    <span className="block truncate text-[9px] text-zinc-600">{holding.name}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-[10px] font-medium tabular-nums text-zinc-300">{allocation.toFixed(1)}%</span>
                    <span className="block text-[9px] tabular-nums text-zinc-600">{fmtGBP(holdingValue)}</span>
                  </span>
                </button>
              );
            }) : <p className="px-1.5 py-1.5 text-[10px] text-zinc-600">No holdings yet.</p>}
          </div>
        )}
      </div>
    );
  };

  const handleCreateAccount = async () => {
    const err = validateName(accountName);
    if (err) { setAccountError(err); return; }
    setSaving(true);
    try { await onCreateAccount(accountName.trim()); setAccountName(""); setShowAccountDialog(false); toast({ title: "Account created", description: accountName.trim(), variant: "success" }); } catch (e: unknown){ const msg = e instanceof Error ? e.message : String(e); toast({title:"Failed to create account",description:msg,variant:"error"});} finally{setSaving(false);}
  };
  const handleRenameAccount = async () => {
    if (!editingAccount) return;
    const err = validateName(editAccountName);
    if (err) return toast({title:err,variant:"error"});
    setSaving(true);
    try { await onRenameAccount?.(editingAccount.id, editAccountName.trim()); setEditingAccount(null); toast({title:"Account renamed",variant:"success"});} catch(e: unknown){ const msg = e instanceof Error ? e.message : String(e); toast({title:"Rename failed",description:msg,variant:"error"});} finally{setSaving(false);}
  };
  const handleCreateProvider = async () => {
    if(!providerAccountId) return toast({title:"Select account",variant:"error"});
    const err = validateName(providerName);
    if(err) return toast({title:err,variant:"error"});
    setSaving(true);
    try{ await onCreateProvider?.(providerName.trim(), providerAccountId); setShowProviderDialog(false); setProviderName(""); toast({title:"Provider created",variant:"success"});} catch(e: unknown){ const msg = e instanceof Error ? e.message : String(e); toast({title:"Create failed",description:msg,variant:"error"});} finally{setSaving(false);}
  };
  const handleRenameProvider = async () => {
    if(!editingProvider) return;
    const err=validateName(editProviderName);
    if(err) return toast({title:err,variant:"error"});
    setSaving(true);
    try{ await onRenameProvider?.(editingProvider.id, editProviderName.trim()); setEditingProvider(null); toast({title:"Provider renamed",variant:"success"});} catch(e: unknown){ const msg = e instanceof Error ? e.message : String(e); toast({title:"Rename failed",description:msg,variant:"error"});} finally{setSaving(false);}
  };
  const handleEditPortfolio = async () => {
    if (!editingPortfolio) return;
    const err = validateName(editPName);
    if (err) return toast({title:err,variant:"error"});
    setSaving(true);
    try { await onRenamePortfolio?.(editingPortfolio.id, { name: editPName.trim(), type: editPType, accountId: editPAccount==="__none"?null:editPAccount, providerId: editPProvider==="__none"?null:editPProvider }); setEditingPortfolio(null); toast({title:"Portfolio updated",variant:"success"});} catch(e: unknown){ const msg = e instanceof Error ? e.message : String(e); toast({title:"Update failed",description:msg,variant:"error"});} finally{setSaving(false);}
  };
  const handleCreateDirectHolding = async () => {
    if(!directTarget && !editingDirectId) return;
    if(!directForm.symbol.trim() || !directForm.shares || !directForm.avgPrice) return toast({title:"Fill symbol, shares & price", variant:"error"});
    const isEdit = !!editingDirectId;
    const target = directTarget ?? { accountId: null, providerId: null };
    const payload: {
      symbol: string; name: string; shares: number; avgPrice: number;
      currentPrice: number; currency: string; exchange: string | undefined;
      purchaseDate: string; id?: string | null;
      accountId?: string | null; providerId?: string | null;
    } = {
      symbol: directForm.symbol.toUpperCase().trim(),
      name: directForm.name.trim() || directForm.symbol.toUpperCase().trim(),
      shares: Number(directForm.shares),
      avgPrice: Number(directForm.avgPrice),
      currentPrice: Number(directForm.currentPrice || directForm.avgPrice),
      currency: directForm.currency || "GBP",
      exchange: directForm.exchange || undefined,
      purchaseDate: new Date().toISOString().split("T")[0],
    };
    if (isEdit) payload.id = editingDirectId;
    else {
      payload.accountId = target.accountId ?? null;
      payload.providerId = target.providerId ?? null;
    }
    setDirectSaving(true);
    try {
      const res = await fetch("/api/holdings", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(payload) });
      if(!res.ok) throw new Error(await res.text());
      await onRefresh?.();
      setShowDirectHolding(false); setDirectForm(blankDirectForm()); setDirectSearchResults([]); setEditingDirectId(null);
      toast({title: isEdit ? "Stock updated" : "Stock added", description: directForm.symbol.toUpperCase(), variant:"success"});
    } catch(e: unknown){ const msg = e instanceof Error ? e.message : String(e); toast({title:"Failed", description:msg, variant:"error"}); } finally{ setDirectSaving(false); }
  };
  const openDirectEdit = (h:Holding) => {
    setDirectTarget({ accountId: h.accountId ?? null, providerId: h.providerId ?? null });
    setDirectForm({ symbol: h.symbol, name: h.name, shares: String(h.shares), avgPrice: String(h.avgPrice), exchange: h.exchange ?? "", currentPrice: String(h.currentPrice ?? h.avgPrice), currency: h.currency ?? "GBP" });
    setEditingDirectId(h.id);
    setShowDirectHolding(true);
  };

  const allHoldings = useMemo(() => portfolios.flatMap((p) => p.holdings), [portfolios]);
  const lastRefresh = useMemo(() => { const ts = allHoldings.map((h) => h.lastRefreshedAt ?? 0).filter(Boolean) as number[]; return ts.length ? Math.max(...ts) : null; }, [allHoldings]);
  const loading = accountsReady===false || portfoliosReady===false;

  useEffect(() => {
    const v = directQuery.trim();
    if (v.length < 2) return;
    let stale = false;
    const t = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(v)}`)
        .then(r => r.json())
        .then(j => {
          if (stale) return;
          setDirectSearchResults(Array.isArray(j) ? j : []);
          setDirectShowMenu(true);
        })
        .catch(() => {});
    }, 320);
    return () => { stale = true; clearTimeout(t); };
  }, [directQuery]);


  const renderRailTree = () => {
    if (loading) {
      return (
        <div className="space-y-2 pt-1">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="mx-auto h-9 w-9 rounded-lg bg-white/5" />)}
        </div>
      );
    }

    const railPortfolios = sortByOrder(filteredPortfolios(portfolios));
    const railDirectHoldings = directHoldings.filter((holding) => !holding.portfolioId && (!searchTerm || matchesHolding(holding)));
    if (railPortfolios.length === 0 && railDirectHoldings.length === 0) {
      const hasAccounts = accounts.length > 0;
      return (
        <div className="pt-1">
          <RailButton
            icon={<Plus className="h-4 w-4" />}
            label={hasAccounts ? "New portfolio" : "New account"}
            subtitle={hasAccounts ? "No portfolios yet" : "No accounts yet"}
            rows={[{ label: "Next", value: "Create one" }]}
            onClick={() => hasAccounts ? openWizard(accounts[0]?.id ?? null) : setShowAccountDialog(true)}
          />
        </div>
      );
    }

    return (
      <div className="space-y-1 pt-1">
        {railPortfolios.map((portfolio) => (
          <RailButton
            key={portfolio.id}
            icon={portfolio.providerId && providerById.get(portfolio.providerId)?.name
              ? <BrandIcon provider={providerById.get(portfolio.providerId)!.name} size={22} />
              : <Layers className="h-[17px] w-[17px]" />}
            label={portfolio.name}
            subtitle={portfolioContext(portfolio)}
            rows={[
              { label: "Value", value: fmtGBP(valuationFor(portfolio).total) },
              { label: "Holdings", value: String(portfolio.holdings.length) },
              { label: "Type", value: portfolio.type },
            ]}
            active={activeId === portfolio.id}
            color={resolvePortfolioColor(portfolio, portfolios, providers, accounts)}
            onClick={() => { onSelect(portfolio.id); setMobileOpen(false); }}
          />
        ))}
        {railDirectHoldings.map((holding) => (
          <RailButton
            key={holding.id}
            icon={<BrandIcon symbol={holding.symbol} name={holding.name} exchange={holding.exchange} size={22} />}
            label={holding.symbol}
            subtitle={holding.name}
            rows={[
              { label: "Shares", value: holding.shares.toLocaleString("en-GB", { maximumFractionDigits: 4 }) },
              { label: "Value", value: fmtGBP(holdingValueGBP(holding, settings.fxRates)) },
            ]}
            active={activeHoldingId === holding.id}
            onClick={() => { onSelectHolding?.(holding); setMobileOpen(false); }}
          />
        ))}
      </div>
    );
  };

  const renderSidebar = (rail: boolean, isDesktop = true) => (
    <>
      <div className="px-5 py-5 border-b flex items-center justify-between xl:hidden" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
        <Logo size={36} />
        <Button variant="ghost" size="icon" className="xl:hidden !size-11" aria-label="Close menu" onClick={()=>setMobileOpen(false)}><X className="w-4 h-4"/></Button>
      </div>
      <nav className={`flex-1 overflow-y-auto ${rail ? "p-2 xl:pt-4" : "p-3 xl:pt-5"}`}>
        {rail ? (
          <div className="flex flex-col items-center gap-1.5">
            <RailTip title="Expand sidebar" subtitle="Show account tree">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={toggleSidebar}
                aria-label="Expand sidebar"
                aria-expanded={false}
                className="text-zinc-500 hover:text-white"
              >
                <PanelLeftOpen className="h-4 w-4" />
              </Button>
            </RailTip>
            <RailTip title="Search" subtitle="Portfolios & holdings">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={expandSearch}
                aria-label="Search portfolios and holdings"
                className="text-zinc-500 hover:text-white"
              >
                <Search className="h-4 w-4" />
              </Button>
            </RailTip>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            {isDesktop && (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={toggleSidebar}
                aria-label="Collapse sidebar"
                aria-expanded
                title="Collapse sidebar"
                className="shrink-0 text-zinc-500 hover:text-white"
              >
                <PanelLeftClose className="h-4 w-4" />
              </Button>
            )}
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500"/>
              <Input ref={searchInputRef} value={q} onChange={e=>setQ(e.target.value)} placeholder="Search portfolios & holdings…" aria-label="Search portfolios and holdings" className="pl-8 h-9 bg-white/[0.04] border-white/10 text-xs"/>
              {q && <button onClick={()=>setQ("")} aria-label="Clear account search" className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"><X className="w-3.5 h-3.5"/></button>}
            </div>
          </div>
        )}

        {rail ? <div className="mt-3">{renderRailTree()}</div> : (
        <div className="mt-3">
          <div className="flex items-center justify-between px-1 mb-2">
            <span className="text-[10px] font-semibold tracking-[0.14em] uppercase text-zinc-500">Portfolios</span>
            <div className="flex items-center gap-0.5">
              <Button variant="ghost" size="icon-sm" onClick={() => setEditMode(v => !v)} aria-pressed={editMode} aria-label="Toggle edit mode" title={editMode ? "Hide edit controls" : "Show edit controls"} className={editMode ? "bg-white/10 text-white hover:bg-white/15" : "text-zinc-500 hover:text-zinc-200"}><Pencil className="w-3.5 h-3.5" /></Button>
              <DropdownMenu>
                <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Create new" title="Create new" className="text-zinc-500 hover:text-zinc-200"><Plus className="w-4 h-4" /></Button>} />
                <DropdownMenuContent align="end" className="min-w-56 bg-zinc-900 border-white/10 text-white">
                  <DropdownMenuItem onClick={() => setShowAccountDialog(true)}>
                    <Building2 className="w-3.5 h-3.5"/> Account
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={accounts.length === 0}
                    onClick={() => {
                      const targetAccount = activeAccountId ?? accounts[0]?.id;
                      if (!targetAccount) return;
                      setProviderAccountId(targetAccount);
                      setProviderName("");
                      setShowProviderDialog(true);
                    }}
                  >
                    <Briefcase className="w-3.5 h-3.5"/> Provider
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => openWizard(activeAccountId ?? null, activeProviderId ?? null)}>
                    <Layers className="w-3.5 h-3.5"/> Portfolio
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => { setDirectTarget({ accountId: activeAccountId ?? null, providerId: activeProviderId ?? null }); setDirectForm(blankDirectForm()); setEditingDirectId(null); setDirectShowMenu(false); setShowDirectHolding(true); }}>
                    <TrendingUp className="w-3.5 h-3.5"/> Stock
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {loading ? <div className="space-y-3">{[1,2].map(i=><Skeleton key={i} className="h-20 rounded-xl bg-white/5"/>)}</div>
          : accounts.length === 0 && unassigned.length === 0 ? <Card className="p-6 text-center border-dashed bg-white/[0.02]"><p className="text-sm text-zinc-500">No portfolios yet</p><p className="text-xs text-zinc-600 mt-1">Create an account to start tracking portfolios</p><Button size="sm" className="mt-3" onClick={()=>setShowAccountDialog(true)}><Plus className="w-3.5 h-3.5"/>New account</Button></Card>
          : (
          <div className="space-y-3">
            {filteredAccounts.map((acc) => {
              const accountNameMatches = !searchTerm || acc.name.toLowerCase().includes(searchTerm);
              const total = accountTotalsById.get(acc.id) ?? 0;
              const accountActive = activeAccountId === acc.id;
              const accColor = accColorFor(acc);
              const accountProviders = providers.filter((provider) => provider.accountId === acc.id);
              const accountPortfolios = filteredPortfolios(
                portfolios.filter((portfolio) => accountIdForPortfolio(portfolio) === acc.id),
                accountNameMatches,
              );
              const accountDirectHoldings = directHoldings.filter((holding) =>
                !holding.portfolioId
                && accountIdForHolding(holding) === acc.id
                && (accountNameMatches || matchesHolding(holding)));
              return (
                <div key={acc.id} className={`group overflow-hidden rounded-2xl border transition-colors ${accountActive ? "ring-1 ring-white/10" : ""}`} style={{ borderColor: accountActive ? `${accColor}90` : `${accColor}38`, background: accountActive ? `${accColor}18` : `${accColor}0d` }}>
                  <div className="flex items-center gap-2 px-3 py-2.5">
                    <button type="button" aria-pressed={accountActive} onClick={() => { onSelectAccount?.(acc.id); setMobileOpen(false); }} className="flex min-w-0 flex-1 items-center gap-2 rounded text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30">
                      <FolderOpen className="h-4 w-4 shrink-0" style={{ color: accColor }} />
                      <span className={`truncate text-sm font-semibold ${accountActive ? "text-white" : "text-zinc-100"}`}>{acc.name}</span>
                    </button>
                    <span className="shrink-0 text-sm font-medium tabular-nums text-zinc-300">{fmtGBP(total)}</span>
                    {editMode && (
                    <DropdownMenu>
                      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-xs" aria-label="Account actions" className="text-zinc-500 hover:text-white"><MoreVertical className="w-3.5 h-3.5"/></Button>} />
                      <DropdownMenuContent className="bg-zinc-900 border-white/10 text-white min-w-40">
                        <DropdownMenuItem onClick={()=>{ setEditingAccount(acc); setEditAccountName(acc.name); }}><Pencil className="w-3.5 h-3.5"/>Rename account</DropdownMenuItem>
                        <DropdownMenuItem onClick={()=>{ setProviderAccountId(acc.id); setProviderName(""); setShowProviderDialog(true); }}><Briefcase className="w-3.5 h-3.5"/>New provider</DropdownMenuItem>
                        {accountProviders.length > 0 && (
                          <DropdownMenuSub>
                            <DropdownMenuSubTrigger><Briefcase className="w-3.5 h-3.5"/>Providers</DropdownMenuSubTrigger>
                            <DropdownMenuSubContent className="bg-zinc-900 border-white/10 text-white">
                              {accountProviders.map((provider) => (
                                <DropdownMenuItem key={provider.id} onClick={() => onSelectProvider?.(provider.id)}>{provider.name}</DropdownMenuItem>
                              ))}
                              <DropdownMenuSeparator className="bg-white/10"/>
                              {accountProviders.map((provider) => (
                                <DropdownMenuItem key={`delete-${provider.id}`} variant="destructive" onClick={() => onDeleteProvider?.(provider)}><Trash2 className="w-3.5 h-3.5"/>Delete {provider.name}</DropdownMenuItem>
                              ))}
                            </DropdownMenuSubContent>
                          </DropdownMenuSub>
                        )}
                        <DropdownMenuItem onClick={()=>{ setDirectTarget({accountId: acc.id}); setDirectForm(blankDirectForm()); setEditingDirectId(null); setDirectShowMenu(false); setShowDirectHolding(true); }}><TrendingUp className="w-3.5 h-3.5"/>Add stock directly</DropdownMenuItem>
                        <DropdownMenuItem onClick={()=>openWizard(acc.id, null)}><Layers className="w-3.5 h-3.5"/>New portfolio</DropdownMenuItem>
                        <DropdownMenuSeparator className="bg-white/10"/>
                        <DropdownMenuItem variant="destructive" onClick={()=> onDeleteAccount?.(acc)}><Trash2 className="w-3.5 h-3.5"/>Delete account</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    )}
                  </div>

                  {accountPortfolios.length === 0 && accountDirectHoldings.length === 0 ? (
                    <div className="px-3 pb-3">
                      <div className="flex items-center justify-between rounded-lg border border-dashed border-white/10 px-3 py-2">
                        <span className="text-[11px] text-zinc-600">No portfolios</span>
                        <Button variant="link" size="xs" className="h-auto p-0 text-[11px] text-zinc-400 hover:text-white" onClick={()=>openWizard(acc.id, null)}>Add</Button>
                      </div>
                    </div>
                  ) : (
                    <div className="ml-3 mr-1 space-y-0.5 pb-2">
                      {accountPortfolios.map((portfolio) => renderPortfolioItem(portfolio))}

                      {accountDirectHoldings.length > 0 && (
                        <div className="mt-1 border-t border-white/[0.05] pt-1.5">
                          <div className="px-1.5 pb-0.5 text-[9px] uppercase tracking-[0.12em] text-zinc-600">Direct</div>
                          {accountDirectHoldings.map((h: Holding) => (
                            <div key={h.id} className={`flex items-center gap-2 rounded-md px-1.5 py-1.5 text-xs transition-colors ${onSelectHolding ? "cursor-pointer hover:bg-white/[0.035]" : ""}`} onClick={() => onSelectHolding?.(h)}>
                              <BrandIcon symbol={h.symbol} name={h.name} exchange={h.exchange} size={22} />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-[11px] font-medium text-zinc-200">{h.symbol}</span>
                                <span className="block truncate text-[9px] text-zinc-600">{h.providerId ? providerById.get(h.providerId)?.name ?? "Direct holding" : "Direct holding"}</span>
                              </span>
                              <span className="shrink-0 text-[10px] tabular-nums text-zinc-400">{fmtGBP(holdingValueGBP(h, settings.fxRates))}</span>
                              {editMode && (
                              <>
                                <Button variant="ghost" size="icon-xs" className="relative z-10 h-6 w-6 text-zinc-500 hover:text-white" aria-label={`Edit ${h.symbol}`} onClick={(e)=>{ e.stopPropagation(); openDirectEdit(h); }}><Pencil className="w-3 h-3"/></Button>
                                <Button variant="ghost" size="icon-xs" className="relative z-10 h-6 w-6 text-zinc-500 hover:text-red-400" aria-label={`Remove ${h.symbol}`} onClick={(e)=>{ e.stopPropagation(); fetch(`/api/holdings?id=${h.id}`,{method:"DELETE"}).then(()=>{ onRefresh?.(); toast({title:"Stock removed", variant:"success"}); }); }}><Trash2 className="w-3 h-3"/></Button>
                              </>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {unassigned.length > 0 && (
              <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] overflow-hidden">
                <div className="px-3 py-2 flex items-center justify-between">
                  <span className="text-[11px] font-semibold tracking-widest uppercase text-zinc-600">Unassigned</span>
                  <Button variant="ghost" size="icon-xs" onClick={() => openWizard(null)} aria-label="New portfolio"><Plus className="w-3.5 h-3.5" /></Button>
                </div>
                <div className="px-2 pb-2 space-y-1">
                  {filteredPortfolios(unassigned).map((p) => renderPortfolioItem(p))}
                </div>
              </div>
            )}
          </div>
          )}
        </div>
        )}

      </nav>
      <SidebarToolRow
        activeId={activeId}
        onSelect={onSelect}
        onClose={closeMobileMenu}
        lastRefreshLabel={lastRefresh ? fmtRelative(lastRefresh, settings.dateFormat) : "—"}
        isDemo={isDemo}
        onRefreshPrices={onRefreshPrices}
        refreshing={refreshing}
        rail={rail}
      />

      <Dialog open={showAccountDialog} onOpenChange={setShowAccountDialog}>
        <DialogContent className="bg-zinc-900 border-white/10 text-white">
          <DialogHeader><DialogTitle>New account</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Account name</Label><Input value={accountName} onChange={(e) => { setAccountName(e.target.value); setAccountError(""); }} placeholder="e.g. Household, Personal" autoFocus onKeyDown={e=>e.key==="Enter"&&handleCreateAccount()} aria-invalid={!!accountError}/>{accountError && <p className="text-xs text-red-400">{accountError}</p>}</div>
            <p className="text-xs text-zinc-500">Top level — holds providers. e.g. Household, Joint.</p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowAccountDialog(false)}>Cancel</Button>
              <Button onClick={handleCreateAccount} disabled={!accountName.trim() || saving}>{saving?"Creating…":"Create account"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showProviderDialog} onOpenChange={setShowProviderDialog}>
        <DialogContent className="bg-zinc-900 border-white/10 text-white">
          <DialogHeader><DialogTitle>New provider</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Provider name</Label><Input value={providerName} onChange={e=>setProviderName(e.target.value)} placeholder="e.g. Vanguard, Hargreaves Lansdown, Trading 212" autoFocus /></div>
            <div className="space-y-2"><Label>Account</Label>
              <Select value={providerAccountId ?? "__none"} onValueChange={v=>setProviderAccountId(v==="__none"?null:v)}>
                <SelectTrigger><span className="flex-1 text-left truncate">{providerAccountId ? accounts.find(a=>a.id===providerAccountId)?.name ?? "—" : "Select account"}</span></SelectTrigger>
                <SelectContent>
                  {accounts.map(a=> <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={()=>setShowProviderDialog(false)}>Cancel</Button>
              <Button onClick={handleCreateProvider} disabled={!providerName.trim() || !providerAccountId || saving}>{saving?"Creating…":"Create provider"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingAccount} onOpenChange={o=>!o&&setEditingAccount(null)}>
        <DialogContent className="bg-zinc-900 border-white/10 text-white">
          <DialogHeader><DialogTitle>Rename account</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Name</Label><Input value={editAccountName} onChange={e=>setEditAccountName(e.target.value)} autoFocus onKeyDown={e=>e.key==="Enter"&&handleRenameAccount()} placeholder="Account name"/></div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={()=>setEditingAccount(null)}>Cancel</Button>
              <Button onClick={handleRenameAccount} disabled={saving || !editAccountName.trim()}>{saving?"Saving…":"Save"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingProvider} onOpenChange={o=>!o&&setEditingProvider(null)}>
        <DialogContent className="bg-zinc-900 border-white/10 text-white">
          <DialogHeader><DialogTitle>Rename provider</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Name</Label><Input value={editProviderName} onChange={e=>setEditProviderName(e.target.value)} autoFocus /></div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={()=>setEditingProvider(null)}>Cancel</Button>
              <Button onClick={handleRenameProvider} disabled={saving || !editProviderName.trim()}>{saving?"Saving…":"Save"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showDirectHolding} onOpenChange={setShowDirectHolding}>
        <DialogContent className="bg-zinc-900 border-white/10 text-white sm:max-w-md">
          <DialogHeader><DialogTitle>Add stock directly — {directTarget?.providerId ? providers.find(p=>p.id===directTarget.providerId)?.name : accounts.find(a=>a.id===directTarget?.accountId)?.name ?? "—"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Symbol *</Label>
              <div className="relative">
                <Input value={directForm.symbol} onChange={e=>{ const v=e.target.value.toUpperCase(); setDirectForm({...directForm, symbol:v}); setDirectQuery(v); if(v.trim().length<2){ setDirectSearchResults([]); setDirectShowMenu(false);} }} placeholder="AAPL or Apple" autoComplete="off" />
                {directShowMenu && directSearchResults.length>0 && (
                  <div className="absolute z-50 mt-1 w-full rounded-xl border border-white/10 bg-zinc-900 shadow-xl max-h-48 overflow-auto">
                    {directSearchResults.map((r:SearchResult)=>(
                      <button key={r.symbol+r.exchange} type="button" onMouseDown={(e)=>{e.preventDefault(); setDirectForm({...directForm, symbol:r.symbol, name:r.name, exchange:r.exchange, currentPrice: r.price ? String(r.price) : directForm.currentPrice, currency: r.currency ?? directForm.currency}); setDirectShowMenu(false);}} className="w-full text-left px-3 py-2 hover:bg-white/5 flex items-center justify-between gap-2">
                        <div><div className="text-sm text-white">{r.symbol} <span className="text-xs text-zinc-500">{r.exchange}</span>{r.price!=null && <span className="text-xs text-emerald-400 ml-1">{r.currency==="GBX"||r.currency==="GBp" ? `${Math.round(r.price).toLocaleString("en-GB")}p` : `£${Number(r.price).toFixed(2)}`}</span>}</div><div className="text-xs text-zinc-500 truncate">{r.name}</div></div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-2"><Label>Name</Label><Input value={directForm.name} onChange={e=>setDirectForm({...directForm, name:e.target.value})} placeholder="Apple Inc" /></div>
            <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2">
              <div className="space-y-2"><Label>Shares *</Label><Input type="number" value={directForm.shares} onChange={e=>setDirectForm({...directForm, shares:e.target.value})} placeholder="10" /></div>
              <div className="space-y-2"><Label>Avg price *</Label><Input type="number" value={directForm.avgPrice} onChange={e=>setDirectForm({...directForm, avgPrice:e.target.value})} placeholder="150" /></div>
            </div>
            <div className="space-y-2">
              <Label>Current price <span className="text-zinc-500 font-normal">(live)</span></Label>
              <div className="h-10 rounded-lg bg-white/5 border border-white/10 px-3 flex items-center text-sm text-zinc-300">
                {directForm.currentPrice ? fmtPrice(Number(directForm.currentPrice), directForm.currency) : "— auto-filled from Yahoo"}
                <span className="ml-auto text-xs text-zinc-600">read-only</span>
              </div>
              <p className="text-xs text-zinc-600">Helps calculate gain; avg cost is what you paid</p>
            </div>
            <div className="space-y-2"><Label>Exchange</Label>
              <Select value={directForm.exchange || "__auto"} onValueChange={v=> setDirectForm({...directForm, exchange: (v as string)==="__auto" ? "" : (v as string)})}>
                <SelectTrigger><span className="flex-1 text-left truncate text-sm">{directForm.exchange || "Auto"}</span></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__auto">Auto</SelectItem>
                  <SelectItem value="NASDAQ">NASDAQ</SelectItem>
                  <SelectItem value="NYSE">NYSE</SelectItem>
                  <SelectItem value="AMEX">AMEX</SelectItem>
                  <SelectItem value="LSE">LSE</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={()=> setShowDirectHolding(false)}>Cancel</Button>
              <Button onClick={handleCreateDirectHolding} disabled={directSaving} className="bg-white text-black hover:bg-zinc-100">{directSaving?"Adding...":"Add stock"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingPortfolio} onOpenChange={o=>!o&&setEditingPortfolio(null)}>
        <DialogContent className="bg-zinc-900 border-white/10 text-white sm:max-w-md">
          <DialogHeader><DialogTitle>Edit portfolio</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Name</Label><Input value={editPName} onChange={e=>setEditPName(e.target.value)} autoFocus/></div>
            <div className="space-y-2"><Label>Type</Label>
              <Select value={editPType} onValueChange={v=>setEditPType(v as "live"|"manual")}>
                <SelectTrigger><span className="flex-1 text-left truncate">{editPType==="live"?"Live — auto prices":"Manual — cash/custom"}</span></SelectTrigger>
                <SelectContent><SelectItem value="live">Live — auto prices</SelectItem><SelectItem value="manual">Manual — pension/cash</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Account</Label>
              <Select value={editPAccount} onValueChange={(v)=>{setEditPAccount(v as string); setEditPProvider("__none");}}>
                <SelectTrigger><span className="flex-1 text-left truncate">{editPAccount === "__none" ? "Unassigned" : accounts.find((a)=>a.id===editPAccount)?.name ?? "—"}</span></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Unassigned</SelectItem>
                  {accounts.map(a=> <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Provider</Label>
              <Select value={editPProvider} onValueChange={v=>setEditPProvider(v as string)} disabled={editPAccount==="__none"}>
                <SelectTrigger><span className="flex-1 text-left truncate">{editPProvider==="__none" ? "No provider" : providers.find(p=>p.id===editPProvider)?.name ?? "—"}</span></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">No provider</SelectItem>
                  {providers.filter(pr=> pr.accountId===editPAccount).map(pr=> <SelectItem key={pr.id} value={pr.id}>{pr.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={()=>setEditingPortfolio(null)}>Cancel</Button>
              <Button onClick={handleEditPortfolio} disabled={saving || !editPName.trim()}>{saving?"Saving…":"Save changes"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );

  return (
    <>
      <Button ref={mobileMenuTriggerRef} variant="ghost" size="icon" className="xl:hidden fixed top-3 left-3 z-40 !size-11 bg-black/70 backdrop-blur border border-white/10" onClick={()=>setMobileOpen(true)} aria-label="Open menu" aria-expanded={mobileOpen}><Menu className="w-4 h-4"/></Button>
      <aside
        ref={asideRef}
        className="hidden xl:flex relative shrink-0 flex-col h-screen sticky top-0 border-r bg-black"
        style={{ width: sidebarCollapsed ? SIDEBAR_COLLAPSED_WIDTH : sidebarWidth, borderColor: "rgba(255,255,255,0.07)" }}
      >
        {desktopLayout ? (
          <>
            {renderSidebar(sidebarCollapsed)}
            {!sidebarCollapsed && (
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize sidebar"
              aria-valuemin={SIDEBAR_MIN_WIDTH}
              aria-valuemax={SIDEBAR_MAX_WIDTH}
              aria-valuenow={sidebarWidth}
              tabIndex={0}
              title="Drag to resize · double-click to reset"
              onPointerDown={startSidebarResize}
              onPointerMove={moveSidebarResize}
              onPointerUp={endSidebarResize}
              onPointerCancel={endSidebarResize}
              onLostPointerCapture={endSidebarResize}
              onKeyDown={handleSidebarResizeKeyDown}
              onDoubleClick={resetSidebarWidth}
              className="group absolute inset-y-0 right-0 z-30 flex w-2 cursor-col-resize touch-none select-none items-center justify-center focus-visible:outline-none"
            >
              <span
                aria-hidden
                className={`h-full w-px transition-colors duration-150 ${
                  resizingSidebar ? "bg-white/45" : "bg-transparent group-hover:bg-white/20 group-focus-visible:bg-white/45"
                }`}
              />
            </div>
            )}
          </>
        ) : null}
      </aside>
      {mobileOpen && !desktopLayout && (
        <div ref={mobileMenuRef} className="fixed inset-0 z-50 xl:hidden flex" role="dialog" aria-modal="true" aria-label="Navigation menu" tabIndex={-1}>
          <div className="w-[85vw] max-w-[380px] bg-black border-r border-white/10 flex flex-col h-full overflow-hidden">{renderSidebar(false, false)}</div>
          <div className="flex-1 bg-black/60 backdrop-blur-sm" onClick={()=>setMobileOpen(false)}/>
        </div>
      )}
    </>
  );
});
