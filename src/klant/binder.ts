// Een ontwerp van een klant op een echte zip-binder tonen: een foto van een binder (logo eraf), in elke
// kleur omgekleurd, met het ontwerp tot aan het stiksel, zoals een lasergravure (altijd zwart, met wat
// structuur van de binder erdoor en een donkere brandrand). Enkel een indicatie. Alles gebeurt in de browser; er gaat niets
// weg tot de klant de aanvraag verstuurt. Dezelfde aanpak als de interne gravure-preview van Bind'r.

export interface BinderKleur { id: string; naam: string; kleur: string; foto?: boolean }

/**
 * De basiskleuren van de Vault X 9-Pocket Exo-Tec Zip Binder (oktober 2026). Elke kleur is de gemiddelde kleur
 * van het midden van de kaft op de productfoto van Vault X (vaultx.com, zelfde studiolicht voor alle kleuren),
 * op dezelfde manier gemeten als REF op onze foto. De foto wordt naar die kleur omgekleurd: een benadering.
 */
export const BINDER_KLEUREN: BinderKleur[] = [
  { id: "zwart", naam: "Zwart", kleur: "#212121" },          // Signature Black
  { id: "koningsblauw", naam: "Koningsblauw", kleur: "#233349" }, // Royal Blue (donker, bijna marine)
  { id: "oceaanblauw", naam: "Oceaanblauw", kleur: "#078d8e" },   // Ocean Blue (petrol)
  { id: "bosgroen", naam: "Bosgroen", kleur: "#2d443a" },         // Forest Green
  { id: "rood", naam: "Rood", kleur: "#ae242c" },                 // Fire Red
  { id: "geel", naam: "Geel", kleur: "#d3a611" },                 // Sunrise Yellow
  { id: "roze", naam: "Roze", kleur: "#e9aeaf" },                 // Just Pink (lichtroze)
  { id: "paars", naam: "Paars", kleur: "#a97fd5" },               // Just Purple (lila)
];

/** Een lasergravure op deze binders is altijd zwart. */
export const GRAVUREKLEUR = "#141414";

/** De foto (722 × 1008) en het vlak binnen het stiksel: recht aan de rug, rond aan de buitenkant. */
export const BINDER_W = 722;
export const BINDER_H = 1008;
export const DRUKVLAK = { x: 52, y: 56, w: 638, h: 920, r: 46 };
/** De kleur van de foto (turkoois) in HSL: omkleuren schuift alles daarvandaan. */
const REF = { h: 0.502, s: 0.402, l: 0.376 }; // gemiddelde van het midden van de kaft (30–80% breed, 20–55% hoog)
/** Hoe de gravure eruitziet: dekking, hoeveel structuur er doorheen komt, de brandrand. */
const GRAVURE = { sterkte: 0.88, structuur: 0.38, rand: 0.28 };

const klem = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
function hexNaarRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbNaarHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (mx + mn) / 2;
  if (mx !== mn) {
    const d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h /= 6;
  }
  return [h, s, l];
}
function tint(p: number, q: number, t: number) {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}
function hslNaarRgb(h: number, s: number, l: number): [number, number, number] {
  if (s <= 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [tint(p, q, h + 1 / 3) * 255, tint(p, q, h) * 255, tint(p, q, h - 1 / 3) * 255];
}

function laadBeeld(url: string): Promise<HTMLImageElement> {
  return new Promise((ok, fout) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => fout(new Error("Dit bestand kunnen we niet lezen. Probeer een PNG, JPG of SVG."));
    img.src = url;
  });
}

let basis: Promise<HTMLCanvasElement> | null = null;
const perKleur = new Map<string, HTMLCanvasElement>();

/** De foto van de binder (turkoois, logo weg), één keer geladen. */
function laadBasis(url: string): Promise<HTMLCanvasElement> {
  if (!basis) {
    basis = laadBeeld(url).then((img) => {
      const c = document.createElement("canvas");
      c.width = BINDER_W;
      c.height = BINDER_H;
      c.getContext("2d")!.drawImage(img, 0, 0, BINDER_W, BINDER_H);
      return c;
    });
    basis.catch(() => { basis = null; });
  }
  return basis;
}

