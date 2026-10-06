import "./tokens.css";
import "./styles.css";
import "./system.css";
import "./landing.css";
import "./motion.css";
import { drawGuilloche } from "./guilloche.ts";
import { initNav } from "./nav.ts";
import { initMotion } from "./motion.ts";

initNav({ hasFloatingPill: true });

document.querySelectorAll<HTMLElement>(".guilloche").forEach(drawGuilloche);

const tabs = [...document.querySelectorAll<HTMLButtonElement>(".code-tabs [role=tab]")];
const tabList = document.querySelector<HTMLElement>(".code-tabs");
const indicator = document.createElement("span");
indicator.className = "tab-indicator";
indicator.setAttribute("aria-hidden", "true");
if (tabList) {
  tabList.prepend(indicator);
  tabList.classList.add("has-indicator");
}
function moveIndicator(tab: HTMLButtonElement) {
  const right = tab.parentElement!.clientWidth - tab.offsetLeft - tab.offsetWidth;
  indicator.style.clipPath = `inset(0 ${right}px 0 ${tab.offsetLeft}px round 999px)`;
}
function select(tab: HTMLButtonElement) {
  moveIndicator(tab);
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

const current = tabs.find((t) => t.getAttribute("aria-selected") === "true");
if (current) {
  moveIndicator(current);
  addEventListener("resize", () => moveIndicator(tabs.find((t) => t.getAttribute("aria-selected") === "true")!));
}

initMotion();
