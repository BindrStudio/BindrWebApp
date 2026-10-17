// Boekhouding voor een zelfstandige in bijberoep (België, btw-vrijgesteld, Dexxter).
// Enkel rekenwerk: wat elke transactie betekent voor de dagontvangsten en de kosten, de
// dagrapporten, het borderel, de jaaromzet tegenover de vrijstellingsgrens en de voorraad
// op een datum. Bronnen en de punten om met een boekhouder na te kijken: zie de README.
import type { Artikel, Beurs, Exemplaar, Regel, Tegenpartij, Transactie } from "../types";
import { rond2, verwervingen } from "./kassa";

export { verwervingen };
import { dagVan } from "./format";

const som = (xs: number[]) => rond2(xs.reduce((a, b) => a + b, 0));

/** Een stuk boven dit bedrag krijgt een eigen lijn in het dagontvangstenboek (sinds 1/1/2026; vroeger € 250). */
export const EIGEN_LIJN = 500;
/** De btw-vrijstellingsregeling voor kleine ondernemingen: jaaromzet tot € 25.000. */
export const VRIJSTELLING = 25000;

export { dagVan };

// ── Eén transactie in de boekhouding ─────────────────────────────────────────

export interface Boeking {
  ontvangst: number;   // dagontvangst: wat we verkochten (ook geruild, aan de afgesproken prijs); retour = negatief
  aankoop: number;     // kost: wat we kochten (ook geruild, aan de waarde die we gaven); teruggegeven = negatief
  natura: number;      // het deel dat in kaarten betaald werd (ruil)
  inbreng: number;     // privé → zaak: een kost, betaald met privémiddelen
  onttrekking: number; // zaak → privé, aan aankoopwaarde: neutraliseert de kost (geen omzet)
  cash: number;
  sumup: number;
  bank: number;
}

const NUL: Boeking = { ontvangst: 0, aankoop: 0, natura: 0, inbreng: 0, onttrekking: 0, cash: 0, sumup: 0, bank: 0 };

/**
 * Een ruil boeken we als twee handelingen aan de afgesproken waarde: onze kaart als verkoop
 * (ontvangst) en hun kaart als aankoop (kost). Het verschil is wat er bijbetaald werd.
 * Een kasbeweging (wisselgeld, geld bijleggen) is geen omzet en geen kost.
 */
const inConflict = (t: Transactie, r: Regel) => t.soort === "prive" && !!r.exemplaar_id && t.conflicten.some((c) => c.exemplaar_id === r.exemplaar_id);

export function boeking(t: Transactie): Boeking {
  if (t.status === "ongedaan" || t.soort === "kas") return NUL;
  const uit = som(t.regels.filter((r) => r.richting === "uit" && !inConflict(t, r)).map((r) => r.prijs));
  const binnen = som(t.regels.filter((r) => r.richting === "in" && !inConflict(t, r)).map((r) => r.prijs));
  const geld = { cash: t.cash, sumup: t.sumup, bank: t.bank ?? 0, inbreng: 0, onttrekking: 0 };
  if (t.soort === "prive") return { ...NUL, inbreng: binnen, onttrekking: uit };
  if (t.soort === "retour") {
    // Onze stukken komen terug (in): minder ontvangsten. Hun stukken gaan terug (uit): minder aankopen.
    // De ontvangst volgt uit wat er echt betaald werd (een afgesproken bedrag kan afwijken):
    // ontvangst − aankoop = het geld, dus ontvangst = totaal + aankoop.
    const aankoop = rond2(-uit);
    return { ...geld, aankoop, ontvangst: rond2(t.totaal + aankoop), natura: 0 };
  }
  return { ...geld, ontvangst: uit, aankoop: binnen, natura: t.soort === "ruil" ? Math.min(uit, binnen) : 0 };
}

// ── Dagontvangsten ───────────────────────────────────────────────────────────

export interface EigenLijn { omschrijving: string; code: string | null; bedrag: number; transactie_id: string }

