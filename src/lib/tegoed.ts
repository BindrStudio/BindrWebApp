// Storecredit (tegoed): iemand verkoopt ons kaarten en krijgt in plaats van geld een tegoedbon, die hij later bij ons
// gebruikt. De inkoop is de bon (transactie met tegoed < 0, op naam); wie later met tegoed betaalt, zegt van welke
// bon(nen) (tegoed_van). Wat er nog op een bon staat = wat we gaven min wat er al van gebruikt werd. Ongedaan gemaakte
// transacties tellen niet. Voor de boekhouding: de inkoop is een aankoop (zoals een ruil, maar met de betaling later),
// de verkoop met tegoed is een ontvangst; wat er op 31/12 nog openstaat, is een schuld aan klanten.
import type { TegoedGebruik, Transactie } from "../types";
import { dagVan } from "./format";

const rond2 = (x: number) => Math.round(x * 100) / 100;

export interface Tegoedbon {
  id: string;             // de transactie die de bon gaf
  code: string;           // TG-2026-7F3K2Q
  naam: string;
  datum: string;          // JJJJ-MM-DD
  bedrag: number;         // wat we gaven
  gebruikt: number;
  rest: number;
  transactie: Transactie;
  gebruik: { transactie: Transactie; bedrag: number }[];
}

/** TG-2026-7F3K2Q: uniek per bon (de transactie die hem gaf), ook offline op drie gsm's tegelijk. */
export function bonCode(t: Pick<Transactie, "id" | "tijd">): string {
  return `TG-${dagVan(t.tijd).slice(0, 4)}-${t.id.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
}

/** Alle tegoedbonnen, de oudste eerst, met wat er al van gebruikt werd (tot en met `tot`, als je dat geeft). */
export function tegoedbonnen(transacties: Transactie[], tot?: string): Tegoedbon[] {
  const geldig = transacties.filter((t) => t.status !== "ongedaan" && (!tot || dagVan(t.tijd) <= tot));
  const bonnen = new Map<string, Tegoedbon>();
  for (const t of [...geldig].sort((a, b) => a.tijd.localeCompare(b.tijd))) {
    if ((t.tegoed ?? 0) < 0) {
      const bedrag = rond2(-(t.tegoed ?? 0));
      bonnen.set(t.id, { id: t.id, code: bonCode(t), naam: t.tegenpartij?.naam?.trim() || "?", datum: dagVan(t.tijd), bedrag, gebruikt: 0, rest: bedrag, transactie: t, gebruik: [] });
    }
  }
  for (const t of geldig) {
    if ((t.tegoed ?? 0) <= 0) continue;
    for (const g of t.tegoed_van ?? []) {
      const b = bonnen.get(g.bon);
      if (!b) continue;
      b.gebruik.push({ transactie: t, bedrag: g.bedrag });
      b.gebruikt = rond2(b.gebruikt + g.bedrag);
      b.rest = rond2(b.bedrag - b.gebruikt);
    }
  }
  return [...bonnen.values()];
}

/** De bonnen waar nog iets op staat. */
export const openBonnen = (transacties: Transactie[]) => tegoedbonnen(transacties).filter((b) => b.rest > 0.004);

/** Wat er op het einde van `datum` nog op de bonnen stond: een schuld aan klanten (voor de jaarafsluiting). */
export function openTegoedOp(transacties: Transactie[], datum: string): number {
  return rond2(tegoedbonnen(transacties, datum).reduce((s, b) => s + Math.max(0, b.rest), 0));
}

/** `bedrag` verdelen over de gekozen bonnen, de oudste eerst, nooit meer dan er op een bon staat. */
export function verdeelOverBonnen(bonnen: Tegoedbon[], bedrag: number): TegoedGebruik[] {
  let over = rond2(bedrag);
  const uit: TegoedGebruik[] = [];
  for (const b of [...bonnen].sort((x, y) => x.datum.localeCompare(y.datum) || x.id.localeCompare(y.id))) {
    if (over <= 0) break;
    const deel = rond2(Math.min(over, b.rest));
    if (deel <= 0) continue;
    uit.push({ bon: b.id, bedrag: deel });
    over = rond2(over - deel);
  }
  return uit;
}

/** Zoeken op naam of code (zonder hoofdletters, ook een deel). */
export function zoekBonnen(bonnen: Tegoedbon[], zoek: string): Tegoedbon[] {
  const q = zoek.trim().toLowerCase().replace(/\s+/g, " ");
  if (!q) return bonnen;
  return bonnen.filter((b) => b.naam.toLowerCase().includes(q) || b.code.toLowerCase().includes(q.replace(/\s/g, "")));
}
