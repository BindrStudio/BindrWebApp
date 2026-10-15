// Demomodus: alles blijft op dit toestel (localStorage). Handig om de app uit te
// proberen met de testset, zonder account en zonder de echte voorraad te raken.
// De kassa gebruikt dezelfde rekenkern als de offline wachtrij (src/lib/kassa.ts).
import type { Artikel, Beurs, Exemplaar, Gebruiker, NieuwArtikel, NieuwExemplaar, Transactie } from "../types";
import { Fout, type Alles, type Backend } from "./backend";
import { standaardArtikel, standaardExemplaar } from "../lib/exemplaar";
import { aanvaardConflict, losConflictOp, maakOngedaan, pasToe } from "../lib/kassa";

const SLEUTEL = "bindr-demo-v1";

interface Opslag extends Alles {
  instellingen: Record<string, unknown>;
}

export class DemoBackend implements Backend {
  soort = "demo" as const;
  private data: Opslag;

  constructor() {
    const leeg: Opslag = { exemplaren: [], artikelen: [], beurzen: [], transacties: [], instellingen: {} };
    try {
      this.data = { ...leeg, ...(JSON.parse(localStorage.getItem(SLEUTEL) || "null") || {}) };
    } catch {
      this.data = leeg;
    }
  }

  static wis() {
    localStorage.removeItem(SLEUTEL);
  }

  private bewaar() {
    try {
      localStorage.setItem(SLEUTEL, JSON.stringify(this.data));
    } catch {
      throw new Fout("Het geheugen van de browser is vol");
    }
  }

  gebruiker(): Gebruiker {
    return { email: "demo", naam: "Demo" };
  }

  gebruikerId() {
    return "demo";
  }

  async laadAlles(): Promise<Alles> {
    const { exemplaren, artikelen, beurzen, transacties } = this.data;
    return { exemplaren: [...exemplaren], artikelen: [...artikelen], beurzen: [...beurzen], transacties: [...transacties] };
  }

  async laadBeheerders() {
    return [{ user_id: "demo", naam: "Demo" }];
  }

  async laadInstellingen() {
    return { ...this.data.instellingen };
  }

  async bewaarInstelling(sleutel: string, waarde: unknown) {
    this.data.instellingen[sleutel] = waarde;
    this.bewaar();
  }

  async voegExemplarenToe(rijen: NieuwExemplaar[]) {
    const ids = new Set(this.data.exemplaren.map((e) => e.id));
    const codes = new Set(this.data.exemplaren.map((e) => e.code));
    const nieuw: Exemplaar[] = [];
    for (const r of rijen) {
      if (r.id && ids.has(r.id)) continue; // al toegevoegd
      if (codes.has(r.code)) throw new Fout(`Code ${r.code} bestaat al`);
      codes.add(r.code);
      nieuw.push(standaardExemplaar(r));
    }
    this.data.exemplaren.push(...nieuw);
    this.bewaar();
    return nieuw;
  }

  async wijzigExemplaar(id: string, wijziging: Partial<Exemplaar>) {
    const i = this.data.exemplaren.findIndex((e) => e.id === id);
    if (i < 0) throw new Fout("Exemplaar niet gevonden", 404);
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
    const ids = new Set(this.data.artikelen.map((a) => a.id));
    const nieuw = rijen.filter((r) => !r.id || !ids.has(r.id)).map(standaardArtikel);
    this.data.artikelen.push(...nieuw);
    this.bewaar();
    return nieuw;
  }

  async wijzigArtikel(id: string, wijziging: Partial<Artikel>) {
    const i = this.data.artikelen.findIndex((a) => a.id === id);
    if (i < 0) throw new Fout("Artikel niet gevonden", 404);
    this.data.artikelen[i] = { ...this.data.artikelen[i], ...wijziging };
    this.bewaar();
    return this.data.artikelen[i];
  }

  async bewaarBeurs(b: Beurs) {
    const i = this.data.beurzen.findIndex((x) => x.id === b.id);
    if (i < 0) this.data.beurzen.unshift(b); else this.data.beurzen[i] = b;
    this.bewaar();
    return b;
  }

  private zetTransactie(t: Transactie) {
    const i = this.data.transacties.findIndex((x) => x.id === t.id);
    if (i < 0) this.data.transacties.push(t); else this.data.transacties[i] = t;
  }

  private vind(id: string) {
    const t = this.data.transacties.find((x) => x.id === id);
    if (!t) throw new Fout("Onbekende transactie", 404);
    return t;
  }

  async boekTransactie(t: Transactie) {
    const bestaand = this.data.transacties.find((x) => x.id === t.id);
    if (bestaand) return bestaand;
    const r = pasToe(this.data, { ...t, beheerder: "demo" });
    Object.assign(this.data, r.voorraad);
    this.zetTransactie(r.transactie);
    this.bewaar();
    return r.transactie;
  }

  async maakOngedaan(id: string) {
    const r = maakOngedaan(this.data, this.vind(id));
    Object.assign(this.data, r.voorraad);
    this.zetTransactie(r.transactie);
    this.bewaar();
    return r.transactie;
  }

  async losConflictOp(id: string, oud: string, nieuw: string) {
    let r;
    try { r = losConflictOp(this.data, this.vind(id), oud, nieuw); } catch (e) { throw new Fout((e as Error).message, 400); }
    Object.assign(this.data, r.voorraad);
    this.zetTransactie(r.transactie);
    this.bewaar();
    return r.transactie;
  }

  async aanvaardConflict(id: string, item: string) {
    const t = aanvaardConflict(this.vind(id), item);
    this.zetTransactie(t);
    this.bewaar();
    return t;
  }

  async logUit() {
    /* demo-gegevens blijven bewaard tot je ze wist */
  }
}
