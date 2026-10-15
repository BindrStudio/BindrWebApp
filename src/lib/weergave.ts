// Hoe de catalogus getoond wordt: dubbels samen in één tegel, filters en sorteren.
// Gedeeld door de beheer-app en de klantenpagina (enkel kleine, losse hulpfuncties).
import { zonderAccenten } from "./format";

/** Wat een kaart in de catalogus minstens heeft om te tonen, te filteren en te sorteren. */
export interface Toonbaar {
  kaart_id: string | null;
  soort: string;
  naam: string;
  naam_origineel?: string | null;
  set_naam: string | null;
  set_code: string | null;
  nummer: string | null;
  taal: string;
  conditie: string | null;
  variant: string;
  grader: string | null;
  grade: string | null;
  prijs: number;
  toegevoegd: string | null; // sinds wanneer in de catalogus
}

export interface Groep<T> {
  sleutel: string;
  eerste: T;
  items: T[];
}

/**
 * Dezelfde kaart, in dezelfde conditie, taal en variant, voor dezelfde prijs = één tegel met een aantal.
 * Een andere conditie of een andere prijs krijgt een eigen tegel.
 */
export function groepSleutel(k: Toonbaar): string {
  const kaart = k.kaart_id || [k.naam, k.set_code, k.nummer].map((x) => (x ?? "").toLowerCase()).join("/");
  return [kaart, k.soort, k.conditie ?? "", k.taal, k.variant, k.grader ?? "", k.grade ?? "", k.prijs].join("|");
}

export function groepeer<T>(items: T[], sleutel: (t: T) => string): Groep<T>[] {
  const per = new Map<string, Groep<T>>();
  for (const it of items) {
    const s = sleutel(it);
    const g = per.get(s);
    if (g) g.items.push(it);
    else per.set(s, { sleutel: s, eerste: it, items: [it] });
  }
  return [...per.values()];
}

// ── Filters ──────────────────────────────────────────────────────────────────

export type Snelfilter = "nieuw" | "en" | "jp" | "andere" | "graded" | "onder10" | "vanaf50";

export const SNELFILTERS: { id: Snelfilter; label: string }[] = [
  { id: "nieuw", label: "Nieuw binnen" },
  { id: "en", label: "Engels" },
  { id: "jp", label: "Japans" },
  { id: "andere", label: "Andere talen" },
  { id: "graded", label: "Graded" },
  { id: "onder10", label: "Onder € 10" },
  { id: "vanaf50", label: "€ 50 en meer" },
];

/** "Nieuw" = de laatste 14 dagen in de catalogus gekomen. */
export const NIEUW_DAGEN = 14;

export function isNieuw(k: Pick<Toonbaar, "toegevoegd">, nu = Date.now()): boolean {
  if (!k.toegevoegd) return false;
  const t = Date.parse(k.toegevoegd.length === 10 ? k.toegevoegd + "T00:00:00" : k.toegevoegd);
  return !Number.isNaN(t) && nu - t <= NIEUW_DAGEN * 86400000;
}

export function pastSnelfilter(k: Toonbaar, f: Snelfilter, nu = Date.now()): boolean {
  switch (f) {
    case "nieuw": return isNieuw(k, nu);
    case "en": return k.taal === "EN";
    case "jp": return k.taal === "JP";
    case "andere": return !!k.taal && k.taal !== "EN" && k.taal !== "JP" && k.soort !== "eigen product";
    case "graded": return k.soort === "slab";
    case "onder10": return k.prijs < 10;
    case "vanaf50": return k.prijs >= 50;
  }
}

/**
 * Meerdere snelfilters: binnen dezelfde groep (taal, prijs) is het "of", tussen groepen "en".
 * Zo geeft Engels + Japans beide talen, en Engels + Onder € 10 enkel goedkope Engelse kaarten.
 */
