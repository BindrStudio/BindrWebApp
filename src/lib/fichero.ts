// Labels printen op de Fichero-labelprinter van Action (een AiYin D11s) via Web Bluetooth.
// Eigen driver, geschreven naar de protocolbeschrijving van github.com/0xMH/fichero-printer
// (MIT; uit de officiële app gehaald). Printkop: 96 px breed (12 mm) op 203 dpi. Een label van
// 30 × 14 mm loopt in de lengte door de printer: 240 rijen van 96 px. Wij tekenen het label
// liggend (240 × 96, zoals je het leest) en draaien het een kwartslag voor de printer.
//
// Per label: papier = labels met tussenruimte (10 FF 84 00), wakker maken (12 × 00), printen aan
// (10 FF FE 01), het beeld (1D 76 30 00 0C 00 F0 00 + 2880 bytes, 1 bit per pixel, links = hoogste
// bit, 1 = zwart), naar het volgende label (1D 0C) en stoppen (10 FF FE 45, dan wachten op "OK" of AA).
// Donkerte één keer per opdracht: 10 FF 10 00 nn (0 licht, 1 normaal, 2 donker).

/** Breedte van de printkop in pixels (= 12 bytes per rij). */
export const FICHERO_KOP = 96;
export const FICHERO_DPI = 203;
/** Hoogstens zoveel bytes per keer naar de printer (past ook in een kleine Bluetooth-MTU, bv. op een iPhone). */
export const FICHERO_STUK = 180;

const B = (...x: number[]) => Uint8Array.from(x);
export const CMD = {
  status: B(0x10, 0xff, 0x40),
  papierLabels: B(0x10, 0xff, 0x84, 0x00),
  wakker: new Uint8Array(12),
  aan: B(0x10, 0xff, 0xfe, 0x01),
  volgende: B(0x1d, 0x0c),
  stop: B(0x10, 0xff, 0xfe, 0x45),
  donkerte: (n: number) => B(0x10, 0xff, 0x10, 0x00, n),
};

/** Onze donkerte 1–5 (zoals bij de Niimbot) naar de drie standen van de Fichero: 1–2 licht, 3 normaal, 4–5 donker. */
export function ficheroDonkerte(d = 3): 0 | 1 | 2 {
  const n = Math.round(d);
  return n <= 2 ? 0 : n === 3 ? 1 : 2;
}

/** Verschuiving in mm langs het label (+ = naar rechts) naar pixels. */
export function ficheroSchuif(mm = 0): number {
  return Math.round((Math.max(-3, Math.min(3, mm)) * FICHERO_DPI) / 25.4);
}

/**
 * Een liggend beeld (RGBA, `breed` × `hoog`, met `hoog` ≤ 96) naar het raster van de printer:
 * een kwartslag met de klok mee, zodat de linkerkant van het label eerst uit de printer komt.
 * Rij r van de printer = kolom r van het beeld; de bovenkant van het beeld ligt rechts op de kop.
 * `schuif` (px) schuift het beeld langs het label (+ = later, naar rechts als je het label leest).
 * Zwart = donkerder dan `drempel` (0–255) en niet doorzichtig.
 */
export function naarRaster(rgba: ArrayLike<number>, breed: number, hoog: number, schuif = 0, drempel = 160): Uint8Array {
  const perRij = FICHERO_KOP / 8;
  const uit = new Uint8Array(perRij * breed);
  const boven = Math.max(0, Math.floor((FICHERO_KOP - hoog) / 2)); // een lager beeld komt in het midden van de kop
  for (let r = 0; r < breed; r++) {
    const x = r - schuif;
    if (x < 0 || x >= breed) continue;
    for (let c = 0; c < FICHERO_KOP; c++) {
      const y = FICHERO_KOP - 1 - c - boven;
      if (y < 0 || y >= hoog) continue;
      const i = (y * breed + x) * 4;
      if (rgba[i + 3] < 128) continue;
      const licht = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
      if (licht < drempel) uit[r * perRij + (c >> 3)] |= 0x80 >> (c & 7);
    }
  }
  return uit;
}

/** De kop van het beeld: GS v 0, normaal, 12 bytes breed, `rijen` hoog (little-endian). */
export function rasterKop(rijen: number): Uint8Array {
  return B(0x1d, 0x76, 0x30, 0x00, FICHERO_KOP / 8, 0x00, rijen & 0xff, (rijen >> 8) & 0xff);
}

