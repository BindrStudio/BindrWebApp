// Twee jaar Bind'r (december 2026 tot eind 2028), gesimuleerd met de echte rekenkern van de app:
// een startvoorraad uit privé, elke maand een beurs (verkopen, inkopen, ruilen, retour, ongedaan, een
// conflict, kas), en tussen de beurzen Facebook en rommelmarkten, Cardmarket-aankopen met factuur,
// binders bijkopen, packs openen, kaarten kwijt, privé in en uit, en vergeten in te brengen.
//
// Daarna kijken we of de boekhouding sluit, zoals een boekhouder het zou narekenen:
//   1. elke transactie: ontvangst − aankoop = het geld;
//   2. elke dag: de lijnen voor Dexxter tellen op tot de dagontvangsten en de kosten;
//   3. de voorraad op 31/12, achteraf berekend (in 2029), = de voorraad zoals hij die avond echt was;
//   4. de winst volgens de boeken (omzet − kosten + onttrekkingen + voorraadwijziging) = de echte winst
//      (per stuk: verkoopprijs − kostprijs, min wat verloren ging).
// En we meten hoe groot de gegevens worden (opslag, kopie op de gsm).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { inVoorraad, metTelling, standaardArtikel, standaardExemplaar } from "../src/lib/exemplaar";
import {
  beursCijfers, CASH_GRENS, losConflictOp, maakOngedaan, nieuweKasbeweging, nieuwePrive, nieuweRetour, nieuweTransactie, pasToe,
  pasTotaalAan, regelArtikelIn, regelArtikelUit, regelIn, regelInbreng, regelUit, retourBedrag, rond2, type Betaling, type Voorraad,
} from "../src/lib/kassa";
import { bodVanExact, exactBod, pasBodToe } from "../src/lib/bod";
import {
  bewijsAdvies, bewijsNummer, boeking, dagontvangsten, dagVan, dexxterLijnen, EIGEN_LIJN, heeftBewijs, jaaromzet, kostenLijnen, verwervingen,
  voorraadOp, vrijstellingsGrens,
} from "../src/lib/boekhouding";
import type { Artikel, Exemplaar, Regel, Tegenpartij, Transactie } from "../src/types";

// ── Toeval dat elke keer hetzelfde is ────────────────────────────────────────
function maakRng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = maakRng(20261016);
const tussen = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
const kans = (p: number) => rnd() < p;
const kies = <T,>(xs: T[]): T => xs[Math.floor(rnd() * xs.length)];
const hex = (n: number) => Array.from({ length: n }, () => Math.floor(rnd() * 16).toString(16)).join("");
const sid = () => `${hex(8)}-${hex(4)}-4${hex(3)}-a${hex(3)}-${hex(12)}`;

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
let codeNr = 0;
const nieuweCode = () => { let n = ++codeNr, c = ""; for (let i = 0; i < 6; i++) { c = CROCKFORD[n % 32] + c; n = Math.floor(n / 32); } return c; };