export function pastFilters(k: Toonbaar, filters: Set<Snelfilter>, nu = Date.now()): boolean {
  const groepen: Snelfilter[][] = [["nieuw"], ["en", "jp", "andere"], ["graded"], ["onder10", "vanaf50"]];
  for (const g of groepen) {
    const aan = g.filter((f) => filters.has(f));
    if (aan.length && !aan.some((f) => pastSnelfilter(k, f, nu))) return false;
  }
  return true;
}

export function zoekTekst(k: Toonbaar): string {
  return zonderAccenten([k.naam, k.naam_origineel, k.set_naam, k.set_code, k.nummer].filter(Boolean).join(" "));
}

export function pastZoek(tekst: string, woorden: string[]): boolean {
  return woorden.every((w) => tekst.includes(w));
}

export function zoekWoorden(q: string): string[] {
  return zonderAccenten(q.trim()).split(/\s+/).filter(Boolean);
}

// ── Sets en sorteren ─────────────────────────────────────────────────────────

/** De set van een kaart: TCGdex-id min het kaartnummer (me02-130 → me02). */
export function setIdVan(k: Pick<Toonbaar, "kaart_id" | "nummer" | "set_code" | "set_naam">): string {
  if (k.kaart_id && k.nummer && k.kaart_id.endsWith("-" + k.nummer)) return k.kaart_id.slice(0, -(k.nummer.length + 1));
  return k.set_code || k.set_naam || "";
}

export type Sortering = "nieuw" | "prijs-hoog" | "prijs-laag" | "set" | "naam";

export const SORTERINGEN: { id: Sortering; label: string }[] = [
  { id: "nieuw", label: "Nieuw binnen" },
  { id: "prijs-hoog", label: "Duurste eerst" },
  { id: "prijs-laag", label: "Goedkoopste eerst" },
  { id: "set", label: "Per set" },
  { id: "naam", label: "Naam A–Z" },
];

/** Kaartnummers natuurlijk sorteren: 2 < 10 < 10a < TG05. */
export function vergelijkNummer(a: string | null, b: string | null): number {
  return (a ?? "").localeCompare(b ?? "", "nl", { numeric: true, sensitivity: "base" });
}

/** Release van een set (jjjj-mm-dd), om sets van nieuw naar oud te tonen. */
export type SetInfo = Record<string, [naam: string, code: string, release: string, serie?: string, taal?: string]>;

export function sorteer<T>(lijst: T[], s: Sortering, k: (t: T) => Toonbaar, sets: SetInfo | null = null): T[] {
  const tijd = (t: T) => { const x = k(t).toegevoegd; return x ? Date.parse(x.length === 10 ? x + "T00:00:00" : x) || 0 : 0; };
  const release = (t: T) => (sets?.[setIdVan(k(t))]?.[2] ?? "");
  return lijst.slice().sort((a, b) => {
    const ka = k(a), kb = k(b);
    switch (s) {
      case "prijs-hoog": return kb.prijs - ka.prijs || ka.naam.localeCompare(kb.naam);
      case "prijs-laag": return ka.prijs - kb.prijs || ka.naam.localeCompare(kb.naam);
      case "naam": return ka.naam.localeCompare(kb.naam, "nl") || vergelijkNummer(ka.nummer, kb.nummer);
      case "set":
        return release(b).localeCompare(release(a))
          || (ka.set_naam ?? "~").localeCompare(kb.set_naam ?? "~")
          || vergelijkNummer(ka.nummer, kb.nummer);
      case "nieuw":
      default: return tijd(b) - tijd(a) || kb.prijs - ka.prijs;
    }
  });
}

/** Voor "Per set": opeenvolgende tegels van dezelfde set onder één kopje. */
export function perSet<T>(lijst: T[], k: (t: T) => Toonbaar): { set: string; naam: string; items: T[] }[] {
  const uit: { set: string; naam: string; items: T[] }[] = [];
  for (const it of lijst) {
    const x = k(it);
    const id = setIdVan(x) || "~";
    const laatste = uit[uit.length - 1];
    if (laatste && laatste.set === id) laatste.items.push(it);
    else uit.push({ set: id, naam: x.set_naam || (x.soort === "eigen product" ? "Bind'r" : "Andere"), items: [it] });
  }
  return uit;
}
