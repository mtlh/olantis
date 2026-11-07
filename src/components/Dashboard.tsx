"use client";
import { usePortfolios, useSnapshots, useAccounts, useTransactions, useProviders, useHoldings, useSettings, useWorkspaceBootstrap } from "@/lib/store";
import type { Account, Holding, Portfolio, Provider } from "@/lib/store";
import { Sidebar } from "./Sidebar";
import { useMemo, useState, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Plus, AlertTriangle } from "lucide-react";
import dynamic from "next/dynamic";
import { MainDashboard } from "@/components/dashboard/MainDashboard";
import { PortfolioDashboard } from "@/components/dashboard/PortfolioDashboard";
import { HoldingsTable } from "@/components/dashboard/HoldingsTable";
import { useAccountProviderDashboardData } from "@/components/dashboard/useAccountProviderDashboardData";
import { useBrandIconWarmup } from "@/components/useBrandIconWarmup";
import { usePortfolioOverviewInsights } from "@/components/dashboard/usePortfolioOverviewInsights";
import { ValueTimeChart } from "@/components/dashboard/ValueTimeChart";
import { useStaleHoldings } from "@/components/dashboard/useStaleHoldings";
import { useDashboardChartData } from "@/components/dashboard/useDashboardChartData";
import { AccountBreakdownCard } from "@/components/dashboard/AccountBreakdownCard";
import { DashboardGoalCard } from "@/components/dashboard/DashboardGoalCard";
import { PortfolioInsightsSection } from "@/components/dashboard/PortfolioInsightsSection";
import { PriceFreshnessCard } from "@/components/dashboard/PriceFreshnessCard";
import { PortfolioTradeHistory } from "@/components/dashboard/PortfolioTradeHistory";
import { usePortfolioAllocation, type AllocationMode } from "@/components/dashboard/usePortfolioAllocation";
import { useHoldingViewData } from "@/components/dashboard/useHoldingViewData";
import { EMPTY_SELECTION, useDashboardSelection } from "@/components/dashboard/useDashboardSelection";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

import { resolvePortfolioColor } from "@/lib/colors";
import { fmtPrice, holdingValueGBP, holdingCostGBP, isListedSymbol, todayISODate, valueChangeOverRange } from "@/lib/format";
import { AllocationCard } from "@/components/dashboard/shared/AllocationCard";
import type { ChartRange } from "@/components/dashboard/shared/ChartRangeSelector";
import type { HoldingFormData } from "@/components/dashboard/HoldingDialog";
import { Skeleton } from "@/components/ui/skeleton";

// Sections and dialogs that are not part of the default dashboard view each get
// their own chunk, so the first paint of a workspace route never parses views it
// does not show. The placeholders copy each section's stable frame (heading,
// hairlines, card edges) so a late chunk cannot move what is already on screen.
const SettingsView = dynamic(() => import("@/components/Settings").then((module) => module.SettingsView), { loading: () => <SettingsFallback /> });
// Only one dashboard level renders at a time, so the account, provider and
// holding trees (and the performance page) are split out of the overview chunk
// and loaded when the user actually opens them.
const PerformanceChart = dynamic(() => import("@/components/dashboard/PerformanceChart").then((module) => module.PerformanceChart), { loading: () => <PerformanceFallback /> });
const IndividualDashboard = dynamic(() => import("@/components/dashboard/IndividualDashboard").then((module) => module.IndividualDashboard), { loading: () => <StockFallback /> });
const AccountDashboard = dynamic(() => import("@/components/dashboard/AccountDashboard").then((module) => module.AccountDashboard), { loading: () => <ViewFallback /> });
const ProviderDashboard = dynamic(() => import("@/components/dashboard/ProviderDashboard").then((module) => module.ProviderDashboard), { loading: () => <ViewFallback /> });
const WatchlistPanel = dynamic(() => import("@/components/WatchlistPanel").then((module) => module.WatchlistPanel), { loading: () => <WatchlistFallback /> });
const GoalPanel = dynamic(() => import("@/components/GoalPanel").then((module) => module.GoalPanel), { loading: () => <GoalsFallback /> });
const CreatePortfolioWizard = dynamic(() => import("@/components/CreatePortfolioWizard").then((module) => module.CreatePortfolioWizard), { ssr: false, loading: () => <WizardFallback /> });
const HoldingDialog = dynamic(() => import("@/components/dashboard/HoldingDialog").then((module) => module.HoldingDialog), { ssr: false });
const TradeDialog = dynamic(() => import("@/components/TradeDialog").then((module) => module.TradeDialog), { ssr: false });
const AssignHoldingDialog = dynamic(() => import("@/components/dashboard/AssignHoldingDialog").then((module) => module.AssignHoldingDialog), { ssr: false });
const EditPortfolioDialog = dynamic(() => import("@/components/dashboard/EditPortfolioDialog").then((module) => module.EditPortfolioDialog), { ssr: false });
const DeleteConfirmationDialog = dynamic(() => import("@/components/dashboard/shared/DeleteConfirmationDialog").then((module) => module.DeleteConfirmationDialog), { ssr: false });

// Shared metric-band frame: every dashboard level leads with a label/value/sub
// strip between hairlines, so one placeholder covers the overview, account,
// provider and performance headers.
function MetricStripSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-8 border-y border-white/[0.06] py-6 sm:gap-x-10 lg:grid-cols-[1.3fr_1fr_1fr_0.75fr] lg:gap-0 lg:py-7">
      <div className="col-span-2 lg:col-span-1 lg:pr-8">
        <Skeleton className="h-2.5 w-20 bg-white/[0.05]" />
        <Skeleton className="mt-2 h-[38px] w-28 bg-white/[0.09] sm:h-[42px]" />
        <Skeleton className="mt-2 h-2.5 w-24 bg-white/[0.04]" />
      </div>
      {[1, 2, 3].map((index) => (
        <div key={index} className={index === 3 ? "hidden lg:block lg:border-l lg:border-white/[0.06] lg:pl-8" : "lg:border-l lg:border-white/[0.06] lg:px-8"}>
          <Skeleton className="h-2.5 w-20 bg-white/[0.05]" />
          <Skeleton className="mt-2 h-7 w-20 bg-white/[0.05] sm:h-8" />
          <Skeleton className="mt-2 h-2.5 w-16 bg-white/[0.04]" />
        </div>
      ))}
    </div>
  );
}