// Tijd in België: zomertijd (april–oktober) +02:00, anders +01:00 (we vermijden de wisseldagen).
const bxl = (dag: string, uur: string) => new Date(`${dag}T${uur}:00${Number(dag.slice(5, 7)) >= 4 && Number(dag.slice(5, 7)) <= 10 ? "+02:00" : "+01:00"}`).toISOString();
const dagPlus = (dag: string, n: number) => new Date(Date.parse(`${dag}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

const NAMEN = ["Pikachu", "Charizard ex", "Gengar", "Umbreon VMAX", "Eevee", "Mew ex", "Lugia V", "Snorlax", "Gardevoir ex", "Rayquaza VMAX", "Greninja", "Dragonite", "Mimikyu", "Lucario", "Sylveon", "Espeon", "Blastoise", "Venusaur", "Magikarp", "Gyarados", "Mewtwo", "Arceus V", "Giratina V", "Zapdos", "Moltres"];
const SETS = ["OBF", "PAF", "TWM", "SSP", "PRE", "JTG", "MEW", "SV1", "ASC", "M6"];

/** Marktwaarde: veel goedkope kaarten, wat middenklasse, een paar dure en af en toe een slab. */
function marktwaarde(): number {
  const r = rnd();
  if (r < 0.55) return tussen(1, 8);
  if (r < 0.85) return tussen(8, 40);
  if (r < 0.97) return tussen(40, 180);
  return tussen(180, 900);
}

// ── De wereld: voorraad, transacties en wat buiten de app gebeurt ────────────
let v: Voorraad = { exemplaren: [], artikelen: [] };
const lijst: Transactie[] = [];
const fotos = new Map<string, number>();
const markt = new Map<string, number>(); // exemplaar → marktwaarde (om te prijzen)
const winst = new Map<number, number>();  // de echte winst per jaar, per stuk berekend
const buiten = new Map<number, number>(); // kosten die rechtstreeks in Dexxter gaan (factuur): Cardmarket, binders, sealed
const plus = (m: Map<number, number>, jaar: number, x: number) => m.set(jaar, rond2((m.get(jaar) ?? 0) + x));
const jaarVan = (tijd: string) => Number(dagVan(tijd).slice(0, 4));
const kas = { thuis: 300, bank: 0, minThuis: 300, tekorten: 0 }; // het geld van de zaak buiten de beurzen
const snapshots = new Map<number, number>(); // voorraad op 31/12, die avond zelf berekend
const meldingen: string[] = [];

const ex = (id: string) => v.exemplaren.find((e) => e.id === id)!;
const art = (naam: string) => v.artikelen.find((a) => a.naam === naam)!;
const kost = (e: Exemplaar) => e.aankoopprijs ?? 0;

function zet(t: Transactie, aantalFotos = 0): Transactie {
  const r = pasToe({ ...v, transacties: lijst }, { ...t, id: sid() });
  v = r.voorraad;
  lijst.push(r.transactie);
  if (aantalFotos) fotos.set(r.transactie.id, aantalFotos);
  return r.transactie;
}
function vervang(oud: Transactie, nieuw: Transactie) { lijst[lijst.indexOf(oud)] = nieuw; }
function wijzigEx(id: string, w: Partial<Exemplaar>) { v = { ...v, exemplaren: v.exemplaren.map((e) => (e.id === id ? { ...e, ...w } : e)) }; }
function wijzigArt(id: string, w: Partial<Artikel>) { v = { ...v, artikelen: v.artikelen.map((a) => (a.id === id ? { ...a, ...w } : a)) }; }

/** De echte winst van wat de deur uitgaat (of terugkomt), per stuk. */
function boekWinst(t: Transactie) {
  if (t.status === "ongedaan" || t.soort === "kas" || t.soort === "prive") return;
  const jaar = jaarVan(t.tijd);
  const misluktEx = new Set(t.conflicten.map((c) => c.exemplaar_id).filter(Boolean));
  for (const r of t.regels) {
    if (r.exemplaar_id && misluktEx.has(r.exemplaar_id)) continue;
    const kp = r.exemplaar_id ? kost(ex(r.exemplaar_id)) : r.artikel_id ? (v.artikelen.find((a) => a.id === r.artikel_id)!.aankoopprijs ?? 0) * (r.aantal ?? 1) : 0;
    if (t.soort === "retour") {
      if (r.richting === "in") plus(winst, jaar, -r.prijs + kp); // ons stuk terug: geld terug, kostprijs terug in voorraad
      continue; // hun stuk terug tegen hetzelfde geld: winst 0
    }
    if (r.richting === "uit") plus(winst, jaar, r.prijs - kp);
  }
}

/** Een nieuw exemplaar dat binnenkomt (inkoop, ruil, privé), met een marktwaarde. */
function nieuwKaartje(mw: number, opslag: "vitrine" | "stockdoos" = kans(0.7) ? "vitrine" : "stockdoos") {
  const slab = mw > 250 && kans(0.5);
  return {
    id: sid(), code: nieuweCode(), naam: kies(NAMEN), set_code: kies(SETS), nummer: String(tussen(1, 250)), conditie: kies(["NM", "NM", "NM", "EX", "LP"]),
    soort: slab ? "slab" : "kaart", ...(slab ? { grader: "PSA", grade: kies(["9", "10"]) } : {}), opslag,
  } as const;
}
function prijs(id: string, mw: number) {
  markt.set(id, mw);
  const hartje = Math.max(1, Math.round(mw * (1 + rnd() * 0.25)));
  wijzigEx(id, { hartjesprijs: hartje, verkoopprijs: hartje, label_status: "gestickerd" });
}
/** Een bod zoals aan de stand: marktwaarde per kaart, een percentage, afgerond. */
function bod(waarden: number[], pct: number, opslag?: "vitrine" | "stockdoos") {
  const regels = waarden.map((mw) => ({ ...regelIn(nieuwKaartje(mw, opslag), 0, mw), referentie_bron: "Cardmarket trend" }));
  return pasBodToe(regels, bodVanExact(exactBod(regels, pct), { afronding: kies(["exact", "omlaag5", "omhoog5"] as const) }), pct);
}
const naamVan = (): Tegenpartij => ({ type: "particulier", naam: kans(0.9) ? kies(["Jan", "Sofie", "Lars", "Emma", "Noah", "Lotte"]) : undefined });
function betaalUit(n: number): Betaling { // wij betalen (n > 0)
  return n > CASH_GRENS || (n > 800 && kans(0.5)) ? { cash: 0, sumup: 0, bank: -n } : { cash: -n, sumup: 0 };
}
function betaalIn(n: number): Betaling { // de klant betaalt (n > 0)
  if (n > CASH_GRENS) return kans(0.5) ? { cash: 0, sumup: n } : { cash: 0, sumup: 0, bank: n };
  if (n < 20 || kans(0.35)) return { cash: n, sumup: 0 };
  if (kans(0.15) && n > 40) { const c = Math.round(n / 2); return { cash: c, sumup: rond2(n - c) }; }
  return { cash: 0, sumup: n };
}
const voorraadIn = (opslag?: string) => v.exemplaren.filter((e) => inVoorraad(e) && e.hartjesprijs != null && (!opslag || e.opslag === opslag));

/** De voorraad zoals hij die avond echt is: elk stuk aan kostprijs, elk artikel × kostprijs. */
function snapshot(): number {
  const kaarten = v.exemplaren.filter(inVoorraad).reduce((s, e) => s + kost(e), 0);
  const artikels = v.artikelen.reduce((s, a) => s + a.aantal * (a.aankoopprijs ?? 0), 0);
  return rond2(kaarten + artikels);
}

// ── De artikels ──────────────────────────────────────────────────────────────
function startArtikels(dag: string) {
  const t = bxl(dag, "10:00");
  v.artikelen = [
    standaardArtikel({ naam: "Binder Gengar", soort: "eigen product", aantal: 0, prijs: 45, aankoopprijs: 18, details: { type: "binder" } }, t),
    standaardArtikel({ naam: "Binder Eevee", soort: "eigen product", aantal: 0, prijs: 45, aankoopprijs: 18, details: { type: "binder" } }, t),
    standaardArtikel({ naam: "3D-print standaard", soort: "eigen product", aantal: 0, prijs: 12, aankoopprijs: 3, details: { type: "3d-print" } }, t),
    standaardArtikel({ naam: "Booster", soort: "sealed", aantal: 0, prijs: 6, aankoopprijs: 4 }, t),
    standaardArtikel({ naam: "ETB", soort: "sealed", aantal: 0, prijs: 60, aankoopprijs: 45 }, t),
  ];
  // Bijgekocht met factuur (Amazon, groothandel): kost rechtstreeks in Dexxter, het aantal met de hand.
  for (const [naam, n] of [["Binder Gengar", 10], ["Binder Eevee", 10], ["3D-print standaard", 30], ["Booster", 36], ["ETB", 4]] as const) bijkopen(naam, n, t);
}
function bijkopen(naam: string, n: number, tijd: string) {
  const a = art(naam);
  wijzigArt(a.id, metTelling(a, a.aantal + n, "bijgekocht", tijd));
  plus(buiten, jaarVan(tijd), n * (a.aankoopprijs ?? 0));
  kas.bank -= n * (a.aankoopprijs ?? 0);
}

// ── Een beursdag ─────────────────────────────────────────────────────────────
function beursdag(dag: string, groei: number, nr: number) {
  const beursId = `beurs-${dag}`;
  const startkas = 200;
  kas.thuis -= startkas;
  const vanDeze: Transactie[] = [];
  const boek = (t: Transactie, f = 0) => { const x = zet({ ...t, beurs_id: beursId }, f); vanDeze.push(x); boekWinst(x); return x; };
  let min = 9 * 60 + 30;
  const uur = () => { min += tussen(3, 9); return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`; };

  const verkopen = Math.round(tussen(22, 38) * groei);
  for (let i = 0; i < verkopen; i++) {
    const regels: Regel[] = [];
    const beschikbaar = voorraadIn("vitrine");
    for (let k = tussen(1, 3); k > 0 && beschikbaar.length; k--) {
      const e = beschikbaar.splice(Math.floor(rnd() * beschikbaar.length), 1)[0];
      regels.push(regelUit(e));
    }
    if (kans(0.25)) { const a = kies(v.artikelen.filter((x) => x.aantal > 0)); if (a) regels.push(regelArtikelUit(a, a.soort === "sealed" && a.prijs! < 10 ? tussen(1, 3) : 1)); }
    if (!regels.length) continue;
    let r = regels;
    const tot = r.reduce((s, x) => s + x.prijs, 0);
    if (tot > 30 && kans(0.3)) r = pasTotaalAan(r, "uit", Math.floor(tot / 5) * 5); // combinatiekorting
    const n = rond2(r.reduce((s, x) => s + x.prijs, 0));
    const t = boek(nieuweTransactie(r, betaalIn(n), beursId, null, bxl(dag, uur())));
    // Verkeerde scan: meteen ongedaan.
    if (kans(0.04)) { const o = maakOngedaan(v, t); v = o.voorraad; vervang(t, o.transactie); vanDeze[vanDeze.indexOf(t)] = o.transactie; ongedaanWinst(t); }
  }

  // Een dure slab, af en toe boven € 3.000 (per overschrijving).
  if (kans(0.25)) {
    const e = standaardExemplaar({ code: nieuweCode(), naam: "Charizard Base Set", soort: "slab", grader: "PSA", grade: "9", opslag: "vitrine", aankoopprijs: null, aankoopbron: "Cardmarket" }, bxl(dagPlus(dag, -10), "20:00"));
    const kp = kans(0.5) ? 2400 : 450;
    v = { ...v, exemplaren: [...v.exemplaren, { ...e, aankoopprijs: kp, aankoopdatum: dagPlus(dag, -10) }] };
    plus(buiten, jaarVan(e.aangemaakt_op), kp); kas.bank -= kp;
    prijs(e.id, kp * 1.35);
    boek(nieuweTransactie([regelUit(ex(e.id))], betaalIn(ex(e.id).hartjesprijs!), beursId, null, bxl(dag, uur())));
  }

  // Inkopen bij particulieren: met foto en naam; vanaf € 250 meestal een handtekening.
  for (let i = tussen(3, 7); i > 0; i--) {
    const regels = bod(Array.from({ length: tussen(1, 6) }, marktwaarde), kies([65, 70, 70, 75, 80]));
    const n = rond2(regels.reduce((s, x) => s + x.prijs, 0));
    const tp = naamVan();
    if (n >= 250 && kans(0.8)) { tp.adres = "Gent"; tp.handtekening = "M10 10 L50 40"; }
    const t = boek(nieuweTransactie(regels, betaalUit(n), beursId, null, bxl(dag, uur()), tp), kans(0.85) ? 1 : 0);
    for (const r of t.regels) prijs(r.nieuw!.id, r.referentie!);
  }

  // Ruilen: wij betalen bij, zij betalen bij, of gelijk.
  for (let i = tussen(2, 5); i > 0; i--) {
    const ons = voorraadIn().slice(0, 400);
    if (!ons.length) break;
    const uitR = Array.from({ length: tussen(1, 2) }, () => kies(ons)).filter((e, j, a) => a.indexOf(e) === j).map((e) => regelUit(e));
    const inR = bod(Array.from({ length: tussen(1, 3) }, marktwaarde), 80);
    const n = rond2(uitR.reduce((s, x) => s + x.prijs, 0) - inR.reduce((s, x) => s + x.prijs, 0));
    const t = boek(nieuweTransactie([...uitR, ...inR], n >= 0 ? betaalIn(n) : betaalUit(-n), beursId, null, bxl(dag, uur()), naamVan()), kans(0.8) ? 1 : 0);
    for (const r of t.regels.filter((x) => x.richting === "in")) prijs(r.nieuw!.id, r.referentie!);
  }

  // Van een andere stand: twee ETB's met factuur.
  if (nr % 4 === 0) boek(nieuweTransactie([regelArtikelIn(art("ETB"), 2, 90)], { cash: -90, sumup: 0 }, beursId, null, bxl(dag, uur()), { type: "handelaar", naam: "Kaartenkelder", factuur: `F-${dag}` }));

  // Geld wisselen met een andere stand via SumUp, en wat cash naar huis.
  if (nr % 3 === 0) boek(nieuweKasbeweging({ cash: -100, sumup: 100 }, beursId, null, { naam: "Buurstand", type: "handelaar" }, bxl(dag, uur())));

  // Retour van een verkoop van vandaag.
  const verkocht = vanDeze.filter((t) => t.soort === "verkoop" && t.status === "ok" && t.regels.some((r) => r.exemplaar_id));
  if (verkocht.length && kans(0.4)) {
    const t = kies(verkocht);
    const r = t.regels.find((x) => x.exemplaar_id)!;
    const e = ex(r.exemplaar_id!);
    boek(nieuweRetour([{ ...r, van: t.id, vorige_status: e.status, vorige_afgeboekt_op: e.afgeboekt_op, vorige_transactie_id: e.transactie_id }], r.prijs, beursId, bxl(dag, uur())));
  }

  // Conflict: een kaart die net op de andere gsm verkocht werd; het was eigenlijk een andere kaart.
  if (nr % 5 === 0) {
    const weg = v.exemplaren.find((e) => e.status === "verkocht" && e.opslag === "vitrine");
    const vervanger = voorraadIn("vitrine")[0];
    if (weg && vervanger) {
      const t = zet({ ...nieuweTransactie([regelUit({ ...weg, status: "in voorraad" })], betaalIn(weg.hartjesprijs ?? 5), beursId, null, bxl(dag, uur())), beurs_id: beursId });
      assert.equal(t.status, "conflict");
      const o = losConflictOp(v, t, weg.id, vervanger.id);
      v = o.voorraad;
      vervang(t, o.transactie);
      vanDeze.push(o.transactie);
      boekWinst(o.transactie);
    }
  }

  const c = beursCijfers({ startkas }, vanDeze);
  if (c.kasVerwacht < 0) meldingen.push(`${dag}: kas onder nul (${c.kasVerwacht})`);
  const naarHuis = c.kasVerwacht;
  kas.thuis += naarHuis;
  kas.bank += c.sumup + vanDeze.reduce((s, t) => s + (t.status !== "ongedaan" ? t.bank ?? 0 : 0), 0);
  return c;
}
function ongedaanWinst(t: Transactie) {
  // boekWinst telde de transactie al; ongedaan maken haalt ze weg.
  const jaar = jaarVan(t.tijd);
  for (const r of t.regels) if (r.richting === "uit") plus(winst, jaar, -(r.prijs - (r.exemplaar_id ? kost(ex(r.exemplaar_id)) : (v.artikelen.find((a) => a.id === r.artikel_id)!.aankoopprijs ?? 0) * (r.aantal ?? 1))));
}

