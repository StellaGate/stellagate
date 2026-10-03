import { describe, expect, it } from "vitest";
import { Asset, Keypair, Networks, StrKey } from "@stellar/stellar-sdk";
import { parseAsset, toStroops } from "../src/asset.js";
import { check } from "../src/check.js";
import type { AccountSource, AccountState, ContractBalance, ContractSource, Trustline } from "../src/sources.js";

const issuer = Keypair.random().publicKey();
const strictIssuer = Keypair.random().publicKey();
const USDC = `USDC:${issuer}`;
const KYC = `KYC:${strictIssuer}`;

function line(code: string, iss: string, over: Partial<Trustline> = {}): Trustline {
  return { code, issuer: iss, balance: "0.0000000", limit: "922337203685.4775807", buyingLiabilities: "0.0000000", authorized: true, ...over };
}
function funded(trustlines: Trustline[] = [], authRequired = false): AccountState {
  return { exists: true, data: {}, trustlines, authRequired };
}

const noLine = Keypair.random().publicKey();
const hasLine = Keypair.random().publicKey();
const frozen = Keypair.random().publicKey();
const nearlyFull = Keypair.random().publicKey();
const unfunded = Keypair.random().publicKey();

const accounts: AccountSource = {
  loadAccount: async (id) =>
    ({
      [issuer]: funded(),
      [strictIssuer]: funded([], true),
      [noLine]: funded(),
      [hasLine]: funded([line("USDC", issuer)]),
      [frozen]: funded([line("USDC", issuer, { authorized: false })]),
      [nearlyFull]: funded([line("USDC", issuer, { balance: "90.0000000", limit: "100.0000000", buyingLiabilities: "5.0000000" })]),
    })[id] ?? { exists: false },
};

const base = { accounts, directory: null, network: "testnet" as const };
const codes = (v: { reasons: { code: string }[] }) => v.reasons.map((r) => r.code);

describe("parseAsset", () => {
  it("accepts native and CODE:ISSUER", () => {
    expect(parseAsset("native")).toMatchObject({ ok: true });
    expect(parseAsset("XLM")).toMatchObject({ ok: true });
    const r = parseAsset(USDC);
    expect(r.ok && r.asset.getCode()).toBe("USDC");
  });

  it.each(["", "USDC", "USDC:GABC", `TOOLONGASSETCODE:${issuer}`, `USDC:${issuer}:x`])("rejects %j", (input) => {
    expect(parseAsset(input).ok).toBe(false);
  });
});

describe("toStroops", () => {
  it("converts decimal amounts exactly", () => {
    expect(toStroops("1")).toBe(10_000_000n);
    expect(toStroops("0.0000001")).toBe(1n);
    expect(toStroops("922337203685.4775807")).toBe(9223372036854775807n);
  });

  it.each(["", "-1", "1.12345678", "1e5", "abc"])("rejects %j", (input) => {
    expect(toStroops(input)).toBeNull();
  });
});

describe("trustline checks for classic accounts", () => {
  it("passes native XLM to any funded account", async () => {
    expect((await check({ ...base, to: noLine, asset: "native" })).status).toBe("ok");
  });

  it("blocks an asset the account has no trustline for", async () => {
    const v = await check({ ...base, to: noLine, asset: USDC });
    expect(v.status).toBe("block");
    expect(codes(v)).toEqual(["no_trustline"]);
    expect(v.reasons[0].fix).toMatch(/trustline/);
  });

  it("passes when the trustline exists and is authorised", async () => {
    expect((await check({ ...base, to: hasLine, asset: USDC, amount: "250" })).status).toBe("ok");
  });

  it("blocks a trustline the issuer has not authorised", async () => {
    expect(codes(await check({ ...base, to: frozen, asset: USDC }))).toEqual(["trustline_not_authorized"]);
  });

  it("blocks an amount that would exceed the trustline limit, counting open buy offers", async () => {
    expect((await check({ ...base, to: nearlyFull, asset: USDC, amount: "5" })).status).toBe("ok");
    expect(codes(await check({ ...base, to: nearlyFull, asset: USDC, amount: "5.0000001" }))).toEqual(["trustline_limit_exceeded"]);
  });

  it("lets the issuer receive its own asset without a trustline", async () => {
    expect((await check({ ...base, to: issuer, asset: USDC })).status).toBe("ok");
  });

  it("checks the base account behind a muxed address", async () => {
    const { MuxedAccount, Account } = await import("@stellar/stellar-sdk");
    const m = new MuxedAccount(new Account(noLine, "0"), "42").accountId();
    expect(codes(await check({ ...base, to: m, asset: USDC }))).toEqual(["no_trustline"]);
  });

  it("blocks a non-native asset to an account that does not exist", async () => {
    const v = await check({ ...base, to: unfunded, asset: USDC });
    expect(v).toMatchObject({ status: "block", reasons: [{ code: "destination_unfunded" }] });
  });

  it("still only warns for XLM to an account that does not exist", async () => {
    expect((await check({ ...base, to: unfunded, asset: "native" })).status).toBe("warn");
  });

  it("rejects a malformed asset or amount before any lookup", async () => {
    expect(codes(await check({ ...base, to: hasLine, asset: "USDC" }))).toEqual(["asset_invalid"]);
    expect(codes(await check({ ...base, to: hasLine, asset: USDC, amount: "-3" }))).toEqual(["amount_invalid"]);
    expect(codes(await check({ ...base, to: hasLine, asset: USDC, amount: "0" }))).toEqual(["amount_invalid"]);
  });
});

