// De rekenkern van de kassa: transacties toepassen op de voorraad, ongedaan maken,
// conflicten oplossen en de cijfers van een beurs. Zonder netwerk of opslag, zodat
// de demo, de offline wachtrij en de tests exact dezelfde regels volgen als de
// databasefunctie boek_transactie in supabase/schema.sql.
import type { Artikel, Beurs, Conflict, Exemplaar, NieuwExemplaar, Regel, Stand, Transactie, TransactieSoort } from "../types";
import { inVoorraad, standaardExemplaar } from "./exemplaar";
import { verdeelTotaal } from "./pricing";
import { uuid } from "./uuid";

export interface Voorraad {
  exemplaren: Exemplaar[];
  artikelen: Artikel[];
}

export const rond2 = (x: number) => Math.round(x * 100) / 100;
const som = (xs: number[]) => rond2(xs.reduce((a, b) => a + b, 0));

export function totaalUit(regels: Regel[]) {
  return som(regels.filter((r) => r.richting === "uit").map((r) => r.prijs));
}
export function totaalIn(regels: Regel[]) {
  return som(regels.filter((r) => r.richting === "in").map((r) => r.prijs));
}
/** Wat de klant ons betaalt (positief) of wij de klant (negatief). */
export function netto(regels: Regel[]) {
  return rond2(totaalUit(regels) - totaalIn(regels));
}

export function bepaalSoort(regels: Regel[]): TransactieSoort {
  const uit = regels.some((r) => r.richting === "uit");
  const binnen = regels.some((r) => r.richting === "in");
  if (uit && binnen) return "ruil";
  return uit ? "verkoop" : "inkoop";
}

const datumVan = (iso: string) => iso.slice(0, 10);

// ── Regels maken ─────────────────────────────────────────────────────────────

/** Eén van onze exemplaren gaat naar de klant; de prijs van het hartje staat al ingevuld. */
export function regelUit(e: Exemplaar, prijs?: number): Regel {
  const lijst = e.opslag === "vitrine" ? e.hartjesprijs ?? e.verkoopprijs : e.verkoopprijs ?? e.hartjesprijs;
  return {
    richting: "uit", exemplaar_id: e.id, naam: e.naam, code: e.code,
    hartjesprijs: lijst ?? null, prijs: rond2(prijs ?? lijst ?? 0), aankoopprijs: e.aankoopprijs,
  };
}

export function regelArtikelUit(a: Artikel, aantal = 1, prijs?: number): Regel {
  const lijst = rond2((a.prijs ?? 0) * aantal);
  return { richting: "uit", artikel_id: a.id, aantal, naam: a.naam, hartjesprijs: lijst, prijs: rond2(prijs ?? lijst) };
}

/** Een kaart van de klant komt binnen (ruil of inkoop) als nieuw exemplaar. */
export function regelIn(nieuw: NieuwExemplaar & { id: string }, prijs: number, referentie?: number | null): Regel {
  return { richting: "in", nieuw, naam: nieuw.naam, code: nieuw.code, prijs: rond2(prijs), referentie: referentie ?? null };
}

/** Artikelen komen binnen (bv. drie booster packs van de klant). */
export function regelArtikelIn(a: Artikel, aantal: number, prijs: number): Regel {
  return { richting: "in", artikel_id: a.id, aantal, naam: a.naam, prijs: rond2(prijs) };
}

/**
 * Een nieuw totaal voor één kant van het mandje. Onze kant verdeelt volgens de huidige prijzen
 * (12 + 14 = 26 wordt 25: 11,54 + 13,46), de kant van de klant volgens de referentieprijs.
 */
export function pasTotaalAan(regels: Regel[], richting: "uit" | "in", nieuwTotaal: number): Regel[] {
  const idx = regels.map((r, i) => (r.richting === richting ? i : -1)).filter((i) => i >= 0);
  if (!idx.length) return regels;
  const basis = idx.map((i) => {
    const r = regels[i];
    return richting === "in" ? (r.referentie ?? r.prijs ?? 0) : r.prijs;
  });
  const delen = verdeelTotaal(basis, rond2(nieuwTotaal));
  const uit = regels.slice();
  idx.forEach((i, j) => { uit[i] = { ...uit[i], prijs: delen[j] }; });
  return uit;
}

