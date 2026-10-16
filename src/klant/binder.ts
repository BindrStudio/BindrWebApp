// Een zip-binder tekenen (zoals een Vault X: rits rondom, rug zonder ringen, stiksel) en er een ontwerp
// van een klant op zetten. Enkel een indicatie: zo ongeveer ziet het eruit. Alles gebeurt in de browser;
// er gaat niets weg tot de klant de aanvraag verstuurt.

export interface BinderKleur { id: string; naam: string; kleur: string }

export const BINDER_KLEUREN: BinderKleur[] = [
  { id: "zwart", naam: "Zwart", kleur: "#26272b" },
  { id: "blauw", naam: "Blauw", kleur: "#2d4f86" },
  { id: "turkoois", naam: "Turkoois", kleur: "#2f9a9a" },
  { id: "groen", naam: "Groen", kleur: "#3f7a4f" },
  { id: "rood", naam: "Rood", kleur: "#a8323a" },
  { id: "roze", naam: "Roze", kleur: "#d98aa6" },
  { id: "paars", naam: "Paars", kleur: "#5d478c" },
  { id: "geel", naam: "Geel", kleur: "#e3b93f" },
  { id: "wit", naam: "Wit", kleur: "#ecebe6" },
];

export interface Inkt { id: string; naam: string; kleur: string }
export const INKTEN: Inkt[] = [
  { id: "wit", naam: "Wit", kleur: "#f1efea" },
  { id: "grijs", naam: "Grijs", kleur: "#9b9b98" },
  { id: "zwart", naam: "Zwart", kleur: "#1b1b1d" },
];

/** De verhouding van de tekening (breedte / hoogte), zoals een 9-pocket zip-binder. */
export const BINDER_W = 720;
export const BINDER_H = 1000;

/** Het vlak waar een ontwerp kan staan (binnen het stiksel, rechts van de rug), in pixels van de tekening. */
export const DRUKVLAK = { x: 112, y: 88, w: 548, h: 832, r: 30 };

function hex(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function meng(h: string, factor: number): string {
  // factor < 0: donkerder, > 0: lichter
  const [r, g, b] = hex(h);
  const f = (c: number) => Math.round(factor < 0 ? c * (1 + factor) : c + (255 - c) * factor);
  return `rgb(${f(r)}, ${f(g)}, ${f(b)})`;
}
const isLicht = (h: string) => { const [r, g, b] = hex(h); return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6; };

function rondeRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: { tl: number; tr: number; br: number; bl: number }) {
  ctx.beginPath();
  ctx.moveTo(x + r.tl, y);
  ctx.lineTo(x + w - r.tr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r.tr);
  ctx.lineTo(x + w, y + h - r.br);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r.br, y + h);
  ctx.lineTo(x + r.bl, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r.bl);
  ctx.lineTo(x, y + r.tl);
  ctx.quadraticCurveTo(x, y, x + r.tl, y);
  ctx.closePath();
}

/** De rits: van de rug bovenaan, rond de rechterkant, tot de rug onderaan. */
function ritsPad(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x, y + h);
}

let ruis: HTMLCanvasElement | null = null;
/** Een fijn patroon voor de structuur van het materiaal (één keer gemaakt). */
function ruisPatroon(): HTMLCanvasElement {
  if (ruis) return ruis;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d")!;
  const d = ctx.createImageData(64, 64);
  let zaad = 7;
  const toeval = () => { zaad = (zaad * 16807) % 2147483647; return zaad / 2147483647; };
  for (let i = 0; i < d.data.length; i += 4) {
    const v = toeval() > 0.5 ? 255 : 0;
    d.data[i] = d.data[i + 1] = d.data[i + 2] = v;
    d.data[i + 3] = Math.round(toeval() * 22);
  }
  ctx.putImageData(d, 0, 0);
  ruis = c;
  return c;
}

