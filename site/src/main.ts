import "./tokens.css";
import "./styles.css";
import type { CheckInput, Reason, Verdict } from "@stellagate/core";
import { drawGuilloche } from "./guilloche.ts";
import { initNotice } from "./notice.ts";

// The Stellar SDK is large, so it loads when the visitor starts typing or checks.
let core: Promise<typeof import("@stellagate/core")> | undefined;
const loadCore = () => (core ??= import("@stellagate/core"));

interface Preset {
  to: string;
  memo?: string;
  asset?: string;
  amount?: string;
  from?: string;
  network?: "public" | "testnet";
}

const PRESETS: Record<string, Preset> = {
  binance: {
    to: "GABFQIK63R2NETJM7T673EAMZN4RJLLGP3OFUEJU5SZVTGWUKULZJNL6",
    network: "public",
  },
  "smart-wallet": {
    to: "GABFQIK63R2NETJM7T673EAMZN4RJLLGP3OFUEJU5SZVTGWUKULZJNL6",
    from: "CC2BO6ZMFVILIJVGW777H3HB4GUKWQ7E5Y4NODWJXTIJBDKHLKPWSN4C",
    network: "public",
  },
  trustline: {
    to: "GDEYWHHTB6OA5XWIUO6YT4CZ6NCECHACLL53CKRZU5A6TJH4RGSM4ZTU",
    asset: "USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
    network: "testnet",
  },
  federation: {
    to: "help*lobstr.co",
    network: "public",
  },
};
const FIELDS = ["to", "memo", "asset", "amount", "from"] as const;

const form = document.querySelector<HTMLFormElement>("#check-form")!;
const button = document.querySelector<HTMLButtonElement>("#check-button")!;
const verdictEl = document.querySelector<HTMLElement>("#verdict")!;
const input = (name: string) => form.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement;

type RowStatus = "fine" | "check" | "stop" | "skipped";
interface Row {
  question: string;
  status: RowStatus;
  answer: string;
  fix?: string;
}

const ROWS = {
  memo: ["memo_required", "contract_sender_cannot_memo"],
  exists: ["destination_unfunded", "destination_contract_missing"],
  hold: [
    "no_trustline",
    "trustline_not_authorized",
    "trustline_limit_exceeded",
    "sac_not_deployed",
    "sac_balance_not_authorized",
    "issuer_missing",
    "contract_checks_skipped",
    "rpc_unavailable",
  ],
  wallet: ["memo_unsupported_for_contract_sender", "muxed_from_contract"],
  list: ["destination_flagged", "directory_unavailable"],
} as const;

// Shown in a row when the full message is already the verdict's headline.
const SHORT: Record<string, string> = {
  memo_required: "Yes, and no memo was given.",
  contract_sender_cannot_memo: "Yes, and a smart wallet cannot attach one.",
  destination_unfunded: "No. The account has not been created yet.",
  destination_contract_missing: "No contract is deployed at this address.",
  no_trustline: "No. It has not opted in to this asset.",
  trustline_not_authorized: "Not yet. The issuer has not approved it.",
  trustline_limit_exceeded: "Not this much. It would pass the account's own limit.",
  sac_not_deployed: "No. The asset has no contract on this network yet.",
  sac_balance_not_authorized: "No. The issuer has not approved this contract.",
  issuer_missing: "No. The asset's issuer does not exist.",
  memo_unsupported_for_contract_sender: "No. A smart wallet cannot attach the memo you entered.",
  muxed_from_contract: "Probably, but many exchanges do not credit these yet.",
  destination_flagged: "Yes. Do not send.",
};

const HEADLINE = { block: "Stop.", warn: "Check first.", ok: "Looks fine." } as const;
const STATUS_WORD: Record<RowStatus, string> = { fine: "Fine", check: "Check", stop: "Stop", skipped: "Not checked" };

