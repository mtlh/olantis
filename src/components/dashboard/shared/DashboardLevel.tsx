import type { ReactNode } from "react";

export function DashboardLevel({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return <section aria-label={label} className="space-y-6">{children}</section>;
}
