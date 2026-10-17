// Demomodus: alles blijft op dit toestel (localStorage). Handig om de app uit te
// proberen met de testset, zonder account en zonder de echte voorraad te raken.
// De kassa gebruikt dezelfde rekenkern als de offline wachtrij (src/lib/kassa.ts).
import type { Aankoopfoto, Aanvraag, AanvraagStatus, Artikel, Artikelfoto, Etalagefoto, Beurs, Exemplaar, Gebruiker, NieuwArtikel, NieuwExemplaar, Omgeving, Tegenpartij, Thema, Transactie } from "../types";
import { Fout, type Alles, type Backend, type PrijsMarkering } from "./backend";
import { metVitrineSinds, schoonArtikel, schoonExemplaar, standaardArtikel, standaardExemplaar } from "../lib/exemplaar";
import { aanvaardConflict, losConflictOp, maakOngedaan, pasToe } from "../lib/kassa";

const SLEUTEL = "bindr-demo-v1";

interface Opslag extends Alles {
  instellingen: Record<string, unknown>;
  omgevingen: Omgeving[];
  aankoopfotos?: Aankoopfoto[];
  artikelfotos?: Artikelfoto[];
  etalage?: Etalagefoto[];
  themas?: Thema[];
  aanvragen?: Aanvraag[]; // ook wat de klantenpagina in de demo instuurt
}

// In de demo bestaan dezelfde twee omgevingen als in de echte database.
export const DEMO_OMGEVINGEN: Omgeving[] = [
  { id: "demo-bindr", naam: "Bind'r", volgorde: 1, zichtbaar_voor_klanten: true },
  { id: "demo-brent", naam: "Brent", volgorde: 2, zichtbaar_voor_klanten: true },
];

export class DemoBackend implements Backend {
  soort = "demo" as const;
  private data: Opslag;

  constructor() {
    const leeg: Opslag = { exemplaren: [], artikelen: [], beurzen: [], transacties: [], instellingen: {}, omgevingen: DEMO_OMGEVINGEN.map((o) => ({ ...o })) };
    try {
      this.data = { ...leeg, ...(JSON.parse(localStorage.getItem(SLEUTEL) || "null") || {}) };
      if (!this.data.omgevingen?.length) this.data.omgevingen = DEMO_OMGEVINGEN.map((o) => ({ ...o }));
      // Oudere demo's kenden geen omgevingen: alles hoort dan bij Bind'r.
      const eerste = this.data.omgevingen[0].id;
      this.data.exemplaren = this.data.exemplaren.map((e) => schoonExemplaar({ ...e, omgeving_id: e.omgeving_id ?? eerste }));
      this.data.artikelen = this.data.artikelen.map((a) => schoonArtikel({ ...a, omgeving_id: a.omgeving_id ?? eerste }));
      this.data.beurzen = this.data.beurzen.map((b) => ({ ...b, omgeving_id: b.omgeving_id ?? eerste }));
      this.data.transacties = this.data.transacties.map((t) => ({ ...t, omgeving_id: t.omgeving_id ?? eerste }));
    } catch {
      this.data = leeg;
    }
  }

  static wis() {
    localStorage.removeItem(SLEUTEL);
  }

