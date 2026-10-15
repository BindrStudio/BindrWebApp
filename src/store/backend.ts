import type { Artikel, Beurs, Exemplaar, Gebruiker, NieuwArtikel, NieuwExemplaar, Transactie } from "../types";

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

/** Waar de gegevens zitten: Supabase (echte voorraad) of de demo op dit toestel. */
export interface Backend {
  soort: "supabase" | "demo";
  gebruiker(): Gebruiker;
  gebruikerId(): string | null;
  laadAlles(): Promise<Alles>;
  laadBeheerders(): Promise<Beheerder[]>;
  laadInstellingen(): Promise<Record<string, unknown>>;
  bewaarInstelling(sleutel: string, waarde: unknown): Promise<void>;

  voegExemplarenToe(rijen: NieuwExemplaar[]): Promise<Exemplaar[]>;
  wijzigExemplaar(id: string, wijziging: Partial<Exemplaar>): Promise<Exemplaar>;
  wijzigExemplaren(ids: string[], wijziging: Partial<Exemplaar>): Promise<Exemplaar[]>;
  voegArtikelenToe(rijen: NieuwArtikel[]): Promise<Artikel[]>;
  wijzigArtikel(id: string, wijziging: Partial<Artikel>): Promise<Artikel>;

  bewaarBeurs(b: Beurs): Promise<Beurs>;
  boekTransactie(t: Transactie): Promise<Transactie>;
  maakOngedaan(id: string): Promise<Transactie>;
  losConflictOp(id: string, oud: string, nieuw: string): Promise<Transactie>;
  aanvaardConflict(id: string, item: string): Promise<Transactie>;

  logUit(): Promise<void>;
}

/** Een fout van de server of het netwerk. Zonder status = geen verbinding. */
export class Fout extends Error {
  constructor(message: string, public status?: number) {
    super(message);
  }
}

export const isNetwerkFout = (e: unknown) => e instanceof Fout && e.status === undefined;
