import { MuxedAccount, StrKey } from "@stellar/stellar-sdk";

/** A destination as the user typed it, normalised. Parsing is offline. */
export type Destination =
  | { kind: "account"; input: string; account: string }
  | { kind: "muxed"; input: string; account: string; muxedId: string }
  | { kind: "contract"; input: string; contract: string }
  | { kind: "federation"; input: string; name: string; domain: string };

export type ParseError = "empty" | "secret_key" | "invalid";

export type ParseResult =
  | { ok: true; destination: Destination }
  | { ok: false; error: ParseError; message: string };

const FEDERATION_RE = /^([^*\s]+)\*([a-z0-9-]+(\.[a-z0-9-]+)+)$/i;

export function parseDestination(raw: string): ParseResult {
  const input = raw.trim();
  if (!input) return { ok: false, error: "empty", message: "No destination given." };

  if (StrKey.isValidEd25519SecretSeed(input)) {
    return {
      ok: false,
      error: "secret_key",
      message: "This is a secret key, not an address. Never paste it anywhere; anyone with it controls the account.",
    };
  }
  if (StrKey.isValidEd25519PublicKey(input)) {
    return { ok: true, destination: { kind: "account", input, account: input } };
  }
  if (StrKey.isValidMed25519PublicKey(input)) {
    const muxed = MuxedAccount.fromAddress(input, "0");
    return {
      ok: true,
      destination: { kind: "muxed", input, account: muxed.baseAccount().accountId(), muxedId: muxed.id() },
    };
  }
  if (StrKey.isValidContract(input)) {
    return { ok: true, destination: { kind: "contract", input, contract: input } };
  }
  const fed = FEDERATION_RE.exec(input);
  if (fed) {
    return { ok: true, destination: { kind: "federation", input, name: fed[1], domain: fed[2].toLowerCase() } };
  }
  return { ok: false, error: "invalid", message: "Not a Stellar address (G..., M..., C...) or federation address (name*domain)." };
}

/** True when the sender is a contract account, which pays through Soroban and cannot attach a memo. */
export function isContractAddress(address: string): boolean {
  return StrKey.isValidContract(address.trim());
}
