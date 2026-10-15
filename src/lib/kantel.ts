// Een kaarttegel die meekantelt met de muis, met een glans die de cursor volgt.
// Enkel met een muis (op een gsm scrolt je vinger, dan kantelt niets) en niet bij
// "minder beweging" in de instellingen van het toestel.
import type { PointerEvent as ReactPointerEvent } from "react";

const rustig = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

function beweeg(e: ReactPointerEvent<HTMLElement>) {
  if (e.pointerType !== "mouse" || rustig()) return;
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
  const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
  el.style.setProperty("--rx", `${((0.5 - y) * 9).toFixed(2)}deg`);
  el.style.setProperty("--ry", `${((x - 0.5) * 11).toFixed(2)}deg`);
  el.style.setProperty("--mx", `${(x * 100).toFixed(1)}%`);
  el.style.setProperty("--my", `${(y * 100).toFixed(1)}%`);
  el.classList.add("kantelt");
}

function laat(e: ReactPointerEvent<HTMLElement>) {
  const el = e.currentTarget;
  for (const v of ["--rx", "--ry", "--mx", "--my"]) el.style.removeProperty(v);
  el.classList.remove("kantelt");
}

/** Op een tegel zetten: <button {...kantel} …> */
export const kantel = { onPointerMove: beweeg, onPointerLeave: laat };
