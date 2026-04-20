import { Badge } from "@/components/ui/badge";

interface PriceImpactBadgeProps {
  impactBps: number;
}

type Bucket = {
  variant: "secondary" | "default" | "destructive";
  className?: string;
  prefix: string;
  tone: "low" | "elevated" | "cautionary" | "danger";
};

function bucketFor(impactBps: number): Bucket {
  if (impactBps >= 1500) {
    return { variant: "destructive", prefix: "⚠ ", tone: "danger" };
  }
  if (impactBps >= 500) {
    return {
      variant: "default",
      className: "bg-warning text-warning-foreground",
      prefix: "! ",
      tone: "cautionary",
    };
  }
  if (impactBps >= 100) {
    return {
      variant: "default",
      className: "bg-warning text-warning-foreground",
      prefix: "",
      tone: "elevated",
    };
  }
  return { variant: "secondary", prefix: "", tone: "low" };
}

function displayText(impactBps: number, prefix: string): string {
  if (impactBps < 10) return `${prefix}< 0.1%`;
  const percent = (impactBps / 100).toFixed(1);
  return `${prefix}${percent}%`;
}

export function PriceImpactBadge({ impactBps }: PriceImpactBadgeProps) {
  const bucket = bucketFor(impactBps);
  const text = displayText(impactBps, bucket.prefix);

  return (
    <Badge
      variant={bucket.variant}
      className={bucket.className}
      data-tone={bucket.tone}
      aria-label={`Price impact ${text}`}
    >
      {text}
    </Badge>
  );
}
