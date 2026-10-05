import "./tokens.css";
import "./styles.css";
import { initNav } from "./nav.ts";
import { statusIconHtml } from "./status-icon.ts";
import type { CheckInput, Verdict } from "@stellagate/core";

initNav();

interface BatchItem {
  raw: string;
  input: CheckInput;
  verdict?: Verdict;
  error?: string;
}

const form = document.querySelector<HTMLFormElement>("#batch-form")!;
const textarea = document.querySelector<HTMLTextAreaElement>("#batch-input")!;
const lineCounter = document.querySelector<HTMLElement>("#line-counter")!;
const submitBtn = document.querySelector<HTMLButtonElement>("#batch-submit-btn")!;
const progressText = document.querySelector<HTMLElement>("#batch-progress-text")!;
const sampleBtn = document.querySelector<HTMLButtonElement>("#load-sample-btn")!;
const clearBtn = document.querySelector<HTMLButtonElement>("#clear-btn")!;

const resultsSection = document.querySelector<HTMLElement>("#batch-results")!;
const tableBody = document.querySelector<HTMLTableSectionElement>("#batch-table-body")!;
const kpiTotal = document.querySelector<HTMLElement>("#kpi-total")!;
const kpiOk = document.querySelector<HTMLElement>("#kpi-ok")!;
const kpiBlock = document.querySelector<HTMLElement>("#kpi-block")!;
const kpiWarn = document.querySelector<HTMLElement>("#kpi-warn")!;

const countAll = document.querySelector<HTMLElement>("#count-all")!;
const countBlock = document.querySelector<HTMLElement>("#count-block")!;
const countOk = document.querySelector<HTMLElement>("#count-ok")!;

const exportCsvBtn = document.querySelector<HTMLButtonElement>("#export-csv-btn")!;
const copyReadyBtn = document.querySelector<HTMLButtonElement>("#copy-ready-btn")!;
const filterChips = document.querySelectorAll<HTMLButtonElement>(".filter-chip");

let currentItems: BatchItem[] = [];
let currentFilter: "all" | "block" | "ok" = "all";

const SAMPLE_BATCH = [
  "# 1. Binance hot wallet (blocked without memo)",
  "GDT7ARDYZRBXXYOCSQ3MUMISTITSSRWZI6KR2A5L5Q3KB4QIZHGYMTIH",
  "# 2. USDC payment to account with missing trustline",
  "GARSCEEOGZ4MGOTZLQHOKJGOPK455N6SHD7SAEFFHIJDAV445GFWJGHD, USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN, 100",
  "# 3. Muxed customer ID destination (valid, memo embedded)",
  "MDT7ARDYZRBXXYOCSQ3MUMISTITSSRWZI6KR2A5L5Q3KB4QIZHGYMAAAAAAAMQDC4FFIQ",
  "# 4. Active funded account (valid destination)",
  "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
].join("\n");

function updateLineCounter() {
  const lines = textarea.value
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
  lineCounter.textContent = `${lines.length} address${lines.length === 1 ? "" : "es"} detected`;
}

textarea.addEventListener("input", updateLineCounter);

sampleBtn.addEventListener("click", () => {
  textarea.value = SAMPLE_BATCH;
  updateLineCounter();
});

clearBtn.addEventListener("click", () => {
  textarea.value = "";
  updateLineCounter();
  resultsSection.hidden = true;
});

function parseBatchLine(line: string, network: "public" | "testnet"): BatchItem {
  // Supports: Address [, Asset, Amount, Memo]
  const parts = line.split(",").map((s) => s.trim());
  const to = parts[0] || "";
  const asset = parts[1] || undefined;
  const amount = parts[2] || undefined;
  const memo = parts[3] || undefined;

  return {
    raw: line,
    input: { to, asset, amount, memo, network },
  };
}

async function loadCore() {
  return await import("@stellagate/core");
}

function chunkAddress(str: string): string {
  if (str.length < 16) return str;
  return `${str.slice(0, 4)}...${str.slice(-4)}`;
}

