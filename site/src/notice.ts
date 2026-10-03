const KEY = "stellagate-notice-seen";

export function initNotice() {
  const notice = document.querySelector<HTMLElement>("#notice");
  if (!notice) return;
  let seen = false;
  try {
    seen = localStorage.getItem(KEY) === "1";
  } catch {}
  if (seen) return;
  notice.hidden = false;
  document.querySelector("#notice-ok")?.addEventListener("click", () => {
    notice.hidden = true;
    try {
      localStorage.setItem(KEY, "1");
    } catch {}
  });
}