export interface Dag {
  datum: string;
  verkopen: number;      // ontvangsten uit verkoop (geld)
  ruil: number;          // ontvangsten uit ruil (onze kant, aan de afgesproken prijs)
  retour: number;        // terugbetaald (negatief)
  ontvangsten: number;   // verkopen + ruil + retour: dit gaat naar Dexxter
  eigenLijnen: EigenLijn[]; // stukken boven € 500: elk een eigen lijn
  rest: number;          // ontvangsten zonder de eigen lijnen
  aankopen: number;      // inkoop en ruil (hun kant), min wat we teruggaven
  aankopenGeld: number;  // waarvan inkoop voor geld (inkoop, en teruggedraaide inkopen)
  aankopenRuil: number;  // waarvan via ruil (de waarde van hun kaarten)
  aankopenFactuur: number; // waarvan met factuur (een vendor of webshop): die factuur geef je zelf in Dexxter in
  aankopenTegoed: number; // waarvan betaald met een tegoedbon (storecredit): een aankoop, de betaling volgt later in natura
  verkopenTegoed: number; // ontvangsten betaald met een tegoedbon (in natura, zoals een ruil): telt mee als omzet
  verzending: number;    // verzendkosten die de klant betaalde (online verkoop): omzet
  inbreng: number;       // uit privé ingebracht (kost, betaald met privémiddelen)
  onttrekking: number;   // naar privé, aan aankoopwaarde
  kaarten: number;       // ontvangsten uit kaarten en slabs
  artikels: number;      // ontvangsten uit artikels (binders, sealed, 3D-prints): omzet, geen winst
  cash: number;          // netto cash van de deals (zonder kasbewegingen)
  sumup: number;
  bank: number;
  kas: number;           // kasbewegingen: cash in (+) of uit (−) de koffer zonder verkoop
  kasSumup: number;      // SumUp van kasbewegingen (een andere stand die cash kreeg): geen omzet
  transacties: Transactie[];
  beurzen: string[];     // beurs-id's van die dag
}

const legeDag = (datum: string): Dag => ({
  datum, verkopen: 0, ruil: 0, retour: 0, ontvangsten: 0, eigenLijnen: [], rest: 0, aankopen: 0, aankopenGeld: 0, aankopenRuil: 0, aankopenFactuur: 0,
  aankopenTegoed: 0, verkopenTegoed: 0, verzending: 0,
  inbreng: 0, onttrekking: 0, kaarten: 0, artikels: 0, cash: 0, sumup: 0, bank: 0, kas: 0, kasSumup: 0, transacties: [], beurzen: [],
});

