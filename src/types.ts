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
  nieuw_hartje?: number | null;  // prijscheck: dit hartje moet erop (null = het hartje klopt)
  cert?: string | null;          // graded: certificaatnummer op het label van de slab
  verkopen?: Verkoop[] | null;   // graded: laatste verkopen die we opzochten (eBay sold …)
  omgeving_id?: string | null;   // Bind'r of Brent
  foto?: string | null;          // eigen foto (data-URL), enkel als er nergens een foto van de kaart is
  aangemaakt_op: string;
  gewijzigd_op: string;
}

/** Wat voor artikel: onze binders en 3D-prints (eigen product), sealed, of iets anders. */
export type ArtikelType = "binder" | "3d-print" | "sealed" | "andere";
export type Techniek = "laser" | "uv" | "geschilderd";

/** Extra gegevens per artikel (in de database: kolom details, jsonb). */
export interface ArtikelDetails {
  type?: ArtikelType;
  // Binders
  merk?: string | null;        // bv. Vault X
  grootte?: string | null;     // 4-pocket, 9-pocket, 12-pocket …
  toploader?: boolean;         // binder voor toploaders
  artwork?: string | null;     // welk ontwerp erop staat
  techniek?: Techniek | null;  // laser, UV-print of geschilderd
  // Sealed
  product?: string | null;     // booster, display, ETB …
  set?: string | null;
  taal?: string | null;
  /** Met de hand aangepaste aantallen (bijgekocht, kapot, pack geopend): zo klopt de voorraad op een vroegere datum. */
  tellingen?: Telling[];
  /** Verwijderd (ISO-tijd): niet meer in de lijsten, maar wel in de historiek en de voorraad op een vroegere datum. */
  verwijderd?: string | null;
}

/** Eén aanpassing van het aantal buiten de kassa: + bijgekomen, − weg. */
export interface Telling {
  op: string;          // ISO-tijd
  delta: number;       // het verschil in stuks
  reden?: string | null;
}

export interface Artikel {
  id: string;
  naam: string;
  soort: "sealed" | "eigen product" | "andere";
  aantal: number;
  prijs: number | null;
  opslag: Opslag;
  opmerking: string | null;
  omgeving_id?: string | null;
  aankoopprijs?: number | null;  // per stuk (wat het ons kostte)
  foto?: string | null;          // eigen foto (verkleind, als data-URL)
  details?: ArtikelDetails | null;
  cardmarket_id?: number | null; // voor sealed: het product op Cardmarket
  zichtbaar?: boolean | null;    // op de klantenpagina (null: binders altijd, de rest als het in de catalogus ligt)
  aangemaakt_op?: string | null;
  gewijzigd_op?: string | null;
}

export type NieuwExemplaar = Partial<Exemplaar> & Pick<Exemplaar, "code" | "naam">;

/** Een verkoop die we zelf opzochten (bv. eBay sold) om een graded kaart te prijzen. */
export interface Verkoop {
  datum: string;   // JJJJ-MM-DD
  prijs: number;   // in euro
  bron?: string | null; // eBay, Cardmarket, beurs …
}

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
  locatie?: string | null;
  uren?: string | null;   // openingsuren, voor de klantenpagina (bv. 10:00–17:00)
  link?: string | null;   // website of Facebook van de beurs
  omgeving_id?: string | null;
}

/**
 * verkoop, ruil, inkoop en retour gaan over kaarten en artikelen. "kas" is geld dat in of uit de
 * cashkoffer gaat zonder dat er iets verkocht wordt (wisselgeld van een andere stand, geld bijleggen
 * of afhalen): geen omzet en geen kost.
 */
export type TransactieSoort = "verkoop" | "ruil" | "inkoop" | "retour" | "kas" | "prive";
// "prive": kaarten tussen de privécollectie van de zaakvoerder en de zaak, zonder geld.
//   in = inbreng uit privé (een aankoop, betaald met privémiddelen), uit = naar privé (onttrekking aan aankoopwaarde).

/**
 * Met wie we zaken deden, voor het aankoop- of ruilborderel (enkel voor de beheerders, nooit publiek).
 * Geen rijksregisternummer of kopie van de identiteitskaart: enkel een vinkje dat we ze nakeken.
 */
export interface Tegenpartij {
  naam?: string | null;             // minstens een voornaam (boven € 250 liefst de volledige naam)
  adres?: string | null;            // gemeente of adres (aangeraden boven € 250)
  type?: "particulier" | "handelaar";
  kanaal?: "beurs" | "online" | "rommelmarkt" | "andere" | null; // waar we kochten (buiten een beurs)
  btw?: string | null;              // ondernemingsnummer van een handelaar
  factuur?: string | null;          // factuurnummer van de handelaar (dan is hun factuur het bewijs)
  met_factuur?: boolean;            // met factuur: die geef je zelf in Dexxter in (niet in de dagstaat-kost)
  vendor?: boolean;                 // op een beurs gekocht van een andere stand (enkel ter info)
  id_gecontroleerd?: boolean;       // niet meer gebruikt (0.6)
  handtekening?: string | null;     // de verkoper, als SVG-pad (getekend op de gsm)
  handtekening_ons?: string | null; // de beheerder
  getekend_op?: string | null;
}

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
  referentie?: number | null;    // marktwaarde (in), om het bod te verdelen
  referentie_bron?: string | null; // waar die marktwaarde vandaan komt (Cardmarket trend, eBay-verkopen, eigen schatting)
  pct?: number | null;           // in: eigen percentage voor deze kaart (anders het algemene van het bod)
  nieuw?: NieuwExemplaar | null; // in: het nieuwe exemplaar dat binnenkomt
  vorige_status?: Status | null; // retour: de status vóór de retour
  vorige_afgeboekt_op?: string | null;  // retour: wanneer het de voorraad verliet (om een retour ongedaan te maken)
  vorige_transactie_id?: string | null; // retour: de transactie waarmee het de voorraad verliet
  van?: string | null;           // retour: uit welke transactie deze regel komt
  omschrijving?: string | null;  // in, bestaand exemplaar: set, nummer, conditie (voor het bewijs)
  vorige_aankoopprijs?: number | null; // privé in, bestaand exemplaar: om ongedaan maken terug te zetten
  vorige_aankoopbron?: string | null;
  vorige_aankoopdatum?: string | null;
  // Bij een retour: "in" = ons stuk komt terug, "uit" = we geven hun stuk terug (een ruil of inkoop terugdraaien).
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
  bank?: number;    // overschrijving (+ ontvangen, − betaald), bv. boven de cashgrens van € 3.000
  tegenpartij?: Tegenpartij | null;
  status: "ok" | "conflict" | "ongedaan";
  conflicten: Conflict[];
  opmerking: string | null;
  omgeving_id?: string | null;
}

