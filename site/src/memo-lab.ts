import "./tokens.css";
import "./styles.css";
import "./landing.css";
import "./system.css";
import "./inner.css";
import { initNav } from "./nav.ts";

initNav();

// --- 1. Memo Text Validator ---
const textInput = document.querySelector<HTMLInputElement>("#memo-text-input");
const badgeText = document.querySelector<HTMLElement>("#badge-text");
const meterTextFill = document.querySelector<HTMLElement>("#meter-text-fill");
const meterTextCount = document.querySelector<HTMLElement>("#meter-text-count");
const meterCharCount = document.querySelector<HTMLElement>("#meter-char-count");
const memoHexCode = document.querySelector<HTMLElement>("#memo-hex-code");

const sampleTextAscii = document.querySelector<HTMLButtonElement>("#sample-text-ascii");
const sampleTextUnicode = document.querySelector<HTMLButtonElement>("#sample-text-unicode");
const sampleTextOverflow = document.querySelector<HTMLButtonElement>("#sample-text-overflow");

const encoder = new TextEncoder();

function updateTextValidator() {
  if (!textInput || !badgeText || !meterTextFill || !meterTextCount || !meterCharCount || !memoHexCode) return;
  const val = textInput.value;
  const encoded = encoder.encode(val);
  const bytes = encoded.length;
  const chars = val.length;

  meterTextCount.textContent = `${bytes} / 28 bytes`;
  meterCharCount.textContent = `${chars} character${chars === 1 ? "" : "s"}`;

  const ratio = Math.min(1, bytes / 28);
  meterTextFill.style.setProperty("--meter-scale", String(ratio));

  // Hex display
  if (bytes === 0) {
    memoHexCode.textContent = "(empty)";
  } else {
    const hexArr = Array.from(encoded).map((b) => b.toString(16).padStart(2, "0"));
    memoHexCode.textContent = hexArr.join(" ");
  }

  badgeText.classList.remove("badge-go", "badge-block", "badge-warn", "badge-soft");
  meterTextFill.classList.remove("meter-overflow");

  if (bytes === 0) {
    badgeText.textContent = "Empty (Optional)";
    badgeText.classList.add("badge-soft");
  } else if (bytes <= 28) {
    badgeText.textContent = `Valid (${bytes} bytes)`;
    badgeText.classList.add("badge-go");
  } else {
    badgeText.textContent = `Overflow (${bytes - 28} bytes over limit)`;
    badgeText.classList.add("badge-block");
    meterTextFill.classList.add("meter-overflow");
  }
}

if (textInput) {
  textInput.addEventListener("input", updateTextValidator);
}

sampleTextAscii?.addEventListener("click", () => {
  if (!textInput) return;
  textInput.value = "Order #8821";
  updateTextValidator();
});

sampleTextUnicode?.addEventListener("click", () => {
  if (!textInput) return;
  textInput.value = "Credit / Cafe (multi-byte)";
  updateTextValidator();
});

sampleTextOverflow?.addEventListener("click", () => {
  if (!textInput) return;
  textInput.value = "This memo string is way too long for Stellar transactions";
  updateTextValidator();
});

// --- 2. Memo ID Validator (uint64) ---
const idInput = document.querySelector<HTMLInputElement>("#memo-id-input");
const badgeId = document.querySelector<HTMLElement>("#badge-id");
const idValDec = document.querySelector<HTMLElement>("#id-val-dec");
const idValHex = document.querySelector<HTMLElement>("#id-val-hex");
const idValStatus = document.querySelector<HTMLElement>("#id-val-status");

const sampleIdBinance = document.querySelector<HTMLButtonElement>("#sample-id-binance");
const sampleIdMax = document.querySelector<HTMLButtonElement>("#sample-id-max");
const sampleIdOverflow = document.querySelector<HTMLButtonElement>("#sample-id-overflow");

const MAX_UINT64 = 18446744073709551615n;

function updateIdValidator() {
  if (!idInput || !badgeId || !idValDec || !idValHex || !idValStatus) return;
  const raw = idInput.value.trim();

  badgeId.classList.remove("badge-go", "badge-block", "badge-warn", "badge-soft");

  if (raw === "") {
    badgeId.textContent = "Empty";
    badgeId.classList.add("badge-soft");
    idValDec.textContent = "N/A";
    idValHex.textContent = "N/A";
    idValStatus.textContent = "Please enter an integer";
    idValStatus.style.color = "var(--color-text-sub)";
    return;
  }

  if (!/^\d+$/.test(raw)) {
    badgeId.textContent = "Invalid format";
    badgeId.classList.add("badge-block");
    idValDec.textContent = "Invalid (non-digit characters)";
    idValHex.textContent = "N/A";
    idValStatus.textContent = "Only positive integer digits 0-9 allowed (no decimals, negatives, or symbols)";
    idValStatus.style.color = "var(--color-block)";
    return;
  }

  try {
    const val = BigInt(raw);
    idValDec.textContent = val.toString(10);
    const hexStr = val.toString(16);
    idValHex.textContent = "0x" + hexStr.padStart(hexStr.length % 2 === 0 ? hexStr.length : hexStr.length + 1, "0");

    if (val <= MAX_UINT64) {
      badgeId.textContent = "Valid uint64";
      badgeId.classList.add("badge-go");
      idValStatus.textContent = "Within valid 64-bit unsigned integer range (0 to 18,446,744,073,709,551,615)";
      idValStatus.style.color = "var(--color-go)";
    } else {
      badgeId.textContent = "Exceeds 64-bit limit";
      badgeId.classList.add("badge-block");
      idValStatus.textContent = "Exceeds uint64 maximum. Stellar network will reject this transaction.";
      idValStatus.style.color = "var(--color-block)";
    }
  } catch {
    badgeId.textContent = "Parse error";
    badgeId.classList.add("badge-block");
    idValDec.textContent = "Invalid integer";
    idValHex.textContent = "N/A";
    idValStatus.textContent = "Unable to parse numeric value";
    idValStatus.style.color = "var(--color-block)";
  }
}