/** Tekent de binder op (0, 0) – (BINDER_W, BINDER_H). */
export function tekenBinder(ctx: CanvasRenderingContext2D, kleur: string) {
  const x = 36, y = 30, w = BINDER_W - 66, h = BINDER_H - 60;
  ctx.save();
  // Schaduw op tafel
  ctx.save();
  ctx.shadowColor = "rgba(40, 28, 10, .32)";
  ctx.shadowBlur = 34;
  ctx.shadowOffsetY = 18;
  rondeRect(ctx, x, y, w, h, { tl: 16, tr: 44, br: 44, bl: 16 });
  ctx.fillStyle = kleur;
  ctx.fill();
  ctx.restore();

  // Het vlak met structuur en een zachte glans van linksboven
  rondeRect(ctx, x, y, w, h, { tl: 16, tr: 44, br: 44, bl: 16 });
  ctx.save();
  ctx.clip();
  ctx.fillStyle = kleur;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = ctx.createPattern(ruisPatroon(), "repeat")!;
  ctx.fillRect(x, y, w, h);
  const glans = ctx.createLinearGradient(x, y, x + w, y + h);
  glans.addColorStop(0, "rgba(255, 255, 255, .16)");
  glans.addColorStop(0.45, "rgba(255, 255, 255, .03)");
  glans.addColorStop(1, "rgba(0, 0, 0, .14)");
  ctx.fillStyle = glans;
  ctx.fillRect(x, y, w, h);
  // De rug: geen ringen, een gesloten rug met een vouw
  const rug = 44;
  ctx.fillStyle = meng(kleur, -0.18);
  ctx.fillRect(x, y, rug, h);
  ctx.fillStyle = "rgba(255, 255, 255, .10)";
  ctx.fillRect(x + rug - 3, y, 2, h);
  ctx.fillStyle = "rgba(0, 0, 0, .22)";
  ctx.fillRect(x + rug - 1, y, 3, h);
  ctx.restore();

  // Stiksel langs de rand van het vlak
  ctx.save();
  ctx.setLineDash([9, 7]);
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = isLicht(kleur) ? "rgba(0, 0, 0, .22)" : "rgba(255, 255, 255, .28)";
  rondeRect(ctx, x + rug + 18, y + 30, w - rug - 48, h - 60, { tl: 10, tr: 30, br: 30, bl: 10 });
  ctx.stroke();
  ctx.restore();

  // De rits rondom (boven, rechts, onder): band en tandjes
  ctx.save();
  ritsPad(ctx, x + 30, y + 9, w - 39, h - 18, 36);
  ctx.lineCap = "butt";
  ctx.lineWidth = 15;
  ctx.strokeStyle = meng(kleur, -0.45);
  ctx.stroke();
  ctx.setLineDash([2.6, 2.6]);
  ctx.lineWidth = 8;
  ctx.strokeStyle = isLicht(kleur) ? "rgba(70, 66, 60, .75)" : "rgba(214, 208, 196, .8)";
  ctx.stroke();
  ctx.restore();

  // De trekker van de rits, bovenaan bij de rug
  ctx.save();
  ctx.translate(x + 74, y + 4);
  ctx.rotate(-0.12);
  ctx.fillStyle = meng(kleur, -0.3);
  rondeRect(ctx, -11, -30, 22, 44, { tl: 9, tr: 9, br: 6, bl: 6 });
  ctx.fill();
  ctx.fillStyle = "rgba(255, 255, 255, .18)";
  rondeRect(ctx, -6, -25, 4, 30, { tl: 2, tr: 2, br: 2, bl: 2 });
  ctx.fill();
  ctx.fillStyle = meng(kleur, -0.55);
  ctx.beginPath();
  ctx.arc(0, -18, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.restore();
}

/** Een ontwerp van de klant: als masker (waar inkt komt), klaar om op de binder te zetten. */
export interface Ontwerp {
  masker: HTMLCanvasElement; // wit met alfa = inkt
  breed: number;
  hoog: number;
  omgekeerd: boolean;
}

function laadBeeld(url: string): Promise<HTMLImageElement> {
  return new Promise((ok, fout) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => fout(new Error("Dit bestand kunnen we niet lezen. Probeer een PNG, JPG of SVG."));
    img.src = url;
  });
}

/** Leest een PNG, JPG, WebP of SVG in (een SVG als afbeelding: scripts erin lopen nooit). */
export async function leesOntwerp(bestand: File): Promise<HTMLCanvasElement> {
  if (bestand.size > 12 * 1024 * 1024) throw new Error("Dit bestand is te groot (max. 12 MB).");
  const svg = bestand.type === "image/svg+xml" || /\.svg$/i.test(bestand.name);
  if (!svg && !/^image\/(png|jpeg|webp|gif)$/.test(bestand.type)) throw new Error("Kies een PNG, JPG of SVG.");
  const url = URL.createObjectURL(svg ? new Blob([await bestand.text()], { type: "image/svg+xml" }) : bestand);
  try {
    const img = await laadBeeld(url);
    // Een SVG tekenen we op 1100 px (scherp); een foto verkleinen we tot hoogstens 1100 px.
    const nw = img.naturalWidth || 1000, nh = img.naturalHeight || 1000;
    const doel = svg ? 1100 / Math.max(nw, nh) : Math.min(1, 1100 / Math.max(nw, nh));
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
  const ctx = bron.getContext("2d", { willReadFrequently: true })!;
  const d = ctx.getImageData(0, 0, bron.width, bron.height).data;
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

/** Maakt het masker: donker (of licht, als omgekeerd) wordt inkt; doorzichtig blijft leeg. */
export function maakMasker(bron: HTMLCanvasElement, omgekeerd: boolean): Ontwerp {
  const c = document.createElement("canvas");
  c.width = bron.width;
  c.height = bron.height;
  const d = bron.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, bron.width, bron.height);
  const p = d.data;
  for (let i = 0; i < p.length; i += 4) {
    const lum = (0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2]) / 255;
    const inkt = omgekeerd ? lum : 1 - lum;
    // Wat scherper: bijna wit is geen inkt, bijna zwart is volle inkt.
    const a = Math.min(1, Math.max(0, (inkt - 0.18) / 0.62)) * (p[i + 3] / 255);
    p[i] = p[i + 1] = p[i + 2] = 255;
    p[i + 3] = Math.round(a * 255);
  }
  c.getContext("2d")!.putImageData(d, 0, 0);
  return { masker: c, breed: c.width, hoog: c.height, omgekeerd };
}

