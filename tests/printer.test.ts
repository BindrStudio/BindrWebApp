// Printer: labelmaat in pixels, donkerte en verschuiving zoals de Niimbot-driver ze wil, en de
// Fichero (Action): het beeld gedraaid naar 96 px, de bytes per label en de antwoorden van de printer.
import { test } from "node:test";
import assert from "node:assert/strict";
import { printOpties } from "../src/lib/printer";
import { maatVoor, verschuivingTekst } from "../src/lib/label";
import { CMD, ficheroDonkerte, ficheroSchuif, isKlaar, labelOpdracht, naarRaster, printerFout, rasterKop, stukjes } from "../src/lib/fichero";

test("B1 Pro: 50 × 15 mm = 576 × 177 px, standaard donkerte 3 zonder verschuiving", () => {
  const o = printOpties("b1pro", "50x15");
  assert.deepEqual([o.size.w_px, o.size.h_px, o.size.dpi, o.density, o.offsetY], [576, 177, 300, 3, 0]);
  // 50 × 30 zoals de driver hem op echte hardware testte (T50x30 = 576 × 354).
  const m = maatVoor(300, "50x30");
  assert.deepEqual([m.breedte, m.hoogte], [576, 354]);
});

test("verschuiving in mm wordt pixels langs de doorvoer; + = lager, − = hoger", () => {
  assert.equal(printOpties("b1pro", "50x15", { verschuiving: 0.5 }).offsetY, 6);
  assert.equal(printOpties("b1pro", "50x15", { verschuiving: -1 }).offsetY, -12);
  assert.equal(printOpties("b1pro", "50x15", { verschuiving: 10 }).offsetY, 35, "hoogstens 3 mm");
  // De gewone B1 schuift standaard 4 px op (zoals in de driver); de verschuiving komt erbij.
  const b1 = printOpties("b1", "50x15", { verschuiving: 0.5 });
  assert.deepEqual([b1.size.w_px, b1.size.h_px, b1.offsetY], [384, 120, 8]);
});

test("donkerte is een geheel getal van 1 tot 5", () => {
  assert.equal(printOpties("b1pro", "50x15", { donkerte: 4 }).density, 4);
  assert.equal(printOpties("b1pro", "50x15", { donkerte: 9 }).density, 5);
  assert.equal(printOpties("b1pro", "50x15", { donkerte: 0 }).density, 1);
  assert.equal(printOpties("b1pro", "50x15", { donkerte: 3.6 }).density, 4);
});

test("verschuiving in woorden", () => {
  assert.equal(verschuivingTekst(0), "0 mm");
  assert.equal(verschuivingTekst(0.5), "0,5 mm lager");
  assert.equal(verschuivingTekst(-1), "1 mm hoger");
  assert.equal(verschuivingTekst(0.5, true), "0,5 mm naar rechts");
  assert.equal(verschuivingTekst(-1.5, true), "1,5 mm naar links");
});

// ── Fichero (Action, 30 × 14 mm) ─────────────────────────────────────────────

/** Een liggend beeld van 240 × 96, wit, met zwarte pixels op de gegeven plaatsen. */
function beeld(zwart: [number, number][], breed = 240, hoog = 96): Uint8ClampedArray {
  const d = new Uint8ClampedArray(breed * hoog * 4).fill(255);
  for (const [x, y] of zwart) { const i = (y * breed + x) * 4; d[i] = d[i + 1] = d[i + 2] = 0; }
  return d;
}
const bit = (r: Uint8Array, rij: number, kol: number) => (r[rij * 12 + (kol >> 3)] >> (7 - (kol & 7))) & 1;

test("Fichero: een wit label is 240 rijen van 12 bytes, allemaal nul", () => {
  const r = naarRaster(beeld([]), 240, 96);
  assert.equal(r.length, 2880);
  assert.ok(r.every((b) => b === 0));
});

test("Fichero: een kwartslag met de klok mee; links op het label komt eerst, boven ligt rechts op de kop", () => {
  // Linksboven (0,0) → rij 0, laatste pixel van de kop (bit 0 van byte 11).
  let r = naarRaster(beeld([[0, 0]]), 240, 96);
  assert.equal(r[11], 0x01);
  assert.equal(bit(r, 0, 95), 1);
  // Rechtsonder (239,95) → laatste rij, eerste pixel van de kop (hoogste bit van byte 0 van die rij).
  r = naarRaster(beeld([[239, 95]]), 240, 96);
  assert.equal(r[239 * 12], 0x80);
  // Een pixel in het midden: (100, 40) → rij 100, kolom 95 − 40 = 55.
  r = naarRaster(beeld([[100, 40]]), 240, 96);
  assert.equal(bit(r, 100, 55), 1);
  assert.equal(r.reduce((n, b) => n + (b ? 1 : 0), 0), 1);
});

