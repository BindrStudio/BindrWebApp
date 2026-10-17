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
 * Een foto zonder achtergrond (een uitgeknipte binder, een logo): de doorzichtigheid blijft (WebP, of PNG in Safari),
 * en de lege rand errond gaat eraf, zodat elke binder even groot in de waaier staat. Heeft de foto toch een
 * achtergrond, dan een JPEG zoals gewoonlijk (doorzichtig = false: het beheer zegt het dan).
 */
export async function verkleinUitgeknipt(bestand: Blob, max = 900, maxTekens = 690_000): Promise<{ url: string; doorzichtig: boolean }> {
  const img = await laadBeeld(bestand);
  const w = img.naturalWidth, h = img.naturalHeight;
  // Op een kleine kopie: hoeveel is doorzichtig, en waar staat het onderwerp?
  const k = Math.min(1, 360 / Math.max(w, h));
  const kc = document.createElement("canvas");
  kc.width = Math.max(1, Math.round(w * k)); kc.height = Math.max(1, Math.round(h * k));
  const kctx = kc.getContext("2d", { willReadFrequently: true })!;
  kctx.drawImage(img, 0, 0, kc.width, kc.height);
  const px = kctx.getImageData(0, 0, kc.width, kc.height).data;
  let leeg = 0, x0 = kc.width, y0 = kc.height, x1 = -1, y1 = -1;
  for (let y = 0; y < kc.height; y++) {
    for (let x = 0; x < kc.width; x++) {
      const a = px[(y * kc.width + x) * 4 + 3];
      if (a < 245) leeg++;
      if (a > 16) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
  }
  const doorzichtig = leeg > kc.width * kc.height * 0.02 && x1 >= x0;
  // Bijsnijden tot het onderwerp, met een klein randje (voor de schaduw).
  let sx = 0, sy = 0, sw = w, sh = h;
  if (doorzichtig) {
    const rand = 0.015 * Math.max(kc.width, kc.height);
    sx = Math.max(0, (x0 - rand) / k); sy = Math.max(0, (y0 - rand) / k);
    sw = Math.min(w, (x1 + 1 + rand) / k) - sx; sh = Math.min(h, (y1 + 1 + rand) / k) - sy;
  }
  for (const maat of [max, Math.round(max * 0.85), Math.round(max * 0.7), Math.round(max * 0.58), Math.round(max * 0.48)]) {
    const schaal = Math.min(1, maat / Math.max(sw, sh));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(sw * schaal)); c.height = Math.max(1, Math.round(sh * schaal));
    const ctx = c.getContext("2d")!;
    if (!doorzichtig) { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); }
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
    let url: string;
    if (doorzichtig) {
      url = c.toDataURL("image/webp", 0.86);
      if (!url.startsWith("data:image/webp")) url = c.toDataURL("image/png"); // Safari maakt geen WebP
    } else {
      url = c.toDataURL("image/jpeg", 0.8);
    }
    if (url.length <= maxTekens) return { url, doorzichtig };
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