function renderTable() {
  tableBody.replaceChildren();

  const filtered = currentItems.filter((item) => {
    if (!item.verdict) return true;
    if (currentFilter === "all") return true;
    if (currentFilter === "block") return item.verdict.status === "block";
    if (currentFilter === "ok") return item.verdict.status === "ok";
    return true;
  });

  filtered.forEach((item) => {
    const tr = document.createElement("tr");
    tr.className = `batch-row row-status-${item.verdict?.status || "pending"}`;

    // Status Column
    const tdStatus = document.createElement("td");
    const status = item.verdict?.status || "warn";
    const statusLabel = status === "ok" ? "Ready" : status === "block" ? "Block" : "Check";
    tdStatus.innerHTML = statusIconHtml(status, statusLabel);
    tr.append(tdStatus);

    // Destination Column
    const tdDest = document.createElement("td");
    const destName = item.verdict?.entry?.name ? `<span class="row-dest-name">${item.verdict.entry.name}</span>` : "";
    tdDest.innerHTML = `
      <div class="row-dest-cell">
        ${destName}
        <code class="mono-addr" title="${item.input.to}">${item.input.to}</code>
      </div>
    `;
    tr.append(tdDest);

    // Type Column
    const tdType = document.createElement("td");
    const kind = item.verdict?.destination?.kind || "account";
    tdType.textContent = kind.toUpperCase();
    tr.append(tdType);

    // Verdict / Details Column
    const tdVerdict = document.createElement("td");
    const topReason = item.verdict?.reasons?.[0]?.message || (item.verdict?.status === "ok" ? "Destination valid and ready to receive" : "Check passed");
    const fixText = item.verdict?.reasons?.[0]?.fix ? `<span class="row-fix">${item.verdict.reasons[0].fix}</span>` : "";
    tdVerdict.innerHTML = `
      <div class="row-details">
        <span class="row-message">${topReason}</span>
        ${fixText}
      </div>
    `;
    tr.append(tdVerdict);

    // Actions Column
    const tdAction = document.createElement("td");
    tdAction.style.textAlign = "right";
    tdAction.innerHTML = `
      <div class="row-actions">
        <a href="./app.html?to=${encodeURIComponent(item.input.to)}" target="_blank" class="button button-soft button-xs">Inspect</a>
        <button type="button" class="button button-quiet button-xs copy-row-btn" data-addr="${item.input.to}">Copy</button>
      </div>
    `;
    tr.append(tdAction);

    tableBody.append(tr);
  });

  // Attach row copy listeners
  tableBody.querySelectorAll<HTMLButtonElement>(".copy-row-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const addr = btn.getAttribute("data-addr");
      if (addr) {
        navigator.clipboard.writeText(addr).then(() => {
          btn.textContent = "Copied";
          setTimeout(() => { btn.textContent = "Copy"; }, 1500);
        }).catch(() => {});
      }
    });
  });
}

function updateKPIs() {
  const total = currentItems.length;
  const okCount = currentItems.filter((i) => i.verdict?.status === "ok").length;
  const blockCount = currentItems.filter((i) => i.verdict?.status === "block").length;
  const warnCount = currentItems.filter((i) => i.verdict?.status === "warn").length;

  kpiTotal.textContent = String(total);
  kpiOk.textContent = String(okCount);
  kpiBlock.textContent = String(blockCount);
  kpiWarn.textContent = String(warnCount);

  countAll.textContent = String(total);
  countBlock.textContent = String(blockCount);
  countOk.textContent = String(okCount);
}

// Filter button listeners
filterChips.forEach((chip) => {
  chip.addEventListener("click", () => {
    filterChips.forEach((c) => c.classList.remove("is-active"));
    chip.classList.add("is-active");
    currentFilter = (chip.getAttribute("data-filter") as "all" | "block" | "ok") || "all";
    renderTable();
  });
});

// Export CSV handler
exportCsvBtn.addEventListener("click", () => {
  if (!currentItems.length) return;
  const rows = [
    ["Destination", "Status", "Kind", "Reason", "Fix"].join(","),
    ...currentItems.map((i) => [
      `"${i.input.to}"`,
      `"${i.verdict?.status || "unknown"}"`,
      `"${i.verdict?.destination?.kind || ""}"`,
      `"${(i.verdict?.reasons?.[0]?.message || "Ready").replaceAll('"', '""')}"`,
      `"${(i.verdict?.reasons?.[0]?.fix || "").replaceAll('"', '""')}"`,
    ].join(",")),
  ];

  const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `stellagate-batch-check-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
});

// Copy ready addresses
copyReadyBtn.addEventListener("click", () => {
  const readyAddrs = currentItems
    .filter((i) => i.verdict?.status === "ok")
    .map((i) => i.input.to)
    .join("\n");

  if (readyAddrs) {
    navigator.clipboard.writeText(readyAddrs).then(() => {
      copyReadyBtn.textContent = "Copied ready addresses";
      setTimeout(() => { copyReadyBtn.textContent = "Copy ready addresses"; }, 2000);
    }).catch(() => {});
  }
});

// Form submit: run batch check
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const rawText = textarea.value;
  const lines = rawText
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));

  if (!lines.length) return;

  const network = (form.elements.namedItem("network") as RadioNodeList).value as "public" | "testnet";
  const items = lines.map((line) => parseBatchLine(line, network));

  submitBtn.disabled = true;
  progressText.hidden = false;
  resultsSection.hidden = false;

  let lib: Awaited<ReturnType<typeof loadCore>>;
  try {
    lib = await loadCore();
  } catch (err) {
    progressText.textContent = "Failed to load checker library.";
    submitBtn.disabled = false;
    return;
  }

  const { check } = lib;
  currentItems = items;
  updateKPIs();
  renderTable();

  let completed = 0;
  progressText.textContent = `Checking 0 of ${items.length}...`;

  // Concurrency worker pool (max 5 simultaneous requests)
  const poolLimit = 5;
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const idx = cursor++;
      const item = items[idx];
      try {
        item.verdict = await check(item.input);
      } catch (err) {
        item.error = (err as Error).message;
        item.verdict = {
          status: "block",
          account: item.input.to,
          reasons: [{ code: "network_error", status: "block", message: "Network query failed" }],
        };
      }
      completed++;
      progressText.textContent = `Checking ${completed} of ${items.length}...`;
      updateKPIs();
      renderTable();
    }
  }

  const workers = Array.from({ length: Math.min(poolLimit, items.length) }, () => worker());
  await Promise.all(workers);

  progressText.textContent = `Complete: ${items.length} destinations checked.`;
  submitBtn.disabled = false;
});
