import { Federation } from "@stellar/stellar-sdk";

/** Account state as far as Stellagate needs it. Data entries are base64, as Horizon returns them. */
export type AccountState = { exists: false } | { exists: true; data: Record<string, string> };

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
      const body = (await res.json()) as { data?: Record<string, string> };
      return { exists: true, data: body.data ?? {} };
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
