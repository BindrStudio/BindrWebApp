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
  /** Rol met twee labels onder elkaar op één strook: waar elk label op de strook staat (pixels). */
  vakken?: { y: number; hoogte: number }[];
  mmLabel?: number; // hoogte van één label op zo'n rol
}

export interface LabelRol {
  id: string;
  label: string;
  kort?: string;   // in de samenvatting van de printer
  b: number;       // breedte (mm)
  h: number;       // hoogte van wat de printer in één keer doorschuift (mm)
  per?: 2;         // twee labels onder elkaar op één strook (de printer print altijd de hele strook)
}

// Labelrollen die passen op de achterkant van een toploader. 50 × 15 mm is de standaard;
// de andere zijn er voor als de rol die jullie kopen anders blijkt. "2 onder elkaar" = Niimbot
// T50*15/2R-460: een strook van 50 × 30 mm, in het midden doorgesneden tot twee labels van 50 × 15.
// De printer ziet enkel de strook: hij schuift altijd 30 mm door, nooit één label.
export const LABELMATEN: LabelRol[] = [
  { id: "50x15", label: "50 × 15 mm", b: 50, h: 15 },
  { id: "50x15x2", label: "2 onder elkaar (2 × 50 × 15 mm)", kort: "2 onder elkaar", b: 50, h: 30, per: 2 },
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
  const maat: LabelMaat = {
    breedte: Math.min(Math.round(m.b * pxmm), PRINTKOP[dpi] ?? Infinity),
    hoogte: Math.round(m.h * pxmm),
    dpi,
    mmBreed: m.b,
    mmHoog: m.h,
  };
  if (m.per === 2) {
    // Twee even hoge labels: het eerste bovenaan (dat komt eerst uit de printer), het tweede eronder.
    const half = Math.round(maat.hoogte / 2);
    maat.vakken = [{ y: 0, hoogte: half }, { y: half, hoogte: maat.hoogte - half }];
    maat.mmLabel = m.h / 2;
  }
  return maat;
}

/** De maat van één label: bij twee per strook één label (om te tekenen en te tonen), anders de strook zelf. */
export function enkelLabel(maat: LabelMaat): LabelMaat {
  if (!maat.vakken) return maat;
  return { breedte: maat.breedte, hoogte: maat.vakken[0].hoogte, dpi: maat.dpi, mmBreed: maat.mmBreed, mmHoog: maat.mmLabel ?? maat.mmHoog / 2 };
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
 * Een klein label (30 × 14 mm, Fichero): QR links (± 10,5 mm), rechts de code groot, de naam en
 * set · nummer · conditie, onderaan de datum en het logo. Dikkere letters: 203 dpi is grover.
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
  const mod = Math.max(1, Math.floor(Math.min(mm(10.5), c.height - mm(1)) / n));
  const qrZijde = mod * n;
  const x0 = mm(1.5);
  const y0 = Math.round((c.height - qrZijde) / 2);
  for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (qr.isDark(r, k)) ctx.fillRect(x0 + k * mod, y0 + r * mod, mod, mod);

  const { code, naam, detail } = labelRegels(ex);
  const tx = x0 + qrZijde + mm(1.2);
  const rechts = c.width - mm(1.2);
  const max = rechts - tx;
  const boven = Math.round((c.height - mm(11.4)) / 2);
  const y = (v: number) => boven + mm(v);
  const font = (gewicht: number, px: number) => `${gewicht} ${px}px "Helvetica Neue", Arial, sans-serif`;
  ctx.textBaseline = "alphabetic";
  // De code zo groot als past (hij moet leesbaar zijn als de QR niet scant).
  let px = mm(3.2);
  ctx.font = font(800, px);
  while (px > mm(2.2) && ctx.measureText(code).width > max) ctx.font = font(800, --px);
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

/** Een strook met twee labels onder elkaar: elk label op zijn plaats (`maat.vakken`), een lege plaats blijft wit. */
export function tekenStrook(labels: (HTMLCanvasElement | null)[], maat: LabelMaat): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = maat.breedte;
  c.height = maat.hoogte;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, c.width, c.height);
  (maat.vakken ?? [{ y: 0, hoogte: maat.hoogte }]).forEach((v, i) => {
    const l = labels[i];
    if (l) ctx.drawImage(l, 0, v.y, maat.breedte, v.hoogte);
  });
  return c;
}

/** De strooks voor deze exemplaren: per twee onder elkaar (bij een oneven aantal blijft het onderste label van de laatste strook leeg). */
export function strookUrls(exemplaren: Exemplaar[], maat: LabelMaat, datum = labelDatum()): string[] {
  const een = enkelLabel(maat);
  const per = maat.vakken?.length ?? 1;
  const urls: string[] = [];
  for (let i = 0; i < exemplaren.length; i += per) {
    const labels = exemplaren.slice(i, i + per).map((ex) => tekenLabel(ex, een, datum));
    urls.push(tekenStrook(labels, maat).toDataURL("image/png"));
  }
  return urls;
}

