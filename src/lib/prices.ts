import { DATA } from "../config";

// [trend, laagste, gem30, trendHolo, laagsteHolo, gem30Holo, gem1, gem7, gem1Holo, gem7Holo]
// (gem1 en gem7 kunnen ontbreken in een oudere prijsgids.)
export type PrijsRegel = (number | null)[];

export interface Prijsgids {
  datum: string;
  prijzen: Map<number, PrijsRegel>;
  // Cardmarket-ids om na te kijken (scripts/fetch-prices.mjs; leeg in een oudere prijsgids):
  gedeeld?: Set<number>;  // het product hoort bij meer dan één kaart uit de catalogus
  nieuw?: Set<number>;    // een set van minder dan 60 dagen oud
  vintage?: Set<number>;  // uitgebracht vóór 2004
}

interface PrijsBestand {
  datum: string;
  velden: string[];
  p: Record<string, PrijsRegel>;
  gedeeld?: number[];
  nieuw?: number[];
  vintage?: number[];
}

let cache: Promise<Prijsgids | null> | null = null;

/** Laadt de Cardmarket-prijsgids die de nachtelijke workflow publiceert. */
export function laadPrijsgids(vernieuw = false): Promise<Prijsgids | null> {
  if (cache && !vernieuw) return cache;
  cache = fetch(DATA.prijzen, { cache: vernieuw ? "reload" : "default" })
    .then((r) => (r.ok ? (r.json() as Promise<PrijsBestand>) : null))
    .then((b) => {
      if (!b) return null;
      const prijzen = new Map<number, PrijsRegel>();
      for (const [id, regel] of Object.entries(b.p)) prijzen.set(Number(id), regel);
      return { datum: b.datum, prijzen, gedeeld: new Set(b.gedeeld ?? []), nieuw: new Set(b.nieuw ?? []), vintage: new Set(b.vintage ?? []) };
    })
    .catch(() => null);
  return cache;
}
