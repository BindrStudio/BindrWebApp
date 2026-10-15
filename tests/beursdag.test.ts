// De volledige "Testcase beursdag" uit het framework (v0.4), op de rekenkern van de kassa.
// Als deze test slaagt, kloppen kassa, voorraad en samenvatting met de verwachte bedragen.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchUitPublic } from "./helpers";
import { laadTestset } from "../src/lib/testset";
import { standaardArtikel, standaardExemplaar } from "../src/lib/exemplaar";
import {
  beursCijfers, losConflictOp, maakOngedaan, nieuweRetour, nieuweTransactie, pasToe, pasTotaalAan,
  regelArtikelIn, regelArtikelUit, regelIn, regelUit, stand, type Betaling, type Voorraad,
} from "../src/lib/kassa";
import { nieuweCode } from "../src/lib/code";
import { uuid } from "../src/lib/uuid";
import type { Regel, Transactie } from "../src/types";

fetchUitPublic();

test("testcase beursdag: kassa, voorraad en samenvatting", async () => {
  const set = await laadTestset();
  let v: Voorraad = {
    exemplaren: set.exemplaren.map((r) => standaardExemplaar(r, "2026-10-01T10:00:00Z")),
    artikelen: set.artikelen.map((r) => standaardArtikel(r)),
  };
  const transacties: Transactie[] = [];
  const codes = new Set(v.exemplaren.map((e) => e.code));
  const ex = (code: string) => {
    const e = v.exemplaren.find((x) => x.code === code.replace("-", ""));
    assert.ok(e, `exemplaar ${code} bestaat`);
    return e!;
  };
  const art = (naam: string) => {
    const a = v.artikelen.find((x) => x.naam.startsWith(naam));
    assert.ok(a, `artikel ${naam} bestaat`);
    return a!;
  };
  const wijzig = (code: string, w: object) => {
    const e = ex(code);
    v = { ...v, exemplaren: v.exemplaren.map((x) => (x.id === e.id ? { ...x, ...w } : x)) };
  };
  const nieuweKaart = (naam: string, extra: object = {}) => {
    const code = nieuweCode(codes);
    codes.add(code);
    return { id: uuid(), code, naam, conditie: "NM", ...extra };
  };
  let klok = Date.parse("2026-10-18T09:00:00Z");
  const boek = (regels: Regel[], b: Betaling) => {
    klok += 60_000;
    const t = nieuweTransactie(regels, b, "beurs-gent", null, new Date(klok).toISOString());
    const r = pasToe(v, t);
    v = r.voorraad;
    transacties.push(r.transactie);
    return r.transactie;
  };
  const cash = (n: number): Betaling => ({ cash: n, sumup: 0 });
  const sumup = (n: number): Betaling => ({ cash: 0, sumup: n });

  // A5: zes nieuwe hartjes
  for (const [code, prijs] of [["EYN-NPM", 4], ["CXE-PPT", 1], ["J5A-4HD", 1], ["HQ5-GA2", 6], ["T57-H73", 180], ["0J6-8VC", 1080]] as const) {
    wijzig(code, { hartjesprijs: prijs, hartjesdatum: "2026-10-17" });
  }
  // B4: stand bij de start
  const start = stand(v);
  assert.deepEqual(start, { catalogus: 85, catalogusWaarde: 7400, artikelenWaarde: 238, voorraad: 105 });
  const beurs = { startkas: 150 };

  // C. Verkopen
  boek([regelUit(ex("FYA-Y74"))], cash(50));
  boek([regelUit(ex("EGH-0JA"))], sumup(26));
  boek([regelUit(ex("7FV-EDH"))], cash(60)); // SumUp geweigerd, toch cash
  boek([regelUit(ex("2Y9-YS7"))], { cash: 50, sumup: 80 });
  boek([regelUit(ex("EPX-R3M"))], cash(6));
  boek([regelUit(ex("AS3-4XT"))], sumup(25));
  boek([regelArtikelUit(art("Booster pack Pitch Black")), regelArtikelUit(art("3D-print deckbox"))], cash(19));
  boek([regelUit(ex("KRG-PWF"))], cash(15));
  assert.equal(art("Booster pack Pitch Black").aantal, 5);
  assert.equal(art("3D-print deckbox").aantal, 3);

  // D. Onderhandelen
  boek([regelUit(ex("YG4-AFZ"), 10)], cash(10));
  const d2 = pasTotaalAan([regelUit(ex("AK5-T86")), regelUit(ex("TBV-4GF"))], "uit", 24);
  assert.deepEqual(d2.map((r) => r.prijs), [11.52, 12.48]);
  boek(d2, sumup(24));
  const d3 = pasTotaalAan([regelUit(ex("N02-E7H")), regelUit(ex("7W2-PX2")), regelUit(ex("TQW-C3T"))], "uit", 10);
  assert.deepEqual(d3.map((r) => r.prijs), [2.73, 2.73, 4.54]);
  boek(d3, cash(10));
  boek([regelUit(ex("EAM-VNM"), 440)], sumup(440));
  assert.equal(ex("EAM-VNM").hartjesprijs, 476, "hartjesprijs blijft bewaard");

  // E. Ruilen
  boek([regelUit(ex("2QW-2C2")), regelIn(nieuweKaart("Ruilkaart 1"), 15)], cash(0));
  boek([regelUit(ex("GXJ-TGD")), regelIn(nieuweKaart("Ruilkaart 2"), 20), regelIn(nieuweKaart("Ruilkaart 3"), 10)], cash(24));
  boek([regelUit(ex("Z78-0R5")), regelIn(nieuweKaart("Ruilkaart 4"), 70)], cash(-54));
  const e4 = pasTotaalAan([
    regelUit(ex("KAR-CW5")),
    regelIn(nieuweKaart("Ruilkaart 5"), 0, 30), regelIn(nieuweKaart("Ruilkaart 6"), 0, 20), regelIn(nieuweKaart("Ruilkaart 7"), 0, 10),
  ], "in", 45);
  assert.deepEqual(e4.filter((r) => r.richting === "in").map((r) => r.prijs), [22.5, 15, 7.5]);
  boek(e4, cash(0));
  boek([regelArtikelUit(art("3D-print toploaderstandaard")), regelIn(nieuweKaart("Ruilkaart 8"), 10)], cash(-2));
  assert.equal(art("3D-print toploaderstandaard").aantal, 4);

  // F. Inkopen
  boek([1, 2, 3, 4, 5].map((i) => regelIn(nieuweKaart(`Inkoop ${i}`), [6, 5, 5, 4, 4][i - 1], 8)), cash(-24));
  boek([regelIn(nieuweKaart("Inkoop LP", { conditie: "LP" }), 30, 48)], cash(-30));
  boek([regelArtikelIn(art("Bulkkaarten"), 50, 5)], cash(-5));
  assert.equal(art("Bulkkaarten").aantal, 350);
  boek([regelIn(nieuweKaart("Chinese kaart", { taal: "CN-T" }), 8)], cash(-8));
  const inkoopLp = v.exemplaren.find((e) => e.naam === "Inkoop LP")!;
  assert.equal(inkoopLp.aankoopprijs, 30);
  assert.equal(inkoopLp.opslag, "stockdoos");
  assert.equal(inkoopLp.label_status, "te printen");

  // G. Uitzonderingen
  assert.equal(ex("XS7-6TS").status, "gereserveerd");
  boek([regelUit(ex("XS7-6TS"))], cash(13)); // G2: reservatie opgehaald
  const g3 = boek([regelUit(ex("C99-983"))], cash(18));
  const terug = maakOngedaan(v, g3); // G3: binnen 5 seconden ongedaan
  v = terug.voorraad;
  transacties[transacties.indexOf(g3)] = terug.transactie;
  assert.equal(ex("C99-983").status, "in voorraad");
  { // G4: de klant brengt de deckbox uit C7 terug en krijgt 12 euro cash
    const r = nieuweRetour([{ ...regelArtikelUit(art("3D-print deckbox")), prijs: 12 }], 12, "beurs-gent", new Date(klok += 60_000).toISOString());
    const res = pasToe(v, r);
    v = res.voorraad;
    transacties.push(res.transactie);
  }
  assert.equal(art("3D-print deckbox").aantal, 4, "G4: deckbox terug");

  // G5: twee toestellen verkopen offline hetzelfde exemplaar; het tweede was eigenlijk XT6-6CZ
  boek([regelUit(ex("BWC-7YR"))], cash(6));
  const dubbel = boek([{ ...regelUit(ex("BWC-7YR")) }], cash(6));
  assert.equal(dubbel.status, "conflict");
  const opgelost = losConflictOp(v, dubbel, ex("BWC-7YR").id, ex("XT6-6CZ").id);
  v = opgelost.voorraad;
  transacties[transacties.indexOf(dubbel)] = opgelost.transactie;
  assert.equal(opgelost.transactie.status, "ok");
  assert.equal(ex("XT6-6CZ").status, "verkocht");

  // G7: eigen prijs op de beurs
  wijzig("0J6-8VC", { hartjesprijs: 1150, prijs_handmatig: true });
  // G8: kaart uit de vault naar de catalogus, hartje 60, verkocht
  assert.equal(ex("6RX-Y19").opslag, "stockdoos");
  wijzig("6RX-Y19", { opslag: "vitrine", hartjesprijs: 60, hartjesdatum: "2026-10-18" });
  boek([regelUit(ex("6RX-Y19"))], cash(60));

  // H. Afsluiting
  const c = beursCijfers(beurs, transacties);
  assert.equal(c.kasVerwacht, 344, "cash in de cashkoffer");
  assert.equal(c.sumup, 595, "SumUp");
  assert.equal(c.verkocht, 18);
  assert.equal(c.weggeruild, 4);
  assert.equal(c.nieuwViaRuil, 8);
  assert.equal(c.nieuwViaInkoop, 7);
  assert.equal(c.conflicten, 0);
  const einde = stand(v);
  assert.equal(einde.voorraad, 98, "exemplaren in voorraad 105 → 98");
  assert.equal(einde.catalogus, 64);
  assert.equal(einde.catalogusWaarde, 6479);
});