describe("Stellar Asset Contract checks for contract addresses", () => {
  const wallet = StrKey.encodeContract(Buffer.alloc(32, 1));
  const ghost = StrKey.encodeContract(Buffer.alloc(32, 2));
  const usdcSac = new Asset("USDC", issuer).contractId(Networks.TESTNET);
  const kycSac = new Asset("KYC", strictIssuer).contractId(Networks.TESTNET);
  const nativeSac = Asset.native().contractId(Networks.TESTNET);

  function fakeContracts(deployed: string[], balances: Record<string, ContractBalance> = {}): ContractSource {
    return {
      contractExists: async (id) => deployed.includes(id),
      sacBalance: async (sac, holder) => balances[`${sac}/${holder}`] ?? null,
    };
  }

  it("passes when the wallet and the asset contract both exist", async () => {
    const contracts = fakeContracts([wallet, usdcSac]);
    const v = await check({ ...base, to: wallet, asset: USDC, contracts });
    expect(v.status).toBe("ok");
    expect(codes(v)).toEqual(["destination_contract"]);
  });

  it("passes native XLM through its asset contract", async () => {
    expect((await check({ ...base, to: wallet, asset: "native", contracts: fakeContracts([wallet, nativeSac]) })).status).toBe("ok");
  });

  it("blocks when the asset has no Stellar Asset Contract yet, and says how to deploy one", async () => {
    const v = await check({ ...base, to: wallet, asset: USDC, contracts: fakeContracts([wallet]) });
    expect(codes(v)).toEqual(["destination_contract", "sac_not_deployed"]);
    expect(v.reasons[1].fix).toContain(`stellar contract asset deploy --asset USDC:${issuer}`);
  });

  it("blocks a contract address with nothing deployed at it", async () => {
    const v = await check({ ...base, to: ghost, asset: USDC, contracts: fakeContracts([usdcSac]) });
    expect(codes(v)).toContain("destination_contract_missing");
    expect(v.status).toBe("block");
  });

  it("blocks when the issuer requires approval and the contract has none", async () => {
    const v = await check({ ...base, to: wallet, asset: KYC, contracts: fakeContracts([wallet, kycSac]) });
    expect(codes(v)).toEqual(["destination_contract", "sac_balance_not_authorized"]);
  });

  it("passes an approval-required asset once the contract's balance is authorised", async () => {
    const contracts = fakeContracts([wallet, kycSac], { [`${kycSac}/${wallet}`]: { amount: 0n, authorized: true } });
    expect((await check({ ...base, to: wallet, asset: KYC, contracts })).status).toBe("ok");
  });

  it("blocks a contract balance the issuer has frozen", async () => {
    const contracts = fakeContracts([wallet, usdcSac], { [`${usdcSac}/${wallet}`]: { amount: 10n, authorized: false } });
    expect(codes(await check({ ...base, to: wallet, asset: USDC, contracts }))).toContain("sac_balance_not_authorized");
  });

  it("says so when no RPC endpoint is available, rather than guessing", async () => {
    const v = await check({ ...base, network: "public", to: wallet, asset: USDC });
    expect(v.status).toBe("ok");
    expect(codes(v)).toEqual(["destination_contract", "contract_checks_skipped"]);
  });

  it("reports an unreachable RPC as unchecked", async () => {
    const down: ContractSource = { contractExists: async () => { throw new Error("timeout"); }, sacBalance: async () => null };
    expect(codes(await check({ ...base, to: wallet, asset: USDC, contracts: down }))).toEqual(["destination_contract", "rpc_unavailable"]);
  });

  it("skips contract checks when contracts is null", async () => {
    expect(codes(await check({ ...base, to: wallet, asset: USDC, contracts: null }))).toEqual(["destination_contract", "contract_checks_skipped"]);
  });
});
