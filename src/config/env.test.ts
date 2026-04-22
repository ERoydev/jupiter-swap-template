import { describe, it, expect, vi, beforeEach } from "vitest";

describe("env validation", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("throws when VITE_SOLANA_RPC_URL is missing", async () => {
    vi.stubEnv("VITE_SOLANA_RPC_URL", "");
    vi.stubEnv("VITE_JUPITER_API_URL", "https://api.jup.ag");
    vi.stubEnv("VITE_JUPITER_API_KEY", "test-key");
    await expect(() => import("./env")).rejects.toThrow("VITE_SOLANA_RPC_URL");
  });

  it("throws when VITE_JUPITER_API_URL is missing", async () => {
    vi.stubEnv("VITE_SOLANA_RPC_URL", "https://api.mainnet-beta.solana.com");
    vi.stubEnv("VITE_JUPITER_API_URL", "");
    vi.stubEnv("VITE_JUPITER_API_KEY", "test-key");
    await expect(() => import("./env")).rejects.toThrow("VITE_JUPITER_API_URL");
  });

  it("does NOT throw when VITE_JUPITER_API_KEY is absent — key is optional", async () => {
    vi.stubEnv("VITE_SOLANA_RPC_URL", "https://api.mainnet-beta.solana.com");
    vi.stubEnv("VITE_JUPITER_API_URL", "https://api.jup.ag");
    vi.stubEnv("VITE_JUPITER_API_KEY", "");
    const env = await import("./env");
    expect(env.JUPITER_API_KEY).toBe("");
  });

  it("exports correct values when all env vars are set", async () => {
    vi.stubEnv("VITE_SOLANA_RPC_URL", "https://api.mainnet-beta.solana.com");
    vi.stubEnv("VITE_JUPITER_API_URL", "https://api.jup.ag");
    vi.stubEnv("VITE_JUPITER_API_KEY", "test-key-123");
    const env = await import("./env");
    expect(env.SOLANA_RPC_URL).toBe("https://api.mainnet-beta.solana.com");
    expect(env.JUPITER_API_URL).toBe("https://api.jup.ag");
    expect(env.JUPITER_API_KEY).toBe("test-key-123");
  });
});
