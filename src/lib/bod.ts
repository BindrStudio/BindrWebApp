// Een bod doen op de kaarten van een klant: de marktwaarde (Cardmarket, met conditie),
// een percentage (ruil 80%, inkoop 70%) en ronde bedragen om voor te stellen.
// Enkel rekenwerk voor het mandje; de boeking zelf blijft in kassa.ts.
import type { Regel } from "../types";
import { verdeelTotaal } from "./pricing";

const rond2 = (x: number) => Math.round(x * 100) / 100;

export interface Marktwaarde {
  totaal: number;     // som van de referenties
  kaarten: number;    // kaarten met een marktprijs
  zonder: number;     // kaarten zonder marktprijs (die prijs je zelf)
  bod: number;        // wat we nu bieden voor de kaarten met een marktprijs
}

const metRef = (r: Regel) => r.richting === "in" && (r.referentie ?? 0) > 0;

export function marktwaarde(regels: Regel[]): Marktwaarde {
  const binnen = regels.filter((r) => r.richting === "in");
  const ref = binnen.filter(metRef);
  return {
    totaal: rond2(ref.reduce((s, r) => s + (r.referentie ?? 0), 0)),
    kaarten: ref.length,
    zonder: binnen.length - ref.length,
    bod: rond2(ref.reduce((s, r) => s + r.prijs, 0)),
  };
}

/** Het percentage van de marktwaarde, afgerond op een heel getal. */
export function procentVan(bod: number, waarde: number): number {
  return waarde > 0 ? Math.round((bod / waarde) * 100) : 0;
}

/**
 * Ronde bedragen in de buurt van het exacte bod. Onder 20 euro op de hele en halve euro,
 * tot 200 euro op 5, daarboven op 10. 70% van 183 = 128,10 geeft 125, 128 en 130.
 * Nooit meer dan `max` (de marktwaarde zelf): boven 100% bieden doen we niet per ongeluk.
 */
export function bodVoorstellen(exact: number, max = Infinity): number[] {
  if (!(exact > 0)) return [];
  const kandidaten = exact < 20
    ? [Math.floor(exact), Math.floor(exact) + 0.5, Math.ceil(exact)]
    : (() => {
      const stap = exact >= 200 ? 10 : 5;
      return [Math.floor(exact / stap) * stap, Math.floor(exact), Math.round(exact), Math.ceil(exact / stap) * stap];
    })();
  const uniek = [...new Set(kandidaten.filter((x) => x > 0 && x <= max))];
  return uniek.sort((a, b) => Math.abs(a - exact) - Math.abs(b - exact)).slice(0, 3).sort((a, b) => a - b);
}

/** Wat één kaart weegt in het bod: marktwaarde × (het eigen percentage van die kaart, of het algemene). */
export function bodGewicht(r: Regel, algemeen: number): number {
  return metRef(r) ? ((r.referentie ?? 0) * (r.pct ?? algemeen)) / 100 : 0;
}

/** Het exacte bod: per kaart de marktwaarde × het percentage, samen. */
export function exactBod(regels: Regel[], algemeen: number): number {
  return rond2(regels.reduce((s, r) => s + bodGewicht(r, algemeen), 0));
}

/** Heeft minstens één kaart een eigen percentage? */
export const heeftEigenPct = (regels: Regel[]) => regels.some((r) => metRef(r) && r.pct != null);

/** Het percentage van alles samen, met de eigen percentages per kaart (bv. 80, 80 en 70 → 77). */
export function samenPct(regels: Regel[], algemeen: number): number {
  const m = marktwaarde(regels).totaal;
  return m > 0 ? Math.round((exactBod(regels, algemeen) / m) * 100) : algemeen;
}

/**
 * Een bod verdelen over de kaarten met een marktprijs, in verhouding tot marktwaarde × percentage
 * (op de cent, het verschil naar de duurste). Kaarten zonder marktprijs houden de waarde die je zelf gaf.
 * Zonder eigen percentages per kaart is dat gewoon in verhouding tot de marktwaarde.
 */
