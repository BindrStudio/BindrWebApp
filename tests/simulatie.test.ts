// Een volledige, zelfgemaakte beursdag met alle situaties die aan de stand gebeuren, van de kassa
// tot de boekhouding: verkopen, inkopen (ook met een eigen % per kaart), ruilen (wij betalen bij,
// zij betalen bij, voor binders, voor sealed), dure slabs (eigen lijn boven € 500, cash boven
// € 3.000 kan niet), geld wisselen met een andere stand, kopen van een andere stand, retour,
// een deal terugdraaien (beide richtingen), een conflict en ongedaan maken.
import { test } from "node:test";
import assert from "node:assert/strict";
import { standaardArtikel, standaardExemplaar } from "../src/lib/exemplaar";
import {
  beursCijfers, betalingKlopt, maakOngedaan, nieuweKasbeweging, nieuweRetour, nieuweTransactie, pasToe, regelArtikelIn,
  regelArtikelUit, regelIn, regelUit, retourBedrag, type Betaling, type Voorraad,
} from "../src/lib/kassa";
import { bodVanExact, exactBod, pasBodToe, samenPct } from "../src/lib/bod";
import {
  boeking, borderelLijnen, borderelNummer, borderelOntbreekt, dagontvangsten, dexxterLijnen, jaaromzet, maakPad, MAX_PAD, veiligPad, voorraadOp,
  vrijstellingsGrens,
} from "../src/lib/boekhouding";
import { uuid } from "../src/lib/uuid";
import { groepeer, kerncijfers, perPrijsklasse, pokemonVan, verkochteStukken } from "../src/lib/inzichten";
import type { Productsoort } from "../src/lib/kassa";
import type { Artikel, Exemplaar, Regel, Tegenpartij, Transactie } from "../src/types";

const GISTEREN = "2026-10-10T09:00:00Z";
const kaart = (naam: string, w: Partial<Exemplaar>) => standaardExemplaar({ code: "", naam, opslag: "vitrine", label_status: "gestickerd", ...w, code: w.code ?? naam.slice(0, 6).toUpperCase() } as never, GISTEREN);