/** Hoe de verschuiving op het label heet: "0 mm", "0,5 mm lager", "1 mm hoger" (Fichero: naar rechts/links). */
export function verschuivingTekst(mm: number, zijwaarts = false): string {
  if (!mm) return "0 mm";
  const kant = zijwaarts ? (mm > 0 ? "naar rechts" : "naar links") : mm > 0 ? "lager" : "hoger";
  return `${String(Math.abs(mm)).replace(".", ",")} mm ${kant}`;
}

type RandtestAfstelling = { donkerte?: number; verschuiving?: number; trager?: boolean; printer?: string };

/** Een kader met streepjes per millimeter (lang per 5 mm) over de hele breedte, van y tot y + hoogte. */
function kader(ctx: CanvasRenderingContext2D, breedte: number, y0: number, hoogte: number, pxmm: number) {
  const lijn = Math.max(2, Math.round(0.3 * pxmm));
  ctx.fillRect(0, y0, breedte, lijn);
  ctx.fillRect(0, y0 + hoogte - lijn, breedte, lijn);
  ctx.fillRect(0, y0, lijn, hoogte);
  ctx.fillRect(breedte - lijn, y0, lijn, hoogte);
  const dun = Math.max(1, Math.round(0.15 * pxmm));
  const kort = Math.round(0.9 * pxmm);
  const lang = Math.round(1.8 * pxmm);
  for (let i = 1; i * pxmm < breedte - 1; i++) {
    const x = Math.round(i * pxmm);
    const l = i % 5 === 0 ? lang : kort;
    ctx.fillRect(x, y0, dun, l);
    ctx.fillRect(x, y0 + hoogte - l, dun, l);
  }
  for (let i = 1; i * pxmm < hoogte - 1; i++) {
    const y = y0 + Math.round(i * pxmm);
    const l = i % 5 === 0 ? lang : kort;
    ctx.fillRect(0, y, l, dun);
    ctx.fillRect(breedte - l, y, l, dun);
  }
}

/**
 * Randtest: een kader tot op de rand van het beeld met streepjes per millimeter (lang per 5 mm).
 * Zie je alle vier de randen, dan valt er niets weg; mist er boven of onder iets, dan tel je
 * de millimeters en verschuif je zoveel. In het midden: maat, dpi en de afstelling.
 * Twee labels onder elkaar: een kader per label. Loopt de snede tussen de twee niet tussen de
 * kaders, dan schuif je hoger of lager.
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
  const pt = (p: number, klein = 1) => Math.round((p * klein / 72) * maat.dpi);
  const midden = c.width / 2;

  if (maat.vakken) {
    const regels = [
      [`▲ BOVENSTE LABEL ${maat.mmBreed} × ${maat.mmLabel ?? maat.mmHoog / 2}`, [`${maat.dpi} dpi`, `donkerte ${a.donkerte ?? 3}`, a.trager ? "trager" : null].filter(Boolean).join(" · ")],
      ["▼ ONDERSTE LABEL", a.verschuiving ? verschuivingTekst(a.verschuiving) : "niet hoger of lager geschoven"],
    ];
    maat.vakken.forEach((v, i) => {
      kader(ctx, c.width, v.y, v.hoogte, pxmm);
      ctx.font = font(700, pt(9));
      ctx.fillText(regels[i][0], midden, v.y + v.hoogte / 2 - pt(4.2));
      ctx.font = font(400, pt(5.6));
      ctx.fillText(regels[i][1], midden, v.y + v.hoogte / 2 + pt(3.4));
    });
    return c;
  }

  kader(ctx, c.width, 0, c.height, pxmm);
  const klein = Math.min(1, maat.mmBreed / 45); // op een label van 30 mm kleinere letters
  ctx.font = font(700, pt(9, klein));
  ctx.fillText(`▲ RANDTEST ${maat.mmBreed} × ${maat.mmHoog}`, midden, c.height / 2 - pt(4.2, klein));
  ctx.font = font(400, pt(5.6, klein));
  const regel = [`${maat.dpi} dpi`, `donkerte ${a.donkerte ?? 3}`, verschuivingTekst(a.verschuiving ?? 0, a.printer === "fichero"), a.trager ? "trager" : null].filter(Boolean).join(" · ");
  ctx.fillText(regel, midden, c.height / 2 + pt(3.4, klein));
  return c;
}

export function randtestDataUrl(maat: LabelMaat, a: RandtestAfstelling = {}): string {
  return tekenRandtest(maat, a).toDataURL("image/png");
}
