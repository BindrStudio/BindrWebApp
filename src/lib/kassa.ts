// De rekenkern van de kassa: transacties toepassen op de voorraad, ongedaan maken,
// conflicten oplossen en de cijfers van een beurs. Zonder netwerk of opslag, zodat
// de demo, de offline wachtrij en de tests exact dezelfde regels volgen als de
// databasefunctie boek_transactie in supabase/schema.sql.
import type { Artikel, Beurs, Conflict, Exemplaar, NieuwExemplaar, Regel, Stand, Tegenpartij, TegoedGebruik, Transactie, TransactieSoort } from "../types";
import { inVoorraad, standaardExemplaar } from "./exemplaar";
import { verdeelTotaal } from "./pricing";
import { uuid } from "./uuid";
import { dagVan } from "./format";

export interface Voorraad {
  exemplaren: Exemplaar[];
  artikelen: Artikel[];
  /** De transacties tot nu (als ze er zijn): om een kaart niet twee keer in te brengen. */
  transacties?: Transactie[];
}

/**
 * Hoe elk exemplaar in de zaak kwam: de transactie die het binnenbracht (inkoop, ruil, of uit privé,
 * ook een kaart die al in de app stond en later werd ingebracht). Wat ongedaan is of een conflict gaf, telt niet.
 */
