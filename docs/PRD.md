# Stellagate product requirements

Status: 2026-10-02. Milestone 1 (address parsing and memo checks) is built; the rest is planned.

## Problem

A Stellar address does not tell the sender what the receiver needs. Exchanges pool customer
deposits in one account and credit them by memo; a deposit without the memo arrives and is
never credited. A wallet without a trustline cannot receive the asset at all. Passkey smart
wallets are contract accounts (C-addresses) that pay through Soroban, where a transaction
cannot carry a memo, so they cannot pay most exchange deposit addresses.

The SDK team describes the outcome as "lost funds and a support ticket"
([js-stellar-sdk#1607](https://github.com/stellar/js-stellar-sdk/issues/1607)). Stellar's
docs still tell custodians that memos "remain the required path for many exchanges, anchors,
and wallets" ([stellar-docs#2769](https://github.com/stellar/stellar-docs/issues/2769)). The
muxed-ID transfer that would replace memos for smart wallets "is not yet widely supported in
exchanges for deposit" ([freighter-mobile#492](https://github.com/stellar/freighter-mobile/issues/492)).


## Who it is for

The person sending: someone moving their own money between an exchange and a Stellar wallet,
increasingly from a smart wallet. They adopt Stellagate through the wallet or dapp they
already use, so the first integrators are wallet and dapp developers.

After Stellagate exists, the sender stops guessing whether the other side needs a memo, a
trustline or a different kind of address, and stops filing tickets to get money back.

## What it does

Given the sending account, the asset and a destination string, Stellagate answers before
anything is signed:

1. **Can this address be parsed?** G, M (muxed), C (contract) and `name*domain` (SEP-2
   federation) forms, normalised to an account plus memo or muxed ID.
2. **Does it need a memo?** From the account's SEP-29 `config.memo_required` data entry, the
   StellarExpert directory's `memo-required` tag, and Stellagate's own exchange records.
3. **Can it hold this asset?** Trustline present and authorised for classic accounts; for
   C-addresses, whether the asset has a Stellar Asset Contract the destination can hold.
4. **Can this sender reach it?** A C-address sender paying a memo-required G-address is
   flagged, with the route that works instead (muxed destination if the receiver accepts
   it, otherwise send from a classic account).

The answer is a verdict (`ok`, `warn`, `block`) plus plain-language reasons and the fix.

## How it ships

- A TypeScript library, `@stellagate/core`, built on `@stellar/stellar-sdk`. It touches the
  network only for account lookup, federation and the directory.
- An upstream offer of the C-address and exchange checks to the SDK's own destination
  resolver (js-stellar-sdk#1607), so wallets get them without a second dependency.
- A public check page: paste a destination, see the verdict, with no account and no wallet
  connection. It ships with terms, privacy and cookie pages, a consent banner and
  self-hosted fonts.
- A versioned JSON record of what each exchange accepts (memo format, muxed destinations,
  deposits from contract accounts). Every entry is backed by a testnet or small mainnet
  deposit with its transaction hash.

## Data sources

All open: Horizon or Stellar RPC for account data and trustlines, SEP-1 `stellar.toml`
files, SEP-2 federation servers, and the StellarExpert directory API. Exchange behaviour has
no public source and is established by test deposits from the maintainer's own accounts.

## Out of scope for v1

Holding or forwarding funds. Stellagate never signs or submits a transaction and never
takes custody. A relay for smart-wallet deposits would take custody and is ruled out.

## Milestones

1. Address parsing and SEP-29 memo check, with unit tests against fixtures from testnet.
2. Trustline and SAC holdability checks.
3. Sender-type compatibility (C to memo-required G) and the verdict model.
4. Public check page, with legal pages.
5. First ten exchange records, each with deposit evidence.
6. Upstream proposal to js-stellar-sdk.

## Success and kill criteria

Success: within 10 weeks of the check page going live, the C-address check is accepted
upstream or two wallets or dapps ship it, and the page runs 500 checks.

Fail: in the same 10 weeks, no integration, no upstream acceptance, and fewer than 100
checks. At that point ask whether, starting today, this is still the right build.

## Open questions

- Do exchanges credit SAC transfers that carry a muxed ID (CAP-67)? Unknown until tested.
- Will the SDK team accept the C-address check upstream, or prefer a separate package?
- Should the exchange record be community-editable, and who reviews entries?
