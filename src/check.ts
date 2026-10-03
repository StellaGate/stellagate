import { isContractAddress, parseDestination, type Destination } from "./address.js";
import { requiresMemo } from "./memo.js";
import {
  HORIZON_URLS,
  horizonAccountSource,
  sep2Federation,
  stellarExpertDirectory,
  type AccountSource,
  type DirectoryEntry,
  type DirectorySource,
  type FederationResolver,
} from "./sources.js";

export type Severity = "info" | "warn" | "block";
export type Status = "ok" | "warn" | "block";

export interface Reason {
  code: string;
  severity: Severity;
  message: string;
  fix?: string;
}

export interface CheckInput {
  /** What the user pasted as the destination. */
  to: string;
  /** The sending account, G or C. Optional: without it, sender-specific checks are skipped. */
  from?: string;
  /** A memo the user already intends to attach. */
  memo?: string;
  network?: "public" | "testnet";
  accounts?: AccountSource;
  federation?: FederationResolver;
  /** Pass null to skip the directory lookup entirely. */
  directory?: DirectorySource | null;
}

export interface Verdict {
  status: Status;
  destination?: Destination;
  /** The account the payment will actually reach, after resolving muxed or federation forms. */
  account?: string;
  /** A memo the destination itself told us to use (federation). */
  memo?: string;
  /** Who the destination is, when a public directory knows. */
  entry?: DirectoryEntry;
  reasons: Reason[];
}

const RANK: Record<Severity, number> = { info: 0, warn: 1, block: 2 };

function statusOf(reasons: Reason[]): Status {
  const worst = reasons.reduce((max, r) => Math.max(max, RANK[r.severity]), 0);
  return worst === 2 ? "block" : worst === 1 ? "warn" : "ok";
}

export async function check(input: CheckInput): Promise<Verdict> {
  const reasons: Reason[] = [];
  const parsed = parseDestination(input.to);
  if (!parsed.ok) {
    reasons.push({ code: `destination_${parsed.error}`, severity: "block", message: parsed.message });
    return { status: "block", reasons };
  }

  const destination = parsed.destination;
  const accounts = input.accounts ?? horizonAccountSource(HORIZON_URLS[input.network ?? "public"]);
  const contractSender = input.from !== undefined && isContractAddress(input.from);
  let account: string | undefined;
  let memo = input.memo;
  let federationMemo: string | undefined;

  if (contractSender && input.memo) {
    reasons.push({
      code: "memo_unsupported_for_contract_sender",
      severity: "block",
      message: "A contract account pays through Soroban, and Soroban transactions cannot carry a memo.",
      fix: "Send from a classic (G...) account, or use a muxed (M...) destination if the receiver offers one.",
    });
  }

  switch (destination.kind) {
    case "contract":
      reasons.push({
        code: "destination_contract",
        severity: "info",
        message: "The destination is a contract. Memo rules do not apply; asset support is checked separately.",
      });
      break;

    case "federation": {
      try {
        const record = await (input.federation ?? sep2Federation).resolve(destination.input);
        account = record.account;
        federationMemo = record.memo;
        if (federationMemo) memo = memo ?? federationMemo;
      } catch (err) {
        reasons.push({
          code: "federation_failed",
          severity: "block",
          message: `Could not resolve ${destination.input}: ${(err as Error).message}`,
        });
        return { status: "block", destination, reasons };
      }
      if (federationMemo && contractSender) {
        reasons.push({
          code: "contract_sender_cannot_memo",
          severity: "block",
          message: "This federation address needs a memo, which a contract account cannot attach.",
          fix: "Send from a classic (G...) account.",
        });
      }
      break;
    }

    case "muxed":
      account = destination.account;
      if (contractSender) {
        reasons.push({
          code: "muxed_from_contract",
          severity: "warn",
          message:
            "A contract account can pay a muxed address through the token transfer (CAP-67), but many exchanges do not yet credit those deposits.",
          fix: "Confirm the receiver credits Soroban transfers to muxed addresses before sending a large amount.",
        });
      }
      break;

    case "account":
      account = destination.account;
      break;
  }

  const directory =
    input.directory === null ? null : (input.directory ?? stellarExpertDirectory(input.network ?? "public"));
  let entry: DirectoryEntry | undefined;
  if (directory) {
    try {
      entry = (await directory.lookup(destination.kind === "contract" ? destination.contract : account!)) ?? undefined;
    } catch {
      reasons.push({
        code: "directory_unavailable",
        severity: "info",
        message: "The public account directory could not be reached, so exchange memo rules were checked on-chain only.",
      });
    }
  }
  if (entry && entry.tags.some((t) => t === "malicious" || t === "unsafe")) {
    reasons.push({
      code: "destination_flagged",
      severity: "block",
      message: `This account is flagged as ${entry.tags.includes("malicious") ? "malicious" : "unsafe"} in the public directory${entry.name ? ` (${entry.name})` : ""}.`,
      fix: "Do not send. Check the address with the person or service that gave it to you.",
    });
  }

  if (destination.kind === "contract") return { status: statusOf(reasons), destination, entry, reasons };

  const state = await accounts.loadAccount(account!);
  const memoBySep29 = requiresMemo(state);
  const memoByDirectory = entry?.tags.includes("memo-required") ?? false;
  const who = entry?.name ? `${entry.name} ` : "This account ";
  const via = memoBySep29 ? "(SEP-29)" : "(public directory)";
  if (!state.exists) {
    reasons.push({
      code: "destination_unfunded",
      severity: "warn",
      message: "This account does not exist on the network yet. A plain payment to it will fail.",
      fix: "Send at least 1 XLM with a create-account operation, or ask the receiver for a funded address.",
    });
  } else if ((memoBySep29 || memoByDirectory) && destination.kind !== "muxed" && !memo) {
    reasons.push(
      contractSender
        ? {
            code: "contract_sender_cannot_memo",
            severity: "block",
            message: `${who}requires a memo ${via}, and a contract account cannot attach one.`,
            fix: "Send from a classic (G...) account with the memo, or use the receiver's muxed (M...) address if it offers one.",
          }
        : {
            code: "memo_required",
            severity: "block",
            message: `${who}requires a memo ${via}. Without it, the payment may arrive and never be credited.`,
            fix: "Get the memo from the receiver (an exchange shows it next to the deposit address) and include it.",
          },
    );
  }

  return { status: statusOf(reasons), destination, account, memo: federationMemo, entry, reasons };
}
