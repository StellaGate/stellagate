# Stellagate

Check a Stellar destination before you send, not after.

Stellagate tells a wallet, before anything is signed, whether a destination needs a memo,
whether it can hold the asset, and whether the sending account can reach it at all. It is
built for the payments that go missing today: exchange deposits without a memo, withdrawals
to wallets without a trustline, and passkey smart wallets (C-addresses) paying exchanges
that only understand memos.

## The problem

A Stellar address does not say what the receiver needs.

- Exchanges pool deposits in one account and credit them by memo. Without it, the funds
  arrive and are never credited. The SDK team's own description: "a deposit credited to a
  pooled exchange account with no memo, which means lost funds and a support ticket"
  ([js-stellar-sdk#1607](https://github.com/stellar/js-stellar-sdk/issues/1607)).
- Memos are still required by many services. Stellar's docs, September 2026: memos "remain
  the required path for many exchanges, anchors, and wallets"
  ([stellar-docs#2769](https://github.com/stellar/stellar-docs/issues/2769)).
- Smart wallets cannot attach a memo, because Soroban transactions do not carry one. The
  muxed-ID transfer that replaces it (CAP-67) "is not yet widely supported in exchanges for
  deposit" ([freighter-mobile#492](https://github.com/stellar/freighter-mobile/issues/492)).
- Receiving a classic asset needs a trustline and 0.5 XLM of reserve. Withdrawals to a
  wallet without one fail.

There are now four address forms (G, M, C, and `name*domain` federation) and a memo field
that works for some of them. SEP-29 lets an account flag "memo required", but only helps if
the account sets it and the sending wallet checks it. Most exchanges never set it: of the
107 accounts StellarExpert's directory tags memo-required, only 14 carry the SEP-29 flag on
chain. Binance, Kraken, Bitstamp, Coinbase Deposits and Crypto.com are among the 93 that do
not (survey of 2026-10-02, reproducible with `node scripts/survey-memo-required.mjs`).
A wallet that relies on SEP-29 alone misses 87% of them.

## What Stellagate checks

```ts
import { check } from '@stellagate/core'

const verdict = await check({
  to: 'GABFQIK63R2NETJM7T673EAMZN4RJLLGP3OFUEJU5SZVTGWUKULZJNL6', // what the user pasted
  from: 'CB...',      // optional: the sending account, G or C
  memo: undefined,    // optional: a memo the user already entered
  network: 'public',
})

verdict.status   // 'block'
verdict.entry    // { name: 'Binance Deposits', domain: 'binance.com', tags: ['exchange', 'memo-required'] }
verdict.reasons  // [{ code: 'contract_sender_cannot_memo', severity: 'block',
                 //    message: 'Binance Deposits requires a memo (public directory), and a
                 //              contract account cannot attach one.',
                 //    fix: 'Send from a classic (G...) account with the memo, ...' }]
```

1. **Parse** G, M, C and federation addresses into an account plus memo or muxed ID, and
   refuse a pasted secret key.
2. **Memo required?** From the account's SEP-29 data entry and the StellarExpert directory,
   later also Stellagate's own exchange records.
3. **Flagged?** Blocks accounts the directory marks malicious or unsafe.
4. **Can this sender reach it?** Flags a contract account paying a memo-required account, or
   trying to attach a memo at all, and gives the route that works.
5. **Can it hold the asset?** Trustline and Stellar Asset Contract checks, next milestone.

Stellagate never signs, submits or holds funds.

## Status

| Part | Status |
|---|---|
| Problem research and evidence | Done, see [docs/PRD.md](docs/PRD.md) |
| Address parsing (G, M, C, federation, secret-key refusal) | Done, tested |
| Memo-required check: SEP-29 and public directory | Done, tested, verified against mainnet |
| Malicious and unsafe account flags | Done, tested |
| Contract-account sender compatibility | Done, tested |
| Trustline and SAC holdability check | Planned |
| Public check page | Planned |
| Exchange records with deposit evidence | Planned |
| npm release | Planned, not yet published |
| Upstream proposal to js-stellar-sdk | Planned |

## Evidence

- `scripts/survey-memo-required.mjs` checks every account the StellarExpert directory tags
  memo-required against Horizon. On 2026-10-02: 107 accounts, 14 with SEP-29 set.
- Testnet demonstrations, with transaction hashes and StellarExpert links, will be listed
  here as each check is exercised against real testnet accounts.

## Development

```bash
npm install
npm test          # unit tests, offline
npm run build
```

## Data sources

Horizon and Stellar RPC, SEP-1 `stellar.toml` files, SEP-2 federation servers, and the
StellarExpert directory API. All public. Exchange behaviour is established by small test
deposits from the maintainer's own accounts and recorded with the transaction hash.

## Maintainer

[@jadonamite](https://github.com/jadonamite), a Stellar Wave contributor since January 2026
with roughly a hundred resolved issues across Stellar projects, including payment
infrastructure, Soroban contracts and SDKs.

## Contributing

Issues are scoped so each one can be picked up independently. See
[CONTRIBUTING.md](CONTRIBUTING.md) once it lands.

## License

Apache-2.0. See [LICENSE](LICENSE).