export interface Betaling {
  cash: number;
  sumup: number;
}

/** Controleert de betaling: samen moet ze exact het netto bedrag zijn. */
export function betalingKlopt(regels: Regel[], b: Betaling): string | null {
  const n = netto(regels);
  if (n < 0 && (b.sumup !== 0 || rond2(b.cash) !== n)) return "Terugbetalen gaat enkel cash";
  if (n >= 0 && (b.cash < 0 || b.sumup < 0)) return "Bedragen kunnen niet negatief zijn";
  if (rond2(b.cash + b.sumup) !== n) return `Cash en SumUp moeten samen ${n.toFixed(2)} zijn`;
  return null;
}

export function nieuweTransactie(regels: Regel[], b: Betaling, beursId: string | null, opmerking: string | null = null, tijd = new Date().toISOString()): Transactie {
  const fout = betalingKlopt(regels, b);
  if (fout) throw new Error(fout);
  return {
    id: uuid(), beurs_id: beursId, soort: bepaalSoort(regels), tijd, regels,
    totaal: netto(regels), cash: rond2(b.cash), sumup: rond2(b.sumup),
    status: "ok", conflicten: [], opmerking,
  };
}

/** Een retour: de klant brengt iets terug en krijgt cash terug. */
export function nieuweRetour(regels: Regel[], terug: number, beursId: string | null, tijd = new Date().toISOString()): Transactie {
  return {
    id: uuid(), beurs_id: beursId, soort: "retour", tijd, regels: regels.map((r) => ({ ...r, richting: "in" as const })),
    totaal: -rond2(terug), cash: -rond2(terug), sumup: 0, status: "ok", conflicten: [], opmerking: null,
  };
}

/** Past een transactie toe op de voorraad. Een exemplaar dat al weg is, wordt een conflict. */
export function pasToe(v: Voorraad, t: Transactie): { voorraad: Voorraad; transactie: Transactie } {
  const exemplaren = new Map(v.exemplaren.map((e) => [e.id, e]));
  const artikelen = new Map(v.artikelen.map((a) => [a.id, a]));
  const conflicten: Conflict[] = [];
  const nieuweVolgorde: Exemplaar[] = [];

  for (const r of t.regels) {
    if (t.soort === "retour") {
      if (r.exemplaar_id) {
        const e = exemplaren.get(r.exemplaar_id);
        if (!e) { conflicten.push({ exemplaar_id: r.exemplaar_id, reden: "onbekend exemplaar" }); continue; }
        exemplaren.set(e.id, { ...e, status: "in voorraad", transactie_id: null, afgeboekt_op: null, gewijzigd_op: t.tijd });
      } else if (r.artikel_id) {
        const a = artikelen.get(r.artikel_id);
        if (a) artikelen.set(a.id, { ...a, aantal: a.aantal + (r.aantal ?? 1) });
      }
      continue;
    }
    if (r.richting === "uit") {
      if (r.exemplaar_id) {
        const e = exemplaren.get(r.exemplaar_id);
        if (!e || !inVoorraad(e)) {
          conflicten.push({ exemplaar_id: r.exemplaar_id, reden: e ? `al ${e.status}` : "onbekend exemplaar" });
          continue;
        }
        exemplaren.set(e.id, {
          ...e, status: t.soort === "ruil" ? "geruild" : "verkocht", transactie_id: t.id, afgeboekt_op: t.tijd, gewijzigd_op: t.tijd,
        });
      } else if (r.artikel_id) {
        const a = artikelen.get(r.artikel_id);
        const n = r.aantal ?? 1;
        if (!a) { conflicten.push({ artikel_id: r.artikel_id, reden: "onbekend artikel" }); continue; }
        if (a.aantal < n) conflicten.push({ artikel_id: a.id, reden: `nog maar ${a.aantal} in voorraad` });
        artikelen.set(a.id, { ...a, aantal: Math.max(0, a.aantal - n) });
      }
    } else {
      if (r.nieuw) {
        if (!r.nieuw.id || exemplaren.has(r.nieuw.id)) continue; // al geboekt (opnieuw verstuurd)
        const e = standaardExemplaar({
          aankoopbron: t.soort === "ruil" ? "ruil" : "beurs",
          ...r.nieuw,
          aankoopprijs: r.prijs,
          aankoopdatum: datumVan(t.tijd),
          status: "in voorraad",
          opslag: r.nieuw.opslag ?? "stockdoos",
          label_status: "te printen",
        }, t.tijd);
        exemplaren.set(e.id, e);
        nieuweVolgorde.push(e);
      } else if (r.artikel_id) {
        const a = artikelen.get(r.artikel_id);
        if (a) artikelen.set(a.id, { ...a, aantal: a.aantal + (r.aantal ?? 1) });
        else conflicten.push({ artikel_id: r.artikel_id, reden: "onbekend artikel" });
      }
    }
  }

  const bestaande = v.exemplaren.map((e) => exemplaren.get(e.id)!);
  return {
    voorraad: { exemplaren: [...bestaande, ...nieuweVolgorde], artikelen: v.artikelen.map((a) => artikelen.get(a.id)!) },
    transactie: { ...t, status: conflicten.length ? "conflict" : "ok", conflicten },
  };
}

