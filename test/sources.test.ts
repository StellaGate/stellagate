import { afterEach, describe, expect, it, vi } from "vitest";
import { Federation, Keypair, rpc, StrKey } from "@stellar/stellar-sdk";
import { check } from "../src/check.js";
import { DEFAULT_TIMEOUT_MS, horizonAccountSource, rpcContractSource, sep2Federation, sep2FederationResolver, stellarExpertDirectory } from "../src/sources.js";

const account = Keypair.random().publicKey();
afterEach(() => vi.restoreAllMocks());

function stalledFetch(signals: AbortSignal[] = []): typeof fetch {
  return vi.fn(async (_url, init) => {
    const signal = init?.signal;
    if (!signal) throw new Error("Missing abort signal");
    signals.push(signal);
    return new Promise<Response>((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    });
  });
}

function stalledBody(signal: AbortSignal): Response {
  return new Response(new ReadableStream({
    start(controller) {
      signal.addEventListener("abort", () => controller.error(signal.reason), { once: true });
    },
  }));
}

describe.each(["Horizon", "directory"] as const)("%s request deadlines", (kind) => {
  const read = (fetchImpl: typeof fetch, timeoutMs?: number) => kind === "Horizon"
    ? horizonAccountSource("https://horizon.invalid/", { fetchImpl, timeoutMs }).loadAccount(account)
    : stellarExpertDirectory("testnet", { fetchImpl, timeoutMs }).lookup(account);

  it("uses an 8000 ms default that aborts a stalled fetch", async () => {
    const nativeTimeout = AbortSignal.timeout.bind(AbortSignal);
    const timeout = vi.spyOn(AbortSignal, "timeout").mockImplementation(() => nativeTimeout(10));
    await expect(read(stalledFetch())).rejects.toMatchObject({ name: "TimeoutError" });
    expect(timeout).toHaveBeenCalledWith(DEFAULT_TIMEOUT_MS);
    expect(DEFAULT_TIMEOUT_MS).toBe(8000);
  });

  it("uses the custom deadline with a fresh signal on every retry", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    const signals: AbortSignal[] = [];
    const fetchImpl = stalledFetch(signals);
    const source = kind === "Horizon"
      ? () => horizon.loadAccount(account)
      : () => directory.lookup(account);
    const horizon = horizonAccountSource("https://horizon.invalid", { fetchImpl, timeoutMs: 10 });
    const directory = stellarExpertDirectory("public", { fetchImpl, timeoutMs: 10 });
    await expect(source()).rejects.toMatchObject({ name: "TimeoutError" });
    await expect(source()).rejects.toMatchObject({ name: "TimeoutError" });
    expect(signals).toHaveLength(2);
    expect(signals[0]).not.toBe(signals[1]);
    expect(signals.every((signal) => signal.aborted)).toBe(true);
    expect(timeout.mock.calls).toEqual([[10], [10]]);
  });

  it("keeps the deadline active while reading a stalled response body", async () => {
    const fetchImpl: typeof fetch = vi.fn(async (_url, init) => stalledBody(init!.signal!));
    await expect(read(fetchImpl, 10)).rejects.toMatchObject({ name: "TimeoutError" });
  });

  it.each([200, 404, 500])("preserves positional fetch injection and HTTP %s behavior", async (status) => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ name: "Fixture", tags: [] }), { status }));
    const result = kind === "Horizon"
      ? horizonAccountSource("https://horizon.invalid/", fetchImpl).loadAccount(account)
      : stellarExpertDirectory("testnet", fetchImpl).lookup(account);
    if (status === 500) await expect(result).rejects.toThrow(/500/);
    else if (kind === "Horizon") await expect(result).resolves.toMatchObject({ exists: status === 200 });
    else if (status === 404) await expect(result).resolves.toBeNull();
    else await expect(result).resolves.toMatchObject({ name: "Fixture", tags: [] });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});

