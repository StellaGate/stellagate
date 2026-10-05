import "./tokens.css";
import "./styles.css";
import "./landing.css";
import "./system.css";
import "./inner.css";
import { initNav } from "./nav.ts";
import { statusIconHtml } from "./status-icon.ts";
import type { CheckInput, Verdict } from "@stellagate/core";

initNav();

let corePromise: Promise<typeof import("@stellagate/core")> | undefined;
const loadCore = () => (corePromise ??= import("@stellagate/core"));

// DOM Elements
const form = document.querySelector<HTMLFormElement>("#playground-form")!;
const toInput = document.querySelector<HTMLInputElement>("#pg-to")!;
const fromInput = document.querySelector<HTMLInputElement>("#pg-from")!;
const memoInput = document.querySelector<HTMLInputElement>("#pg-memo")!;
const assetInput = document.querySelector<HTMLInputElement>("#pg-asset")!;
const amountInput = document.querySelector<HTMLInputElement>("#pg-amount")!;
const statusIndicator = document.querySelector<HTMLElement>("#pg-status-indicator")!;

const tabCode = document.querySelector<HTMLButtonElement>("#tab-code")!;
const tabVerdict = document.querySelector<HTMLButtonElement>("#tab-verdict")!;
const tabJson = document.querySelector<HTMLButtonElement>("#tab-json")!;

const viewCode = document.querySelector<HTMLElement>("#view-code")!;
const viewVerdict = document.querySelector<HTMLElement>("#view-verdict")!;
const viewJson = document.querySelector<HTMLElement>("#view-json")!;

const codeSnippetOutput = document.querySelector<HTMLElement>("#code-snippet-output")!;
const jsonSnippetOutput = document.querySelector<HTMLElement>("#json-snippet-output")!;
const copyActiveBtn = document.querySelector<HTMLButtonElement>("#pg-copy-active-btn")!;

const verdictStatusBadge = document.querySelector<HTMLElement>("#verdict-status-badge")!;
const verdictLatencyLabel = document.querySelector<HTMLElement>("#verdict-latency-label")!;
const verdictSummaryText = document.querySelector<HTMLElement>("#verdict-summary-text")!;
const verdictReasonsContainer = document.querySelector<HTMLElement>("#verdict-reasons-container")!;

// Presets
const presetBinance = document.querySelector<HTMLButtonElement>("#preset-binance");
const presetBinanceMemo = document.querySelector<HTMLButtonElement>("#preset-binance-memo");
const presetContract = document.querySelector<HTMLButtonElement>("#preset-contract");
const presetFederation = document.querySelector<HTMLButtonElement>("#preset-federation");

function getNetwork(): "public" | "testnet" {
  const checked = document.querySelector<HTMLInputElement>('input[name="pg-network"]:checked');
  return (checked?.value as "public" | "testnet") || "public";
}

function getFormInput(): CheckInput {
  const input: CheckInput = {
    to: toInput.value.trim(),
    network: getNetwork(),
  };

  const from = fromInput.value.trim();
  if (from) input.from = from;

  const memo = memoInput.value.trim();
  if (memo) input.memo = memo;

  const asset = assetInput.value.trim();
  if (asset) input.asset = asset;

  const amount = amountInput.value.trim();
  if (amount) input.amount = amount;

  return input;
}

function updateGeneratedCode() {
  const input = getFormInput();
  const indent = "  ";

  const lines: string[] = [];
  lines.push('import { check } from "@stellagate/core";');
  lines.push("");
  lines.push("const verdict = await check({");
  lines.push(`${indent}to: ${JSON.stringify(input.to)},`);

  if (input.from) {
    lines.push(`${indent}from: ${JSON.stringify(input.from)},`);
  }
  if (input.memo) {
    lines.push(`${indent}memo: ${JSON.stringify(input.memo)},`);
  }
  if (input.asset && input.asset !== "native") {
    lines.push(`${indent}asset: ${JSON.stringify(input.asset)},`);
  }
  if (input.amount) {
    lines.push(`${indent}amount: ${JSON.stringify(input.amount)},`);
  }
  if (input.network && input.network !== "public") {
    lines.push(`${indent}network: ${JSON.stringify(input.network)},`);
  }

  lines.push("});");
  lines.push("");
  lines.push("console.log(verdict.status); // 'ok' | 'warn' | 'block'");
  lines.push("console.log(verdict.reasons[0]?.message, verdict.reasons[0]?.fix);");

  codeSnippetOutput.textContent = lines.join("\n");
}

let latestVerdict: Verdict | null = null;