/** Alle dagen met transacties, de nieuwste eerst. */
export function dagontvangsten(transacties: Transactie[]): Dag[] {
  const dagen = new Map<string, Dag>();
  const perId = new Map(transacties.map((t) => [t.id, t]));
  // Een retour van een aankoop met factuur: die factuur (en een creditnota) ging apart in Dexxter, dus ook niet via de dagstaat.
  const viaFactuur = (t: Transactie) => metFactuur(t) || (t.soort === "retour" && t.regels.some((r) => r.richting === "uit" && !!r.van && !!perId.get(r.van) && metFactuur(perId.get(r.van)!)));
  for (const t of transacties) {
    if (t.status === "ongedaan") continue;
    const datum = dagVan(t.tijd);
    const d = dagen.get(datum) ?? legeDag(datum);
    dagen.set(datum, d);
    d.transacties.push(t);
    if (t.beurs_id && !d.beurzen.includes(t.beurs_id)) d.beurzen.push(t.beurs_id);
    if (t.soort === "kas") { d.kas += t.cash; d.kasSumup += t.sumup; continue; }
    const b = boeking(t);
    if (t.soort === "prive") { d.inbreng += b.inbreng; d.onttrekking += b.onttrekking; continue; }
    if (t.soort === "retour") d.retour += b.ontvangst;
    else if (t.soort === "ruil") d.ruil += b.ontvangst;
    else d.verkopen += b.ontvangst;
    d.aankopen += b.aankoop;
    // Storecredit: een inkoop betaald met een tegoedbon (het deel in tegoed), een verkoop betaald met tegoed.
    const tg = t.tegoed ?? 0;
    const inTegoed = t.soort === "inkoop" && tg < 0 ? Math.min(b.aankoop, -tg) : 0;
    if (tg > 0 && t.soort !== "retour") d.verkopenTegoed += tg;
    if (viaFactuur(t)) d.aankopenFactuur += b.aankoop;
    else if (t.soort === "ruil") d.aankopenRuil += b.aankoop; else { d.aankopenGeld += b.aankoop - inTegoed; d.aankopenTegoed += inTegoed; }
    // Verzendkosten (een regel zonder kaart of artikel): omzet, apart getoond.
    if (t.soort !== "retour") d.verzending += som(t.regels.filter((r) => r.richting === "uit" && r.extra === "verzending").map((r) => r.prijs));
    // Kaarten of artikels? (Een retour: wat terugkwam, telt negatief bij zijn soort.)
    const teken = t.soort === "retour" ? -1 : 1;
    const kant = t.soort === "retour" ? "in" : "uit";
    const art = som(t.regels.filter((r) => r.richting === kant && r.artikel_id).map((r) => r.prijs)) * teken;
    const extra = som(t.regels.filter((r) => r.richting === kant && r.extra).map((r) => r.prijs)) * teken;
    d.artikels += art;
    d.kaarten += b.ontvangst - art - extra;
    d.cash += b.cash; d.sumup += b.sumup; d.bank += b.bank;
    if (t.soort === "verkoop" || t.soort === "ruil") {
      for (const r of t.regels) {
        if (r.richting === "uit" && r.prijs / (r.aantal ?? 1) > EIGEN_LIJN) {
          d.eigenLijnen.push({ omschrijving: r.naam + (r.aantal && r.aantal > 1 ? ` × ${r.aantal}` : ""), code: r.code ?? null, bedrag: rond2(r.prijs), transactie_id: t.id });
        }
      }
    }
  }
  return [...dagen.values()].map((d) => {
    const ontvangsten = rond2(d.verkopen + d.ruil + d.retour);
    return {
      ...d,
      verkopen: rond2(d.verkopen), ruil: rond2(d.ruil), retour: rond2(d.retour), ontvangsten,
      rest: rond2(ontvangsten - som(d.eigenLijnen.map((l) => l.bedrag))),
      aankopen: rond2(d.aankopen), aankopenGeld: rond2(d.aankopenGeld), aankopenRuil: rond2(d.aankopenRuil), aankopenFactuur: rond2(d.aankopenFactuur),
      aankopenTegoed: rond2(d.aankopenTegoed), verkopenTegoed: rond2(d.verkopenTegoed), verzending: rond2(d.verzending),
      inbreng: rond2(d.inbreng), onttrekking: rond2(d.onttrekking), kaarten: rond2(d.kaarten), artikels: rond2(d.artikels),
      cash: rond2(d.cash), sumup: rond2(d.sumup), bank: rond2(d.bank),
      kas: rond2(d.kas), kasSumup: rond2(d.kasSumup),
      transacties: d.transacties.sort((a, b) => a.tijd.localeCompare(b.tijd)),
    };
  }).sort((a, b) => b.datum.localeCompare(a.datum));
}

/** Gekocht met een factuur (een vendor of webshop): die factuur geef je zelf in Dexxter in, niet via de dagstaat. */
export const metFactuur = (t: Transactie) => !!t.tegenpartij?.met_factuur && t.soort !== "retour";

/** De kosten van één dag voor Dexxter (uitgaven › aankoop van handelsgoederen): per soort één lijn. Zonder wat met factuur kwam. */
export function kostenLijnen(d: Dag, waar?: string): DexxterLijn[] {
  const w = waar ? ` (${waar})` : "";
  return [
    d.aankopenGeld ? { omschrijving: `Aankoop kaarten van particulieren${w}`, bedrag: d.aankopenGeld } : null,
    d.aankopenTegoed ? { omschrijving: `Aankoop kaarten tegen tegoedbon${w}`, bedrag: d.aankopenTegoed } : null,
    d.aankopenRuil ? { omschrijving: `Inkoop via ruil${w}`, bedrag: d.aankopenRuil } : null,
    d.inbreng ? { omschrijving: "Inbreng kaarten uit privé (betaald met privémiddelen)", bedrag: d.inbreng } : null,
  ].filter(Boolean) as DexxterLijn[];
}

