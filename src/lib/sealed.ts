// Sealed producten van Cardmarket (publieke productlijst + prijsgids), enkel geladen als
// iemand een sealed artikel opzoekt. Het bestand komt elke nacht mee met de prijsgids.
import { zonderAccenten } from "./format";

export interface SealedProduct {
  id: number;
  naam: string;
  categorie: string;
  trend: number | null;
  laagste: number | null;
  gem30: number | null;
}

let laden: Promise<{ datum: string; producten: SealedProduct[] } | null> | null = null;

export function laadSealed() {
  if (!laden) {
    laden = fetch("data/sealed.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => (j && Array.isArray(j.p)
        ? { datum: String(j.datum ?? ""), producten: (j.p as [number, string, string, number | null, number | null, number | null][]).map(([id, naam, categorie, trend, laagste, gem30]) => ({ id, naam, categorie, trend, laagste, gem30 })) }
        : null))
      .catch(() => null);
    laden.then((x) => { if (!x) laden = null; });
  }
  return laden;
}

/** Zoeken op woorden (alle woorden moeten voorkomen), de kortste namen eerst. */
export function zoekSealed(producten: SealedProduct[], q: string, max = 20): SealedProduct[] {
  const woorden = zonderAccenten(q.trim()).split(/\s+/).filter(Boolean);
  if (!woorden.length) return [];
  return producten
    .filter((p) => { const n = zonderAccenten(`${p.naam} ${p.categorie}`); return woorden.every((w) => n.includes(w)); })
    .sort((a, b) => a.naam.length - b.naam.length)
    .slice(0, max);
}
