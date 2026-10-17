// Een eigen foto (van een binder of een sealed product): verkleind tot een kleine JPEG
// als data-URL, zodat ze gewoon in de rij van het artikel past en ook offline bewaard
// wordt. De database aanvaardt enkel "data:image/…" van hoogstens ~450 kB.

const MAX_TEKENS = 440_000;

function laadBeeld(bestand: Blob): Promise<HTMLImageElement> {
  return new Promise((ok, fout) => {
    const url = URL.createObjectURL(bestand);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); ok(img); };
    img.onerror = () => { URL.revokeObjectURL(url); fout(new Error("Deze foto kan niet gelezen worden. Probeer een JPEG of PNG.")); };
    img.src = url;
  });
}

/** Verkleint een foto (de browser draait ze zelf rechtop) tot hoogstens `max` pixels. */
export async function verkleinFoto(bestand: Blob, max = 720): Promise<string> {
  const img = await laadBeeld(bestand);
  for (const [maat, kwaliteit] of [[max, 0.76], [max, 0.66], [Math.round(max * 0.75), 0.68], [Math.round(max * 0.55), 0.62]] as const) {
    const schaal = Math.min(1, maat / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(img.naturalWidth * schaal));
    c.height = Math.max(1, Math.round(img.naturalHeight * schaal));
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#fff"; // doorzichtige PNG's: witte achtergrond in plaats van zwart
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const url = c.toDataURL("image/jpeg", kwaliteit);
    if (url.length <= MAX_TEKENS) return url;
  }
  throw new Error("Deze foto is te groot, ook verkleind. Probeer een andere.");
}

/**
 * Haalt een vlakke achtergrond weg, vanaf de rand (zoals een toverstaf): enkel wat met de rand verbonden is en bijna
 * de kleur van de achtergrond heeft. Wat binnen een omlijning ligt (de crèmekleurige letters van ons logo) blijft dus.
 * De pixels op de rand worden half doorzichtig, met hun kleur zonder de achtergrond (geen lichte rand op een andere
 * achtergrond). Geeft false als de rand niet vlak is (een gewone foto): dan verandert er niets.
 */
export function achtergrondWeg(d: ImageData, hard = 40, zacht = 60): boolean {
  const { width: w, height: h, data: px } = d;
  const randIdx: number[] = [];
  for (let x = 0; x < w; x++) randIdx.push(x, (h - 1) * w + x);
  for (let y = 1; y < h - 1; y++) randIdx.push(y * w, y * w + w - 1);
  // De kleur van de achtergrond: de mediaan van de rand, per kanaal.
  const mediaan = (k: number) => { const v = randIdx.map((i) => px[i * 4 + k]).sort((a, b) => a - b); return v[v.length >> 1]; };
  const bg = [mediaan(0), mediaan(1), mediaan(2)];
  const afst = (i: number) => Math.hypot(px[i * 4] - bg[0], px[i * 4 + 1] - bg[1], px[i * 4 + 2] - bg[2]);
  if (randIdx.filter((i) => afst(i) < 30).length < randIdx.length * 0.9) return false;
  const weg = new Uint8Array(w * h);
  const rij = new Int32Array(w * h);
  let kop = 0, staart = 0;
  for (const i of randIdx) if (!weg[i] && afst(i) < hard) { weg[i] = 1; rij[staart++] = i; }
  while (kop < staart) {
    const i = rij[kop++];
    const x = i % w;
    for (const j of [i - w, i + w, x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1]) {
      if (j >= 0 && j < w * h && !weg[j] && afst(j) < hard) { weg[j] = 1; rij[staart++] = j; }
    }
  }
  for (let i = 0; i < w * h; i++) {
    if (weg[i]) { px[i * 4 + 3] = 0; continue; }
    const x = i % w;
    const naast = (i >= w && weg[i - w]) || (i < w * (h - 1) && weg[i + w]) || (x > 0 && weg[i - 1]) || (x < w - 1 && weg[i + 1]);
    if (!naast) continue;
    const a = Math.min(1, Math.max(0, (afst(i) - 18) / zacht));
    if (a <= 0.02) { px[i * 4 + 3] = 0; continue; }
    for (let k = 0; k < 3; k++) px[i * 4 + k] = Math.min(255, Math.max(0, Math.round((px[i * 4 + k] - (1 - a) * bg[k]) / a)));
    px[i * 4 + 3] = Math.round(a * px[i * 4 + 3]);
  }
  return true;
}

