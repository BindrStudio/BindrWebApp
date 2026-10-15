// Demomodus: alles blijft op dit toestel (localStorage). Handig om de app uit te
// proberen met de testset, zonder account en zonder de echte voorraad te raken.
import type { Artikel, Exemplaar, Gebruiker, NieuwArtikel, NieuwExemplaar } from "../types";
import { Fout, type Backend } from "./backend";

const SLEUTEL = "bindr-demo-v1";

interface Opslag {
  exemplaren: Exemplaar[];
  artikelen: Artikel[];
}

const uuid = () =>
  (crypto as Crypto & { randomUUID?: () => string }).randomUUID?.() ||
  "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });

function standaardExemplaar(r: NieuwExemplaar): Exemplaar {
  const nu = new Date().toISOString();
  return {
    id: uuid(), soort: "kaart", kaart_id: null, catalogus: null, afbeelding: null, naam_origineel: null, set_naam: null,
    set_code: null, nummer: null, taal: "EN", conditie: "NM", variant: "normaal", grader: null, grade: null,
    cardmarket_id: null, opslag: "stockdoos", status: "in voorraad", gereserveerd_voor: null, verkoopprijs: null,
    prijs_handmatig: false, hartjesprijs: null, hartjesdatum: null, aankoopprijs: null, aankoopdatum: null,
    aankoopbron: null, label_status: "te printen", opmerking: null, aangemaakt_op: nu, gewijzigd_op: nu,
    ...r,
  } as Exemplaar;
}

export class DemoBackend implements Backend {
  soort = "demo" as const;
  private data: Opslag;

  constructor() {
    try {
      this.data = JSON.parse(localStorage.getItem(SLEUTEL) || "null") || { exemplaren: [], artikelen: [] };
    } catch {
      this.data = { exemplaren: [], artikelen: [] };
    }
  }

  static wis() {
    localStorage.removeItem(SLEUTEL);
  }

  private bewaar() {
    localStorage.setItem(SLEUTEL, JSON.stringify(this.data));
  }

  gebruiker(): Gebruiker {
    return { email: "demo", naam: "Demo" };
  }

  async laadAlles() {
    return { exemplaren: [...this.data.exemplaren], artikelen: [...this.data.artikelen] };
  }

  async voegExemplarenToe(rijen: NieuwExemplaar[]) {
    const bestaand = new Set(this.data.exemplaren.map((e) => e.code));
    const nieuw = rijen.map((r) => {
      if (bestaand.has(r.code)) throw new Fout(`Code ${r.code} bestaat al`);
      bestaand.add(r.code);
      return standaardExemplaar(r);
    });
    this.data.exemplaren.push(...nieuw);
    this.bewaar();
    return nieuw;
  }

  async wijzigExemplaar(id: string, wijziging: Partial<Exemplaar>) {
    const i = this.data.exemplaren.findIndex((e) => e.id === id);
    if (i < 0) throw new Fout("Exemplaar niet gevonden");
    this.data.exemplaren[i] = { ...this.data.exemplaren[i], ...wijziging, gewijzigd_op: new Date().toISOString() };
    this.bewaar();
    return this.data.exemplaren[i];
  }

  async wijzigExemplaren(ids: string[], wijziging: Partial<Exemplaar>) {
    const uit: Exemplaar[] = [];
    for (const id of ids) uit.push(await this.wijzigExemplaar(id, wijziging));
    return uit;
  }

  async voegArtikelenToe(rijen: NieuwArtikel[]) {
    const nieuw = rijen.map((r) => ({ id: uuid(), soort: "sealed", aantal: 0, prijs: null, opslag: "vitrine", opmerking: null, ...r }) as Artikel);
    this.data.artikelen.push(...nieuw);
    this.bewaar();
    return nieuw;
  }

  async wijzigArtikel(id: string, wijziging: Partial<Artikel>) {
    const i = this.data.artikelen.findIndex((a) => a.id === id);
    if (i < 0) throw new Fout("Artikel niet gevonden");
    this.data.artikelen[i] = { ...this.data.artikelen[i], ...wijziging };
    this.bewaar();
    return this.data.artikelen[i];
  }

  async logUit() {
    /* demo-gegevens blijven bewaard tot je ze wist */
  }
}
