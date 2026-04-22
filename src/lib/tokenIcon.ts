export function getTokenIconUrl(
  icon: string | undefined,
  size: number = 72,
): string | undefined {
  if (!icon) return undefined;
  return `https://wsrv.nl/?url=${encodeURIComponent(icon)}&w=${size}&h=${size}&fit=cover&output=webp`;
}