test("simulatie: een volledige beursdag, van de kassa tot de boekhouding", () => {
  const A = kaart("Pikachu", { code: "AAAAAA", hartjesprijs: 12, aankoopprijs: 5 });
  const B = kaart("Gengar", { code: "BBBBBB", hartjesprijs: 30, aankoopprijs: 15 });
  const C = kaart("Umbreon", { code: "CCCCCC", soort: "slab", grader: "PSA", grade: "9", hartjesprijs: 150, aankoopprijs: 100 });
  const D = kaart("Eevee", { code: "DDDDDD", hartjesprijs: 8, aankoopprijs: 3 });
  const E = kaart("Charizard", { code: "EEEEEE", soort: "slab", grader: "PSA", grade: "10", hartjesprijs: 1200, aankoopprijs: 900 });
  const F = kaart("Lugia", { code: "FFFFFF", soort: "slab", grader: "BGS", grade: "9.5", hartjesprijs: 3600, aankoopprijs: 2500 });
  const binder: Artikel = standaardArtikel({ naam: "Binder Gengar 9-pocket", soort: "eigen product", aantal: 5, prijs: 45, aankoopprijs: 18, details: { type: "binder" } });
  const booster: Artikel = standaardArtikel({ naam: "Booster Pitch Black", soort: "sealed", aantal: 20, prijs: 6, aankoopprijs: 4 });
  const etb: Artikel = standaardArtikel({ naam: "ETB Ascended Heroes", soort: "sealed", aantal: 3, prijs: 60, aankoopprijs: 45 });

  let v: Voorraad = { exemplaren: [A, B, C, D, E, F], artikelen: [binder, booster, etb] };
  const lijst: Transactie[] = [];
  const beurs = { startkas: 200 };
  let klok = Date.parse("2026-10-18T07:00:00Z"); // 09:00 in Antwerpen
  const om = (uur: string) => { klok = Date.parse(`2026-10-18T${uur}:00+02:00`); return new Date(klok).toISOString(); };
  const zet = (t: Transactie) => {
    const r = pasToe(v, t);
    v = r.voorraad;
    lijst.push(r.transactie);
    return r.transactie;
  };
  const boek = (uur: string, regels: Regel[], b: Betaling, tegenpartij: Tegenpartij | null = null) => zet(nieuweTransactie(regels, b, "beurs-antwerpen", null, om(uur), tegenpartij));
  const ex = (id: string) => v.exemplaren.find((e) => e.id === id)!;
  const art = (id: string) => v.artikelen.find((a) => a.id === id)!;
  let nr = 0;
  const nieuw = (naam: string, extra: Partial<Exemplaar> = {}) => ({ id: uuid(), code: `N${String(++nr).padStart(5, "0")}`, naam, conditie: "NM", ...extra });
  /** Een bod zoals aan de stand: per kaart de marktwaarde en eventueel een eigen percentage. */
  const bod = (kaarten: { naam: string; markt: number; pct?: number }[], algemeen: number, afronding: "exact" | "omlaag5" = "exact") => {
    const regels = kaarten.map((k) => ({ ...regelIn(nieuw(k.naam), 0, k.markt), pct: k.pct ?? null, referentie_bron: "Cardmarket trend" }));
    return pasBodToe(regels, bodVanExact(exactBod(regels, algemeen), { afronding }), algemeen);
  };
  const particulier: Tegenpartij = { type: "particulier", naam: "Jan Peeters", adres: "Meir 1, 2000 Antwerpen", id_gecontroleerd: true, handtekening: "M10 10 L50 40 L90 20", getekend_op: om("09:50") };

  // 09:05 · Extra wisselgeld in de koffer
  zet(nieuweKasbeweging({ cash: 50 }, "beurs-antwerpen", "extra wisselgeld", null, om("09:05")));
  // 09:20 · Simpele verkoop, cash
  const t2 = boek("09:20", [regelUit(A)], { cash: 12, sumup: 0 });
  // 09:35 · Binder en twee boosters met SumUp
  boek("09:35", [regelArtikelUit(binder), regelArtikelUit(booster, 2)], { cash: 0, sumup: 57 });
  // 09:50 · Inkoop van drie kaarten aan 70%
  const t4regels = bod([{ naam: "Inkoop 1", markt: 20 }, { naam: "Inkoop 2", markt: 10 }, { naam: "Inkoop 3", markt: 10 }], 70);
  assert.deepEqual(t4regels.map((r) => r.prijs), [14, 7, 7]);
  const t4 = boek("09:50", t4regels, { cash: -28, sumup: 0 }, particulier);
  // 10:10 · Inkoop met een eigen % per kaart: de vintage kaart aan 65%, de rest aan 80%, afgerond naar 5 omlaag
  const t5regels = bod([{ naam: "Vintage Base Set", markt: 100, pct: 65 }, { naam: "Modern 1", markt: 40 }, { naam: "Modern 2", markt: 40 }], 80, "omlaag5");
  assert.equal(exactBod(t5regels, 80), 129);
  assert.equal(samenPct(t5regels, 80), 72, "samen 72% (65, 80 en 80, gewogen)");
  assert.deepEqual(t5regels.map((r) => r.prijs), [62.98, 31.01, 31.01]);
  const t5 = boek("10:10", t5regels, { cash: -125, sumup: 0 });
  const vintage = t5regels[0].nieuw!.id;
  // 10:30 · Ruil, wij betalen 2 euro bij
  const t6 = boek("10:30", [regelUit(B), ...bod([{ naam: "Ruil 1", markt: 40 }], 80)], { cash: -2, sumup: 0 });
  // 10:45 · Ruil voor een slab, de klant betaalt 70 euro bij met SumUp
  boek("10:45", [regelUit(C), ...bod([{ naam: "Ruil 2", markt: 60 }, { naam: "Ruil 3", markt: 40 }], 80)], { cash: 0, sumup: 70 });
  // 11:00 · Ruil voor een binder (en een kaartje), de klant betaalt 13 euro cash bij
  const t8 = boek("11:00", [regelArtikelUit(binder), regelUit(D), ...bod([{ naam: "Ruil 4", markt: 50 }], 80)], { cash: 13, sumup: 0 });
  // 11:15 · Ruil voor sealed, zonder geld
  boek("11:15", [regelArtikelUit(etb), ...bod([{ naam: "Ruil 5", markt: 45 }, { naam: "Ruil 6", markt: 30 }], 80)], { cash: 0, sumup: 0 });
  // 11:40 · Dure slab: 200 cash en 1000 met SumUp
  boek("11:40", [regelUit(E)], { cash: 200, sumup: 1000 });
  // 12:00 · Nog duurder: 3600 cash mag niet (wettelijke grens), dus een overschrijving
  assert.match(betalingKlopt([regelUit(F)], { cash: 3600, sumup: 0 })!, /hoogstens 3000/);
  assert.throws(() => nieuweTransactie([regelUit(F)], { cash: 3600, sumup: 0 }, null));
  boek("12:00", [regelUit(F)], { cash: 0, sumup: 0, bank: 3600 });
  // 12:30 · Een andere stand betaalt 100 met onze SumUp en krijgt 100 cash
  zet(nieuweKasbeweging({ cash: -100, sumup: 100 }, "beurs-antwerpen", null, { naam: "Kaartenkelder", type: "handelaar" }, om("12:30")));
  assert.throws(() => nieuweKasbeweging({ cash: -50, sumup: 100 }, null, null), /hetzelfde bedrag/);
  // 12:45 · Wij kopen twee ETB's van een andere stand (met factuur)
  const t13 = boek("12:45", [regelArtikelIn(etb, 2, 80)], { cash: -80, sumup: 0 }, { type: "handelaar", naam: "Kaartenkelder", factuur: "F-2026-118" });
  // 13:30 · Retour: de Pikachu van 09:20 komt terug, 12 euro cash terug
  zet(nieuweRetour([{ ...t2.regels[0], vorige_status: "verkocht" }], 12, "beurs-antwerpen", om("13:30")));
  assert.equal(ex(A.id).status, "in voorraad");
  // 14:00 · De ruil van 11:00 terugdraaien: binder en Eevee terug, hun kaart terug, 13 euro terug
  const in8 = t8.regels.filter((r) => r.richting === "uit");
  const uit8 = t8.regels.filter((r) => r.richting === "in");
  assert.equal(retourBedrag(in8, uit8), 13);
  zet(nieuweRetour(in8, 13, "beurs-antwerpen", om("14:00"), uit8));
  assert.equal(art(binder.id).aantal, 4);
  assert.equal(ex(D.id).status, "in voorraad");
  assert.equal(ex(uit8[0].nieuw!.id).status, "weg", "hun kaart is terug bij de klant");
  // 14:20 · De verkoper van 09:50 wil zijn kaarten terug: hij betaalt ons 28 euro terug
  const uit4 = t4.regels;
  assert.equal(retourBedrag([], uit4), -28);
  zet(nieuweRetour([], -28, "beurs-antwerpen", om("14:20"), uit4));
  for (const r of uit4) assert.equal(ex(r.nieuw!.id).status, "weg");
  // 14:30 · De vintage kaart wordt verkocht
  boek("14:30", [regelUit(ex(vintage), 120)], { cash: 120, sumup: 0 });
  // 14:40 · Daarna wil de verkoper ze terug: kan niet meer (al verkocht) → conflict, en we draaien het terug
  const t18 = zet(nieuweRetour([], -62.98, "beurs-antwerpen", om("14:40"), [t5.regels[0]]));
  assert.equal(t18.status, "conflict");
  assert.match(t18.conflicten[0].reden, /al verkocht/);
  const o18 = maakOngedaan(v, t18);
  v = o18.voorraad;
  lijst[lijst.indexOf(t18)] = o18.transactie;
  assert.equal(ex(vintage).status, "verkocht", "de verkochte kaart blijft verkocht");
  // 15:00 · 100 euro uit de koffer
  zet(nieuweKasbeweging({ cash: -100 }, "beurs-antwerpen", "naar huis", null, om("15:00")));
  // 15:10 · Verkeerde scan, meteen ongedaan
  const t20 = boek("15:10", [regelArtikelUit(booster)], { cash: 6, sumup: 0 });
  const o20 = maakOngedaan(v, t20);
  v = o20.voorraad;
  lijst[lijst.indexOf(t20)] = o20.transactie;

  // ── Kas en SumUp ──
  const c = beursCijfers(beurs, lijst);
  assert.equal(c.kasVerwacht, 163, "200 start − 37 netto cash");
  assert.equal(c.sumup, 1227, "57 + 70 + 1000 + 100 (de wissel)");
  assert.equal(c.omzet, 5100, "zonder kasbewegingen");
  assert.equal(c.uitbetaald, 260);
  assert.equal(c.transacties, 15, "kasbewegingen en ongedane transacties tellen niet");
  assert.equal(c.conflicten, 0, "het conflict werd ongedaan gemaakt");

  // ── Voorraad ──
  assert.equal(v.exemplaren.filter((e) => e.status === "in voorraad").length, 9, "Pikachu, Eevee, 2 van de inkoop, 5 uit ruilen");
  assert.deepEqual([art(binder.id).aantal, art(booster.id).aantal, art(etb.id).aantal], [4, 18, 4]);

  // ── Boekhouding: elke deal klopt (ontvangst − aankoop = het geld) ──
  for (const t of lijst) {
    if (t.soort === "kas" || t.status === "ongedaan") continue;
    const b = boeking(t);
    assert.equal(Math.round((b.ontvangst - b.aankoop) * 100) / 100, Math.round((t.cash + t.sumup + (t.bank ?? 0)) * 100) / 100, `${t.soort} om ${t.tijd}`);
  }
  const [dag] = dagontvangsten(lijst);
  assert.equal(dag.datum, "2026-10-18");
  assert.equal(dag.verkopen, 4989);
  assert.equal(dag.ruil, 293, "onze kant van de ruilen: 30 + 150 + 53 + 60");
  assert.equal(dag.retour, -65, "Pikachu 12 en de teruggedraaide ruil 53; de inkoop terugdraaien is geen retour van een verkoop");
  assert.equal(dag.ontvangsten, 5217);
  assert.deepEqual(dag.eigenLijnen.map((l) => [l.omschrijving, l.bedrag]), [["Charizard", 1200], ["Lugia", 3600]]);
  assert.equal(dag.aankopen, 377);
  assert.deepEqual([dag.cash, dag.sumup, dag.bank, dag.kas, dag.kasSumup], [113, 1127, 3600, -150, 100]);
  const lijnen = dexxterLijnen(dag, "Antwerpen");
  assert.deepEqual(lijnen.map((l) => l.bedrag), [1200, 3600, 482, -65]);
  assert.equal(Math.round(lijnen.reduce((x, l) => x + l.bedrag, 0) * 100) / 100, dag.ontvangsten);

  // ── Jaaromzet en de grens (start op 1 juli: pro rata) ──
  assert.equal(vrijstellingsGrens(2026, "2026-07-01"), 12603);
  assert.equal(vrijstellingsGrens(2027, "2026-07-01"), 25000);
  assert.equal(vrijstellingsGrens(2026, null), 25000);
  const jo = jaaromzet(dagontvangsten(lijst), 2026, "2026-07-01");
  assert.deepEqual([jo.omzet, jo.grens, jo.pct, jo.tolerantie], [5217, 12603, 41, 13863]);

  // ── Borderellen ──
  assert.match(borderelNummer(t4), /^AB-2026-[0-9A-F]{6}$/);
  assert.match(borderelNummer(t6), /^RB-2026-/);
  assert.deepEqual(borderelOntbreekt(t4), []);
  assert.deepEqual(borderelOntbreekt(t5), ["naam", "adres", "identiteit nagekeken", "handtekening verkoper"]);
  assert.deepEqual(borderelOntbreekt(t13), [], "een handelaar met factuur");
  const bl = borderelLijnen(t5.regels, "in");
  assert.deepEqual(bl.map((l) => [l.markt, l.pct, l.prijs, l.bron]), [[100, 63, 62.98, "Cardmarket trend"], [40, 78, 31.01, "Cardmarket trend"], [40, 78, 31.01, "Cardmarket trend"]]);
  assert.equal(veiligPad("M10 10 L50 40"), "M10 10 L50 40");
  assert.equal(veiligPad("M10 10 Z\"/><script>"), null);

  // ── Voorraad op een datum: gisteren zoals het was, vandaag zoals het is ──
  const alles = [...lijst];
  const gisteren = voorraadOp("2026-10-17", v.exemplaren, v.artikelen, alles);
  assert.equal(gisteren.totaal, 3828, "3523 kaarten en slabs + 305 artikels");
  assert.equal(gisteren.lijnen.filter((l) => l.code).length, 6);
  const vandaagInv = voorraadOp("2026-10-18", v.exemplaren, v.artikelen, alles);
  assert.equal(vandaagInv.totaal, 566.02);
  assert.equal(vandaagInv.zonderWaarde, 0);
  const viaRuil = vandaagInv.lijnen.find((l) => l.omschrijving.startsWith("Ruil 1"))!;
  assert.equal(viaRuil.herkomst, "ruil");
  assert.equal(viaRuil.borderel, borderelNummer(t6));

  // ── Inzichten: wat terugkwam telt niet, de rest wel (verkocht en weggeruild) ──
  const soortVan = (r: Regel) => (r.artikel_id ? (r.artikel_id === binder.id ? "binders" : "sealed") : ex(r.exemplaar_id!)?.soort === "slab" ? "slabs" : "kaarten") as Productsoort;
  const stukken = verkochteStukken(lijst, v.exemplaren, v.artikelen, soortVan);
  const k = kerncijfers(stukken);
  assert.equal(k.stuks, 9);
  assert.equal(k.omzet, 5217, "zelfde als de dagontvangsten");
  const perSoort = Object.fromEntries(groepeer(stukken, (x) => x.soort, "aantal").map((g) => [g.sleutel, g.aantal]));
  assert.deepEqual(perSoort, { slabs: 3, kaarten: 2, sealed: 3, binders: 1 }, "Pikachu en de teruggedraaide binder en Eevee tellen niet");
  assert.deepEqual(perPrijsklasse(stukken).map((g) => g.aantal), [0, 2, 0, 2, 1, 2, 2]);
});

