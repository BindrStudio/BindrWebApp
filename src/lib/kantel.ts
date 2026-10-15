// Een kaart die meekantelt, met een glans die de cursor of je vinger volgt.
//
// - Met een muis kantelt een tegel mee zolang je erover beweegt.
// - Op een gsm kantelt hij naar je vinger zolang je drukt; begin je te scrollen,
//   dan neemt de browser het over en veert de kaart terug.
// - `kantelVrij` (de grote foto in een detail) laat je met je vinger vrij draaien:
//   daar scrolt de pagina niet mee (touch-action: none in de css).
// Niets kantelt bij "minder beweging" in de instellingen van het toestel.
import type { PointerEvent as ReactPointerEvent } from "react";

const rustig = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

function zet(el: HTMLElement, clientX: number, clientY: number, kracht: number) {
  const r = el.getBoundingClientRect();
  if (!r.width || !r.height) return;
  const x = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
  const y = Math.min(1, Math.max(0, (clientY - r.top) / r.height));
  el.style.setProperty("--rx", `${((0.5 - y) * 9 * kracht).toFixed(2)}deg`);
  el.style.setProperty("--ry", `${((x - 0.5) * 11 * kracht).toFixed(2)}deg`);
  el.style.setProperty("--mx", `${(x * 100).toFixed(1)}%`);
  el.style.setProperty("--my", `${(y * 100).toFixed(1)}%`);
  el.classList.add("kantelt");
}

function los(el: HTMLElement) {
  for (const v of ["--rx", "--ry", "--mx", "--my"]) el.style.removeProperty(v);
  el.classList.remove("kantelt", "gedrukt");
}

const vinger = (e: ReactPointerEvent<HTMLElement>) => e.pointerType === "touch" || e.pointerType === "pen";

/** Op een tegel zetten: <button {...kantel} …> */
export const kantel = {
  onPointerMove(e: ReactPointerEvent<HTMLElement>) {
    if (rustig()) return;
    if (e.pointerType === "mouse") zet(e.currentTarget, e.clientX, e.clientY, 1);
    else if (e.currentTarget.classList.contains("gedrukt")) zet(e.currentTarget, e.clientX, e.clientY, 0.8);
  },
  onPointerDown(e: ReactPointerEvent<HTMLElement>) {
    if (rustig() || !vinger(e)) return;
    e.currentTarget.classList.add("gedrukt");
    zet(e.currentTarget, e.clientX, e.clientY, 0.8);
  },
  onPointerUp(e: ReactPointerEvent<HTMLElement>) { if (vinger(e)) los(e.currentTarget); },
  onPointerCancel(e: ReactPointerEvent<HTMLElement>) { los(e.currentTarget); },
  onPointerLeave(e: ReactPointerEvent<HTMLElement>) { los(e.currentTarget); },
};

/** Voor de grote foto in een detail: met je vinger vrij draaien, ook als je buiten de kaart sleept. */
export const kantelVrij = {
  onPointerDown(e: ReactPointerEvent<HTMLElement>) {
    if (rustig()) return;
    if (vinger(e)) {
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* oudere browsers */ }
      e.currentTarget.classList.add("gedrukt");
      zet(e.currentTarget, e.clientX, e.clientY, 1.6);
    }
  },
  onPointerMove(e: ReactPointerEvent<HTMLElement>) {
    if (rustig()) return;
    if (e.pointerType === "mouse" || e.currentTarget.classList.contains("gedrukt")) zet(e.currentTarget, e.clientX, e.clientY, 1.6);
  },
  onPointerUp(e: ReactPointerEvent<HTMLElement>) { if (vinger(e)) los(e.currentTarget); },
  onPointerCancel(e: ReactPointerEvent<HTMLElement>) { los(e.currentTarget); },
  onPointerLeave(e: ReactPointerEvent<HTMLElement>) { if (!e.currentTarget.classList.contains("gedrukt")) los(e.currentTarget); },
};