function buildRows(v: Verdict, q: CheckInput): Row[] {
  const top = topReason(v);
  const fromReason = (question: string, r: Reason): Row => {
    const status: RowStatus = r.severity === "block" ? "stop" : r.severity === "warn" ? "check" : "skipped";
    return r === top && SHORT[r.code] ? { question, status, answer: SHORT[r.code] } : { question, status, answer: r.message, fix: r.fix };
  };
  const find = (codes: readonly string[]) => v.reasons.find((r) => codes.includes(r.code));
  const kind = v.destination?.kind;
  const rows: Row[] = [];

  const exists = find(ROWS.exists);
  rows.push(
    exists
      ? fromReason("Does it exist?", exists)
      : { question: "Does it exist?", status: "fine", answer: kind === "contract" && !q.asset ? "It is a contract address. Add the asset to check it is deployed." : "Yes, it is live on the network." },
  );

  const memo = find(ROWS.memo);
  let memoRow: Row;
  if (memo) memoRow = fromReason("Does it need a memo?", memo);
  else if (kind === "contract") memoRow = { question: "Does it need a memo?", status: "fine", answer: "No. Contracts do not take memos." };
  else if (kind === "muxed") memoRow = { question: "Does it need a memo?", status: "fine", answer: "No. The customer ID is built into this address." };
  else if (exists) memoRow = { question: "Does it need a memo?", status: "skipped", answer: "Not checked, because the account does not exist." };
  else if (q.memo || v.memo) memoRow = { question: "Does it need a memo?", status: "fine", answer: `Your memo ${q.memo ?? v.memo} will go with the payment.` };
  else memoRow = { question: "Does it need a memo?", status: "fine", answer: "No memo is required by the account or the public directory." };
  rows.push(memoRow);

  const hold = find(ROWS.hold);
  if (hold) rows.push(fromReason("Can it hold the asset?", hold));
  else if (!q.asset) rows.push({ question: "Can it hold the asset?", status: "skipped", answer: "Add the asset under the fuller check to find out." });
  else if (!exists) rows.push({ question: "Can it hold the asset?", status: "fine", answer: "Yes." });

  const wallet = find(ROWS.wallet);
  if (wallet) rows.push(fromReason("Can your wallet send to it?", wallet));
  else if (!q.from) rows.push({ question: "Can your wallet send to it?", status: "skipped", answer: "Add your wallet address under the fuller check to find out." });
  else rows.push({ question: "Can your wallet send to it?", status: "fine", answer: "Yes." });

  const list = find(ROWS.list);
  rows.push(list ? fromReason("Is it on a warning list?", list) : { question: "Is it on a warning list?", status: "fine", answer: "No. It is not flagged in the public directory." });
  return rows;
}

function topReason(v: Verdict): Reason | undefined {
  return v.reasons.find((r) => r.severity === "block") ?? v.reasons.find((r) => r.severity === "warn");
}

function chunk(address: string): string {
  return address.match(/.{1,4}/g)!.map((g) => `<span>${g}</span>`).join("");
}

