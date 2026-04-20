/** @vitest-environment jsdom */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { PriceImpactBadge } from "./PriceImpactBadge";

afterEach(cleanup);

describe("PriceImpactBadge — AC-5 thresholds", () => {
  function renderBadge(impactBps: number) {
    const { container } = render(<PriceImpactBadge impactBps={impactBps} />);
    const badge = container.firstElementChild;
    if (!badge) throw new Error("Badge not rendered");
    return badge;
  }

  it("renders 'low' tone secondary variant for 0 bps", () => {
    const badge = renderBadge(0);
    expect(badge.getAttribute("data-tone")).toBe("low");
    expect(badge.textContent).toBe("< 0.1%");
    expect(badge.getAttribute("aria-label")).toBe("Price impact < 0.1%");
  });

  it("renders 'low' tone for 99 bps (just under 1%)", () => {
    const badge = renderBadge(99);
    expect(badge.getAttribute("data-tone")).toBe("low");
    expect(badge.textContent).toBe("1.0%");
  });

  it("renders 'elevated' tone (warning bg) at 100 bps (1%)", () => {
    const badge = renderBadge(100);
    expect(badge.getAttribute("data-tone")).toBe("elevated");
    expect(badge.className).toContain("bg-warning");
    expect(badge.textContent).toBe("1.0%");
  });

  it("renders 'elevated' tone for 499 bps (just under 5%)", () => {
    const badge = renderBadge(499);
    expect(badge.getAttribute("data-tone")).toBe("elevated");
    expect(badge.textContent).toBe("5.0%"); // 4.99 rounds to 5.0
  });

  it("renders 'cautionary' tone with '!' prefix at 500 bps (5%)", () => {
    const badge = renderBadge(500);
    expect(badge.getAttribute("data-tone")).toBe("cautionary");
    expect(badge.className).toContain("bg-warning");
    expect(badge.textContent).toContain("!");
    expect(badge.textContent).toContain("5.0%");
  });

  it("renders 'cautionary' tone for 1499 bps (just under 15%)", () => {
    const badge = renderBadge(1499);
    expect(badge.getAttribute("data-tone")).toBe("cautionary");
    expect(badge.textContent).toContain("!");
  });

  it("renders 'danger' tone destructive variant with warning glyph at 1500 bps (15%)", () => {
    const badge = renderBadge(1500);
    expect(badge.getAttribute("data-tone")).toBe("danger");
    expect(badge.textContent).toContain("⚠");
    expect(badge.textContent).toContain("15.0%");
  });

  it("renders 'danger' tone for very high impact (5000 bps / 50%)", () => {
    const badge = renderBadge(5000);
    expect(badge.getAttribute("data-tone")).toBe("danger");
    expect(badge.textContent).toContain("50.0%");
  });

  it("aria-label always matches visible text (no divergence at 0)", () => {
    const badge = renderBadge(0);
    const text = badge.textContent ?? "";
    const ariaLabel = badge.getAttribute("aria-label") ?? "";
    expect(ariaLabel).toContain(text);
  });
});
