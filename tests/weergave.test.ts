// Catalogusweergave: dubbels samen, filters, sorteren, bod en Cardmarket-info.
import { test } from "node:test";
import assert from "node:assert/strict";
import { artikelZichtbaar, groepeer, groepSleutel, pastFilters, perSet, setIdVan, sorteer, type Toonbaar, type Snelfilter } from "../src/lib/weergave";
import { bodVoorstellen, marktwaarde, pasBodToe, procentVan } from "../src/lib/bod";
import { cardmarketLink, grapje, marktinfo, richtingVan, setTrend } from "../src/lib/markt";
import type { Prijsgids } from "../src/lib/prices";
import type { Regel } from "../src/types";

const kaart = (x: Partial<Toonbaar>): Toonbaar => ({
  kaart_id: "me02-130", soort: "kaart", naam: "Charizard ex", set_naam: "Phantasmal Flames", set_code: "PFL", nummer: "130",
  taal: "EN", conditie: "NM", variant: "normaal", grader: null, grade: null, prijs: 40, toegevoegd: "2026-10-10", ...x,
});

test("dubbels: zelfde kaart, conditie en prijs = één tegel; andere conditie of prijs apart", () => {
  const lijst = [kaart({}), kaart({}), kaart({ conditie: "EX" }), kaart({ prijs: 38 }), kaart({ taal: "JP" })];
  const g = groepeer(lijst, groepSleutel);
  assert.deepEqual(g.map((x) => x.items.length), [2, 1, 1, 1]);
});

test("filters: binnen een groep 'of', tussen groepen 'en'", () => {
  const nu = Date.parse("2026-10-15T12:00:00Z");
  const en = kaart({ prijs: 5 }), jp = kaart({ taal: "JP", prijs: 60 }), de = kaart({ taal: "DE", prijs: 3, toegevoegd: "2026-08-01" });
  const f = (...x: Snelfilter[]) => [en, jp, de].filter((k) => pastFilters(k, new Set(x), nu)).map((k) => k.taal);
  assert.deepEqual(f("en", "jp"), ["EN", "JP"]);
  assert.deepEqual(f("en", "onder10"), ["EN"]);
  assert.deepEqual(f("andere"), ["DE"]);
  assert.deepEqual(f("nieuw"), ["EN", "JP"]);
  assert.deepEqual(f("vanaf50"), ["JP"]);
});

test("sorteren per set: nieuwste set eerst, dan op nummer", () => {
  const sets = { me02: ["Phantasmal Flames", "PFL", "2025-11-14"], sv03: ["Obsidian Flames", "OBF", "2023-08-11"] } as const;
  const lijst = [
    kaart({ kaart_id: "sv03-125", set_naam: "Obsidian Flames", nummer: "125" }),
    kaart({ kaart_id: "me02-20", nummer: "20" }),
    kaart({ kaart_id: "me02-3", nummer: "3" }),
  ];
  const s = sorteer(lijst, "set", (k) => k, sets as never);
  assert.deepEqual(s.map((k) => k.kaart_id), ["me02-3", "me02-20", "sv03-125"]);
  assert.deepEqual(perSet(s, (k) => k).map((x) => [x.naam, x.items.length]), [["Phantasmal Flames", 2], ["Obsidian Flames", 1]]);
  assert.equal(setIdVan({ kaart_id: "sv03.5-001", nummer: "001", set_code: null, set_naam: null }), "sv03.5");
});

test("sorteren: nieuw binnen en prijs", () => {
  const a = kaart({ naam: "A", prijs: 10, toegevoegd: "2026-10-01" });
  const b = kaart({ naam: "B", prijs: 30, toegevoegd: "2026-10-12T09:00:00Z" });
  const c = kaart({ naam: "C", prijs: 20, toegevoegd: null });
  assert.deepEqual(sorteer([a, b, c], "nieuw", (k) => k).map((k) => k.naam), ["B", "A", "C"]);
  assert.deepEqual(sorteer([a, b, c], "prijs-laag", (k) => k).map((k) => k.naam), ["A", "C", "B"]);
});

