/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { TokenIcon } from "./TokenIcon";
import type { TokenInfo } from "../../types/tokens";

afterEach(cleanup);

const BASE_TOKEN: TokenInfo = {
  id: "So11111111111111111111111111111111111111112",
  name: "Wrapped SOL",
  symbol: "SOL",
  decimals: 9,
  icon: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png",
  isVerified: true,
};

describe("TokenIcon — tier 0: wsrv URL", () => {
  it("renders an img with the wsrv.nl URL when token.icon is set", () => {
    const { container } = render(<TokenIcon token={BASE_TOKEN} />);
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img!.src).toContain("wsrv.nl");
    expect(img!.src).toContain(encodeURIComponent(BASE_TOKEN.icon!));
  });
});

describe("TokenIcon — tier 1: raw URL fallback", () => {
  it("switches to raw icon URL after first onError", () => {
    const { container } = render(<TokenIcon token={BASE_TOKEN} />);
    const img = container.querySelector("img")!;
    fireEvent.error(img);
    expect(img.src).toBe(BASE_TOKEN.icon!);
  });
});

describe("TokenIcon — tier 2: SVG fallback", () => {
  it("renders inline SVG with first letter after second onError", () => {
    const { container } = render(<TokenIcon token={BASE_TOKEN} />);
    const img = container.querySelector("img")!;
    fireEvent.error(img);
    // Second error on the raw URL img
    fireEvent.error(img);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg!.textContent).toContain("S"); // first letter of SOL
  });

  it("renders SVG immediately when token.icon is undefined", () => {
    const noIconToken: TokenInfo = { ...BASE_TOKEN, icon: undefined };
    const { container } = render(<TokenIcon token={noIconToken} />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg!.textContent).toContain("S");
  });
});

describe("TokenIcon — unverified warning overlay", () => {
  it("renders AlertTriangle with aria-label when token is unverified and has no strict/community tags", () => {
    const unverifiedToken: TokenInfo = {
      ...BASE_TOKEN,
      isVerified: false,
      tags: [],
    };
    const { container } = render(<TokenIcon token={unverifiedToken} />);
    const warning = container.querySelector('[aria-label="Unverified token — caution"]');
    expect(warning).not.toBeNull();
  });

  it("does not render warning overlay when token is verified", () => {
    const { container } = render(<TokenIcon token={BASE_TOKEN} />);
    const warning = container.querySelector('[aria-label="Unverified token — caution"]');
    expect(warning).toBeNull();
  });

  it("does not render warning overlay when unverified but has strict tag", () => {
    const strictToken: TokenInfo = {
      ...BASE_TOKEN,
      isVerified: false,
      tags: ["strict"],
    };
    const { container } = render(<TokenIcon token={strictToken} />);
    const warning = container.querySelector('[aria-label="Unverified token — caution"]');
    expect(warning).toBeNull();
  });

  it("does not render warning overlay when unverified but has community tag", () => {
    const communityToken: TokenInfo = {
      ...BASE_TOKEN,
      isVerified: false,
      tags: ["community"],
    };
    const { container } = render(<TokenIcon token={communityToken} />);
    const warning = container.querySelector('[aria-label="Unverified token — caution"]');
    expect(warning).toBeNull();
  });
});
