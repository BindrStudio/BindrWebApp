// Labels printen op een Niimbot-printer via Web Bluetooth, met de open-source
// driver in public/vendor/niimbot.js (MIT, github.com/iscarelli/niimbot-web-bluetooth).
import type { Exemplaar } from "../types";
import { laadLabelLogo, labelDataUrl, maatVoor, randtestDataUrl } from "./label";

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
      printImage(url: string, opts: PrintOpties & { copies?: number }): Promise<void>;
      printBatch(urls: string[], opts: PrintOpties): Promise<void>;
      disconnect(): Promise<void> | void;
      WRITE_MODE: null | "fast" | "paced" | "acked";
      PACE_MS: number;
    };
  }
}

interface Size { w_px: number; h_px: number; dpi: number; margin?: number; offset_y_px?: number }
interface PrintOpties { model: Model; size: Size; density: number; offsetY: number; onProgress?: (s: string) => void }

/** Afstelling per toestel (Labels › Proeflabel en afstellen). */
export interface Afstelling {
  donkerte?: number;     // 1–5, standaard 3
  verschuiving?: number; // mm: + = lager op het label, − = hoger
  trager?: boolean;      // gepaced versturen met een langere pauze
}

export const VERSCHUIVING_MAX = 3; // mm, in beide richtingen
/** Pauze tussen twee stukjes data als "trager printen" aan staat (de driver raadt ≥ 16 ms aan op een Mac). */
export const TRAGE_PAUZE = 20;
const STANDAARD_PAUZE = 10;

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
  const size: Size = { w_px: maat.breedte, h_px: maat.hoogte, dpi: m.dpi, margin: sleutel === "b1" ? 8 : 10 };
  if (sleutel === "b1") size.offset_y_px = 4;
  return { size, maat };
}

/** Donkerte en verschuiving zoals de driver ze wil: een geheel getal 1–5 en pixels langs de doorvoer. */
export function printOpties(sleutel: string, labelId: string, a: Afstelling = {}): { size: Size; density: number; offsetY: number } {
  const { size } = printMaat(sleutel, labelId);
  const density = Math.min(5, Math.max(1, Math.round(a.donkerte ?? 3)));
  const mm = Math.min(VERSCHUIVING_MAX, Math.max(-VERSCHUIVING_MAX, a.verschuiving ?? 0));
  const offsetY = (size.offset_y_px ?? 0) + Math.round((mm * size.dpi) / 25.4);
  return { size, density, offsetY };
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
      ? "Op iPhone kan geen enkele gewone browser (ook Chrome niet) Bluetooth gebruiken. Open de app in de gratis browser Bluefy om te printen."
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

/** Stuurt beelden in één opdracht naar de printer, met de afstelling van dit toestel. */
async function stuur(maak: (maat: ReturnType<typeof maatVoor>) => string[], labelId: string, a: Afstelling, voortgang?: (s: string) => void) {
  if (!verbonden) await verbindPrinter();
  const n = window.Niimbot!;
  const sleutel = verbonden!.sleutel;
  const { maat } = printMaat(sleutel, labelId);
  const { size, density, offsetY } = printOpties(sleutel, labelId, a);
  // Trager: elk stukje data met een pauze (tegen lege of halve labels); anders kiest de driver zelf.
  n.WRITE_MODE = a.trager ? "paced" : null;
  n.PACE_MS = a.trager ? TRAGE_PAUZE : STANDAARD_PAUZE;
  const urls = maak(maat);
  const opts: PrintOpties = { model: MODELLEN[sleutel], size, density, offsetY, onProgress: voortgang };
  if (urls.length === 1) await n.printImage(urls[0], opts);
  else await n.printBatch(urls, opts);
}

/** Print één of meerdere labels in één opdracht. */
export async function printLabels(exemplaren: Exemplaar[], labelId: string, voortgang?: (s: string) => void, a: Afstelling = {}): Promise<void> {
  if (!exemplaren.length) return;
  await laadLabelLogo();
  await stuur((maat) => exemplaren.map((ex) => labelDataUrl(ex, maat)), labelId, a, voortgang);
}

/** Een randtest: kader met millimeterstreepjes tot op de rand, om bijsnijden en verschuiving te zien. */
export async function printRandtest(labelId: string, voortgang?: (s: string) => void, a: Afstelling = {}): Promise<void> {
  await stuur((maat) => [randtestDataUrl(maat, a)], labelId, a, voortgang);
}

/** De labelmaat in pixels voor de verbonden printer (of de B1 Pro als er nog geen is). */
export function huidigeMaat(labelId: string) {
  return printMaat(verbonden?.sleutel || "b1pro", labelId).maat;
}
