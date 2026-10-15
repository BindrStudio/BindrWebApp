// Wat de Cardmarket-prijsgids zegt over één kaart en over haar set: de prijzen,
// of het stijgt of daalt (met een knipoog), en een link naar de goedkoopste
// aanbiedingen in België en Nederland. Enkel de publieke prijsgids, geen scraping.
import type { Prijsgids } from "./prices";
import { prijsVoor } from "./pricing";

export type Richting = "hard-op" | "op" | "stabiel" | "neer" | "hard-neer";

export interface Marktinfo {
  trend: number | null;
  laagste: number | null;
  gem1: number | null;
  gem7: number | null;
  gem30: number | null;
  holo: boolean;
  verandering: number | null; // deze week (of de trend) t.o.v. de maand, bv. 0.08 = +8%
  basis: "week" | "trend";
  richting: Richting | null;  // null: te weinig gegevens of te goedkoop om iets te zeggen
}

/** Grenzen: vanaf 8% spreken we van stijgen of dalen, vanaf 25% van hard. */
export function richtingVan(verandering: number | null): Richting | null {
  if (verandering == null || !Number.isFinite(verandering)) return null;
  if (verandering >= 0.25) return "hard-op";
  if (verandering >= 0.08) return "op";
  if (verandering <= -0.25) return "hard-neer";
  if (verandering <= -0.08) return "neer";
  return "stabiel";
}

export function marktinfo(cardmarketId: number | null, variant: string, gids: Prijsgids | null): Marktinfo | null {
  if (!gids || !cardmarketId) return null;
  const holo = variant === "reverse holo" || variant === "holo";
  const p = prijsVoor(gids.prijzen.get(cardmarketId), holo);
  if (!p) return null;
  const nu = p.gem7 ?? p.trend;
  const basis = p.gem7 != null ? "week" : "trend";
  // Onder 50 cent zegt een procent weinig: een paar centen verschil is al snel 20%.
  const verandering = nu != null && p.gem30 != null && p.gem30 >= 0.5 ? nu / p.gem30 - 1 : null;
  return { ...p, verandering, basis, richting: richtingVan(verandering) };
}

export interface SetTrend {
  verandering: number;
  richting: Richting;
  kaarten: number; // met een bruikbare prijs
}

/**
 * Hoe de set in zijn geheel beweegt: de waarde van alle kaarten deze week (of volgens de trend)
 * tegenover hun gemiddelde van de maand, gewogen naar prijs. Zo tellen dure kaarten mee zoals op de markt.
 */
export function setTrend(cardmarketIds: number[], gids: Prijsgids | null): SetTrend | null {
  if (!gids) return null;
  let nu = 0, maand = 0, n = 0;
  for (const id of new Set(cardmarketIds)) {
    const p = prijsVoor(gids.prijzen.get(id), false);
    if (!p || p.gem30 == null || p.gem30 < 0.25) continue;
    const x = p.gem7 ?? p.trend;
    if (x == null) continue;
    nu += x;
    maand += p.gem30;
    n++;
  }
  if (n < 5 || maand <= 0) return null;
  const verandering = nu / maand - 1;
  return { verandering, richting: richtingVan(verandering)!, kaarten: n };
}

const GRAPJES: Record<Richting, string[]> = {
  "hard-op": [
    "Deze kaart gebruikt Agility: de prijs schiet omhoog.",
    "Hou ze goed vast, deze vliegt.",
    "Stijgt sneller dan een Rayquaza naar de ozonlaag.",
  ],
  op: [
    "Klimt gestaag, zoals een Snorlax die eindelijk opstaat.",
    "Gaat rustig de goede kant op.",
    "Een beetje Growth gebruikt: de prijs groeit.",
  ],
  stabiel: [
    "Stabiel als een Onix.",
    "Zo kalm als een slapende Snorlax.",
    "Niets nieuws: de prijs ligt stil.",
  ],
  neer: [
    "Zakt een beetje. Misschien nog even wachten met inkopen?",
    "Gaat licht omlaag, zoals een Psyduck met hoofdpijn.",
    "Een tikje lager dan vorige maand.",
  ],
  "hard-neer": [
    "Deze kaart gebruikte Splash... en zakt hard.",
    "Zakt als een Diglett onder de grond.",
    "Vrije val: goedkoop inkopen, voorzichtig verkopen.",
  ],
};

/** Altijd hetzelfde grapje voor dezelfde kaart, zodat het niet verspringt. */
export function grapje(richting: Richting, sleutel: string | number): string {
  const s = String(sleutel);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  const lijst = GRAPJES[richting];
  return lijst[h % lijst.length];
}

export const RICHTING_TEKST: Record<Richting, string> = {
  "hard-op": "Stijgt hard",
  op: "Stijgend",
  stabiel: "Stabiel",
  neer: "Dalend",
  "hard-neer": "Daalt hard",
};

export function procent(x: number): string {
  const p = Math.round(x * 100);
  return `${p > 0 ? "+" : p < 0 ? "−" : "±"}${Math.abs(p)}%`;
}

// ── Link naar Cardmarket ─────────────────────────────────────────────────────
// Filters op de productpagina van Cardmarket: taal van de kaart, minstens Near Mint,
// verkopers uit België (2) en/of Nederland (23). De aanbiedingen staan van goedkoop naar duur.
const CM_TAAL: Record<string, number> = { EN: 1, FR: 2, DE: 3, ES: 4, IT: 5, "CN-S": 6, JP: 7, PT: 8, KR: 10, "CN-T": 11 };
export const CM_LAND = { BE: 2, NL: 23 } as const;

export function cardmarketLink(cardmarketId: number, taal: string, landen: (keyof typeof CM_LAND)[] = ["BE", "NL"], minConditie = 2): string {
  const q = new URLSearchParams({ idProduct: String(cardmarketId) });
  const t = CM_TAAL[taal];
  if (t) q.set("language", String(t));
  q.set("minCondition", String(minConditie));
  if (landen.length) q.set("sellerCountry", landen.map((l) => CM_LAND[l]).join(","));
  return `https://www.cardmarket.com/en/Pokemon/Products?${q.toString().replace(/%2C/g, ",")}`;
}
