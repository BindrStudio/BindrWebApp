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

export function standaardArtikel(r: NieuwArtikel): Artikel {
  return { id: uuid(), soort: "sealed", aantal: 0, prijs: null, opslag: "vitrine", opmerking: null, ...r } as Artikel;
}

export const inVoorraad = (e: Exemplaar) => e.status === "in voorraad";

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
