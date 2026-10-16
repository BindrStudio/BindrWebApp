import type { Exemplaar } from "../types";
import type { Prijsgids, PrijsRegel } from "./prices";

export interface Drempel {
  tot: number | null; // hartjesprijs onder dit bedrag (null = alles daarboven)
  verschil: number;   // voorstel pas vanaf dit verschil in euro
}

export interface Instellingen {
  drempels: Drempel[];
  conditiefactoren: Record<string, number>;
  nakijkenAfwijking: number; // trend en 30-dagengemiddelde verschillen meer dan dit deel
  automatischPrinten: boolean;
  labelMaat: string; // id uit LABELMATEN
  labelDonkerte?: number;     // 1–5 zoals in de Niimbot-app (standaard 3), enkel op dit toestel
  labelVerschuiving?: number; // mm langs de doorvoer: + = lager op het label, − = hoger (stappen van 0,5)
  labelTrager?: boolean;      // trager versturen als labels leeg of half uit de printer komen
  inkoopPct: number; // wat we bieden bij inkoop, in % van de marktwaarde
  ruilPct: number;   // wat een kaart van de klant waard is bij ruil, in %
  toonMarge?: boolean; // aankoopprijs en marge zichtbaar in de kassa (enkel op deze gsm)
}

export const STANDAARD_INSTELLINGEN: Instellingen = {
  drempels: [
    { tot: 5, verschil: 1 },
    { tot: 20, verschil: 2 },
    { tot: 50, verschil: 3 },
    { tot: 100, verschil: 5 },
    { tot: null, verschil: 10 },
  ],
  conditiefactoren: { M: 1, NM: 1, EX: 0.9, GD: 0.8, LP: 0.7, PL: 0.5, PO: 0.3 },
  nakijkenAfwijking: 0.3,
  automatischPrinten: false,
  labelMaat: "50x15",
  inkoopPct: 70,
  ruilPct: 80,
};

// Talen waarvoor de Cardmarket-prijsgids een bruikbare richtprijs geeft.
// Engels, en Japans omdat Cardmarket Japanse sets als aparte producten verkoopt.
const TALEN_MET_GIDS = new Set(["EN", "JP"]);

export function rondEuro(x: number): number {
  return Math.max(1, Math.round(x));
}

export interface Voorstel {
  voorstel: number;
  referentie: number;
  trend: number | null;
  laagste: number | null;
  gem30: number | null;
  factor: number;
  nakijken: boolean;
  holo: boolean;
}

export function prijsVoor(regel: PrijsRegel | undefined, holo: boolean) {
  if (!regel) return null;
  const [trend, laagste, gem30, trendH, laagsteH, gem30H, gem1, gem7, gem1H, gem7H] = regel;
  if (holo && (trendH != null || gem30H != null)) {
    return { trend: trendH ?? null, laagste: laagsteH ?? null, gem30: gem30H ?? null, gem1: gem1H ?? null, gem7: gem7H ?? null, holo: true };
  }
  return { trend: trend ?? null, laagste: laagste ?? null, gem30: gem30 ?? null, gem1: gem1 ?? null, gem7: gem7 ?? null, holo: false };
}

/** Het prijsvoorstel van de app voor één exemplaar, of null als de beheerder zelf moet prijzen. */
export function voorstelVoor(ex: Exemplaar, gids: Prijsgids | null, inst: Instellingen): Voorstel | null {
  if (!gids || ex.soort !== "kaart" || !ex.cardmarket_id) return null;
  if (!TALEN_MET_GIDS.has(ex.taal)) return null;
  const holo = ex.variant === "reverse holo" || ex.variant === "holo";
  const p = prijsVoor(gids.prijzen.get(ex.cardmarket_id), holo);
  if (!p) return null;
  const referentie = p.trend ?? p.gem30 ?? p.laagste;
  if (referentie == null) return null;
  const factor = inst.conditiefactoren[ex.conditie || "NM"] ?? 1;
  const nakijken =
    p.trend != null && p.gem30 != null && Math.min(p.trend, p.gem30) > 0 &&
    Math.abs(p.trend - p.gem30) / Math.min(p.trend, p.gem30) > inst.nakijkenAfwijking;
  return { voorstel: rondEuro(referentie * factor), referentie, trend: p.trend, laagste: p.laagste, gem30: p.gem30, factor, nakijken, holo: p.holo };
}

export function drempelVoor(hartje: number, inst: Instellingen): number {
  for (const d of inst.drempels) if (d.tot == null || hartje < d.tot) return d.verschil;
  return inst.drempels[inst.drempels.length - 1].verschil;
}

export interface TeWijzigen {
  id: string;
  oud: number;
  nieuw: number;
  richting: "op" | "neer";
}

/** De herprijsknop: welke hartjes in de vitrine moeten wisselen. */
export function prijscheck(exemplaren: Exemplaar[], gids: Prijsgids | null, inst: Instellingen): TeWijzigen[] {
  const uit: TeWijzigen[] = [];
  for (const ex of exemplaren) {
    if (ex.opslag !== "vitrine") continue;
    if (ex.status !== "in voorraad") continue;
    if (ex.prijs_handmatig || ex.hartjesprijs == null) continue;
    const v = voorstelVoor(ex, gids, inst);
    if (!v) continue;
    const verschil = v.voorstel - ex.hartjesprijs;
    if (Math.abs(verschil) >= drempelVoor(ex.hartjesprijs, inst)) {
      uit.push({ id: ex.id, oud: ex.hartjesprijs, nieuw: v.voorstel, richting: verschil > 0 ? "op" : "neer" });
    }
  }
  return uit;
}

/**
 * Een nieuw totaal verdelen over meerdere kaarten, in verhouding tot hun prijs.
 * Rekent op de cent; een afrondingsverschil gaat naar de duurste kaart, zodat de som exact klopt.
 */
export function verdeelTotaal(prijzen: number[], nieuwTotaal: number): number[] {
  const totaal = prijzen.reduce((a, b) => a + b, 0);
  if (totaal <= 0) return prijzen.map(() => Math.round((nieuwTotaal / prijzen.length) * 100) / 100);
  const delen = prijzen.map((p) => Math.round(((p * nieuwTotaal) / totaal) * 100) / 100);
  const rest = Math.round((nieuwTotaal - delen.reduce((a, b) => a + b, 0)) * 100) / 100;
  if (rest !== 0) {
    let duurste = 0;
    prijzen.forEach((p, i) => { if (p > prijzen[duurste]) duurste = i; });
    delen[duurste] = Math.round((delen[duurste] + rest) * 100) / 100;
  }
  return delen;
}

/** De vault: welke exemplaren zijn volgens de prijsgids duidelijk meer waard dan genoteerd. */
export function waardeStijgers(exemplaren: Exemplaar[], gids: Prijsgids | null, inst: Instellingen): Map<string, TeWijzigen> {
  const uit = new Map<string, TeWijzigen>();
  for (const ex of exemplaren) {
    if (ex.opslag !== "stockdoos" || ex.status !== "in voorraad") continue;
    const v = voorstelVoor(ex, gids, inst);
    if (!v) continue;
    const basis = ex.verkoopprijs ?? ex.aankoopprijs;
    if (basis == null) continue;
    if (v.voorstel - basis >= drempelVoor(basis, inst)) uit.set(ex.id, { id: ex.id, oud: basis, nieuw: v.voorstel, richting: "op" });
  }
  return uit;
}