function renderVerdict(verdict: Verdict, elapsedMs: number) {
  latestVerdict = verdict;
  verdictLatencyLabel.textContent = `${Math.round(elapsedMs)}ms`;

  const label = verdict.status === "ok" ? "Looks fine" : verdict.status === "warn" ? "Check first" : "Stop";
  verdictStatusBadge.className = "verdict-badge-large";
  verdictStatusBadge.innerHTML = `${statusIconHtml(verdict.status, label)}<span aria-hidden="true">${label}</span>`;

  const top = verdict.reasons.find((r) => r.severity === "block") ?? verdict.reasons.find((r) => r.severity === "warn");
  verdictSummaryText.textContent = top ? top.message : "Nothing we checked would stop this payment.";

  verdictReasonsContainer.innerHTML = "";
  if (verdict.reasons && verdict.reasons.length > 0) {
    verdict.reasons.forEach((reason) => {
      const reasonRow = document.createElement("div");
      reasonRow.className = "verdict-reason-item";

      const badgeClass =
        reason.severity === "block"
          ? "badge-block"
          : reason.severity === "warn"
            ? "badge-warn"
            : "badge-soft";

      reasonRow.innerHTML = `
        <div class="verdict-reason-head">
          <span class="badge ${badgeClass}">${reason.severity.toUpperCase()}</span>
          <code class="verdict-reason-code">${reason.code}</code>
        </div>
        <p class="verdict-reason-msg">${reason.message}</p>
        ${reason.fix ? `<p class="verdict-reason-fix"><strong>Remediation:</strong> ${reason.fix}</p>` : ""}
      `;
      verdictReasonsContainer.appendChild(reasonRow);
    });
  } else {
    const okItem = document.createElement("div");
    okItem.className = "verdict-reason-item";
    okItem.innerHTML = `<p class="verdict-reason-msg">All pre-flight safety checks passed successfully.</p>`;
    verdictReasonsContainer.appendChild(okItem);
  }

  jsonSnippetOutput.textContent = JSON.stringify(verdict, null, 2);
}

async function runCheck() {
  const input = getFormInput();
  if (!input.to) return;

  statusIndicator.textContent = "Evaluating...";
  const start = performance.now();

  try {
    const { check } = await loadCore();
    const verdict = await check(input);
    const elapsed = performance.now() - start;
    renderVerdict(verdict, elapsed);
    statusIndicator.textContent = `Completed in ${Math.round(elapsed)}ms`;
  } catch (err: any) {
    const elapsed = performance.now() - start;
    statusIndicator.textContent = "Evaluation failed";
    console.error("Check evaluation failed:", err);
    jsonSnippetOutput.textContent = JSON.stringify({ error: err?.message || String(err) }, null, 2);
  }
}

// Tab Switching
function setActiveTab(tab: "code" | "verdict" | "json") {
  tabCode.classList.toggle("is-active", tab === "code");
  tabVerdict.classList.toggle("is-active", tab === "verdict");
  tabJson.classList.toggle("is-active", tab === "json");

  tabCode.setAttribute("aria-selected", tab === "code" ? "true" : "false");
  tabVerdict.setAttribute("aria-selected", tab === "verdict" ? "true" : "false");
  tabJson.setAttribute("aria-selected", tab === "json" ? "true" : "false");

  viewCode.classList.toggle("is-active", tab === "code");
  viewCode.hidden = tab !== "code";

  viewVerdict.classList.toggle("is-active", tab === "verdict");
  viewVerdict.hidden = tab !== "verdict";

  viewJson.classList.toggle("is-active", tab === "json");
  viewJson.hidden = tab !== "json";
}

tabCode.addEventListener("click", () => setActiveTab("code"));
tabVerdict.addEventListener("click", () => setActiveTab("verdict"));
tabJson.addEventListener("click", () => setActiveTab("json"));

// Form Events
form.addEventListener("submit", (e) => {
  e.preventDefault();
  runCheck();
  setActiveTab("verdict");
});

[toInput, fromInput, memoInput, assetInput, amountInput].forEach((input) => {
  input.addEventListener("input", updateGeneratedCode);
});

document.querySelectorAll('input[name="pg-network"]').forEach((radio) => {
  radio.addEventListener("change", () => {
    updateGeneratedCode();
    runCheck();
  });
});

// Copy Active Tab Button
copyActiveBtn.addEventListener("click", async () => {
  let content = "";
  if (!viewCode.hidden) {
    content = codeSnippetOutput.textContent || "";
  } else if (!viewJson.hidden) {
    content = jsonSnippetOutput.textContent || "";
  } else {
    content = `${latestVerdict?.status?.toUpperCase() || ""}\n${latestVerdict?.reasons[0]?.message || ""}\n${JSON.stringify(latestVerdict, null, 2)}`;
  }

  if (!content) return;

  await navigator.clipboard.writeText(content);
  const orig = copyActiveBtn.textContent;
  copyActiveBtn.textContent = "Copied";
  setTimeout(() => {
    copyActiveBtn.textContent = orig;
  }, 1400);
});

// Preset button handlers
presetBinance?.addEventListener("click", () => {
  toInput.value = "GABFQIK63R2NETJM7T673EAMZN4RJLLGP3OFUEJU5SZVTGWUKULZJNL6";
  memoInput.value = "";
  fromInput.value = "";
  assetInput.value = "native";
  amountInput.value = "";
  updateGeneratedCode();
  runCheck();
  setActiveTab("verdict");
});

presetBinanceMemo?.addEventListener("click", () => {
  toInput.value = "GABFQIK63R2NETJM7T673EAMZN4RJLLGP3OFUEJU5SZVTGWUKULZJNL6";
  memoInput.value = "109283741";
  fromInput.value = "";
  assetInput.value = "native";
  amountInput.value = "";
  updateGeneratedCode();
  runCheck();
  setActiveTab("verdict");
});

presetContract?.addEventListener("click", () => {
  toInput.value = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";
  memoInput.value = "";
  fromInput.value = "";
  assetInput.value = "native";
  amountInput.value = "";
  updateGeneratedCode();
  runCheck();
  setActiveTab("verdict");
});

presetFederation?.addEventListener("click", () => {
  toInput.value = "jed*stellar.org";
  memoInput.value = "";
  fromInput.value = "";
  assetInput.value = "native";
  amountInput.value = "";
  updateGeneratedCode();
  runCheck();
  setActiveTab("verdict");
});

// Initialization
updateGeneratedCode();
runCheck();
