export type Opslag = "vitrine" | "stockdoos";
export type Status = "in voorraad" | "gereserveerd" | "verkocht" | "geruild" | "weg";
export type LabelStatus = "te printen" | "geprint" | "gestickerd";
export type Soort = "kaart" | "slab" | "eigen product";
export type Catalogus = "en" | "asia";

export interface Exemplaar {
  id: string;
  code: string;
  soort: Soort;
  kaart_id: string | null;
  catalogus: Catalogus | null;
  afbeelding: string | null;
  naam: string;
  naam_origineel: string | null;
  set_naam: string | null;
  set_code: string | null;
  nummer: string | null;
  taal: string;
  conditie: string | null;
  variant: string;
  grader: string | null;
  grade: string | null;
  cardmarket_id: number | null;
  opslag: Opslag;
  status: Status;
  gereserveerd_voor: string | null;
  verkoopprijs: number | null;
  prijs_handmatig: boolean;
  hartjesprijs: number | null;
  hartjesdatum: string | null;
  aankoopprijs: number | null;
  aankoopdatum: string | null;
  aankoopbron: string | null;
  label_status: LabelStatus;
  opmerking: string | null;
  aangemaakt_op: string;
  gewijzigd_op: string;
}

export interface Artikel {
  id: string;
  naam: string;
  soort: "sealed" | "eigen product" | "bulk" | "andere";
  aantal: number;
  prijs: number | null;
  opslag: Opslag;
  opmerking: string | null;
}

export type NieuwExemplaar = Partial<Exemplaar> & Pick<Exemplaar, "code" | "naam">;
export type NieuwArtikel = Partial<Artikel> & Pick<Artikel, "naam">;

export interface Gebruiker {
  email: string;
  naam?: string;
}

// Een kaart uit de catalogus (TCGdex).
export interface CatalogusKaart {
  id: string;            // TCGdex-id, bv. me02-130
  catalogus: Catalogus;
  setId: string;
  setNaam: string;
  setCode: string;       // officiële afkorting, bv. PFL (leeg bij oudere sets)
  serie: string;
  nummer: string;
  setTotaal: number;
  naam: string;          // Engelse naam (of beste benadering)
  naamJa?: string;
  naamZhTw?: string;
  naamZhCn?: string;
  zeldzaamheid: string;
  cardmarket: number | null;
  release: string;
}

export const TALEN: { code: string; label: string; asia?: boolean }[] = [
  { code: "EN", label: "Engels" },
  { code: "DE", label: "Duits" },
  { code: "FR", label: "Frans" },
  { code: "IT", label: "Italiaans" },
  { code: "ES", label: "Spaans" },
  { code: "PT", label: "Portugees" },
  { code: "JP", label: "Japans", asia: true },
  { code: "CN-T", label: "Chinees (traditioneel)", asia: true },
  { code: "CN-S", label: "Chinees (vereenvoudigd)", asia: true },
  { code: "KR", label: "Koreaans", asia: true },
];

export const CONDITIES = ["M", "NM", "EX", "GD", "LP", "PL", "PO"] as const;
export const VARIANTEN = ["normaal", "reverse holo", "holo", "1st edition"] as const;
