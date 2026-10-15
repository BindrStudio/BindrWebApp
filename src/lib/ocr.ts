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

/** Zwart-wit met meer contrast: helpt bij de kleine tekst onderaan een kaart. */
function voorbereid(bron: HTMLCanvasElement, sx: number, sy: number, sw: number, sh: number, schaal: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = Math.round(sw * schaal);
  c.height = Math.round(sh * schaal);
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bron, sx, sy, sw, sh, 0, 0, c.width, c.height);
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const v = g < 140 ? 0 : 255;
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** Leest de tekst van de hele kaart en, scherper, van de onderste strook met set en nummer. */
export async function leesKaart(foto: HTMLCanvasElement, voortgang?: (s: string) => void): Promise<string> {
  voortgang?.("Tekstherkenning laden…");
  const w = await worker();
  voortgang?.("Kaart lezen…");
  const { width: W, height: H } = foto;
  const onder = voorbereid(foto, 0, Math.round(H * 0.82), W, Math.round(H * 0.18), 2);
  const geheel = voorbereid(foto, 0, 0, W, H, Math.min(1, 1400 / Math.max(W, H)));
  const a = await w.recognize(onder);
  const b = await w.recognize(geheel);
  return `${a.data.text}\n${b.data.text}`;
}
