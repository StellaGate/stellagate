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
  asset: 'native',    // optional: 'native' or CODE:ISSUER, for the holdability check
  amount: '250',      // optional: checked against the receiver's trustline limit
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
5. **Can it hold the asset?** A classic account needs a trustline the issuer has authorised,
   with room under its limit for the amount. A contract address holds classic assets through
   the asset's Stellar Asset Contract, so that contract must be deployed, the destination
   contract must exist, and an issuer that requires approval must have approved it. Contract
   checks read Stellar RPC: testnet's public endpoint by default, and on mainnet whatever
   endpoint you pass with `contracts: rpcContractSource(url)`.

Stellagate never signs, submits or holds funds.

## Status

| Part | Status |
|---|---|
| Problem research and evidence | Done, see [docs/PRD.md](docs/PRD.md) |
| Address parsing (G, M, C, federation, secret-key refusal) | Done, tested |
| Memo-required check: SEP-29 and public directory | Done, tested, verified against mainnet |
| Malicious and unsafe account flags | Done, tested |
| Contract-account sender compatibility | Done, tested |
| Trustline and SAC holdability check | Done, tested, exercised on testnet |
| Public check page | Planned |
| Exchange records with deposit evidence | Planned |
| npm release | Planned, not yet published |
| Upstream proposal to js-stellar-sdk | Planned |

## Evidence

- `scripts/survey-memo-required.mjs` checks every account the StellarExpert directory tags
  memo-required against Horizon. On 2026-10-02: 107 accounts, 14 with SEP-29 set.
- `scripts/testnet-evidence.mjs` creates fresh testnet accounts, runs each check, then makes
  the real payment anyway. Every `block` below matches a payment the network refused, and
  every `ok` matches one it accepted. The one exception is the last row. A token transfer to
  a contract address with nothing deployed succeeds, and the tokens sit at that address
  until someone deploys a contract there. The network will not stop that payment, so
  Stellagate does.
- The contract destination is a deployed contract (the KYC asset's own Stellar Asset
  Contract) standing in for a smart wallet.
- Testnet is reset from time to time, which breaks these links. The script reproduces the
  whole run in about a minute.

Run on testnet, 2026-10-03.

Setup:

