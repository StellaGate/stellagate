import "./tokens.css";
import "./styles.css";
import "./landing.css";
import "./system.css";
import "./inner.css";
import { initNav } from "./nav.ts";

initNav();

// --- Code Copy Buttons ---
const copyButtons = document.querySelectorAll<HTMLButtonElement>(".copy-code-btn");
copyButtons.forEach((btn) => {
  btn.addEventListener("click", async () => {
    const textToCopy = btn.dataset.copy || btn.closest(".code-block-wrap")?.querySelector("code")?.textContent || "";
    if (!textToCopy) return;

    try {
      await navigator.clipboard.writeText(textToCopy);
      const originalText = btn.textContent;
      btn.textContent = "Copied";
      btn.classList.add("is-copied");
      setTimeout(() => {
        btn.textContent = originalText;
        btn.classList.remove("is-copied");
      }, 1500);
    } catch (err) {
      console.error("Failed to copy code snippet:", err);
    }
  });
});

// --- Scrollspy for Sidebar Links ---
const navLinks = document.querySelectorAll<HTMLAnchorElement>(".docs-nav-link");
const sections = document.querySelectorAll<HTMLElement>(".docs-section");

if ("IntersectionObserver" in window && sections.length > 0) {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const id = entry.target.getAttribute("id");
          if (!id) return;

          navLinks.forEach((link) => {
            const href = link.getAttribute("href");
            if (href === `#${id}`) {
              link.classList.add("is-active");
            } else {
              link.classList.remove("is-active");
            }
          });
        }
      });
    },
    {
      rootMargin: "-20% 0px -70% 0px",
      threshold: 0,
    }
  );

  sections.forEach((sec) => observer.observe(sec));
}
