import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchUitPublic } from "./helpers";
import { herken, laadCatalogus, leesKenmerken, zoek } from "../src/lib/catalog";

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