export interface Plaatsing { schaal: number; x: number; y: number } // schaal = deel van de breedte van het drukvlak; x, y = midden (0–1)

/** Waar het ontwerp op de tekening komt (in pixels van de tekening). */
export function vakVan(o: Ontwerp, p: Plaatsing) {
  const w = DRUKVLAK.w * p.schaal;
  const h = (w * o.hoog) / o.breed;
  return { x: DRUKVLAK.x + DRUKVLAK.w * p.x - w / 2, y: DRUKVLAK.y + DRUKVLAK.h * p.y - h / 2, w, h };
}

/** Zet het ontwerp in de gekozen inkt op de binder, binnen het drukvlak. */
export function tekenOntwerp(ctx: CanvasRenderingContext2D, o: Ontwerp, p: Plaatsing, inkt: string) {
  const v = vakVan(o, p);
  const laag = document.createElement("canvas");
  laag.width = Math.max(1, Math.round(v.w));
  laag.height = Math.max(1, Math.round(v.h));
  const l = laag.getContext("2d")!;
  l.drawImage(o.masker, 0, 0, laag.width, laag.height);
  l.globalCompositeOperation = "source-in";
  l.fillStyle = inkt;
  l.fillRect(0, 0, laag.width, laag.height);
  ctx.save();
  rondeRect(ctx, DRUKVLAK.x, DRUKVLAK.y, DRUKVLAK.w, DRUKVLAK.h, { tl: 10, tr: DRUKVLAK.r, br: DRUKVLAK.r, bl: 10 });
  ctx.clip();
  // Een fijne schaduw onder de lijnen: gegraveerd, niet geplakt. (shadowBlur werkt ook in oudere Safari; ctx.filter niet.)
  ctx.shadowColor = "rgba(0, 0, 0, .35)";
  ctx.shadowBlur = 1.5;
  ctx.shadowOffsetY = 1.3;
  ctx.globalAlpha = 0.94;
  ctx.drawImage(laag, v.x, v.y, v.w, v.h);
  ctx.restore();
}

/** Het ontwerp als PNG om mee te sturen (zwart op doorzichtig), hoogstens ~440 kB (de database neemt 450.000 tekens). */
export function ontwerpAlsPng(o: Ontwerp): string | null {
  for (const max of [900, 700, 520, 380, 260]) {
    const schaal = Math.min(1, max / Math.max(o.breed, o.hoog));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(o.breed * schaal));
    c.height = Math.max(1, Math.round(o.hoog * schaal));
    const ctx = c.getContext("2d")!;
    ctx.drawImage(o.masker, 0, 0, c.width, c.height);
    ctx.globalCompositeOperation = "source-in";
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, c.width, c.height);
    const url = c.toDataURL("image/png");
    if (url.length <= 440_000) return url;
  }
  return null;
}

/** Het voorbeeld op de binder als JPEG (klein genoeg om mee te sturen). */
export function voorbeeldAlsJpeg(kleur: string, o: Ontwerp | null, p: Plaatsing, inkt: string): string {
  const breed = 540;
  const c = document.createElement("canvas");
  c.width = breed;
  c.height = Math.round((breed * BINDER_H) / BINDER_W);
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#fcebd7";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.scale(breed / BINDER_W, breed / BINDER_W);
  tekenBinder(ctx, kleur);
  if (o) tekenOntwerp(ctx, o, p, inkt);
  for (const q of [0.84, 0.7, 0.55]) {
    const url = c.toDataURL("image/jpeg", q);
    if (url.length <= 240_000) return url;
  }
  return c.toDataURL("image/jpeg", 0.4);
}
