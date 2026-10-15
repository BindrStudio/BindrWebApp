// Tekst lezen van een foto van een kaart, op het toestel zelf, met Tesseract.js
// (dezelfde aanpak als Pocketdrop). Wordt bij de eerste scan van het CDN geladen en
// daarna door de service worker bewaard.
const TESS_SRC = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";

interface Worker {
  recognize(img: HTMLCanvasElement): Promise<{ data: { text: string } }>;
  setParameters(p: Record<string, string>): Promise<unknown>;
}
declare global {
  interface Window {
    Tesseract?: { createWorker(lang: string): Promise<Worker> };
  }
}

let laden: Promise<Worker> | null = null;

function laadScript(src: string): Promise<void> {
  return new Promise((ok, fout) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => ok();
    s.onerror = () => fout(new Error("De tekstherkenning kon niet geladen worden. De eerste keer is internet nodig."));
    document.head.appendChild(s);
  });
}

function worker(): Promise<Worker> {
  if (!laden) {
    laden = (async () => {
      if (!window.Tesseract) await laadScript(TESS_SRC);
      const w = await window.Tesseract!.createWorker("eng");
      return w;
    })();
    laden.catch(() => { laden = null; });
  }
  return laden;
}

/** Laadt de tekstherkenning alvast (bv. thuis, voor de beurs zonder wifi). */
export async function laadOcr(): Promise<void> {
  await worker();
}

/** Drempel volgens Otsu: scheidt tekst en achtergrond, ook bij een donkere of felle kaart. */
export function otsu(grijs: Uint8ClampedArray | number[]): number {
  const hist = new Array(256).fill(0);
  for (const g of grijs) hist[g]++;
  const n = grijs.length;
  let somAlles = 0;
  for (let i = 0; i < 256; i++) somAlles += i * hist[i];
  let somA = 0, wA = 0, beste = 0, drempel = 127;
  for (let t = 0; t < 256; t++) {
    wA += hist[t];
    if (!wA) continue;
    const wB = n - wA;
    if (!wB) break;
    somA += t * hist[t];
    const mA = somA / wA, mB = (somAlles - somA) / wB;
    const tussen = wA * wB * (mA - mB) ** 2;
    if (tussen > beste) { beste = tussen; drempel = t; }
  }
  return drempel;
}

/**
 * Een stuk van de kaart, vergroot en zwart-wit (Otsu). Is de achtergrond donker (witte tekst,
 * bv. full-art), dan keren we om: Tesseract leest het best zwarte tekst op wit.
 */
function voorbereid(bron: HTMLCanvasElement, sx: number, sy: number, sw: number, sh: number, schaal: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(sw * schaal));
  c.height = Math.max(1, Math.round(sh * schaal));
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bron, sx, sy, sw, sh, 0, 0, c.width, c.height);
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  const grijs = new Uint8ClampedArray(d.length / 4);
  let som = 0;
  for (let i = 0, j = 0; i < d.length; i += 4, j++) {
    grijs[j] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    som += grijs[j];
  }
  const drempel = otsu(grijs);
  const donker = som / grijs.length < drempel; // meer donker dan licht: lichte tekst op donker
  for (let i = 0, j = 0; i < d.length; i += 4, j++) {
    let v = grijs[j] < drempel ? 0 : 255;
    if (donker) v = 255 - v;
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

const EEN_REGEL = { tessedit_pageseg_mode: "7", tessedit_char_whitelist: "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz/ " };
const VRIJ = { tessedit_pageseg_mode: "11", tessedit_char_whitelist: "" };

/** Staat er een kaartnummer met totaal in (bv. 125/197)? Dan is de rest niet meer nodig. */
const heeftNummer = (t: string) => /\d{1,3}\s*[/|]\s*\d{2,3}/.test(t);

/**
 * Leest eerst de strook onderaan (links bij nieuwe kaarten, rechts bij oudere) en de naam
 * bovenaan, vergroot en regel per regel. Enkel als daar geen nummer in staat, de hele kaart.
 */
export async function leesKaart(foto: HTMLCanvasElement, voortgang?: (s: string) => void): Promise<string> {
  voortgang?.("Tekstherkenning laden…");
  const w = await worker();
  voortgang?.("Kaart lezen…");
  const { width: W, height: H } = foto;
  const schaal = Math.max(2, Math.min(4, 900 / W)); // tekst groot genoeg (± 25 px hoog)
  const stroken = [
    voorbereid(foto, 0, Math.round(H * 0.88), Math.round(W * 0.55), Math.round(H * 0.12), schaal),       // linksonder: SV/SWSH
    voorbereid(foto, Math.round(W * 0.45), Math.round(H * 0.88), Math.round(W * 0.55), Math.round(H * 0.12), schaal), // rechtsonder: ouder
    voorbereid(foto, 0, Math.round(H * 0.82), W, Math.round(H * 0.08), schaal * 0.75),                    // net daarboven (sommige oudere layouts)
  ];
  const teksten: string[] = [];
  await w.setParameters(EEN_REGEL);
  // Stoppen zodra een strook een nummer heeft: elke herkenning kost op een gsm ± een seconde.
  for (const s of stroken) {
    teksten.push((await w.recognize(s)).data.text);
    if (heeftNummer(teksten[teksten.length - 1])) break;
  }
  // De naam zonder filter op tekens (Ho-Oh, Farfetch'd, Flabébé).
  await w.setParameters({ tessedit_pageseg_mode: "7", tessedit_char_whitelist: "" });
  const naam = voorbereid(foto, Math.round(W * 0.05), Math.round(H * 0.03), Math.round(W * 0.7), Math.round(H * 0.08), Math.max(1.5, schaal * 0.6));
  teksten.push((await w.recognize(naam)).data.text);
  if (!teksten.some(heeftNummer)) {
    await w.setParameters(VRIJ);
    const geheel = voorbereid(foto, 0, 0, W, H, Math.min(1, 1400 / Math.max(W, H)));
    teksten.push((await w.recognize(geheel)).data.text);
  }
  return teksten.join("\n");
}
