// Storecredit (tegoed), verzendkosten bij een online verkoop en reserveren (0.16): de bonnen, betalen met
// een bon, de boekhouding (dagontvangsten, kosten, open bonnen op 31/12) en een gereserveerde kaart.
import { test } from "node:test";
import assert from "node:assert/strict";
import { betalingKlopt, maakOngedaan, nieuweRetour, nieuweTransactie, pasToe, regelVerzending } from "../src/lib/kassa";
import { bonCode, openBonnen, openTegoedOp, tegoedbonnen, verdeelOverBonnen, zoekBonnen } from "../src/lib/tegoed";
import { dagontvangsten, dexxterLijnen, kostenLijnen } from "../src/lib/boekhouding";
import { actieveReservering, reserveringVerlopen } from "../src/lib/exemplaar";
import type { Exemplaar, Regel, Transactie } from "../src/types";

const kaartIn = (naam: string, prijs: number, referentie: number): Regel => ({ richting: "in", naam, prijs, referentie, nieuw: { id: `n-${naam}`, naam } as Regel["nieuw"] });
const kaartUit = (id: string, prijs: number): Regel => ({ richting: "uit", exemplaar_id: id, naam: `Kaart ${id}`, code: id, prijs });
const ex = (id: string, w: Partial<Exemplaar> = {}): Exemplaar => ({
  id, code: id, soort: "kaart", naam: `Kaart ${id}`, status: "in voorraad", opslag: "vitrine", label_status: "gestickerd",
  taal: "EN", variant: "normaal", conditie: "NM", aangemaakt_op: "2026-10-01T10:00:00Z", ...w,
} as Exemplaar);

// Het voorbeeld: Jonas brengt kaarten van € 30 binnen en vraagt tegoed; we geven € 25. Later koopt hij een kaart van € 25.
const bon = nieuweTransactie([kaartIn("Pikachu", 25, 30)], { cash: 0, sumup: 0, tegoed: -25 }, null, null, "2026-10-17T10:00:00Z", { naam: "Jonas", type: "particulier" });
const gebruik = nieuweTransactie([kaartUit("K1", 25)], { cash: 0, sumup: 0, tegoed: 25, tegoedVan: [{ bon: bon.id, bedrag: 25 }] }, null, null, "2026-11-02T15:00:00Z");

test("een tegoedbon: op naam, met een code, en wat er nog op staat", () => {
  assert.equal(bon.soort, "inkoop");
  assert.equal(bon.totaal, -25);
  assert.equal(bon.tegoed, -25);
  assert.match(bonCode(bon), /^TG-2026-[0-9A-F]{6}$/);
  assert.throws(() => nieuweTransactie([kaartIn("Mew", 25, 30)], { cash: 0, sumup: 0, tegoed: -25 }, null), /naam/);
  let [b] = tegoedbonnen([bon]);
  assert.deepEqual([b.naam, b.bedrag, b.gebruikt, b.rest], ["Jonas", 25, 0, 25]);
  [b] = tegoedbonnen([bon, gebruik]);
  assert.deepEqual([b.gebruikt, b.rest, b.gebruik.length], [25, 0, 1]);
  assert.equal(openBonnen([bon, gebruik]).length, 0);
  assert.deepEqual(zoekBonnen(tegoedbonnen([bon]), "jon").length, 1);
  assert.deepEqual(zoekBonnen(tegoedbonnen([bon]), bonCode(bon).toLowerCase()).length, 1);
  assert.deepEqual(zoekBonnen(tegoedbonnen([bon]), "mila").length, 0);
});

test("betalen met tegoed: het moet kloppen en zeggen van welke bon", () => {
  const regels = [kaartUit("K2", 40)];
  assert.equal(betalingKlopt(regels, { cash: 15, sumup: 0, tegoed: 25, tegoedVan: [{ bon: bon.id, bedrag: 25 }] }), null, "deels tegoed, de rest cash");
  assert.match(betalingKlopt(regels, { cash: 15, sumup: 0, tegoed: 25 })!, /tegoedbon/);
  assert.match(betalingKlopt(regels, { cash: 10, sumup: 0, tegoed: 25, tegoedVan: [{ bon: bon.id, bedrag: 25 }] })!, /samen 40/);
  // Bij een inkoop kan het tegoed enkel een bon zijn (negatief), nooit "betalen met tegoed".
  assert.match(betalingKlopt([kaartIn("X", 10, 12)], { cash: 0, sumup: 0, tegoed: 10 })!, /tegoed/);
  assert.equal(betalingKlopt([kaartIn("X", 10, 12)], { cash: -4, sumup: 0, tegoed: -6 }), null, "deels cash, deels bon");
});

test("verdelen over bonnen: de oudste eerst, nooit meer dan erop staat", () => {
  const b2 = nieuweTransactie([kaartIn("Eevee", 10, 12)], { cash: 0, sumup: 0, tegoed: -10 }, null, null, "2026-10-20T10:00:00Z", { naam: "Jonas" });
  const bonnen = tegoedbonnen([b2, bon]);
  assert.deepEqual(verdeelOverBonnen(bonnen, 30), [{ bon: bon.id, bedrag: 25 }, { bon: b2.id, bedrag: 5 }]);
  assert.deepEqual(verdeelOverBonnen(bonnen, 50), [{ bon: bon.id, bedrag: 25 }, { bon: b2.id, bedrag: 10 }], "hoogstens wat er is");
  assert.deepEqual(verdeelOverBonnen(bonnen, 0), []);
});

test("een ongedaan gemaakte bon of betaling telt niet", () => {
  assert.equal(tegoedbonnen([{ ...bon, status: "ongedaan" }]).length, 0);
  const [b] = tegoedbonnen([bon, { ...gebruik, status: "ongedaan" }]);
  assert.equal(b.rest, 25);
});

