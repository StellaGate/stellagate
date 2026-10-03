import type { Asset } from "@stellar/stellar-sdk";
import { toStroops } from "./asset.js";
import type { Reason } from "./check.js";
import type { AccountSource, AccountState, ContractSource } from "./sources.js";

const TRUSTLINE_FIX =
  "Ask the receiver to add a trustline for this asset (it reserves 0.5 XLM), or send it as a claimable balance they can accept later.";

function label(asset: Asset): string {
  const issuer = asset.getIssuer();
  return issuer ? `${asset.getCode()} (issued by ${issuer.slice(0, 4)}...${issuer.slice(-4)})` : "XLM";
}

/** Can a classic (G) account receive this asset? Native XLM always can, as can the issuer itself. */
export function classicHoldability(state: AccountState & { exists: true }, account: string, asset: Asset, amount?: bigint): Reason[] {
  const issuer = asset.getIssuer();
  if (!issuer || issuer === account) return [];
  const line = state.trustlines.find((t) => t.code === asset.getCode() && t.issuer === issuer);
  if (!line) {
    return [
      {
        code: "no_trustline",
        severity: "block",
        message: `This account has no trustline for ${label(asset)}, so it cannot receive it. The payment will fail.`,
        fix: TRUSTLINE_FIX,
      },
    ];
  }
  if (!line.authorized) {
    return [
      {
        code: "trustline_not_authorized",
        severity: "block",
        message: `The issuer has not authorised this account to hold ${label(asset)}. The payment will fail.`,
        fix: "The receiver has to complete the issuer's approval (often a KYC step) before they can receive this asset.",
      },
    ];
  }
  if (amount !== undefined) {
    const room = toStroops(line.limit)! - toStroops(line.balance)! - toStroops(line.buyingLiabilities)!;
    if (amount > room) {
      return [
        {
          code: "trustline_limit_exceeded",
          severity: "block",
          message: `This amount would take the account past the limit it set on its ${label(asset)} trustline. The payment will fail.`,
          fix: "Send a smaller amount, or ask the receiver to raise their trustline limit.",
        },
      ];
    }
  }
  return [];
}

/**
 * Can a contract (C) address receive this asset? Contracts hold classic assets through the
 * asset's Stellar Asset Contract (SAC), with no trustline.
 */
export async function contractHoldability(
  contract: string,
  asset: Asset,
  passphrase: string,
  contracts: ContractSource,
  accounts: AccountSource,
): Promise<Reason[]> {
  const reasons: Reason[] = [];
  if (!(await contracts.contractExists(contract))) {
    reasons.push({
      code: "destination_contract_missing",
      severity: "block",
      message: "No contract is deployed at this address. Anything sent here cannot be moved until one is.",
      fix: "Check the address with the receiver. A smart wallet's address exists once the wallet has been created on this network.",
    });
  }
  const sac = asset.contractId(passphrase);
  if (!(await contracts.contractExists(sac))) {
    reasons.push({
      code: "sac_not_deployed",
      severity: "block",
      message: `${label(asset)} has no Stellar Asset Contract on this network yet, so no contract address can hold it.`,
      fix: `Anyone can deploy it with one transaction (for example: stellar contract asset deploy --asset ${asset.isNative() ? "native" : `${asset.getCode()}:${asset.getIssuer()}`}).`,
    });
    return reasons;
  }
  const issuerId = asset.getIssuer();
  if (!issuerId) return reasons;

  const balance = await contracts.sacBalance(sac, contract);
  if (balance && !balance.authorized) {
    reasons.push({
      code: "sac_balance_not_authorized",
      severity: "block",
      message: `The issuer has frozen this contract's ${label(asset)} balance. The transfer will fail.`,
      fix: "The receiver has to ask the issuer to authorise the balance.",
    });
  } else if (!balance) {
    const issuer = await accounts.loadAccount(issuerId);
    if (!issuer.exists) {
      reasons.push({
        code: "issuer_missing",
        severity: "block",
        message: `The issuer of ${label(asset)} does not exist on this network.`,
        fix: "Check the asset code and issuer.",
      });
    } else if (issuer.authRequired) {
      reasons.push({
        code: "sac_balance_not_authorized",
        severity: "block",
        message: `${label(asset)} needs the issuer's approval to hold, and this contract has not been approved. The transfer will fail.`,
        fix: "The receiver has to get the issuer to authorise their contract address first.",
      });
    }
  }
  return reasons;
}
