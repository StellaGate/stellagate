import "./tokens.css";
import "./styles.css";
import { drawGuilloche } from "./guilloche.ts";
import { initNotice } from "./notice.ts";

document.querySelectorAll<HTMLElement>(".guilloche").forEach(drawGuilloche);

// How It Works Step Tabs
const stepButtons = document.querySelectorAll<HTMLButtonElement>(".step-tab");
const stepPanels = document.querySelectorAll<HTMLElement>(".step-panel");

stepButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const step = btn.dataset.step;
    stepButtons.forEach((b) => {
      const isCurrent = b === btn;
      b.classList.toggle("active", isCurrent);
      b.setAttribute("aria-selected", isCurrent ? "true" : "false");
    });
    stepPanels.forEach((panel) => {
      const match = panel.dataset.step === step;
      panel.hidden = !match;
      if (match) panel.classList.add("active");
      else panel.classList.remove("active");
    });
  });
});

// FAQ Accordion
const faqItems = document.querySelectorAll<HTMLElement>(".faq-item");
faqItems.forEach((item) => {
  const trigger = item.querySelector<HTMLButtonElement>(".faq-question");
  const answer = item.querySelector<HTMLElement>(".faq-answer");
  if (!trigger || !answer) return;

  trigger.addEventListener("click", () => {
    const isOpen = item.classList.contains("open");
    // Close other items
    faqItems.forEach((other) => {
      if (other !== item) {
        other.classList.remove("open");
        other.querySelector(".faq-question")?.setAttribute("aria-expanded", "false");
        const otherAnswer = other.querySelector<HTMLElement>(".faq-answer");
        if (otherAnswer) otherAnswer.hidden = true;
      }
    });

    item.classList.toggle("open", !isOpen);
    trigger.setAttribute("aria-expanded", !isOpen ? "true" : "false");
    answer.hidden = isOpen;
  });
});

// Scroll-triggered Reveal Animations (Xenia-style)
const reveals = document.querySelectorAll(".reveal");
if ("IntersectionObserver" in window) {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("reveal-in");
          observer.unobserve(entry.target);
        }
      });
    },
    { rootMargin: "0px 0px -10% 0px" }
  );
  reveals.forEach((el) => observer.observe(el));
} else {
  reveals.forEach((el) => el.classList.add("reveal-in"));
}

initNotice();