/** Wat je in Dexxter ingeeft voor één dag: elke lijn is één inschrijving bij de dagontvangsten. */
export interface DexxterLijn { omschrijving: string; bedrag: number }

export function dexxterLijnen(d: Dag, beursNaam?: string): DexxterLijn[] {
  const waar = beursNaam ? ` (${beursNaam})` : "";
  const lijnen: DexxterLijn[] = d.eigenLijnen.map((l) => ({ omschrijving: `${l.omschrijving}${l.code ? ` · ${l.code}` : ""}`, bedrag: l.bedrag }));
  // Apart: wat met een tegoedbon betaald werd (geen geld, wel omzet) en de verzendkosten (online verkoop).
  // (Nooit meer apart dan er in de rest zit: een stuk boven € 500 staat al op een eigen lijn.)
  const vz = Math.max(0, Math.min(d.verzending, rond2(d.rest - d.retour)));
  const tg = Math.max(0, Math.min(d.verkopenTegoed, rond2(d.rest - d.retour - vz)));
  const restZonderRetour = rond2(d.rest - d.retour - tg - vz);
  if (restZonderRetour !== 0 || (!lijnen.length && !tg && !vz)) lijnen.push({ omschrijving: `Verkoop kaarten en artikels${waar}`, bedrag: restZonderRetour });
  if (tg) lijnen.push({ omschrijving: `Verkoop betaald met tegoedbon${waar}`, bedrag: rond2(tg) });
  if (vz) lijnen.push({ omschrijving: "Verzendkosten aangerekend (online verkoop)", bedrag: rond2(vz) }); // nooit op een beurs
  if (d.retour !== 0) lijnen.push({ omschrijving: `Retour (terugbetaald)${waar}`, bedrag: d.retour });
  return lijnen;
}

// ── Jaaromzet en de vrijstellingsgrens ───────────────────────────────────────

/**
 * De grens voor dit jaar: € 25.000, in het startjaar pro rata per kalenderdag
 * (start op 1 juli 2026: 184 van 365 dagen = € 12.603).
 */
export function vrijstellingsGrens(jaar: number, start?: string | null): number {
  if (!start || Number(start.slice(0, 4)) !== jaar) return Number(start?.slice(0, 4)) > jaar ? 0 : VRIJSTELLING;
  const dagen = (jaar % 4 === 0 && jaar % 100 !== 0) || jaar % 400 === 0 ? 366 : 365;
  const eind = Date.UTC(jaar, 11, 31);
  const begin = Date.UTC(jaar, Number(start.slice(5, 7)) - 1, Number(start.slice(8, 10)));
  const over = Math.round((eind - begin) / 86400000) + 1;
  return Math.round((VRIJSTELLING * over) / dagen);
}

export interface Jaaromzet { jaar: number; omzet: number; grens: number; pct: number; tolerantie: number }

/** De omzet van een kalenderjaar (som van de dagontvangsten) tegenover de grens; tot 10% erboven mag nog. */
export function jaaromzet(dagen: Dag[], jaar: number, start?: string | null): Jaaromzet {
  const omzet = som(dagen.filter((d) => d.datum.startsWith(`${jaar}-`)).map((d) => d.ontvangsten));
  const grens = vrijstellingsGrens(jaar, start);
  return { jaar, omzet, grens, pct: grens > 0 ? Math.round((omzet / grens) * 100) : 0, tolerantie: Math.round(grens * 1.1) };
}

// ── Borderel ─────────────────────────────────────────────────────────────────

/** Heeft deze transactie een aankoopbewijs? Elke inkoop en ruil, en wat uit privé ingebracht werd. */
export const heeftBewijs = (t: Transactie) => t.status !== "ongedaan"
  && (t.soort === "inkoop" || t.soort === "ruil" || (t.soort === "prive" && t.regels.some((r) => r.richting === "in")));

/** AB-2026-7F3K2Q (aankoop), RB-… (ruil) of PB-… (privé): uniek per transactie, ook offline op drie gsm's tegelijk. */
export function bewijsNummer(t: Pick<Transactie, "id" | "soort" | "tijd">): string {
  const kort = t.id.replace(/-/g, "").slice(0, 6).toUpperCase();
  return `${t.soort === "ruil" ? "RB" : t.soort === "prive" ? "PB" : "AB"}-${dagVan(t.tijd).slice(0, 4)}-${kort}`;
}

