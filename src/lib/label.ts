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
  /** Rol met twee labels naast elkaar op één strook: waar elk label op de strook staat (pixels langs de kop). */
  vakken?: { x: number; breedte: number }[];
  mmLabel?: number; // breedte van één label op zo'n rol
}

export interface LabelRol {
  id: string;
  label: string;
  kort?: string;   // in de samenvatting van de printer
  b: number;       // breedte van de strook (mm)
  h: number;       // hoogte (mm)
  per?: 2;         // twee labels naast elkaar op één strook (de printer print altijd de hele strook)
  labelB?: number; // breedte van één label (mm)
  tussen?: number; // ruimte tussen de twee labels (mm)
}

// Labelrollen die passen op de achterkant van een toploader. 50 × 15 mm is de standaard;
// de andere zijn er voor als de rol die jullie kopen anders blijkt. "2 per strook" = Niimbot
// T50*15/2R-460: twee labels van 23 × 15 mm naast elkaar, 2 mm ertussen (de printer kent enkel de
// strook: hij schuift per strook door, nooit per half).
export const LABELMATEN: LabelRol[] = [
  { id: "50x15", label: "50 × 15 mm", b: 50, h: 15 },
  { id: "50x15x2", label: "2 per strook (2 × 23 × 15 mm)", kort: "2 per strook", b: 50, h: 15, per: 2, labelB: 23, tussen: 2 },
  { id: "40x15", label: "40 × 15 mm", b: 40, h: 15 },
  { id: "50x20", label: "50 × 20 mm", b: 50, h: 20 },
  { id: "50x30", label: "50 × 30 mm", b: 50, h: 30 },
];

/** De rol met dit id (een onbekend id: de standaard 50 × 15). */
export function labelRol(labelId?: string): LabelRol {
  return LABELMATEN.find((l) => l.id === labelId) || LABELMATEN[0];
}

// Breedte van de printkop: B1 Pro 576 px (300 dpi), B1 384 px (203 dpi), zoals de driver ze gebruikt.
const PRINTKOP: Record<number, number> = { 300: 576, 203: 384 };

export function maatVoor(dpi: number, labelId = "50x15"): LabelMaat {
  const m = labelRol(labelId);
  const pxmm = dpi / 25.4;
  const breedte = Math.min(Math.round(m.b * pxmm), PRINTKOP[dpi] ?? Infinity);
  const maat: LabelMaat = { breedte, hoogte: Math.round(m.h * pxmm), dpi, mmBreed: m.b, mmHoog: m.h };
  if (m.per === 2 && m.labelB) {
    // De printkop staat in het midden van de strook; de twee labels ook (met `tussen` ertussen).
    const kopRand = (m.b - breedte / pxmm) / 2;           // stuk van de strook links van de printkop
    const begin = (m.b - 2 * m.labelB - (m.tussen ?? 0)) / 2; // rand van de strook links van het eerste label
    const lb = Math.round(m.labelB * pxmm);
    maat.vakken = [0, 1].map((i) => {
      const x = Math.round((begin + i * (m.labelB! + (m.tussen ?? 0)) - kopRand) * pxmm);
      return { x: Math.max(0, Math.min(x, breedte - lb)), breedte: lb };
    });
    maat.mmLabel = m.labelB;
  }
  return maat;
}

/** De maat van één label: bij twee per strook één helft (om te tekenen en te tonen), anders de strook zelf. */
export function enkelLabel(maat: LabelMaat): LabelMaat {
  if (!maat.vakken) return maat;
  return { breedte: maat.vakken[0].breedte, hoogte: maat.hoogte, dpi: maat.dpi, mmBreed: maat.mmLabel ?? maat.mmBreed / 2, mmHoog: maat.mmHoog };
}

// 50 × 15 mm op de B1 Pro (300 dpi) en de B1 (203 dpi).
export const MAAT_300: LabelMaat = maatVoor(300);
export const MAAT_203: LabelMaat = maatVoor(203);

// De Fichero (Action): labels van 30 × 14 mm die in de lengte door de printer lopen. De printkop is
// 12 mm (96 px op 203 dpi): we tekenen liggend 240 × 96 en lib/fichero draait het een kwartslag.
export const FICHERO_MAAT: LabelMaat = { breedte: 240, hoogte: 96, dpi: 203, mmBreed: 30, mmHoog: 14 };

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
  if (maat.mmBreed <= 32) return tekenKlein(ex, maat, datum);
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

/**
 * Een klein label (30 × 14 mm, Fichero; 23 × 15 mm, twee per strook bij de Niimbot): QR links
 * (± 10,5 mm, op 23 mm ± 9 mm), rechts de code groot, de naam en set · nummer · conditie, onderaan
 * de datum en het logo (als er plaats is). Dikkere letters: 203 dpi is grover.
 */
