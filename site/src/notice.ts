const STORAGE_KEY = "stellagate_cookie_consent";
const LEGACY_KEY = "stellagate-notice-seen";

export function isConsentGiven(): boolean {
  try {
    if (localStorage.getItem(STORAGE_KEY) === "1" || localStorage.getItem(LEGACY_KEY) === "1") {
      return true;
    }
  } catch {}
  try {
    if (typeof document !== "undefined" && document.cookie && document.cookie.includes("stellagate_cookie_consent=1")) {
      return true;
    }
  } catch {}
  return false;
}

export function setConsentGiven() {
  try {
    localStorage.setItem(STORAGE_KEY, "1");
    localStorage.setItem(LEGACY_KEY, "1");
  } catch {}
  try {
    if (typeof document !== "undefined") {
      // 10-year persistent cookie lifetime (315,360,000 seconds)
      const tenYearsInSeconds = 315360000;
      const expires = new Date(Date.now() + tenYearsInSeconds * 1000).toUTCString();
      document.cookie = `stellagate_cookie_consent=1; expires=${expires}; max-age=${tenYearsInSeconds}; path=/; SameSite=Lax`;
    }
  } catch {}
}

export function initNotice() {
  const notice = document.querySelector<HTMLElement>("#notice");
  if (!notice) return;

  if (isConsentGiven()) {
    notice.hidden = true;
    notice.style.display = "none";
    notice.remove();
    return;
  }

  notice.hidden = false;
  notice.style.removeProperty("display");

  const okBtn = document.querySelector<HTMLButtonElement>("#notice-ok");
  okBtn?.addEventListener("click", () => {
    setConsentGiven();
    notice.hidden = true;
    notice.style.display = "none";
    notice.remove();
  });
}