function el(tag: string, cls: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function render(v: Verdict, q: CheckInput) {
  verdictEl.replaceChildren();
  verdictEl.dataset.status = v.status;
  verdictEl.hidden = false;

  const head = el("div", "verdict-head");
  head.append(el("p", "verdict-word", HEADLINE[v.status]));
  const top = topReason(v);
  head.append(el("p", "verdict-summary", top ? top.message : "Nothing we checked would stop this payment."));
  if (top?.fix) head.append(el("p", "verdict-fix", top.fix));
  verdictEl.append(head);

  if (v.destination) {
    const dest = el("div", "destination");
    const target = v.destination.kind === "contract" ? v.destination.contract : v.destination.kind === "federation" ? v.account : v.destination.input;
    if (v.destination.kind === "federation") dest.append(el("p", "destination-note", `${v.destination.input} resolves to`));
    if (target) {
      const addr = el("p", "address");
      addr.innerHTML = chunk(target);
      addr.setAttribute("aria-label", target);
      dest.append(addr);
    }
    if (v.entry?.name) dest.append(el("p", "destination-note", `Listed in the public directory as ${v.entry.name}${v.entry.domain ? ` (${v.entry.domain})` : ""}.`));
    if (v.destination.kind === "muxed") dest.append(el("p", "destination-note", `Pays account ${v.account} with customer ID ${v.destination.muxedId}.`));
    verdictEl.append(dest);
  }

  if (v.destination) {
    const list = el("ul", "rows");
    for (const row of buildRows(v, q)) {
      const li = el("li", `row row-${row.status}`);
      li.append(el("span", "row-status", STATUS_WORD[row.status]));
      const body = el("div", "row-body");
      body.append(el("p", "row-question", row.question), el("p", "row-answer", row.answer));
      if (row.fix && row.status !== "skipped") body.append(el("p", "row-fix", row.fix));
      li.append(body);
      list.append(li);
    }
    verdictEl.append(list);
  }
  verdictEl.tabIndex = -1;
  verdictEl.focus({ preventScroll: true });
  verdictEl.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
}

function renderError(message: string) {
  verdictEl.replaceChildren();
  verdictEl.dataset.status = "error";
  verdictEl.hidden = false;
  const head = el("div", "verdict-head");
  head.append(el("p", "verdict-word", "Could not check."), el("p", "verdict-summary", message), el("p", "verdict-fix", "Check your connection and try again."));
  verdictEl.append(head);
}

function readInput(): CheckInput {
  const val = (n: string) => input(n).value.trim() || undefined;
  const network = (form.elements.namedItem("network") as RadioNodeList).value as "public" | "testnet";
  return { to: val("to") ?? "", memo: val("memo"), asset: val("asset"), amount: val("amount"), from: val("from"), network };
}

function syncUrl(q: CheckInput) {
  const params = new URLSearchParams();
  for (const f of FIELDS) if (q[f]) params.set(f, q[f]!);
  if (q.network === "testnet") params.set("network", "testnet");
  history.replaceState(null, "", `${location.pathname}${params.size ? `?${params}` : ""}`);
}

async function run() {
  const q = readInput();
  button.disabled = true;
  button.textContent = "Checking...";
  form.setAttribute("aria-busy", "true");
  let lib: Awaited<ReturnType<typeof loadCore>>;
  try {
    lib = await loadCore();
  } catch {
    core = undefined;
    renderError("The checker could not be loaded.");
    button.disabled = false;
    button.textContent = "Check address";
    form.removeAttribute("aria-busy");
    return;
  }
  const { check, parseDestination } = lib;
  // A pasted secret key is wiped from the field and never reaches the URL.
  const parsed = parseDestination(q.to);
  if (!parsed.ok && parsed.error === "secret_key") {
    input("to").value = "";
    history.replaceState(null, "", location.pathname);
  } else {
    syncUrl(q);
  }

  try {
    render(await check(q), q);
  } catch (err) {
    renderError(`The Stellar network did not answer: ${(err as Error).message}.`);
  } finally {
    button.disabled = false;
    button.textContent = "Check address";
    form.removeAttribute("aria-busy");
  }
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  void run();
});

function applyPreset(name: string) {
  const p = PRESETS[name];
  if (!p) return;
  for (const f of FIELDS) input(f).value = "";
  input("to").value = p.to;
  if (p.memo) input("memo").value = p.memo;
  if (p.asset) input("asset").value = p.asset;
  if (p.amount) input("amount").value = p.amount;
  if (p.from) input("from").value = p.from;
  const netRadio = form.querySelector(`input[value="${p.network ?? "public"}"]`) as HTMLInputElement | null;
  if (netRadio) netRadio.checked = true;
  if (p.memo || p.asset || p.amount || p.from) {
    (document.querySelector("#details") as HTMLDetailsElement).open = true;
  }
  void run();
}

document.querySelectorAll<HTMLButtonElement>(".preset-chip").forEach((btn) => {
  btn.addEventListener("click", () => {
    const key = btn.dataset.preset;
    if (key) applyPreset(key);
  });
});

// Enter submits from the address box; Shift+Enter is not needed for a one-line value.
input("to").addEventListener("keydown", (e) => {
  if ((e as KeyboardEvent).key === "Enter") {
    e.preventDefault();
    form.requestSubmit();
  }
});

const params = new URLSearchParams(location.search);
for (const f of FIELDS) {
  const v = params.get(f);
  if (v) input(f).value = v;
}
if (params.get("network") === "testnet") (form.querySelector('input[value="testnet"]') as HTMLInputElement).checked = true;
if (["memo", "asset", "amount", "from"].some((f) => params.get(f))) (document.querySelector("#details") as HTMLDetailsElement).open = true;

form.addEventListener("focusin", () => void loadCore().catch(() => (core = undefined)), { once: true });
drawGuilloche(document.querySelector(".guilloche")!);
initNotice();
if (params.get("to")) void run();