/** Vanaf dit bedrag (wat we betalen) raden we de volledige naam, de gemeente en een handtekening aan. */
export const BEWIJS_GROOT = 250;

/**
 * Wat het aankoopbewijs sterker maakt (leeg = in orde). Niets is verplicht aan de stand: de lijst met
 * codes, marktwaarde, percentage, prijs en een foto is het bewijs. Een naam (minstens een voornaam) en
 * een foto raden we altijd aan; vanaf € 250 ook de gemeente en een handtekening (of een overschrijving).
 */
export function bewijsAdvies(t: Transactie, fotos: number): string[] {
  if (t.soort === "prive") return fotos || !t.regels.some((r) => r.richting === "in") ? [] : ["screenshot van de marktwaarde"];
  const p: Tegenpartij = t.tegenpartij ?? {};
  const advies: string[] = [];
  // Met factuur: die factuur is het bewijs.
  if (p.met_factuur) return p.factuur?.trim() ? [] : ["factuurnummer"];
  if (!fotos) advies.push("foto van de kaarten");
  if (!p.naam?.trim()) advies.push("naam van de verkoper");
  if (p.type === "handelaar") {
    if (!p.factuur?.trim()) advies.push("factuurnummer");
    return advies;
  }
  const bedrag = t.regels.filter((r) => r.richting === "in").reduce((x, r) => x + r.prijs, 0);
  if (bedrag >= BEWIJS_GROOT) {
    if (!p.adres?.trim()) advies.push("gemeente");
    if (!veiligPad(p.handtekening) && !t.bank) advies.push("handtekening (of betaal per overschrijving)");
  }
  return advies;
}

/** Een handtekening is een SVG-pad met enkel M/L en getallen (nooit iets anders tonen). */
export function veiligPad(d: string | null | undefined): string | null {
  return typeof d === "string" && d.length <= 12000 && /^[ML0-9 .-]+$/.test(d) ? d : null;
}

/** Hoogstens zoveel tekens: twee handtekeningen passen dan ruim in het borderel (en `veiligPad` aanvaardt ze). */
export const MAX_PAD = 9000;

/** De lijnen als SVG-pad. Te lang (een lange, krullende handtekening)? Dan minder punten, dezelfde vorm. */
export function maakPad(lijnen: [number, number][][]): string {
  const teken = (stap: number) => lijnen.filter((l) => l.length).map((l) => {
    const p = l.length === 1 ? [l[0], [l[0][0] + 1, l[0][1]] as [number, number]] : l.filter((_, i) => i % stap === 0 || i === l.length - 1);
    return p.map(([x, y], i) => `${i ? "L" : "M"}${x} ${y}`).join(" ");
  }).join(" ");
  for (let stap = 1; stap <= 64; stap *= 2) {
    const pad = teken(stap);
    if (pad.length <= MAX_PAD) return pad;
  }
  return ""; // zelfs zo te lang (kan bijna niet): opnieuw tekenen
}

/** Eén lijn op het borderel: wat we kregen, met de marktwaarde, het percentage en wat we betaalden. */
export interface BorderelLijn {
  naam: string; code: string | null; omschrijving: string; markt: number | null; bron: string | null; pct: number | null; prijs: number; aantal: number;
}

export function borderelLijnen(regels: Regel[], richting: "in" | "uit"): BorderelLijn[] {
  return regels.filter((r) => r.richting === richting).map((r) => {
    const n = r.nieuw;
    const omschrijving = n
      ? [n.set_naam, [n.set_code, n.nummer].filter(Boolean).join(" "), n.taal, n.soort === "slab" ? [n.grader, n.grade, n.cert ? `cert ${n.cert}` : null].filter(Boolean).join(" ") : n.conditie, n.variant !== "normaal" ? n.variant : null]
        .filter(Boolean).join(" · ")
      : r.omschrijving ?? (r.aantal && r.aantal > 1 ? `${r.aantal} stuks` : "");
    const markt = richting === "in" ? r.referentie ?? null : r.hartjesprijs ?? null;
    return {
      naam: r.naam, code: r.code ?? null, omschrijving, markt, bron: richting === "in" ? r.referentie_bron ?? null : "onze prijs",
      pct: markt && markt > 0 ? Math.round((r.prijs / markt) * 100) : null, prijs: rond2(r.prijs), aantal: r.aantal ?? 1,
    };
  });
}