if (idInput) {
  idInput.addEventListener("input", updateIdValidator);
}

sampleIdBinance?.addEventListener("click", () => {
  if (!idInput) return;
  idInput.value = "102938472";
  updateIdValidator();
});

sampleIdMax?.addEventListener("click", () => {
  if (!idInput) return;
  idInput.value = "18446744073709551615";
  updateIdValidator();
});

sampleIdOverflow?.addEventListener("click", () => {
  if (!idInput) return;
  idInput.value = "18446744073709551616";
  updateIdValidator();
});

// --- 3. Memo Hash & Return (32-byte Hex / Base64) ---
const hashHexInput = document.querySelector<HTMLInputElement>("#hash-hex-input");
const hashB64Input = document.querySelector<HTMLInputElement>("#hash-b64-input");
const badgeHash = document.querySelector<HTMLElement>("#badge-hash");
const copyHexBtn = document.querySelector<HTMLButtonElement>("#copy-hex-btn");
const copyB64Btn = document.querySelector<HTMLButtonElement>("#copy-b64-btn");

const sampleHashSha = document.querySelector<HTMLButtonElement>("#sample-hash-sha");
const sampleHashRandom = document.querySelector<HTMLButtonElement>("#sample-hash-random");

function uint8ToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hexToUint8(hex: string): Uint8Array | null {
  const clean = hex.replace(/\s+/g, "").toLowerCase();
  if (clean.length % 2 !== 0 || !/^[0-9a-f]*$/.test(clean)) return null;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    out[i / 2] = parseInt(clean.slice(i, i + 2), 16);
  }
  return out;
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToUint8(b64: string): Uint8Array | null {
  try {
    const binary = atob(b64.trim());
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      out[i] = binary.charCodeAt(i);
    }
    return out;
  } catch {
    return null;
  }
}

function syncFromHex() {
  if (!hashHexInput || !hashB64Input || !badgeHash) return;
  const rawHex = hashHexInput.value.replace(/\s+/g, "").toLowerCase();
  const bytes = hexToUint8(rawHex);

  badgeHash.classList.remove("badge-go", "badge-block", "badge-warn", "badge-soft");

  if (!bytes) {
    badgeHash.textContent = "Invalid hex format";
    badgeHash.classList.add("badge-block");
    return;
  }

  if (bytes.length === 32) {
    badgeHash.textContent = "Valid 32-byte Hash";
    badgeHash.classList.add("badge-go");
    hashB64Input.value = uint8ToBase64(bytes);
  } else {
    badgeHash.textContent = `${bytes.length} / 32 bytes`;
    badgeHash.classList.add("badge-block");
  }
}

function syncFromB64() {
  if (!hashHexInput || !hashB64Input || !badgeHash) return;
  const rawB64 = hashB64Input.value.trim();
  const bytes = base64ToUint8(rawB64);

  badgeHash.classList.remove("badge-go", "badge-block", "badge-warn", "badge-soft");

  if (!bytes) {
    badgeHash.textContent = "Invalid base64";
    badgeHash.classList.add("badge-block");
    return;
  }

  if (bytes.length === 32) {
    badgeHash.textContent = "Valid 32-byte Hash";
    badgeHash.classList.add("badge-go");
    hashHexInput.value = uint8ToHex(bytes);
  } else {
    badgeHash.textContent = `${bytes.length} / 32 bytes`;
    badgeHash.classList.add("badge-block");
  }
}

hashHexInput?.addEventListener("input", syncFromHex);
hashB64Input?.addEventListener("input", syncFromB64);

copyHexBtn?.addEventListener("click", async () => {
  if (!hashHexInput) return;
  await navigator.clipboard.writeText(hashHexInput.value);
  const orig = copyHexBtn.textContent;
  copyHexBtn.textContent = "Copied";
  setTimeout(() => {
    copyHexBtn.textContent = orig;
  }, 1400);
});

copyB64Btn?.addEventListener("click", async () => {
  if (!hashB64Input) return;
  await navigator.clipboard.writeText(hashB64Input.value);
  const orig = copyB64Btn.textContent;
  copyB64Btn.textContent = "Copied";
  setTimeout(() => {
    copyB64Btn.textContent = orig;
  }, 1400);
});

sampleHashSha?.addEventListener("click", () => {
  if (!hashHexInput) return;
  hashHexInput.value = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
  syncFromHex();
});

sampleHashRandom?.addEventListener("click", () => {
  if (!hashHexInput) return;
  const randBytes = new Uint8Array(32);
  crypto.getRandomValues(randBytes);
  hashHexInput.value = uint8ToHex(randBytes);
  syncFromHex();
});

// Initialize on page load
updateTextValidator();
updateIdValidator();
syncFromHex();
