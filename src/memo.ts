import type { AccountState } from "./sources.js";

export type MemoType = "text" | "id" | "hash";
export type MemoValidationResult = { ok: true } | { ok: false; message: string };

/** Validate a memo without changing its value. Hash values use hexadecimal encoding. */
export function validateMemo(value: string, type: MemoType = "text"): MemoValidationResult {
  if (typeof value !== "string") return { ok: false, message: "Enter the memo as a string." };
  switch (type) {
    case "text": {
      const bytes = new TextEncoder().encode(value).length;
      return bytes <= 28
        ? { ok: true }
        : { ok: false, message: `The text memo is ${bytes} UTF-8 bytes; use at most 28 bytes.` };
    }
    case "id":
      if (value.length === 0 || /[^0-9]/.test(value)) {
        return { ok: false, message: "Enter a memo ID using digits 0-9 only, without spaces, signs or decimal points." };
      }
      return BigInt(value) <= 18446744073709551615n
        ? { ok: true }
        : { ok: false, message: "The memo ID is too large; use a value from 0 to 18446744073709551615." };
    case "hash":
      return value.length === 64 && !/[^0-9a-fA-F]/.test(value)
        ? { ok: true }
        : { ok: false, message: "Enter a memo hash as exactly 64 hexadecimal characters (0-9, a-f), without spaces." };
    default:
      return { ok: false, message: "Choose a supported memo type: text, id or hash." };
  }
}

/** SEP-29: an account that needs a memo sets this data entry to "1". */
export const MEMO_REQUIRED_KEY = "config.memo_required";

export function requiresMemo(state: AccountState): boolean {
  if (!state.exists) return false;
  const raw = state.data[MEMO_REQUIRED_KEY];
  if (raw === undefined) return false;
  return atob(raw) === "1";
}
