import { useEffect, useState } from "react";

interface QuoteFreshnessIndicatorProps {
  fetchedAt: number | null;
}

export function QuoteFreshnessIndicator({
  fetchedAt,
}: QuoteFreshnessIndicatorProps) {
  const [age, setAge] = useState(0);

  useEffect(() => {
    if (fetchedAt === null) return;

    const update = () => {
      setAge(Math.floor((Date.now() - fetchedAt) / 1000));
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [fetchedAt]);

  if (fetchedAt === null) return null;

  let dotColor: string;
  let text: string;

  if (age < 10) {
    dotColor = "bg-green-500";
    text = "Just updated";
  } else if (age < 20) {
    dotColor = "bg-yellow-500";
    text = `${age}s ago`;
  } else {
    dotColor = "bg-red-500";
    text = `${age}s ago — refreshing soon`;
  }

  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span
        className={`inline-block size-2 rounded-full ${dotColor}`}
        aria-hidden="true"
      />
      <span>{text}</span>
    </div>
  );
}
