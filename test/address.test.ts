import { describe, expect, it } from "vitest";
import { Account, Keypair, MuxedAccount, StrKey } from "@stellar/stellar-sdk";
import { isContractAddress, parseDestination } from "../src/address.js";

const g = Keypair.random();
const muxed = new MuxedAccount(new Account(g.publicKey(), "0"), "9007199254740993");
const contract = StrKey.encodeContract(Buffer.alloc(32, 7));

describe("parseDestination", () => {
  it("parses a classic account", () => {
    expect(parseDestination(g.publicKey())).toEqual({
      ok: true,
      destination: { kind: "account", input: g.publicKey(), account: g.publicKey() },
    });
  });

  it("decodes a muxed address into its base account and full 64-bit id", () => {
    const r = parseDestination(muxed.accountId());
    expect(r).toMatchObject({ ok: true, destination: { kind: "muxed", account: g.publicKey(), muxedId: "9007199254740993" } });
  });

  it("parses a contract address", () => {
    expect(parseDestination(contract)).toMatchObject({ ok: true, destination: { kind: "contract", contract } });
  });

  it("parses a federation address and lowercases the domain", () => {
    expect(parseDestination("alice*Example.COM")).toMatchObject({
      ok: true,
      destination: { kind: "federation", name: "alice", domain: "example.com" },
    });
  });

  it("trims surrounding whitespace", () => {
    expect(parseDestination(`  ${g.publicKey()}\n`)).toMatchObject({ ok: true, destination: { kind: "account" } });
  });

  it("refuses a secret key and says why", () => {
    const r = parseDestination(g.secret());
    expect(r).toMatchObject({ ok: false, error: "secret_key" });
  });

  const pk = g.publicKey();
  const badChecksum = pk.slice(0, -1) + (pk.endsWith("A") ? "B" : "A");

  it.each(["", "   ", "GABC", "alice*", "*example.com", badChecksum])("rejects %j", (input) => {
    expect(parseDestination(input).ok).toBe(false);
  });
});

describe("isContractAddress", () => {
  it("tells contract senders from classic ones", () => {
    expect(isContractAddress(contract)).toBe(true);
    expect(isContractAddress(g.publicKey())).toBe(false);
  });
});
