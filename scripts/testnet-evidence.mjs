// Exercise each check against fresh testnet accounts, then try the real payment, so every
// verdict sits next to what the network actually did.
// Usage: npm run build && node scripts/testnet-evidence.mjs
import {
  Address,
  Asset,
  BASE_FEE,
  Horizon,
  Keypair,
  Memo,
  Networks,
  Operation,
  StrKey,
  TransactionBuilder,
  nativeToScVal,
  rpc,
} from "@stellar/stellar-sdk";
import { HORIZON_URLS, RPC_URLS, check } from "../dist/index.js";

const horizon = new Horizon.Server(HORIZON_URLS.testnet);
const soroban = new rpc.Server(RPC_URLS.testnet);
const passphrase = Networks.TESTNET;
const base = { network: "testnet", directory: null };
const rows = [];

const kp = () => Keypair.random();
const short = (s) => `${s.slice(0, 4)}...${s.slice(-4)}`;
const txLink = (h) => `[${h.slice(0, 8)}](https://stellar.expert/explorer/testnet/tx/${h})`;
const acctLink = (a) => `[${short(a)}](https://stellar.expert/explorer/testnet/${a.startsWith("C") ? "contract" : "account"}/${a})`;

async function fund(...keys) {
  await Promise.all(keys.map((k) => fetch(`https://friendbot.stellar.org/?addr=${k.publicKey()}`).then((r) => r.ok || Promise.reject(new Error(`friendbot ${r.status}`)))));
}

async function classic(signer, ops, memo) {
  const tx = new TransactionBuilder(await horizon.loadAccount(signer.publicKey()), { fee: BASE_FEE, networkPassphrase: passphrase });
  ops.forEach((o) => tx.addOperation(o));
  if (memo) tx.addMemo(Memo.text(memo));
  const built = tx.setTimeout(60).build();
  built.sign(signer);
  const hash = Buffer.from(built.hash()).toString("hex");
  try {
    await horizon.submitTransaction(built);
    return { ok: true, hash, result: "success" };
  } catch (err) {
    const codes = err.response?.data?.extras?.result_codes;
    if (!codes) throw err;
    return { ok: false, hash, result: [codes.transaction, ...(codes.operations ?? [])].join(", ") };
  }
}

async function contractCall(signer, op) {
  const tx = new TransactionBuilder(await horizon.loadAccount(signer.publicKey()), { fee: BASE_FEE, networkPassphrase: passphrase })
    .addOperation(op)
    .setTimeout(60)
    .build();
  let prepared;
  try {
    prepared = await soroban.prepareTransaction(tx);
  } catch (err) {
    const first = String(err.message ?? err).split("\n")[0];
    return { ok: false, hash: null, result: `rejected in simulation: ${first.slice(0, 120)}` };
  }
  prepared.sign(signer);
  const sent = await soroban.sendTransaction(prepared);
  if (sent.status === "ERROR") return { ok: false, hash: sent.hash, result: "rejected on submit" };
  const done = await soroban.pollTransaction(sent.hash, { attempts: 30 });
  return { ok: done.status === "SUCCESS", hash: sent.hash, result: done.status.toLowerCase() };
}

const transfer = (asset, from, to, stroops) =>
  Operation.invokeContractFunction({
    contract: asset.contractId(passphrase),
    function: "transfer",
    args: [new Address(from).toScVal(), new Address(to).toScVal(), nativeToScVal(stroops, { type: "i128" })],
  });

async function scenario(name, input, attempt) {
  const v = await check({ ...base, ...input });
  const outcome = attempt ? await attempt() : null;
  rows.push({ name, to: input.to, status: v.status, codes: v.reasons.filter((r) => r.code !== "destination_contract").map((r) => r.code), outcome });
  console.error(`${v.status.padEnd(5)} ${name}${outcome ? ` -> ${outcome.result}` : ""}`);
}

// Accounts
const issuer = kp(), strictIssuer = kp(), freshIssuer = kp();
const exchange = kp(), sender = kp(), noLine = kp(), withLine = kp(), capped = kp(), pending = kp();
const unfunded = kp();
await fund(issuer, strictIssuer, freshIssuer, exchange, sender, noLine, withLine, capped, pending);

const STG = new Asset("STG", issuer.publicKey());
const KYC = new Asset("KYC", strictIssuer.publicKey());
const NEW = new Asset("NEW", freshIssuer.publicKey());
const id = (a) => `${a.getCode()}:${a.getIssuer()}`;