function tekenKlein(ex: Exemplaar, maat: LabelMaat, datum: string): HTMLCanvasElement {
  const pxmm = maat.dpi / 25.4;
  const c = document.createElement("canvas");
  c.width = maat.breedte;
  c.height = maat.hoogte;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = "#000";
  const mm = (x: number) => Math.round(x * pxmm);

  const qr = window.qrcode(0, "Q");
  qr.addData(qrInhoud(ex.code));
  qr.make();
  const n = qr.getModuleCount();
  const smal = maat.mmBreed < 26; // 23 mm: een iets kleinere QR, zodat de code ernaast past
  const mod = Math.max(1, Math.floor(Math.min(mm(smal ? 9.6 : 10.5), c.height - mm(1)) / n));
  const qrZijde = mod * n;
  const x0 = mm(smal ? 1.1 : 1.5);
  const y0 = Math.round((c.height - qrZijde) / 2);
  for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (qr.isDark(r, k)) ctx.fillRect(x0 + k * mod, y0 + r * mod, mod, mod);

  const { code, naam, detail } = labelRegels(ex);
  const tx = x0 + qrZijde + mm(smal ? 1 : 1.2);
  const rechts = c.width - mm(smal ? 1 : 1.2);
  const max = rechts - tx;
  const boven = Math.round((c.height - mm(11.4)) / 2);
  const y = (v: number) => boven + mm(v);
  const font = (gewicht: number, px: number) => `${gewicht} ${px}px "Helvetica Neue", Arial, sans-serif`;
  ctx.textBaseline = "alphabetic";
  // De code zo groot als past (hij moet leesbaar zijn als de QR niet scant).
  let px = mm(3.2);
  ctx.font = font(800, px);
  while (px > mm(2) && ctx.measureText(code).width > max) ctx.font = font(800, --px);
  ctx.fillText(code, tx, y(2.9));
  ctx.font = font(600, mm(1.9));
  ctx.fillText(past(ctx, naam, max), tx, y(5.6));
  ctx.font = font(500, mm(1.75));
  ctx.fillText(past(ctx, detail, max), tx, y(8.2));
  // Onderaan: de datum links, het logo (of de naam) rechts.
  ctx.font = font(500, mm(1.5));
  ctx.fillText(datum, tx, y(11));
  const datumEinde = tx + ctx.measureText(datum).width;
  const logoH = mm(1.9);
  if (logo && logo.naturalWidth) {
    const logoB = Math.round((logoH * logo.naturalWidth) / logo.naturalHeight);
    if (rechts - logoB > datumEinde + mm(0.8)) ctx.drawImage(logo, rechts - logoB, y(11) - logoH + mm(0.2), logoB, logoH);
  } else {
    ctx.font = font(800, mm(1.6));
    const b = ctx.measureText("Bind'r").width;
    if (rechts - b > datumEinde + mm(0.8)) ctx.fillText("Bind'r", rechts - b, y(11));
  }
  return c;
}

export function labelDataUrl(ex: Exemplaar, maat: LabelMaat = MAAT_300): string {
  return tekenLabel(ex, enkelLabel(maat)).toDataURL("image/png");
}

/**
 * Een strook met twee labels naast elkaar: elk label op zijn plaats (`maat.vakken`), een lege plaats
 * blijft wit. `schuif` (pixels, + = naar rechts) zet alles samen opzij, om de strook af te stellen.
 */
export function tekenStrook(labels: (HTMLCanvasElement | null)[], maat: LabelMaat, schuif = 0): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = maat.breedte;
  c.height = maat.hoogte;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, c.width, c.height);
  (maat.vakken ?? [{ x: 0, breedte: maat.breedte }]).forEach((v, i) => {
    const l = labels[i];
    if (l) ctx.drawImage(l, v.x + schuif, 0, v.breedte, maat.hoogte);
  });
  return c;
}

/** De strooks voor deze exemplaren: per twee naast elkaar (de laatste helft blijft leeg bij een oneven aantal). */
export function strookUrls(exemplaren: Exemplaar[], maat: LabelMaat, schuif = 0, datum = labelDatum()): string[] {
  const een = enkelLabel(maat);
  const per = maat.vakken?.length ?? 1;
  const urls: string[] = [];
  for (let i = 0; i < exemplaren.length; i += per) {
    const labels = exemplaren.slice(i, i + per).map((ex) => tekenLabel(ex, een, datum));
    urls.push(tekenStrook(labels, maat, schuif).toDataURL("image/png"));
  }
  return urls;
}

/** Hoe de verschuiving op het label heet: "0 mm", "0,5 mm lager", "1 mm hoger" (Fichero: naar rechts/links). */
export function verschuivingTekst(mm: number, zijwaarts = false): string {
  if (!mm) return "0 mm";
  const kant = zijwaarts ? (mm > 0 ? "naar rechts" : "naar links") : mm > 0 ? "lager" : "hoger";
  return `${String(Math.abs(mm)).replace(".", ",")} mm ${kant}`;
}

