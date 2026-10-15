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
