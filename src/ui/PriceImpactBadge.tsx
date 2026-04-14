import { Badge } from "@/components/ui/badge";

interface PriceImpactBadgeProps {
  impactBps: number;
}

export function PriceImpactBadge({ impactBps }: PriceImpactBadgeProps) {
  const percent = (impactBps / 100).toFixed(1);

  if (impactBps >= 1500) {
    return (
      <Badge variant="destructive" aria-label={`High price impact: ${percent}%`}>
        ⚠ {percent}%
      </Badge>
    );
  }

  if (impactBps >= 500) {
    return (
      <Badge className="bg-amber-500 text-white" aria-label={`Cautionary price impact: ${percent}%`}>
        ⚠ {percent}%
      </Badge>
    );
  }

  if (impactBps >= 100) {
    return (
      <Badge variant="secondary" aria-label={`Price impact: ${percent}%`}>
        {percent}%
      </Badge>
    );
  }

  return (
    <Badge variant="outline" aria-label={`Low price impact: less than ${percent}%`}>
      {"< 0.1%"}
    </Badge>
  );
}