/**
 * Een foto zonder achtergrond (een uitgeknipte binder, een logo): de doorzichtigheid blijft (WebP, of PNG in Safari),
 * en de lege rand errond gaat eraf, zodat elke binder even groot in de waaier staat. Heeft de foto een vlakke
 * achtergrond (een logo op crème, een binder op een wit blad), dan halen we die eerst weg (`weggehaald`). Anders een
 * JPEG zoals gewoonlijk (doorzichtig = false: het beheer zegt het dan).
 */
export async function verkleinUitgeknipt(bestand: Blob, max = 900, maxTekens = 450_000): Promise<{ url: string; doorzichtig: boolean; weggehaald: boolean }> {
  const img = await laadBeeld(bestand);
  // Werken op hoogstens `max` pixels (scherp genoeg, en de toverstaf blijft snel).
  const s0 = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * s0)), h = Math.max(1, Math.round(img.naturalHeight * s0));
  const werk = document.createElement("canvas");
  werk.width = w; werk.height = h;
  const wctx = werk.getContext("2d", { willReadFrequently: true })!;
  wctx.drawImage(img, 0, 0, w, h);
  const d = wctx.getImageData(0, 0, w, h);
  let leeg = 0;
  for (let i = 3; i < d.data.length; i += 4) if (d.data[i] < 245) leeg++;
  let doorzichtig = leeg > w * h * 0.02;
  let weggehaald = false;
  if (!doorzichtig && achtergrondWeg(d)) {
    wctx.putImageData(d, 0, 0);
    doorzichtig = weggehaald = true;
  }
  // Bijsnijden tot het onderwerp, met een klein randje (voor de schaduw).
  let sx = 0, sy = 0, sw = w, sh = h;
  if (doorzichtig) {
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (d.data[(y * w + x) * 4 + 3] > 16) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    if (x1 < x0) throw new Error("Deze foto is helemaal doorzichtig.");
    const rand = Math.round(0.012 * Math.max(w, h));
    sx = Math.max(0, x0 - rand); sy = Math.max(0, y0 - rand);
    sw = Math.min(w, x1 + 1 + rand) - sx; sh = Math.min(h, y1 + 1 + rand) - sy;
  }
  // Safari maakt geen WebP: een PNG is wel tien keer groter, dus dan kleiner (de waaier toont ze hoogstens 220 px breed).
  const webp = (() => { const t = document.createElement("canvas"); t.width = t.height = 1; return t.toDataURL("image/webp").startsWith("data:image/webp"); })();
  const png = doorzichtig && !webp;
  const grootste = png ? Math.min(Math.max(sw, sh), 600) : Math.max(sw, sh);
  const limiet = png ? Math.min(maxTekens, 380_000) : maxTekens;
  for (const maat of [grootste, Math.round(grootste * 0.85), Math.round(grootste * 0.72), Math.round(grootste * 0.6), Math.round(grootste * 0.5)]) {
    const schaal = Math.min(1, maat / Math.max(sw, sh));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(sw * schaal)); c.height = Math.max(1, Math.round(sh * schaal));
    const ctx = c.getContext("2d")!;
    if (!doorzichtig) { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); }
    ctx.drawImage(werk, sx, sy, sw, sh, 0, 0, c.width, c.height);
    const url = doorzichtig ? (png ? c.toDataURL("image/png") : c.toDataURL("image/webp", 0.86)) : c.toDataURL("image/jpeg", 0.8);
    if (url.length <= limiet) return { url, doorzichtig, weggehaald };
  }
  throw new Error("Deze foto is te groot, ook verkleind. Probeer een andere.");
}

/** Enkel echte afbeeldingen tonen (nooit een willekeurige link uit de database). */
const goedgekeurd = new Set<string>(); // al nagekeken (de regex over 400 kB niet bij elke render)
export function veiligeFoto(f: string | null | undefined): string | null {
  if (typeof f !== "string") return null;
  if (goedgekeurd.has(f)) return f;
  if (!/^data:image\/(jpeg|png|webp);base64,[a-z0-9+/=]+$/i.test(f)) return null;
  if (goedgekeurd.size > 200) goedgekeurd.clear();
  goedgekeurd.add(f);
  return f;
}
