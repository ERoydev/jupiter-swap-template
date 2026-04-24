import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PublicKey } from "@solana/web3.js";
import { ErrorType } from "../types/errors";

vi.mock("../services/balanceService", () => ({
  balanceService: {
    getSolBalance: vi.fn(),
    getTokenBalance: vi.fn(),
  },
}));

async function loadHandler() {
  const mod = await import("./preflightChecks");
  return mod.preflightChecks;
}

async function loadMockBalance() {
  const mod = await import("../services/balanceService");
  return mod.balanceService;
}

function makePublicKey(base58 = "So11111111111111111111111111111111111111112"): PublicKey {
  return { toBase58: () => base58 } as unknown as PublicKey;
}

const SOL_MINT = "So11111111111111111111111111111111111111112";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

const validParams = {
  inputMint: SOL_MINT,
  outputMint: USDC_MINT,
  amount: "1000000000", // 1 SOL in lamports
  inputDecimals: 9,
  inputSymbol: "SOL",
};

const connectedWallet = {
  connected: true,
  publicKey: makePublicKey(),
};

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe("preflightChecks.run — happy path (all 7 checks pass)", () => {
  it("resolves void when every check passes", async () => {
    const bal = await loadMockBalance();
    // A-8: with wSOL aliasing check 7 reads getSolBalance; need >= 1 UI SOL.
    vi.mocked(bal.getSolBalance).mockResolvedValue(5);
    vi.mocked(bal.getTokenBalance).mockResolvedValue(2);

    const preflight = await loadHandler();
    await expect(preflight.run(validParams, connectedWallet)).resolves.toBeUndefined();
  });
});

describe("preflightChecks.run — check 1: wallet connection", () => {
  it("throws WalletNotConnected when wallet.connected is false", async () => {
    const preflight = await loadHandler();
    await expect(
      preflight.run(validParams, { connected: false, publicKey: makePublicKey() }),
    ).rejects.toMatchObject({
      type: ErrorType.WalletNotConnected,
      message: "Connect a wallet to continue",
    });
  });

  it("throws WalletNotConnected when wallet.publicKey is null", async () => {
    const preflight = await loadHandler();
    await expect(
      preflight.run(validParams, { connected: true, publicKey: null }),
    ).rejects.toMatchObject({ type: ErrorType.WalletNotConnected });
  });
});

describe("preflightChecks.run — check 2: positive amount", () => {
  it.each([
    ["0", "zero"],
    ["-1", "negative"],
    ["abc", "NaN"],
    ["", "empty"],
  ])("throws InvalidInput 'Enter a positive amount' when amount is %s (%s)", async (amount) => {
    const preflight = await loadHandler();
    await expect(
      preflight.run({ ...validParams, amount }, connectedWallet),
    ).rejects.toMatchObject({
      type: ErrorType.InvalidInput,
      message: "Enter a positive amount",
    });
  });
});

describe("preflightChecks.run — check 3: input mint valid", () => {
  it("throws InvalidInput 'Invalid input token address' on bad base58", async () => {
    const preflight = await loadHandler();
    await expect(
      preflight.run({ ...validParams, inputMint: "not-a-mint" }, connectedWallet),
    ).rejects.toMatchObject({
      type: ErrorType.InvalidInput,
      message: "Invalid input token address",
    });
  });
});

describe("preflightChecks.run — check 4: output mint valid", () => {
  it("throws InvalidInput 'Invalid output token address' on bad base58", async () => {
    const preflight = await loadHandler();
    await expect(
      preflight.run({ ...validParams, outputMint: "bogus" }, connectedWallet),
    ).rejects.toMatchObject({
      type: ErrorType.InvalidInput,
      message: "Invalid output token address",
    });
  });
});

describe("preflightChecks.run — check 5: not same token", () => {
  it("throws InvalidInput 'Cannot swap a token to itself' when mints match", async () => {
    const preflight = await loadHandler();
    await expect(
      preflight.run({ ...validParams, outputMint: SOL_MINT }, connectedWallet),
    ).rejects.toMatchObject({
      type: ErrorType.InvalidInput,
      message: "Cannot swap a token to itself",
    });
  });
});

describe("preflightChecks.run — check 6: enough SOL", () => {
  it("throws InsufficientSOL when SOL balance is below MIN_SOL_BALANCE_UI (0.01)", async () => {
    const bal = await loadMockBalance();
    vi.mocked(bal.getSolBalance).mockResolvedValue(0.005); // below 0.01

    const preflight = await loadHandler();
    await expect(preflight.run(validParams, connectedWallet)).rejects.toMatchObject({
      type: ErrorType.InsufficientSOL,
      message: "You need at least 0.01 SOL for transaction fees",
    });
  });

  it("passes check 6 when SOL balance equals MIN_SOL_BALANCE_UI exactly", async () => {
    const bal = await loadMockBalance();
    vi.mocked(bal.getSolBalance).mockResolvedValue(0.01);
    vi.mocked(bal.getTokenBalance).mockResolvedValue(100);

    const preflight = await loadHandler();
    // Use USDC as input so check 7 reads getTokenBalance (not aliased). This
    // isolates the test's intent to check 6's boundary condition.
    await expect(
      preflight.run(
        {
          ...validParams,
          inputMint: USDC_MINT,
          outputMint: SOL_MINT,
          inputSymbol: "USDC",
          inputDecimals: 6,
          amount: "100000", // 0.1 USDC
        },
        connectedWallet,
      ),
    ).resolves.toBeUndefined();
  });
});