type RandtestAfstelling = { donkerte?: number; verschuiving?: number; zijwaarts?: number; trager?: boolean; printer?: string };

/** Een kader met streepjes per millimeter (lang per 5 mm) van x tot x + breedte. */
function kader(ctx: CanvasRenderingContext2D, x: number, breedte: number, hoogte: number, pxmm: number) {
  const lijn = Math.max(2, Math.round(0.3 * pxmm));
  ctx.fillRect(x, 0, breedte, lijn);
  ctx.fillRect(x, hoogte - lijn, breedte, lijn);
  ctx.fillRect(x, 0, lijn, hoogte);
  ctx.fillRect(x + breedte - lijn, 0, lijn, hoogte);
  const dun = Math.max(1, Math.round(0.15 * pxmm));
  const kort = Math.round(0.9 * pxmm);
  const lang = Math.round(1.8 * pxmm);
  for (let i = 1; i * pxmm < breedte - 1; i++) {
    const xi = x + Math.round(i * pxmm);
    const l = i % 5 === 0 ? lang : kort;
    ctx.fillRect(xi, 0, dun, l);
    ctx.fillRect(xi, hoogte - l, dun, l);
  }
  for (let i = 1; i * pxmm < hoogte - 1; i++) {
    const y = Math.round(i * pxmm);
    const l = i % 5 === 0 ? lang : kort;
    ctx.fillRect(x, y, l, dun);
    ctx.fillRect(x + breedte - l, y, l, dun);
  }
}

/**
 * Randtest: een kader tot op de rand van het beeld met streepjes per millimeter (lang per 5 mm).
 * Zie je alle vier de randen, dan valt er niets weg; mist er boven of onder iets, dan tel je
 * de millimeters en verschuif je zoveel. In het midden: maat, dpi en de afstelling.
 * Twee labels per strook: een kader per label (links en rechts), mee opzij geschoven met `zijwaarts`.
 */
export function tekenRandtest(maat: LabelMaat, a: RandtestAfstelling = {}): HTMLCanvasElement {
  const pxmm = maat.dpi / 25.4;
  const c = document.createElement("canvas");
  c.width = maat.breedte;
  c.height = maat.hoogte;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = "#000";
  const font = (gewicht: number, px: number) => `${gewicht} ${px}px "Helvetica Neue", Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  if (maat.vakken) {
    const schuif = Math.round((a.zijwaarts ?? 0) * pxmm);
    const mmL = maat.mmLabel ?? maat.mmBreed / 2;
    const regels = [
      ["◀ LINKS", `${mmL} × ${maat.mmHoog} · ${maat.dpi} dpi`, [`donkerte ${a.donkerte ?? 3}`, a.trager ? "trager" : null].filter(Boolean).join(" · ")],
      ["RECHTS ▶", a.verschuiving ? verschuivingTekst(a.verschuiving) : "niet hoger of lager", a.zijwaarts ? verschuivingTekst(a.zijwaarts, true) : "niet opzij"],
    ];
    maat.vakken.forEach((v, i) => {
      kader(ctx, v.x + schuif, v.breedte, c.height, pxmm);
      const midden = v.x + schuif + v.breedte / 2;
      ctx.font = font(800, Math.round(2.4 * pxmm));
      ctx.fillText(regels[i][0], midden, c.height / 2 - 2.6 * pxmm);
      ctx.font = font(500, Math.round(1.5 * pxmm));
      ctx.fillText(regels[i][1], midden, c.height / 2 + 0.6 * pxmm);
      ctx.fillText(regels[i][2], midden, c.height / 2 + 2.9 * pxmm);
    });
    return c;
  }

  kader(ctx, 0, c.width, c.height, pxmm);
  const klein = Math.min(1, maat.mmBreed / 45); // op een label van 30 mm kleinere letters
  const pt = (p: number) => Math.round((p * klein / 72) * maat.dpi);
  const midden = c.width / 2;
  ctx.font = font(700, pt(9));
  ctx.fillText(`▲ RANDTEST ${maat.mmBreed} × ${maat.mmHoog}`, midden, c.height / 2 - pt(4.2));
  ctx.font = font(400, pt(5.6));
  const regel = [`${maat.dpi} dpi`, `donkerte ${a.donkerte ?? 3}`, verschuivingTekst(a.verschuiving ?? 0, a.printer === "fichero"), a.trager ? "trager" : null].filter(Boolean).join(" · ");
  ctx.fillText(regel, midden, c.height / 2 + pt(3.4));
  return c;
}

export function randtestDataUrl(maat: LabelMaat, a: RandtestAfstelling = {}): string {
  return tekenRandtest(maat, a).toDataURL("image/png");
}