test("open tegoed op een datum (31/12: een schuld aan klanten)", () => {
  assert.equal(openTegoedOp([bon, gebruik], "2026-10-16"), 0, "nog niet gegeven");
  assert.equal(openTegoedOp([bon, gebruik], "2026-10-31"), 25);
  assert.equal(openTegoedOp([bon, gebruik], "2026-12-31"), 0, "al gebruikt");
});

test("boekhouding: de bon is een aankoop zonder geld, betalen met de bon is omzet zonder geld", () => {
  const [dag2, dag1] = dagontvangsten([bon, gebruik]);
  assert.equal(dag1.datum, "2026-10-17");
  assert.deepEqual([dag1.aankopen, dag1.aankopenGeld, dag1.aankopenTegoed, dag1.ontvangsten, dag1.cash], [25, 0, 25, 0, 0]);
  assert.deepEqual(kostenLijnen(dag1), [{ omschrijving: "Aankoop kaarten tegen tegoedbon", bedrag: 25 }]);
  assert.deepEqual([dag2.ontvangsten, dag2.verkopenTegoed, dag2.cash, dag2.kaarten], [25, 25, 0, 25]);
  assert.deepEqual(dexxterLijnen(dag2), [{ omschrijving: "Verkoop betaald met tegoedbon", bedrag: 25 }]);
});

test("boekhouding: een inkoop deels cash, deels bon, en een verkoop deels met de bon", () => {
  const mix = nieuweTransactie([kaartIn("Snorlax", 30, 40)], { cash: -5, sumup: 0, tegoed: -25 }, null, null, "2026-10-18T10:00:00Z", { naam: "Mila" });
  const verkoop = nieuweTransactie([kaartUit("K3", 40)], { cash: 15, sumup: 0, tegoed: 25, tegoedVan: [{ bon: mix.id, bedrag: 25 }] }, null, null, "2026-10-19T10:00:00Z");
  const [dag2, dag1] = dagontvangsten([mix, verkoop]);
  assert.deepEqual([dag1.aankopenGeld, dag1.aankopenTegoed], [5, 25]);
  assert.deepEqual(kostenLijnen(dag1).map((k) => k.bedrag), [5, 25]);
  assert.deepEqual(dexxterLijnen(dag2), [
    { omschrijving: "Verkoop kaarten en artikels", bedrag: 15 },
    { omschrijving: "Verkoop betaald met tegoedbon", bedrag: 25 },
  ]);
  assert.equal(dexxterLijnen(dag2).reduce((s, l) => s + l.bedrag, 0), dag2.ontvangsten, "de lijnen tellen op tot de ontvangsten");
});

test("online verkocht met verzendkosten: omzet, een eigen lijn, geen kaart", () => {
  const t = nieuweTransactie([kaartUit("K4", 20), regelVerzending(5.5)], { cash: 0, sumup: 0, bank: 25.5 }, null, null, "2026-10-21T18:00:00Z", { naam: "@verzamelaar", kanaal: "online" });
  assert.equal(t.soort, "verkoop");
  const [dag] = dagontvangsten([t]);
  assert.deepEqual([dag.ontvangsten, dag.verzending, dag.kaarten, dag.bank], [25.5, 5.5, 20, 25.5]);
  assert.deepEqual(dexxterLijnen(dag), [
    { omschrijving: "Verkoop kaarten en artikels", bedrag: 20 },
    { omschrijving: "Verzendkosten aangerekend (online verkoop)", bedrag: 5.5 },
  ]);
  // De voorraad: enkel de kaart gaat weg; de verzending is geen product.
  const v = pasToe({ exemplaren: [ex("K4")], artikelen: [], transacties: [] }, t);
  assert.equal(v.voorraad.exemplaren[0].status, "verkocht");
  assert.deepEqual(v.transactie.conflicten, []);
});

test("reserveren: enkel zolang de kaart in voorraad ligt; een retour begint opnieuw", () => {
  const res = { voor: "Lotte", prijs: 18, tot: "2026-10-31", op: "2026-10-17T09:00:00Z", vorige_opslag: "vitrine" as const };
  const k = ex("K5", { reservering: res, opslag: "stockdoos" });
  assert.equal(actieveReservering(k)?.voor, "Lotte");
  assert.equal(actieveReservering({ ...k, status: "verkocht" }), null);
  assert.equal(actieveReservering(ex("K6")), null);
  assert.equal(reserveringVerlopen(res, "2026-10-31"), false);
  assert.equal(reserveringVerlopen(res, "2026-11-01"), true);
  assert.equal(reserveringVerlopen({ tot: null }, "2030-01-01"), false, "zonder einddatum verloopt niets");

  // Verkocht aan Lotte, dan ongedaan: de reservering is er weer. Een retour later: weg.
  const verkoop = nieuweTransactie([kaartUit("K5", 18)], { cash: 18, sumup: 0 }, null, null, "2026-10-20T10:00:00Z");
  const na = pasToe({ exemplaren: [k], artikelen: [], transacties: [] }, verkoop);
  const terug = maakOngedaan(na.voorraad, na.transactie);
  assert.equal(actieveReservering(terug.voorraad.exemplaren[0])?.voor, "Lotte");
  const retour = nieuweRetour([{ ...kaartUit("K5", 18), richting: "in", van: verkoop.id }], 18, null, "2026-10-25T10:00:00Z");
  const weer = pasToe(na.voorraad, retour);
  assert.equal(weer.voorraad.exemplaren[0].status, "in voorraad");
  assert.equal(weer.voorraad.exemplaren[0].reservering, null);
});