/** De binder in een kleur: de foto, omgekleurd met behoud van licht en structuur. */
export async function binderIn(kleur: BinderKleur, fotoUrl: string): Promise<HTMLCanvasElement> {
  const al = perKleur.get(kleur.id);
  if (al) return al;
  const b = await laadBasis(fotoUrl);
  if (kleur.foto) { perKleur.set(kleur.id, b); return b; }
  const [tH, tS, tL] = rgbNaarHsl(...hexNaarRgb(kleur.kleur));
  const uit = document.createElement("canvas");
  uit.width = b.width;
  uit.height = b.height;
  const ctx = uit.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(b, 0, 0);
  const img = ctx.getImageData(0, 0, uit.width, uit.height);
  const d = img.data;
  const laagK = tL / REF.l, hoogA = 1 - tL, hoogB = 1 - REF.l;
  for (let p = 0; p < d.length; p += 4) {
    if (d[p + 3] < 6) continue;
    const r = d[p] / 255, g = d[p + 1] / 255, bl = d[p + 2] / 255;
    const mx = Math.max(r, g, bl), mn = Math.min(r, g, bl), l = (mx + mn) / 2;
    let s = 0;
    if (mx !== mn) { const dd = mx - mn; s = l > 0.5 ? dd / (2 - mx - mn) : dd / (mx + mn); }
    const nl = l <= REF.l ? l * laagK : tL + hoogA * ((l - REF.l) / hoogB) ** 2;
    const c = hslNaarRgb(tH, klem(tS * (s / REF.s), 0, 1), klem(nl, 0, 1));
    d[p] = c[0]; d[p + 1] = c[1]; d[p + 2] = c[2];
  }
  ctx.putImageData(img, 0, 0);
  perKleur.set(kleur.id, uit);
  return uit;
}

/** Het vlak binnen het stiksel: recht aan de rug (links), rond aan de buitenkant. */
function kaftPad(ctx: CanvasRenderingContext2D) {
  const { x, y, w, h } = DRUKVLAK;
  const r = Math.min(DRUKVLAK.r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x, y + h);
  ctx.closePath();
}

/** Een ontwerp van de klant: als masker (zwart met alfa = inkt), met de randen van wat er echt op staat. */
export interface Ontwerp {
  masker: HTMLCanvasElement;
  omgekeerd: boolean;
  inhoud: { w: number; h: number; cx: number; cy: number }; // waar het ontwerp in het masker staat
}

