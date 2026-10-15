import type { Artikel, Exemplaar, NieuwArtikel, NieuwExemplaar } from "../types";
import { uuid } from "./uuid";

/** Vult een nieuw exemplaar aan met de standaardwaarden (zoals de database dat doet). */
export function standaardExemplaar(r: NieuwExemplaar, nu = new Date().toISOString()): Exemplaar {
  return {
    id: uuid(), soort: "kaart", kaart_id: null, catalogus: null, afbeelding: null, naam_origineel: null, set_naam: null,
    set_code: null, nummer: null, taal: "EN", conditie: "NM", variant: "normaal", grader: null, grade: null,
    cardmarket_id: null, opslag: "stockdoos", status: "in voorraad", gereserveerd_voor: null, verkoopprijs: null,
    prijs_handmatig: false, hartjesprijs: null, hartjesdatum: null, aankoopprijs: null, aankoopdatum: null,
    aankoopbron: null, label_status: "te printen", opmerking: null, transactie_id: null, afgeboekt_op: null,
    aangemaakt_op: nu, gewijzigd_op: nu,
    ...r,
  } as Exemplaar;
}

export function standaardArtikel(r: NieuwArtikel): Artikel {
  return { id: uuid(), soort: "sealed", aantal: 0, prijs: null, opslag: "vitrine", opmerking: null, ...r } as Artikel;
}

export const inVoorraad = (e: Exemplaar) => e.status === "in voorraad" || e.status === "gereserveerd";