/** Wat er voor één label naar de printer gaat, in volgorde (zonder de pauzes). */
export function labelOpdracht(raster: Uint8Array): Uint8Array[] {
  const rijen = raster.length / (FICHERO_KOP / 8);
  const beeld = new Uint8Array(8 + raster.length);
  beeld.set(rasterKop(rijen));
  beeld.set(raster, 8);
  return [CMD.papierLabels, CMD.wakker, CMD.aan, beeld, CMD.volgende, CMD.stop];
}

/** In stukjes van hoogstens `max` bytes. */
export function stukjes(data: Uint8Array, max = FICHERO_STUK): Uint8Array[] {
  const uit: Uint8Array[] = [];
  for (let i = 0; i < data.length; i += max) uit.push(data.subarray(i, i + max));
  return uit;
}

/** "OK" of AA: de printer is klaar met het label. */
export const isKlaar = (b: number[]) => b[0] === 0xaa || (b[0] === 0x4f && b[1] === 0x4b);

/** Een foutmelding van de printer (FF nn, of de statusbyte), in gewone woorden; null = in orde. */
export function printerFout(b: number[], status = false): string | null {
  const x = status ? b[0] : b[0] === 0xff ? b[1] : 0;
  if (!x) return null;
  // Klep en papier hebben in beide dezelfde bit; te warm is 0x10/0x40 in de status en 0x01 in een fout.
  if (x & 0x02) return "De klep van de printer staat open. Sluit hem en probeer opnieuw.";
  if (x & 0x04) return "Er zitten geen labels in de printer, of de rol zit niet goed. Leg de rol opnieuw in.";
  if (x & (status ? 0x50 : 0x01)) return "De printer is te warm. Wacht een minuutje en probeer opnieuw.";
  return null;
}

// ── Web Bluetooth ────────────────────────────────────────────────────────────

// Wat we van Web Bluetooth gebruiken (de types zitten niet in elke TypeScript-bibliotheek).
interface Kenmerk extends EventTarget {
  properties: { write?: boolean; writeWithoutResponse?: boolean };
  value?: DataView;
  writeValueWithoutResponse?(v: BufferSource): Promise<void>;
  writeValueWithResponse?(v: BufferSource): Promise<void>;
  writeValue(v: BufferSource): Promise<void>;
  startNotifications(): Promise<Kenmerk>;
}
interface Dienst { getCharacteristic(uuid: string): Promise<Kenmerk> }
interface Gatt { connected: boolean; connect(): Promise<Gatt>; disconnect(): void; getPrimaryService(uuid: string): Promise<Dienst> }
interface Toestel extends EventTarget { name?: string; gatt?: Gatt }
interface Bt { requestDevice(o: unknown): Promise<Toestel> }

const lang = (k: string) => `0000${k}-0000-1000-8000-00805f9b34fb`;
// De printer biedt hetzelfde op meer diensten; we nemen de eerste die er is.
const DIENSTEN = [
  { dienst: lang("18f0"), schrijf: lang("2af1"), lees: lang("2af0") },
  { dienst: lang("ff00"), schrijf: lang("ff02"), lees: lang("ff01") },
];

const slaap = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
const bt = () => (navigator as Navigator & { bluetooth?: Bt }).bluetooth;

let toestel: Toestel | null = null;
let schrijf: Kenmerk | null = null;
let ontvangen: number[] = [];
let wacht: (() => void) | null = null;
let lees: Kenmerk | null = null; // het kenmerk waarop we luisteren (bij opnieuw verbinden eerst los)

function opAntwoord(e: Event) {
  const v = (e.target as Kenmerk).value;
  if (v) for (let i = 0; i < v.byteLength; i++) ontvangen.push(v.getUint8(i));
  wacht?.();
}

/** Opent de Bluetooth-keuze (enkel printers die als Fichero of D11 heten) en verbindt. Geeft de naam. */
export async function verbindFichero(): Promise<string> {
  const b = bt();
  if (!b?.requestDevice) throw new Error("Deze browser kan geen Bluetooth gebruiken. Gebruik Chrome (of Bluefy op een iPhone).");
  toestel = await b.requestDevice({
    filters: [{ namePrefix: "FICHERO" }, { namePrefix: "Fichero" }, { namePrefix: "D11" }, { services: [DIENSTEN[0].dienst] }],
    optionalServices: DIENSTEN.map((d) => d.dienst),
  });
  toestel.addEventListener("gattserverdisconnected", () => { schrijf = null; });
  await koppel();
  return toestel.name?.trim() || "Fichero";
}

