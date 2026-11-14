import type { ReactNode } from "react";
import { Move, Plus, Trash2 } from "lucide-react";
import { DashboardLevel } from "@/components/dashboard/shared/DashboardLevel";
import { ProviderIcon } from "@/components/BrandIcon";
import { Metric, MetricStrip } from "@/components/shared/MetricStrip";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import type { Account, Portfolio, Provider } from "@/lib/store";
import { fmtGBP, fmtPct, fmtRelative } from "@/lib/format";

type PortfolioDashboardProps = {
  portfolio: Portfolio;
  accounts: Account[];
  providers: Provider[];
  dateFormat: string;
  value: number;
  cost: number;
  gain: number;
  gainPct: number;
  staleCount: number;
  onBack: () => void;
  onMove: () => void;
  onAddHolding: () => void;
  onDelete: () => void;
  children: ReactNode;
};

export function PortfolioDashboard({
  portfolio,
  accounts,
  providers,
  dateFormat,
  value,
  cost,
  gain,
  gainPct,
  staleCount,
  onBack,
  onMove,
  onAddHolding,
  onDelete,
  children,
}: PortfolioDashboardProps) {
  const parentName = portfolio.providerId
    ? providers.find((provider) => provider.id === portfolio.providerId)?.name
    : portfolio.accountId ? accounts.find((account) => account.id === portfolio.accountId)?.name : null;
  const provider = portfolio.providerId
    ? providers.find((item) => item.id === portfolio.providerId) ?? null
    : null;
  const backLabel = parentName ?? "Overview";
  const holdingCount = portfolio.holdings.length;
  const latestRefresh = Math.max(...portfolio.holdings.map((holding) => holding.lastRefreshedAt ?? 0), 0) || null;
  const gainTone = gain >= 0 ? "text-emerald-400" : "text-red-400";

  return (
    <DashboardLevel label={`${portfolio.name} portfolio`}>
      <PageHeader
        back={{ label: backLabel, onClick: onBack }}
        icon={provider && <ProviderIcon provider={provider} size={28} />}
        title={portfolio.name}
        titleAdornment={portfolio.accountId && (
          <span className="text-[11px] text-zinc-600">
            {accounts.find((account) => account.id === portfolio.accountId)?.name ?? ""}
          </span>
        )}
        actions={
          <>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Move portfolio"
              title="Move portfolio"
              className="rounded-full text-zinc-400 hover:bg-white/[0.05] hover:text-white"
              onClick={onMove}
            >
              <Move className="h-4 w-4" />
            </Button>
            <Button size="sm" className="rounded-full bg-white px-3.5 text-black hover:bg-zinc-200" onClick={onAddHolding}>
              <Plus className="h-3.5 w-3.5" />
              Add holding
            </Button>
            <Button
              variant="ghost"
              size="sm"
              aria-label="Delete portfolio"
              className="rounded-full px-2.5 text-zinc-500 hover:bg-red-500/10 hover:text-red-400 sm:px-3"
              onClick={onDelete}
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Delete</span>
            </Button>
          </>
        }
      />

      <MetricStrip variant="portfolio" className="mt-6">
        <Metric
          wide
          size="hero"
          position="first"
          label="Total value"
          value={fmtGBP(value)}
          sub={`Cost basis ${fmtGBP(cost)}`}
        />

        <Metric
          position="middle"
          label="Unrealized gain"
          tone={gainTone}
          value={
            <>
              {gain >= 0 ? "+" : "−"}{fmtGBP(Math.abs(gain))}
              <span className="ml-1.5 text-[11px] font-normal opacity-70 sm:text-xs">{fmtPct(gainPct)}</span>
            </>
          }
          sub="Current positions"
        />

        <Metric
          position="last"
          label="Holdings"
          value={holdingCount}
          sub={
            <>
              Updated {fmtRelative(latestRefresh, dateFormat)}
              {staleCount > 0 && <span className="text-amber-300/80"> · {staleCount} stale</span>}
            </>
          }
        />
      </MetricStrip>

      {children}
    </DashboardLevel>
  );
}
