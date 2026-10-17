import type { Exemplaar } from "../types";
import type { Prijsgids, PrijsRegel } from "./prices";

export interface Drempel {
  tot: number | null; // hartjesprijs onder dit bedrag (null = alles daarboven)
  verschil: number;   // voorstel pas vanaf dit verschil in euro
}

export interface Instellingen {
  drempels: Drempel[];
  conditiefactoren: Record<string, number>;
  nakijkenAfwijking: number; // trend, 7- en 30-dagengemiddelde liggen meer dan dit deel uit elkaar
  automatischPrinten: boolean;
  labelMaat: string; // id uit LABELMATEN
  labelDonkerte?: number;     // 1–5 zoals in de Niimbot-app (standaard 3), enkel op dit toestel
  labelVerschuiving?: number; // mm langs de doorvoer: + = lager op het label, − = hoger (stappen van 0,5)
  labelZijwaarts?: number;    // mm opzij: + = naar rechts (enkel bij twee labels per strook)
  labelTrager?: boolean;      // trager versturen als labels leeg of half uit de printer komen
  labelPrinter?: "niimbot" | "fichero"; // welke labelprinter dit toestel gebruikt (standaard de Niimbot)
  // De afstelling van de Fichero apart (de label…-velden hierboven zijn die van de Niimbot): wisselen van printer
  // laat de afstelling van de andere printer staan.
  labelFichero?: { donkerte?: number; verschuiving?: number; trager?: boolean };
  inkoopPct: number; // wat we bieden bij inkoop, in % van de marktwaarde
  ruilPct: number;   // wat een kaart van de klant waard is bij ruil, in %
  toonMarge?: boolean; // aankoopprijs en marge zichtbaar in de kassa (enkel op deze gsm)
}

export const STANDAARD_INSTELLINGEN: Instellingen = {
  drempels: [
    { tot: 5, verschil: 1 },
    { tot: 20, verschil: 2 },
    { tot: 50, verschil: 3 },
    { tot: 100, verschil: 5 },
    { tot: null, verschil: 10 },
  ],
  conditiefactoren: { M: 1, NM: 1, EX: 0.9, GD: 0.8, LP: 0.7, PL: 0.5, PO: 0.3 },
  nakijkenAfwijking: 0.3,
  automatischPrinten: false,
  labelMaat: "50x15",
  inkoopPct: 70,
  ruilPct: 80,
};

// Talen waarvoor de Cardmarket-prijsgids een bruikbare richtprijs geeft.
// Engels, en Japans omdat Cardmarket Japanse sets als aparte producten verkoopt.
const TALEN_MET_GIDS = new Set(["EN", "JP"]);

export function rondEuro(x: number): number {
  return Math.max(1, Math.round(x));
}

export interface Voorstel {
  voorstel: number;
  referentie: number;   // de marktprijs in NM (zie marktprijs)
  trend: number | null;
  laagste: number | null;
  gem7: number | null;
  gem30: number | null;
  factor: number;
  nakijken: boolean;    // = er staat minstens één reden in `waarom`
  waarom: Nakijken[];
  holo: boolean;
}

/** Waarom een voorstel nakijken vraagt (de uitleg staat in NAKIJKEN). */
export type Nakijken = "spreiding" | "gedeeld" | "nieuw" | "vintage";
export const NAKIJKEN: Record<Nakijken, string> = {
  spreiding: "Trend, 7- en 30-dagengemiddelde liggen ver uit elkaar.",
  gedeeld: "Cardmarket geeft één prijs voor meer dan één versie van deze kaart: kijk na of het de juiste is.",
  nieuw: "Nieuwe set: de prijzen zakken de eerste weken nog snel.",
  vintage: "Oude kaart: de gids telt ook mindere condities mee, in NM ligt de prijs vaak hoger.",
};

export function prijsVoor(regel: PrijsRegel | undefined, holo: boolean) {
  if (!regel) return null;
  const [trend, laagste, gem30, trendH, laagsteH, gem30H, gem1, gem7, gem1H, gem7H] = regel;
  if (holo && (trendH != null || gem30H != null)) {
    return { trend: trendH ?? null, laagste: laagsteH ?? null, gem30: gem30H ?? null, gem1: gem1H ?? null, gem7: gem7H ?? null, holo: true };
  }
  return { trend: trend ?? null, laagste: laagste ?? null, gem30: gem30 ?? null, gem1: gem1 ?? null, gem7: gem7 ?? null, holo: false };
}

/**
 * De marktprijs van een kaart in NM: de middelste van trend, gemiddelde van 7 dagen en van 30 dagen.
 * Ontbreekt er een van de drie (bv. geen verkoop deze week), dan zoals vroeger: de trend, anders het
 * gemiddelde van 30 of 7 dagen, anders de laagste prijs. Nooit onder de laagste prijs van de gids:
 * goedkoper dan het goedkoopste aanbod is geen marktprijs.
 *
 * Waarom de middelste: één cijfer alleen laat zich meetrekken. De trend reageert traag op een nieuwe set
 * en springt bij weinig verkopen; het weekgemiddelde springt bij één dure verkoop; het maandgemiddelde
 * hinkt achterop. De middelste van de drie negeert de uitschieter. Vergeleken met wat de kaarten echt
 * te koop staan in België en Nederland (de laagste NM-prijs bij TCGHeart, oktober 2026, 812 kaarten van
 * € 2 of meer) zat de trend alleen voor 61% binnen 15%, de middelste van de drie voor 66%; bij de nieuwe
 * set 30th Celebration 25% tegenover 82%. Waar het minder goed lukt (nieuwe sets, oude kaarten, een
 * prijs die bij meer kaarten hoort) zegt voorstelVoor "nakijken" met de reden (zie README, Prijzen).
 */