/** Een foto bij een aankoop (de gekochte kaarten, of een screenshot van het gesprek bij een online aankoop). */
export interface Aankoopfoto {
  id: string;
  transactie_id: string;
  foto: string;          // data-URL (verkleind)
  omgeving_id?: string | null;
  aangemaakt_op?: string;
}

/** Een extra foto bij een artikel (de eerste blijft `artikel.foto`). */
export interface Artikelfoto {
  id: string;
  artikel_id: string;
  foto: string;          // data-URL (verkleind)
  volgorde: number;
}

/** Een foto van ons werk die op de startpagina van de klanten zweeft. */
export interface Etalagefoto {
  id: string;
  foto: string;          // data-URL (verkleind)
  titel?: string | null;
  link?: string | null;  // bv. het bericht op Instagram
  volgorde: number;
  omgeving_id?: string | null;
  aangemaakt_op?: string;
}

export type AanvraagStatus = "nieuw" | "bekeken" | "beantwoord" | "gesloten";

/** Een aanvraag van een klant voor een eigen binder (formulier op de klantenpagina). */
export interface Aanvraag {
  id: string;
  naam: string;
  email: string;
  telefoon?: string | null;
  grootte?: string | null;
  kleur?: string | null;
  idee: string;
  toploader?: boolean | null; // binder voor toploaders (schema 0.11)
  artwork?: string | null;   // enkel geladen als je de aanvraag opent
  voorbeeld?: string | null;
  beelden?: string[] | null; // afbeeldingen van het idee (schema 0.11), enkel geladen als je de aanvraag opent
  status: AanvraagStatus;
  aangemaakt_op: string;
}

/**
 * Wat de wet vraagt op de website van een onderneming (Boek XII WER): wie we zijn, waar, het ondernemingsnummer
 * en hoe je ons bereikt. Staat op de klantenpagina (publiek), los van de gegevens voor de boekhouding.
 */
export interface BedrijfPubliek {
  handelsnaam?: string | null;   // Bind'r
  naam?: string | null;          // naam van de ondernemer (eenmanszaak)
  adres?: string | null;         // vestigingsadres
  kbo?: string | null;           // ondernemingsnummer
  email?: string | null;
  telefoon?: string | null;
  vrijstelling?: boolean;        // bijzondere vrijstellingsregeling kleine ondernemingen (geen btw)
}

/** Gegevens van de onderneming voor het borderel en de rapporten (per omgeving: Bind'r en Brent apart). */
export interface Bedrijf {
  naam?: string | null;      // naam van de zelfstandige of de onderneming
  adres?: string | null;
  kbo?: string | null;       // ondernemingsnummer
  start?: string | null;     // JJJJ-MM-DD: begin van de activiteit (voor de grens van de btw-vrijstelling in het startjaar)
  boekhouding?: boolean;     // false: deze omgeving werkt als particulier (geen boekhouding, aankoopbewijzen of privé)
}

/** Een omgeving: Bind'r en Brent houden elk hun eigen stock, kassa en beurzen bij. */
export interface Omgeving {
  id: string;
  naam: string;
  volgorde: number;
  zichtbaar_voor_klanten: boolean;
}

/** Wie is er nu bezig in de app (elk toestel meldt zich om de minuut). */
export interface Aanwezig {
  user_id: string;
  omgeving_id: string | null;
  scherm: string | null;
  laatst: string;
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
  nummer: string;        // zoals gedrukt (Classic Collection van 30th: het oude nummer, bv. 4)
  setTotaal: number;     // zoals gedrukt (Classic Collection: het totaal van de oude set, bv. 102)
  lokaal?: string;       // het nummer bij TCGdex (voor de foto), als het anders is dan het gedrukte
  alias?: { nr: string; totaal: number } | null; // een tweede gedrukt nummer om op te zoeken (Pikachu 01/30)
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
  { code: "NL", label: "Nederlands" },
  { code: "JP", label: "Japans", asia: true },
  { code: "CN-T", label: "Chinees (traditioneel)", asia: true },
  { code: "CN-S", label: "Chinees (vereenvoudigd)", asia: true },
  { code: "KR", label: "Koreaans", asia: true },
];

export const CONDITIES = ["M", "NM", "EX", "GD", "LP", "PL", "PO"] as const;
export const VARIANTEN = ["normaal", "reverse holo", "holo", "1st edition"] as const;