export function pasBodToe(regels: Regel[], bod: number, algemeen = 100): Regel[] {
  const idx = regels.map((r, i) => (metRef(r) ? i : -1)).filter((i) => i >= 0);
  if (!idx.length) return regels;
  const delen = verdeelTotaal(idx.map((i) => bodGewicht(regels[i], algemeen)), rond2(bod));
  const uit = regels.slice();
  idx.forEach((i, j) => { uit[i] = { ...uit[i], prijs: delen[j] }; });
  return uit;
}

// ── Het bod zoals aan de stand: marktwaarde × percentage, dan afronden ───────

/** Hoe het bod afgerond wordt. "eigen" = een bedrag dat de beheerder zelf typte. */
export type Afronding = "exact" | "omlaag" | "omhoog" | "omlaag5" | "omhoog5" | "eigen";

export interface BodInstelling {
  pct?: number | null;       // 65–95, in stappen van 5 (leeg = standaard voor inkoop of ruil)
  afronding: Afronding;
  eigen?: number | null;     // bij "eigen"
  perKaart?: boolean;        // per kaart een eigen percentage kiezen (Regel.pct)
}

export const PCT_MIN = 65;
export const PCT_MAX = 95;

/** Het bedrag bij een afronding (op hele euro of op 5 euro). */
export function afgerond(exact: number, a: Exclude<Afronding, "eigen">): number {
  const e = rond2(exact);
  switch (a) {
    case "omlaag": return Math.floor(e + 1e-9);
    case "omhoog": return Math.ceil(e - 1e-9);
    case "omlaag5": return Math.floor(e / 5 + 1e-9) * 5;
    case "omhoog5": return Math.ceil(e / 5 - 1e-9) * 5;
    default: return e;
  }
}

/** Wat we bieden voor de kaarten met een marktwaarde (marktwaarde × percentage, dan afgerond). */
export function bodBedrag(markt: number, pct: number, b: BodInstelling): number {
  return bodVanExact(rond2((markt * pct) / 100), b);
}

/** Het exacte bod afronden zoals gekozen (of het eigen bedrag). */
export function bodVanExact(exactBedrag: number, b: BodInstelling): number {
  if (b.afronding === "eigen" && b.eigen != null && b.eigen >= 0) return rond2(b.eigen);
  const exact = rond2(exactBedrag);
  let a: Exclude<Afronding, "eigen"> = b.afronding === "eigen" ? "exact" : b.afronding;
  // Op 5 euro afronden enkel vanaf 20 euro; en nooit naar 0 euro voor kaarten die iets waard zijn.
  if (exact < 20 && a === "omlaag5") a = "omlaag";
  if (exact < 20 && a === "omhoog5") a = "omhoog";
  const bedrag = afgerond(exact, a);
  return bedrag <= 0 && exact > 0 ? afgerond(exact, exact >= 1 ? "omlaag" : "exact") || exact : bedrag;
}

/** De afrondingen die we tonen: op de euro, en vanaf 20 euro ook op 5 euro. Zonder dubbels. */
export function afrondKeuzes(exact: number, gekozen?: Afronding): { afronding: Exclude<Afronding, "eigen">; bedrag: number }[] {
  const lijst: { afronding: Exclude<Afronding, "eigen">; bedrag: number }[] = [];
  const voeg = (a: Exclude<Afronding, "eigen">) => {
    const bedrag = afgerond(exact, a);
    if (bedrag <= 0) return;
    const i = lijst.findIndex((x) => x.bedrag === bedrag);
    if (i < 0) lijst.push({ afronding: a, bedrag });
    else if (a === gekozen) lijst[i] = { afronding: a, bedrag }; // zelfde bedrag: toon de gekozen afronding
  };
  if (exact >= 20) voeg("omlaag5");
  voeg("omlaag");
  voeg("exact");
  voeg("omhoog");
  if (exact >= 20) voeg("omhoog5");
  return lijst.sort((a, b) => a.bedrag - b.bedrag);
}
