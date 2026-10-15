// Supabase via de REST- en login-API, zonder extra bibliotheek.
import { SUPABASE_KEY, SUPABASE_URL } from "../config";
import type { Aanwezig, Artikel, Beurs, Exemplaar, Gebruiker, NieuwArtikel, NieuwExemplaar, Omgeving, Transactie } from "../types";
import { Fout, type Alles, type Backend, type Beheerder, type PrijsMarkering } from "./backend";
import { schoonArtikel, schoonExemplaar } from "../lib/exemplaar";

const SESSIE_SLEUTEL = "bindr-sessie-v1";
const VERSIE_SLEUTEL = "bindr-schema-v1";
const PAGINA = 1000;
// Kolommen die pas bestaan na de update van het schema (omgevingen, prijscheck, beurslocatie).
// Zolang de database ouder is, sturen we ze niet mee: anders weigert de server de hele wijziging.
const NIEUWE_KOLOMMEN = ["omgeving_id", "nieuw_hartje", "locatie"];

interface Sessie {
  access_token: string;
  refresh_token: string;
  expires_at: number; // seconden sinds 1970
  email: string;
  user_id: string;
  naam?: string;
}

async function authVraag(pad: string, body: unknown): Promise<Sessie> {
  let r: Response;
  try {
    r = await fetch(`${SUPABASE_URL}/auth/v1/${pad}`, {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Fout("Geen verbinding met de server.");
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = j.error_description || j.msg || j.message || "Inloggen mislukt";
    throw new Fout(/invalid login/i.test(msg) ? "E-mail of wachtwoord klopt niet." : msg, r.status);
  }
  return {
    access_token: j.access_token,
    refresh_token: j.refresh_token,
    expires_at: j.expires_at || Math.floor(Date.now() / 1000) + (j.expires_in || 3600),
    email: j.user?.email || "",
    user_id: j.user?.id || "",
  };
}

export class SupabaseBackend implements Backend {
  soort = "supabase" as const;
  private vernieuwen: Promise<void> | null = null;

  private constructor(private sessie: Sessie) {}

  static async logIn(email: string, wachtwoord: string): Promise<SupabaseBackend> {
    const s = await authVraag("token?grant_type=password", { email, password: wachtwoord });
    const b = new SupabaseBackend(s);
    b.bewaar();
    await b.controleerBeheerder();
    return b;
  }

  static herstel(): SupabaseBackend | null {
    try {
      const s = JSON.parse(localStorage.getItem(SESSIE_SLEUTEL) || "null") as Sessie | null;
      return s && s.refresh_token ? new SupabaseBackend(s) : null;
    } catch {
      return null;
    }
  }

  gebruiker(): Gebruiker {
    return { email: this.sessie.email, naam: this.sessie.naam };
  }

  private bewaar() {
    localStorage.setItem(SESSIE_SLEUTEL, JSON.stringify(this.sessie));
  }

  /** De sessie werd op de server ingetrokken of is te oud: opnieuw inloggen (de wachtrij blijft bewaard). */
  verlopen = false;

  private async token(): Promise<string> {
    if (this.verlopen) throw new Fout("Je sessie is verlopen. Log opnieuw in met je e-mail en pincode.", 401);
    if (this.sessie.expires_at - 60 > Date.now() / 1000) return this.sessie.access_token;
    if (!this.vernieuwen) {
      this.vernieuwen = authVraag("token?grant_type=refresh_token", { refresh_token: this.sessie.refresh_token })
        .then((s) => { this.sessie = { ...s, naam: this.sessie.naam }; this.bewaar(); })
        .catch((e) => {
          // Geen internet: gewoon later opnieuw. Weigert de server de sessie (400/401), dan is ze verlopen:
          // als 401 melden, zodat de wachtrij niets weggooit.
          if (e instanceof Fout && e.status !== undefined && e.status < 500) {
            this.verlopen = true;
            throw new Fout("Je sessie is verlopen. Log opnieuw in met je e-mail en pincode.", 401);
          }
          throw e;
        })
        .finally(() => { this.vernieuwen = null; });
    }
    await this.vernieuwen;
    return this.sessie.access_token;
  }

  private async vraag<T>(methode: string, pad: string, body?: unknown, extra: Record<string, string> = {}): Promise<T> {
    const doe = async () =>
      fetch(`${SUPABASE_URL}/rest/v1/${pad}`, {
        method: methode,
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${await this.token()}`,
          "Content-Type": "application/json",
          ...extra,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    let r: Response;
    try {
      r = await doe();
      if (r.status === 401) {
        this.sessie.expires_at = 0;
        r = await doe();
      }
    } catch (e) {
      if (e instanceof Fout) throw e;
      throw new Fout("Geen verbinding met de server. Probeer het opnieuw.");
    }
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      if (r.status === 404 || /relation .* does not exist/i.test(j.message || "")) {
        throw new Fout("De database is nog niet klaargezet. Voer supabase/schema.sql uit in Supabase.", r.status);
      }
      throw new Fout(j.message || `Serverfout ${r.status}`, r.status);
    }
    // Met "return=minimal" antwoordt de server 201 of 204 zonder inhoud.
    const tekst = await r.text();
    return (tekst ? JSON.parse(tekst) : undefined) as T;
  }

  private async controleerBeheerder() {
    const rijen = await this.vraag<{ naam: string }[]>("GET", `beheerders?select=naam&user_id=eq.${this.sessie.user_id}`);
    if (!rijen.length) {
      localStorage.removeItem(SESSIE_SLEUTEL);
      throw new Fout("Dit account is (nog) geen beheerder. Voeg het toe aan de tabel beheerders in Supabase.");
    }
    this.sessie.naam = rijen[0].naam;
    this.bewaar();
  }

  private async alles<T>(tabel: string, volgorde: string, filter = ""): Promise<T[]> {
    const uit: T[] = [];
    for (let van = 0; ; van += PAGINA) {
      const deel = await this.vraag<T[]>("GET", `${tabel}?select=*${filter ? `&${filter}` : ""}&order=${volgorde}&limit=${PAGINA}&offset=${van}`);
      uit.push(...deel);
      if (deel.length < PAGINA) break;
    }
    return uit;
  }

  /** True als de database nog het schema van fase 1 heeft (geen beurzen en transacties). */
  schemaOud = false;

  /** 3 = met omgevingen (oktober 2026), 2 = ouder. Null zolang we het niet weten. */
  versie: number | null = (() => { const v = Number(localStorage.getItem(VERSIE_SLEUTEL)); return v === 2 || v === 3 ? v : null; })();

  private async zekerVersie() {
    if (this.versie == null) await this.laadOmgevingen().catch(() => undefined);
  }

  private schoon<T extends object>(r: T): T {
    if (this.versie === 3) return r;
    const k = { ...r } as Record<string, unknown>;
    for (const x of NIEUWE_KOLOMMEN) delete k[x];
    return k as T;
  }

  async laadOmgevingen(): Promise<Omgeving[]> {
    try {
      const o = await this.vraag<Omgeving[]>("GET", "omgevingen?select=id,naam,volgorde,zichtbaar_voor_klanten&order=volgorde.asc,aangemaakt_op.asc");
      this.versie = 3;
      localStorage.setItem(VERSIE_SLEUTEL, "3");
      return o;
    } catch (e) {
      if (e instanceof Fout && e.status === 404) {
        this.versie = 2;
        localStorage.setItem(VERSIE_SLEUTEL, "2");
        return [];
      }
      throw e;
    }
  }

  async bewaarOmgeving(o: Omgeving) {
    if (this.versie !== 3) return;
    await this.vraag("PATCH", `omgevingen?id=eq.${o.id}`, { naam: o.naam, zichtbaar_voor_klanten: o.zichtbaar_voor_klanten }, { Prefer: "return=minimal" });
  }

  async laadWijzigingen(sinds: string): Promise<Alles | null> {
    if (this.versie !== 3) return null;
    const f = `gewijzigd_op=gt.${encodeURIComponent(sinds)}`;
    const [exemplaren, artikelen, beurzen, transacties] = await Promise.all([
      this.alles<Exemplaar>("exemplaren", "gewijzigd_op.asc", f),
      this.alles<Artikel>("artikelen", "gewijzigd_op.asc", f),
      this.alles<Beurs>("beurzen", "gewijzigd_op.asc", f),
      this.alles<Transactie>("transacties", "gewijzigd_op.asc", f),
    ]);
    return { exemplaren: exemplaren.map(schoonExemplaar), artikelen: artikelen.map(schoonArtikel), beurzen, transacties: transacties.map(getallen) };
  }

  async meldAanwezig(omgevingId: string | null, scherm: string): Promise<Aanwezig[]> {
    await this.zekerVersie();
    if (this.versie !== 3) return [];
    await this.vraag("POST", "aanwezig?on_conflict=user_id", [{ user_id: this.sessie.user_id, omgeving_id: omgevingId, scherm }],
      { Prefer: "resolution=merge-duplicates,return=minimal" });
    const sinds = new Date(Date.now() - 3 * 60000).toISOString();
    return this.vraag<Aanwezig[]>("GET", `aanwezig?select=*&laatst=gt.${encodeURIComponent(sinds)}`);
  }

  async markeerPrijzen(omgevingId: string | null, lijst: PrijsMarkering[]) {
    await this.zekerVersie();
    if (this.versie !== 3 || !omgevingId) return;
    await this.vraag("POST", "rpc/markeer_prijzen", { omgeving: omgevingId, lijst });
  }

  async wijzigPincode(pin: string) {
    let r: Response;
    const token = await this.token();
    try {
      r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        method: "PUT",
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ password: pin }),
      });
    } catch {
      throw new Fout("Geen verbinding: een nieuwe pincode kan enkel met internet.");
    }
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      const m = j.msg || j.message || j.error_description || `Serverfout ${r.status}`;
      // Dezelfde pincode als het huidige wachtwoord (bv. op een tweede gsm): niets te wijzigen, dus goed.
      if (j.error_code === "same_password" || /same|different from the old/i.test(m)) return;
      if (j.error_code === "reauthentication_needed" || /reauthenticat/i.test(m)) {
        throw new Fout("Supabase vraagt eerst opnieuw in te loggen. Log uit, log in met je huidige pincode en probeer opnieuw.", r.status);
      }
      if (j.error_code === "weak_password" || /least|short|length|weak/i.test(m)) {
        throw new Fout("Supabase vindt deze pincode te zwak of te kort: zet de minimale wachtwoordlengte op 6 en zet de extra eisen (letters, tekens) uit. Zie de README.", r.status);
      }
      throw new Fout(m, r.status);
    }
  }

  async laadAlles(): Promise<Alles> {
    // Zonder de tabellen van fase 2 werkt de voorraad gewoon verder; de kassa vraagt om het schema.
    const fase2 = <T>(p: Promise<T[]>) => p.catch((e) => {
      if (e instanceof Fout && e.status === 404) { this.schemaOud = true; return [] as T[]; }
      throw e;
    });
    this.schemaOud = false;
    const [exemplaren, artikelen, beurzen, transacties] = await Promise.all([
      this.alles<Exemplaar>("exemplaren", "aangemaakt_op.asc"),
      this.alles<Artikel>("artikelen", "naam.asc"),
      fase2(this.alles<Beurs>("beurzen", "datum.desc")),
      fase2(this.alles<Transactie>("transacties", "tijd.asc")),
    ]);
    return { exemplaren: exemplaren.map(schoonExemplaar), artikelen: artikelen.map(schoonArtikel), beurzen, transacties: transacties.map(getallen) };
  }

  laadBeheerders() {
    return this.vraag<Beheerder[]>("GET", "beheerders?select=user_id,naam");
  }

  async laadInstellingen() {
    const rijen = await this.vraag<{ sleutel: string; waarde: unknown }[]>("GET", "instellingen?select=sleutel,waarde");
    return Object.fromEntries(rijen.map((r) => [r.sleutel, r.waarde]));
  }

  async bewaarInstelling(sleutel: string, waarde: unknown) {
    await this.vraag("POST", "instellingen?on_conflict=sleutel", [{ sleutel, waarde }], { Prefer: "resolution=merge-duplicates,return=minimal" });
  }

  async voegExemplarenToe(rijen: NieuwExemplaar[]) {
    await this.zekerVersie();
    rijen = rijen.map((r) => this.schoon(r));
    const uit: Exemplaar[] = [];
    for (let i = 0; i < rijen.length; i += 200) {
      // Met een id van de gsm zelf: opnieuw versturen (na een netwerkfout) maakt geen dubbels.
      uit.push(...(await this.vraag<Exemplaar[]>("POST", "exemplaren?on_conflict=id", rijen.slice(i, i + 200), {
        Prefer: "return=representation,missing=default,resolution=ignore-duplicates",
      })));
    }
    return uit;
  }

  async wijzigExemplaar(id: string, wijziging: Partial<Exemplaar>) {
    await this.zekerVersie();
    wijziging = this.schoon(wijziging);
    if (!Object.keys(wijziging).length) return { id } as Exemplaar;
    const r = await this.vraag<Exemplaar[]>("PATCH", `exemplaren?id=eq.${id}`, wijziging, { Prefer: "return=representation" });
    if (!r.length) throw new Fout("Exemplaar niet gevonden");
    return r[0];
  }

  async wijzigExemplaren(ids: string[], wijziging: Partial<Exemplaar>) {
    await this.zekerVersie();
    wijziging = this.schoon(wijziging);
    if (!ids.length || !Object.keys(wijziging).length) return [];
    return this.vraag<Exemplaar[]>("PATCH", `exemplaren?id=in.(${ids.join(",")})`, wijziging, { Prefer: "return=representation" });
  }

  async voegArtikelenToe(rijen: NieuwArtikel[]) {
    await this.zekerVersie();
    rijen = rijen.map((r) => this.schoon(r));
    if (!rijen.length) return [];
    return this.vraag<Artikel[]>("POST", "artikelen?on_conflict=id", rijen, {
      Prefer: "return=representation,missing=default,resolution=ignore-duplicates",
    });
  }

  async wijzigArtikel(id: string, wijziging: Partial<Artikel>) {
    await this.zekerVersie();
    wijziging = this.schoon(wijziging);
    const r = await this.vraag<Artikel[]>("PATCH", `artikelen?id=eq.${id}`, wijziging, { Prefer: "return=representation" });
    return r[0];
  }

  async bewaarBeurs(b: Beurs) {
    await this.zekerVersie();
    const { id, naam, datum, standgeld, startkas, status, gestart_op, afgesloten_op, getelde_kas, sumup_bevestigd, stand_start, stand_einde, opmerking, locatie, omgeving_id } = b;
    const r = await this.vraag<Beurs[]>("POST", "beurzen?on_conflict=id", [
      this.schoon({ id, naam, datum, standgeld, startkas, status, gestart_op, afgesloten_op, getelde_kas, sumup_bevestigd, stand_start, stand_einde, opmerking, locatie: locatie ?? null, omgeving_id }),
    ], { Prefer: "return=representation,resolution=merge-duplicates" });
    return r[0] ?? b;
  }

  async verwijderBeurs(id: string) {
    await this.vraag("DELETE", `beurzen?id=eq.${encodeURIComponent(id)}&status=eq.gepland`);
  }

  private rpc(naam: string, args: Record<string, unknown>) {
    return this.vraag<Transactie>("POST", `rpc/${naam}`, args).then(getallen);
  }

  boekTransactie(t: Transactie) {
    const { id, beurs_id, soort, tijd, regels, totaal, cash, sumup, opmerking, omgeving_id } = t;
    return this.rpc("boek_transactie", { t: { id, beurs_id, soort, tijd, regels, totaal, cash, sumup, opmerking, omgeving_id } });
  }

  maakOngedaan(id: string) {
    return this.rpc("maak_ongedaan", { tid: id });
  }

  losConflictOp(id: string, oud: string, nieuw: string) {
    return this.rpc("los_conflict_op", { tid: id, oud, nieuw });
  }

  aanvaardConflict(id: string, item: string) {
    return this.rpc("aanvaard_conflict", { tid: id, item });
  }

  gebruikerId() {
    return this.sessie.user_id || null;
  }

  /** Wie is er ingelogd (voor de pincode op dit toestel). */
  sessieInfo() {
    return { email: this.sessie.email, user_id: this.sessie.user_id, naam: this.sessie.naam };
  }

  async logUit() {
    try {
      // Enkel deze gsm uitloggen, niet je andere toestellen.
      await fetch(`${SUPABASE_URL}/auth/v1/logout?scope=local`, {
        method: "POST",
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${this.sessie.access_token}` },
      });
    } catch { /* offline: lokaal toch uitloggen */ }
    localStorage.removeItem(SESSIE_SLEUTEL);
  }
}

// PostgREST geeft numeric-kolommen soms als tekst; de kassa rekent met getallen.
function getallen(t: Transactie): Transactie {
  return { ...t, totaal: Number(t.totaal), cash: Number(t.cash), sumup: Number(t.sumup), conflicten: t.conflicten ?? [] };
}