describe("SDK timeouts", () => {
  it("passes default and custom federation deadlines to the SDK", async () => {
    const resolve = vi.spyOn(Federation.Server, "resolve").mockResolvedValue({ account_id: account, memo_type: "id", memo: "77" });
    await expect(sep2Federation.resolve("alice*example.com")).resolves.toMatchObject({ account, memo: "77", memoType: "id" });
    await sep2FederationResolver({ timeoutMs: 15 }).resolve("alice*example.com");
    expect(resolve.mock.calls.map((call) => call[1])).toEqual([{ timeout: 8000 }, { timeout: 15 }]);
  });

  it.each(["TOML headers", "TOML body", "federation headers", "federation body"])("bounds stalled %s through the SDK", async (stage) => {
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      const isToml = String(url).includes("stellar.toml");
      const isTarget = stage.startsWith("TOML") === isToml;
      if (isTarget) {
        if (stage.endsWith("body")) return stalledBody(init!.signal!);
        return stalledFetch()(url, init);
      }
      return new Response('FEDERATION_SERVER="https://federation.invalid/lookup"');
    });
    await expect(sep2FederationResolver({ timeoutMs: 10 }).resolve("alice*example.com")).rejects.toBeInstanceOf(Error);
    expect(fetch).toHaveBeenCalledTimes(stage.startsWith("TOML") ? 1 : 2);
    for (const [, init] of fetch.mock.calls) expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it.each([undefined, 12])("sets a per-instance RPC timeout: %s", async (timeoutMs) => {
    const timeouts: unknown[] = [];
    vi.spyOn(rpc.Server.prototype, "getLedgerEntries").mockImplementation(async function () {
      timeouts.push(this.httpClient.defaults.timeout);
      return { entries: [], latestLedger: 1 };
    });
    await rpcContractSource("https://rpc.invalid", { timeoutMs }).contractExists(StrKey.encodeContract(new Uint8Array(32)));
    expect(timeouts).toEqual([timeoutMs ?? 8000]);
  });

  it("keeps RPC deadlines isolated between source instances", async () => {
    const timeouts: unknown[] = [];
    vi.spyOn(rpc.Server.prototype, "getLedgerEntries").mockImplementation(async function () {
      timeouts.push(this.httpClient.defaults.timeout);
      return { entries: [], latestLedger: 1 };
    });
    const short = rpcContractSource("https://rpc.invalid", { timeoutMs: 12 });
    const defaults = rpcContractSource("https://rpc.invalid");
    const contract = StrKey.encodeContract(new Uint8Array(32));
    await short.contractExists(contract);
    await defaults.contractExists(contract);
    await short.contractExists(contract);
    expect(timeouts).toEqual([12, 8000, 12]);
  });

  it.each(["headers", "body"])("bounds a stalled RPC response %s", async (stage) => {
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) =>
      stage === "body" ? stalledBody(init!.signal!) : stalledFetch()(url, init));
    await expect(rpcContractSource("https://rpc.invalid", { timeoutMs: 10 })
      .contractExists(StrKey.encodeContract(new Uint8Array(32)))).rejects.toBeInstanceOf(Error);
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });
});

describe("timeout configuration and verdicts", () => {
  it.each([0, -1, 1.5, NaN, Infinity, 2147483648, null])("rejects invalid deadlines at factory creation: %s", (value) => {
    const options = { timeoutMs: value as number };
    expect(() => horizonAccountSource("https://horizon.invalid", options)).toThrow(RangeError);
    expect(() => stellarExpertDirectory("public", options)).toThrow(RangeError);
    expect(() => sep2FederationResolver(options)).toThrow(RangeError);
    expect(() => rpcContractSource("https://rpc.invalid", options)).toThrow(RangeError);
  });

  it("returns account_unavailable for a timed-out Horizon read", async () => {
    const v = await check({ to: account, directory: null, contracts: null,
      accounts: horizonAccountSource("https://horizon.invalid", { fetchImpl: stalledFetch(), timeoutMs: 10 }) });
    expect(v.status).toBe("warn");
    expect(v.reasons.map((r) => r.code)).toEqual(["account_unavailable"]);
  });

  it("preserves a directory block alongside the timed-out Horizon warning", async () => {
    const v = await check({ to: account, contracts: null,
      directory: { lookup: async () => ({ tags: ["malicious"] }) },
      accounts: horizonAccountSource("https://horizon.invalid", { fetchImpl: stalledFetch(), timeoutMs: 10 }) });
    expect(v.status).toBe("block");
    expect(v.reasons.map((r) => r.code)).toEqual(["destination_flagged", "account_unavailable"]);
  });

  it("keeps account checks running after a directory timeout", async () => {
    const v = await check({ to: account, contracts: null,
      accounts: { loadAccount: async () => ({ exists: true, data: {}, authRequired: false, trustlines: [] }) },
      directory: stellarExpertDirectory("public", { fetchImpl: stalledFetch(), timeoutMs: 10 }) });
    expect(v.status).toBe("ok");
    expect(v.reasons.map((r) => r.code)).toEqual(["directory_unavailable"]);
  });

  it("preserves a sender block when the directory times out", async () => {
    const v = await check({ to: account, from: StrKey.encodeContract(new Uint8Array(32)), memo: "77", contracts: null,
      accounts: { loadAccount: async () => ({ exists: true, data: {}, authRequired: false, trustlines: [] }) },
      directory: stellarExpertDirectory("public", { fetchImpl: stalledFetch(), timeoutMs: 10 }) });
    expect(v.status).toBe("block");
    expect(v.reasons.map((r) => r.code)).toEqual(["memo_unsupported_for_contract_sender", "directory_unavailable"]);
  });
});
