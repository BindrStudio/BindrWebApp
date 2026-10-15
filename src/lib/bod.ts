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
 * Ronde bedragen in de buurt van het exacte bod: naar beneden en naar boven op 5 (of 10 boven
 * de 200 euro), en op de hele euro. 70% van 183 = 128,10 geeft 125, 128 en 130.
 */
export function bodVoorstellen(exact: number): number[] {
  if (!(exact > 0)) return [];
  const stap = exact >= 200 ? 10 : 5;
  const kandidaten = [Math.floor(exact / stap) * stap, Math.floor(exact), Math.round(exact), Math.ceil(exact / stap) * stap];
  const uniek = [...new Set(kandidaten.filter((x) => x > 0))];
  return uniek.sort((a, b) => Math.abs(a - exact) - Math.abs(b - exact)).slice(0, 3).sort((a, b) => a - b);
}

/**
 * Een bod verdelen over de kaarten met een marktprijs, in verhouding tot die prijs (op de cent,
 * het verschil naar de duurste). Kaarten zonder marktprijs houden de waarde die je zelf gaf.
 */
export function pasBodToe(regels: Regel[], bod: number): Regel[] {
  const idx = regels.map((r, i) => (metRef(r) ? i : -1)).filter((i) => i >= 0);
  if (!idx.length) return regels;
  const delen = verdeelTotaal(idx.map((i) => regels[i].referentie ?? 0), rond2(bod));
  const uit = regels.slice();
  idx.forEach((i, j) => { uit[i] = { ...uit[i], prijs: delen[j] }; });
  return uit;
}