// ── Tussen de beurzen ────────────────────────────────────────────────────────
function inkoopThuis(dag: string, kanaal: "online" | "rommelmarkt") {
  const regels = bod(Array.from({ length: tussen(1, kanaal === "online" ? 3 : 8) }, marktwaarde), kanaal === "online" ? 75 : 60, "stockdoos");
  const n = rond2(regels.reduce((s, x) => s + x.prijs, 0));
  const b: Betaling = kanaal === "online" && kans(0.6) ? { cash: 0, sumup: 0, bank: -n } : { cash: -n, sumup: 0 };
  const t = zet(nieuweTransactie(regels, b, null, null, bxl(dag, "20:15"), { ...naamVan(), kanaal }), 1);
  for (const r of t.regels) prijs(r.nieuw!.id, r.referentie!);
  if (b.bank) kas.bank += b.bank; else kas.thuis += b.cash;
}
function cardmarket(dag: string) {
  for (let i = tussen(3, 8); i > 0; i--) {
    const mw = marktwaarde();
    const kp = rond2(mw * 0.9);
    const e = standaardExemplaar({ code: nieuweCode(), naam: kies(NAMEN), set_code: kies(SETS), opslag: "vitrine", aankoopprijs: kp, aankoopdatum: dag, aankoopbron: "Cardmarket", label_status: "gestickerd" }, bxl(dag, "19:00"));
    v = { ...v, exemplaren: [...v.exemplaren, e] };
    prijs(e.id, mw);
    plus(buiten, jaarVan(e.aangemaakt_op), kp);
    kas.bank -= kp;
  }
}
function packOpenen(dag: string) {
  const a = art("Booster");
  if (!a.aantal) return;
  const tijd = bxl(dag, "21:00");
  wijzigArt(a.id, metTelling(a, a.aantal - 1, "pack geopend", tijd));
  if (kans(0.3)) {
    // Een hit: de kostprijs van het pack gaat naar de kaart.
    const e = standaardExemplaar({ code: nieuweCode(), naam: kies(NAMEN), opslag: "vitrine", aankoopprijs: a.aankoopprijs, aankoopbron: "pack opening", label_status: "gestickerd" }, tijd);
    v = { ...v, exemplaren: [...v.exemplaren, e] };
    prijs(e.id, tussen(5, 30));
  } else plus(winst, jaarVan(tijd), -(a.aankoopprijs ?? 0)); // enkel bulk: het pack is een kost
}
function kwijt(dag: string) {
  const e = kies(voorraadIn("stockdoos"));
  if (!e) return;
  wijzigEx(e.id, { status: "weg", afgeboekt_op: bxl(dag, "18:00"), opmerking: "kwijt" });
  plus(winst, jaarVan(bxl(dag, "18:00")), -kost(e));
}
function binderKapot(dag: string) {
  const a = art("Binder Gengar");
  if (!a.aantal) return;
  const tijd = bxl(dag, "18:30");
  wijzigArt(a.id, metTelling(a, a.aantal - 1, "beschadigd", tijd));
  plus(winst, jaarVan(tijd), -(a.aankoopprijs ?? 0));
}
function naarPrive(dag: string) {
  const e = kies(voorraadIn("vitrine").filter((x) => x.aankoopprijs != null));
  if (e) zet(nieuwePrive([], [regelUit(e, kost(e))], null, bxl(dag, "21:30")));
}
function uitPriveNieuw(dag: string) {
  const regels = Array.from({ length: tussen(1, 3) }, () => { const mw = marktwaarde(); return { ...regelIn(nieuwKaartje(mw, "stockdoos"), rond2(mw * 0.7), mw), pct: 70, referentie_bron: "Cardmarket trend" }; });
  const t = zet(nieuwePrive(regels, [], null, bxl(dag, "21:40")), 1);
  for (const r of t.regels) prijs(r.nieuw!.id, r.referentie!);
}
/** Kaarten die al in de app staan (zelf toegevoegd) uit privé inbrengen: zoals Privé › Al in de app. */
function inbrengBestaand(ids: string[], tijd: string, pct = 70) {
  const regels = ids.map((id) => { const e = ex(id); const mw = markt.get(id)!; return regelInbreng(e, rond2((mw * pct) / 100), mw, "Cardmarket-prijsgids", pct); });
  const t = zet(nieuwePrive(regels, [], null, tijd), 1);
  assert.equal(t.status, "ok");
  // De rekenkern zet zelf de inbrengwaarde als aankoopprijs (zoals de database).
  for (const r of t.regels) assert.deepEqual([ex(r.exemplaar_id!).aankoopprijs, ex(r.exemplaar_id!).aankoopbron], [r.prijs, "privé"]);
  return t;
}
function zelfToevoegen(n: number, dag: string, bron: string) {
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const e = standaardExemplaar({ code: nieuweCode(), naam: kies(NAMEN), set_code: kies(SETS), nummer: String(tussen(1, 250)), opslag: kans(0.6) ? "vitrine" : "stockdoos", aankoopbron: bron, label_status: "gestickerd" }, bxl(dag, "15:00"));
    v = { ...v, exemplaren: [...v.exemplaren, e] };
    prijs(e.id, marktwaarde());
    ids.push(e.id);
  }
  return ids;
}

