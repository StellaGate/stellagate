import { Networks, type Asset } from "@stellar/stellar-sdk";
import { isContractAddress, parseDestination, type Destination } from "./address.js";
import { parseAsset, toStroops } from "./asset.js";
import { classicHoldability, contractHoldability } from "./holdability.js";
import { requiresMemo } from "./memo.js";
import {
  HORIZON_URLS,
  RPC_URLS,
  horizonAccountSource,
  rpcContractSource,
  sep2Federation,
  stellarExpertDirectory,
  type AccountSource,
  type ContractSource,
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
  /** The asset being sent: "native" or CODE:ISSUER. Without it, holdability checks are skipped. */
  asset?: string;
  /** The amount being sent, in units of the asset (up to 7 decimals). Used for trustline limits. */
  amount?: string;
  network?: "public" | "testnet";
  accounts?: AccountSource;
  /** Reads contract state over Stellar RPC. Defaults to the public RPC on testnet; pass null to skip. */
  contracts?: ContractSource | null;
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

  let asset: Asset | undefined;
  if (input.asset !== undefined) {
    const a = parseAsset(input.asset);
    if (!a.ok) reasons.push({ code: "asset_invalid", severity: "block", message: a.message });
    else asset = a.asset;
  }
  const amount = input.amount === undefined ? undefined : toStroops(input.amount);
  if (amount === null || amount === 0n) {
    reasons.push({ code: "amount_invalid", severity: "block", message: `Not a valid amount: ${JSON.stringify(input.amount)}.` });
  }
  if (reasons.length) return { status: "block", reasons };

  const network = input.network ?? "public";
  const destination = parsed.destination;
  const accounts = input.accounts ?? horizonAccountSource(HORIZON_URLS[network]);
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
        message: "The destination is a contract. Memo rules do not apply.",
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
    input.directory === null ? null : (input.directory ?? stellarExpertDirectory(network));
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

  if (destination.kind === "contract") {
    if (asset) {
      const contracts =
        input.contracts === null ? null : (input.contracts ?? (network === "testnet" ? rpcContractSource(RPC_URLS.testnet) : null));
      if (!contracts) {
        reasons.push({
          code: "contract_checks_skipped",
          severity: "info",
          message: "No Stellar RPC endpoint was given, so whether this contract can hold the asset was not checked.",
        });
      } else {
        try {
          const passphrase = network === "testnet" ? Networks.TESTNET : Networks.PUBLIC;
          reasons.push(...(await contractHoldability(destination.contract, asset, passphrase, contracts, accounts)));
        } catch (err) {
          reasons.push({
            code: "rpc_unavailable",
            severity: "info",
            message: `Stellar RPC could not be reached (${(err as Error).message}), so whether this contract can hold the asset was not checked.`,
          });
        }
      }
    }
    return { status: statusOf(reasons), destination, entry, reasons };
  }

  const state = await accounts.loadAccount(account!);
  const memoBySep29 = requiresMemo(state);
  const memoByDirectory = entry?.tags.includes("memo-required") ?? false;
  const who = entry?.name ? `${entry.name} ` : "This account ";
  const via = memoBySep29 ? "(SEP-29)" : "(public directory)";
  if (!state.exists) {
    reasons.push(
      asset && !asset.isNative()
        ? {
            code: "destination_unfunded",
            severity: "block",
            message: "This account does not exist on the network yet, so it has no trustline and cannot receive this asset.",
            fix: "Send it as a claimable balance, or ask the receiver to fund the account and add a trustline first.",
          }
        : {
            code: "destination_unfunded",
            severity: "warn",
            message: "This account does not exist on the network yet. A plain payment to it will fail.",
            fix: "Send at least 1 XLM with a create-account operation, or ask the receiver for a funded address.",
          },
    );
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
  if (state.exists && asset) reasons.push(...classicHoldability(state, account!, asset, amount ?? undefined));

  return { status: statusOf(reasons), destination, account, memo: federationMemo, entry, reasons };
}
