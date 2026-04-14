import { describe, it, expect } from "vitest";
import { mapErrorCode } from "./jupiterErrorMapper";
import { ErrorType } from "../types/errors";

describe("mapErrorCode", () => {
  // EC-02: Code -1 → retryable OrderFailed
  it("maps code -1 to retryable OrderFailed", () => {
    const result = mapErrorCode(-1);
    expect(result.type).toBe(ErrorType.OrderFailed);
    expect(result.retryable).toBe(true);
    expect(result.message).toBeTruthy();
  });

  // EC-03: Code -2 → non-retryable ExecutionFailed
  it("maps code -2 to non-retryable ExecutionFailed", () => {
    const result = mapErrorCode(-2);
    expect(result.type).toBe(ErrorType.ExecutionFailed);
    expect(result.retryable).toBe(false);
  });

  // EC-04: Code -3 → non-retryable ExecutionFailed
  it("maps code -3 to non-retryable ExecutionFailed", () => {
    const result = mapErrorCode(-3);
    expect(result.type).toBe(ErrorType.ExecutionFailed);
    expect(result.retryable).toBe(false);
  });

  // EC-05: Code -1000 → retryable TransactionExpired
  it("maps code -1000 to retryable TransactionExpired", () => {
    const result = mapErrorCode(-1000);
    expect(result.type).toBe(ErrorType.TransactionExpired);
    expect(result.retryable).toBe(true);
  });

  // EC-06: Code -1001 → non-retryable UnknownError
  it("maps code -1001 to non-retryable UnknownError", () => {
    const result = mapErrorCode(-1001);
    expect(result.type).toBe(ErrorType.UnknownError);
    expect(result.retryable).toBe(false);
  });

  // EC-07: Code -1002 → non-retryable ExecutionFailed
  it("maps code -1002 to non-retryable ExecutionFailed", () => {
    const result = mapErrorCode(-1002);
    expect(result.type).toBe(ErrorType.ExecutionFailed);
    expect(result.retryable).toBe(false);
  });

  // EC-08: Code -1003 → non-retryable ExecutionFailed
  it("maps code -1003 to non-retryable ExecutionFailed", () => {
    const result = mapErrorCode(-1003);
    expect(result.type).toBe(ErrorType.ExecutionFailed);
    expect(result.retryable).toBe(false);
  });

  // EC-09: Code -1004 → retryable TransactionExpired
  it("maps code -1004 to retryable TransactionExpired", () => {
    const result = mapErrorCode(-1004);
    expect(result.type).toBe(ErrorType.TransactionExpired);
    expect(result.retryable).toBe(true);
  });

  // EC-10: Code -2000 → retryable TransactionExpired
  it("maps code -2000 to retryable TransactionExpired", () => {
    const result = mapErrorCode(-2000);
    expect(result.type).toBe(ErrorType.TransactionExpired);
    expect(result.retryable).toBe(true);
  });

  // EC-11: Code -2001 → non-retryable UnknownError
  it("maps code -2001 to non-retryable UnknownError", () => {
    const result = mapErrorCode(-2001);
    expect(result.type).toBe(ErrorType.UnknownError);
    expect(result.retryable).toBe(false);
  });

  // EC-12: Code -2002 → non-retryable ExecutionFailed
  it("maps code -2002 to non-retryable ExecutionFailed", () => {
    const result = mapErrorCode(-2002);
    expect(result.type).toBe(ErrorType.ExecutionFailed);
    expect(result.retryable).toBe(false);
  });

  // EC-13: Code -2003 → retryable TransactionExpired
  it("maps code -2003 to retryable TransactionExpired", () => {
    const result = mapErrorCode(-2003);
    expect(result.type).toBe(ErrorType.TransactionExpired);
    expect(result.retryable).toBe(true);
  });

  // EC-14: Code -2004 → non-retryable ExecutionFailed
  it("maps code -2004 to non-retryable ExecutionFailed", () => {
    const result = mapErrorCode(-2004);
    expect(result.type).toBe(ErrorType.ExecutionFailed);
    expect(result.retryable).toBe(false);
  });

  // EC-15: Unknown code → non-retryable UnknownError
  it("maps unknown code to non-retryable UnknownError", () => {
    const result = mapErrorCode(9999);
    expect(result.type).toBe(ErrorType.UnknownError);
    expect(result.retryable).toBe(false);
    expect(result.message).toBeTruthy();
  });

  // EC-16: All 14 codes produce non-empty message
  it("produces non-empty message for every known code", () => {
    const codes = [-1, -2, -3, -1000, -1001, -1002, -1003, -1004, -2000, -2001, -2002, -2003, -2004];
    for (const code of codes) {
      const result = mapErrorCode(code);
      expect(result.message.length).toBeGreaterThan(0);
    }
  });

  // Retryable codes summary check
  it("classifies exactly 5 codes as retryable", () => {
    const retryableCodes = [-1, -1000, -1004, -2000, -2003];
    const nonRetryableCodes = [-2, -3, -1001, -1002, -1003, -2001, -2002, -2004];

    for (const code of retryableCodes) {
      expect(mapErrorCode(code).retryable).toBe(true);
    }
    for (const code of nonRetryableCodes) {
      expect(mapErrorCode(code).retryable).toBe(false);
    }
  });
});
