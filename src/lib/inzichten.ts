// Inzichten: wat verkoopt, aan welke prijs, wanneer en hoe snel. Enkel rekenwerk op de
// transacties en de voorraad; de schermen staan in ui/Inzichten.tsx.
import type { Artikel, Exemplaar, Regel, Transactie } from "../types";
import { dagVan } from "./boekhouding";
import { rond2, type Productsoort } from "./kassa";

export interface VerkochtStuk {
  naam: string;
  pokemon: string;            // de naam zonder "ex", "V" …: om de populairste Pokémon te tellen
  code: string | null;
  prijs: number;              // per stuk
  hartje: number | null;      // per stuk
  aankoop: number | null;     // per stuk
  aantal: number;
  soort: Productsoort;
  set: string | null;
  taal: string | null;
  conditie: string | null;
  tijd: string;
  beurs_id: string | null;
  dagen: number | null;       // hoe lang het in voorraad lag
  ruil: boolean;              // weggeruild in plaats van verkocht
}

const ACHTERVOEGSELS = /\s+(ex|gx|v|vmax|vstar|v-union|break|lv\.x|prime|legend|δ|delta species|star|☆|tag team)$/i;
/** "Charizard ex" → "Charizard", "Mega Gengar ex" → "Mega Gengar", "Pikachu V" → "Pikachu". */
export function pokemonVan(naam: string): string {
  let n = naam.replace(/\s*\(.*?\)\s*/g, " ").replace(/^(radiant|shining|dark|light)\s+/i, "").trim();
  for (let i = 0; i < 2; i++) n = n.replace(ACHTERVOEGSELS, "").trim();
  n = n.replace(/^.*['’]s\s+/, "").trim(); // "Team Rocket's Mewtwo" en "Misty's Psyduck": de Pokémon
  return n || naam;
}

/**
 * Alles wat de deur uitging (verkocht of weggeruild), per stuk. Wat later terugkwam (retour),
 * telt niet mee. Ongedaan gemaakte transacties en kasbewegingen tellen niet.
 */
export function verkochteStukken(transacties: Transactie[], exemplaren: Exemplaar[], artikelen: Artikel[], soortVan: (r: Regel) => Productsoort): VerkochtStuk[] {
  const ex = new Map(exemplaren.map((e) => [e.id, e]));
  const art = new Map(artikelen.map((a) => [a.id, a]));
  const uit: (VerkochtStuk & { exemplaar_id?: string | null; artikel_id?: string | null })[] = [];
  const geldig = transacties.filter((t) => t.status !== "ongedaan" && t.soort !== "kas").sort((a, b) => a.tijd.localeCompare(b.tijd));
  for (const t of geldig) {
    if (t.soort === "retour") {
      for (const r of t.regels) {
        if (r.richting !== "in") continue;
        // Het laatste verkochte stuk van dit exemplaar of artikel kwam terug.
        for (let i = uit.length - 1; i >= 0; i--) {
          const u = uit[i];
          if (r.exemplaar_id ? u.exemplaar_id === r.exemplaar_id : r.artikel_id && u.artikel_id === r.artikel_id) {
            const n = r.aantal ?? 1;
            if (u.aantal > n) u.aantal -= n; else uit.splice(i, 1);
            break;
          }
        }
      }
      continue;
    }
    if (t.soort !== "verkoop" && t.soort !== "ruil") continue;
    for (const r of t.regels) {
      if (r.richting !== "uit") continue;
      if (t.conflicten.some((c) => c.exemplaar_id && c.exemplaar_id === r.exemplaar_id)) continue;
      const e = r.exemplaar_id ? ex.get(r.exemplaar_id) : undefined;
      const a = r.artikel_id ? art.get(r.artikel_id) : undefined;
      const n = r.aantal ?? 1;
      const sinds = e ? e.vitrine_sinds ?? e.aangemaakt_op : null;
      uit.push({
        exemplaar_id: r.exemplaar_id, artikel_id: r.artikel_id,
        naam: r.naam, pokemon: e && e.soort !== "eigen product" ? pokemonVan(e.naam) : a?.naam ?? r.naam, code: r.code ?? null,
        prijs: rond2(r.prijs / n), hartje: r.hartjesprijs != null ? rond2(r.hartjesprijs / n) : null,
        aankoop: r.aankoopprijs != null ? rond2(r.aankoopprijs / n) : null, aantal: n, soort: soortVan(r),
        set: e?.set_naam ?? (a?.details?.set || null), taal: e?.taal ?? a?.details?.taal ?? null, conditie: e?.soort === "slab" ? `${e.grader ?? "graded"} ${e.grade ?? ""}`.trim() : e?.conditie ?? null,
        tijd: t.tijd, beurs_id: t.beurs_id,
        dagen: sinds ? Math.max(0, Math.round((Date.parse(t.tijd) - Date.parse(sinds)) / 86400000)) : null,
        ruil: t.soort === "ruil",
      });
    }
  }
  return uit.map(({ exemplaar_id: _e, artikel_id: _a, ...v }) => v);
}

export interface Groep { sleutel: string; aantal: number; omzet: number }

/** Groepeer per sleutel; de grootste omzet eerst (of het grootste aantal). */
export function groepeer(stukken: VerkochtStuk[], sleutel: (s: VerkochtStuk) => string | null, op: "omzet" | "aantal" = "omzet"): Groep[] {
  const m = new Map<string, Groep>();
  for (const s of stukken) {
    const k = sleutel(s);
    if (!k) continue;
    const g = m.get(k) ?? { sleutel: k, aantal: 0, omzet: 0 };
    g.aantal += s.aantal;
    g.omzet = rond2(g.omzet + s.prijs * s.aantal);
    m.set(k, g);
  }
  return [...m.values()].sort((a, b) => (op === "omzet" ? b.omzet - a.omzet || b.aantal - a.aantal : b.aantal - a.aantal || b.omzet - a.omzet));
}

export const PRIJSKLASSEN = [
  { tot: 5, label: "tot € 5" }, { tot: 10, label: "€ 5–10" }, { tot: 25, label: "€ 10–25" }, { tot: 50, label: "€ 25–50" },
  { tot: 100, label: "€ 50–100" }, { tot: 250, label: "€ 100–250" }, { tot: Infinity, label: "€ 250+" },
];
export const prijsklasse = (p: number) => PRIJSKLASSEN.find((k) => p < k.tot)?.label ?? PRIJSKLASSEN[PRIJSKLASSEN.length - 1].label;

/** Per prijsklasse, in de volgorde van de klassen (ook lege, zodat de balken naast elkaar kloppen). */
export function perPrijsklasse(stukken: VerkochtStuk[]): Groep[] {
  const g = new Map(groepeer(stukken, (s) => prijsklasse(s.prijs)).map((x) => [x.sleutel, x]));
  return PRIJSKLASSEN.map((k) => g.get(k.label) ?? { sleutel: k.label, aantal: 0, omzet: 0 });
}

/** Het uur (in België) waarop er verkocht werd, van 8 tot 20 uur. */
export function perUur(stukken: VerkochtStuk[]): Groep[] {
  const uur = (iso: string) => Number(new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", hour: "2-digit", hour12: false }).format(new Date(iso)));
  const g = new Map(groepeer(stukken, (s) => String(uur(s.tijd))).map((x) => [x.sleutel, x]));
  const uren = [...g.keys()].map(Number);
  const van = Math.min(9, ...uren);
  const tot = Math.max(17, ...uren);
  return Array.from({ length: tot - van + 1 }, (_, i) => g.get(String(van + i)) ?? { sleutel: String(van + i), aantal: 0, omzet: 0 });
}

export const mediaan = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = xs.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : rond2((s[m - 1] + s[m]) / 2);
};

export interface Kerncijfers {
  stuks: number; omzet: number; gemiddeld: number | null; mediaanPrijs: number | null;
  kaartOmzet: number; artikelOmzet: number; // artikels (binders, sealed, 3D) zijn omzet, geen winst
  marge: number | null; margePct: number | null; korting: number; mediaanDagen: number | null; dagen: number;
}

const isKaart = (s: VerkochtStuk) => s.soort === "kaarten" || s.soort === "slabs";

export function kerncijfers(stukken: VerkochtStuk[]): Kerncijfers {
  const stuks = stukken.reduce((n, s) => n + s.aantal, 0);
  const omzet = rond2(stukken.reduce((x, s) => x + s.prijs * s.aantal, 0));
  // Winst enkel op kaarten: de kosten van artikels zitten apart in de boekhouding.
  const metAankoop = stukken.filter((s) => isKaart(s) && s.aankoop != null);
  const kaartOmzet = rond2(stukken.filter(isKaart).reduce((x, s) => x + s.prijs * s.aantal, 0));
  const verkoopMet = metAankoop.reduce((x, s) => x + s.prijs * s.aantal, 0);
  const aankoopMet = metAankoop.reduce((x, s) => x + s.aankoop! * s.aantal, 0);
  const korting = rond2(stukken.reduce((x, s) => x + Math.max(0, (s.hartje ?? s.prijs) - s.prijs) * s.aantal, 0));
  return {
    stuks, omzet, gemiddeld: stuks ? rond2(omzet / stuks) : null, kaartOmzet, artikelOmzet: rond2(omzet - kaartOmzet),
    mediaanPrijs: mediaan(stukken.flatMap((s) => Array(s.aantal).fill(s.prijs))),
    marge: metAankoop.length ? rond2(verkoopMet - aankoopMet) : null,
    margePct: aankoopMet > 0 ? Math.round(((verkoopMet - aankoopMet) / aankoopMet) * 100) : null,
    korting,
    mediaanDagen: mediaan(stukken.filter((s) => s.dagen != null && s.soort !== "binders").map((s) => s.dagen!)),
    dagen: new Set(stukken.map((s) => dagVan(s.tijd))).size,
  };
}

/** Wat het langst in de catalogus ligt zonder verkocht te worden (de "winkeldochters"). */
export function blijftLiggen(exemplaren: Exemplaar[], nu = Date.now(), max = 5): { e: Exemplaar; dagen: number }[] {
  return exemplaren
    .filter((e) => e.status === "in voorraad" && e.opslag === "vitrine")
    .map((e) => ({ e, dagen: Math.round((nu - Date.parse(e.vitrine_sinds ?? e.aangemaakt_op)) / 86400000) }))
    .sort((a, b) => b.dagen - a.dagen)
    .slice(0, max);
}
