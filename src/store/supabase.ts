// Supabase via de REST- en login-API, zonder extra bibliotheek.
import { SUPABASE_KEY, SUPABASE_URL } from "../config";
import type { Artikel, Beurs, Exemplaar, Gebruiker, NieuwArtikel, NieuwExemplaar, Transactie } from "../types";
import { Fout, type Alles, type Backend, type Beheerder } from "./backend";

const SESSIE_SLEUTEL = "bindr-sessie-v1";
const PAGINA = 1000;

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

  private async token(): Promise<string> {
    if (this.sessie.expires_at - 60 > Date.now() / 1000) return this.sessie.access_token;
    if (!this.vernieuwen) {
      this.vernieuwen = authVraag("token?grant_type=refresh_token", { refresh_token: this.sessie.refresh_token })
        .then((s) => { this.sessie = { ...s, naam: this.sessie.naam }; this.bewaar(); })
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
    if (r.status === 204) return undefined as T;
    return (await r.json()) as T;
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

  private async alles<T>(tabel: string, volgorde: string): Promise<T[]> {
    const uit: T[] = [];
    for (let van = 0; ; van += PAGINA) {
      const deel = await this.vraag<T[]>("GET", `${tabel}?select=*&order=${volgorde}&limit=${PAGINA}&offset=${van}`);
      uit.push(...deel);
      if (deel.length < PAGINA) break;
    }
    return uit;
  }

  /** True als de database nog het schema van fase 1 heeft (geen beurzen en transacties). */
  schemaOud = false;

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
    return { exemplaren, artikelen, beurzen, transacties: transacties.map(getallen) };
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
    const r = await this.vraag<Exemplaar[]>("PATCH", `exemplaren?id=eq.${id}`, wijziging, { Prefer: "return=representation" });
    if (!r.length) throw new Fout("Exemplaar niet gevonden");
    return r[0];
  }

  async wijzigExemplaren(ids: string[], wijziging: Partial<Exemplaar>) {
    if (!ids.length) return [];
    return this.vraag<Exemplaar[]>("PATCH", `exemplaren?id=in.(${ids.join(",")})`, wijziging, { Prefer: "return=representation" });
  }

  async voegArtikelenToe(rijen: NieuwArtikel[]) {
    if (!rijen.length) return [];
    return this.vraag<Artikel[]>("POST", "artikelen?on_conflict=id", rijen, {
      Prefer: "return=representation,missing=default,resolution=ignore-duplicates",
    });
  }

  async wijzigArtikel(id: string, wijziging: Partial<Artikel>) {
    const r = await this.vraag<Artikel[]>("PATCH", `artikelen?id=eq.${id}`, wijziging, { Prefer: "return=representation" });
    return r[0];
  }

  async bewaarBeurs(b: Beurs) {
    const { id, naam, datum, standgeld, startkas, status, gestart_op, afgesloten_op, getelde_kas, sumup_bevestigd, stand_start, stand_einde, opmerking } = b;
    const r = await this.vraag<Beurs[]>("POST", "beurzen?on_conflict=id", [
      { id, naam, datum, standgeld, startkas, status, gestart_op, afgesloten_op, getelde_kas, sumup_bevestigd, stand_start, stand_einde, opmerking },
    ], { Prefer: "return=representation,resolution=merge-duplicates" });
    return r[0] ?? b;
  }

  private rpc(naam: string, args: Record<string, unknown>) {
    return this.vraag<Transactie>("POST", `rpc/${naam}`, args).then(getallen);
  }

  boekTransactie(t: Transactie) {
    const { id, beurs_id, soort, tijd, regels, totaal, cash, sumup, opmerking } = t;
    return this.rpc("boek_transactie", { t: { id, beurs_id, soort, tijd, regels, totaal, cash, sumup, opmerking } });
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

  async logUit() {
    try {
      await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
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