describe("preflightChecks.run — check 7: wSOL mint aliases to native SOL (A-8)", () => {
  it("aliases to getSolBalance when inputMint is the wSOL mint (passes when SOL >= amount)", async () => {
    const bal = await loadMockBalance();
    vi.mocked(bal.getSolBalance).mockResolvedValue(5); // has 5 SOL
    vi.mocked(bal.getTokenBalance).mockResolvedValue(0); // would fail if used

    const preflight = await loadHandler();
    await expect(preflight.run(validParams, connectedWallet)).resolves.toBeUndefined();
    // getSolBalance called twice: once for check 6, once for aliased check 7.
    expect(bal.getSolBalance).toHaveBeenCalledTimes(2);
    expect(bal.getTokenBalance).not.toHaveBeenCalled();
  });

  it("throws InsufficientBalance when wSOL mint input exceeds SOL balance", async () => {
    const bal = await loadMockBalance();
    // 0.5 SOL covers check 6 (>= 0.01) but < 1 SOL amount → check 7 fails.
    vi.mocked(bal.getSolBalance).mockResolvedValue(0.5);
    vi.mocked(bal.getTokenBalance).mockResolvedValue(999); // irrelevant

    const preflight = await loadHandler();
    await expect(preflight.run(validParams, connectedWallet)).rejects.toMatchObject({
      type: ErrorType.InsufficientBalance,
      message: "Insufficient SOL balance",
    });
    expect(bal.getTokenBalance).not.toHaveBeenCalled();
  });

  it("still uses getTokenBalance for non-SOL input mints", async () => {
    const bal = await loadMockBalance();
    vi.mocked(bal.getSolBalance).mockResolvedValue(0.5); // fees only
    vi.mocked(bal.getTokenBalance).mockResolvedValue(2);

    const preflight = await loadHandler();
    await expect(
      preflight.run(
        {
          ...validParams,
          inputMint: USDC_MINT,
          outputMint: SOL_MINT,
          inputSymbol: "USDC",
          inputDecimals: 6,
          amount: "1000000", // 1 USDC
        },
        connectedWallet,
      ),
    ).resolves.toBeUndefined();
    // getSolBalance called once for check 6; getTokenBalance called once for check 7.
    expect(bal.getSolBalance).toHaveBeenCalledTimes(1);
    expect(bal.getTokenBalance).toHaveBeenCalledTimes(1);
  });
});

describe("preflightChecks.run — check 7: enough input token", () => {
  it("throws InsufficientBalance with interpolated symbol when token balance < amount", async () => {
    const bal = await loadMockBalance();
    vi.mocked(bal.getSolBalance).mockResolvedValue(0.5);
    vi.mocked(bal.getTokenBalance).mockResolvedValue(0.5); // wants 1 SOL, has 0.5

    const preflight = await loadHandler();
    await expect(preflight.run(validParams, connectedWallet)).rejects.toMatchObject({
      type: ErrorType.InsufficientBalance,
      message: "Insufficient SOL balance",
    });
  });

  it("uses the inputSymbol provided in params for the error message", async () => {
    const bal = await loadMockBalance();
    vi.mocked(bal.getSolBalance).mockResolvedValue(0.5);
    vi.mocked(bal.getTokenBalance).mockResolvedValue(0);

    const preflight = await loadHandler();
    await expect(
      preflight.run(
        {
          ...validParams,
          inputMint: USDC_MINT,
          outputMint: SOL_MINT,
          inputSymbol: "USDC",
          inputDecimals: 6,
        },
        connectedWallet,
      ),
    ).rejects.toMatchObject({
      type: ErrorType.InsufficientBalance,
      message: "Insufficient USDC balance",
    });
  });
});

describe("preflightChecks.run — fail-fast ordering", () => {
  it("stops at check 1 (wallet) without calling balanceService", async () => {
    const bal = await loadMockBalance();
    const preflight = await loadHandler();

    await expect(
      preflight.run(validParams, { connected: false, publicKey: null }),
    ).rejects.toMatchObject({ type: ErrorType.WalletNotConnected });

    expect(bal.getSolBalance).not.toHaveBeenCalled();
    expect(bal.getTokenBalance).not.toHaveBeenCalled();
  });

  it("stops at check 6 (SOL) without calling getTokenBalance for check 7", async () => {
    const bal = await loadMockBalance();
    vi.mocked(bal.getSolBalance).mockResolvedValue(0.001); // fails check 6

    const preflight = await loadHandler();
    await expect(preflight.run(validParams, connectedWallet)).rejects.toMatchObject({
      type: ErrorType.InsufficientSOL,
    });

    expect(bal.getTokenBalance).not.toHaveBeenCalled();
  });
});
