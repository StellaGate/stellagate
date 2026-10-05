// Landing motion: scroll reveals and the mockup's one-time story. Skipped entirely under reduced motion.

const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function initMotion(): void {
  if (reduced || !("IntersectionObserver" in window)) return;
  initReveals();
  initMockStory();
}

function initReveals(): void {
  const targets: HTMLElement[] = [];
  document.querySelectorAll<HTMLElement>(".ruled-head, .faq-list, .closing-panel").forEach((el) => targets.push(el));
  // Cell contents rise, not the cells, so the ruled lines stay put
  document.querySelectorAll<HTMLElement>(".cells").forEach((cells) => {
    const cols = cells.classList.contains("cells-3") ? 3 : 2;
    [...cells.children].forEach((cell, i) => {
      for (const child of cell.children) {
        const el = child as HTMLElement;
        if (el.classList.contains("step-num") || el.classList.contains("guilloche") || el.classList.contains("glass-layer")) continue;
        el.style.setProperty("--i", String(i % cols));
        targets.push(el);
      }
    });
  });

  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add("is-in");
        io.unobserve(e.target);
      }
    },
    { rootMargin: "0px 0px -10% 0px" },
  );
  for (const el of targets) {
    el.dataset.reveal = "";
    io.observe(el);
  }
  document.documentElement.classList.add("motion-ready");
}

function initMockStory(): void {
  const mock = document.querySelector<HTMLElement>(".app-mock");
  const typed = mock?.querySelector<HTMLElement>(".mock-typed");
  if (!mock || !typed) return;
  const address = typed.textContent ?? "";
  typed.textContent = "";
  mock.classList.add("is-armed");

  const io = new IntersectionObserver(
    ([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      void play();
    },
    { threshold: 0.5 },
  );
  io.observe(mock);

  async function play() {
    mock!.classList.add("is-typing");
    await wait(300);
    for (let i = 1; i <= address.length; i++) {
      typed!.textContent = address.slice(0, i);
      await wait(14);
    }
    await wait(250);
    mock!.classList.remove("is-typing");
    mock!.classList.add("is-pressed");
    await wait(160);
    mock!.classList.remove("is-pressed");
    await wait(120);
    mock!.classList.remove("is-armed");
  }
}