// ── Twee jaar ────────────────────────────────────────────────────────────────
test("simulatie van twee jaar: de boekhouding sluit, ook achteraf bekeken", async () => {
  const START = "2026-07-01"; // begin van de activiteit (pro rata grens in 2026)
  startArtikels("2026-12-01");
  // Startvoorraad: de eigen verzameling eerst gewoon in de app (zoals je scant), dan in één keer ingebracht.
  const eigen = zelfToevoegen(400, "2026-12-05", "eigen collectie");
  const tStart = inbrengBestaand(eigen, bxl("2026-12-20", "20:00"));
  assert.equal(tStart.regels.length, 400);
  assert.equal(boeking(tStart).inbreng, rond2(tStart.regels.reduce((s, r) => s + r.prijs, 0)));
  // Dezelfde kaarten nog eens inbrengen (een tweede gsm): conflict, geen dubbele kost.
  const tweede = zet(nieuwePrive(eigen.slice(0, 3).map((id) => regelInbreng(ex(id), 99, 100, "x", 99)), [], null, bxl("2026-12-20", "21:00")));
  assert.equal(tweede.status, "conflict");
  assert.equal(boeking(tweede).inbreng, 0);
  const o = maakOngedaan(v, tweede);
  v = o.voorraad;
  vervang(tweede, o.transactie);
  assert.equal(ex(eigen[0]).aankoopprijs, tStart.regels[0].prijs, "ongedaan maken van het conflict laat de prijs staan");

  const vergeten: string[] = [];
  const cijfers: { dag: string; omzet: number; kas: number }[] = [];
  let laatsteDecemberVerkoop: Transactie | null = null;

  for (let m = 0; m < 25; m++) {
    const jaar = 2026 + Math.floor((m + 11) / 12);
    const maand = ((m + 11) % 12) + 1;
    const mm = String(maand).padStart(2, "0");
    const groei = jaar === 2028 ? 1.45 : 1; // het tweede jaar loopt het beter
    if (!(jaar === 2026 && maand === 12)) {
      const dag = `${jaar}-${mm}-${String(tussen(14, 20)).padStart(2, "0")}`;
      const c = beursdag(dag, groei, m);
      cijfers.push({ dag, omzet: c.omzet, kas: c.kasVerwacht });
      if (maand === 12) laatsteDecemberVerkoop = lijst.filter((t) => t.beurs_id === `beurs-${dag}` && t.soort === "verkoop" && t.status === "ok" && t.regels.some((r) => r.exemplaar_id)).at(-1) ?? null;
    }
    if (jaar === 2026) { snapshots.set(2026, snapshot()); continue; }
    // Tussen de beurzen
    inkoopThuis(`${jaar}-${mm}-05`, "online");
    if (kans(0.6)) inkoopThuis(`${jaar}-${mm}-09`, "online");
    if (maand % 3 === 0) inkoopThuis(`${jaar}-${mm}-24`, "rommelmarkt");
    if (maand % 2 === 0) cardmarket(`${jaar}-${mm}-07`);
    packOpenen(`${jaar}-${mm}-10`); packOpenen(`${jaar}-${mm}-11`);
    if (maand % 3 === 1) bijkopen(kies(["Binder Gengar", "Binder Eevee"]), 10, bxl(`${jaar}-${mm}-02`, "11:00"));
    if (maand % 2 === 1) bijkopen("3D-print standaard", 15, bxl(`${jaar}-${mm}-03`, "11:00"));
    if (maand % 4 === 2) bijkopen("Booster", 36, bxl(`${jaar}-${mm}-03`, "12:00"));
    if (maand % 5 === 0) kwijt(`${jaar}-${mm}-25`);
    if (maand === 6) binderKapot(`${jaar}-06-26`);
    if (maand % 4 === 0) naarPrive(`${jaar}-${mm}-26`);
    if (maand % 4 === 1) uitPriveNieuw(`${jaar}-${mm}-27`);
    if (jaar === 2028 && maand === 3) vergeten.push(...zelfToevoegen(15, "2028-03-02", "")); // vergeten in te brengen
    if (maand === 12) {
      // Laat op oudejaarsavond nog iets gekocht via Facebook (23:40 Belgische tijd = nog 31/12).
      const regels = bod([25, 12], 75, "stockdoos");
      const t = zet(nieuweTransactie(regels, { cash: 0, sumup: 0, bank: -rond2(regels.reduce((s, r) => s + r.prijs, 0)) }, null, null, bxl(`${jaar}-12-31`, "23:40"), { naam: "Laura", kanaal: "online" }), 1);
      kas.bank += t.bank ?? 0;
      for (const r of t.regels) prijs(r.nieuw!.id, r.referentie!);
      snapshots.set(jaar, snapshot());
      // Na middernacht (1/1, 00:20): weer iets, en enkele dagen later een retour van de decemberbeurs.
      const nj = bod([30], 70, "stockdoos");
      const tn = zet(nieuweTransactie(nj, { cash: -nj[0].prijs, sumup: 0 }, null, null, bxl(`${jaar + 1}-01-01`, "00:20"), { naam: "Tom", kanaal: "online" }), 1);
      kas.thuis += tn.cash;
      prijs(tn.regels[0].nieuw!.id, 30);
      if (laatsteDecemberVerkoop) {
        const r = laatsteDecemberVerkoop.regels.find((x) => x.exemplaar_id)!;
        const e = ex(r.exemplaar_id!);
        if (e.status === "verkocht") {
          const t = zet(nieuweRetour([{ ...r, van: laatsteDecemberVerkoop.id, vorige_status: e.status, vorige_afgeboekt_op: e.afgeboekt_op, vorige_transactie_id: e.transactie_id }], r.prijs, null, bxl(`${jaar + 1}-01-04`, "14:00")));
          boekWinst(t);
          kas.thuis += t.cash;
        }
      }
      // En in januari wordt alles met de hand bijgewerkt: binders bijgekocht, een binder kapot, nieuwe kaarten.
      bijkopen("Binder Eevee", 20, bxl(`${jaar + 1}-01-06`, "10:00"));
      zelfToevoegen(5, `${jaar + 1}-01-07`, "Cardmarket").forEach((id) => { const kp = rond2(markt.get(id)! * 0.9); wijzigEx(id, { aankoopprijs: kp }); plus(buiten, jaar + 1, kp); });
    }
  }

  // ── 1. Elke transactie: ontvangst − aankoop = het geld ──
  for (const t of lijst) {
    if (t.soort === "kas" || t.soort === "prive" || t.status === "ongedaan") continue;
    const b = boeking(t);
    assert.equal(rond2(b.ontvangst - b.aankoop), rond2(t.cash + t.sumup + (t.bank ?? 0)), `${t.soort} ${t.tijd}`);
    assert.ok(Math.abs(t.cash) <= CASH_GRENS, `cash ${t.cash} op ${t.tijd}`);
  }

  // ── 2. Elke dag: de lijnen voor Dexxter ──
  const dagen = dagontvangsten(lijst);
  for (const d of dagen) {
    assert.equal(rond2(dexxterLijnen(d).reduce((s, l) => s + l.bedrag, 0)), d.ontvangsten, `dagontvangsten ${d.datum}`);
    assert.equal(rond2(kostenLijnen(d).reduce((s, l) => s + l.bedrag, 0)), rond2(d.aankopen + d.inbreng), `kosten ${d.datum}`);
    for (const t of d.transacties) {
      if ((t.soort !== "verkoop" && t.soort !== "ruil") || t.status === "ongedaan") continue;
      for (const r of t.regels) if (r.richting === "uit" && r.prijs / (r.aantal ?? 1) > EIGEN_LIJN) assert.ok(d.eigenLijnen.some((l) => l.transactie_id === t.id && l.bedrag === rond2(r.prijs)), `eigen lijn ${r.naam} ${d.datum}`);
    }
  }
  // De dag van 31/12 23:40 hoort bij het oude jaar, 1/1 00:20 bij het nieuwe.
  assert.ok(dagen.some((d) => d.datum === "2027-12-31" && d.aankopen > 0));
  assert.ok(dagen.some((d) => d.datum === "2028-01-01" && d.aankopen > 0));

  // ── 3 en 4. Per jaar: voorraad achteraf = voorraad die avond, en de winst sluit ──
  const rapport: Record<string, unknown>[] = [];
  let vorige = 0;
  for (const jaar of [2026, 2027, 2028]) {
    const inv = voorraadOp(`${jaar}-12-31`, v.exemplaren, v.artikelen, lijst);
    assert.equal(inv.totaal, snapshots.get(jaar), `voorraad op 31/12/${jaar}: achteraf ${inv.totaal}, die avond ${snapshots.get(jaar)}`);
    const jd = dagen.filter((d) => d.datum.startsWith(`${jaar}-`));
    const omzet = jaaromzet(dagen, jaar, START);
    const kostenApp = rond2(jd.reduce((s, d) => s + d.aankopen + d.inbreng, 0));
    const ontt = rond2(jd.reduce((s, d) => s + d.onttrekking, 0));
    const winstBoeken = rond2(omzet.omzet - kostenApp - (buiten.get(jaar) ?? 0) + ontt + inv.totaal - vorige);
    assert.equal(winstBoeken, winst.get(jaar) ?? 0, `winst ${jaar}: boeken ${winstBoeken}, echt ${winst.get(jaar)}`);
    rapport.push({
      jaar, omzet: omzet.omzet, grens: omzet.grens, pctGrens: omzet.pct, kostenInDeApp: kostenApp, kostenMetFactuur: buiten.get(jaar) ?? 0, onttrekking: ontt,
      inbreng: rond2(jd.reduce((s, d) => s + d.inbreng, 0)), voorraad: inv.totaal, voorraadKaarten: inv.lijnen.filter((l) => l.code).length,
      zonderAankoop: inv.zonderAankoop, winst: winstBoeken, dagenMetTransacties: jd.length,
    });
    vorige = inv.totaal;
  }
  // De startvoorraad telt pas vanaf de inbreng: op 19/12/2026 was er nog niets van.
  assert.equal(voorraadOp("2026-12-19", v.exemplaren, v.artikelen, lijst).lijnen.filter((l) => l.code).length, 0);
  // Wat zelf werd toegevoegd zonder aankoop in de app (Cardmarket, packs, vergeten), staat apart.
  const inv28 = voorraadOp("2028-12-31", v.exemplaren, v.artikelen, lijst);
  const zelf = v.exemplaren.filter((e) => inVoorraad(e) && !verwervingen(lijst).has(e.id) && dagVan(e.aangemaakt_op) <= "2028-12-31");
  assert.equal(inv28.zonderAankoop.aantal, zelf.length);
  assert.ok(vergeten.some((id) => inVoorraad(ex(id))) ? inv28.lijnen.some((l) => l.zonderAankoop && l.herkomst === "zelf toegevoegd") : true);

  // ── 5. Aankoopbewijzen ──
  const bewijzen = lijst.filter(heeftBewijs);
  const nummers = new Map<string, number>();
  for (const t of bewijzen) nummers.set(bewijsNummer(t), (nummers.get(bewijsNummer(t)) ?? 0) + 1);
  const dubbel = [...nummers.values()].filter((n) => n > 1).length;
  const advies = bewijzen.map((t) => bewijsAdvies(t, fotos.get(t.id) ?? 0));
  const groot = bewijzen.filter((t) => t.soort !== "prive" && t.regels.filter((r) => r.richting === "in").reduce((s, r) => s + r.prijs, 0) >= 250);

  // ── Grootte van de gegevens ──
  const bytes = (x: unknown) => Buffer.byteLength(JSON.stringify(x));
  const kopie = bytes({ exemplaren: v.exemplaren, artikelen: v.artikelen, transacties: lijst });
  // De kopie voor offline zoals de app ze nu maakt: voorraad + de laatste 120 dagen.
  (globalThis as Record<string, unknown>).localStorage ??= { getItem: () => null, setItem: () => undefined, removeItem: () => undefined };
  const { kopieVan } = await import("../src/state");
  const kopieNu = bytes(kopieVan({ exemplaren: v.exemplaren, artikelen: v.artikelen, beurzen: [], transacties: lijst }, Date.parse("2029-01-10T12:00:00Z")));
  const fotoAantal = [...fotos.values()].reduce((s, n) => s + n, 0);
  const rapportAlles = {
    jaren: rapport,
    beurzen: cijfers.length, transacties: lijst.length, exemplaren: v.exemplaren.length, inVoorraad: v.exemplaren.filter(inVoorraad).length,
    bewijzen: bewijzen.length, bewijsnummersDubbel: dubbel, bewijsInOrde: advies.filter((a) => !a.length).length,
    bewijsGroot: groot.length, bewijsGrootZonderHandtekening: groot.filter((t) => bewijsAdvies(t, 1).some((a) => a.startsWith("handtekening"))).length,
    ruilInOmzet: Object.fromEntries([2027, 2028].map((j) => [j, rond2(dagen.filter((d) => d.datum.startsWith(`${j}-`)).reduce((x, d) => x + d.ruil, 0))])),
    beurzenKasOnderNul: meldingen.length, meldingen,
    opslag: {
      exemplarenKB: Math.round(bytes(v.exemplaren) / 1024), transactiesKB: Math.round(bytes(lijst) / 1024), artikelenKB: Math.round(bytes(v.artikelen) / 1024),
      perExemplaarB: Math.round(bytes(v.exemplaren) / v.exemplaren.length), perTransactieB: Math.round(bytes(lijst) / lijst.length),
      allesKB: Math.round(kopie / 1024), kopieOpGsmKB: Math.round(kopieNu / 1024), fotos: fotoAantal, fotosMB_bij250kB: Math.round((fotoAantal * 250) / 1024),
    },
    grens2028: vrijstellingsGrens(2028, START),
  };
  mkdirSync(".tests", { recursive: true });
  writeFileSync(".tests/tweejaar-rapport.json", JSON.stringify(rapportAlles, null, 2));
  assert.equal(dubbel, 0, "elk aankoopbewijs heeft een eigen nummer");
});
