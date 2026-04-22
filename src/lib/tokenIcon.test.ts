import { describe, it, expect } from "vitest";
import { getTokenIconUrl } from "./tokenIcon";

describe("getTokenIconUrl", () => {
  it("returns undefined when icon is undefined", () => {
    expect(getTokenIconUrl(undefined)).toBeUndefined();
  });

  it("returns a wsrv.nl URL with default size 72", () => {
    const result = getTokenIconUrl("https://foo.com/icon.png");
    expect(result).toBe(
      "https://wsrv.nl/?url=https%3A%2F%2Ffoo.com%2Ficon.png&w=72&h=72&fit=cover&output=webp",
    );
  });

  it("uses the custom size parameter for both w and h", () => {
    const result = getTokenIconUrl("https://foo.com/icon.png", 128);
    expect(result).toContain("&w=128&h=128");
  });

  it("encodes URL special characters such as ? and &", () => {
    const url = "https://cdn.example.com/token?id=abc&format=png";
    const result = getTokenIconUrl(url);
    expect(result).toContain(encodeURIComponent(url));
    // raw ? and & must not appear in the encoded segment
    const encodedSegment = result!.replace(
      "https://wsrv.nl/?url=",
      "",
    ).split("&w=")[0];
    expect(encodedSegment).not.toContain("?");
    expect(encodedSegment).not.toContain("&");
  });
});