test("inzichten: de Pokémon achter een kaartnaam", () => {
  assert.equal(pokemonVan("Charizard ex"), "Charizard");
  assert.equal(pokemonVan("Mega Gengar ex"), "Mega Gengar");
  assert.equal(pokemonVan("Pikachu V"), "Pikachu");
  assert.equal(pokemonVan("Radiant Charizard"), "Charizard");
  assert.equal(pokemonVan("Umbreon VMAX"), "Umbreon");
  assert.equal(pokemonVan("Team Rocket's Mewtwo ex"), "Mewtwo");
});

test("simulatie: een kasbeweging en een retour die we terugdraaien", () => {
  const kaartX = kaart("Mew", { code: "MMMMMM", hartjesprijs: 20, aankoopprijs: 8 });
  let v: Voorraad = { exemplaren: [kaartX], artikelen: [] };
  const inRegel = regelIn({ id: uuid(), code: "NNNNNN", naam: "Mewtwo" }, 10, 14);
  const ruil = pasToe(v, nieuweTransactie([regelUit(kaartX), inRegel], { cash: 10, sumup: 0 }, null));
  v = ruil.voorraad;
  const terugIn = ruil.transactie.regels.filter((r) => r.richting === "uit").map((r) => ({ ...r, vorige_status: "geruild" as const }));
  const terug = pasToe(v, nieuweRetour(terugIn, 10, null, undefined, ruil.transactie.regels.filter((r) => r.richting === "in")));
  v = terug.voorraad;
  assert.equal(v.exemplaren.find((e) => e.code === "MMMMMM")!.status, "in voorraad");
  assert.equal(v.exemplaren.find((e) => e.code === "NNNNNN")!.status, "weg");
  // Het terugdraaien ongedaan maken: Mewtwo terug in voorraad, Mew weer weg
  const o = maakOngedaan(v, terug.transactie);
  assert.equal(o.voorraad.exemplaren.find((e) => e.code === "NNNNNN")!.status, "in voorraad");
  assert.equal(o.voorraad.exemplaren.find((e) => e.code === "MMMMMM")!.status, "geruild");
  // Een kasbeweging is geen omzet en geen kost
  const k = nieuweKasbeweging({ cash: 40 }, null, "wisselgeld");
  assert.deepEqual([boeking(k).ontvangst, boeking(k).aankoop], [0, 0]);
  assert.equal(beursCijfers({ startkas: 100 }, [k]).kasVerwacht, 140);
  assert.equal(beursCijfers({ startkas: 100 }, [k]).omzet, 0);
});

