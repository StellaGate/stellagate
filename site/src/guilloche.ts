// A guilloche band: layered phase-shifted sine waves, the engraved pattern on cheques and banknotes.
export function drawGuilloche(host: HTMLElement) {
  const isHero = host.classList.contains("guilloche-hero") || host.dataset.variant === "hero";
  const W = 1600;
  const H = isHero ? 480 : 160;
  const LINES = isHero ? 28 : 18;
  const STEPS = 320;
  const paths: string[] = [];
  for (let k = 0; k < LINES; k++) {
    const phase = (k / LINES) * Math.PI * 2;
    let d = "";
    for (let i = 0; i <= STEPS; i++) {
      const x = (i / STEPS) * W;
      const t = (i / STEPS) * Math.PI * 2;
      const amplitude1 = isHero ? 110 : 46;
      const amplitude2 = isHero ? 34 : 14;
      const y = H / 2 + Math.sin(t * 5 + phase) * amplitude1 * Math.cos(t * 1.5) + Math.sin(t * 11 - phase * 2) * amplitude2;
      d += `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
    }
    paths.push(`<path d="${d}"/>`);
  }
  host.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="${isHero ? "xMidYMid slice" : "none"}" focusable="false">${paths.join("")}</svg>`;
}