/** Draait een transactie terug (bv. binnen 5 seconden na een verkeerde scan). */
export function maakOngedaan(v: Voorraad, t: Transactie): { voorraad: Voorraad; transactie: Transactie } {
  if (t.status === "ongedaan") return { voorraad: v, transactie: t };
  const exemplaren = new Map(v.exemplaren.map((e) => [e.id, e]));
  const artikelen = new Map(v.artikelen.map((a) => [a.id, a]));
  const weg = new Set<string>();
  const inConflict = new Set(t.conflicten.map((c) => c.exemplaar_id).filter(Boolean) as string[]);

  for (const r of t.regels) {
    if (t.soort === "retour") {
      if (r.exemplaar_id) {
        const e = exemplaren.get(r.exemplaar_id);
        const vorig = r.vorige_status && ["verkocht", "geruild", "weg"].includes(r.vorige_status) ? r.vorige_status : "verkocht";
        if (e) exemplaren.set(e.id, { ...e, status: vorig, afgeboekt_op: t.tijd });
      } else if (r.artikel_id) {
        const a = artikelen.get(r.artikel_id);
        if (a) artikelen.set(a.id, { ...a, aantal: Math.max(0, a.aantal - (r.aantal ?? 1)) });
      }
      continue;
    }
    if (r.richting === "uit") {
      if (r.exemplaar_id && !inConflict.has(r.exemplaar_id)) {
        const e = exemplaren.get(r.exemplaar_id);
        if (e && e.transactie_id === t.id) {
          exemplaren.set(e.id, {
            ...e, status: "in voorraad", transactie_id: null, afgeboekt_op: null,
          });
        }
      } else if (r.artikel_id) {
        const a = artikelen.get(r.artikel_id);
        if (a) artikelen.set(a.id, { ...a, aantal: a.aantal + (r.aantal ?? 1) });
      }
    } else if (r.nieuw?.id) {
      weg.add(r.nieuw.id);
    } else if (r.artikel_id) {
      const a = artikelen.get(r.artikel_id);
      if (a) artikelen.set(a.id, { ...a, aantal: Math.max(0, a.aantal - (r.aantal ?? 1)) });
    }
  }
  return {
    voorraad: {
      exemplaren: v.exemplaren.filter((e) => !weg.has(e.id)).map((e) => exemplaren.get(e.id)!),
      artikelen: v.artikelen.map((a) => artikelen.get(a.id)!),
    },
    transactie: { ...t, status: "ongedaan" },
  };
}

/**
 * Een conflict oplossen: de regel hoorde eigenlijk bij een ander exemplaar
 * (bv. het verkeerde label getypt). Dat exemplaar wordt nu afgeboekt.
 */