async function koppel() {
  if (!toestel?.gatt) throw new Error("Geen printer gekozen");
  const gatt = toestel.gatt.connected ? toestel.gatt : await toestel.gatt.connect();
  let laatste: unknown = null;
  for (const d of DIENSTEN) {
    try {
      const dienst = await gatt.getPrimaryService(d.dienst);
      const s = await dienst.getCharacteristic(d.schrijf);
      const l = await dienst.getCharacteristic(d.lees);
      lees?.removeEventListener("characteristicvaluechanged", opAntwoord);
      l.addEventListener("characteristicvaluechanged", opAntwoord);
      lees = l;
      await l.startNotifications();
      schrijf = s;
      return;
    } catch (e) { laatste = e; }
  }
  throw new Error(`Deze printer antwoordt niet zoals een Fichero (${laatste instanceof Error ? laatste.message : "geen dienst"}).`);
}

export function ficheroVerbonden(): boolean {
  return !!(schrijf && toestel?.gatt?.connected);
}

export async function ontkoppelFichero() {
  try { toestel?.gatt?.disconnect(); } catch { /* al los */ }
  lees?.removeEventListener("characteristicvaluechanged", opAntwoord);
  toestel = null;
  schrijf = null;
  lees = null;
}

async function stuur(data: Uint8Array, pauze: number) {
  const s = schrijf!;
  for (const stuk of stukjes(data)) {
    const kopie = stuk.slice(); // een eigen buffer per stukje
    if (s.properties.writeWithoutResponse && s.writeValueWithoutResponse) await s.writeValueWithoutResponse(kopie);
    else if (s.writeValueWithResponse) await s.writeValueWithResponse(kopie);
    else await s.writeValue(kopie);
    if (data.length > FICHERO_STUK) await slaap(pauze);
  }
}

/** Stuurt een opdracht en wacht (hoogstens `ms`) op een antwoord dat aan `klaar` voldoet. null = geen antwoord. */
async function vraag(data: Uint8Array, ms: number, klaar: (b: number[]) => boolean = (b) => b.length > 0, pauze = 20): Promise<number[] | null> {
  ontvangen = [];
  const antwoord = new Promise<number[] | null>((ok) => {
    const t = setTimeout(() => { wacht = null; ok(null); }, ms);
    wacht = () => {
      if (ontvangen[0] === 0xff && ontvangen.length >= 2) { clearTimeout(t); wacht = null; ok([...ontvangen]); return; }
      if (klaar(ontvangen)) { clearTimeout(t); wacht = null; setTimeout(() => ok([...ontvangen]), 50); }
    };
  });
  await stuur(data, pauze);
  return antwoord;
}

/**
 * Print de rasters (één per label) na elkaar. `pauze` = ms tussen twee stukjes beeld (trager = langer).
 * Gooit een fout in gewone woorden als de printer zegt dat er iets mis is.
 */
export async function printFichero(rasters: Uint8Array[], donkerte: 0 | 1 | 2, pauze = 20, voortgang?: (s: string) => void): Promise<void> {
  if (!toestel) throw new Error("Verbind eerst met de Fichero");
  if (!ficheroVerbonden()) await koppel();
  const st = await vraag(CMD.status, 1500);
  const f = st && (st[0] === 0xff ? printerFout(st) : printerFout(st, true));
  if (f) throw new Error(f);
  const d = await vraag(CMD.donkerte(donkerte), 1500, isKlaar);
  if (d && printerFout(d)) throw new Error(printerFout(d)!);
  await slaap(100);
  for (let i = 0; i < rasters.length; i++) {
    voortgang?.(rasters.length > 1 ? `${i + 1} van ${rasters.length}` : "bezig");
    const [papier, wakker, aan, beeld, volgende, stop] = labelOpdracht(rasters[i]);
    for (const c of [papier, wakker, aan]) { await stuur(c, pauze); await slaap(50); }
    await stuur(beeld, pauze);
    await slaap(500);
    await stuur(volgende, pauze);
    await slaap(300);
    const r = await vraag(stop, 30_000, isKlaar);
    if (r && printerFout(r)) throw new Error(printerFout(r)!);
    // Geen antwoord: de officiële app gaat dan ook gewoon door met het volgende label.
  }
  voortgang?.("ok");
}
