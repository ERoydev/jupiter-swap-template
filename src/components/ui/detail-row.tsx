import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function DetailRow({
  label,
  value,
  action,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-slot="detail-row"
      className={cn(
        "flex items-center justify-between gap-4 text-sm",
        className,
      )}
    >
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="flex items-center gap-1.5 text-right">
        {value}
        {action}
      </span>
    </div>
  );
}

export function DetailList({
  children,
  className,
  bordered = false,
}: {
  children: ReactNode;
  className?: string;
  bordered?: boolean;
}) {
  return (
    <div
      data-slot="detail-list"
      className={cn(
        "space-y-2",
        bordered && "rounded-lg border border-border p-4",
        className,
      )}
    >
      {children}
    </div>
  );
}
