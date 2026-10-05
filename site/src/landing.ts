import "./tokens.css";
import "./styles.css";
import "./landing.css";
import { drawGuilloche } from "./guilloche.ts";
import { initNotice } from "./notice.ts";
import { initNav } from "./nav.ts";

initNav({ hasFloatingPill: true });

document.querySelectorAll<HTMLElement>(".guilloche").forEach(drawGuilloche);

const tabs = [...document.querySelectorAll<HTMLButtonElement>(".code-tabs [role=tab]")];
function select(tab: HTMLButtonElement) {
  for (const t of tabs) {
    const on = t === tab;
    t.setAttribute("aria-selected", String(on));
    t.tabIndex = on ? 0 : -1;
    document.getElementById(t.getAttribute("aria-controls")!)!.hidden = !on;
  }
}
tabs.forEach((tab, i) => {
  tab.addEventListener("click", () => select(tab));
  tab.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const next = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
    select(next);
    next.focus();
  });
});

initNotice();