test("Fichero: grijs en doorzichtig", () => {
  const d = beeld([]);
  const zet = (x: number, y: number, v: number, a = 255) => { const i = (y * 240 + x) * 4; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = a; };
  zet(1, 0, 120);      // donkergrijs → zwart
  zet(2, 0, 200);      // lichtgrijs → wit
  zet(3, 0, 0, 0);     // doorzichtig → wit
  const r = naarRaster(d, 240, 96);
  assert.deepEqual([bit(r, 1, 95), bit(r, 2, 95), bit(r, 3, 95)], [1, 0, 0]);
});

test("Fichero: verschuiven langs het label (+ = naar rechts), wat eruit valt verdwijnt", () => {
  assert.equal(ficheroSchuif(0.5), 4);
  assert.equal(ficheroSchuif(-1), -8);
  assert.equal(ficheroSchuif(10), 24, "hoogstens 3 mm");
  const r = naarRaster(beeld([[0, 0], [239, 0]]), 240, 96, 4);
  assert.equal(bit(r, 4, 95), 1, "de eerste kolom staat 4 rijen later");
  assert.equal(r.slice(0, 48).every((b) => b === 0), true, "de eerste 4 rijen zijn leeg");
  assert.equal(r.reduce((n, b) => n + (b ? 1 : 0), 0), 1, "de laatste kolom valt van het label");
});

test("Fichero: een lager beeld komt in het midden van de printkop", () => {
  // 240 × 80: 8 px marge aan elke kant van de kop. Boven (y 0) → kolom 95 − 0 − 8 = 87.
  const r = naarRaster(beeld([[0, 0]], 240, 80), 240, 80);
  assert.equal(bit(r, 0, 87), 1);
});

test("Fichero: wat er per label naar de printer gaat", () => {
  const raster = new Uint8Array(2880);
  raster[0] = 0xab;
  const o = labelOpdracht(raster);
  assert.deepEqual(o.map((x) => x.length), [4, 12, 4, 8 + 2880, 2, 4]);
  assert.deepEqual([...o[0]], [0x10, 0xff, 0x84, 0x00], "papier: labels met tussenruimte");
  assert.ok(o[1].every((b) => b === 0), "wakker maken");
  assert.deepEqual([...o[2]], [0x10, 0xff, 0xfe, 0x01], "printen aan (AiYin)");
  assert.deepEqual([...o[3].subarray(0, 8)], [0x1d, 0x76, 0x30, 0x00, 0x0c, 0x00, 0xf0, 0x00], "GS v 0: 12 bytes breed, 240 rijen");
  assert.equal(o[3][8], 0xab);
  assert.deepEqual([...o[4]], [0x1d, 0x0c], "naar het volgende label");
  assert.deepEqual([...o[5]], [0x10, 0xff, 0xfe, 0x45], "stoppen (AiYin)");
  assert.deepEqual([...rasterKop(300)], [0x1d, 0x76, 0x30, 0x00, 0x0c, 0x00, 0x2c, 0x01], "hoogte little-endian");
  assert.deepEqual([...CMD.donkerte(2)], [0x10, 0xff, 0x10, 0x00, 0x02]);
});

test("Fichero: in stukjes van hoogstens 180 bytes", () => {
  const s = stukjes(new Uint8Array(8 + 2880));
  assert.equal(s.length, 17);
  assert.ok(s.every((x) => x.length <= 180));
  assert.equal(s.reduce((n, x) => n + x.length, 0), 2888);
});

test("Fichero: donkerte 1–5 naar licht, normaal, donker", () => {
  assert.deepEqual([1, 2, 3, 4, 5].map((d) => ficheroDonkerte(d)), [0, 0, 1, 2, 2]);
  assert.equal(ficheroDonkerte(), 1);
});

test("Fichero: antwoorden van de printer", () => {
  assert.equal(isKlaar([0x4f, 0x4b]), true);
  assert.equal(isKlaar([0xaa]), true);
  assert.equal(isKlaar([0x00]), false);
  assert.equal(printerFout([0x00], true), null);
  assert.equal(printerFout([0x01], true), null, "bezig met printen is geen fout");
  assert.match(printerFout([0x02], true)!, /klep/);
  assert.match(printerFout([0x04], true)!, /geen labels/);
  assert.match(printerFout([0x40], true)!, /te warm/);
  assert.match(printerFout([0xff, 0x01])!, /te warm/, "in een fout is bit 0 te warm");
  assert.match(printerFout([0xff, 0x04])!, /geen labels/);
  assert.equal(printerFout([0x4f, 0x4b]), null);
});
