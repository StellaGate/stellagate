/**
 * Shared navigation behavior adapted from Echonome.
 *
 * Provides:
 * 1. Mobile menu toggles (morphing hamburger toggle, revealing origin-top-left menu).
 * 2. Escape key and outside-click dismiss for any open mobile menu.
 * 3. Landing page scroll observer (shows floating pill when scrolled past zero-height sentinel).
 */

export interface NavOptions {
  hasFloatingPill?: boolean;
}

export function initNav(options: NavOptions = {}): void {
  initMobileMenus();

  if (options.hasFloatingPill) {
    initLandingPill();
  }
}

/**
 * Wire all mobile menu toggles on the page.
 */
function initMobileMenus(): void {
  const roots = document.querySelectorAll<HTMLElement>(".nav-root");

  roots.forEach((root) => {
    const toggle = root.querySelector<HTMLButtonElement>(".nav-menu-toggle");
    const menu = root.querySelector<HTMLElement>(".nav-mobile-menu");
    if (!toggle || !menu) return;

    const links = [...menu.querySelectorAll<HTMLAnchorElement>(".nav-mobile-links a")];

    function setOpen(open: boolean) {
      toggle.setAttribute("aria-expanded", String(open));
      menu.setAttribute("aria-hidden", String(!open));
      menu.classList.toggle("is-open", open);

      // Apply staggered transitions
      links.forEach((link, i) => {
        const delay = open ? `${60 + i * 40}ms` : `${(links.length - 1 - i) * 30}ms`;
        link.style.transitionDelay = delay;
      });
    }

    toggle.addEventListener("click", (e) => {
      e.stopPropagation();
      const isOpen = toggle.getAttribute("aria-expanded") === "true";
      setOpen(!isOpen);
    });

    links.forEach((link) => {
      link.addEventListener("click", () => {
        setOpen(false);
      });
    });

    // Close on click outside
    document.addEventListener("pointerdown", (e) => {
      if (toggle.getAttribute("aria-expanded") === "true") {
        if (!root.contains(e.target as Node)) {
          setOpen(false);
        }
      }
    });

    // Close on Escape key
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
        setOpen(false);
        toggle.focus();
      }
    });
  });
}

/**
 * Wire the scroll-triggered floating pill navigation for the landing page.
 */
function initLandingPill(): void {
  const sentinel = document.getElementById("nav-sentinel");
  const pillWrap = document.getElementById("landing-pill-wrap");
  if (!sentinel || !pillWrap) return;

  // Reveal floating pill when in-flow header leaves viewport
  const scrollObserver = new IntersectionObserver(
    ([entry]) => {
      const isPast = !entry.isIntersecting;
      pillWrap.classList.toggle("is-visible", isPast);
      pillWrap.setAttribute("aria-hidden", String(!isPast));
    },
    { threshold: 0 }
  );
  scrollObserver.observe(sentinel);
}