export function verwervingen(transacties: Transactie[]): Map<string, Transactie> {
  const m = new Map<string, Transactie>();
  for (const t of transacties) {
    if (t.status === "ongedaan" || t.soort === "retour") continue;
    for (const r of t.regels) {
      if (r.richting !== "in") continue;
      const id = r.nieuw?.id ?? (t.soort === "prive" ? r.exemplaar_id : null);
      if (!id || m.has(id) || t.conflicten.some((c) => c.exemplaar_id === id)) continue;
      m.set(id, t);
    }
  }
  return m;
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

/**
 * De marge op wat de deur uitgaat: verkoopprijs min aankoopprijs, enkel voor regels waarvan
 * we de aankoopprijs kennen. Alleen voor de beheerders, nooit voor de klant.
 */
export function marge(regels: Regel[]) {
  // Enkel kaarten (exemplaren): artikels zijn omzet, hun kosten zitten apart in de boekhouding.
  regels = regels.filter((r) => !r.artikel_id);
  const gekend = regels.filter((r) => r.richting === "uit" && r.aankoopprijs != null);
  const verkoop = som(gekend.map((r) => r.prijs));
  const aankoop = som(gekend.map((r) => r.aankoopprijs!));
  const winst = rond2(verkoop - aankoop);
  return {
    verkoop, aankoop, winst,
    pct: aankoop > 0 ? Math.round((winst / aankoop) * 100) : null,
    gekend: gekend.length,
    onbekend: regels.filter((r) => r.richting === "uit" && r.aankoopprijs == null).length,
  };
}

export function bepaalSoort(regels: Regel[]): TransactieSoort {
  const uit = regels.some((r) => r.richting === "uit");
  const binnen = regels.some((r) => r.richting === "in");
  if (uit && binnen) return "ruil";
  return uit ? "verkoop" : "inkoop";
}

const datumVan = dagVan; // de dag in België, zoals de server (Europe/Brussels)

// ── Regels maken ─────────────────────────────────────────────────────────────

/** Eén van onze exemplaren gaat naar de klant; de prijs van het hartje staat al ingevuld. */
export function regelUit(e: Exemplaar, prijs?: number): Regel {
  const lijst = e.opslag === "vitrine" ? e.hartjesprijs ?? e.verkoopprijs : e.verkoopprijs ?? e.hartjesprijs;
  return {
    richting: "uit", exemplaar_id: e.id, naam: e.naam, code: e.code,
    hartjesprijs: lijst ?? null, prijs: rond2(prijs ?? lijst ?? 0), aankoopprijs: e.aankoopprijs,
  };
}

/** Artikels (binders, sealed, 3D-prints) zijn omzet, geen winst: hun kosten zitten apart in Dexxter. */
export function regelArtikelUit(a: Artikel, aantal = 1, prijs?: number): Regel {
  const lijst = rond2((a.prijs ?? 0) * aantal);
  return { richting: "uit", artikel_id: a.id, aantal, naam: a.naam, hartjesprijs: lijst, prijs: rond2(prijs ?? lijst) };
}

/** Een kaart van de klant komt binnen (ruil of inkoop) als nieuw exemplaar. */
export function regelIn(nieuw: NieuwExemplaar & { id: string }, prijs: number, referentie?: number | null): Regel {
  return { richting: "in", nieuw, naam: nieuw.naam, code: nieuw.code, prijs: rond2(prijs), referentie: referentie ?? null };
}

/**
 * Een kaart die al in de app staat (zelf toegevoegd) uit privé inbrengen: dezelfde kaart, nu met haar
 * inbrengwaarde als aankoopprijs. De regel bewaart de vorige waarden om ongedaan maken terug te zetten.
 */
export function regelInbreng(e: Exemplaar, prijs: number, referentie: number | null, bron: string | null, pct: number | null): Regel {
  // (pasToe en boek_transactie zetten de aankoopprijs; ongedaan maken zet de vorige waarden terug.)
  return {
    richting: "in", exemplaar_id: e.id, naam: e.naam, code: e.code, prijs: rond2(prijs), referentie, referentie_bron: bron, pct,
    omschrijving: [[e.set_code, e.nummer].filter(Boolean).join(" "), e.taal, e.soort === "slab" ? [e.grader, e.grade].filter(Boolean).join(" ") : e.conditie].filter(Boolean).join(" · ") || null,
    vorige_aankoopprijs: e.aankoopprijs ?? null, vorige_aankoopbron: e.aankoopbron ?? null, vorige_aankoopdatum: e.aankoopdatum ?? null,
  };
}

/** Verzendkosten die de klant betaalt (online verkoop): omzet, geen voorraad. */
export function regelVerzending(prijs: number): Regel {
  return { richting: "uit", naam: "Verzending", prijs: rond2(prijs), extra: "verzending" };
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
  bank?: number; // overschrijving
  tegoed?: number; // storecredit: − = we geven een tegoedbon, + = de klant betaalt met tegoed
  tegoedVan?: TegoedGebruik[]; // betaald met tegoed: van welke bon(nen)
}

/** Wettelijke grens voor cash bij de aankoop of verkoop van goederen (art. 67 witwaswet): € 3.000. */
export const CASH_GRENS = 3000;

/** Controleert de betaling: samen moet ze exact het netto bedrag zijn. */
export function betalingKlopt(regels: Regel[], b: Betaling): string | null {
  const n = netto(regels);
  const bank = b.bank ?? 0;
  const tegoed = b.tegoed ?? 0;
  if (n < 0 && (b.sumup !== 0 || b.cash > 0 || bank > 0 || tegoed > 0)) return "Terugbetalen gaat enkel cash, met een overschrijving of in tegoed";
  if (n >= 0 && (b.cash < 0 || b.sumup < 0 || bank < 0 || tegoed < 0)) return "Bedragen kunnen niet negatief zijn";
  if (rond2(b.cash + b.sumup + bank + tegoed) !== n) return `Cash, SumUp, overschrijving en tegoed moeten samen ${n.toFixed(2)} zijn`;
  if (Math.abs(b.cash) > CASH_GRENS) return `Cash mag hoogstens ${CASH_GRENS} euro zijn (wettelijke grens). Betaal de rest met SumUp of een overschrijving.`;
  if (tegoed > 0 && rond2((b.tegoedVan ?? []).reduce((s, x) => s + x.bedrag, 0)) !== tegoed) return "Kies van welke tegoedbon";
  return null;
}

export function nieuweTransactie(regels: Regel[], b: Betaling, beursId: string | null, opmerking: string | null = null, tijd = new Date().toISOString(), tegenpartij: Tegenpartij | null = null): Transactie {
  const fout = betalingKlopt(regels, b);
  if (fout) throw new Error(fout);
  const tegoed = rond2(b.tegoed ?? 0);
  // Een tegoedbon staat op naam: anders weet niemand later voor wie hij is.
  if (tegoed < 0 && !tegenpartij?.naam?.trim()) throw new Error("Een tegoedbon heeft een naam nodig");
  return {
    id: uuid(), beurs_id: beursId, soort: bepaalSoort(regels), tijd, regels,
    totaal: netto(regels), cash: rond2(b.cash), sumup: rond2(b.sumup), bank: rond2(b.bank ?? 0),
    ...(tegoed ? { tegoed, tegoed_van: tegoed > 0 ? (b.tegoedVan ?? []).map((x) => ({ bon: x.bon, bedrag: rond2(x.bedrag) })) : null } : {}),
    status: "ok", conflicten: [], opmerking, tegenpartij,
  };
}

/**
 * Een retour of een deal terugdraaien. `terugIn` = onze stukken die terugkomen (de klant krijgt
 * zijn geld terug), `terugUit` = hun stukken die we teruggeven (bij een ruil of inkoop; dan
 * betalen zij ons terug). `terug` = wat wij uitbetalen (negatief: wat zij ons betalen). Cash, of per
 * overschrijving (boven de cashgrens van € 3.000 verplicht).
 */
export function nieuweRetour(terugIn: Regel[], terug: number, beursId: string | null, tijd = new Date().toISOString(), terugUit: Regel[] = [], perBank = false): Transactie {
  if (!perBank && Math.abs(terug) > CASH_GRENS) throw new Error(`Cash mag hoogstens ${CASH_GRENS} euro zijn (wettelijke grens). Kies een overschrijving.`);
  const regels: Regel[] = [
    ...terugIn.map((r) => ({ ...r, richting: "in" as const, nieuw: null })),
    ...terugUit.map((r) => ({ ...r, richting: "uit" as const, exemplaar_id: r.exemplaar_id ?? r.nieuw?.id ?? null, nieuw: null })),
  ];
  return {
    id: uuid(), beurs_id: beursId, soort: "retour", tijd, regels,
    totaal: -rond2(terug), cash: perBank ? 0 : -rond2(terug), sumup: 0, bank: perBank ? -rond2(terug) : 0, status: "ok", conflicten: [], opmerking: null,
  };
}

/**
 * Kaarten tussen privé en de zaak, zonder geld. `in` = inbreng uit de privécollectie (nieuwe
 * exemplaren, aan de gekozen waarde: een kost betaald met privémiddelen). `uit` = naar privé
 * (onttrekking, aan de aankoopprijs: dat neutraliseert de kost). Geen omzet.
 */
export function nieuwePrive(binnen: Regel[], weg: Regel[], beursId: string | null, tijd = new Date().toISOString()): Transactie {
  if (!binnen.length && !weg.length) throw new Error("Kies minstens één kaart");
  return {
    id: uuid(), beurs_id: beursId, soort: "prive", tijd,
    regels: [...binnen.map((r) => ({ ...r, richting: "in" as const })), ...weg.map((r) => ({ ...r, richting: "uit" as const, nieuw: null }))],
    totaal: 0, cash: 0, sumup: 0, bank: 0, status: "ok", conflicten: [], opmerking: null,
  };
}

/** Wat een retour standaard kost: de prijs van wat terugkomt min wat we teruggeven. */
export function retourBedrag(terugIn: Regel[], terugUit: Regel[] = []): number {
  return rond2(terugIn.reduce((s, r) => s + r.prijs, 0) - terugUit.reduce((s, r) => s + r.prijs, 0));
}

/**
 * Geld in of uit de cashkoffer zonder verkoop: geld bijleggen (+), afhalen (−), of een andere stand
 * betaalt met SumUp en krijgt cash (sumup +, cash −). Geen omzet en geen kost.
 */
export function nieuweKasbeweging(b: { cash: number; sumup?: number }, beursId: string | null, omschrijving: string | null, tegenpartij: Tegenpartij | null = null, tijd = new Date().toISOString()): Transactie {
  const cash = rond2(b.cash);
  const sumup = rond2(b.sumup ?? 0);
  if (sumup < 0) throw new Error("Een SumUp-bedrag in de kas kan niet negatief zijn");
  if (sumup > 0 && rond2(cash + sumup) !== 0) throw new Error("Wie met SumUp betaalt, krijgt hetzelfde bedrag in cash");
  if (cash === 0 && sumup === 0) throw new Error("Vul een bedrag in");
  return {
    id: uuid(), beurs_id: beursId, soort: "kas", tijd, regels: [], totaal: 0, cash, sumup, bank: 0,
    status: "ok", conflicten: [], opmerking: omschrijving?.trim() || null, tegenpartij,
  };
}

/** Past een transactie toe op de voorraad. Een exemplaar dat al weg is, wordt een conflict. */
export function pasToe(v: Voorraad, t: Transactie): { voorraad: Voorraad; transactie: Transactie } {
  const exemplaren = new Map(v.exemplaren.map((e) => [e.id, e]));
  const artikelen = new Map(v.artikelen.map((a) => [a.id, a]));
  const conflicten: Conflict[] = [];
  const nieuweVolgorde: Exemplaar[] = [];
  let verworven: Set<string> | null = null; // pas berekend als het nodig is (inbreng van een kaart die er al was)

  for (const r of t.regels) {
    if (t.soort === "kas") continue;
    if ((t.soort === "retour" || t.soort === "prive") && r.richting === "uit") {
      // We geven hun stuk terug (een ruil of inkoop terugdraaien), of het gaat naar privé: het moet nog in voorraad zijn.
      if (r.exemplaar_id) {
        const e = exemplaren.get(r.exemplaar_id);
        if (!e || !inVoorraad(e)) { conflicten.push({ exemplaar_id: r.exemplaar_id, reden: e ? `al ${e.status}` : "onbekend exemplaar" }); continue; }
        exemplaren.set(e.id, { ...e, status: "weg", transactie_id: t.id, afgeboekt_op: t.tijd, gewijzigd_op: t.tijd });
      } else if (r.artikel_id) {
        const a = artikelen.get(r.artikel_id);
        const n = r.aantal ?? 1;
        if (!a) { conflicten.push({ artikel_id: r.artikel_id, reden: "onbekend artikel" }); continue; }
        if (a.aantal < n) conflicten.push({ artikel_id: a.id, reden: `nog maar ${a.aantal} in voorraad` });
        artikelen.set(a.id, { ...a, aantal: Math.max(0, a.aantal - n) });
      }
      continue;
    }
    if (t.soort === "retour") {
      if (r.exemplaar_id) {
        const e = exemplaren.get(r.exemplaar_id);
        if (!e) { conflicten.push({ exemplaar_id: r.exemplaar_id, reden: "onbekend exemplaar" }); continue; }
        // Twee keer terugnemen kan niet: wat al in voorraad ligt, wordt een conflict.
        if (inVoorraad(e)) { conflicten.push({ exemplaar_id: r.exemplaar_id, reden: "al in voorraad" }); continue; }
        // Een kaart die terugkomt, begint opnieuw: een oude reservering (ze werd aan die persoon verkocht) vervalt.
        exemplaren.set(e.id, { ...e, status: "in voorraad", transactie_id: null, afgeboekt_op: null, gewijzigd_op: t.tijd, ...(e.reservering ? { reservering: null } : {}) });
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
        if (t.omgeving_id && e.omgeving_id && e.omgeving_id !== t.omgeving_id) {
          conflicten.push({ exemplaar_id: r.exemplaar_id, reden: "van een andere omgeving" });
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
          aankoopbron: t.soort === "ruil" ? "ruil" : t.soort === "prive" ? "privé" : "beurs",
          ...r.nieuw,
          aankoopprijs: r.prijs,
          aankoopdatum: datumVan(t.tijd),
          status: "in voorraad",
          opslag: r.nieuw.opslag ?? "stockdoos",
          label_status: "te printen",
          ...(t.omgeving_id ? { omgeving_id: t.omgeving_id } : {}),
        }, t.tijd);
        exemplaren.set(e.id, e);
        nieuweVolgorde.push(e);
      } else if (t.soort === "prive" && r.exemplaar_id) {
        // Een kaart die al in de app stond, uit privé ingebracht: ze krijgt haar inbrengwaarde als aankoopprijs.
        // Zoals de server: nooit twee keer, en enkel als ze nog in voorraad ligt.
        verworven ??= new Set(verwervingen(v.transacties ?? []).keys());
        const e = exemplaren.get(r.exemplaar_id);
        if (!e) conflicten.push({ exemplaar_id: r.exemplaar_id, reden: "onbekend exemplaar" });
        else if (!inVoorraad(e)) conflicten.push({ exemplaar_id: e.id, reden: `al ${e.status}` });
        else if (t.omgeving_id && e.omgeving_id && e.omgeving_id !== t.omgeving_id) conflicten.push({ exemplaar_id: e.id, reden: "van een andere omgeving" });
        else if (verworven.has(e.id)) conflicten.push({ exemplaar_id: e.id, reden: "al gekocht of ingebracht" });
        else {
          exemplaren.set(e.id, { ...e, aankoopprijs: r.prijs, aankoopbron: "privé", aankoopdatum: datumVan(t.tijd), gewijzigd_op: t.tijd });
          verworven.add(e.id);
        }
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
    if (t.soort === "kas") continue;
    if ((t.soort === "retour" || t.soort === "prive") && r.richting === "uit") {
      if (r.exemplaar_id && !inConflict.has(r.exemplaar_id)) {
        const e = exemplaren.get(r.exemplaar_id);
        if (e && e.transactie_id === t.id) exemplaren.set(e.id, { ...e, status: "in voorraad", transactie_id: null, afgeboekt_op: null });
      } else if (r.artikel_id) {
        const a = artikelen.get(r.artikel_id);
        if (a) artikelen.set(a.id, { ...a, aantal: a.aantal + (r.aantal ?? 1) });
      }
      continue;
    }
    if (t.soort === "retour") {
      if (r.exemplaar_id && !inConflict.has(r.exemplaar_id)) {
        const e = exemplaren.get(r.exemplaar_id);
        const vorig = r.vorige_status && ["verkocht", "geruild", "weg"].includes(r.vorige_status) ? r.vorige_status : "verkocht";
        if (e) exemplaren.set(e.id, { ...e, status: vorig, afgeboekt_op: r.vorige_afgeboekt_op ?? t.tijd, transactie_id: r.vorige_transactie_id ?? e.transactie_id });
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
      // Zoals de server: enkel weg als het nog in voorraad ligt (anders werd het intussen verkocht).
      const e = exemplaren.get(r.nieuw.id);
      if (!e || inVoorraad(e)) weg.add(r.nieuw.id);
    } else if (t.soort === "prive" && r.exemplaar_id) {
      // Ingebracht terwijl ze al in de app stond: de vorige aankoopgegevens terug.
      const e = exemplaren.get(r.exemplaar_id);
      if (e && !inConflict.has(e.id)) exemplaren.set(e.id, { ...e, aankoopprijs: r.vorige_aankoopprijs ?? null, aankoopbron: r.vorige_aankoopbron ?? null, aankoopdatum: r.vorige_aankoopdatum ?? null });
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
  if (t.omgeving_id && nieuw.omgeving_id && nieuw.omgeving_id !== t.omgeving_id) throw new Error("Dat exemplaar hoort bij een andere omgeving");
  const regels = t.regels.map((r) =>
    r.exemplaar_id === oudId && r.richting === "uit"
      ? { ...r, exemplaar_id: nieuw.id, code: nieuw.code, naam: nieuw.naam, hartjesprijs: nieuw.hartjesprijs ?? nieuw.verkoopprijs, aankoopprijs: nieuw.aankoopprijs }
      : r,
  );
  const exemplaren = v.exemplaren.map((e) =>
    e.id === nieuw.id ? { ...e, status: (t.soort === "ruil" ? "geruild" : t.soort === "retour" || t.soort === "prive" ? "weg" : "verkocht") as Exemplaar["status"], transactie_id: t.id, afgeboekt_op: t.tijd } : e,
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
    if (t.soort === "kas" || t.soort === "prive") continue; // geen deal met een klant: telt niet als omzet
    for (const x of [t.cash, t.sumup, t.bank ?? 0]) { if (x > 0) omzet += x; else uit -= x; }
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
    transacties: geldig.filter((t) => t.soort !== "kas" && t.soort !== "prive").length,
    conflicten: geldig.filter((t) => t.status === "conflict").length,
  };
}

// ── Wat er op een beurs ging: per soort product ──────────────────────────────

export type Productsoort = "kaarten" | "slabs" | "binders" | "3d-prints" | "sealed" | "andere";
export const PRODUCTSOORTEN: { id: Productsoort; label: string; een: string; veel: string }[] = [
  { id: "kaarten", label: "Kaarten", een: "kaart", veel: "kaarten" },
  { id: "slabs", label: "Slabs", een: "slab", veel: "slabs" },
  { id: "binders", label: "Binders", een: "binder", veel: "binders" },
  { id: "3d-prints", label: "3D-prints", een: "3D-print", veel: "3D-prints" },
  { id: "sealed", label: "Sealed", een: "sealed", veel: "sealed" },
  { id: "andere", label: "Andere", een: "ander artikel", veel: "andere" },
];

export interface Telling { aantal: number; bedrag: number }

export interface BeursOverzicht {
  verkocht: Record<Productsoort, Telling>;      // verkocht voor geld
  verkochtTotaal: Telling;
  ingekocht: Telling;                            // kaarten en artikelen gekocht van klanten (bedrag = wat wij betaalden)
  trades: { aantal: number; weg: number; binnen: number; bijbetaaldDoorKlant: number; bijbetaaldDoorOns: number };
  retour: Telling;
}

/**
 * Telt per soort product wat er verkocht, ingekocht en geruild werd.
 * `soortVan` zegt welke soort een regel is (kaart, slab, binder …); de app zoekt dat op in de voorraad.
 */
export function beursOverzicht(transacties: Transactie[], soortVan: (r: Regel) => Productsoort): BeursOverzicht {
  const leeg = (): Telling => ({ aantal: 0, bedrag: 0 });
  const verkocht = Object.fromEntries(PRODUCTSOORTEN.map((p) => [p.id, leeg()])) as Record<Productsoort, Telling>;
  const ingekocht = leeg();
  const retour = leeg();
  const trades = { aantal: 0, weg: 0, binnen: 0, bijbetaaldDoorKlant: 0, bijbetaaldDoorOns: 0 };
  for (const t of transacties) {
    if (t.status === "ongedaan" || t.soort === "kas" || t.soort === "prive") continue;
    if (t.soort === "retour") { retour.aantal++; retour.bedrag += -t.totaal; continue; }
    if (t.soort === "ruil") {
      trades.aantal++;
      if (t.totaal > 0) trades.bijbetaaldDoorKlant += t.totaal; else trades.bijbetaaldDoorOns += -t.totaal;
    }
    for (const r of t.regels) {
      const n = r.aantal ?? 1;
      if (r.extra) continue; // verzendkosten: geen product
      if (r.richting === "uit") {
        if (t.soort === "ruil") { trades.weg += n; continue; }
        const v = verkocht[soortVan(r)];
        v.aantal += n;
        v.bedrag += r.prijs;
      } else if (t.soort === "ruil") {
        trades.binnen += n;
      } else {
        ingekocht.aantal += n;
        ingekocht.bedrag += r.prijs;
      }
    }
  }
  for (const v of Object.values(verkocht)) v.bedrag = rond2(v.bedrag);
  const vt = Object.values(verkocht).reduce((a, v) => ({ aantal: a.aantal + v.aantal, bedrag: a.bedrag + v.bedrag }), leeg());
  return {
    verkocht, verkochtTotaal: { aantal: vt.aantal, bedrag: rond2(vt.bedrag) },
    ingekocht: { aantal: ingekocht.aantal, bedrag: rond2(ingekocht.bedrag) },
    trades: { ...trades, bijbetaaldDoorKlant: rond2(trades.bijbetaaldDoorKlant), bijbetaaldDoorOns: rond2(trades.bijbetaaldDoorOns) },
    retour: { aantal: retour.aantal, bedrag: rond2(retour.bedrag) },
  };
}