| Step | Transaction |
|---|---|
| Exchange sets SEP-29 memo_required | [acccf23a](https://stellar.expert/explorer/testnet/tx/acccf23acd8ebb32c76999277d2219ab448af7299b2509e2ad41521346c69a57) |
| Approval-required issuer sets AUTH_REQUIRED and AUTH_REVOCABLE | [8b27a270](https://stellar.expert/explorer/testnet/tx/8b27a270b68f1cafb7cb1a7a50d1e92f041df388fdc8da3428c44a3999c1ba4c) |
| Receiver adds STG trustline | [a427a390](https://stellar.expert/explorer/testnet/tx/a427a390326a17ef9c9acc74bb9af119f4a168f6579e461b41f03b21e04662e6) |
| Receiver adds STG trustline with limit 100 | [492c08d1](https://stellar.expert/explorer/testnet/tx/492c08d199aec484b4566814333724c3c381e0b89aaa74fc7473982b7c6bd78e) |
| Receiver adds KYC trustline (not yet approved) | [48b900d0](https://stellar.expert/explorer/testnet/tx/48b900d05c3060089c480483784504235534301bc764755cba95d68e166ca80a) |
| Sender adds STG trustline | [9bc4c934](https://stellar.expert/explorer/testnet/tx/9bc4c934313165c09c711209de42e058a60f21ad98690eb79b55661998109b75) |
| Issuer pays sender 1000 STG | [e6df3799](https://stellar.expert/explorer/testnet/tx/e6df3799e519beae4ea48ebad050ddf266a6ac24c7f7b5811f0cd1955215f031) |
| Deploy the STG Stellar Asset Contract | [f3b99f4b](https://stellar.expert/explorer/testnet/tx/f3b99f4b4a31f06bb5e7142669a01e96e9cb11035e76204cbae72851c209534f) |
| Deploy the KYC Stellar Asset Contract | [bacb5a3b](https://stellar.expert/explorer/testnet/tx/bacb5a3b0651356ff9cacbfbcaa14cb260096264890cfdd59e0363e3e4e30915) |
| Issuer authorises the KYC trustline | [3dbb801d](https://stellar.expert/explorer/testnet/tx/3dbb801d8f29916fad8d6c2c3d878ce33768a7d36aab1c2e6fc0b2d242b3992c) |
| Deploy the NEW Stellar Asset Contract | [1d728180](https://stellar.expert/explorer/testnet/tx/1d72818036f487e27f3d9fe3176afb042e633a8e092126654e04c44ebed1f32e) |

Checks, then the real payment:

| Scenario | Destination | Verdict | Reasons | Payment attempted | Network result |
|---|---|---|---|---|---|
| SEP-29 account, no memo | [GBJ2...TMIE](https://stellar.expert/explorer/testnet/account/GBJ274DITDEDTW7EMLNV5UWHZOUFRVAFOBZUL43P6YZ6Y4T7EJOHTMIE) | block | `memo_required` | none |  |
| SEP-29 account, memo given | [GBJ2...TMIE](https://stellar.expert/explorer/testnet/account/GBJ274DITDEDTW7EMLNV5UWHZOUFRVAFOBZUL43P6YZ6Y4T7EJOHTMIE) | ok | none | [0413d601](https://stellar.expert/explorer/testnet/tx/0413d6019e269dfc59450238f9df62998f26ce48e490c5d047147c08159490d1) | success |
| SEP-29 account, contract sender | [GBJ2...TMIE](https://stellar.expert/explorer/testnet/account/GBJ274DITDEDTW7EMLNV5UWHZOUFRVAFOBZUL43P6YZ6Y4T7EJOHTMIE) | block | `contract_sender_cannot_memo` | none |  |
| No trustline | [GDEY...4ZTU](https://stellar.expert/explorer/testnet/account/GDEYWHHTB6OA5XWIUO6YT4CZ6NCECHACLL53CKRZU5A6TJH4RGSM4ZTU) | block | `no_trustline` | [d7f807ca](https://stellar.expert/explorer/testnet/tx/d7f807caff09093a48f48146584a84127a1e71995d3a0d3df105f667220021f2) | tx_failed, op_no_trust |
| Trustline present | [GALN...M45E](https://stellar.expert/explorer/testnet/account/GALNLIFTZG4B4G5SX6NK25UTIRSXAUX62YWJ4KORATC76VS6Q3COM45E) | ok | none | [03c26f4e](https://stellar.expert/explorer/testnet/tx/03c26f4e54966583bbe19ab02c01183e5b412e0c6244591ae19a822d96bd1dd0) | success |
| Over the trustline limit | [GD7W...EK4D](https://stellar.expert/explorer/testnet/account/GD7WFNLEOMDBIBI6EIC4DQGBICLRELHMS4B4ZMMFY3VU3YRN7XOPEK4D) | block | `trustline_limit_exceeded` | [b88d4025](https://stellar.expert/explorer/testnet/tx/b88d4025cecdb1afdb87c272ed408540fe5aa3c2c72d3e0dc596397908a001ad) | tx_failed, op_line_full |
| Within the trustline limit | [GD7W...EK4D](https://stellar.expert/explorer/testnet/account/GD7WFNLEOMDBIBI6EIC4DQGBICLRELHMS4B4ZMMFY3VU3YRN7XOPEK4D) | ok | none | [ddfb5be3](https://stellar.expert/explorer/testnet/tx/ddfb5be349332577762b3d24f47edd2d2243a0151db25abe7038d8512ac4a893) | success |
| Trustline not authorised by issuer | [GDLA...CXBX](https://stellar.expert/explorer/testnet/account/GDLAN2KCQFWDPTZQMCILDVQP2TNAJP3Y646ROSDS4GFGCDIIR5LJCXBX) | block | `trustline_not_authorized` | [21a37b87](https://stellar.expert/explorer/testnet/tx/21a37b87d6e1cc0e8e5b3cb8538d8aebd63ea3d5573113f4ab16e6841024bb5f) | tx_failed, op_not_authorized |
| Trustline authorised by issuer | [GDLA...CXBX](https://stellar.expert/explorer/testnet/account/GDLAN2KCQFWDPTZQMCILDVQP2TNAJP3Y646ROSDS4GFGCDIIR5LJCXBX) | ok | none | [f4852528](https://stellar.expert/explorer/testnet/tx/f4852528d5eba94efbc039d5757de15b722bf4dce82399e2007f1257e5818403) | success |
| Account does not exist, STG | [GDHF...JR3E](https://stellar.expert/explorer/testnet/account/GDHFPAKHWCMNOBG72B7PUL7NNWXUPFZK7GPL75S2TXBBPYJ2LMNPJR3E) | block | `destination_unfunded` | [e7ab5249](https://stellar.expert/explorer/testnet/tx/e7ab5249133ce061213c3d8eebe0101ec64066415fdba46d9d49aa57e08370d5) | tx_failed, op_no_destination |
| Contract, asset contract not deployed | [CC2B...SN4C](https://stellar.expert/explorer/testnet/contract/CC2BO6ZMFVILIJVGW777H3HB4GUKWQ7E5Y4NODWJXTIJBDKHLKPWSN4C) | block | `sac_not_deployed` | not submitted | rejected in simulation: HostError: Error(Storage, MissingValue) |
| Contract, asset contract deployed | [CC2B...SN4C](https://stellar.expert/explorer/testnet/contract/CC2BO6ZMFVILIJVGW777H3HB4GUKWQ7E5Y4NODWJXTIJBDKHLKPWSN4C) | ok | none | [49922faf](https://stellar.expert/explorer/testnet/tx/49922faf117cf3ecfedc45c6765e1f7867810fd2df7b02e30d64fd8d8d7a5ac5) | success |
| Contract, STG via its asset contract | [CC2B...SN4C](https://stellar.expert/explorer/testnet/contract/CC2BO6ZMFVILIJVGW777H3HB4GUKWQ7E5Y4NODWJXTIJBDKHLKPWSN4C) | ok | none | [3c4a6f90](https://stellar.expert/explorer/testnet/tx/3c4a6f90a2ea004c9bceb5b75762ab64c7f7039efc69236a573d154646a33819) | success |
| Contract, approval-required asset, not approved | [CC2B...SN4C](https://stellar.expert/explorer/testnet/contract/CC2BO6ZMFVILIJVGW777H3HB4GUKWQ7E5Y4NODWJXTIJBDKHLKPWSN4C) | block | `sac_balance_not_authorized` | not submitted | rejected in simulation: HostError: Error(Contract, #11) |
| Contract address with nothing deployed | [CDSC...HENS](https://stellar.expert/explorer/testnet/contract/CDSC24WZ263JXIMRGAFVJCOYDX4FWAQZGDLDF3GN5UQTCFDBK6Y5HENS) | block | `destination_contract_missing` | [301a734c](https://stellar.expert/explorer/testnet/tx/301a734ca54956b7274211f8592f60b451e4b25bee33b8fab18faab676653740) | success |

## Development

```bash
npm install
npm test          # unit tests, offline
npm run build
node scripts/testnet-evidence.mjs   # rerun the testnet evidence, about a minute
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