/** Leest een PNG, JPG, WebP of SVG in (een SVG als afbeelding: scripts erin lopen nooit). */
export async function leesOntwerp(bestand: File): Promise<HTMLCanvasElement> {
  if (bestand.size > 12 * 1024 * 1024) throw new Error("Dit bestand is te groot (max. 12 MB).");
  const svg = bestand.type === "image/svg+xml" || /\.svg$/i.test(bestand.name);
  if (!svg && !/^image\/(png|jpeg|webp|gif)$/.test(bestand.type)) throw new Error("Kies een PNG, JPG of SVG.");
  const url = URL.createObjectURL(svg ? new Blob([await bestand.text()], { type: "image/svg+xml" }) : bestand);
  try {
    const img = await laadBeeld(url);
    // Een SVG tekenen we op 1400 px (scherp); een foto verkleinen we tot hoogstens 1400 px.
    const nw = img.naturalWidth || 1000, nh = img.naturalHeight || 1000;
    const doel = svg ? 1400 / Math.max(nw, nh) : Math.min(1, 1400 / Math.max(nw, nh));
    const w = Math.max(1, Math.round(nw * doel)), h = Math.max(1, Math.round(nh * doel));
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    c.getContext("2d")!.drawImage(img, 0, 0, w, h);
    return c;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Is het ontwerp licht op een donkere achtergrond (dan keren we om)? Kijkt naar de rand. */
export function lichtOpDonker(bron: HTMLCanvasElement): boolean {
  const d = bron.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, bron.width, bron.height).data;
  let som = 0, n = 0, doorzichtig = 0;
  const stap = Math.max(1, Math.floor(Math.min(bron.width, bron.height) / 60));
  const kijk = (x: number, y: number) => {
    const i = (y * bron.width + x) * 4;
    if (d[i + 3] < 128) { doorzichtig++; return; }
    som += (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
    n++;
  };
  for (let x = 0; x < bron.width; x += stap) { kijk(x, 0); kijk(x, bron.height - 1); }
  for (let y = 0; y < bron.height; y += stap) { kijk(0, y); kijk(bron.width - 1, y); }
  return n > doorzichtig && som / Math.max(1, n) < 0.45;
}

/** Maakt het masker: donker (of licht, als omgekeerd) wordt inkt; grijs wordt een lichtere gravure. */
export function maakMasker(bron: HTMLCanvasElement, omgekeerd: boolean): Ontwerp {
  const w = bron.width, h = bron.height;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const img = bron.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, w, h);
  const p = img.data;
  const wit = 234, zwart = 42; // zoals in de gravure-preview: wat lichter is dan "wit" blijft binderkleur
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let i = 0, k = 0; k < p.length; i++, k += 4) {
    let lum = 0.299 * p[k] + 0.587 * p[k + 1] + 0.114 * p[k + 2];
    if (omgekeerd) lum = 255 - lum;
    const a = klem((wit - lum) / (wit - zwart), 0, 1) * (p[k + 3] / 255);
    p[k] = p[k + 1] = p[k + 2] = 0;
    p[k + 3] = Math.round(a * 255);
    if (p[k + 3] > 8) {
      const x = i % w, y = (i / w) | 0;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) { x0 = 0; y0 = 0; x1 = w - 1; y1 = h - 1; }
  c.getContext("2d")!.putImageData(img, 0, 0);
  return { masker: c, omgekeerd, inhoud: { w: x1 - x0 + 1, h: y1 - y0 + 1, cx: (x0 + x1 + 1) / 2, cy: (y0 + y1 + 1) / 2 } };
}

/**
 * Waar het ontwerp staat: `schaal` = de breedte van het ontwerp als deel van de breedte van het vlak,
 * `x`, `y` = het midden in pixels van de foto.
 */
export interface Plaatsing { schaal: number; x: number; y: number }

/** Passend (alles zichtbaar) en vullend (tot aan het stiksel, de rest valt weg). */
export function grenzen(o: Ontwerp) {
  const f = o.inhoud.w / DRUKVLAK.w;
  return {
    passend: Math.min(DRUKVLAK.w / o.inhoud.w, DRUKVLAK.h / o.inhoud.h) * f,
    vullend: Math.max(DRUKVLAK.w / o.inhoud.w, DRUKVLAK.h / o.inhoud.h) * f,
  };
}

export function midden(o: Ontwerp, schaal: number): Plaatsing {
  return houdBinnen(o, { schaal, x: DRUKVLAK.x + DRUKVLAK.w / 2, y: DRUKVLAK.y + DRUKVLAK.h / 2 });
}

/** Het ontwerp blijft binnen het vlak; is het groter, dan blijft het vlak gevuld. */
export function houdBinnen(o: Ontwerp, p: Plaatsing): Plaatsing {
  const schaal = klem(p.schaal, 0.08, grenzen(o).vullend);
  const k = (schaal * DRUKVLAK.w) / o.inhoud.w;
  const w = o.inhoud.w * k, h = o.inhoud.h * k;
  const minX = DRUKVLAK.x + w / 2, maxX = DRUKVLAK.x + DRUKVLAK.w - w / 2;
  const minY = DRUKVLAK.y + h / 2, maxY = DRUKVLAK.y + DRUKVLAK.h - h / 2;
  return {
    schaal,
    x: klem(p.x, Math.min(minX, maxX), Math.max(minX, maxX)),
    y: klem(p.y, Math.min(minY, maxY), Math.max(minY, maxY)),
  };
}

function zetMasker(ctx: CanvasRenderingContext2D, o: Ontwerp, p: Plaatsing, dx = 0) {
  const k = (p.schaal * DRUKVLAK.w) / o.inhoud.w;
  ctx.save();
  ctx.translate(p.x + dx, p.y);
  ctx.scale(k, k);
  ctx.drawImage(o.masker, -o.inhoud.cx, -o.inhoud.cy);
  ctx.restore();
}

// Twee hulpcanvassen, hergebruikt bij elke tekening (verslepen tekent tientallen keren per seconde).
const vlakken: HTMLCanvasElement[] = [];
function werkvlak(i: number): HTMLCanvasElement {
  if (!vlakken[i]) {
    const c = document.createElement("canvas");
    c.width = BINDER_W;
    c.height = BINDER_H;
    vlakken[i] = c;
  }
  return vlakken[i];
}

/**
 * Tekent de binder met het ontwerp in de ruimte van de foto (BINDER_W × BINDER_H; de transformatie van ctx
 * bepaalt de echte grootte). Werkt ook in oudere Safari: geen ctx.filter, de vervaging gaat via een schaduw.
 */
export function teken(ctx: CanvasRenderingContext2D, binder: HTMLCanvasElement, o: Ontwerp | null, p: Plaatsing | null, inkt = GRAVUREKLEUR) {
  ctx.drawImage(binder, 0, 0, BINDER_W, BINDER_H);
  if (!o || !p) return;
  ctx.save();
  kaftPad(ctx);
  ctx.clip();
  // De brandrand: een vage donkere rand rond de gravure (enkel de schaduw van het masker; het masker zelf valt
  // buiten het canvas). Op een eigen canvas van de grootte van de foto, dus in pixels van de foto.
  const rand = werkvlak(0);
  const r = rand.getContext("2d")!;
  r.clearRect(0, 0, BINDER_W, BINDER_H);
  r.shadowColor = "#000";
  r.shadowBlur = 3;
  r.shadowOffsetX = BINDER_W;
  zetMasker(r, o, p, -BINDER_W);
  ctx.globalCompositeOperation = "multiply";
  ctx.globalAlpha = GRAVURE.rand * 0.55;
  ctx.drawImage(rand, 0, 0);
  // De inkt, met wat structuur van de binder erdoorheen.
  const laag = werkvlak(1);
  const l = laag.getContext("2d")!;
  l.globalCompositeOperation = "source-over";
  l.globalAlpha = 1;
  l.clearRect(0, 0, BINDER_W, BINDER_H);
  zetMasker(l, o, p);
  l.globalCompositeOperation = "source-in";
  l.fillStyle = inkt;
  l.fillRect(0, 0, BINDER_W, BINDER_H);
  l.globalCompositeOperation = "overlay";
  l.globalAlpha = GRAVURE.structuur;
  l.drawImage(binder, 0, 0, BINDER_W, BINDER_H);
  l.globalAlpha = 1;
  l.globalCompositeOperation = "destination-in";
  zetMasker(l, o, p);
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = GRAVURE.sterkte;
  ctx.drawImage(laag, 0, 0);
  ctx.restore();
}

/** Het ontwerp als PNG om mee te sturen (zwart op doorzichtig), hoogstens ~440 kB (de database neemt 450.000 tekens). */
export function ontwerpAlsPng(o: Ontwerp): string | null {
  for (const max of [1100, 900, 700, 520, 380]) {
    const schaal = Math.min(1, max / Math.max(o.masker.width, o.masker.height));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(o.masker.width * schaal));
    c.height = Math.max(1, Math.round(o.masker.height * schaal));
    c.getContext("2d")!.drawImage(o.masker, 0, 0, c.width, c.height);
    const url = c.toDataURL("image/png");
    if (url.length <= 440_000) return url;
  }
  return null;
}

