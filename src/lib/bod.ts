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
