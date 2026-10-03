import { describe, expect, it } from "vitest";
import { Account, Keypair, MuxedAccount, StrKey } from "@stellar/stellar-sdk";
import { check } from "../src/check.js";
import { requiresMemo } from "../src/memo.js";
import type { AccountSource, AccountState, DirectorySource, FederationResolver } from "../src/sources.js";

const MEMO_REQUIRED = { "config.memo_required": Buffer.from("1").toString("base64") };

function fakeAccounts(states: Record<string, AccountState>): AccountSource {
  return { loadAccount: async (id) => states[id] ?? { exists: false } };
}

const exchange = Keypair.random().publicKey();
const friend = Keypair.random().publicKey();
const unfunded = Keypair.random().publicKey();
const classicSender = Keypair.random().publicKey();
const contractSender = StrKey.encodeContract(Buffer.alloc(32, 3));
const exchangeMuxed = new MuxedAccount(new Account(exchange, "0"), "1234").accountId();

const accounts = fakeAccounts({
  [exchange]: { exists: true, data: MEMO_REQUIRED },
  [friend]: { exists: true, data: {} },
});

describe("requiresMemo", () => {
  it("reads the SEP-29 data entry", () => {
    expect(requiresMemo({ exists: true, data: MEMO_REQUIRED })).toBe(true);
    expect(requiresMemo({ exists: true, data: { "config.memo_required": Buffer.from("0").toString("base64") } })).toBe(false);
    expect(requiresMemo({ exists: true, data: {} })).toBe(false);
    expect(requiresMemo({ exists: false })).toBe(false);
  });
});

describe("check", () => {
  it("passes a plain payment to an ordinary funded account", async () => {
    const v = await check({ to: friend, from: classicSender, accounts, directory: null });
    expect(v.status).toBe("ok");
    expect(v.reasons).toEqual([]);
  });

  it("blocks a memo-required account when no memo is given", async () => {
    const v = await check({ to: exchange, from: classicSender, accounts, directory: null });
    expect(v.status).toBe("block");
    expect(v.reasons.map((r) => r.code)).toEqual(["memo_required"]);
  });

  it("passes a memo-required account when a memo is given", async () => {
    const v = await check({ to: exchange, from: classicSender, memo: "4419", accounts, directory: null });
    expect(v.status).toBe("ok");
  });

  it("blocks a contract sender paying a memo-required account, with the route that works", async () => {
    const v = await check({ to: exchange, from: contractSender, accounts, directory: null });
    expect(v.status).toBe("block");
    expect(v.reasons[0]).toMatchObject({ code: "contract_sender_cannot_memo" });
    expect(v.reasons[0].fix).toMatch(/classic/);
  });

  it("blocks a contract sender that tries to attach a memo at all", async () => {
    const v = await check({ to: friend, from: contractSender, memo: "1", accounts, directory: null });
    expect(v.reasons.map((r) => r.code)).toContain("memo_unsupported_for_contract_sender");
    expect(v.status).toBe("block");
  });

  it("accepts a muxed exchange address without a memo, since the id travels in the address", async () => {
    const v = await check({ to: exchangeMuxed, from: classicSender, accounts, directory: null });
    expect(v.status).toBe("ok");
    expect(v.account).toBe(exchange);
  });

  it("warns when a contract sender pays a muxed address", async () => {
    const v = await check({ to: exchangeMuxed, from: contractSender, accounts, directory: null });
    expect(v.status).toBe("warn");
    expect(v.reasons.map((r) => r.code)).toEqual(["muxed_from_contract"]);
  });

  it("warns about an account that does not exist yet", async () => {
    const v = await check({ to: unfunded, accounts, directory: null });
    expect(v.status).toBe("warn");
    expect(v.reasons[0].code).toBe("destination_unfunded");
  });

  it("blocks input that is not an address", async () => {
    const v = await check({ to: "not-an-address", accounts, directory: null });
    expect(v).toMatchObject({ status: "block", reasons: [{ code: "destination_invalid" }] });
  });

  it("resolves a federation address and carries its memo", async () => {
    const federation: FederationResolver = { resolve: async () => ({ account: exchange, memoType: "id", memo: "77" }) };
    const v = await check({ to: "alice*example.com", from: classicSender, accounts, federation, directory: null });
    expect(v).toMatchObject({ status: "ok", account: exchange, memo: "77" });
  });

  it("blocks a contract sender when federation demands a memo", async () => {
    const federation: FederationResolver = { resolve: async () => ({ account: friend, memoType: "text", memo: "hi" }) };
    const v = await check({ to: "bob*example.com", from: contractSender, accounts, federation, directory: null });
    expect(v.status).toBe("block");
    expect(v.reasons.map((r) => r.code)).toContain("contract_sender_cannot_memo");
  });

  it("blocks when federation lookup fails", async () => {
    const federation: FederationResolver = { resolve: async () => { throw new Error("no FEDERATION_SERVER"); } };
    const v = await check({ to: "carol*example.com", accounts, federation, directory: null });
    expect(v).toMatchObject({ status: "block", reasons: [{ code: "federation_failed" }] });
  });

  it("does not look up memo rules for a contract destination", async () => {
    const v = await check({ to: StrKey.encodeContract(Buffer.alloc(32, 9)), accounts, directory: null });
    expect(v.status).toBe("ok");
    expect(v.reasons[0].code).toBe("destination_contract");
  });
});

describe("check with the public directory", () => {
  const binanceLike = Keypair.random().publicKey();
  const scam = Keypair.random().publicKey();
  const plainAccounts = fakeAccounts({
    [binanceLike]: { exists: true, data: {} },
    [scam]: { exists: true, data: {} },
    [friend]: { exists: true, data: {} },
  });
  const directory: DirectorySource = {
    lookup: async (a) =>
      a === binanceLike
        ? { name: "Binance Deposits", tags: ["exchange", "memo-required"] }
        : a === scam
          ? { name: "Fake airdrop", tags: ["malicious"] }
          : null,
  };

  it("requires a memo for an exchange that never set SEP-29 but is tagged in the directory", async () => {
    const v = await check({ to: binanceLike, from: classicSender, accounts: plainAccounts, directory });
    expect(v.status).toBe("block");
    expect(v.reasons[0]).toMatchObject({ code: "memo_required" });
    expect(v.reasons[0].message).toContain("Binance Deposits");
    expect(v.reasons[0].message).toContain("public directory");
    expect(v.entry?.name).toBe("Binance Deposits");
  });

  it("blocks an account flagged as malicious", async () => {
    const v = await check({ to: scam, accounts: plainAccounts, directory });
    expect(v.status).toBe("block");
    expect(v.reasons.map((r) => r.code)).toContain("destination_flagged");
  });

  it("falls back to on-chain checks when the directory is down", async () => {
    const down: DirectorySource = { lookup: async () => { throw new Error("timeout"); } };
    const v = await check({ to: friend, accounts: plainAccounts, directory: down });
    expect(v.status).toBe("ok");
    expect(v.reasons.map((r) => r.code)).toEqual(["directory_unavailable"]);
  });
});
