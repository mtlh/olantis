import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type PageHeaderProps = {
  title: ReactNode;
  /** Optional leading mark, e.g. a provider or brand icon. */
  icon?: ReactNode;
  /** Supporting copy under the title. */
  description?: ReactNode;
  /** Extra title-adjacent metadata, such as the parent account name. */
  titleAdornment?: ReactNode;
  /** Right-aligned actions. */
  actions?: ReactNode;
  /** Secondary metadata that only shows on small screens. */
  mobileDescription?: ReactNode;
  /** Content rendered under the header, e.g. an inline "create first" hint. */
  below?: ReactNode;
  className?: string;
  titleClassName?: string;
  descriptionClassName?: string;
};

/**
 * One header pattern for every page and dashboard drill-down: icon + title +
 * actions, then metadata. Keeping this in one place means the overview, account,
 * provider, portfolio and holding levels all line up.
 */
export function PageHeader({
  title,
  icon,
  description,
  titleAdornment,
  actions,
  mobileDescription,
  below,
  className,
  titleClassName,
  descriptionClassName,
}: PageHeaderProps) {
  return (
    <header className={className}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 items-center gap-3">
          {icon}
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className={cn("min-w-0 text-[28px] font-semibold leading-none tracking-tight text-white", titleClassName)}>
              {title}
            </h1>
            {titleAdornment}
          </div>
        </div>
        {actions != null && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {description != null && (
        <div className={cn("mt-2 text-xs text-zinc-400", descriptionClassName)}>{description}</div>
      )}
      {mobileDescription != null && <div className="mt-1 text-[11px] text-zinc-400 lg:hidden">{mobileDescription}</div>}
      {below}
    </header>
  );
}
