import { test } from "node:test";
import assert from "node:assert/strict";
import { drempelVoor, prijscheck, rondEuro, STANDAARD_INSTELLINGEN, verdeelTotaal, voorstelVoor } from "../src/lib/pricing";
import type { Exemplaar } from "../src/types";
import type { Prijsgids } from "../src/lib/prices";

test("combo-korting wordt verdeeld in verhouding, op de cent", () => {
  assert.deepEqual(verdeelTotaal([12, 14], 25), [11.54, 13.46]);
  assert.deepEqual(verdeelTotaal([12, 13], 24), [11.52, 12.48]);
  // D3 uit de testcase: de afrondingscent gaat naar de duurste kaart
  assert.deepEqual(verdeelTotaal([3, 3, 5], 10), [2.73, 2.73, 4.54]);
  const r = verdeelTotaal([1358, 54, 3], 1300);
  assert.equal(Math.round(r.reduce((a, b) => a + b, 0) * 100), 130000);
});

test("afronden op hele euro, minimum 1 euro", () => {
  assert.equal(rondEuro(0.2), 1);
  assert.equal(rondEuro(4.49), 4);
  assert.equal(rondEuro(4.5), 5);
});

test("drempels per prijsklasse", () => {
  const i = STANDAARD_INSTELLINGEN;
  assert.equal(drempelVoor(3, i), 1);
  assert.equal(drempelVoor(12, i), 2);
  assert.equal(drempelVoor(54, i), 5);
  assert.equal(drempelVoor(218, i), 10);
});

const ex = (w: Partial<Exemplaar>): Exemplaar => ({
  id: "x", code: "AAAAAA", soort: "kaart", kaart_id: null, catalogus: null, afbeelding: null, naam: "Test",
  naam_origineel: null, set_naam: null, set_code: null, nummer: null, taal: "EN", conditie: "NM", variant: "normaal",
  grader: null, grade: null, cardmarket_id: 1, opslag: "vitrine", status: "in voorraad", gereserveerd_voor: null,
  verkoopprijs: 10, prijs_handmatig: false, hartjesprijs: 10, hartjesdatum: "2026-10-01", aankoopprijs: null,
  aankoopdatum: null, aankoopbron: null, label_status: "gestickerd", opmerking: null, aangemaakt_op: "", gewijzigd_op: "", ...w,
});
const gids: Prijsgids = { datum: "2026-10-15", prijzen: new Map([[1, [20, 15, 19, 30, 25, 29]]]) };

test("voorstel volgt conditie, taal en holo", () => {
  const i = STANDAARD_INSTELLINGEN;
  assert.equal(voorstelVoor(ex({}), gids, i)?.voorstel, 20);
  assert.equal(voorstelVoor(ex({ conditie: "LP" }), gids, i)?.voorstel, 14);
  assert.equal(voorstelVoor(ex({ variant: "reverse holo" }), gids, i)?.voorstel, 30);
  assert.equal(voorstelVoor(ex({ taal: "DE" }), gids, i), null);
  assert.equal(voorstelVoor(ex({ taal: "JP" }), gids, i)?.voorstel, 20);
  assert.equal(voorstelVoor(ex({ soort: "slab" }), gids, i), null);
});

test("prijscheck slaat stockdoos, slotjes en kleine verschillen over", () => {
  const i = STANDAARD_INSTELLINGEN;
  const lijst = prijscheck([
    ex({ id: "a", hartjesprijs: 15 }),                       // 20 vs 15, drempel 2 → ja
    ex({ id: "b", hartjesprijs: 19 }),                       // verschil 1 → nee
    ex({ id: "c", hartjesprijs: 15, prijs_handmatig: true }), // slotje → nee
    ex({ id: "d", hartjesprijs: 15, opslag: "stockdoos" }),   // stockdoos → nee
    ex({ id: "e", hartjesprijs: 15, status: "verkocht" }),    // niet meer in voorraad → nee
  ], gids, i);
  assert.deepEqual(lijst, [{ id: "a", oud: 15, nieuw: 20, richting: "op" }]);
});