export function marktprijs(p: { trend: number | null; gem7?: number | null; gem30: number | null; laagste: number | null }): number | null {
  const ok = (x: number | null | undefined): x is number => x != null && x > 0;
  const gem7 = p.gem7 ?? null;
  let m: number | null = null;
  if (ok(p.trend) && ok(gem7) && ok(p.gem30)) m = [p.trend, gem7, p.gem30].sort((a, b) => a - b)[1];
  else for (const x of [p.trend, p.gem30, gem7, p.laagste]) if (ok(x)) { m = x; break; }
  if (m != null && ok(p.laagste) && p.laagste > m) m = p.laagste;
  return m;
}

/** Liggen trend, 7- en 30-dagengemiddelde zo ver uit elkaar dat de beheerder beter zelf kijkt? */
export function teNakijken(p: { trend: number | null; gem7?: number | null; gem30: number | null }, afwijking: number): boolean {
  const w = [p.trend, p.gem7 ?? null, p.gem30].filter((x): x is number => x != null && x > 0);
  if (w.length < 2) return false;
  const laag = Math.min(...w), hoog = Math.max(...w);
  return (hoog - laag) / laag > afwijking;
}

/** Het prijsvoorstel van de app voor één exemplaar, of null als de beheerder zelf moet prijzen. */
export function voorstelVoor(ex: Exemplaar, gids: Prijsgids | null, inst: Instellingen): Voorstel | null {
  if (!gids || ex.soort !== "kaart" || !ex.cardmarket_id) return null;
  if (!TALEN_MET_GIDS.has(ex.taal)) return null;
  const holo = ex.variant === "reverse holo" || ex.variant === "holo";
  const p = prijsVoor(gids.prijzen.get(ex.cardmarket_id), holo);
  if (!p) return null;
  const referentie = marktprijs(p);
  if (referentie == null) return null;
  const factor = inst.conditiefactoren[ex.conditie || "NM"] ?? 1;
  const id = ex.cardmarket_id;
  const waarom: Nakijken[] = [];
  if (teNakijken(p, inst.nakijkenAfwijking)) waarom.push("spreiding");
  if (gids.gedeeld?.has(id)) waarom.push("gedeeld");
  if (gids.nieuw?.has(id)) waarom.push("nieuw");
  if (gids.vintage?.has(id)) waarom.push("vintage");
  return {
    voorstel: rondEuro(referentie * factor), referentie, trend: p.trend, laagste: p.laagste, gem7: p.gem7, gem30: p.gem30,
    factor, nakijken: waarom.length > 0, waarom, holo: p.holo,
  };
}

export function drempelVoor(hartje: number, inst: Instellingen): number {
  for (const d of inst.drempels) if (d.tot == null || hartje < d.tot) return d.verschil;
  return inst.drempels[inst.drempels.length - 1].verschil;
}

export interface TeWijzigen {
  id: string;
  oud: number;
  nieuw: number;
  richting: "op" | "neer";
}

/** De herprijsknop: welke hartjes in de vitrine moeten wisselen. */
export function prijscheck(exemplaren: Exemplaar[], gids: Prijsgids | null, inst: Instellingen): TeWijzigen[] {
  const uit: TeWijzigen[] = [];
  for (const ex of exemplaren) {
    if (ex.opslag !== "vitrine") continue;
    if (ex.status !== "in voorraad") continue;
    if (ex.prijs_handmatig || ex.hartjesprijs == null) continue;
    const v = voorstelVoor(ex, gids, inst);
    if (!v) continue;
    const verschil = v.voorstel - ex.hartjesprijs;
    if (Math.abs(verschil) >= drempelVoor(ex.hartjesprijs, inst)) {
      uit.push({ id: ex.id, oud: ex.hartjesprijs, nieuw: v.voorstel, richting: verschil > 0 ? "op" : "neer" });
    }
  }
  return uit;
}

/**
 * Een nieuw totaal verdelen over meerdere kaarten, in verhouding tot hun prijs.
 * Rekent op de cent; een afrondingsverschil gaat naar de duurste kaart, zodat de som exact klopt.
 */
export function verdeelTotaal(prijzen: number[], nieuwTotaal: number): number[] {
  const totaal = prijzen.reduce((a, b) => a + b, 0);
  if (totaal <= 0) return prijzen.map(() => Math.round((nieuwTotaal / prijzen.length) * 100) / 100);
  const delen = prijzen.map((p) => Math.round(((p * nieuwTotaal) / totaal) * 100) / 100);
  const rest = Math.round((nieuwTotaal - delen.reduce((a, b) => a + b, 0)) * 100) / 100;
  if (rest !== 0) {
    let duurste = 0;
    prijzen.forEach((p, i) => { if (p > prijzen[duurste]) duurste = i; });
    delen[duurste] = Math.round((delen[duurste] + rest) * 100) / 100;
  }
  return delen;
}

/** De vault: welke exemplaren zijn volgens de prijsgids duidelijk meer waard dan genoteerd. */
export function waardeStijgers(exemplaren: Exemplaar[], gids: Prijsgids | null, inst: Instellingen): Map<string, TeWijzigen> {
  const uit = new Map<string, TeWijzigen>();
  for (const ex of exemplaren) {
    if (ex.opslag !== "stockdoos" || ex.status !== "in voorraad") continue;
    const v = voorstelVoor(ex, gids, inst);
    if (!v) continue;
    const basis = ex.verkoopprijs ?? ex.aankoopprijs;
    if (basis == null) continue;
    if (v.voorstel - basis >= drempelVoor(basis, inst)) uit.set(ex.id, { id: ex.id, oud: basis, nieuw: v.voorstel, richting: "op" });
  }
  return uit;
}