// ── Voorraad op een datum (inventaris) ───────────────────────────────────────

export interface VoorraadLijn {
  id: string;
  code: string | null;
  omschrijving: string;
  soort: string;
  aantal: number;
  aankoopdatum: string | null;
  herkomst: string;
  borderel: string | null;
  waarde: number;          // aankoopwaarde (kostprijs) van de hele lijn
  zonderWaarde: boolean;   // geen aankoopprijs gekend
  zonderAankoop: boolean;  // een kaart die zelf werd toegevoegd, zonder aankoop of inbreng in de app
}

export interface Inventaris {
  datum: string; lijnen: VoorraadLijn[]; totaal: number; zonderWaarde: number;
  /** Zelf toegevoegde kaarten zonder aankoop of inbreng in de app: gekocht met een factuur buiten de app, of nog in te brengen. */
  zonderAankoop: { aantal: number; waarde: number };
}

/** Een zelf toegevoegde kaart die met een factuur gekocht werd (de kost staat al in Dexxter). */
export const metFactuurBron = (bron: string | null | undefined) => /^factuur/i.test((bron ?? "").trim());

/** Het aantal van een artikel op het einde van `datum`, zonder de kassa: wat er met de hand bij of af ging na die dag, teruggedraaid. */
function tellingenNa(a: Artikel, datum: string): number {
  return (a.details?.tellingen ?? []).filter((x) => dagVan(x.op) > datum).reduce((s, x) => s + x.delta, 0);
}

/**
 * Wat er op het einde van `datum` in voorraad was, aan aankoopwaarde. Vertrekt van nu en draait
 * de transacties van na die datum terug. Exemplaren die zonder transactie de voorraad verlieten
 * ("weg"), tellen mee als dat na de datum gebeurde. Bij artikels kennen we enkel de wijzigingen
 * via de kassa: het aantal met de hand aanpassen staat niet in de historiek.
 */
