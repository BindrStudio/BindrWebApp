import type { Exemplaar } from "../types";
import { qrInhoud, toonCode } from "./code";

// qrcode-generator (public/vendor/qrcode.js, MIT) zet een globale `qrcode`.
declare global {
  interface Window {
    qrcode: (type: number, level: "L" | "M" | "Q" | "H") => {
      addData(d: string): void;
      make(): void;
      getModuleCount(): number;
      isDark(r: number, c: number): boolean;
    };
  }
}

export interface LabelMaat {
  breedte: number; // pixels langs de printkop
  hoogte: number;  // pixels langs de doorvoer
  dpi: number;
  mmBreed: number;
  mmHoog: number;
}

// Labelrollen die passen op de achterkant van een toploader. 50 × 15 mm is de standaard;
// de andere zijn er voor als de rol die jullie kopen anders blijkt.
export const LABELMATEN = [
  { id: "50x15", label: "50 × 15 mm", b: 50, h: 15 },
  { id: "40x15", label: "40 × 15 mm", b: 40, h: 15 },
  { id: "50x20", label: "50 × 20 mm", b: 50, h: 20 },
  { id: "50x30", label: "50 × 30 mm", b: 50, h: 30 },
] as const;

// Breedte van de printkop: B1 Pro 576 px (300 dpi), B1 384 px (203 dpi), zoals de driver ze gebruikt.
const PRINTKOP: Record<number, number> = { 300: 576, 203: 384 };

export function maatVoor(dpi: number, labelId = "50x15"): LabelMaat {
  const m = LABELMATEN.find((l) => l.id === labelId) || LABELMATEN[0];
  const pxmm = dpi / 25.4;
  return {
    breedte: Math.min(Math.round(m.b * pxmm), PRINTKOP[dpi] ?? Infinity),
    hoogte: Math.round(m.h * pxmm),
    dpi,
    mmBreed: m.b,
    mmHoog: m.h,
  };
}

// 50 × 15 mm op de B1 Pro (300 dpi) en de B1 (203 dpi).
export const MAAT_300: LabelMaat = maatVoor(300);
export const MAAT_203: LabelMaat = maatVoor(203);

export function labelRegels(ex: Exemplaar): { code: string; naam: string; detail: string } {
  let detail: string[];
  if (ex.soort === "slab") detail = [[ex.set_code, ex.nummer].filter(Boolean).join(" "), [ex.grader, ex.grade].filter(Boolean).join(" ")];
  else if (ex.soort === "eigen product") detail = ["Bind'r"];
  else {
    detail = [[ex.set_code, ex.nummer].filter(Boolean).join(" "), ex.conditie || ""];
    if (ex.taal && ex.taal !== "EN") detail.push(ex.taal.startsWith("CN") ? "CN" : ex.taal);
    if (ex.variant === "reverse holo") detail.push("RH");
  }
  return { code: toonCode(ex.code), naam: ex.naam, detail: detail.filter(Boolean).join(" · ") };
}

function past(ctx: CanvasRenderingContext2D, tekst: string, max: number): string {
  if (ctx.measureText(tekst).width <= max) return tekst;
  let t = tekst;
  while (t.length > 1 && ctx.measureText(t + "…").width > max) t = t.slice(0, -1);
  return t.trimEnd() + "…";
}

function hart(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  // punt onderaan op (x, y), breedte ≈ 1.8 s
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.bezierCurveTo(x - s * 0.9, y - s * 0.55, x - s * 0.45, y - s * 1.15, x, y - s * 0.75);
  ctx.bezierCurveTo(x + s * 0.45, y - s * 1.15, x + s * 0.9, y - s * 0.55, x, y);
  ctx.fill();
}

/** Tekent het label (zwart op wit) op een canvas in de resolutie van de printer. */
export function tekenLabel(ex: Exemplaar, maat: LabelMaat = MAAT_300): HTMLCanvasElement {
  const pxmm = maat.dpi / 25.4;
  const c = document.createElement("canvas");
  c.width = maat.breedte;
  c.height = maat.hoogte;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = "#000";

  // De opmaak is ontworpen voor 15 mm hoog en ± 48 mm bedrukbaar; andere maten schalen mee.
  const breedMm = c.width / pxmm;
  const hoogMm = c.height / pxmm;
  const s = Math.min(hoogMm / 15, breedMm / 48, 1.6);
  const oy = (hoogMm - 15 * s) / 2; // verticaal centreren
  const mm = (x: number) => Math.round(x * s * pxmm);
  const y = (v: number) => Math.round((oy + v * s) * pxmm);

  // QR-code links
  const qr = window.qrcode(0, "Q");
  qr.addData(qrInhoud(ex.code));
  qr.make();
  const n = qr.getModuleCount();
  const zijde = mm(11.5);
  const mod = Math.max(1, Math.floor(zijde / n));
  const qrZijde = mod * n;
  const x0 = mm(1.6);
  const y0 = Math.round((c.height - qrZijde) / 2);
  for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (qr.isDark(r, k)) ctx.fillRect(x0 + k * mod, y0 + r * mod, mod, mod);

  // Tekst rechts
  const { code, naam, detail } = labelRegels(ex);
  const tx = x0 + qrZijde + mm(1.9);
  const max = c.width - tx - mm(1.2);
  const pt = (p: number) => Math.round((p * s / 72) * maat.dpi);
  ctx.textBaseline = "alphabetic";
  ctx.font = `700 ${pt(9.5)}px "Helvetica Neue", Arial, sans-serif`;
  ctx.fillText(code, tx, y(4.7));
  ctx.font = `400 ${pt(6.5)}px "Helvetica Neue", Arial, sans-serif`;
  ctx.fillText(past(ctx, naam, max), tx, y(8.3));
  ctx.font = `400 ${pt(6)}px "Helvetica Neue", Arial, sans-serif`;
  ctx.fillText(past(ctx, detail, max - mm(4)), tx, y(11.7));
  hart(ctx, c.width - mm(3), y(15 - 2.4), mm(2.2));
  return c;
}

export function labelDataUrl(ex: Exemplaar, maat: LabelMaat = MAAT_300): string {
  return tekenLabel(ex, maat).toDataURL("image/png");
}
