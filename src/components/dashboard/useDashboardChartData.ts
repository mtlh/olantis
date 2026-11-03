"use client";

import { useMemo } from "react";
import { resolvePortfolioColor } from "@/lib/colors";
import { chartDateLabel, filterByRange, holdingValueGBP, todayISODate, valueByDate, type FxRates } from "@/lib/format";
import type { Account, Portfolio, Provider, Snapshot, Transaction } from "@/lib/store";
import type { PerformanceSeries } from "@/components/dashboard/PerformanceChart";
import type { ValueTimeChartDot, ValueTimeChartRow, ValueTimeChartSeries } from "@/components/dashboard/ValueTimeChart";
import type { ChartRange } from "@/components/dashboard/shared/ChartRangeSelector";

type PortfolioHistory = Record<string, { name: string; data: Snapshot[] }>;

type UseDashboardChartDataProps = {
  activePortfolio: Portfolio | null;
  activeProvider: Provider | null;
  providerHistory: Snapshot[];
  providerValue: number;
  snapshots: Snapshot[];
  byPortfolio: PortfolioHistory;
  transactions: Transaction[];
  portfolios: Portfolio[];
  providers: Provider[];
  accounts: Account[];
  totalValue: number;
  fxRates: FxRates;
  range: ChartRange;
};

const CHART_COLORS = ["#60a5fa", "#34d399", "#f472b6", "#facc15", "#a78bfa", "#fb7185", "#38bdf8", "#f97316"];

export function useDashboardChartData({
  activePortfolio,
  activeProvider,
  providerHistory,
  providerValue,
  snapshots,
  byPortfolio,
  transactions,
  portfolios,
  providers,
  accounts,
  totalValue,
  fxRates,
  range,
}: UseDashboardChartDataProps) {
  const filteredSnapshots = useMemo(() => filterByRange(snapshots, range), [snapshots, range]);

  const chartData = useMemo<ValueTimeChartRow[]>(() => {
    if (activeProvider) {
      const history = filterByRange(providerHistory, range);
      if (!history.length) {
        const dateISO = todayISODate();
        return [{ date: chartDateLabel(dateISO), dateISO, total: providerValue }];
      }
      return history.map((snapshot) => ({ date: chartDateLabel(snapshot.date), dateISO: snapshot.date, total: snapshot.value }));
    }

    if (activePortfolio) {
      const history = filterByRange(byPortfolio[activePortfolio.id]?.data ?? [], range);
      if (!history.length) {
        const dateISO = todayISODate();
        const value = activePortfolio.holdings.reduce((sum, holding) => sum + holdingValueGBP(holding, fxRates), 0);
        return [{ date: chartDateLabel(dateISO), dateISO, total: value }];
      }
      return history.map((snapshot) => ({ date: chartDateLabel(snapshot.date), dateISO: snapshot.date, total: snapshot.value }));
    }

    if (!filteredSnapshots.length) {
      const dateISO = todayISODate();
      return [{ date: chartDateLabel(dateISO), dateISO, total: totalValue }];
    }

    const seriesMaps = Object.values(byPortfolio).map((info) => ({ name: info.name, values: valueByDate(info.data) }));

    return filteredSnapshots.map((snapshot) => {
      const row: ValueTimeChartRow = {
        date: chartDateLabel(snapshot.date),
        dateISO: snapshot.date,
        total: snapshot.value,
      };
      for (const series of seriesMaps) {
        const portfolioValue = series.values.get(snapshot.date);
        if (portfolioValue != null) row[series.name] = portfolioValue;
      }
      return row;
    });
  }, [activePortfolio, activeProvider, byPortfolio, filteredSnapshots, fxRates, providerHistory, providerValue, range, totalValue]);

  const chartDots = useMemo<ValueTimeChartDot[]>(() => {
    if (!chartData.length) return [];
    const valueByDate = new Map(chartData.map((point) => [point.date, point.total]));
    return transactions.flatMap((transaction) => {
      const date = chartDateLabel(transaction.date);
      const value = valueByDate.get(date);
      return value == null ? [] : [{ x: date, y: value, type: transaction.type, symbol: transaction.symbol, date: transaction.date }];
    });
  }, [chartData, transactions]);

  const overviewSeries = useMemo<ValueTimeChartSeries[]>(() => Object.entries(byPortfolio).map(([portfolioId, info], index) => {
    const portfolio = portfolios.find((item) => item.id === portfolioId);
    return {
      key: portfolioId,
      dataKey: info.name,
      name: info.name,
      color: portfolio ? resolvePortfolioColor(portfolio, portfolios, providers, accounts) : CHART_COLORS[index % CHART_COLORS.length],
    };
  }), [accounts, byPortfolio, portfolios, providers]);

  const performanceSeries = useMemo<PerformanceSeries[]>(() => overviewSeries.map(({ key, name, color }) => ({ key, name, color })), [overviewSeries]);

  return { chartData, chartDots, overviewSeries, performanceSeries };
}
