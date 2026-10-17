// Een eigen foto (van een binder of een sealed product): verkleind tot een kleine JPEG
// als data-URL, zodat ze gewoon in de rij van het artikel past en ook offline bewaard
// wordt. De database aanvaardt enkel "data:image/…" van hoogstens ~450 kB.

import { achtergrondWeg, kader, rechtzetten } from "./uitknippen";

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

export { achtergrondWeg } from "./uitknippen";

/**
 * Een foto zonder achtergrond (een uitgeknipte binder, een logo): de doorzichtigheid blijft (WebP, of PNG in Safari),
 * en de lege rand errond gaat eraf, zodat elke binder even groot in de waaier staat. Heeft de foto een vlakke
 * achtergrond of een zacht verloop (een logo op crème, een binder op een wit blad of fotobord), dan halen we die eerst
 * weg (`weggehaald`). Met `rechtzetten` (binders) trekken we een scheve of schuin gefotografeerde binder ook recht
 * (`rechtgezet`). Anders een JPEG zoals gewoonlijk (doorzichtig = false: het beheer zegt het dan).
 */
export async function verkleinUitgeknipt(
  bestand: Blob, max = 900, maxTekens = 450_000, opties: { rechtzetten?: boolean } = {},
): Promise<{ url: string; doorzichtig: boolean; weggehaald: boolean; rechtgezet: boolean }> {
  const img = await laadBeeld(bestand);
  // Werken op hoogstens `max` pixels (scherp genoeg, en de toverstaf blijft snel).
  const s0 = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const w0 = Math.max(1, Math.round(img.naturalWidth * s0)), h0 = Math.max(1, Math.round(img.naturalHeight * s0));
  const werk = document.createElement("canvas");
  werk.width = w0; werk.height = h0;
  const wctx = werk.getContext("2d", { willReadFrequently: true })!;
  wctx.drawImage(img, 0, 0, w0, h0);
  let d: ImageData = wctx.getImageData(0, 0, w0, h0);
  let leeg = 0;
  for (let i = 3; i < d.data.length; i += 4) if (d.data[i] < 245) leeg++;
  let doorzichtig = leeg > w0 * h0 * 0.02;
  let weggehaald = false, rechtgezet = false;
  if (!doorzichtig && achtergrondWeg(d)) {
    wctx.putImageData(d, 0, 0);
    doorzichtig = weggehaald = true;
  }
  if (doorzichtig && opties.rechtzetten) {
    const r = rechtzetten(d);
    if (r) {
      werk.width = r.width; werk.height = r.height;
      d = new ImageData(r.data, r.width, r.height);
      wctx.putImageData(d, 0, 0);
      rechtgezet = true;
    }
  }
  const w = werk.width, h = werk.height;
  // Bijsnijden tot het onderwerp, met een klein randje (voor de schaduw).
  let sx = 0, sy = 0, sw = w, sh = h;
  if (doorzichtig) {
    const k = kader(d);
    if (!k) throw new Error("Deze foto is helemaal doorzichtig.");
    const rand = Math.round(0.012 * Math.max(w, h));
    sx = Math.max(0, k.x - rand); sy = Math.max(0, k.y - rand);
    sw = Math.min(w, k.x + k.w + rand) - sx; sh = Math.min(h, k.y + k.h + rand) - sy;
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
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(werk, sx, sy, sw, sh, 0, 0, c.width, c.height);
    const url = doorzichtig ? (png ? c.toDataURL("image/png") : c.toDataURL("image/webp", 0.86)) : c.toDataURL("image/jpeg", 0.8);
    if (url.length <= limiet) return { url, doorzichtig, weggehaald, rechtgezet };
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
