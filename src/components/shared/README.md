# Shared UI primitives

These are the cross-cutting building blocks for the dashboard. Page-level code
should compose these instead of re-declaring the same grid, heading, tone and
dialog markup. Screen-specific composites stay in
`src/components/dashboard/shared/`.

## Layout and metrics

| Component | Use it for |
| --- | --- |
| `PageHeader` | The title row at every level: icon, title, actions, description, mobile metadata. |
| `MetricStrip` / `Metric` / `MetricSkeleton` | The hairline label/caption/value band that leads every dashboard screen. Captions sit under the label and the primary value is bottom-aligned, so numbers line up across columns. Pick a `variant` for the column layout and a `position` for the dividers. |
| `MetricStripSkeleton` | The loading frame for an overview metric band. |
| `SectionHeading` | The heading row above lists, tables and panels (`title`, optional `meta` count, optional `action`, optional divider). |
| `EmptyState` | "Nothing here yet" blocks inside tables and drill-downs. |
| `SignedValue` / `signedTone` | Signed currency or percentage text with the one green/red/neutral rule. |

## Controls

| Component | Use it for |
| --- | --- |
| `SegmentedControl` | Pill switches: chart ranges, allocation modes, settings toggles, colour tabs. |
| `SearchField` | Search input with the shared magnifier and clear button; pass suggestion lists as children. |
| `ProgressBar` / `DistributionBar` | Goal progress and the gaining/falling/unchanged momentum bar. |

## Dialogs and rows

| Component | Use it for |
| --- | --- |
| `DialogActions` | Cancel + primary footer with the saving spinner and disabled state. |
| `NameEditDialog` | Rename dialogs for accounts and providers. |
| `TradeRow` | One buy/sell line in portfolio history, holding detail and the overview feed. |
| `LiveBadge` | The "Live" pill on auto-priced holdings. |
| `dashboard/shared/BreakdownList` | Account/provider breakdown headers and rows. |

## Conventions

- Import through the `@/` alias, never parent-relative paths.
- Pass Tailwind spacing/size overrides through `className`; do not fork a
  component just to move it one pixel.
- Formatting helpers (`fmtGBP`, `fmtPct`, `plural`, `percentOf`, …) live in
  `src/lib/format.ts` so labels and screens agree.
- Interactive primitives that hold state (`NameEditDialog`, `SearchField`,
  `SegmentedControl`, `DialogActions`) are client components; the layout and
  metric primitives are render-only and safe to use from server components.