export function voorraadOp(datum: string, exemplaren: Exemplaar[], artikelen: Artikel[], transacties: Transactie[]): Inventaris {
  const na = transacties.filter((t) => t.status !== "ongedaan" && t.soort !== "kas" && dagVan(t.tijd) > datum)
    .sort((a, b) => a.tijd.localeCompare(b.tijd));
  // Per exemplaar: de eerste transactie na de datum zegt hoe het er op die datum bij lag.
  const eerste = new Map<string, "was-in" | "was-uit">();
  const aangemaaktDoor = verwervingen(transacties);
  for (const t of na) {
    for (const r of t.regels) {
      const id = r.exemplaar_id ?? null;
      if (!id || eerste.has(id) || t.conflicten.some((c) => c.exemplaar_id === id)) continue;
      if (t.soort === "retour") eerste.set(id, r.richting === "in" ? "was-uit" : "was-in");
      else if (r.richting === "uit") eerste.set(id, "was-in");
    }
  }
  const lijnen: VoorraadLijn[] = [];
  for (const e of exemplaren) {
    const t = aangemaaktDoor.get(e.id);
    // Nog niet in de zaak: aangemaakt na de datum, of pas na de datum uit privé ingebracht.
    if (dagVan(t?.tijd ?? e.aangemaakt_op) > datum) continue;
    const toen = eerste.get(e.id);
    // Uit de voorraad gehaald zonder transactie: afgeboekt_op (oudere gegevens: het laatste moment dat het wijzigde).
    const weg = e.afgeboekt_op ?? (e.transactie_id ? null : e.gewijzigd_op);
    const inVoorraad = toen ? toen === "was-in"
      : e.status === "in voorraad" ? true
        : !!weg && dagVan(weg) > datum;
    if (!inVoorraad) continue;
    lijnen.push({
      id: e.id, code: e.code, soort: e.soort,
      omschrijving: [e.naam, [e.set_code, e.nummer].filter(Boolean).join(" "), e.taal, e.soort === "slab" ? [e.grader, e.grade].filter(Boolean).join(" ") : e.conditie].filter(Boolean).join(" · "),
      aantal: 1, aankoopdatum: t ? dagVan(t.tijd) : e.aankoopdatum, herkomst: t ? (t.soort === "ruil" ? "ruil" : t.soort === "prive" ? "uit privé" : "aankoop") : e.aankoopbron || "zelf toegevoegd",
      borderel: t ? bewijsNummer(t) : null, waarde: rond2(e.aankoopprijs ?? 0), zonderWaarde: e.aankoopprijs == null, zonderAankoop: !t && e.soort !== "eigen product" && !metFactuurBron(e.aankoopbron),
    });
  }
  // Artikels: het aantal van nu, min wat er na de datum binnenkwam, plus wat er na de datum uitging.
  const verschil = new Map<string, number>();
  for (const t of na) {
    for (const r of t.regels) {
      if (!r.artikel_id) continue;
      if (t.conflicten.some((c) => c.artikel_id === r.artikel_id)) continue;
      const n = r.aantal ?? 1;
      // Wat er na de datum binnenkwam, was er toen nog niet; wat er na de datum uitging, wel.
      verschil.set(r.artikel_id, (verschil.get(r.artikel_id) ?? 0) + (r.richting === "in" ? -n : n));
    }
  }
  for (const a of artikelen) {
    if (a.aangemaakt_op && dagVan(a.aangemaakt_op) > datum) continue; // bestond toen nog niet
    // Ook wat er na de datum met de hand bij of af ging (bijgekocht, kapot, pack geopend) draaien we terug.
    const aantal = Math.max(0, a.aantal + (verschil.get(a.id) ?? 0) - tellingenNa(a, datum));
    if (!aantal) continue;
    lijnen.push({
      id: a.id, code: null, omschrijving: a.naam, soort: a.details?.type ?? a.soort, aantal, aankoopdatum: null,
      herkomst: a.soort === "eigen product" ? "eigen productie" : "aankoop", borderel: null,
      waarde: rond2((a.aankoopprijs ?? 0) * aantal), zonderWaarde: a.aankoopprijs == null, zonderAankoop: false,
    });
  }
  lijnen.sort((x, y) => x.omschrijving.localeCompare(y.omschrijving));
  const zonder = lijnen.filter((l) => l.zonderAankoop);
  return {
    datum, lijnen, totaal: som(lijnen.map((l) => l.waarde)), zonderWaarde: lijnen.filter((l) => l.zonderWaarde).length,
    zonderAankoop: { aantal: zonder.length, waarde: som(zonder.map((l) => l.waarde)) },
  };
}

// ── CSV ──────────────────────────────────────────────────────────────────────

/** Een CSV-cel; formules (=, +, −, @) worden tekst, zodat Excel niets uitvoert. */
export function cel(v: string | number | null | undefined): string {
  if (v == null) return "";
  if (typeof v === "number") return String(v).replace(".", ",");
  const s = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export const csv = (rijen: (string | number | null | undefined)[][]) => rijen.map((r) => r.map(cel).join(";")).join("\n");

// ── Waar het gebeurde ────────────────────────────────────────────────────────

export const KANAAL: Record<NonNullable<Tegenpartij["kanaal"]>, string> = {
  beurs: "Beurs", online: "Online (Instagram, Facebook, Vinted …)", rommelmarkt: "Rommelmarkt", andere: "Andere",
};

/** Waar een transactie gebeurde: de beurs, of het kanaal dat bij het afrekenen gekozen werd (buiten een beurs). */
export function waarGekocht(t: Transactie, beurzen: Beurs[]): string {
  const b = beurzen.find((x) => x.id === t.beurs_id);
  if (b) return b.naam;
  if (t.soort === "prive") return t.regels.some((r) => r.richting === "in") ? "uit privé" : "naar privé";
  const k = t.tegenpartij?.kanaal;
  return k ? KANAAL[k].replace(/ \(.*\)/, "") : "buiten een beurs";
}
