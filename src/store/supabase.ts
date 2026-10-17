// Supabase via de REST- en login-API, zonder extra bibliotheek.
import { SUPABASE_KEY, SUPABASE_URL } from "../config";
import type { Aankoopfoto, Aanvraag, AanvraagStatus, Aanwezig, Artikel, Artikelfoto, Etalagefoto, Beurs, Exemplaar, Gebruiker, NieuwArtikel, NieuwExemplaar, Omgeving, Tegenpartij, Thema, Transactie } from "../types";
import { Fout, type Alles, type Backend, type Beheerder, type PrijsMarkering } from "./backend";
import { schoonArtikel, schoonExemplaar } from "../lib/exemplaar";

const SESSIE_SLEUTEL = "bindr-sessie-v1";
const VERSIE_SLEUTEL = "bindr-schema-v1";
/** De versie van het schema die alles van de app kan (supabase/schema.sql van 0.16). */
export const NIEUWSTE = 15;
/** Vanaf deze versie (schema 0.10): meer foto's per artikel, de etalage en aanvragen voor een eigen binder. */
export const ETALAGE_VANAF = 9;
/** Vanaf deze versie (schema 0.11): aanvragen met toploader ja/nee en afbeeldingen van het idee. */
export const AANVRAAG_BEELDEN_VANAF = 10;
/** Vanaf deze versie (schema 0.13): binders vooraan (plek in de etalage) en thema's. */
export const THEMA_VANAF = 12;
/** Vanaf deze versie (schema 0.14): drie logo's per thema. */
export const LOGOS_VANAF = 13;
/** Vanaf deze versie (schema 0.15): de feed met onze Instagram-berichten staat in publieke_instellingen. */
export const FEED_VANAF = 14;
/** Vanaf deze versie (schema 0.16): reserveren, storecredit (tegoed) en verzendkosten. */
export const RESERVEREN_VANAF = 15;
export const TEGOED_VANAF = 15;
/** Vanaf deze versie kan de boekhouding van 0.8 (kas, overschrijving, privé, aankoopfoto's …) naar de server. */
export const BOEKHOUDING_VANAF = 7;
const PAGINA = 1000;
// Kolommen die pas bestaan na de update van het schema (omgevingen, prijscheck, beurslocatie).
// Zolang de database ouder is, sturen we ze niet mee: anders weigert de server de hele wijziging.
// Kolommen die pas in een nieuwere versie van het schema bestaan. Zolang supabase/schema.sql niet
// opnieuw is uitgevoerd, laten we ze weg (anders weigert de server de hele wijziging).
type Tabel = "exemplaren" | "artikelen" | "beurzen";
const KOLOMMEN_V3 = ["omgeving_id", "nieuw_hartje", "locatie"];
const KOLOMMEN_V4: Record<Tabel, string[]> = {
  exemplaren: ["cert", "verkopen"],
  artikelen: ["aankoopprijs", "foto", "details", "cardmarket_id"],
  beurzen: [],
};
const KOLOMMEN_V5: Record<Tabel, string[]> = {
  exemplaren: ["foto"],
  artikelen: [],
  beurzen: [],
};
const KOLOMMEN_V8: Record<Tabel, string[]> = {
  exemplaren: [],
  artikelen: ["zichtbaar"],
  beurzen: ["uren", "link"],
};
// Exemplaren zonder de eigen foto (die komt apart, zie vulFotos).
const EXEMPLAAR_KOLOMMEN = [
  "id", "code", "soort", "kaart_id", "catalogus", "afbeelding", "naam", "naam_origineel", "set_naam", "set_code", "nummer",
  "taal", "conditie", "variant", "grader", "grade", "cardmarket_id", "opslag", "status", "verkoopprijs", "prijs_handmatig",
  "hartjesprijs", "hartjesdatum", "aankoopprijs", "aankoopdatum", "aankoopbron", "label_status", "opmerking", "transactie_id",
  "afgeboekt_op", "vitrine_sinds", "nieuw_hartje", "cert", "verkopen", "omgeving_id", "aangemaakt_op", "gewijzigd_op",
].join(",");

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

  /** Uit = niets meer op het toestel bewaren (na uitloggen, of zolang een herstellink nog niet nagekeken is). */
  private opslaan = true;

  private bewaar() {
    if (this.opslaan) localStorage.setItem(SESSIE_SLEUTEL, JSON.stringify(this.sessie));
  }

  /** De sessie werd op de server ingetrokken of is te oud: opnieuw inloggen (de wachtrij blijft bewaard). */
  verlopen = false;

  private async token(): Promise<string> {
    if (this.verlopen) throw new Fout("Je sessie is verlopen. Log opnieuw in met je e-mail en wachtwoord.", 401);
    if (this.sessie.expires_at - 60 > Date.now() / 1000) return this.sessie.access_token;
    if (!this.vernieuwen) {
      this.vernieuwen = authVraag("token?grant_type=refresh_token", { refresh_token: this.sessie.refresh_token })
        .then((s) => { this.sessie = { ...s, naam: this.sessie.naam }; this.bewaar(); })
        .catch((e) => {
          // Geen internet: gewoon later opnieuw. Weigert de server de sessie (400/401), dan is ze verlopen:
          // als 401 melden, zodat de wachtrij niets weggooit.
          if (e instanceof Fout && e.status !== undefined && e.status < 500) {
            this.verlopen = true;
            throw new Fout("Je sessie is verlopen. Log opnieuw in met je e-mail en wachtwoord.", 401);
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
      if (this.opslaan) localStorage.removeItem(SESSIE_SLEUTEL);
      throw new Fout("Dit account is (nog) geen beheerder. Voeg het toe aan de tabel beheerders in Supabase.");
    }
    this.sessie.naam = rijen[0].naam;
    this.bewaar();
  }

  private async alles<T>(tabel: string, volgorde: string, filter = "", kolommen = "*"): Promise<T[]> {
    const uit: T[] = [];
    for (let van = 0; ; van += PAGINA) {
      const deel = await this.vraag<T[]>("GET", `${tabel}?select=${kolommen}${filter ? `&${filter}` : ""}&order=${volgorde}&limit=${PAGINA}&offset=${van}`);
      uit.push(...deel);
      if (deel.length < PAGINA) break;
    }
    return uit;
  }

  /** True als de database nog het schema van fase 1 heeft (geen beurzen en transacties). */
  schemaOud = false;

  /** 15 = reserveren, tegoed en verzendkosten (0.16), 14 = Instagram-berichten automatisch (0.15), 13 = drie logo's per thema, "nu live" (0.14), 12 = binders vooraan, Instagram-strook en thema's (0.13), 10 = aanvragen met toploader en afbeeldingen, wettelijke gegevens (0.11), 9 = etalage, meer foto's per artikel en aanvragen (0.10), 8 = beurzen met uren en link, artikels zichtbaar per stuk (0.9), 7 = inbreng van kaarten die al in de app staan (0.8), 6 = aankoopfoto's en privé (0.7), 5 = eigen kaartfoto's en boekhouding (0.6), 4 = artikel-details en graded (0.5), 3 = omgevingen (0.4), 2 = ouder. Null zolang we het niet weten. */
  versie: number | null = (() => { const v = Number(localStorage.getItem(VERSIE_SLEUTEL)); return v >= 2 && v <= NIEUWSTE ? v : null; })();

  private async zekerVersie() {
    if (this.versie == null) await this.laadOmgevingen().catch(() => undefined);
  }

  private schoon<T extends object>(r: T, tabel: Tabel): T {
    const v = this.versie ?? 5;
    // Een reservering gaat enkel mee met een ander schema dan 0.16 als ze er niet in zit (zie wijzigExemplaar).
    if (v < RESERVEREN_VANAF && tabel === "exemplaren" && "reservering" in r) { const { reservering: _, ...rest } = r as Record<string, unknown>; r = rest as T; }
    if (v >= 8) return r;
    const k = { ...r } as Record<string, unknown>;
    for (const x of KOLOMMEN_V8[tabel]) delete k[x];
    if (v >= 5) return k as T;
    for (const x of KOLOMMEN_V5[tabel]) delete k[x];
    if (v >= 4) return k as T;
    for (const x of KOLOMMEN_V4[tabel]) delete k[x];
    if (v < 3) for (const x of KOLOMMEN_V3) delete k[x];
    return k as T;
  }

  private zetVersie(v: number) {
    this.versie = v;
    localStorage.setItem(VERSIE_SLEUTEL, String(v));
  }

  async laadOmgevingen(): Promise<Omgeving[]> {
    try {
      const o = await this.vraag<Omgeving[]>("GET", "omgevingen?select=id,naam,volgorde,zichtbaar_voor_klanten&order=volgorde.asc,aangemaakt_op.asc");
      // Bestaan de kolommen van versie 0.5 en 0.6 al? Een onbekende kolom geeft een fout 400.
      // (We filteren op de kolommen, zonder een foto te downloaden.)
      const bestaat = (pad: string) => this.vraag("GET", pad).then(() => true, (e) => {
        if (e instanceof Fout && (e.status === 400 || e.status === 404)) return false; // onbekende kolom of tabel
        throw e;
      });
      // Vanaf 0.8 zegt de database zelf welke versie ze heeft (schema_versie: 8 = 0.8, 9 = 0.9, 10 = 0.10, 11 = 0.11, 13 = 0.13, 14 = 0.14, 15 = 0.15, 16 = 0.16).
      const schema = await this.vraag<number>("GET", "rpc/schema_versie").then((n) => Number(n) || 0, (e) => {
        if (e instanceof Fout && (e.status === 400 || e.status === 404)) return 0;
        throw e;
      });
      if (schema >= 8) {
        this.zetVersie(Math.min(NIEUWSTE, schema - 1));
        return o;
      }
      const [v4, v5, v6] = await Promise.all([
        bestaat("artikelen?select=id&limit=1&details=not.is.null&foto=is.null"),
        bestaat("transacties?select=id&limit=1&tegenpartij=is.null").then((ok) => ok && bestaat("exemplaren?select=id&limit=1&foto=is.null")),
        bestaat("aankoopfotos?select=id&limit=1"),
      ]);
      this.zetVersie(v4 && v5 && v6 ? 6 : v4 && v5 ? 5 : v4 ? 4 : 3);
      return o;
    } catch (e) {
      if (e instanceof Fout && e.status === 404) {
        this.zetVersie(2);
        return [];
      }
      throw e;
    }
  }

  async bewaarOmgeving(o: Omgeving) {
    if ((this.versie ?? 0) < 3) return;
    await this.vraag("PATCH", `omgevingen?id=eq.${o.id}`, { naam: o.naam, zichtbaar_voor_klanten: o.zichtbaar_voor_klanten }, { Prefer: "return=minimal" });
  }

  async laadWijzigingen(sinds: string): Promise<Alles | null> {
    if ((this.versie ?? 0) < 3) return null;
    const f = `gewijzigd_op=gt.${encodeURIComponent(sinds)}`;
    const [exemplaren, artikelen, beurzen, transacties] = await Promise.all([
      this.alles<Exemplaar>("exemplaren", "gewijzigd_op.asc", f, this.exemplaarKolommen()),
      this.alles<Artikel>("artikelen", "gewijzigd_op.asc", f, this.artikelKolommen()),
      this.alles<Beurs>("beurzen", "gewijzigd_op.asc", f),
      this.alles<Transactie>("transacties", "gewijzigd_op.asc", f),
    ]);
    const [metFoto, artikelenMetFoto] = await Promise.all([this.vulFotos("exemplaren", exemplaren, false), this.vulFotos("artikelen", artikelen, false)]);
    return { exemplaren: metFoto.map(schoonExemplaar), artikelen: artikelenMetFoto.map(schoonArtikel), beurzen, transacties: transacties.map(getallen) };
  }

  // ── Eigen foto's (artikels, en kaarten zonder foto): apart en enkel als ze veranderden ──
  // Een foto is tot ~450 kB. Bij elke synchronisatie alles opnieuw downloaden kost op een beurs
  // (4G) te veel; daarom laden we de rijen zonder foto en houden we de foto's per rij bij.
  private fotos = new Map<string, { gewijzigd: string | null | undefined; foto: string }>();

  private artikelKolommen() {
    return (this.versie ?? 0) >= 4
      ? `id,naam,soort,aantal,prijs,opslag,opmerking,omgeving_id,aankoopprijs,details,cardmarket_id,aangemaakt_op,gewijzigd_op${(this.versie ?? 0) >= 8 ? ",zichtbaar" : ""}`
      : "*";
  }

  private exemplaarKolommen() {
    return (this.versie ?? 0) >= 5 ? EXEMPLAAR_KOLOMMEN + ((this.versie ?? 0) >= RESERVEREN_VANAF ? ",reservering" : "") : "*";
  }

  private async vulFotos<T extends { id: string; foto?: string | null }>(tabel: "artikelen" | "exemplaren", rijen: T[], alles: boolean): Promise<T[]> {
    if ((this.versie ?? 0) < (tabel === "artikelen" ? 4 : 5) || !rijen.length) return rijen;
    const sleutel = (id: string) => `${tabel}:${id}`;
    try {
      const ids = rijen.map((a) => a.id);
      const metFoto: { id: string; gewijzigd_op: string | null }[] = [];
      for (let i = 0; i < (alles ? 1 : ids.length); i += 80) {
        const filter = alles ? "" : `&id=in.(${ids.slice(i, i + 80).join(",")})`;
        metFoto.push(...await this.vraag<{ id: string; gewijzigd_op: string | null }[]>("GET", `${tabel}?select=id,gewijzigd_op&foto=not.is.null${filter}`));
      }
      const nodig = metFoto.filter((x) => this.fotos.get(sleutel(x.id))?.gewijzigd !== x.gewijzigd_op).map((x) => x.id);
      for (let i = 0; i < nodig.length; i += 20) {
        const r = await this.vraag<{ id: string; foto: string | null; gewijzigd_op: string | null }[]>("GET", `${tabel}?select=id,foto,gewijzigd_op&id=in.(${nodig.slice(i, i + 20).join(",")})`);
        for (const x of r) if (x.foto) this.fotos.set(sleutel(x.id), { gewijzigd: x.gewijzigd_op, foto: x.foto });
      }
      const heeft = new Set(metFoto.map((x) => x.id));
      return rijen.map((a) => ({ ...a, foto: heeft.has(a.id) ? this.fotos.get(sleutel(a.id))?.foto ?? null : null }));
    } catch {
      // Foto's zijn niet nodig om te werken: wat we al hadden, blijft; de rest volgende keer.
      return rijen.map((a) => ({ ...a, foto: this.fotos.get(sleutel(a.id))?.foto ?? a.foto }));
    }
  }

  async meldAanwezig(omgevingId: string | null, scherm: string): Promise<Aanwezig[]> {
    await this.zekerVersie();
    if ((this.versie ?? 0) < 3) return [];
    await this.vraag("POST", "aanwezig?on_conflict=user_id", [{ user_id: this.sessie.user_id, omgeving_id: omgevingId, scherm }],
      { Prefer: "resolution=merge-duplicates,return=minimal" });
    const sinds = new Date(Date.now() - 3 * 60000).toISOString();
    return this.vraag<Aanwezig[]>("GET", `aanwezig?select=*&laatst=gt.${encodeURIComponent(sinds)}`);
  }

  async markeerPrijzen(omgevingId: string | null, lijst: PrijsMarkering[]) {
    await this.zekerVersie();
    if ((this.versie ?? 0) < 3 || !omgevingId) return;
    await this.vraag("POST", "rpc/markeer_prijzen", { omgeving: omgevingId, lijst });
  }

  /**
   * Een nieuw wachtwoord voor het account. Eerst het huidige (wie de gsm even vasthoudt, kan het zo niet
   * veranderen); dat geeft ook een verse sessie, zoals Supabase vraagt voor een wachtwoord. Na een herstelmail
   * is er geen huidig wachtwoord: dan volstaat de sessie uit de mail (`huidig` = null).
   * Supabase meldt daarna de andere toestellen af; deze gsm blijft ingelogd.
   */
  async wijzigWachtwoord(huidig: string | null, nieuw: string) {
    if (huidig !== null) {
      let s: Sessie;
      try {
        s = await authVraag("token?grant_type=password", { email: this.sessie.email, password: huidig });
      } catch (e) {
        if (e instanceof Fout && e.status === 400) throw new Fout("Je huidige wachtwoord klopt niet.", 400);
        throw e;
      }
      if (s.user_id !== this.sessie.user_id) throw new Fout("Dat is een ander account.", 400);
      this.sessie = { ...s, naam: this.sessie.naam };
      this.verlopen = false;
      this.bewaar();
    }
    let r: Response;
    const token = await this.token();
    try {
      r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        method: "PUT",
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ password: nieuw }),
      });
    } catch {
      throw new Fout("Geen verbinding: een nieuw wachtwoord kan enkel met internet.");
    }
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      const m = j.msg || j.message || j.error_description || `Serverfout ${r.status}`;
      if (j.error_code === "same_password" || /same|different from the old/i.test(m)) throw new Fout("Kies een ander wachtwoord dan je huidige.", r.status);
      if (j.error_code === "reauthentication_needed" || /reauthenticat/i.test(m)) {
        throw new Fout("Supabase vraagt eerst opnieuw in te loggen. Log uit, log in met je huidige wachtwoord en probeer opnieuw.", r.status);
      }
      if (j.error_code === "weak_password" || /least|short|length|weak|pwned|leaked/i.test(m)) {
        throw new Fout("Supabase vindt dit wachtwoord te zwak (of het staat in een lijst van gelekte wachtwoorden). Kies een ander.", r.status);
      }
      throw new Fout(m, r.status);
    }
  }

  /** Wachtwoord vergeten: Supabase stuurt een mail met een link naar het beheer (zie de README voor de Redirect URL). */
  static async stuurHerstelmail(email: string, terug: string) {
    let r: Response;
    try {
      r = await fetch(`${SUPABASE_URL}/auth/v1/recover?redirect_to=${encodeURIComponent(terug)}`, {
        method: "POST",
        headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ email, redirect_to: terug }),
      });
    } catch {
      throw new Fout("Geen verbinding met de server.");
    }
    if (r.status === 429) throw new Fout("Er ging net al een mail. Wacht een uur en probeer dan opnieuw.", 429);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      throw new Fout(j.msg || j.message || j.error_description || `Serverfout ${r.status}`, r.status);
    }
  }

  /**
   * De link uit de herstelmail opent het beheer met de sessie in de hash (#access_token=…&type=recovery).
   * Geeft een backend met die sessie, of null als de hash geen herstellink is.
   */
  static async vanHerstellink(hash: string): Promise<SupabaseBackend | null> {
    const q = new URLSearchParams(hash.replace(/^#/, ""));
    if (q.get("type") !== "recovery" || !q.get("access_token") || !q.get("refresh_token")) return null;
    const access_token = q.get("access_token")!;
    let r: Response;
    try {
      r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${access_token}` } });
    } catch {
      throw new Fout("Geen verbinding met de server.");
    }
    if (!r.ok) throw new Fout("Deze link is verlopen of al gebruikt. Vraag een nieuwe mail.", r.status);
    const u = await r.json().catch(() => ({}));
    const b = new SupabaseBackend({
      access_token,
      refresh_token: q.get("refresh_token")!,
      expires_at: Number(q.get("expires_at")) || Math.floor(Date.now() / 1000) + (Number(q.get("expires_in")) || 3600),
      email: u.email || "",
      user_id: u.id || "",
    });
    // Pas bewaren als het een beheerder is: een link van een ander account mag de sessie op deze gsm niet wegnemen.
    b.opslaan = false;
    await b.controleerBeheerder();
    b.opslaan = true;
    b.bewaar();
    return b;
  }


  async laadAlles(): Promise<Alles> {
    // Zonder de tabellen van fase 2 werkt de voorraad gewoon verder; de kassa vraagt om het schema.
    const fase2 = <T>(p: Promise<T[]>) => p.catch((e) => {
      if (e instanceof Fout && e.status === 404) { this.schemaOud = true; return [] as T[]; }
      throw e;
    });
    this.schemaOud = false;
    await this.zekerVersie();
    const [exemplaren, artikelenZonder, beurzen, transacties] = await Promise.all([
      this.alles<Exemplaar>("exemplaren", "aangemaakt_op.asc", "", this.exemplaarKolommen()),
      this.alles<Artikel>("artikelen", "naam.asc", "", this.artikelKolommen()),
      fase2(this.alles<Beurs>("beurzen", "datum.desc")),
      fase2(this.alles<Transactie>("transacties", "tijd.asc")),
    ]);
    const [exemplarenMetFoto, artikelen] = await Promise.all([this.vulFotos("exemplaren", exemplaren, true), this.vulFotos("artikelen", artikelenZonder, true)]);
    return { exemplaren: exemplarenMetFoto.map(schoonExemplaar), artikelen: artikelen.map(schoonArtikel), beurzen, transacties: transacties.map(getallen) };
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
    rijen = rijen.map((r) => this.schoon(r, "exemplaren"));
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
    // Een reservering kan pas met schema 0.16: tot dan wacht ze in de wachtrij (niet weigeren en kwijtraken).
    if ("reservering" in wijziging) await this.vraagNieuw("Een reservering", RESERVEREN_VANAF);
    await this.zekerVersie();
    wijziging = this.schoon(wijziging, "exemplaren");
    if (!Object.keys(wijziging).length) return { id } as Exemplaar;
    const r = await this.vraag<Exemplaar[]>("PATCH", `exemplaren?id=eq.${id}`, wijziging, { Prefer: "return=representation" });
    if (!r.length) throw new Fout("Exemplaar niet gevonden");
    return r[0];
  }

  async wijzigExemplaren(ids: string[], wijziging: Partial<Exemplaar>) {
    await this.zekerVersie();
    wijziging = this.schoon(wijziging, "exemplaren");
    if (!ids.length || !Object.keys(wijziging).length) return [];
    // Per 80: honderden id's in één adres worden te lang voor de server.
    const uit: Exemplaar[] = [];
    for (let i = 0; i < ids.length; i += 80) {
      uit.push(...await this.vraag<Exemplaar[]>("PATCH", `exemplaren?id=in.(${ids.slice(i, i + 80).join(",")})`, wijziging, { Prefer: "return=representation" }));
    }
    return uit;
  }

  async voegArtikelenToe(rijen: NieuwArtikel[]) {
    await this.zekerVersie();
    rijen = rijen.map((r) => this.schoon(r, "artikelen"));
    if (!rijen.length) return [];
    return this.vraag<Artikel[]>("POST", "artikelen?on_conflict=id", rijen, {
      Prefer: "return=representation,missing=default,resolution=ignore-duplicates",
    });
  }

  async wijzigArtikel(id: string, wijziging: Partial<Artikel>) {
    await this.zekerVersie();
    wijziging = this.schoon(wijziging, "artikelen");
    if (!Object.keys(wijziging).length) return { id } as Artikel;
    const r = await this.vraag<Artikel[]>("PATCH", `artikelen?id=eq.${id}`, wijziging, { Prefer: "return=representation" });
    return r[0];
  }

  async bewaarBeurs(b: Beurs) {
    await this.zekerVersie();
    const { id, naam, datum, standgeld, startkas, status, gestart_op, afgesloten_op, getelde_kas, sumup_bevestigd, stand_start, stand_einde, opmerking, locatie, uren, link, omgeving_id } = b;
    const r = await this.vraag<Beurs[]>("POST", "beurzen?on_conflict=id", [
      this.schoon({ id, naam, datum, standgeld, startkas, status, gestart_op, afgesloten_op, getelde_kas, sumup_bevestigd, stand_start, stand_einde, opmerking, locatie: locatie ?? null, uren: uren ?? null, link: link ?? null, omgeving_id }, "beurzen"),
    ], { Prefer: "return=representation,resolution=merge-duplicates" });
    return r[0] ?? b;
  }

  async verwijderBeurs(id: string) {
    await this.vraag("DELETE", `beurzen?id=eq.${encodeURIComponent(id)}&status=eq.gepland`);
  }

  /** Enkel de gegevens van een beurs die nog gepland is: een beurs die intussen op een andere gsm startte, blijft zoals ze is. */
  async wijzigGeplandeBeurs(id: string, w: Pick<Beurs, "naam" | "datum" | "locatie" | "uren" | "link">) {
    await this.zekerVersie();
    const { naam, datum, locatie, uren, link } = w;
    await this.vraag("PATCH", `beurzen?id=eq.${encodeURIComponent(id)}&status=eq.gepland`, this.schoon({ naam, datum, locatie: locatie ?? null, uren: uren ?? null, link: link ?? null }, "beurzen"), { Prefer: "return=minimal" });
  }

  private rpc(naam: string, args: Record<string, unknown>) {
    return this.vraag<Transactie>("POST", `rpc/${naam}`, args).then(getallen);
  }

  /** Wat pas kan na de update van het schema (0.6): wachten in plaats van weigeren (en kwijtraken). */
  private async vraagNieuw(wat: string, vanaf = BOEKHOUDING_VANAF) {
    await this.zekerVersie();
    if ((this.versie ?? 0) < vanaf) {
      // Opnieuw nakijken (misschien werd het schema net uitgevoerd); anders blijft het in de wachtrij.
      localStorage.removeItem(VERSIE_SLEUTEL);
      this.versie = null;
      await this.zekerVersie();
      if ((this.versie ?? 0) < vanaf) throw new Fout(`${wat} kan pas na de update van de database. Voer supabase/schema.sql opnieuw uit.`, 404);
    }
  }

  async boekTransactie(t: Transactie) {
    const { id, beurs_id, soort, tijd, regels, totaal, cash, sumup, bank, tegoed, tegoed_van, tegenpartij, opmerking, omgeving_id } = t;
    const nieuw = soort === "kas" || soort === "prive" || !!bank || !!tegenpartij || (soort === "retour" && regels.some((r) => r.richting === "uit"));
    if (nieuw) await this.vraagNieuw(soort === "kas" ? "Geld in of uit de kas" : soort === "prive" ? "Kaarten van of naar privé" : soort === "retour" ? "Een deal terugdraaien" : "Een aankoopbewijs of overschrijving");
    // Storecredit (0.16): wacht in de wachtrij tot het schema er klaar voor is (anders zou de bon verloren gaan).
    if (tegoed) await this.vraagNieuw("Storecredit (tegoed)", TEGOED_VANAF);
    return this.rpc("boek_transactie", { t: {
      id, beurs_id, soort, tijd, regels, totaal, cash, sumup, opmerking, omgeving_id,
      ...(nieuw ? { bank: bank ?? 0, tegenpartij: tegenpartij ?? null } : {}),
      ...(tegoed ? { tegoed, tegoed_van: tegoed_van ?? null, tegenpartij: tegenpartij ?? null } : {}),
    } });
  }

  /** Het borderel aanvullen (naam, adres, handtekening) nadat de transactie geboekt is. */
  async zetTegenpartij(id: string, tegenpartij: Tegenpartij | null) {
    await this.vraagNieuw("Een aankoopbewijs bewaren");
    await this.vraag("PATCH", `transacties?id=eq.${id}`, { tegenpartij }, { Prefer: "return=minimal" });
  }

  async laadAankoopfotos(ids: string[]): Promise<Aankoopfoto[]> {
    if ((this.versie ?? 0) < 6 || !ids.length) return [];
    const uit: Aankoopfoto[] = [];
    for (let i = 0; i < ids.length; i += 40) {
      uit.push(...await this.vraag<Aankoopfoto[]>("GET", `aankoopfotos?select=id,transactie_id,foto,aangemaakt_op&transactie_id=in.(${ids.slice(i, i + 40).join(",")})&order=aangemaakt_op.asc`));
    }
    return uit;
  }

  async bewaarAankoopfoto(f: Aankoopfoto) {
    await this.vraagNieuw("Een foto bij een aankoop");
    const { id, transactie_id, foto, omgeving_id } = f;
    await this.vraag("POST", "aankoopfotos?on_conflict=id", [{ id, transactie_id, foto, ...(omgeving_id ? { omgeving_id } : {}) }],
      { Prefer: "resolution=ignore-duplicates,return=minimal" });
  }

  async verwijderAankoopfoto(id: string) {
    await this.vraagNieuw("Een foto verwijderen");
    await this.vraag("DELETE", `aankoopfotos?id=eq.${id}`, undefined, { Prefer: "return=minimal" });
  }

  // ── Schema 0.10: meer foto's per artikel, etalage, aanvragen ──
  async laadArtikelfotos(ids: string[]): Promise<Artikelfoto[]> {
    if ((this.versie ?? 0) < ETALAGE_VANAF || !ids.length) return [];
    const uit: Artikelfoto[] = [];
    for (let i = 0; i < ids.length; i += 40) {
      uit.push(...await this.vraag<Artikelfoto[]>("GET", `artikelfotos?select=id,artikel_id,foto,volgorde&artikel_id=in.(${ids.slice(i, i + 40).join(",")})&order=volgorde.asc,aangemaakt_op.asc`));
    }
    return uit;
  }

  async bewaarArtikelfoto(f: Artikelfoto) {
    await this.vraagNieuw("Meer foto's bij een artikel", ETALAGE_VANAF);
    const { id, artikel_id, foto, volgorde } = f;
    await this.vraag("POST", "artikelfotos?on_conflict=id", [{ id, artikel_id, foto, volgorde }], { Prefer: "resolution=merge-duplicates,return=minimal" });
  }

  async verwijderArtikelfoto(id: string) {
    await this.vraagNieuw("Een foto verwijderen", ETALAGE_VANAF);
    await this.vraag("DELETE", `artikelfotos?id=eq.${id}`, undefined, { Prefer: "return=minimal" });
  }

  async laadEtalage(): Promise<Etalagefoto[]> {
    await this.zekerVersie();
    if ((this.versie ?? 0) < ETALAGE_VANAF) return [];
    // Vóór 0.13 bestond enkel de etalage zonder plek: die foto's staan nu in de Instagram-strook.
    const plek = (this.versie ?? 0) >= THEMA_VANAF ? ",plek" : "";
    return this.vraag<Etalagefoto[]>("GET", `etalage?select=id,foto,titel,link,volgorde,omgeving_id,aangemaakt_op${plek}&order=volgorde.asc,aangemaakt_op.asc`);
  }

  async bewaarEtalage(f: Etalagefoto) {
    await this.vraagNieuw("De etalage", ETALAGE_VANAF);
    if (f.plek === "voorpagina") await this.vraagNieuw("Binders vooraan", THEMA_VANAF);
    const { id, foto, titel, link, volgorde, omgeving_id } = f;
    const plek = (this.versie ?? 0) >= THEMA_VANAF ? { plek: f.plek ?? "instagram" } : {};
    await this.vraag("POST", "etalage?on_conflict=id", [{ id, foto, titel: titel ?? null, link: link ?? null, volgorde, ...plek, ...(omgeving_id ? { omgeving_id } : {}) }],
      { Prefer: "resolution=ignore-duplicates,return=minimal" });
  }

  async wijzigEtalage(id: string, w: Partial<Pick<Etalagefoto, "titel" | "link" | "volgorde">>) {
    await this.vraagNieuw("De etalage", ETALAGE_VANAF);
    await this.vraag("PATCH", `etalage?id=eq.${id}`, w, { Prefer: "return=minimal" });
  }

  async verwijderEtalage(id: string) {
    await this.vraagNieuw("Een foto uit de etalage halen", ETALAGE_VANAF);
    await this.vraag("DELETE", `etalage?id=eq.${id}`, undefined, { Prefer: "return=minimal" });
  }

  // ── Schema 0.13: thema's ──
  async laadThemas(opties: { zonderLogos?: boolean } = {}): Promise<Thema[]> {
    await this.zekerVersie();
    if ((this.versie ?? 0) < THEMA_VANAF) return [];
    const logos = opties.zonderLogos ? "" : (this.versie ?? 0) >= LOGOS_VANAF ? ",logo,logo_groot,logo_eend" : ",logo";
    return this.vraag<Thema[]>("GET", `themas?select=id,naam,van,tot,aan,kleur,tekst${logos}&order=id.asc`);
  }

  async laadThemaLogos(id: string): Promise<Pick<Thema, "logo" | "logo_groot" | "logo_eend"> | null> {
    await this.zekerVersie();
    if ((this.versie ?? 0) < THEMA_VANAF) return null;
    const select = (this.versie ?? 0) >= LOGOS_VANAF ? "logo,logo_groot,logo_eend" : "logo";
    const r = await this.vraag<Pick<Thema, "logo" | "logo_groot" | "logo_eend">[]>("GET", `themas?select=${select}&id=eq.${encodeURIComponent(id)}`);
    return r[0] ?? null;
  }

  async bewaarThema(t: Thema) {
    await this.vraagNieuw("Een thema", THEMA_VANAF);
    if (t.logo_groot !== undefined || t.logo_eend !== undefined) await this.vraagNieuw("Meer logo's bij een thema", LOGOS_VANAF);
    const { id, naam, van, tot, aan, kleur, tekst } = t;
    // Upsert: enkel de velden die meegaan worden aangepast; een logo dat niet meegaat (undefined) blijft op de server staan.
    const logos = Object.fromEntries((["logo", "logo_groot", "logo_eend"] as const).filter((k) => t[k] !== undefined).map((k) => [k, t[k]]));
    await this.vraag("POST", "themas?on_conflict=id", [{ id, naam, van, tot, aan, kleur: kleur ?? null, tekst: tekst ?? null, ...logos, gewijzigd_op: new Date().toISOString() }],
      { Prefer: "resolution=merge-duplicates,return=minimal" });
  }

  async laadAanvragen(): Promise<Aanvraag[]> {
    await this.zekerVersie();
    if ((this.versie ?? 0) < ETALAGE_VANAF) return [];
    const extra = (this.versie ?? 0) >= AANVRAAG_BEELDEN_VANAF ? ",toploader" : "";
    return this.vraag<Aanvraag[]>("GET", `aanvragen?select=id,naam,email,telefoon,grootte,kleur,idee,status,aangemaakt_op${extra}&order=aangemaakt_op.desc&limit=200`);
  }

  async laadAanvraagBeelden(id: string) {
    const extra = (this.versie ?? 0) >= AANVRAAG_BEELDEN_VANAF ? ",beelden" : "";
    const r = await this.vraag<Pick<Aanvraag, "artwork" | "voorbeeld" | "beelden">[]>("GET", `aanvragen?select=artwork,voorbeeld${extra}&id=eq.${id}`);
    return r[0] ?? { artwork: null, voorbeeld: null, beelden: null };
  }

  async verwijderAanvraag(id: string) {
    await this.vraagNieuw("Een aanvraag wissen", ETALAGE_VANAF);
    await this.vraag("DELETE", `aanvragen?id=eq.${id}`, undefined, { Prefer: "return=minimal" });
  }

  async zetAanvraagStatus(id: string, status: AanvraagStatus) {
    await this.vraagNieuw("Een aanvraag bijwerken", ETALAGE_VANAF);
    await this.vraag("PATCH", `aanvragen?id=eq.${id}`, { status }, { Prefer: "return=minimal" });
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
    // Eerst van het toestel (meteen, ook als de app nu afgesloten wordt), dan pas de server.
    this.opslaan = false;
    localStorage.removeItem(SESSIE_SLEUTEL);
    try {
      // Enkel deze gsm uitloggen, niet je andere toestellen. Met een vers token, anders blijft de sessie op de server geldig.
      const token = await this.token().catch(() => this.sessie.access_token);
      await fetch(`${SUPABASE_URL}/auth/v1/logout?scope=local`, {
        method: "POST",
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` },
      });
    } catch { /* offline: lokaal is de sessie al weg */ }
  }
}

// PostgREST geeft numeric-kolommen soms als tekst; de kassa rekent met getallen.
function getallen(t: Transactie): Transactie {
  return { ...t, totaal: Number(t.totaal), cash: Number(t.cash), sumup: Number(t.sumup), bank: Number(t.bank ?? 0), conflicten: t.conflicten ?? [] };
}
