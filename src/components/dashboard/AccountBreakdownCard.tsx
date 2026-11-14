import { fmtGBP, percentOf, plural } from "@/lib/format";
import { ProviderIcon } from "@/components/BrandIcon";
import { EmptyState } from "@/components/shared/EmptyState";
import { SectionHeading } from "@/components/shared/SectionHeading";
import { SignedValue } from "@/components/shared/SignedValue";
import type { AccountBreakdownRow } from "@/components/dashboard/usePortfolioOverviewInsights";

type AccountBreakdownCardProps = {
  accounts: AccountBreakdownRow[];
  totalValue: number;
  onOpenAccount: (id: string) => void;
  onOpenProvider: (id: string) => void;
  onOpenPortfolio: (id: string) => void;
};

export function AccountBreakdownCard({ accounts, totalValue, onOpenAccount, onOpenProvider, onOpenPortfolio }: AccountBreakdownCardProps) {
  return (
    <section className="min-w-0 xl:col-span-2 xl:pr-8" aria-labelledby="accounts-heading">
      <SectionHeading
        id="accounts-heading"
        title="Accounts & providers"
        meta={plural(accounts.length, "account")}
      />

      {accounts.length === 0 ? (
        <EmptyState bordered size="sm" title="Create an account to organize your portfolios." />
      ) : (
        <>
          <div className="grid grid-cols-[minmax(0,1fr)_5rem_6.5rem] gap-3 border-y border-white/[0.06] px-1 py-2 text-[10px] uppercase tracking-[0.12em] text-zinc-600">
            <span>Account</span>
            <span className="text-right">Value</span>
            <span className="whitespace-nowrap text-right">Unrealized P/L</span>
          </div>
          <div className="divide-y divide-white/[0.05]">
            {accounts.map((account) => (
              <div key={account.id}>
                <button type="button" onClick={() => onOpenAccount(account.id)} className="grid w-full grid-cols-[minmax(0,1fr)_5rem_6.5rem] items-center gap-3 px-1 py-3.5 text-left transition-colors hover:bg-white/[0.025]">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-white">{account.name}</span>
                    <span className="mt-0.5 block text-[11px] tabular-nums text-zinc-600">{percentOf(account.value, totalValue)} of total</span>
                  </span>
                  <span className="text-right text-sm tabular-nums text-zinc-200">{fmtGBP(account.value)}</span>
                  <SignedValue value={account.gain} className="text-right text-xs" />
                </button>
                {account.children.map((child) => child.kind === "direct" ? (
                  <div key={`${account.id}-direct`} className="grid grid-cols-[minmax(0,1fr)_5rem_6.5rem] items-center gap-3 px-1 py-2 text-xs text-zinc-500">
                    <span className="min-w-0 truncate pl-6">Direct holdings</span>
                    <span className="text-right tabular-nums text-zinc-400">{fmtGBP(child.value)}</span>
                    <SignedValue value={child.gain} className="text-right text-xs" />
                  </div>
                ) : (
                  <button key={child.id} type="button" onClick={() => child.kind === "provider" ? onOpenProvider(child.id) : onOpenPortfolio(child.id)} className="grid w-full grid-cols-[minmax(0,1fr)_5rem_6.5rem] items-center gap-3 px-1 py-2 text-left transition-colors hover:bg-white/[0.025]">
                    <span className="flex min-w-0 items-center gap-2 pl-6">
                      {child.kind === "provider" && <ProviderIcon provider={{ name: child.name, icon: child.icon }} size={16} />}
                      <span className="min-w-0 truncate text-xs text-zinc-400">{child.name}</span>
                    </span>
                    <span className="text-right text-xs tabular-nums text-zinc-400">{fmtGBP(child.value)}</span>
                    <SignedValue value={child.gain} className="text-right text-xs" />
                  </button>
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
