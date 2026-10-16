import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchUitPublic } from "./helpers";
import { afbeelding, herken, laadCatalogus, leesKenmerken, zoek } from "../src/lib/catalog";
import { fotoBronnen } from "../src/lib/foto";
import { gedrukt, klassiek30 } from "../src/lib/nummers";

fetchUitPublic();

test("kenmerken uit OCR-tekst", () => {
  const k = leesKenmerken("Charizard V HP 220\nIllus. Ryota Murayama\n153/172 BRS ©2022");
  assert.deepEqual(k.nummers[0], { nummer: "153", totaal: 172 });
  assert.ok(k.codes.includes("BRS"));
  assert.ok(k.woorden.includes("charizard"));
});

test("zoeken op set en nummer, nummer/totaal en naam", async () => {
  const en = await laadCatalogus("en");
  assert.equal(zoek(en, "BRS 153")[0]?.naam, "Charizard V");
  assert.ok(zoek(en, "153/172").some((k) => k.naam === "Charizard V"));
  assert.ok(zoek(en, "gengar vmax").length > 0);
});

test("Japans en Chinees terugvinden", async () => {
  const asia = await laadCatalogus("asia");
  assert.ok(zoek(asia, "ピカチュウ").length > 0, "Japans");
  const zh = zoek(asia, "皮卡丘");
  assert.ok(zh.length > 0, "Chinees");
});

test("foto van Charizard V (BRS 153) wordt zeker herkend", async () => {
  const idx = [await laadCatalogus("en"), await laadCatalogus("asia")];
  const r = herken(idx, "Charizard V HP220 ... 153/172 BRS");
  assert.equal(r.kandidaten[0].kaart.naam, "Charizard V");
  assert.equal(r.kandidaten[0].kaart.nummer, "153");
  assert.ok(r.zeker);
});

test("zoeken op naam met (een deel van) het nummer", async () => {
  const en = await laadCatalogus("en");
  const eerste = (q: string) => zoek(en, q)[0];
  assert.equal(eerste("charizard 153")?.nummer, "153");
  assert.equal(eerste("charizard 153")?.naam, "Charizard V");
  assert.ok(zoek(en, "charizard 15").some((k) => k.nummer === "153" && k.naam === "Charizard V"), "deel van het nummer");
  assert.match(eerste("pikachu 17")?.naam ?? "", /pikachu/i);
  assert.ok(zoek(en, "pikachu 17").slice(0, 3).every((k) => /pikachu/i.test(k.naam)), "naam gaat voor setnaam");
  assert.equal(eerste("gengar vmax 271")?.setCode, "FST");
  assert.ok(zoek(en, "charizard 4/102").some((k) => k.setTotaal === 102 && k.nummer === "4"));
  assert.ok(zoek(en, "mew 151").length > 0, "setnaam 151 blijft werken");
  assert.equal(zoek(en, "PFL 130").length > 0, true);
});

test("30th Celebration: Classic Collection op het gedrukte nummer, Pikachu's ook op 01/30", async () => {
  const en = await laadCatalogus("en");
  // Classic Collection: TCGdex 30th-c-001 is Charizard, gedrukt als 4/102 (Limitless CC2).
  const zard = en.perId.get("30th-c-001")!;
  assert.equal(zard.nummer, "4");
  assert.equal(zard.setTotaal, 102);
  assert.equal(zard.lokaal, "001");
  assert.ok(zoek(en, "4/102").some((k) => k.id === "30th-c-001"), "zoeken op het oude nummer vindt de 30th-versie ook");
  assert.match(afbeelding(zard)!, /\/30th-c\/001\//, "de foto van TCGdex op het eigen nummer");
  // De Pikachu's: 023/128 is ook 01/30.
  const pika = en.perId.get("30th-023")!;
  assert.equal(pika.nummer, "023");
  assert.deepEqual(pika.alias, { nr: "01", totaal: 30 });
  assert.ok(zoek(en, "pikachu 01/30").some((k) => k.id === "30th-023"), "zoeken op 01/30");
  assert.ok(!zoek(en, "01/30").some((k) => k.setId === "30th-c"), "01/30 is geen kaart uit de Classic Collection");
});

test("30th Celebration: de juiste foto (Limitless CC-nummer, niet het oude nummer)", () => {
  assert.deepEqual(klassiek30("30th-c-001"), { cc: 2, nr: "4", totaal: 102 });
  assert.deepEqual(klassiek30("30th-c-014"), { cc: 1, nr: "58", totaal: 102 });
  assert.equal(klassiek30("30th-001"), null);
  assert.deepEqual(gedrukt("30th", "052")?.alias, { nr: "30", totaal: 30 });
  assert.equal(gedrukt("30th", "053"), null, "de Pikachu ex heeft geen tweede nummer");
  const cc = fotoBronnen({ kaart_id: "30th-c-001", set_code: "30C", nummer: "4", afbeelding: "https://assets.tcgdex.net/en/me/30th-c/001/low.webp" });
  assert.match(cc[0], /tpci\/30C\/30C_CC2_R_EN_SM\.png$/);
  assert.ok(!cc.some((u) => /30C_004|30C_001/.test(u)), `nooit een kaart uit de hoofdset: ${cc.join(", ")}`);
  const pika = fotoBronnen({ kaart_id: "30th-023", set_code: "30C", nummer: "023" }, "groot");
  assert.match(pika[0], /tpci\/30C\/30C_023_R_EN_LG\.png$/);
});
