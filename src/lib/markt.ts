// Wat de Cardmarket-prijsgids zegt over één kaart en over haar set: de prijzen,
// of het stijgt of daalt (met een knipoog), en een link naar de goedkoopste
// aanbiedingen in België en Nederland. Enkel de publieke prijsgids, geen scraping.
import { KAART, kies, SET } from "./grapjes";
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

/** Altijd hetzelfde grapje voor dezelfde kaart, zodat het niet verspringt. */
export function grapje(richting: Richting, sleutel: string | number): string {
  return kies(KAART[richting], sleutel);
}

/** Een grapje bij de trend van een hele set. */
export function setGrapje(richting: Richting, sleutel: string): string {
  return kies(SET[richting], sleutel);
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

/** Sealed op Cardmarket: het product (als we het kennen) of anders een zoekopdracht op naam. */
export function cardmarketSealedLink(cardmarketId: number | null | undefined, naam: string, landen: (keyof typeof CM_LAND)[] = ["BE", "NL"]): string {
  if (cardmarketId) {
    const q = new URLSearchParams({ idProduct: String(cardmarketId) });
    if (landen.length) q.set("sellerCountry", landen.map((l) => CM_LAND[l]).join(","));
    return `https://www.cardmarket.com/en/Pokemon/Products?${q.toString().replace(/%2C/g, ",")}`;
  }
  return `https://www.cardmarket.com/en/Pokemon/Products/Search?${new URLSearchParams({ searchString: naam.trim() })}`;
}

// ── Graded: laatste verkopen opzoeken (enkel gewone links, geen scraping) ────

/** De zoektekst voor een graded kaart, bv. "Charizard ex 199/165 PSA 10". */
export function gradedZoektekst(k: { naam: string; nummer?: string | null; setTotaal?: string | number | null; set_code?: string | null; grader?: string | null; grade?: string | null }): string {
  const nr = k.nummer ? (k.setTotaal ? `${k.nummer}/${k.setTotaal}` : k.nummer) : "";
  return [k.naam, nr, k.grader, k.grade].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

/** Verkochte (afgelopen) advertenties op eBay, nieuwste eerst. */
export function ebaySoldLink(zoek: string, site: "com" | "de" | "nl" | "be" = "com"): string {
  const host = site === "be" ? "www.benl.ebay.be" : `www.ebay.${site}`;
  const q = new URLSearchParams({ _nkw: zoek, LH_Sold: "1", LH_Complete: "1", _sop: "13" });
  return `https://${host}/sch/i.html?${q}`;
}

/** Het certificaat van een slab bij de grader (PSA, CGC, BGS), als we het nummer hebben. */
export function certLink(grader: string | null | undefined, cert: string | null | undefined): string | null {
  const c = (cert ?? "").replace(/\D/g, "");
  if (!c) return null;
  const g = (grader ?? "").toUpperCase();
  if (g === "PSA") return `https://www.psacard.com/cert/${c}`;
  if (g === "CGC") return `https://www.cgccards.com/certlookup/${c}/`;
  if (g === "BGS" || g === "BECKETT") return `https://www.beckett.com/grading/card-lookup?item_type=BGS&item_id=${c}`;
  return null;
}

/**
 * Schatting uit zelf opgezochte verkopen: de mediaan, waarbij verkopen van de laatste
 * 30 dagen dubbel tellen. Null zonder verkopen.
 */
export function schattingUitVerkopen(verkopen: { datum: string; prijs: number }[], nu = Date.now()): number | null {
  const geldig = verkopen.filter((v) => Number.isFinite(v.prijs) && v.prijs > 0);
  if (!geldig.length) return null;
  const gewogen: number[] = [];
  for (const v of geldig) {
    gewogen.push(v.prijs);
    const dagen = (nu - Date.parse(v.datum + "T12:00:00")) / 86400000;
    if (dagen <= 30) gewogen.push(v.prijs);
  }
  gewogen.sort((a, b) => a - b);
  const m = gewogen.length / 2;
  const med = gewogen.length % 2 ? gewogen[Math.floor(m)] : (gewogen[m - 1] + gewogen[m]) / 2;
  return Math.round(med * 100) / 100;
}
