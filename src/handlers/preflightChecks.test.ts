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
    vi.mocked(bal.getSolBalance).mockResolvedValue(0.5); // above 0.01 UI
    vi.mocked(bal.getTokenBalance).mockResolvedValue(2); // 2 SOL held (amount is 1 SOL)

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
    await expect(preflight.run(validParams, connectedWallet)).resolves.toBeUndefined();
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
