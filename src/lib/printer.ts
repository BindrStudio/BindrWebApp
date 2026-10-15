// Labels printen op een Niimbot-printer via Web Bluetooth, met de open-source
// driver in public/vendor/niimbot.js (MIT, github.com/iscarelli/niimbot-web-bluetooth).
import type { Exemplaar } from "../types";
import { labelDataUrl, maatVoor } from "./label";

interface Model {
  label: string;
  id: number;
  dpi: number;
  task: string;
  density: number;
  label_type: number;
  speed: number;
  name_prefixes: string[];
}

declare global {
  interface Window {
    Niimbot?: {
      isSupported(): boolean;
      identify(model: Partial<Model>): Promise<{ modelId: number; label: string; task: string; dpi: number } | null>;
      printImage(url: string, opts: { model: Model; size: Size; onProgress?: (s: string) => void; copies?: number }): Promise<void>;
      printBatch(urls: string[], opts: { model: Model; size: Size; onProgress?: (s: string) => void }): Promise<void>;
      disconnect(): Promise<void> | void;
    };
  }
}

interface Size { w_px: number; h_px: number; dpi: number; margin?: number }

// Uit registry.json van de driver (B1 Pro en B1 zijn op echte hardware getest).
const MODELLEN: Record<string, Model> = {
  b1pro: { label: "Niimbot B1 Pro", id: 4097, dpi: 300, task: "v4", density: 3, label_type: 1, speed: 1, name_prefixes: ["B1"] },
  b1: { label: "Niimbot B1", id: 4096, dpi: 203, task: "b1", density: 3, label_type: 1, speed: 1, name_prefixes: ["B1"] },
};

// Labelmaat: standaard 50 × 15 mm. Nog niet op hardware gevalideerd: de breedte volgt de
// 50 × 30-maat uit de driver (576 px op 300 dpi, 384 px op 203 dpi); de B1 schuift 4 px op,
// net als in de registry van de driver.
function printMaat(sleutel: string, labelId: string): { size: Size; maat: ReturnType<typeof maatVoor> } {
  const m = MODELLEN[sleutel];
  const maat = maatVoor(m.dpi, labelId);
  const size: Size & { offset_y_px?: number } = { w_px: maat.breedte, h_px: maat.hoogte, dpi: m.dpi, margin: sleutel === "b1" ? 8 : 10 };
  if (sleutel === "b1") size.offset_y_px = 4;
  return { size, maat };
}

let verbonden: { sleutel: string; label: string } | null = null;

export function bluetoothMogelijk(): boolean {
  return !!(navigator as Navigator & { bluetooth?: unknown }).bluetooth && !!window.Niimbot;
}

export function isIphone(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent);
}

export function printerNaam(): string | null {
  return verbonden ? verbonden.label : null;
}

/** Verbindt met de printer (opent de Bluetooth-keuze) en herkent het model. */
export async function verbindPrinter(): Promise<string> {
  if (!window.Niimbot) throw new Error("Printerdriver niet geladen");
  if (!bluetoothMogelijk()) {
    throw new Error(isIphone()
      ? "Safari kan geen Bluetooth gebruiken. Open de app in de gratis browser Bluefy om te printen."
      : "Deze browser kan geen Bluetooth gebruiken. Gebruik Chrome.");
  }
  const info = await window.Niimbot.identify({ name_prefixes: ["B1"] });
  const sleutel = info && info.modelId === 4096 ? "b1" : "b1pro";
  verbonden = { sleutel, label: info?.label || MODELLEN[sleutel].label };
  return verbonden.label;
}

export async function ontkoppelPrinter() {
  try { await window.Niimbot?.disconnect(); } catch { /* al los */ }
  verbonden = null;
}

/** Print één of meerdere labels in één opdracht. */
export async function printLabels(exemplaren: Exemplaar[], labelId: string, voortgang?: (s: string) => void): Promise<void> {
  if (!exemplaren.length) return;
  if (!verbonden) await verbindPrinter();
  const sleutel = verbonden!.sleutel;
  const { size, maat } = printMaat(sleutel, labelId);
  const urls = exemplaren.map((ex) => labelDataUrl(ex, maat));
  const opts = { model: MODELLEN[sleutel], size, onProgress: voortgang };
  if (urls.length === 1) await window.Niimbot!.printImage(urls[0], opts);
  else await window.Niimbot!.printBatch(urls, opts);
}

/** De labelmaat in pixels voor de verbonden printer (of de B1 Pro als er nog geen is). */
export function huidigeMaat(labelId: string) {
  return printMaat(verbonden?.sleutel || "b1pro", labelId).maat;
}
