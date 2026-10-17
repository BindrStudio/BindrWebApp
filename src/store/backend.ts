import type { Aankoopfoto, Aanvraag, AanvraagStatus, Aanwezig, Artikel, Artikelfoto, Etalagefoto, Beurs, Exemplaar, Gebruiker, NieuwArtikel, NieuwExemplaar, Omgeving, Tegenpartij, Thema, Transactie } from "../types";

export interface Beheerder {
  user_id: string;
  naam: string;
}

export interface Alles {
  exemplaren: Exemplaar[];
  artikelen: Artikel[];
  beurzen: Beurs[];
  transacties: Transactie[];
}

/** Een prijscheck: welke hartjes moeten wisselen (de rest klopt). */
export interface PrijsMarkering { id: string; nieuw: number }

/** Waar de gegevens zitten: Supabase (echte voorraad) of de demo op dit toestel. */
export interface Backend {
  soort: "supabase" | "demo";
  gebruiker(): Gebruiker;
  gebruikerId(): string | null;
  laadAlles(): Promise<Alles>;
  /** Enkel wat sinds `sinds` (tijd van de server) veranderde; null als dat niet kan. */
  laadWijzigingen(sinds: string): Promise<Alles | null>;
  laadOmgevingen(): Promise<Omgeving[]>;
  bewaarOmgeving(o: Omgeving): Promise<void>;
  meldAanwezig(omgevingId: string | null, scherm: string): Promise<Aanwezig[]>;
  markeerPrijzen(omgevingId: string | null, lijst: PrijsMarkering[]): Promise<void>;
  laadBeheerders(): Promise<Beheerder[]>;
  laadInstellingen(): Promise<Record<string, unknown>>;
  bewaarInstelling(sleutel: string, waarde: unknown): Promise<void>;

  voegExemplarenToe(rijen: NieuwExemplaar[]): Promise<Exemplaar[]>;
  wijzigExemplaar(id: string, wijziging: Partial<Exemplaar>): Promise<Exemplaar>;
  wijzigExemplaren(ids: string[], wijziging: Partial<Exemplaar>): Promise<Exemplaar[]>;
  voegArtikelenToe(rijen: NieuwArtikel[]): Promise<Artikel[]>;
  wijzigArtikel(id: string, wijziging: Partial<Artikel>): Promise<Artikel>;

  bewaarBeurs(b: Beurs): Promise<Beurs>;
  /** Een geplande beurs schrappen (enkel zolang ze niet gestart is). */
  verwijderBeurs(id: string): Promise<void>;
  /** Naam, datum, plaats, uren of link van een geplande beurs aanpassen (enkel zolang ze niet gestart is). */
  wijzigGeplandeBeurs(id: string, w: Pick<Beurs, "naam" | "datum" | "locatie" | "uren" | "link">): Promise<void>;
  boekTransactie(t: Transactie): Promise<Transactie>;
  maakOngedaan(id: string): Promise<Transactie>;
  losConflictOp(id: string, oud: string, nieuw: string): Promise<Transactie>;
  aanvaardConflict(id: string, item: string): Promise<Transactie>;
  /** Het borderel van een transactie aanvullen (tegenpartij, handtekeningen). */
  zetTegenpartij(id: string, tegenpartij: Tegenpartij | null): Promise<void>;
  /** Foto's bij aankopen: enkel geladen wanneer je ze bekijkt. */
  laadAankoopfotos(transactieIds: string[]): Promise<Aankoopfoto[]>;
  bewaarAankoopfoto(f: Aankoopfoto): Promise<void>;
  verwijderAankoopfoto(id: string): Promise<void>;
  /** Meer foto's bij een artikel (schema 0.10). */
  laadArtikelfotos(artikelIds: string[]): Promise<Artikelfoto[]>;
  bewaarArtikelfoto(f: Artikelfoto): Promise<void>;
  verwijderArtikelfoto(id: string): Promise<void>;
  /** De etalage op de startpagina van de klanten (schema 0.10). */
  laadEtalage(): Promise<Etalagefoto[]>;
  bewaarEtalage(f: Etalagefoto): Promise<void>;
  wijzigEtalage(id: string, w: Partial<Pick<Etalagefoto, "titel" | "link" | "volgorde">>): Promise<void>;
  verwijderEtalage(id: string): Promise<void>;
  /** Thema's van de klantenpagina (schema 0.13). Zonder `logo` in het thema blijft het logo op de server staan. */
  laadThemas(opties?: { zonderLogos?: boolean }): Promise<Thema[]>;
  /** De logo's van één thema (voor het beheer: enkel van het thema van vandaag). */
  laadThemaLogos(id: string): Promise<Pick<Thema, "logo" | "logo_groot" | "logo_eend"> | null>;
  bewaarThema(t: Thema): Promise<void>;
  /** Aanvragen voor een eigen binder: de lijst zonder afbeeldingen, de afbeeldingen apart. */
  laadAanvragen(): Promise<Aanvraag[]>;
  laadAanvraagBeelden(id: string): Promise<Pick<Aanvraag, "artwork" | "voorbeeld" | "beelden">>;
  zetAanvraagStatus(id: string, status: AanvraagStatus): Promise<void>;
  /** Een aanvraag wissen (spam, of na het afwerken met de afbeeldingen erin). */
  verwijderAanvraag(id: string): Promise<void>;

  /** Het wachtwoord van de ingelogde beheerder wijzigen (eerst het huidige; null = na een herstelmail). */
  wijzigWachtwoord(huidig: string | null, nieuw: string): Promise<void>;

  logUit(): Promise<void>;
}

/** Een fout van de server of het netwerk. Zonder status = geen verbinding. */
export class Fout extends Error {
  constructor(message: string, public status?: number) {
    super(message);
  }
}

export const isNetwerkFout = (e: unknown) => e instanceof Fout && e.status === undefined;
