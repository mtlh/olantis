/**
 * Custom dashboards are user-built layouts: a name plus an ordered list of
 * widgets. The catalogue here is shared by the API (validation), the store
 * (types), the creator dialog (labels) and the renderer, so a widget can never
 * exist in one place and be unknown to another.
 */

export const DASHBOARD_WIDGET_TYPES = [
  "overview",
  "chart",
  "allocation",
  "accounts",
  "holdings",
  "goal",
  "freshness",
  "trades",
  "insights",
] as const;

export type DashboardWidgetType = (typeof DASHBOARD_WIDGET_TYPES)[number];
export type DashboardWidgetSize = "half" | "full";

export type DashboardWidget = {
  id: string;
  type: DashboardWidgetType;
  size: DashboardWidgetSize;
};

export type DashboardWidgetDefinition = {
  type: DashboardWidgetType;
  label: string;
  description: string;
  /** Size a newly added widget starts with. Full-width widgets are charts and feeds. */
  defaultSize: DashboardWidgetSize;
};

export const DASHBOARD_WIDGETS: readonly DashboardWidgetDefinition[] = [
  { type: "overview", label: "At a glance", description: "Total value, cost basis, gain and the change over your range.", defaultSize: "full" },
  { type: "chart", label: "Value over time", description: "Workspace history with range controls and trade markers.", defaultSize: "full" },
  { type: "allocation", label: "Allocation", description: "Split by holding, account or sector.", defaultSize: "half" },
  { type: "accounts", label: "Accounts & providers", description: "Every account with its providers, portfolios and balance.", defaultSize: "full" },
  { type: "holdings", label: "Top holdings", description: "Your largest positions by current value.", defaultSize: "half" },
  { type: "goal", label: "Goal progress", description: "Progress toward your next savings target.", defaultSize: "half" },
  { type: "freshness", label: "Price freshness", description: "Which quotes are stale, and when they last updated.", defaultSize: "half" },
  { type: "trades", label: "Recent trades", description: "The latest buys and sells across the workspace.", defaultSize: "full" },
  { type: "insights", label: "Positions", description: "Momentum, your largest position and this period's movers.", defaultSize: "full" },
];

const WIDGET_BY_TYPE = new Map(DASHBOARD_WIDGET_TYPES.map((type) => [
  type,
  DASHBOARD_WIDGETS.find((definition) => definition.type === type) ?? DASHBOARD_WIDGETS[0],
]));

export const DASHBOARD_NAME_MIN = 2;
export const DASHBOARD_NAME_MAX = 40;
/** A dashboard longer than this stops being a dashboard and becomes a page of cards. */
export const DASHBOARD_WIDGET_LIMIT = 12;

const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

export function isDashboardWidgetType(value: unknown): value is DashboardWidgetType {
  return typeof value === "string" && (DASHBOARD_WIDGET_TYPES as readonly string[]).includes(value);
}

export function dashboardWidgetDefinition(type: DashboardWidgetType): DashboardWidgetDefinition {
  return WIDGET_BY_TYPE.get(type) ?? DASHBOARD_WIDGETS[0];
}

function newWidgetId(): string {
  return crypto.randomUUID();
}

export function createDashboardWidget(type: DashboardWidgetType, size?: DashboardWidgetSize): DashboardWidget {
  return { id: newWidgetId(), type, size: size ?? dashboardWidgetDefinition(type).defaultSize };
}

/** The layout a new dashboard starts from, so creating one is never a blank page. */
export function defaultDashboardWidgets(): DashboardWidget[] {
  return (["overview", "chart", "allocation", "holdings"] as const).map((type) => createDashboardWidget(type));
}

/** Trims and collapses whitespace; null when the name is outside the allowed length. */
export function normalizeDashboardName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim().replace(/\s+/g, " ");
  if (name.length < DASHBOARD_NAME_MIN || name.length > DASHBOARD_NAME_MAX) return null;
  return name;
}

/** Only accepts a plain hex tint, so the value is safe to place in a style attribute. */
export function normalizeDashboardColor(value: unknown): string | null {
  return typeof value === "string" && HEX_COLOR_PATTERN.test(value) ? value.toLowerCase() : null;
}

/**
 * Validates a layout coming from a client. Returns null for anything malformed
 * rather than silently dropping widgets: a dashboard that quietly loses a card
 * is worse than an error the caller can show.
 *
 * A missing widget id is generated, and a duplicate id is replaced, so a layout
 * built by hand or by an older client still renders with stable React keys.
 */
export function parseDashboardWidgets(value: unknown): DashboardWidget[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > DASHBOARD_WIDGET_LIMIT) return null;

  const seenTypes = new Set<DashboardWidgetType>();
  const seenIds = new Set<string>();
  const widgets: DashboardWidget[] = [];

  for (const entry of value) {
    if (!entry || typeof entry !== "object") return null;
    const record = entry as { id?: unknown; type?: unknown; size?: unknown };
    if (!isDashboardWidgetType(record.type) || seenTypes.has(record.type)) return null;
    seenTypes.add(record.type);

    const definition = dashboardWidgetDefinition(record.type);
    const size = record.size === undefined ? definition.defaultSize : record.size;
    if (size !== "half" && size !== "full") return null;

    const rawId = record.id;
    const id = typeof rawId === "string" && rawId.length > 0 && rawId.length <= 64 && !seenIds.has(rawId)
      ? rawId
      : newWidgetId();
    seenIds.add(id);
    widgets.push({ id, type: record.type, size });
  }

  return widgets;
}
