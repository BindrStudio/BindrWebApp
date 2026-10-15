export type Opslag = "vitrine" | "stockdoos";
export type Status = "in voorraad" | "verkocht" | "geruild" | "weg";
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
  verkoopprijs: number | null;
  prijs_handmatig: boolean;
  hartjesprijs: number | null;
  hartjesdatum: string | null;
  aankoopprijs: number | null;
  aankoopdatum: string | null;
  aankoopbron: string | null;
  label_status: LabelStatus;
  opmerking: string | null;
  transactie_id: string | null; // laatste verkoop of ruil waarmee het de voorraad verliet
  afgeboekt_op: string | null;
  vitrine_sinds?: string | null; // sinds wanneer het in de catalogus ligt (voor "Nieuw")
  aangemaakt_op: string;
  gewijzigd_op: string;
}

export interface Artikel {
  id: string;
  naam: string;
  soort: "sealed" | "eigen product" | "andere";
  aantal: number;
  prijs: number | null;
  opslag: Opslag;
  opmerking: string | null;
}

export type NieuwExemplaar = Partial<Exemplaar> & Pick<Exemplaar, "code" | "naam">;

// ── Beurs en kassa ───────────────────────────────────────────────────────────

/** De stand van de voorraad op één moment (bij de start en het einde van een beurs). */
export interface Stand {
  catalogus: number;        // exemplaren in de catalogus (vitrine)
  catalogusWaarde: number;  // som van de hartjes
  artikelenWaarde: number;  // artikelen in de catalogus, prijs × aantal
  voorraad: number;         // alle exemplaren in voorraad (catalogus + vault)
}

export interface Beurs {
  id: string;
  naam: string;
  datum: string;
  standgeld: number | null;
  startkas: number | null;
  status: "gepland" | "actief" | "afgesloten";
  gestart_op: string | null;
  afgesloten_op: string | null;
  getelde_kas: number | null;
  sumup_bevestigd: boolean;
  stand_start: Stand | null;
  stand_einde: Stand | null;
  opmerking: string | null;
}

export type TransactieSoort = "verkoop" | "ruil" | "inkoop" | "retour";

/**
 * Eén regel van een transactie.
 *   uit = wij geven (verkopen of wegruilen), in = wij krijgen (ruil, inkoop of retour).
 *   prijs = het afgesproken bedrag voor de hele regel (bij artikelen voor het hele aantal).
 */
export interface Regel {
  richting: "uit" | "in";
  exemplaar_id?: string | null;
  artikel_id?: string | null;
  aantal?: number;
  naam: string;
  code?: string | null;
  hartjesprijs?: number | null;  // de prijs op het hartje (uit), om kortingen te zien
  prijs: number;
  aankoopprijs?: number | null;  // voor de marge (uit)
  referentie?: number | null;    // Near Mint-referentie (in), om een totaal te verdelen
  nieuw?: NieuwExemplaar | null; // in: het nieuwe exemplaar dat binnenkomt
  vorige_status?: Status | null; // retour: de status vóór de retour
}

export interface Conflict {
  exemplaar_id?: string | null;
  artikel_id?: string | null;
  reden: string;
}

export interface Transactie {
  id: string;
  beurs_id: string | null;
  soort: TransactieSoort;
  tijd: string;
  beheerder?: string | null;
  regels: Regel[];
  totaal: number;   // + de klant betaalt ons, − wij betalen de klant
  cash: number;     // + in de cashkoffer, − eruit
  sumup: number;
  status: "ok" | "conflict" | "ongedaan";
  conflicten: Conflict[];
  opmerking: string | null;
}
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