export function losConflictOp(v: Voorraad, t: Transactie, oudId: string, nieuwId: string): { voorraad: Voorraad; transactie: Transactie } {
  const nieuw = v.exemplaren.find((e) => e.id === nieuwId);
  if (!nieuw) throw new Error("Dat exemplaar bestaat niet");
  if (!inVoorraad(nieuw)) throw new Error(`Dat exemplaar is ook al ${nieuw.status}`);
  const regels = t.regels.map((r) =>
    r.exemplaar_id === oudId && r.richting === "uit"
      ? { ...r, exemplaar_id: nieuw.id, code: nieuw.code, naam: nieuw.naam, hartjesprijs: nieuw.hartjesprijs ?? nieuw.verkoopprijs, aankoopprijs: nieuw.aankoopprijs }
      : r,
  );
  const exemplaren = v.exemplaren.map((e) =>
    e.id === nieuw.id ? { ...e, status: (t.soort === "ruil" ? "geruild" : "verkocht") as Exemplaar["status"], transactie_id: t.id, afgeboekt_op: t.tijd } : e,
  );
  const conflicten = t.conflicten.filter((c) => c.exemplaar_id !== oudId);
  return {
    voorraad: { exemplaren, artikelen: v.artikelen },
    transactie: { ...t, regels, conflicten, status: conflicten.length ? "conflict" : "ok" },
  };
}

/** Een conflict laten zoals het is: de verkoop telt, de voorraad verandert niet. */
export function aanvaardConflict(t: Transactie, oudId: string): Transactie {
  const conflicten = t.conflicten.filter((c) => c.exemplaar_id !== oudId && c.artikel_id !== oudId);
  return { ...t, conflicten, status: conflicten.length ? "conflict" : "ok" };
}

/** De stand van de voorraad: wat er in de catalogus ligt en hoeveel het waard is. */
export function stand(v: Voorraad): Stand {
  const actief = v.exemplaren.filter(inVoorraad);
  const cat = actief.filter((e) => e.opslag === "vitrine");
  return {
    catalogus: cat.length,
    catalogusWaarde: som(cat.map((e) => e.hartjesprijs ?? 0)),
    artikelenWaarde: som(v.artikelen.filter((a) => a.opslag === "vitrine").map((a) => (a.prijs ?? 0) * a.aantal)),
    voorraad: actief.length,
  };
}

export interface BeursCijfers {
  cash: number;           // netto cash van de transacties
  sumup: number;
  kasVerwacht: number;    // startkas + cash
  omzet: number;          // wat klanten betaalden (cash + SumUp), zonder ruilwaarde
  uitbetaald: number;     // wat wij betaalden (inkoop, bijbetalen, retour)
  korting: number;        // som van (hartje − verkoopprijs) op onze kaarten
  marge: number | null;   // verkoopprijs − aankoopprijs, enkel voor exemplaren met een aankoopprijs
  verkocht: number;       // exemplaren verkocht
  weggeruild: number;     // exemplaren weggeruild
  nieuwViaRuil: number;
  nieuwViaInkoop: number;
  transacties: number;
  conflicten: number;
}

export function beursCijfers(beurs: Pick<Beurs, "startkas"> | null, transacties: Transactie[]): BeursCijfers {
  const geldig = transacties.filter((t) => t.status !== "ongedaan");
  let korting = 0, marge = 0, metMarge = 0, verkocht = 0, weggeruild = 0, viaRuil = 0, viaInkoop = 0, omzet = 0, uit = 0;
  for (const t of geldig) {
    if (t.cash > 0) omzet += t.cash; else uit -= t.cash;
    if (t.sumup > 0) omzet += t.sumup; else uit -= t.sumup;
    for (const r of t.regels) {
      if (t.soort === "retour") continue;
      if (r.richting === "uit") {
        if (r.exemplaar_id) {
          if (t.soort === "ruil") weggeruild++; else verkocht++;
          if (r.aankoopprijs != null) { marge += r.prijs - r.aankoopprijs; metMarge++; }
        }
        if (r.hartjesprijs != null) korting += r.hartjesprijs - r.prijs;
      } else if (r.nieuw) {
        if (t.soort === "ruil") viaRuil++; else viaInkoop++;
      }
    }
  }
  const cash = som(geldig.map((t) => t.cash));
  return {
    cash,
    sumup: som(geldig.map((t) => t.sumup)),
    kasVerwacht: rond2((beurs?.startkas ?? 0) + cash),
    omzet: rond2(omzet),
    uitbetaald: rond2(uit),
    korting: rond2(Math.max(0, korting)),
    marge: metMarge ? rond2(marge) : null,
    verkocht,
    weggeruild,
    nieuwViaRuil: viaRuil,
    nieuwViaInkoop: viaInkoop,
    transacties: geldig.length,
    conflicten: geldig.filter((t) => t.status === "conflict").length,
  };
}
