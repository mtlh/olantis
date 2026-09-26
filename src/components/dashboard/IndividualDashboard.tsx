import type { ReactNode } from "react";
import { DashboardLevel } from "@/components/dashboard/shared/DashboardLevel";
import { StockDetail } from "@/components/StockDetail";
import type { Holding } from "@/lib/store";

type IndividualDashboardProps = {
  holding: Holding;
  portfolioId: string | null;
  portfolioName?: string;
  color: string;
  onBack: () => void;
  onBuy: () => void;
  onSell: () => void;
  onAddToPortfolio: () => void;
  children?: ReactNode;
};

export function IndividualDashboard({
  holding,
  portfolioId,
  portfolioName,
  color,
  onBack,
  onBuy,
  onSell,
  onAddToPortfolio,
  children,
}: IndividualDashboardProps) {
  return (
    <DashboardLevel label={`${holding.symbol} holding`}>
      <StockDetail
        holding={holding}
        portfolioId={portfolioId}
        portfolioName={portfolioName}
        color={color}
        onBack={onBack}
        onBuy={onBuy}
        onSell={onSell}
        onAddToPortfolio={onAddToPortfolio}
      />
      {children}
    </DashboardLevel>
  );
}