  private bewaar() {
    try {
      // Aanvragen die de klantenpagina intussen instuurde (in een ander tabblad) niet overschrijven.
      const daar = (JSON.parse(localStorage.getItem(SLEUTEL) || "null") as Opslag | null)?.aanvragen ?? [];
      const hier = new Map((this.data.aanvragen ?? []).map((a) => [a.id, a]));
      if (daar.length || hier.size) this.data.aanvragen = [...daar.filter((a) => !hier.has(a.id)), ...hier.values()];
    } catch { /* geen geldige opslag: gewoon overschrijven */ }
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

  async laadWijzigingen(): Promise<Alles | null> {
    return null; // één toestel: gewoon alles opnieuw lezen
  }

  async laadOmgevingen() {
    return this.data.omgevingen.map((o) => ({ ...o }));
  }

  async bewaarOmgeving(o: Omgeving) {
    this.data.omgevingen = this.data.omgevingen.map((x) => (x.id === o.id ? { ...o } : x));
    this.bewaar();
  }

  async meldAanwezig() {
    return [];
  }

  async markeerPrijzen(omgevingId: string | null, lijst: PrijsMarkering[]) {
    const per = new Map(lijst.map((x) => [x.id, x.nieuw]));
    this.data.exemplaren = this.data.exemplaren.map((e) => {
      if (omgevingId && e.omgeving_id !== omgevingId) return e;
      const n = per.get(e.id) ?? null;
      return (e.nieuw_hartje ?? null) === n ? e : { ...e, nieuw_hartje: n };
    });
    this.bewaar();
  }

  async wijzigWachtwoord() {
    throw new Fout("In de demo is er geen wachtwoord.", 400);
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
      if (!r.omgeving_id) r.omgeving_id = this.data.omgevingen[0]?.id;
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
    const oud = this.data.exemplaren[i];
    this.data.exemplaren[i] = metVitrineSinds(oud, { ...oud, ...wijziging, gewijzigd_op: new Date().toISOString() });
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
    const nieuw = rijen.filter((r) => !r.id || !ids.has(r.id)).map((r) => standaardArtikel({ ...r, omgeving_id: r.omgeving_id ?? this.data.omgevingen[0]?.id }));
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

  async verwijderBeurs(id: string) {
    this.data.beurzen = this.data.beurzen.filter((x) => !(x.id === id && x.status === "gepland"));
    this.bewaar();
  }

  async wijzigGeplandeBeurs(id: string, w: Pick<Beurs, "naam" | "datum" | "locatie" | "uren" | "link">) {
    this.data.beurzen = this.data.beurzen.map((x) => (x.id === id && x.status === "gepland" ? { ...x, ...w } : x));
    this.bewaar();
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

  async laadAankoopfotos(ids: string[]) {
    const set = new Set(ids);
    return (this.data.aankoopfotos ?? []).filter((f) => set.has(f.transactie_id));
  }

  async bewaarAankoopfoto(f: Aankoopfoto) {
    this.data.aankoopfotos = [...(this.data.aankoopfotos ?? []).filter((x) => x.id !== f.id), f];
    this.bewaar();
  }

  async verwijderAankoopfoto(id: string) {
    this.data.aankoopfotos = (this.data.aankoopfotos ?? []).filter((x) => x.id !== id);
    this.bewaar();
  }

  async laadArtikelfotos(ids: string[]) {
    const set = new Set(ids);
    return (this.data.artikelfotos ?? []).filter((f) => set.has(f.artikel_id)).sort((a, b) => a.volgorde - b.volgorde);
  }

  async bewaarArtikelfoto(f: Artikelfoto) {
    this.data.artikelfotos = [...(this.data.artikelfotos ?? []).filter((x) => x.id !== f.id), f];
    this.bewaar();
  }

  async verwijderArtikelfoto(id: string) {
    this.data.artikelfotos = (this.data.artikelfotos ?? []).filter((x) => x.id !== id);
    this.bewaar();
  }

  async laadEtalage() {
    return [...(this.data.etalage ?? [])].sort((a, b) => a.volgorde - b.volgorde);
  }

  async bewaarEtalage(f: Etalagefoto) {
    this.data.etalage = [...(this.data.etalage ?? []).filter((x) => x.id !== f.id), f];
    this.bewaar();
  }

  async wijzigEtalage(id: string, w: Partial<Pick<Etalagefoto, "titel" | "link" | "volgorde">>) {
    this.data.etalage = (this.data.etalage ?? []).map((x) => (x.id === id ? { ...x, ...w } : x));
    this.bewaar();
  }

  async verwijderEtalage(id: string) {
    this.data.etalage = (this.data.etalage ?? []).filter((x) => x.id !== id);
    this.bewaar();
  }

  async laadThemas() {
    return [...(this.data.themas ?? [])];
  }

  async bewaarThema(t: Thema) {
    const oud = (this.data.themas ?? []).find((x) => x.id === t.id);
    const nieuw: Thema = { ...oud, ...t, logo: t.logo !== undefined ? t.logo : oud?.logo ?? null };
    this.data.themas = [...(this.data.themas ?? []).filter((x) => x.id !== t.id), nieuw];
    this.bewaar();
  }

  async laadAanvragen() {
    // De klantenpagina schrijft in dezelfde opslag: opnieuw lezen.
    try { this.data.aanvragen = (JSON.parse(localStorage.getItem(SLEUTEL) || "null") as Opslag | null)?.aanvragen ?? this.data.aanvragen; } catch { /* laat staan */ }
    return [...(this.data.aanvragen ?? [])]
      .map(({ artwork: _a, voorbeeld: _v, beelden: _b, ...rest }) => rest as Aanvraag)
      .sort((a, b) => b.aangemaakt_op.localeCompare(a.aangemaakt_op));
  }

  async laadAanvraagBeelden(id: string) {
    const a = (this.data.aanvragen ?? []).find((x) => x.id === id);
    return { artwork: a?.artwork ?? null, voorbeeld: a?.voorbeeld ?? null, beelden: a?.beelden ?? null };
  }

  async verwijderAanvraag(id: string) {
    this.data.aanvragen = (this.data.aanvragen ?? []).filter((a) => a.id !== id);
    // Ook uit de opslag (bewaar() voegt aanvragen van de klantenpagina anders weer toe).
    try {
      const d = JSON.parse(localStorage.getItem(SLEUTEL) || "null") as Opslag | null;
      if (d) { d.aanvragen = (d.aanvragen ?? []).filter((a) => a.id !== id); localStorage.setItem(SLEUTEL, JSON.stringify(d)); }
    } catch { /* */ }
    this.bewaar();
  }

  async zetAanvraagStatus(id: string, status: AanvraagStatus) {
    this.data.aanvragen = (this.data.aanvragen ?? []).map((a) => (a.id === id ? { ...a, status } : a));
    this.bewaar();
  }

  async zetTegenpartij(id: string, tegenpartij: Tegenpartij | null) {
    this.zetTransactie({ ...this.vind(id), tegenpartij });
    this.bewaar();
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
