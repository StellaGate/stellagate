import { Asset, StrKey } from "@stellar/stellar-sdk";

export type AssetParseResult = { ok: true; asset: Asset } | { ok: false; message: string };

const CODE_RE = /^[a-zA-Z0-9]{1,12}$/;

/** Accepts "native", "XLM", or "CODE:ISSUER" (the SEP-11 form). */
export function parseAsset(raw: string): AssetParseResult {
  const input = raw.trim();
  if (/^(native|xlm)$/i.test(input)) return { ok: true, asset: Asset.native() };
  const [code, issuer, extra] = input.split(":");
  if (extra === undefined && code && CODE_RE.test(code) && issuer && StrKey.isValidEd25519PublicKey(issuer)) {
    return { ok: true, asset: new Asset(code, issuer) };
  }
  return { ok: false, message: `Not an asset: ${JSON.stringify(input)}. Use "native" or CODE:ISSUER.` };
}

const AMOUNT_RE = /^(\d+)(?:\.(\d{1,7}))?$/;

/** Converts a decimal amount to stroops (1 unit = 10^7 stroops). Returns null if malformed. */
export function toStroops(amount: string): bigint | null {
  const m = AMOUNT_RE.exec(amount.trim());
  if (!m) return null;
  return BigInt(m[1]) * 10_000_000n + BigInt((m[2] ?? "").padEnd(7, "0"));
}
