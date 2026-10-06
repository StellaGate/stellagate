# Contributing to Stellagate

Stellagate tells a sender to stop. If it says stop when the payment would have landed, people
learn to ignore it. If it says go when the funds would be lost, someone loses money. So
every rule in this repo is held to one standard: it has to match what the network or the
receiver actually does, and the pull request has to show the proof.

A rule without a transaction hash is a guess.

## Setup

Node 24 is what CI runs. Anything from Node 20 up works.

```bash
npm ci
npm run typecheck
npm test            # offline, under a second
npm run build
```

The check page is a separate package in `site/`:

```bash
cd site && npm ci
npm run dev                                # http://localhost:5173
npm run typecheck
npm run build
```

CI runs both packages. The site build reads its contact address from `site/site.config.json`
and fails if it is empty, because the privacy policy prints it.

## Where things live

The library is seven files in `src/`, and each one does one job. `address.ts` parses what
the user pasted. `memo.ts` reads SEP-29. `holdability.ts` decides whether a destination can
hold an asset. `check.ts` runs everything and returns the verdict. `sources.ts` is the only
file that talks to the network: Horizon, Stellar RPC, SEP-2 federation and the StellarExpert
directory, each behind an interface you can fake.

`scripts/testnet-evidence.mjs` builds fresh testnet accounts and tries the real payment
behind every check. `scripts/survey-memo-required.mjs` produces the 14-of-107 SEP-29 figure
in the README.

## Rules the code depends on

These break things quietly, so CI will not always catch them.

1. No Node APIs in `src/`. The library runs in the browser on the check page. Its
   `tsconfig.json` leaves out Node's types, so `Buffer` fails the typecheck; use `Uint8Array`
   and the SDK's own encoders.
2. Tests never touch the network. Every `check()` call in a test passes `directory: null`
   and `contracts: null`, or a fake. A test that needs Horizon is a script, not a test.
3. Stellagate never signs, submits or holds funds. A change that needs a secret key, or
   sends a transaction from the library, will be closed.
4. Stellar only. No other chain in code, docs or dependencies.

## Adding or changing a check

A check produces a `Reason`: a `code`, a `severity`, a `message` and usually a `fix`.

Reason codes are public API. Wallets switch on them. Pick a `snake_case` code that names
the condition (`trustline_limit_exceeded`), never the outcome (`payment_bad`). Renaming or
removing one is a breaking change and needs its own issue first.

Severity is a promise about the payment:

- `block` means the funds will be lost, stranded or uncredited, or the network will reject
  the transaction.
- `warn` means it might go wrong and the user should look before sending.
- `info` changes nothing about whether to send.

When unsure between `block` and `warn`, use `warn` and say why in the PR. A false stop costs
the project more trust than a cautious warning.

The `message` says what is wrong in words a person who has never heard of a trustline can
follow. The `fix` says what to do next, as an instruction. Read both out loud before
pushing.

Every new or changed check needs three things in the PR:

- unit tests for the case it catches and the nearest case it must let through;
- a row in `scripts/testnet-evidence.mjs` that attempts the real payment, so the verdict sits
  next to the network's answer, or a mainnet transaction or account on StellarExpert if
  testnet cannot reproduce it;
- the README evidence table updated with the new row.

## Exchange behaviour

What an exchange does with a deposit has no public source, so Stellagate learns it by
depositing. Evidence for exchange behaviour comes from a deposit you made yourself, from
your own account, with a small amount:

- the transaction hash and the date;
- what you sent: asset, memo or muxed ID, sender type (G or C);
- what the exchange did: credited, credited late, held for support, or lost;
- a screenshot of the exchange's deposit history, with your name, email and account number
  cropped out.

Do not submit behaviour you read in a help article, heard from support, or saw someone
describe. Those go in the issue as leads. Only a deposit becomes a record.

## Reporting a wrong verdict

This is the most useful issue anyone can open. Include the destination, the network, the
asset and amount if you gave one, the verdict you got, and what the network or receiver
actually did. A transaction hash settles it.

Never paste a secret key into an issue, even a testnet one.

## Security

If you find a way the check page or library could leak a secret key, or report `ok` for a
destination that will lose funds, do not open a public issue. Report it privately through
the repository's Security tab.

## Pull requests

Comment on an issue before you start, so two people do not build the same thing. One issue
per pull request. Branch from `main`, keep the change small enough to review in one
sitting, and write `Closes #<number>` in the description along with how you checked it
works.

Commits follow the prefixes already in the history: `feat`, `fix`, `docs`, `test`, `ci`,
`chore`. The subject says what changed, in the imperative, under about 70 characters:
`fix: read SEP-29 memo flag without Node Buffer`. One logical change per commit. CI
(typecheck, tests, build) has to pass before review.

## Licence

Stellagate is Apache-2.0. Anything you submit is licensed the same way, under section 5 of
the [licence](LICENSE). There is no separate agreement to sign.
