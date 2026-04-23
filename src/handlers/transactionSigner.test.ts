import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  MessageV0,
  VersionedTransaction,
  PublicKey,
} from "@solana/web3.js";
import type { WalletContextState } from "@solana/wallet-adapter-react";
import { ErrorType } from "../types/errors";
import { transactionSigner } from "./transactionSigner";

type SignFn = NonNullable<WalletContextState["signTransaction"]>;

function buildUnsignedBase64Tx(): string {
  // Minimal valid VersionedTransaction: zero-instruction MessageV0 with a stub
  // payer + blockhash. Works for round-trip serialization; never submitted.
  const payer = new PublicKey("11111111111111111111111111111111");
  const message = MessageV0.compile({
    payerKey: payer,
    recentBlockhash: "11111111111111111111111111111111",
    instructions: [],
  });
  const tx = new VersionedTransaction(message);
  const bytes = tx.serialize();
  // browser-standard base64 encode of a Uint8Array
  return btoa(String.fromCharCode(...bytes));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("transactionSigner.sign — happy path", () => {
  it("deserializes base64, calls wallet.signTransaction, returns re-serialized base64", async () => {
    const inputB64 = buildUnsignedBase64Tx();

    const signTransaction = vi.fn(async (tx) => {
      // Mock wallet: append a fake 64-byte signature to the existing slot
      (tx as VersionedTransaction).signatures[0] = new Uint8Array(64).fill(1);
      return tx;
    }) as unknown as SignFn;

    const outputB64 = await transactionSigner.sign(inputB64, { signTransaction });

    expect(signTransaction).toHaveBeenCalledTimes(1);
    expect(typeof outputB64).toBe("string");

    // Round-trip back through VersionedTransaction.deserialize to prove it's valid base64
    const bytes = Uint8Array.from(atob(outputB64), (c) => c.charCodeAt(0));
    const roundTripped = VersionedTransaction.deserialize(bytes);
    expect(roundTripped.signatures[0]).toEqual(new Uint8Array(64).fill(1));
  });
});

describe("transactionSigner.sign — rejection path", () => {
  it("throws SwapError(WalletRejected) when wallet.signTransaction rejects", async () => {
    const inputB64 = buildUnsignedBase64Tx();

    const signTransaction = vi.fn(async () => {
      throw new Error("User declined the signature request");
    });

    await expect(
      transactionSigner.sign(inputB64, { signTransaction }),
    ).rejects.toMatchObject({
      type: ErrorType.WalletRejected,
      message: "You rejected the signature request",
    });
  });

  it("throws SwapError(WalletRejected) when wallet.signTransaction rejects with WalletSignTransactionError", async () => {
    const inputB64 = buildUnsignedBase64Tx();

    // Simulate @solana/wallet-adapter-base's WalletSignTransactionError shape
    class WalletSignTransactionError extends Error {
      constructor() {
        super("Transaction signing rejected");
        this.name = "WalletSignTransactionError";
      }
    }
    const signTransaction = vi.fn(async () => {
      throw new WalletSignTransactionError();
    });

    await expect(
      transactionSigner.sign(inputB64, { signTransaction }),
    ).rejects.toMatchObject({
      type: ErrorType.WalletRejected,
    });
  });
});

describe("transactionSigner.sign — wallet capability missing", () => {
  it("throws SwapError(WalletNotConnected) when signTransaction is undefined", async () => {
    const inputB64 = buildUnsignedBase64Tx();

    await expect(
      transactionSigner.sign(inputB64, { signTransaction: undefined }),
    ).rejects.toMatchObject({
      type: ErrorType.WalletNotConnected,
      message: "Wallet does not support signing",
    });
  });
});
