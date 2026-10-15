import type { Artikel, Exemplaar, Gebruiker, NieuwArtikel, NieuwExemplaar } from "../types";

/** Waar de gegevens zitten: Supabase (echte voorraad) of de demo op dit toestel. */
export interface Backend {
  soort: "supabase" | "demo";
  gebruiker(): Gebruiker;
  laadAlles(): Promise<{ exemplaren: Exemplaar[]; artikelen: Artikel[] }>;
  voegExemplarenToe(rijen: NieuwExemplaar[]): Promise<Exemplaar[]>;
  wijzigExemplaar(id: string, wijziging: Partial<Exemplaar>): Promise<Exemplaar>;
  wijzigExemplaren(ids: string[], wijziging: Partial<Exemplaar>): Promise<Exemplaar[]>;
  voegArtikelenToe(rijen: NieuwArtikel[]): Promise<Artikel[]>;
  wijzigArtikel(id: string, wijziging: Partial<Artikel>): Promise<Artikel>;
  logUit(): Promise<void>;
}

export class Fout extends Error {
  constructor(message: string, public status?: number) {
    super(message);
  }
}