test("retour: twee keer terugnemen kan niet, en ongedaan maken zet alles terug zoals het was", () => {
  const k = kaart("Snorlax", { code: "SSSSSS", hartjesprijs: 40, aankoopprijs: 10 });
  let v: Voorraad = { exemplaren: [k], artikelen: [] };
  const verkoop = pasToe(v, nieuweTransactie([regelUit(k)], { cash: 40, sumup: 0 }, null, null, "2026-10-01T10:00:00Z"));
  v = verkoop.voorraad;
  const e = v.exemplaren[0];
  const regel = { ...verkoop.transactie.regels[0], van: verkoop.transactie.id, vorige_status: e.status, vorige_afgeboekt_op: e.afgeboekt_op, vorige_transactie_id: e.transactie_id };
  const r1 = pasToe(v, nieuweRetour([regel], 40, null, "2026-10-05T10:00:00Z"));
  v = r1.voorraad;
  assert.equal(v.exemplaren[0].status, "in voorraad");
  // Nog eens dezelfde retour: conflict, geen tweede keer geld terug in de voorraad
  const r2 = pasToe(v, nieuweRetour([regel], 40, null, "2026-10-06T10:00:00Z"));
  assert.equal(r2.transactie.status, "conflict");
  assert.match(r2.transactie.conflicten[0].reden, /al in voorraad/);
  // De eerste retour ongedaan: weer verkocht, met de oorspronkelijke datum en transactie
  const o = maakOngedaan(v, r1.transactie);
  assert.deepEqual([o.voorraad.exemplaren[0].status, o.voorraad.exemplaren[0].afgeboekt_op, o.voorraad.exemplaren[0].transactie_id], ["verkocht", "2026-10-01T10:00:00Z", verkoop.transactie.id]);
  const lijst = [verkoop.transactie, o.transactie];
  assert.equal(voorraadOp("2026-10-03", o.voorraad.exemplaren, [], lijst).lijnen.length, 0, "op 3 oktober was hij verkocht");
  // Een kaart die met de hand uit de voorraad ging, telt mee tot die dag
  const weg = { ...kaart("Ditto", { code: "DITTOO", aankoopprijs: 3 }), status: "weg" as const, afgeboekt_op: "2027-01-10T10:00:00Z" };
  assert.equal(voorraadOp("2026-12-31", [weg], [], []).totaal, 3);
  assert.equal(voorraadOp("2027-01-31", [weg], [], []).totaal, 0);
});

