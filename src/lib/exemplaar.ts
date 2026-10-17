import type { Artikel, Exemplaar, NieuwArtikel, NieuwExemplaar } from "../types";
import { uuid } from "./uuid";

/** Vult een nieuw exemplaar aan met de standaardwaarden (zoals de database dat doet). */
export function standaardExemplaar(r: NieuwExemplaar, nu = new Date().toISOString()): Exemplaar {
  return {
    id: uuid(), soort: "kaart", kaart_id: null, catalogus: null, afbeelding: null, naam_origineel: null, set_naam: null,
    set_code: null, nummer: null, taal: "EN", conditie: "NM", variant: "normaal", grader: null, grade: null,
    cardmarket_id: null, opslag: "stockdoos", status: "in voorraad", verkoopprijs: null,
    prijs_handmatig: false, hartjesprijs: null, hartjesdatum: null, aankoopprijs: null, aankoopdatum: null,
    aankoopbron: null, label_status: "te printen", opmerking: null, transactie_id: null, afgeboekt_op: null,
    aangemaakt_op: nu, gewijzigd_op: nu,
    ...r,
    vitrine_sinds: (r.opslag ?? "stockdoos") === "vitrine" ? r.vitrine_sinds ?? nu : null,
  } as Exemplaar;
}

/**
 * Houdt bij sinds wanneer een exemplaar in de catalogus ligt (zoals de databasetrigger
 * zet_vitrine_sinds). Enkel op het toestel; de server zet het zelf.
 */
export function metVitrineSinds(oud: Exemplaar, nieuw: Exemplaar, nu = new Date().toISOString()): Exemplaar {
  if (nieuw.opslag !== "vitrine") return nieuw.vitrine_sinds == null ? nieuw : { ...nieuw, vitrine_sinds: null };
  if (oud.opslag !== "vitrine") return { ...nieuw, vitrine_sinds: nu };
  return nieuw;
}

export function standaardArtikel(r: NieuwArtikel, nu = new Date().toISOString()): Artikel {
  return { id: uuid(), soort: "sealed", aantal: 0, prijs: null, opslag: "vitrine", opmerking: null, aangemaakt_op: nu, ...r } as Artikel;
}

/**
 * Het aantal van een artikel met de hand aanpassen (bijgekocht, kapot, pack geopend): het verschil komt
 * in `details.tellingen`, zodat de voorraad op een vroegere datum (31 december) blijft kloppen.
 */
export function metTelling(a: Artikel, nieuwAantal: number, reden: string | null = null, op = new Date().toISOString()): Pick<Artikel, "aantal" | "details"> {
  const aantal = Math.max(0, Math.round(nieuwAantal));
  const delta = aantal - a.aantal;
  const details = a.details ?? {};
  if (!delta) return { aantal, details };
  return { aantal, details: { ...details, tellingen: [...(details.tellingen ?? []), { op, delta, reden }] } };
}

export const inVoorraad = (e: Exemplaar) => e.status === "in voorraad";

/** De reservering die nu geldt (enkel zolang de kaart in voorraad ligt; na de verkoop blijft ze als geschiedenis). */
export const actieveReservering = (e: Exemplaar) => (inVoorraad(e) && e.reservering?.voor ? e.reservering : null);

/** Is de reservering voorbij haar einddatum? */
export const reserveringVerlopen = (r: { tot?: string | null } | null | undefined, vandaag: string) => !!r?.tot && r.tot < vandaag;
/** Enkel kaarten en slabs krijgen een QR-label; eigen producten (binders, 3D) en artikels nooit. */
export const krijgtLabel = (e: Pick<Exemplaar, "soort">) => e.soort === "kaart" || e.soort === "slab";

/**
 * Gegevens van de server of een oude kopie gelijktrekken met de huidige app:
 * reserveren en bulk bestaan niet meer.
 */
export function schoonExemplaar(e: Exemplaar): Exemplaar {
  const s = e.status as string;
  return s === "gereserveerd" ? { ...e, status: "in voorraad" } : e;
}
export function schoonArtikel(a: Artikel): Artikel {
  return (a.soort as string) === "bulk" ? { ...a, soort: "andere" } : a;
}