test("bod: 70% van 183 = 128,10 → voorstellen 125, 128, 130; verdeeld op de cent", () => {
  assert.deepEqual(bodVoorstellen(128.1), [125, 128, 130]);
  assert.deepEqual(bodVoorstellen(146.4), [145, 146, 150]);
  assert.deepEqual(bodVoorstellen(1023.4), [1020, 1023, 1030]);
  assert.deepEqual(bodVoorstellen(3.5), [3, 3.5, 4]);
  assert.deepEqual(bodVoorstellen(7.17), [7, 7.5, 8]);
  assert.deepEqual(bodVoorstellen(9.8, 9.9), [9, 9.5], "nooit boven de marktwaarde");
  const regels: Regel[] = [
    { richting: "uit", naam: "Onze kaart", prijs: 50, exemplaar_id: "x" },
    { richting: "in", naam: "A", prijs: 0, referentie: 100 },
    { richting: "in", naam: "B", prijs: 0, referentie: 50 },
    { richting: "in", naam: "C", prijs: 0, referentie: 33 },
    { richting: "in", naam: "Zonder prijs", prijs: 4 },
  ];
  const m = marktwaarde(regels);
  assert.equal(m.totaal, 183);
  assert.equal(m.kaarten, 3);
  assert.equal(m.zonder, 1);
  const na = pasBodToe(regels, 128);
  assert.deepEqual(na.map((r) => r.prijs), [50, 69.95, 34.97, 23.08, 4]);
  assert.equal(marktwaarde(na).bod, 128);
  assert.equal(procentVan(128, 183), 70);
  assert.equal(procentVan(130, 183), 71);
});

test("Cardmarket: richting, grapje, set-trend en link met filters", () => {
  const gids: Prijsgids = {
    datum: "2026-10-15",
    prijzen: new Map([
      [1, [10, 8, 10, null, null, null, 13, 12.5]],  // week 12,5 tegenover maand 10: +25%
      [2, [5.2, 4, 5]],                               // geen week: trend 5,2 tegenover 5: +4%
      [3, [0.2, 0.1, 0.3]],                           // te goedkoop om iets te zeggen
      [4, [9, 7, 10, null, null, null, 8, 8.5]],
      [5, [20, 18, 20, null, null, null, 19, 19]],
      [6, [3, 2, 3]],
    ]),
  };
  assert.equal(marktinfo(1, "normaal", gids)?.richting, "hard-op");
  assert.equal(marktinfo(2, "normaal", gids)?.richting, "stabiel");
  assert.equal(marktinfo(2, "normaal", gids)?.basis, "trend");
  assert.equal(marktinfo(3, "normaal", gids)?.richting, null);
  assert.equal(richtingVan(-0.1), "neer");
  assert.equal(grapje("stabiel", 42), grapje("stabiel", 42), "altijd hetzelfde grapje voor dezelfde kaart");
  const st = setTrend([1, 2, 3, 4, 5, 6], gids)!;
  assert.equal(st.kaarten, 6);
  assert.equal(Math.round(st.verandering * 1000), Math.round(((12.5 + 5.2 + 0.2 + 8.5 + 19 + 3) / (10 + 5 + 0.3 + 10 + 20 + 3) - 1) * 1000));
  assert.equal(cardmarketLink(512600, "EN"), "https://www.cardmarket.com/en/Pokemon/Products?idProduct=512600&language=1&minCondition=2&sellerCountry=2,23");
  assert.match(cardmarketLink(1, "JP", ["NL"]), /language=7&minCondition=2&sellerCountry=23$/);
});

test("artikels op de klantenpagina: per stuk aan of uit, anders catalogus en binders", () => {
  const a = (x: Partial<Parameters<typeof artikelZichtbaar>[0]>) => artikelZichtbaar({ opslag: "stockdoos", aantal: 2, prijs: 10, details: { type: "3d-print" }, zichtbaar: null, ...x });
  assert.equal(a({}), false, "3D-print in de vault: standaard niet");
  assert.equal(a({ opslag: "vitrine" }), true, "in de catalogus: standaard wel");
  assert.equal(a({ details: { type: "binder" } }), true, "binders altijd, ook in de vault");
  assert.equal(a({ zichtbaar: true }), true, "zelf aangezet");
  assert.equal(a({ opslag: "vitrine", zichtbaar: false }), false, "zelf uitgezet");
  assert.equal(a({ zichtbaar: true, prijs: null }), false, "zonder prijs nooit");
  assert.equal(a({ zichtbaar: true, aantal: 0 }), false, "uitverkocht nooit");
});

test("set van een kaart: ook de 30th Celebration Classic Collection (gedrukt nummer ≠ eigen nummer)", () => {
  assert.equal(setIdVan({ kaart_id: "30th-c-001", nummer: "4", set_code: "30C", set_naam: "30th Classic Collection" }), "30th-c");
  assert.equal(setIdVan({ kaart_id: "30th-023", nummer: "023", set_code: "30C", set_naam: "30th Celebration" }), "30th");
  assert.equal(setIdVan({ kaart_id: null, nummer: "12", set_code: "PFL", set_naam: null }), "PFL");
});