/** Het voorbeeld op de binder als JPEG (klein genoeg om mee te sturen, de database neemt 250.000 tekens). */
export function voorbeeldAlsJpeg(binder: HTMLCanvasElement, o: Ontwerp | null, p: Plaatsing | null, inkt = GRAVUREKLEUR): string {
  const breed = 560;
  const c = document.createElement("canvas");
  c.width = breed;
  c.height = Math.round((breed * BINDER_H) / BINDER_W);
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#fcebd7";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.scale(breed / BINDER_W, breed / BINDER_W);
  teken(ctx, binder, o, p, inkt);
  for (const q of [0.84, 0.7, 0.55]) {
    const url = c.toDataURL("image/jpeg", q);
    if (url.length <= 240_000) return url;
  }
  return c.toDataURL("image/jpeg", 0.4);
}

/** Een afbeelding bij het idee (foto, schets, screenshot): verkleind tot een JPEG van hoogstens ~240 kB. */
export async function ideeAfbeelding(bestand: File): Promise<string> {
  if (!/^image\//.test(bestand.type)) throw new Error("Kies een afbeelding (foto, schets of screenshot).");
  if (bestand.size > 15 * 1024 * 1024) throw new Error("Deze afbeelding is te groot (max. 15 MB).");
  const url = URL.createObjectURL(bestand);
  try {
    const img = await laadBeeld(url);
    for (const [max, q] of [[1000, 0.8], [800, 0.75], [600, 0.7], [450, 0.65]] as const) {
      const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.naturalWidth * s));
      c.height = Math.max(1, Math.round(img.naturalHeight * s));
      const ctx = c.getContext("2d")!;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      const d = c.toDataURL("image/jpeg", q);
      if (d.length <= 240_000) return d;
    }
    throw new Error("Deze afbeelding is te groot, ook verkleind. Probeer een andere.");
  } finally {
    URL.revokeObjectURL(url);
  }
}
