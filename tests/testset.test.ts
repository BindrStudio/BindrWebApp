import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fetchUitPublic } from "./helpers";
import { laadTestset, leesCsv } from "../src/lib/testset";
import { prijscheck, STANDAARD_INSTELLINGEN } from "../src/lib/pricing";
import type { Prijsgids } from "../src/lib/prices";
import type { Exemplaar } from "../src/types";

fetchUitPublic();

test("testset: vitrine en artikelen zoals in de testcase (B4, vóór A5)", async () => {
  const { exemplaren, artikelen } = await laadTestset();
  const vitrine = exemplaren.filter((e) => e.opslag === "vitrine");
  assert.equal(vitrine.length, 85);
  assert.equal(vitrine.reduce((s, e) => s + (e.hartjesprijs ?? 0), 0), 7719);
  assert.equal(artikelen.filter((a) => a.opslag === "vitrine").reduce((s, a) => s + (a.prijs ?? 0) * (a.aantal ?? 0), 0), 238);
  assert.equal(exemplaren.filter((e) => e.label_status === "te printen").length, 8);
  assert.equal(new Set(exemplaren.map((e) => e.code)).size, exemplaren.length, "elke code uniek");
});

test("prijscheck geeft precies de 6 kaarten uit A4", async () => {
  // Prijzen uit de testset zelf, zodat de test niet verandert met de nachtelijke prijsgids.
  const rijen = leesCsv(await readFile("public/data/testset.csv", "utf8"));
  const prijzen = new Map<number, (number | null)[]>();
  const n = (s: string) => (s ? Number(s) : null);
  for (const r of rijen) if (r.cardmarket_id && r.cm_trend) prijzen.set(Number(r.cardmarket_id), [n(r.cm_trend), n(r.cm_laagste), n(r.cm_gem30)]);
  const gids: Prijsgids = { datum: "2026-10-15", prijzen };

  const { exemplaren } = await laadTestset();
  const ex = exemplaren.map((e, i) => ({ ...e, id: String(i) })) as Exemplaar[];
  const lijst = prijscheck(ex, gids, STANDAARD_INSTELLINGEN);
  const perCode = Object.fromEntries(lijst.map((t) => {
    const e = ex.find((x) => x.id === t.id)!;
    return [e.code, `${t.oud}->${t.nieuw}`];
  }));
  assert.deepEqual(perCode, {
    EYNNPM: "3->4", CXEPPT: "2->1", J5A4HD: "2->1", HQ5GA2: "8->6", T57H73: "218->180", "0J68VC": "1358->1080",
  });
});
