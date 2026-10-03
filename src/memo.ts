import type { AccountState } from "./sources.js";

/** SEP-29: an account that needs a memo sets this data entry to "1". */
export const MEMO_REQUIRED_KEY = "config.memo_required";

export function requiresMemo(state: AccountState): boolean {
  if (!state.exists) return false;
  const raw = state.data[MEMO_REQUIRED_KEY];
  if (raw === undefined) return false;
  return Buffer.from(raw, "base64").toString("utf8") === "1";
}
