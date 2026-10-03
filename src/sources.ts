import { Address, Federation, rpc, scValToNative, xdr } from "@stellar/stellar-sdk";

/** A trustline to a classic asset. Amounts are decimal strings, as Horizon returns them. */
export interface Trustline {
  code: string;
  issuer: string;
  balance: string;
  limit: string;
  buyingLiabilities: string;
  authorized: boolean;
}

/** Account state as far as Stellagate needs it. Data entries are base64, as Horizon returns them. */
export type AccountState =
  | { exists: false }
  | {
      exists: true;
      data: Record<string, string>;
      trustlines: Trustline[];
      /** The account's AUTH_REQUIRED flag; matters when it issues an asset. */
      authRequired: boolean;
    };

export interface AccountSource {
  loadAccount(accountId: string): Promise<AccountState>;
}

export interface FederationRecord {
  account: string;
  memoType?: "text" | "id" | "hash";
  memo?: string;
}

export interface FederationResolver {
  resolve(address: string): Promise<FederationRecord>;
}

/** A public directory entry for an account (exchange, issuer, known scam). */
export interface DirectoryEntry {
  name?: string;
  domain?: string;
  tags: string[];
}

export interface DirectorySource {
  /** Resolves to null when the account has no entry. */
  lookup(address: string): Promise<DirectoryEntry | null>;
}

export function stellarExpertDirectory(
  network: "public" | "testnet" = "public",
  fetchImpl: typeof fetch = fetch,
): DirectorySource {
  return {
    async lookup(address) {
      const res = await fetchImpl(`https://api.stellar.expert/explorer/${network}/directory/${address}`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`StellarExpert directory returned ${res.status}`);
      const body = (await res.json()) as { name?: string; domain?: string; tags?: string[] };
      return { name: body.name, domain: body.domain, tags: body.tags ?? [] };
    },
  };
}

interface HorizonAccount {
  data?: Record<string, string>;
  flags?: { auth_required?: boolean };
  balances?: {
    asset_type: string;
    asset_code?: string;
    asset_issuer?: string;
    balance: string;
    limit?: string;
    buying_liabilities?: string;
    is_authorized?: boolean;
  }[];
}

export const HORIZON_URLS = {
  public: "https://horizon.stellar.org",
  testnet: "https://horizon-testnet.stellar.org",
} as const;

export function horizonAccountSource(baseUrl: string, fetchImpl: typeof fetch = fetch): AccountSource {
  const root = baseUrl.replace(/\/+$/, "");
  return {
    async loadAccount(accountId) {
      const res = await fetchImpl(`${root}/accounts/${accountId}`);
      if (res.status === 404) return { exists: false };
      if (!res.ok) throw new Error(`Horizon returned ${res.status} for ${accountId}`);
      const body = (await res.json()) as HorizonAccount;
      return {
        exists: true,
        data: body.data ?? {},
        authRequired: body.flags?.auth_required ?? false,
        trustlines: (body.balances ?? [])
          .filter((b) => b.asset_type === "credit_alphanum4" || b.asset_type === "credit_alphanum12")
          .map((b) => ({
            code: b.asset_code!,
            issuer: b.asset_issuer!,
            balance: b.balance,
            limit: b.limit!,
            buyingLiabilities: b.buying_liabilities ?? "0",
            authorized: b.is_authorized ?? true,
          })),
      };
    },
  };
}

export const sep2Federation: FederationResolver = {
  async resolve(address) {
    const r = await Federation.Server.resolve(address);
    return {
      account: r.account_id,
      memoType: r.memo_type as FederationRecord["memoType"],
      memo: r.memo === undefined ? undefined : String(r.memo),
    };
  },
};

/** A Stellar Asset Contract balance held by a contract address. */
export interface ContractBalance {
  amount: bigint;
  authorized: boolean;
}

export interface ContractSource {
  /** True when a contract instance exists at this C-address. */
  contractExists(contractId: string): Promise<boolean>;
  /** The balance `holder` keeps in the asset contract `sacId`, or null if it has none yet. */
  sacBalance(sacId: string, holder: string): Promise<ContractBalance | null>;
}

/** Testnet has a public RPC. For mainnet, pass a provider's URL to `rpcContractSource`. */
export const RPC_URLS = {
  testnet: "https://soroban-testnet.stellar.org",
} as const;

function persistentKey(contractId: string, key: xdr.ScVal): xdr.LedgerKey {
  return xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract: new Address(contractId).toScAddress(),
      key,
      durability: xdr.ContractDataDurability.persistent,
    }),
  );
}

export function rpcContractSource(url: string): ContractSource {
  const server = new rpc.Server(url, { allowHttp: url.startsWith("http://") });
  async function read(key: xdr.LedgerKey): Promise<xdr.ScVal | null> {
    const { entries } = await server.getLedgerEntries(key);
    const data = entries[0]?.val;
    return data?.type === "contractData" ? data.contractData.val : null;
  }
  return {
    async contractExists(contractId) {
      return (await read(persistentKey(contractId, xdr.ScVal.scvLedgerKeyContractInstance()))) !== null;
    },
    async sacBalance(sacId, holder) {
      const key = xdr.ScVal.scvVec([xdr.ScVal.scvSymbol("Balance"), new Address(holder).toScVal()]);
      const val = await read(persistentKey(sacId, key));
      if (!val) return null;
      const v = scValToNative(val) as { amount: bigint; authorized: boolean };
      return { amount: v.amount, authorized: v.authorized };
    },
  };
}
