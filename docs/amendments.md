# Amendments

Implementation-time corrections to LOCKED architecture decisions. Each entry
records a contract drift that could not be avoided in the original story, the
reason it was necessary, and the code review finding that caught it.

---

## A-1 — 2026-04-20 — `OrderResponse.priceImpactPct` added

**Story:** 2-1 Jupiter Order Service + Quote Display
**Finding that caught it:** Code review #4 — priceImpactPct not in LOCKED contract
**Rule:** 3 (Significant — interface change)

**Original LOCKED contract (DD-2, story 2-1):**
```ts
OrderResponse {
  transaction: string | null;
  requestId: string;
  outAmount: string;
  router: string;
  mode: string;
  feeBps: number;
  feeMint: string;
}
```

**Amended contract:**
```ts
OrderResponse {
  transaction: string | null;
  requestId: string;
  outAmount: string;
  router: string;
  mode: string;
  feeBps: number;
  feeMint: string;
  priceImpactPct?: string;  // Optional — present on most Jupiter responses
}
```

**Why:**
AC-5 requires the `PriceImpactBadge` to color-code price impact against the
thresholds 100/500/1500 bps. `feeBps` measures protocol fee, not price impact —
the two quantities are unrelated. Jupiter's `/order` response returns
`priceImpactPct` as a percentage string (e.g. `"0.23"` for 0.23%); the UI must
consume that field to satisfy AC-5. The LOCKED contract omitted it.

**Defensive handling:**
The field is optional. When absent, `QuoteDisplay` renders an outline "N/A"
badge with `aria-label="Price impact unavailable"` — the UI must not silently
default a missing field to 0, which would imply a measured negligible impact.

**Files touched by this amendment:**
- `src/types/swap.ts:18` — field added
- `src/ui/QuoteDisplay.tsx:80-101` — explicit N/A fallback
- `src/ui/PriceImpactBadge.tsx` — consumes the parsed bps value

**Downstream impact:**
Any story that constructs an `OrderResponse` fixture must include
`priceImpactPct` if it wants the badge to render a bucket other than "N/A".
