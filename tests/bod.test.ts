// Inkoop en ruil zoals aan de stand: marktwaarde per kaart, een percentage (65–95%),
// afronden, en wat we per kaart echt betalen. Plus de cijfers per soort op een beurs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchUitPublic } from "./helpers";
import { afgerond, afrondKeuzes, bodBedrag } from "../src/lib/bod";
import { beursOverzicht, regelIn, type Productsoort } from "../src/lib/kassa";
import type { Regel, Transactie } from "../src/types";

const opslag = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = {
  getItem: (k: string) => opslag.get(k) ?? null,
  setItem: (k: string, v: string) => void opslag.set(k, String(v)),
  removeItem: (k: string) => void opslag.delete(k),
  key: () => null,
  length: 0,
};
fetchUitPublic();

test("afronden: op de euro, op 5 euro vanaf 20 euro, nooit naar nul", () => {
  assert.equal(bodBedrag(6.27, 85, { afronding: "exact" }), 5.33);
  assert.equal(bodBedrag(6.27, 85, { afronding: "omlaag" }), 5);
  assert.equal(bodBedrag(6.27, 85, { afronding: "omhoog" }), 6);
  assert.equal(bodBedrag(6.27, 85, { afronding: "omhoog5" }), 6, "onder 20 euro geen 5-euro-afronding");
  assert.equal(bodBedrag(32.8, 75, { afronding: "omhoog" }), 25, "24,60 → 25 voor de klant");
  assert.equal(bodBedrag(32.8, 75, { afronding: "omlaag5" }), 20);
  assert.equal(bodBedrag(0.8, 70, { afronding: "omlaag" }), 0.56, "nooit 0 euro voor een kaart die iets waard is");
  assert.equal(bodBedrag(100, 70, { afronding: "eigen", eigen: 72 }), 72);
  assert.equal(afgerond(70, "omhoog"), 70);
  assert.equal(afgerond(70, "omlaag"), 70);
  assert.deepEqual(afrondKeuzes(24.6).map((k) => k.bedrag), [20, 24, 24.6, 25]);
  // Zelfde bedrag (70% van 100 = 70): de gekozen afronding blijft zichtbaar.
  assert.equal(afrondKeuzes(70, "exact").find((k) => k.bedrag === 70)?.afronding, "exact");
});

test("bod in het mandje: verdeeld volgens marktwaarde, opnieuw berekend als de kaarten wijzigen", async () => {
  const st = await import("../src/state");
  await st.startDemo();
  const kaart = (id: string, code: string) => ({ id, code, naam: `Kaart ${id}`, soort: "kaart" as const });
  st.inMandje(regelIn(kaart("a", "AAAAAA"), 0, 60));
  st.inMandje(regelIn(kaart("b", "BBBBBB"), 0, 40));
  const prijzen = () => st.huidig().mandje.regels.map((r) => r.prijs);
  assert.deepEqual(prijzen(), [42, 28], "standaard inkoop 70%, exact");
  st.zetBod({ pct: 80, afronding: "omlaag" });
  assert.deepEqual(prijzen(), [48, 32]);
  st.bodToepassen(70);
  assert.deepEqual(prijzen(), [42, 28], "eigen bedrag 70 verdeeld 60/40");
  st.verwijderRegel(0);
  assert.equal(st.huidig().mandje.bod?.afronding, "exact", "een kaart weg: het eigen bedrag geldt niet meer");
  assert.deepEqual(prijzen(), [32], "80% van 40");
  const voor = st.huidig().mandje.bod;
  st.mandjeLegen();
  assert.equal(st.huidig().mandje.regels.length, 0);
  const toast = st.huidig().toasts[0];
  toast.actie?.doe();
  assert.deepEqual(st.huidig().mandje.bod, voor, "terugzetten zet ook het bod terug");
  assert.deepEqual(prijzen(), [32]);
});

test("beurs per soort: verkocht, ingekocht, ruil en retour", () => {
  const t = (soort: Transactie["soort"], regels: Regel[], totaal: number, status: Transactie["status"] = "ok"): Transactie =>
    ({ id: Math.random().toString(36), beurs_id: "b", soort, tijd: "2026-10-15T10:00:00Z", regels, totaal, cash: totaal, sumup: 0, status, conflicten: [], opmerking: null });
  const r = (richting: "uit" | "in", naam: string, prijs: number, extra: Partial<Regel> = {}): Regel => ({ richting, naam, prijs, ...extra });
  const soort: Record<string, Productsoort> = { Pikachu: "kaarten", "Binder Gengar": "binders", Deckbox: "3d-prints", Booster: "sealed", Slab: "slabs" };
  const o = beursOverzicht([
    t("verkoop", [r("uit", "Pikachu", 10), r("uit", "Binder Gengar", 45, { artikel_id: "x", aantal: 1 }), r("uit", "Booster", 12, { artikel_id: "y", aantal: 2 })], 67),
    t("verkoop", [r("uit", "Slab", 300)], 300),
    t("verkoop", [r("uit", "Pikachu", 5)], 5, "ongedaan"),
    t("inkoop", [r("in", "Pikachu", 8), r("in", "Pikachu", 4)], -12),
    t("ruil", [r("uit", "Pikachu", 20), r("in", "Pikachu", 15), r("in", "Pikachu", 10)], -5),
    t("retour", [r("uit", "Deckbox", 12)], -12),
  ], (x) => soort[x.naam]);
  assert.deepEqual(o.verkocht.kaarten, { aantal: 1, bedrag: 10 }, "ongedaan telt niet mee");
  assert.deepEqual(o.verkocht.binders, { aantal: 1, bedrag: 45 });
  assert.deepEqual(o.verkocht.sealed, { aantal: 2, bedrag: 12 });
  assert.deepEqual(o.verkocht.slabs, { aantal: 1, bedrag: 300 });
  assert.deepEqual(o.verkochtTotaal, { aantal: 5, bedrag: 367 });
  assert.deepEqual(o.ingekocht, { aantal: 2, bedrag: 12 });
  assert.deepEqual(o.trades, { aantal: 1, weg: 1, binnen: 2, bijbetaaldDoorKlant: 0, bijbetaaldDoorOns: 5 });
  assert.deepEqual(o.retour, { aantal: 1, bedrag: 12 });
});