// Setup: SEP-29 flag, trustlines, an approval-required issuer, the sender's STG balance.
const setup = [];
setup.push(["Exchange sets SEP-29 memo_required", await classic(exchange, [Operation.manageData({ name: "config.memo_required", value: "1" })])]);
setup.push(["Approval-required issuer sets AUTH_REQUIRED and AUTH_REVOCABLE", await classic(strictIssuer, [Operation.setOptions({ setFlags: 3 })])]);
setup.push(["Receiver adds STG trustline", await classic(withLine, [Operation.changeTrust({ asset: STG })])]);
setup.push(["Receiver adds STG trustline with limit 100", await classic(capped, [Operation.changeTrust({ asset: STG, limit: "100" })])]);
setup.push(["Receiver adds KYC trustline (not yet approved)", await classic(pending, [Operation.changeTrust({ asset: KYC })])]);
setup.push(["Sender adds STG trustline", await classic(sender, [Operation.changeTrust({ asset: STG })])]);
setup.push(["Issuer pays sender 1000 STG", await classic(issuer, [Operation.payment({ destination: sender.publicKey(), asset: STG, amount: "1000" })])]);
setup.push(["Deploy the STG Stellar Asset Contract", await contractCall(sender, Operation.createStellarAssetContract({ asset: STG }))]);
setup.push(["Deploy the KYC Stellar Asset Contract", await contractCall(strictIssuer, Operation.createStellarAssetContract({ asset: KYC }))]);
for (const [what, r] of setup) if (!r.ok) throw new Error(`setup failed: ${what}: ${r.result}`);

const pay = (to, asset, amount, memo) => () => classic(sender, [Operation.payment({ destination: to, asset, amount })], memo);
const payKyc = (to, amount) => () => classic(strictIssuer, [Operation.payment({ destination: to, asset: KYC, amount })]);

// Memo
await scenario("SEP-29 account, no memo", { to: exchange.publicKey(), from: sender.publicKey(), asset: "native" });
await scenario("SEP-29 account, memo given", { to: exchange.publicKey(), from: sender.publicKey(), asset: "native", memo: "4419" }, pay(exchange.publicKey(), Asset.native(), "5", "4419"));
await scenario("SEP-29 account, contract sender", { to: exchange.publicKey(), from: STG.contractId(passphrase), asset: "native" });

// Trustlines
await scenario("No trustline", { to: noLine.publicKey(), asset: id(STG), amount: "10" }, pay(noLine.publicKey(), STG, "10"));
await scenario("Trustline present", { to: withLine.publicKey(), asset: id(STG), amount: "10" }, pay(withLine.publicKey(), STG, "10"));
await scenario("Over the trustline limit", { to: capped.publicKey(), asset: id(STG), amount: "150" }, pay(capped.publicKey(), STG, "150"));
await scenario("Within the trustline limit", { to: capped.publicKey(), asset: id(STG), amount: "50" }, pay(capped.publicKey(), STG, "50"));
await scenario("Trustline not authorised by issuer", { to: pending.publicKey(), asset: id(KYC), amount: "10" }, payKyc(pending.publicKey(), "10"));
setup.push(["Issuer authorises the KYC trustline", await classic(strictIssuer, [Operation.setTrustLineFlags({ trustor: pending.publicKey(), asset: KYC, flags: { authorized: true } })])]);
await scenario("Trustline authorised by issuer", { to: pending.publicKey(), asset: id(KYC), amount: "10" }, payKyc(pending.publicKey(), "10"));
await scenario("Account does not exist, STG", { to: unfunded.publicKey(), asset: id(STG), amount: "10" }, pay(unfunded.publicKey(), STG, "10"));

// Contract destinations. The holder is a deployed contract (the KYC asset contract), standing
// in for a smart wallet.
const holder = KYC.contractId(passphrase);
const nowhere = StrKey.encodeContract(Keypair.random().rawPublicKey());
await scenario("Contract, asset contract not deployed", { to: holder, asset: id(NEW), amount: "10" }, () => contractCall(freshIssuer, transfer(NEW, freshIssuer.publicKey(), holder, 100_000_000n)));
setup.push(["Deploy the NEW Stellar Asset Contract", await contractCall(freshIssuer, Operation.createStellarAssetContract({ asset: NEW }))]);
await scenario("Contract, asset contract deployed", { to: holder, asset: id(NEW), amount: "10" }, () => contractCall(freshIssuer, transfer(NEW, freshIssuer.publicKey(), holder, 100_000_000n)));
await scenario("Contract, STG via its asset contract", { to: holder, asset: id(STG), amount: "10" }, () => contractCall(sender, transfer(STG, sender.publicKey(), holder, 100_000_000n)));
await scenario("Contract, approval-required asset, not approved", { to: holder, asset: id(KYC), amount: "10" }, () => contractCall(pending, transfer(KYC, pending.publicKey(), holder, 10_000_000n)));
await scenario("Contract address with nothing deployed", { to: nowhere, asset: id(STG), amount: "1" }, () => contractCall(sender, transfer(STG, sender.publicKey(), nowhere, 10_000_000n)));

// Report
const today = new Date().toISOString().slice(0, 10);
console.log(`Run on testnet, ${today}.\n`);
console.log("Setup:\n");
console.log("| Step | Transaction |\n|---|---|");
for (const [what, r] of setup) console.log(`| ${what} | ${txLink(r.hash)} |`);
console.log("\nChecks, then the real payment:\n");
console.log("| Scenario | Destination | Verdict | Reasons | Payment attempted | Network result |\n|---|---|---|---|---|---|");
for (const r of rows) {
  const tx = r.outcome ? (r.outcome.hash ? txLink(r.outcome.hash) : "not submitted") : "none";
  console.log(`| ${r.name} | ${acctLink(r.to)} | ${r.status} | ${r.codes.map((c) => `\`${c}\``).join(", ") || "none"} | ${tx} | ${r.outcome?.result ?? ""} |`);
}