// Account and provider drill-downs: back link + title/actions, the metric band,
// a chart/allocation row and the providers/portfolios tree.
function ViewFallback() {
  return (
    <div className="space-y-6" aria-busy="true">
      <div>
        <Skeleton className="h-4 w-24 bg-white/[0.04]" />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          <Skeleton className="h-7 w-48 bg-white/[0.09]" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-7 w-16 rounded-full bg-white/[0.05]" />
            <Skeleton className="h-7 w-32 rounded-full bg-white/[0.08]" />
            <Skeleton className="h-7 w-20 rounded-full bg-white/[0.05]" />
          </div>
        </div>
        <Skeleton className="mt-2 h-4 w-56 bg-white/[0.05]" />
      </div>

      <MetricStripSkeleton />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Skeleton className="h-[400px] rounded-[1.25rem] bg-white/[0.03] lg:col-span-3" />
        <Skeleton className="h-[400px] rounded-[1.25rem] bg-white/[0.03] lg:col-span-2" />
      </div>

      <div>
        <div className="flex items-baseline justify-between gap-3 pb-3">
          <Skeleton className="h-5 w-40 bg-white/[0.05]" />
        </div>
        <div className="border-y border-white/[0.06]">
          {[1, 2, 3].map((index) => (
            <div key={index} className="flex items-center justify-between gap-3 border-b border-white/[0.05] px-1 py-4 last:border-b-0">
              <div className="flex items-center gap-2.5">
                <Skeleton className="h-7 w-7 rounded-lg bg-white/[0.05]" />
                <Skeleton className="h-4 w-36 bg-white/[0.05]" />
              </div>
              <Skeleton className="h-4 w-20 bg-white/[0.05]" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Performance keeps a viewport-tall chart card, so its placeholder has to grow
// with the section instead of using the fixed drill-down chart height.
function PerformanceFallback() {
  return (
    <div className="flex min-h-[calc(100vh-7rem)] flex-col gap-6" aria-busy="true">
      <header>
        <Skeleton className="h-7 w-48 bg-white/[0.09]" />
        <Skeleton className="mt-2 h-4 w-80 max-w-full bg-white/[0.05]" />
      </header>

      <MetricStripSkeleton />

      <div className="panel flex flex-1 flex-col p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Skeleton className="h-5 w-40 bg-white/[0.05]" />
          <div className="flex items-center gap-1">
            <Skeleton className="h-8 w-28 rounded-lg bg-white/[0.04]" />
            <Skeleton className="h-8 w-40 rounded-full bg-white/[0.04]" />
          </div>
        </div>
        <Skeleton className="mt-4 h-[340px] w-full bg-white/[0.04] sm:h-[420px] lg:h-[480px]" />
        <div className="mt-3 flex flex-wrap items-center gap-x-1 gap-y-1.5">
          {[1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-5 w-20 rounded-full bg-white/[0.04]" />
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-baseline justify-between gap-3 pb-2">
          <Skeleton className="h-5 w-20 bg-white/[0.05]" />
          <Skeleton className="h-3 w-24 bg-white/[0.04]" />
        </div>
        <div className="border-y border-white/[0.06]">
          {[1, 2, 3].map((index) => (
            <div key={index} className="flex items-center justify-between gap-3 border-b border-white/[0.05] px-1 py-3 last:border-b-0">
              <Skeleton className="h-4 w-32 bg-white/[0.05]" />
              <Skeleton className="h-4 w-16 bg-white/[0.05]" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Individual holding: brand + ticker header, five metrics, chart and trades.
function StockFallback() {
  return (
    <div className="space-y-6" aria-busy="true">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <Skeleton className="h-8 w-8 rounded-full bg-white/[0.05]" />
            <Skeleton className="h-7 w-24 bg-white/[0.09]" />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2.5">
            <Skeleton className="h-3.5 w-40 bg-white/[0.05]" />
            <Skeleton className="h-5 w-16 rounded-full bg-white/[0.04]" />
            <Skeleton className="h-5 w-20 rounded-full bg-white/[0.04]" />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-7 w-20 rounded-full bg-white/[0.08]" />
          <Skeleton className="h-7 w-20 rounded-full bg-white/[0.05]" />
          <Skeleton className="h-7 w-20 rounded-full bg-white/[0.05]" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-7 border-y border-white/[0.06] py-6 sm:gap-x-10 lg:grid-cols-[1.4fr_1fr_1fr_1fr_1fr] lg:gap-0 lg:py-7">
        <div className="col-span-2 lg:col-span-1 lg:pr-6">
          <Skeleton className="h-2.5 w-16 bg-white/[0.05]" />
          <Skeleton className="mt-2 h-[38px] w-28 bg-white/[0.09] sm:h-[42px]" />
          <Skeleton className="mt-2 h-2.5 w-24 bg-white/[0.04]" />
        </div>
        {[1, 2, 3, 4].map((index) => (
          <div key={index} className="lg:border-l lg:border-white/[0.06] lg:px-6">
            <Skeleton className="h-2.5 w-16 bg-white/[0.05]" />
            <Skeleton className="mt-2 h-7 w-20 bg-white/[0.05] sm:h-8" />
            <Skeleton className="mt-2 h-2.5 w-16 bg-white/[0.04]" />
          </div>
        ))}
      </div>

      <Skeleton className="h-[400px] w-full rounded-[1.25rem] bg-white/[0.03]" />

      <div>
        <div className="flex items-baseline justify-between gap-3 border-b border-white/[0.06] pb-2">
          <Skeleton className="h-5 w-16 bg-white/[0.05]" />
          <Skeleton className="h-3 w-16 bg-white/[0.04]" />
        </div>
        <div className="border-b border-white/[0.06] py-6">
          <Skeleton className="h-4 w-64 bg-white/[0.04]" />
        </div>
      </div>
    </div>
  );
}

function SettingsFallback() {
  return (
    <section className="space-y-6 pb-16 xl:pb-0" aria-busy="true">
      <h1 className="text-[28px] font-semibold leading-none tracking-tight text-white">Settings</h1>

      <div className="grid grid-cols-2 gap-x-6 gap-y-6 border-y border-white/[0.06] py-6 sm:grid-cols-4 sm:gap-x-0">
        {[1, 2, 3, 4].map((index) => (
          <div key={index} className={index === 1 ? "sm:pr-8" : "sm:border-l sm:border-white/[0.06] sm:pl-8"}>
            <Skeleton className="h-2.5 w-20 bg-white/[0.05]" />
            <Skeleton className="mt-2 h-8 w-16 bg-white/[0.07]" />
          </div>
        ))}
      </div>

      <div className="divide-y divide-white/[0.06] border-b border-white/[0.06]">
        <section className="py-6">
          <Skeleton className="h-5 w-28 bg-white/[0.05]" />
          <div className="mt-4 divide-y divide-white/[0.05]">
            {[1, 2, 3, 4].map((index) => (
              <div key={index} className="grid gap-2 py-3.5 first:pt-0 md:grid-cols-[minmax(0,1fr)_15rem] md:items-center md:gap-8">
                <div>
                  <Skeleton className="h-4 w-32 bg-white/[0.05]" />
                  <Skeleton className="mt-0.5 h-3 w-48 bg-white/[0.04]" />
                </div>
                <Skeleton className="h-8 w-full rounded-lg bg-white/[0.04]" />
              </div>
            ))}
          </div>
        </section>

        <div className="py-6">
          <div className="flex items-center justify-between gap-4">
            <Skeleton className="h-5 w-32 bg-white/[0.05]" />
            <Skeleton className="h-4 w-4 bg-white/[0.04]" />
          </div>
          <div className="grid gap-6 pt-4 xl:grid-cols-[minmax(0,1fr)_20rem] xl:gap-10">
            <div>
              <Skeleton className="h-8 w-64 rounded-full bg-white/[0.04]" />
              <Skeleton className="mt-3 h-3 w-72 bg-white/[0.04]" />
              <div className="mt-3 divide-y divide-white/[0.05] border-t border-white/[0.05]">
                {[1, 2, 3].map((index) => (
                  <div key={index} className="py-4">
                    <Skeleton className="h-4 w-40 bg-white/[0.05]" />
                    <Skeleton className="mt-2.5 h-7 w-56 bg-white/[0.04]" />
                  </div>
                ))}
              </div>
            </div>
            <Skeleton className="hidden h-[300px] rounded-[1.25rem] bg-white/[0.03] xl:block" />
          </div>
        </div>

        <div className="py-6">
          <div className="flex items-center justify-between gap-4">
            <Skeleton className="h-5 w-28 bg-white/[0.05]" />
            <Skeleton className="h-4 w-4 bg-white/[0.04]" />
          </div>
        </div>

        <section className="py-6">
          <Skeleton className="h-5 w-32 bg-white/[0.05]" />
          <div className="mt-4 divide-y divide-white/[0.05]">
            {[1, 2].map((index) => (
              <div key={index} className="flex items-center justify-between gap-6 py-3.5 first:pt-0">
                <div>
                  <Skeleton className="h-4 w-36 bg-white/[0.05]" />
                  <Skeleton className="mt-0.5 h-3 w-52 bg-white/[0.04]" />
                </div>
                <Skeleton className="h-7 w-28 rounded-full bg-white/[0.04]" />
              </div>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}

function WatchlistFallback() {
  return (
    <div className="space-y-6" aria-busy="true">
      <div className="grid grid-cols-2 gap-x-6 gap-y-8 border-y border-white/[0.06] py-6 sm:gap-x-10 lg:grid-cols-[1.6fr_1fr_1fr] lg:gap-0 lg:py-7">
        <div className="col-span-2 lg:col-span-1 lg:pr-8">
          <Skeleton className="h-2.5 w-24 bg-white/[0.05]" />
          <Skeleton className="mt-2 h-[38px] w-28 bg-white/[0.09] sm:h-[42px]" />
          <Skeleton className="mt-2 h-2.5 w-28 bg-white/[0.04]" />
        </div>
        {[1, 2].map((index) => (
          <div key={index} className="lg:border-l lg:border-white/[0.06] lg:px-8">
            <Skeleton className="h-2.5 w-20 bg-white/[0.05]" />
            <Skeleton className="mt-2 h-6 w-16 bg-white/[0.07]" />
            <Skeleton className="mt-2 h-2.5 w-20 bg-white/[0.04]" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] xl:gap-0">
        <section className="min-w-0 xl:pr-8">
          <div className="flex items-baseline justify-between gap-3 pb-3">
            <Skeleton className="h-5 w-16 bg-white/[0.05]" />
            <Skeleton className="h-3 w-14 bg-white/[0.04]" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-8 min-w-0 flex-1 rounded-lg bg-white/[0.04]" />
            <Skeleton className="h-8 w-8 shrink-0 rounded-lg bg-white/[0.04]" />
          </div>
          <div className="mt-4 border-t border-white/[0.06]">
            {[1, 2, 3].map((index) => (
              <div key={index} className="flex items-center gap-3 border-b border-white/[0.05] px-1 py-3">
                <Skeleton className="h-9 w-9 shrink-0 rounded-full bg-white/[0.04]" />
                <div className="min-w-0 flex-1">
                  <Skeleton className="h-3.5 w-32 bg-white/[0.05]" />
                  <Skeleton className="mt-1 h-2.5 w-20 bg-white/[0.04]" />
                </div>
                <Skeleton className="h-3.5 w-16 bg-white/[0.05]" />
              </div>
            ))}
          </div>
        </section>

        <section className="min-w-0 xl:border-l xl:border-white/[0.06] xl:pl-8">
          <div className="panel p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <Skeleton className="h-5 w-40 bg-white/[0.05]" />
                <Skeleton className="mt-1 h-3 w-24 bg-white/[0.04]" />
              </div>
              <Skeleton className="h-8 w-40 rounded-full bg-white/[0.04]" />
            </div>
            <Skeleton className="mt-4 h-[240px] w-full bg-white/[0.04] sm:h-[300px] xl:h-[260px]" />
          </div>
        </section>
      </div>
    </div>
  );
}

function GoalsFallback() {
  // Match the real panel's frame, which depends on whether a goal exists:
  // the saved goal adds a fourth metric column, a progress bar under the hero
  // and a summary sidebar instead of the "set a goal" form.
  const boot = useWorkspaceBootstrap();
  const hasGoal = !!boot?.goals?.length;
  return (
    <div className="space-y-8" aria-busy="true">
      <div className={`grid grid-cols-2 gap-x-6 gap-y-8 border-y border-white/[0.06] py-6 sm:gap-x-10 lg:gap-0 lg:py-7 ${hasGoal ? "sm:grid-cols-3 lg:grid-cols-[1.3fr_1fr_1fr_1fr]" : "sm:grid-cols-2 lg:grid-cols-[1.3fr_1fr_1fr]"}`}>
        <div className={`col-span-2 min-w-0 lg:col-span-1 lg:pr-8 ${hasGoal ? "sm:col-span-3" : "sm:col-span-2"}`}>
          <Skeleton className="h-2.5 w-28 bg-white/[0.05]" />
          <Skeleton className="mt-2 h-[38px] w-36 bg-white/[0.05] sm:h-[42px]" />
          {hasGoal && <Skeleton className="mt-3 h-1 w-full max-w-[220px] bg-white/[0.05]" />}
          <Skeleton className="mt-2 h-2.5 w-24 bg-white/[0.05]" />
        </div>
        {Array.from({ length: hasGoal ? 3 : 2 }, (_, index) => (
          <div key={index} className={index === (hasGoal ? 2 : 1) ? "col-span-2 sm:col-span-1 lg:border-l lg:border-white/[0.06] lg:pl-8" : "lg:border-l lg:border-white/[0.06] lg:px-8"}>
            <Skeleton className="h-2.5 w-20 bg-white/[0.05]" />
            <Skeleton className="mt-2 h-7 w-20 bg-white/[0.05] sm:h-8" />
            <Skeleton className="mt-2 h-2.5 w-16 bg-white/[0.05]" />
          </div>
        ))}
      </div>

      <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_340px] xl:gap-0">
        <div className="min-w-0 xl:pr-8">
          <div className="panel p-4">
            <div className="flex items-center justify-between gap-3">
              <Skeleton className="h-5 w-40 bg-white/[0.05]" />
              <Skeleton className="h-8 w-44 rounded-full bg-white/[0.05]" />
            </div>
            <Skeleton className="mt-4 h-[280px] w-full bg-white/[0.05] sm:h-[320px]" />
          </div>
        </div>
        <aside className="xl:border-l xl:border-white/[0.06] xl:pl-8">
          <div className="flex items-baseline justify-between gap-3 border-b border-white/[0.06] pb-2">
            <Skeleton className="h-5 w-16 bg-white/[0.05]" />
            <Skeleton className="h-3 w-10 bg-white/[0.05]" />
          </div>
          {hasGoal ? (
            <div className="divide-y divide-white/[0.05]">
              {[0, 1, 2].map((index) => (
                <div key={index} className="flex items-baseline justify-between gap-3 py-3">
                  <Skeleton className="h-3 w-12 bg-white/[0.05]" />
                  <Skeleton className="h-5 w-20 bg-white/[0.05]" />
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-4 pt-4">
              {[0, 1, 2].map((index) => (
                <div key={index} className="space-y-1.5">
                  <Skeleton className="h-3 w-20 bg-white/[0.05]" />
                  <Skeleton className="h-8 w-full bg-white/[0.05]" />
                </div>
              ))}
              <Skeleton className="h-8 w-full bg-white/[0.05]" />
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function WizardFallback() {
  return (
    <div className="mx-auto my-3 w-full px-0 sm:my-5" aria-busy="true">
      <main className="relative mx-auto w-full max-w-3xl py-2 sm:py-6">
        <header className="mb-5 flex items-end justify-between gap-4 sm:mb-6">
          <div className="min-w-0 flex-1">
            <Skeleton className="h-2.5 w-24 bg-white/[0.04]" />
            <Skeleton className="mt-2 h-7 w-56 bg-white/[0.09]" />
            <Skeleton className="mt-1.5 h-4 w-80 max-w-full bg-white/[0.05]" />
          </div>
          <Skeleton className="mb-0.5 h-7 w-16 rounded-lg bg-white/[0.04]" />
        </header>

        <section className="rounded-2xl border border-white/[.09] bg-[#0b0b0d]/85">
          <div className="rounded-t-2xl border-b border-white/[.07] px-5 py-5 sm:px-7">
            <div className="grid grid-cols-3 gap-3">
              {[1, 2, 3].map((index) => (
                <div key={index}>
                  <Skeleton className="h-1 w-full rounded-full bg-white/[0.08]" />
                  <div className="mt-2.5 flex items-center gap-2">
                    <Skeleton className="h-5 w-5 rounded-full bg-white/[0.05]" />
                    <Skeleton className="h-3 w-16 bg-white/[0.04]" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-6 px-5 py-6 sm:px-7 sm:py-7">
            <div className="flex items-start gap-3.5">
              <Skeleton className="h-10 w-10 shrink-0 rounded-xl bg-white/[0.04]" />
              <div className="min-w-0 flex-1 pt-0.5">
                <Skeleton className="h-5 w-40 bg-white/[0.05]" />
                <Skeleton className="mt-1 h-4 w-72 max-w-full bg-white/[0.04]" />
              </div>
            </div>
            <div className="space-y-5">
              <div className="space-y-2">
                <Skeleton className="h-3.5 w-24 bg-white/[0.04]" />
                <Skeleton className="h-11 w-full rounded-xl bg-white/[0.04]" />
              </div>
              <div className="grid gap-5 sm:grid-cols-2">
                {[1, 2].map((index) => (
                  <div key={index} className="space-y-2">
                    <Skeleton className="h-3.5 w-20 bg-white/[0.04]" />
                    <Skeleton className="h-9 w-full rounded-lg bg-white/[0.04]" />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex min-h-[76px] items-center justify-between gap-4 rounded-b-2xl border-t border-white/[.07] bg-white/[.012] px-4 py-3.5 sm:px-7">
            <Skeleton className="h-3 w-40 bg-white/[0.04]" />
            <Skeleton className="h-10 w-32 rounded-xl bg-white/[0.08]" />
          </div>
        </section>
      </main>
    </div>
  );
}

type PortfolioUpdateBody = { id: string; name?: string; type?: string; accountId?: string | null; providerId?: string | null };
type DeleteRequest =
  | { kind: "account"; item: Account }
  | { kind: "provider"; item: Provider }
  | { kind: "portfolio"; item: Portfolio }
  | { kind: "holding"; item: Pick<Holding, "id" | "symbol"> };

export type DashboardSection = "dashboard" | "watchlist" | "goals" | "performance" | "settings";

export function Dashboard({ isDemo, section: requestedSection }: { isDemo?: boolean; section?: DashboardSection }) {
  const pathname = usePathname();
  const section = requestedSection ?? (pathname === "/performance" ? "performance" : pathname === "/watchlist" ? "watchlist" : pathname === "/goals" ? "goals" : pathname === "/settings" ? "settings" : "dashboard");
  const router = useRouter();
  // Seeded once from the URL so deep links open the right view, then owned by
  // React state: selecting never navigates.
  const { selection, select, clear: clearSelection } = useDashboardSelection();
  const { portfolioId: activeId, providerId: providerFromUrl, accountId: accountFromUrl, holdingId: holdingFromUrl } = selection;
  const { accounts, create: createAccount, remove: removeAccount, rename: renameAccount, ready: accountsReady, error: accountsError, refresh: refreshAccounts } = useAccounts();

  const { providers, remove: removeProvider, rename: renameProvider, refresh: refreshProviders } = useProviders();
  const { portfolios, create, remove, upsertHolding, deleteHolding, moveHolding, refresh: refreshPortfolios, setPortfolios, ready: portfoliosReady, error: portfoliosError } = usePortfolios();
  const { holdings: allHoldingsList, refresh: refreshAllHoldings, setHoldings: setAllHoldings, error: holdingsError } = useHoldings();
  const directHoldings = useMemo(()=> allHoldingsList.filter((h: Holding)=> !h.portfolioId), [allHoldingsList]);
  // Marks for collapsed sidebar portfolios and views the user has not opened
  // yet are fetched in the background, so expanding a portfolio does not kick
  // off a cold remote lookup at that moment.
  useBrandIconWarmup({ providers, portfolios, holdings: allHoldingsList });
  const { settings } = useSettings();
  const { snapshots, byPortfolio, byHolding, moverChanges } = useSnapshots(portfolios, directHoldings, settings.fxRates);
  const { toast } = useToast();
  const [tradeRequest, setTradeRequest] = useState<{ holding: Holding; type: "buy" | "sell" } | null>(null);
  const [wizardContext, setWizardContext] = useState<{ accountId: string | null; providerId: string | null } | null>(null);
  const [holdingDialog, setHoldingDialog] = useState<Holding | "new" | null>(null);
  // Derived rather than synced: the preference is the fallback and a manual
  // pick is an override tagged with the section it was made in. No effect writes
  // state on a settings change, so there is nothing to loop or race.
  const [rangeOverride, setRangeOverride] = useState<{ section: DashboardSection; value: ChartRange } | null>(null);
  const defaultRange: ChartRange = section === "performance" ? "MAX" : settings.defaultRange;
  const range: ChartRange = rangeOverride?.section === section ? rangeOverride.value : defaultRange;
  const pickRange = useCallback((value: ChartRange) => {
    setRangeOverride({ section, value });
  }, [section]);
  // Held here rather than in PerformanceChart so the pick survives navigating
  // between sections, which unmounts the chart.
  const [benchmark, setBenchmark] = useState(isDemo ? "VWRL.L" : "__none__");
  const [allocMode, setAllocMode] = useState<AllocationMode>("holding");
  const [refreshing, setRefreshing] = useState(false);
  const active = useMemo(() => portfolios.find((p) => p.id === activeId) ?? null, [portfolios, activeId]);
  const activeProvider = useMemo(() => providers.find((provider) => provider.id === providerFromUrl) ?? null, [providers, providerFromUrl]);
  const activeAccount = useMemo(() => accounts.find((account) => account.id === accountFromUrl) ?? null, [accounts, accountFromUrl]);
  const { account: accountData, provider: providerData } = useAccountProviderDashboardData({
    activeAccount,
    activeProvider,
    accounts,
    providers,
    portfolios,
    directHoldings,
    byPortfolio,
    byHolding,
    fxRates: settings.fxRates,
  });
  const holdingViewId = holdingFromUrl;
  const { holding: viewHolding, portfolio: viewPortfolio, color: viewColor, scopeValue: holdingScopeValue } = useHoldingViewData({
    holdingId: holdingViewId,
    activePortfolioId: activeId,
    holdings: allHoldingsList,
    portfolios,
    providers,
    accounts,
    fxRates: settings.fxRates,
  });
  const activeBaseColor = useMemo(() => {
    if (!active) return null;
    return resolvePortfolioColor(active, portfolios, providers, accounts);
  }, [active, accounts, portfolios, providers]);
  const overviewTx = useTransactions(null);
  const { create: createTx, refresh: refreshTx, remove: removeTx } = overviewTx;
  const displayTx = useMemo(() => {
    if (activeId) return overviewTx.transactions.filter((transaction) => transaction.portfolioId === activeId);
    if (activeProvider) {
      const portfolioIds = new Set(providerData.portfolios.map((portfolio) => portfolio.id));
      const holdingIds = new Set(providerData.holdings.map((holding) => holding.id));
      return overviewTx.transactions.filter((transaction) => transaction.portfolioId
        ? portfolioIds.has(transaction.portfolioId)
        : transaction.holdingId ? holdingIds.has(transaction.holdingId) : false);
    }
    return overviewTx.transactions;
  }, [activeId, activeProvider, overviewTx.transactions, providerData.holdings, providerData.portfolios]);
  const transactions = displayTx;

  const openTrade = (holding: Holding, type: "buy" | "sell") => setTradeRequest({ holding, type });
  // Merge rows returned by a mutation into both holdings views so the table,
  // portfolio totals and trade list update before the reconciliation reads land.
  const applyHoldings = useCallback((rows: Holding[]) => {
    if (!rows.length) return;
    const byId = new Map(rows.map((h) => [h.id, h]));
    const removed = new Set(rows.filter((h) => h.shares <= 0).map((h) => h.id));
    setAllHoldings((prev) => {
      const next = prev.filter((h) => !removed.has(h.id)).map((h) => byId.get(h.id) ?? h);
      for (const h of rows) if (h.shares > 0 && !prev.some((p) => p.id === h.id)) next.push(h);
      return next;
    });
    setPortfolios((prev) => prev.map((p) => {
      const next = p.holdings.filter((h) => !removed.has(h.id)).map((h) => byId.get(h.id) ?? h);
      for (const h of rows) if (h.portfolioId === p.id && h.shares > 0 && !p.holdings.some((x) => x.id === h.id)) next.push(h);
      return next.length === p.holdings.length && next.every((h, i) => h === p.holdings[i]) ? p : { ...p, holdings: next };
    }));
  }, [setAllHoldings, setPortfolios]);
  const handleTrade = async (data: { shares: number; price: number; date: string }) => {
    if (!tradeRequest) { toast({ title: "Cannot trade", description: "No holding selected", variant: "error" }); return; }
    try {
      const result = await createTx({ portfolioId: tradeRequest.holding.portfolioId ?? null, holdingId: tradeRequest.holding.id, type: tradeRequest.type, shares: data.shares, price: data.price, date: data.date });
      applyHoldings(result.holding ? [result.holding] : []);
      await Promise.all([refreshPortfolios(), refreshTx()]);
      toast({ title: tradeRequest.type === "buy" ? "Buy recorded" : "Sell recorded", description: `${tradeRequest.type === "buy" ? "+" : "-"}${data.shares} ${tradeRequest.holding.symbol} @ ${fmtPrice(data.price, tradeRequest.holding.currency)}`, variant: "success" });
    } catch (e: unknown) { toast({ title: "Trade failed", description: e instanceof Error ? e.message : String(e), variant: "error" }); throw e; }
  };

  const handleDeleteTransaction = async (id: string) => {
    if (!window.confirm("Delete this trade and recalculate the position?")) return;
    try {
      const result = await removeTx(id);
      applyHoldings(result.holding ? [result.holding] : []);
      await Promise.all([refreshPortfolios(), refreshAllHoldings(), refreshTx()]);
      toast({ title: "Trade deleted", description: "The affected position was recalculated.", variant: "success" });
    } catch (error) {
      toast({ title: "Could not delete trade", description: error instanceof Error ? error.message : String(error), variant: "error" });
    }
  };

  const { totalValue, totalCost, totalGain, totalGainPct } = useMemo(() => {
    const vPort = portfolios.reduce((s, p) => s + p.holdings.reduce((a, h: Holding) => a + holdingValueGBP(h, settings.fxRates), 0), 0);
    const cPort = portfolios.reduce((s, p) => s + p.holdings.reduce((a, h: Holding) => a + holdingCostGBP(h, settings.fxRates), 0), 0);
    const vDirect = directHoldings.reduce((s, h: Holding) => s + holdingValueGBP(h, settings.fxRates), 0);
    const cDirect = directHoldings.reduce((s, h: Holding) => s + holdingCostGBP(h, settings.fxRates), 0);
    const v = vPort + vDirect;
    const c = cPort + cDirect;
    return { totalValue: v, totalCost: c, totalGain: v - c, totalGainPct: c ? ((v - c) / c) * 100 : 0 };
  }, [portfolios, directHoldings, settings.fxRates]);

  const overviewPeriodChange = useMemo(
    () => valueChangeOverRange(snapshots, range, totalValue),
    [snapshots, range, totalValue],
  );

  const staleHoldings = useStaleHoldings(allHoldingsList, portfolios);

  // Staleness counts are needed by whichever level is open. Derive them once
  // per render instead of filtering the stale list against each level's
  // holdings (three O(stale × holdings) scans in the JSX).
  const staleCounts = useMemo(() => {
    const accountIds = new Set(accountData.holdings.map((holding) => holding.id));
    const providerIds = new Set(providerData.holdings.map((holding) => holding.id));
    let account = 0;
    let provider = 0;
    let portfolio = 0;
    for (const holding of staleHoldings) {
      if (accountIds.has(holding.id)) account += 1;
      if (providerIds.has(holding.id)) provider += 1;
      if (active && holding.portfolioId === active.id) portfolio += 1;
    }
    return { account, provider, portfolio };
  }, [accountData.holdings, active, providerData.holdings, staleHoldings]);

  const holdingCount = useMemo(
    () => portfolios.reduce((sum, portfolio) => sum + portfolio.holdings.length, 0) + directHoldings.length,
    [directHoldings.length, portfolios],
  );

  const { breakdown: overviewBreakdown, insights: accountInsights, periodMovers } = usePortfolioOverviewInsights({
    accounts,
    providers,
    portfolios,
    allHoldings: allHoldingsList,
    directHoldings,
    moverChanges,
    fxRates: settings.fxRates,
    range,
  });

  const { chartData, chartDots, overviewSeries, performanceSeries } = useDashboardChartData({
    activePortfolio: active,
    activeProvider,
    providerHistory: providerData.history,
    providerValue: providerData.value,
    snapshots,
    byPortfolio,
    transactions: displayTx,
    portfolios,
    providers,
    accounts,
    totalValue,
    fxRates: settings.fxRates,
    range,
  });
  const allocation = usePortfolioAllocation({
    activePortfolio: active,
    portfolios,
    directHoldings,
    accounts,
    providers,
    fxRates: settings.fxRates,
    activeBaseColor,
    mode: allocMode,
  });

  const handleCreate = async (name: string, type: "live" | "manual", accountId?: string | null, providerId?: string | null) => {
    try { const r = await create(name, type, accountId ?? null, providerId ?? null); toast({title:"Portfolio created",description:name,variant:"success"}); return r; } catch(e: unknown){toast({title:"Failed to create portfolio",description:e instanceof Error ? e.message : String(e),variant:"error"}); throw e;}
  };
  const handleCreateAccount = useCallback(async (name: string) => {
    try { return await createAccount(name); } catch(e: unknown){ toast({title:"Failed",description:e instanceof Error ? e.message : String(e),variant:"error"}); throw e;}
  }, [createAccount, toast]);
  const handleRenameAccount = useCallback(async (id:string,name:string)=>{ await renameAccount(id,name); }, [renameAccount]);
  const handleRenameProvider = useCallback(async (id:string,name:string)=>{ await renameProvider(id,name); }, [renameProvider]);
  const handleRenamePortfolio = useCallback(async (id: string, patch: { name?: string; type?: string; accountId?: string | null; providerId?: string | null }) => {
    if (patch.accountId !== undefined || patch.providerId !== undefined || patch.name !== undefined || patch.type !== undefined) {
      const body: PortfolioUpdateBody = { id };
      if (patch.name !== undefined) body.name = patch.name;
      if (patch.type !== undefined) body.type = patch.type;
      if (patch.accountId !== undefined) body.accountId = patch.accountId;
      if (patch.providerId !== undefined) body.providerId = patch.providerId;
      const r = await fetch("/api/portfolios", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error(await r.text());
      const derivedAccountId = patch.providerId
        ? (providers.find((p) => p.id === patch.providerId)?.accountId ?? patch.accountId ?? null)
        : (patch.accountId ?? null);
      setPortfolios((prev) => prev.map((p) => {
        if (p.id !== id) return p;
        const next = { ...p };
        if (patch.name !== undefined) next.name = patch.name;
        if (patch.type !== undefined) next.type = patch.type as "live" | "manual";
        if (patch.providerId !== undefined) {
          next.providerId = patch.providerId;
          next.accountId = derivedAccountId;
        } else if (patch.accountId !== undefined) {
          next.accountId = patch.accountId;
        }
        return next;
      }));
    }
  }, [setPortfolios, providers]);
  const handleRemoveAccount = async (id: string) => {
    try { await removeAccount(id); await refreshProviders(); await refreshPortfolios(); toast({title:"Account deleted",variant:"success"});} catch(e: unknown){toast({title:"Delete failed",description:e instanceof Error ? e.message : String(e),variant:"error"});}
  };
  const handleRemoveProvider = async (id: string) => {
    try { await removeProvider(id); await refreshPortfolios(); toast({title:"Provider deleted",variant:"success"});} catch(e: unknown){toast({title:"Delete failed",description:e instanceof Error ? e.message : String(e),variant:"error"});}
  };

  const openAdd = () => {
    setHoldingDialog("new");
  };

  const openEdit = (holding: Holding) => {
    setHoldingDialog(holding);
  };
  const saveHolding = async (holdingId: string | null, data: HoldingFormData) => {
    if (!activeId) throw new Error("Select a portfolio before saving a holding");
    await upsertHolding(activeId, { ...data, id: holdingId ?? undefined });
  };

  const { value: activeValue, cost: activeCost, gain: activeGain, gainPct: activeGainPct } = useMemo(() => {
    if (!active) return { value: totalValue, cost: totalCost, gain: totalGain, gainPct: totalGainPct };
    let value = 0;
    let cost = 0;
    for (const holding of active.holdings) {
      value += holdingValueGBP(holding, settings.fxRates);
      cost += holdingCostGBP(holding, settings.fxRates);
    }
    const gain = value - cost;
    return { value, cost, gain, gainPct: cost ? (gain / cost) * 100 : 0 };
  }, [active, settings.fxRates, totalCost, totalGain, totalGainPct, totalValue]);
  const portfolioChartColor = activeBaseColor ?? "#60a5fa";

  const [deleteRequest, setDeleteRequest] = useState<DeleteRequest | null>(null);
  const [editPortfolio, setEditPortfolio] = useState<Portfolio | null>(null);
  const openEditPortfolio = (portfolio: Portfolio) => setEditPortfolio(portfolio);

  const openWizard = useCallback((accountId: string | null = null, providerId: string | null = null) => {
    setWizardContext({ accountId, providerId });
  }, []);
  // Stable element so the memoised allocation chart does not re-render just
  // because the dashboard re-rendered.
  const emptyAllocationContent = useMemo(() => (
    <div>
      <p className="text-sm text-zinc-500">No holdings</p>
      <p className="mt-1 text-xs text-zinc-600">Create a portfolio and add holdings</p>
      <Button size="sm" className="mt-3" onClick={() => openWizard(null)}><Plus className="h-3.5 w-3.5" />New portfolio</Button>
    </div>
  ), [openWizard]);

  const [assignHolding, setAssignHolding] = useState<Holding | null>(null);
  const openAssign = (holding: Holding) => setAssignHolding(holding);

  const refreshPrices = useCallback(async () => {
    const allHs = [...portfolios.flatMap(p=>p.holdings), ...directHoldings];
    if(allHs.length===0) return;
    setRefreshing(true);
    try{
      const manualIds = new Set(portfolios.filter((p) => p.type === "manual").map((p) => p.id));
      const symbols = allHs.filter((h: Holding)=> isListedSymbol(h.symbol) && !(h.portfolioId && manualIds.has(h.portfolioId))).map(h=>({symbol:h.symbol,exchange:h.exchange}));
      if(!symbols.length) { toast({title:"No holdings to refresh",variant:"info"}); return; }
      const r = await fetch("/api/quote",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({symbols})});
      const quotes = await r.json();
      if(!Object.keys(quotes).length) { toast({title:"No prices returned",variant:"info"}); return; }
      const patch = await fetch("/api/holdings",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({symbols:quotes})});
      const j = await patch.json();
      if(!patch.ok){ toast({title:j.message||j.error||"Refresh limited",description:j.nextAllowedAt?`Next allowed ${new Date(j.nextAllowedAt*1000).toLocaleTimeString()}`:undefined,variant:"error"}); return; }
      // PATCH echoes the rows it touched, so there is no follow-up GET.
      applyHoldings(Array.isArray(j.holdings) ? j.holdings as Holding[] : []);
      toast({title:`Updated ${j.updated} holdings`,description:j.skipped?`${j.skipped} skipped (24h limit)`:undefined,variant:"success"});
    } catch(e: unknown){ toast({title:"Refresh failed",description:e instanceof Error ? e.message : String(e),variant:"error"});}
    finally{setRefreshing(false);}
  }, [portfolios, directHoldings, toast, applyHoldings]);

  // Stable identity so the memoised Sidebar does not re-render on every
  // Dashboard state change (range switch, dialog open, allocation mode, …).
  const handleRefreshPrices = useCallback(() => { void refreshPrices(); }, [refreshPrices]);

  const handleWizardCreate = async (name: string, type: "live" | "manual", accountId: string | null, providerId: string | null, extra?: { symbol?: string; shares?: string }) => {
    const created = await handleCreate(name, type, accountId, providerId);
    if (extra?.symbol && created?.id) {
      try {
        let price = 100;
        try{ const q = await fetch(`/api/quote?symbol=${encodeURIComponent(extra.symbol)}`).then(r=>r.json()); const hit=q[extra.symbol.toUpperCase()] ?? q[`${extra.symbol.toUpperCase()}:`]; if(hit?.price) price=hit.price; } catch{}
        await fetch("/api/holdings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            portfolioId: created.id,
            symbol: extra.symbol.toUpperCase().trim(),
            name: extra.symbol.toUpperCase().trim(),
            shares: Number(extra.shares || 1),
            avgPrice: price,
            currentPrice: price,
            currency: settings.currency || "GBP",
            purchaseDate: todayISODate(),
          }),
        });
        await refreshPortfolios();
      } catch {}
    }
  };

  const isLoading = !portfoliosReady;

  const selectPortfolio = useCallback((id: string | null) => {
    select(id ? { ...EMPTY_SELECTION, portfolioId: id } : EMPTY_SELECTION);
  }, [select]);
  const selectProvider = useCallback((id: string) => {
    select({ ...EMPTY_SELECTION, providerId: id });
  }, [select]);
  const selectAccount = useCallback((id: string) => {
    select({ ...EMPTY_SELECTION, accountId: id });
  }, [select]);
  const selectHolding = useCallback((h: Holding) => {
    select({ ...EMPTY_SELECTION, holdingId: h.id });
  }, [select]);
  const requestDeleteAccount = useCallback((account: Account) => setDeleteRequest({ kind: "account", item: account }), []);
  const requestDeleteProvider = useCallback((provider: Provider) => setDeleteRequest({ kind: "provider", item: provider }), []);
  const requestDeletePortfolio = useCallback((portfolio: Portfolio) => setDeleteRequest({ kind: "portfolio", item: portfolio }), []);
  const requestDeleteHolding = useCallback((holding: Holding) => setDeleteRequest({ kind: "holding", item: { id: holding.id, symbol: holding.symbol } }), []);

  const confirmDelete = async () => {
    if (!deleteRequest) return;

    if (deleteRequest.kind === "portfolio") {
      await remove(deleteRequest.item.id);
      await refreshAllHoldings();
      if (activeId === deleteRequest.item.id) clearSelection();
      toast({ title: "Portfolio deleted", variant: "success" });
    } else if (deleteRequest.kind === "account") {
      await handleRemoveAccount(deleteRequest.item.id);
      if (accountFromUrl === deleteRequest.item.id) clearSelection();
    } else if (deleteRequest.kind === "provider") {
      await handleRemoveProvider(deleteRequest.item.id);
      if (providerFromUrl === deleteRequest.item.id) clearSelection();
    } else {
      const holdingId = deleteRequest.item.id;
      await deleteHolding(holdingId);
      await refreshAllHoldings();
      if (holdingFromUrl === holdingId) clearSelection();
      toast({ title: "Holding deleted", variant: "success" });
    }
  };

  return (
    <div className="flex min-h-screen">
      <Sidebar accounts={accounts} providers={providers} portfolios={portfolios} holdings={directHoldings} activeId={activeId} activeHoldingId={viewHolding?.id ?? null} activeProviderId={activeProvider?.id ?? null} activeAccountId={activeAccount?.id ?? null} onSelect={selectPortfolio} onSelectProvider={selectProvider} onSelectAccount={selectAccount} onSelectHolding={selectHolding} onCreateAccount={handleCreateAccount} onOpenWizard={openWizard} onRefresh={refreshAllHoldings} onRefreshPrices={handleRefreshPrices} refreshing={refreshing} isDemo={isDemo} accountsReady={accountsReady} portfoliosReady={portfoliosReady} onRenameAccount={handleRenameAccount} onRenameProvider={handleRenameProvider} onRenamePortfolio={handleRenamePortfolio}
        onDeleteAccount={requestDeleteAccount}
        onDeletePortfolio={requestDeletePortfolio} />
      <main id="main-content" className="flex-1 min-w-0 pt-12 xl:pt-0">
        <div className="w-full max-w-[1600px] mx-auto px-4 md:px-8 lg:px-10 py-6 md:py-8 space-y-6">
          {(portfoliosError || holdingsError || accountsError) && (
            <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
              <span><AlertTriangle className="inline w-4 h-4 mr-2" />Some portfolio data could not be loaded. Your saved data has not been deleted. {portfoliosError || holdingsError || accountsError}</span>
              <Button variant="outline" size="sm" className="border-amber-500/30 bg-black/20" onClick={() => void Promise.all([refreshPortfolios(), refreshAllHoldings(), refreshAccounts(), refreshProviders()])}>Retry</Button>
            </div>
          )}
          {section === "settings" ? (
            <SettingsView isDemo={isDemo} />
          ) : section === "watchlist" ? (
            <section className="space-y-4">
              <div><h1 className="text-3xl font-bold tracking-tight text-white">Watchlist</h1><p className="mt-1 text-sm text-zinc-500">Keep an eye on symbols before adding them to a portfolio.</p></div>
              <WatchlistPanel />
            </section>
          ) : section === "goals" ? (
            <section className="space-y-6">
              <h1 className="text-[28px] font-semibold leading-none tracking-tight text-white">Goals</h1>
              <GoalPanel currentValue={totalValue} history={snapshots} dateFormat={settings.dateFormat} />
            </section>
          ) : section === "performance" ? (
            <PerformanceChart
              snapshots={snapshots}
              byPortfolio={byPortfolio}
              series={performanceSeries}
range={range}
              onRangeChange={pickRange}
              benchmark={benchmark}
              onBenchmarkChange={setBenchmark}
            />
          ) : wizardContext ? (
            <CreatePortfolioWizard
              // Remounting is the reset: a new wizard context means fresh
              // defaults, so no effect has to copy props into state.
              key={`${wizardContext.accountId ?? "none"}:${wizardContext.providerId ?? "none"}`}
              open
              onOpenChange={(open) => { if (!open) setWizardContext(null); }}
              accounts={accounts}
              providers={providers}
              defaultAccountId={wizardContext.accountId}
              defaultProviderId={wizardContext.providerId}
              onCreate={handleWizardCreate} onCreateAccount={handleCreateAccount} inline
            />
          ) : viewHolding ? (
            <IndividualDashboard
              holding={viewHolding}
              portfolioId={viewPortfolio?.id ?? null}
              portfolioValue={holdingScopeValue}
              portfolioName={viewPortfolio?.name ?? providers.find((provider) => provider.id === viewHolding.providerId)?.name ?? accounts.find((account) => account.id === viewHolding.accountId)?.name}
              color={viewColor}
              onBack={() => {
                const parentProviderId = viewPortfolio?.providerId ?? viewHolding.providerId;
                const parentProvider = providers.find((provider) => provider.id === parentProviderId);
                const parentAccountId = viewPortfolio?.accountId ?? viewHolding.accountId;
                if (parentProvider) selectProvider(parentProvider.id);
                else if (parentAccountId) selectAccount(parentAccountId);
                else clearSelection();
              }}
              onBuy={() => openTrade(viewHolding, "buy")}
              onSell={() => openTrade(viewHolding, "sell")}
              onAddToPortfolio={() => openAssign(viewHolding)}
            >
          {assignHolding && (
            <AssignHoldingDialog
              holding={assignHolding}
              portfolios={portfolios}
              accounts={accounts}
              providers={providers}
              onOpenChange={(open) => { if (!open) setAssignHolding(null); }}
              onCreatePortfolio={create}
              onMoveHolding={moveHolding}
              onRefreshPortfolios={refreshPortfolios}
              onRefreshHoldings={refreshAllHoldings}
            />
          )}
            </IndividualDashboard>
          ) : activeAccount ? (
            <AccountDashboard
              name={activeAccount.name}
              color={accountData.color ?? "#60a5fa"}
              dateFormat={settings.dateFormat}
              providers={accountData.providers}
              portfolios={accountData.portfolios}
              directHoldings={accountData.directHoldings}
              history={accountData.history}
              allocation={accountData.allocation}
              portfolioCount={accountData.allPortfolios.length}
              holdingCount={accountData.holdings.length}
              latestRefresh={accountData.latestRefresh}
              staleCount={staleCounts.account}
              value={accountData.value}
              cost={accountData.cost}
              gain={accountData.gain}
              gainPct={accountData.gainPct}
              onBack={clearSelection}
              onRename={(name) => handleRenameAccount(activeAccount.id, name)}
              onNewPortfolio={() => openWizard(activeAccount.id, null)}
              onDelete={() => requestDeleteAccount(activeAccount)}
              onOpenProvider={selectProvider}
              onOpenPortfolio={selectPortfolio}
              onOpenHolding={(id) => {
                const holding = allHoldingsList.find((item) => item.id === id);
                if (holding) selectHolding(holding);
              }}
            />
          ) : activeProvider ? (
            <ProviderDashboard
              name={activeProvider.name}
              accountName={accounts.find((account) => account.id === activeProvider.accountId)?.name ?? "Account"}
              color={providerData.color ?? "#60a5fa"}
              dateFormat={settings.dateFormat}
              portfolios={providerData.portfolioSummaries}
              directHoldings={providerData.directHoldingSummaries}
              history={providerData.history}
              allocation={providerData.allocation}
              holdingCount={providerData.holdings.length}
              latestRefresh={providerData.latestRefresh}
              staleCount={staleCounts.provider}
              value={providerData.value}
              cost={providerData.cost}
              gain={providerData.gain}
              gainPct={providerData.gainPct}
              onBack={() => activeProvider.accountId ? selectAccount(activeProvider.accountId) : clearSelection()}
              onRename={(name) => handleRenameProvider(activeProvider.id, name)}
              onNewPortfolio={() => openWizard(activeProvider.accountId, activeProvider.id)}
              onDelete={() => requestDeleteProvider(activeProvider)}
              onOpenPortfolio={selectPortfolio}
              onOpenHolding={(id) => {
                const holding = allHoldingsList.find((item) => item.id === id);
                if (holding) selectHolding(holding);
              }}
            />
          ) : active ? (
            <PortfolioDashboard
              portfolio={active}
              accounts={accounts}
              providers={providers}
              dateFormat={settings.dateFormat}
              value={activeValue}
              cost={activeCost}
              gain={activeGain}
              gainPct={activeGainPct}
              staleCount={staleCounts.portfolio}
              onBack={() => {
                const parentProvider = providers.find((provider) => provider.id === active.providerId);
                if (parentProvider) selectProvider(parentProvider.id);
                else if (active.accountId) selectAccount(active.accountId);
                else clearSelection();
              }}
              onMove={() => openEditPortfolio(active)}
              onAddHolding={openAdd}
               onDelete={() => requestDeletePortfolio(active)}
            >
              <>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
                <ValueTimeChart
                  data={chartData}
                  title="Value over time"
                  range={range}
                  onRangeChange={pickRange}
                  color={portfolioChartColor}
                  totalName={active.name}
                  dots={chartDots}
                  showTradeMarkers={settings.showTradeMarkers}
                  surface="panel"
                  className="lg:col-span-3"
                />
                <div className="min-w-0 lg:col-span-2">
                  <AllocationCard allocation={allocation} mode={allocMode} onModeChange={setAllocMode} layout="fill" compactChart surface="panel" />
                </div>
              </div>

              <HoldingsTable
                portfolio={active}
                fxRates={settings.fxRates}
                dateFormat={settings.dateFormat}
                totalValue={activeValue}
                staleHoldings={staleHoldings}
                onAdd={openAdd}
                onSelect={selectHolding}
                onTrade={openTrade}
                onEdit={openEdit}
                onDelete={requestDeleteHolding}
              />

              <PortfolioTradeHistory
                holdings={active.holdings}
                transactions={transactions}
                dateFormat={settings.dateFormat}
                onTrade={openTrade}
                onDelete={(transactionId) => { void handleDeleteTransaction(transactionId); }}
              />
            </>
            </PortfolioDashboard>
          ) : (
            <MainDashboard
              accountsCount={accounts.length}
              providersCount={providers.length}
              portfoliosCount={portfolios.length}
              latestSnapshot={snapshots.at(-1)?.date ?? "—"}
              holdingCount={holdingCount}
              totalValue={totalValue}
              totalCost={totalCost}
              totalGain={totalGain}
              totalGainPct={totalGainPct}
              periodChange={overviewPeriodChange}
              range={range}
              isLoading={isLoading}
              refreshing={refreshing}
              canRefresh={portfolios.length > 0 || directHoldings.length > 0}
              onRefresh={handleRefreshPrices}
              onNewPortfolio={() => openWizard(null)}
              onCreateFirstPortfolio={() => openWizard(null)}
            >
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <ValueTimeChart
                  data={chartData}
                  title="Value over time"
                  range={range}
                  onRangeChange={pickRange}
                  series={overviewSeries}
                  dots={chartDots}
                  showTradeMarkers={settings.showTradeMarkers}
                  showSeriesToggle
                  surface="panel"
                  className="lg:col-span-2"
                />
                <AllocationCard
                  allocation={allocation}
                  mode={allocMode}
                  onModeChange={setAllocMode}
                  surface="panel"
                  emptyContent={emptyAllocationContent}
                />
              </div>

              <div className="grid grid-cols-1 gap-8 xl:grid-cols-3 xl:gap-0">
                <AccountBreakdownCard
                  accounts={overviewBreakdown}
                  totalValue={totalValue}
                  onOpenAccount={selectAccount}
                  onOpenProvider={selectProvider}
                  onOpenPortfolio={selectPortfolio}
                />

                <div className="flex flex-col divide-y divide-white/[0.06] xl:col-span-1 xl:border-l xl:border-white/[0.06] xl:pl-8">
                  <DashboardGoalCard currentValue={totalValue} onViewGoals={() => router.push("/goals")} />
                  <PriceFreshnessCard
                    staleHoldings={staleHoldings}
                    dateFormat={settings.dateFormat}
                    refreshing={refreshing}
                    onSelectHolding={selectHolding}
                    onRefresh={handleRefreshPrices}
                  />
                </div>
              </div>

              <PortfolioInsightsSection
                insights={accountInsights}
                periodMovers={periodMovers}
                totalValue={totalValue}
                range={range}
              />

              {overviewTx.transactions.length > 0 && (
                <section>
                  <div className="flex items-baseline justify-between gap-3 border-b border-white/[0.06] pb-2">
                    <h2 className="text-sm font-medium text-white">Recent trades</h2>
                    <span className="text-[11px] text-zinc-600">{overviewTx.transactions.length} trades</span>
                  </div>
                  <div className="max-h-[240px] divide-y divide-white/[0.05] overflow-auto">
                    {overviewTx.transactions.slice(0, 20).map((t) => (
                      <div key={t.id} className="flex items-center gap-3 px-1 py-2.5 text-sm">
                        <span className={`grid h-6 w-6 place-items-center rounded-full text-xs ${t.type === "buy" ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>{t.type === "buy" ? "+" : "−"}</span>
                        <span className="font-medium text-white">{t.symbol}</span>
                        <span className={t.type === "buy" ? "text-emerald-400" : "text-red-400"}>{t.type === "buy" ? "Buy" : "Sell"}</span>
                        <span className="text-zinc-500">{t.shares} @ £{Number(t.price).toFixed(2)}</span>
                        <span className="ml-auto text-[11px] text-zinc-600">{t.date}</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </MainDashboard>
          )}

          {holdingDialog !== null && (
            <HoldingDialog
              open
              onOpenChange={(open) => { if (!open) setHoldingDialog(null); }}
              portfolio={active}
              holding={holdingDialog === "new" ? null : holdingDialog}
              defaultCurrency={settings.currency || "GBP"}
              onSave={saveHolding}
            />
          )}

          {editPortfolio && (
            <EditPortfolioDialog
              key={editPortfolio.id}
              portfolio={editPortfolio}
              accounts={accounts}
              providers={providers}
              onOpenChange={(open) => { if (!open) setEditPortfolio(null); }}
              onSave={handleRenamePortfolio}
            />
          )}

          {deleteRequest && (
            <DeleteConfirmationDialog
              title={deleteRequest.kind === "portfolio" ? "Delete portfolio" : deleteRequest.kind === "account" ? "Delete account" : deleteRequest.kind === "provider" ? "Delete provider" : "Delete holding"}
              description={deleteRequest.kind === "portfolio" ? (
                <>This will permanently delete <span className="text-white font-medium">{deleteRequest.item.name}</span> and its {deleteRequest.item.holdings.length} holdings. This cannot be undone.</>
              ) : deleteRequest.kind === "account" ? (
                <>This will permanently delete account <span className="text-white font-medium">{deleteRequest.item.name}</span>, its {providers.filter((provider) => provider.accountId === deleteRequest.item.id).length} providers and {portfolios.filter((portfolio) => portfolio.accountId === deleteRequest.item.id).length} portfolios. This cannot be undone.</>
              ) : deleteRequest.kind === "provider" ? (
                <>Delete provider <span className="text-white font-medium">{deleteRequest.item.name}</span> and its {portfolios.filter((portfolio) => portfolio.providerId === deleteRequest.item.id).length} portfolios? Portfolios will not be deleted; they will move to &quot;No provider&quot;.</>
              ) : (
                <>Delete <span className="text-white font-medium">{deleteRequest.item.symbol}</span>? This cannot be undone.</>
              )}
              confirmLabel={deleteRequest.kind === "account" ? "Delete account" : deleteRequest.kind === "provider" ? "Delete provider" : deleteRequest.kind === "portfolio" ? "Delete portfolio" : "Delete"}
              confirmationText={deleteRequest.kind === "holding" ? undefined : deleteRequest.item.name}
              onOpenChange={(open) => { if (!open) setDeleteRequest(null); }}
              onConfirm={confirmDelete}
            />
          )}

          {tradeRequest && (
            <TradeDialog
              key={`trade-${tradeRequest.holding.id}-${tradeRequest.type}`}
              open
              onOpenChange={(open) => { if (!open) setTradeRequest(null); }}
              holding={tradeRequest.holding}
              type={tradeRequest.type}
              onSubmit={handleTrade}
            />
          )}
        </div>
      </main>
    </div>
  );
}
