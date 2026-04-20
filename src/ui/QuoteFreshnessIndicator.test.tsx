/** @vitest-environment jsdom */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { act, render, cleanup } from "@testing-library/react";
import { QuoteFreshnessIndicator } from "./QuoteFreshnessIndicator";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe("QuoteFreshnessIndicator — AC-4 freshness transitions", () => {
  it("renders nothing when fetchedAt is null", () => {
    const { container } = render(<QuoteFreshnessIndicator fetchedAt={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("shows green dot + 'Just updated' for age < 10s", () => {
    const now = Date.now();
    vi.setSystemTime(now);
    const { container } = render(
      <QuoteFreshnessIndicator fetchedAt={now - 2000} />,
    );
    const dot = container.querySelector("span[aria-hidden='true']");
    expect(dot?.className).toContain("bg-green-500");
    expect(container.textContent).toContain("Just updated");
  });

  it("transitions to yellow dot after 10 seconds", () => {
    const now = Date.now();
    vi.setSystemTime(now);
    const { container } = render(
      <QuoteFreshnessIndicator fetchedAt={now} />,
    );
    // Advance 10s — setInterval tick should recompute age
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    const dot = container.querySelector("span[aria-hidden='true']");
    expect(dot?.className).toContain("bg-yellow-500");
    expect(container.textContent).toContain("s ago");
    expect(container.textContent).not.toContain("Just updated");
  });

  it("transitions to red dot + 'refreshing soon' after 20 seconds", () => {
    const now = Date.now();
    vi.setSystemTime(now);
    const { container } = render(
      <QuoteFreshnessIndicator fetchedAt={now} />,
    );
    act(() => {
      vi.advanceTimersByTime(20_000);
    });
    const dot = container.querySelector("span[aria-hidden='true']");
    expect(dot?.className).toContain("bg-red-500");
    expect(container.textContent).toContain("refreshing soon");
  });

  it("stays red with 'refreshing soon' at 29 seconds", () => {
    const now = Date.now();
    vi.setSystemTime(now);
    const { container } = render(
      <QuoteFreshnessIndicator fetchedAt={now} />,
    );
    act(() => {
      vi.advanceTimersByTime(29_000);
    });
    const dot = container.querySelector("span[aria-hidden='true']");
    expect(dot?.className).toContain("bg-red-500");
    expect(container.textContent).toContain("refreshing soon");
  });
});
