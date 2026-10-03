// A guilloche band: layered phase-shifted sine waves, the engraved pattern on cheques and banknotes.
export function drawGuilloche(host: HTMLElement) {
  const W = 1200, H = 160, LINES = 18, STEPS = 240;
  const paths: string[] = [];
  for (let k = 0; k < LINES; k++) {
    const phase = (k / LINES) * Math.PI * 2;
    let d = "";
    for (let i = 0; i <= STEPS; i++) {
      const x = (i / STEPS) * W;
      const t = (i / STEPS) * Math.PI * 2;
      const y = H / 2 + Math.sin(t * 5 + phase) * 46 * Math.cos(t * 1.5) + Math.sin(t * 11 - phase * 2) * 14;
      d += `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
    }
    paths.push(`<path d="${d}"/>`);
  }
  host.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" focusable="false">${paths.join("")}</svg>`;
}
