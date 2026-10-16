import type { Aankoopfoto, Aanwezig, Artikel, Beurs, Exemplaar, Gebruiker, NieuwArtikel, NieuwExemplaar, Omgeving, Tegenpartij, Transactie } from "../types";

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

  /** Het wachtwoord (de pincode) van de ingelogde beheerder wijzigen. */
  wijzigPincode(pin: string): Promise<void>;

  logUit(): Promise<void>;
}

/** Een fout van de server of het netwerk. Zonder status = geen verbinding. */
export class Fout extends Error {
  constructor(message: string, public status?: number) {
    super(message);
  }
}

export const isNetwerkFout = (e: unknown) => e instanceof Fout && e.status === undefined;
