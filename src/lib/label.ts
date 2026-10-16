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

// Het zwarte Bind'r-logo rechtsboven op het label (public/img/logo-zwart.png).
const LOGO_SRC = "img/logo-zwart.png";
let logo: HTMLImageElement | null = null;
let logoLaden: Promise<HTMLImageElement | null> | null = null;

/** Laadt het logo voor op het label; daarna tekent tekenLabel het mee. */
export function laadLabelLogo(): Promise<HTMLImageElement | null> {
  if (typeof Image === "undefined") return Promise.resolve(null);
  logoLaden ??= new Promise((ok) => {
    const img = new Image();
    img.onload = () => { logo = img; ok(img); };
    img.onerror = () => { logoLaden = null; ok(null); };
    img.src = LOGO_SRC;
  });
  return logoLaden;
}

/** De dag dat het label geprint (en geplakt) wordt, kort: 15/10/26. */
export function labelDatum(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)}`;
}

/** Tekent het label (zwart op wit) op een canvas in de resolutie van de printer. */
export function tekenLabel(ex: Exemplaar, maat: LabelMaat = MAAT_300, datum = labelDatum()): HTMLCanvasElement {
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
  const rechts = c.width - mm(1.2);
  ctx.textBaseline = "alphabetic";
  ctx.font = `700 ${pt(9.5)}px "Helvetica Neue", Arial, sans-serif`;
  ctx.fillText(code, tx, y(4.7));
  const codeEinde = tx + ctx.measureText(code).width;

  // Het zwarte Bind'r-logo rechtsboven (of, zolang het niet geladen is, de naam in vette letters).
  const logoH = mm(4.1);
  if (logo && logo.naturalWidth) {
    const logoB = Math.round((logoH * logo.naturalWidth) / logo.naturalHeight);
    if (rechts - logoB > codeEinde + mm(1)) ctx.drawImage(logo, rechts - logoB, y(0.9), logoB, logoH);
  } else {
    ctx.font = `800 ${pt(7.5)}px "Helvetica Neue", Arial, sans-serif`;
    const b = ctx.measureText("Bind'r").width;
    if (rechts - b > codeEinde + mm(1)) ctx.fillText("Bind'r", rechts - b, y(4.4));
  }

  ctx.font = `400 ${pt(6.5)}px "Helvetica Neue", Arial, sans-serif`;
  ctx.fillText(past(ctx, naam, max), tx, y(8.3));

  // Onderaan: set, nummer en conditie links, de datum van het label rechts.
  ctx.font = `400 ${pt(5.6)}px "Helvetica Neue", Arial, sans-serif`;
  const datumB = ctx.measureText(datum).width;
  ctx.fillText(datum, rechts - datumB, y(11.7));
  ctx.font = `400 ${pt(6)}px "Helvetica Neue", Arial, sans-serif`;
  ctx.fillText(past(ctx, detail, max - datumB - mm(1.5)), tx, y(11.7));
  return c;
}

export function labelDataUrl(ex: Exemplaar, maat: LabelMaat = MAAT_300): string {
  return tekenLabel(ex, maat).toDataURL("image/png");
}

/** Hoe de verschuiving op het label heet: "0 mm", "0,5 mm lager", "1 mm hoger". */
export function verschuivingTekst(mm: number): string {
  if (!mm) return "0 mm";
  return `${String(Math.abs(mm)).replace(".", ",")} mm ${mm > 0 ? "lager" : "hoger"}`;
}

/**
 * Randtest: een kader tot op de rand van het beeld met streepjes per millimeter (lang per 5 mm).
 * Zie je alle vier de randen, dan valt er niets weg; mist er boven of onder iets, dan tel je
 * de millimeters en verschuif je zoveel. In het midden: maat, dpi en de afstelling.
 */
export function tekenRandtest(maat: LabelMaat, a: { donkerte?: number; verschuiving?: number; trager?: boolean } = {}): HTMLCanvasElement {
  const pxmm = maat.dpi / 25.4;
  const c = document.createElement("canvas");
  c.width = maat.breedte;
  c.height = maat.hoogte;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = "#000";
  const lijn = Math.max(2, Math.round(0.3 * pxmm));
  ctx.fillRect(0, 0, c.width, lijn);
  ctx.fillRect(0, c.height - lijn, c.width, lijn);
  ctx.fillRect(0, 0, lijn, c.height);
  ctx.fillRect(c.width - lijn, 0, lijn, c.height);
  const dun = Math.max(1, Math.round(0.15 * pxmm));
  const kort = Math.round(0.9 * pxmm);
  const lang = Math.round(1.8 * pxmm);
  for (let i = 1; i * pxmm < c.width - 1; i++) {
    const x = Math.round(i * pxmm);
    const l = i % 5 === 0 ? lang : kort;
    ctx.fillRect(x, 0, dun, l);
    ctx.fillRect(x, c.height - l, dun, l);
  }
  for (let i = 1; i * pxmm < c.height - 1; i++) {
    const y = Math.round(i * pxmm);
    const l = i % 5 === 0 ? lang : kort;
    ctx.fillRect(0, y, l, dun);
    ctx.fillRect(c.width - l, y, l, dun);
  }
  const pt = (p: number) => Math.round((p / 72) * maat.dpi);
  const midden = c.width / 2;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 ${pt(9)}px "Helvetica Neue", Arial, sans-serif`;
  ctx.fillText(`▲ RANDTEST ${maat.mmBreed} × ${maat.mmHoog}`, midden, c.height / 2 - pt(4.2));
  ctx.font = `400 ${pt(5.6)}px "Helvetica Neue", Arial, sans-serif`;
  const regel = [`${maat.dpi} dpi`, `donkerte ${a.donkerte ?? 3}`, verschuivingTekst(a.verschuiving ?? 0), a.trager ? "trager" : null].filter(Boolean).join(" · ");
  ctx.fillText(regel, midden, c.height / 2 + pt(3.4));
  return c;
}

export function randtestDataUrl(maat: LabelMaat, a: { donkerte?: number; verschuiving?: number; trager?: boolean } = {}): string {
  return tekenRandtest(maat, a).toDataURL("image/png");
}