test("retour en conflicten: een vervangend stuk bij het terugdraaien gaat weg, een verkochte inkoop blijft", async () => {
  const { losConflictOp } = await import("../src/lib/kassa");
  const a = kaart("Abra", { code: "ABRAAA", opslag: "stockdoos" });
  const b = kaart("Kadabra", { code: "KADABR", opslag: "stockdoos" });
  let v: Voorraad = { exemplaren: [a, b], artikelen: [] };
  // We geven "Abra" terug maar die was al weg: conflict; eigenlijk was het "Kadabra"
  v = { ...v, exemplaren: v.exemplaren.map((e) => (e.id === a.id ? { ...e, status: "verkocht" as const } : e)) };
  const t = pasToe(v, nieuweRetour([], -5, null, undefined, [{ richting: "in", exemplaar_id: a.id, naam: "Abra", prijs: 5 }]));
  assert.equal(t.transactie.status, "conflict");
  const opgelost = losConflictOp(t.voorraad, t.transactie, a.id, b.id);
  assert.equal(opgelost.voorraad.exemplaren.find((e) => e.id === b.id)!.status, "weg");
  // Een inkoop ongedaan maken nadat de kaart al verkocht werd: de kaart blijft (zoals op de server)
  const n = { id: uuid(), code: "NIEUWW", naam: "Gastly" };
  let w: Voorraad = { exemplaren: [], artikelen: [] };
  const inkoop = pasToe(w, nieuweTransactie([regelIn(n, 5)], { cash: -5, sumup: 0 }, null));
  w = inkoop.voorraad;
  w = pasToe(w, nieuweTransactie([regelUit(w.exemplaren[0], 12)], { cash: 12, sumup: 0 }, null)).voorraad;
  assert.equal(maakOngedaan(w, inkoop.transactie).voorraad.exemplaren.length, 1);
  // Een retour boven de cashgrens kan enkel per overschrijving
  assert.throws(() => nieuweRetour([], 3500, null), /hoogstens 3000/);
  assert.equal(nieuweRetour([], 3500, null, undefined, [], true).bank, -3500);
});

test("boekhouding: eigen lijn per stuk, en een handtekening blijft kort genoeg", () => {
  const box = standaardArtikel({ naam: "Display", soort: "sealed", aantal: 5, prijs: 200 });
  const t = nieuweTransactie([regelArtikelUit(box, 3)], { cash: 0, sumup: 600 }, null);
  assert.equal(dagontvangsten([t])[0].eigenLijnen.length, 0, "drie dozen van 200: geen stuk boven 500");
  const lang = [Array.from({ length: 3000 }, (_, i) => [i % 600, (i * 7) % 200] as [number, number])];
  const pad = maakPad(lang);
  assert.ok(pad.length <= MAX_PAD && veiligPad(pad) === pad, `pad van ${pad.length} tekens`);
});
