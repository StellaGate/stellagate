import { describe, expect, it } from "vitest";
import { Memo } from "@stellar/stellar-sdk";
import { validateMemo, type MemoType } from "../src/memo.js";

describe("validateMemo SDK evidence", () => {
  const cases: [MemoType, string, boolean][] = [
    ["text", "", true],
    ["text", "x".repeat(28), true],
    ["text", "x".repeat(29), false],
    ["text", "é".repeat(14), true],
    ["text", "é".repeat(14) + "x", false],
    ["text", "\u{1D11E}".repeat(7), true],
    ["text", "\u{1D11E}".repeat(7) + "x", false],
    ["text", "-5", true],
    ["id", "0", true],
    ["id", "0001", true],
    ["id", "18446744073709551615", true],
    ["id", "18446744073709551616", false],
    ["id", "", false],
    ["id", "-5", false],
    ["id", "+5", false],
    ["id", "1.5", false],
    ["id", " 5", false],
    ["id", "5 ", false],
    ["id", "0x10", false],
    ["hash", "a".repeat(63), false],
    ["hash", "aB09".repeat(16), true],
    ["hash", "a".repeat(65), false],
    ["hash", "g".repeat(64), false],
    ["hash", "", false],
  ];

  it.each(cases)("validates %s memo %j with SDK/XDR agreement: %s", (type, value, valid) => {
    expect(validateMemo(value, type).ok).toBe(valid);
    const serialize = () => Memo[type](value).toXDRObject().toXDR();
    if (valid) expect(serialize).not.toThrow();
    else expect(serialize).toThrow();
  });

  it.each(["id", "hash"] as const)("rejects trailing newlines for %s", (type) => {
    const value = type === "id" ? "5\n" : "a".repeat(64) + "\n";
    expect(validateMemo(value, type).ok).toBe(false);
  });

  it("defaults to text without trimming", () => {
    expect(validateMemo("-5").ok).toBe(true);
    expect(validateMemo("x".repeat(28) + " ").ok).toBe(false);
    expect(validateMemo(" ").ok).toBe(true);
  });

  it("rejects unsupported JavaScript memo types safely", () => {
    expect(validateMemo("5", "return" as MemoType)).toMatchObject({ ok: false });
    expect(validateMemo("5", null as unknown as MemoType)).toMatchObject({ ok: false });
  });
});
