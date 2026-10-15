import { DATA } from "../config";

// [trend, laagste, gem30, trendHolo, laagsteHolo, gem30Holo]
export type PrijsRegel = (number | null)[];

export interface Prijsgids {
  datum: string;
  prijzen: Map<number, PrijsRegel>;
}

interface PrijsBestand {
  datum: string;
  velden: string[];
  p: Record<string, PrijsRegel>;
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
      return { datum: b.datum, prijzen };
    })
    .catch(() => null);
  return cache;
}
