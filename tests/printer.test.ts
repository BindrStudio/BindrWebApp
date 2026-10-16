// Printer: labelmaat in pixels, donkerte en verschuiving zoals de Niimbot-driver ze wil.
import { test } from "node:test";
import assert from "node:assert/strict";
import { printOpties } from "../src/lib/printer";
import { maatVoor, verschuivingTekst } from "../src/lib/label";

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
});
