// De klantenpagina: een aparte, publieke pagina zonder login en zonder beheerfuncties.
//
// Opbouw: een startpagina (een waaier met foto's van onze binders, wat we aanbieden als vier vakken,
// onze komende beurzen), vier catalogi (#kaarten, #binders, #3d, #sealed) en "Ontwerp je binder" (#ontwerp).
// Onderaan op de gsm een balk met icoontjes om ertussen te wisselen; op een groot scherm staan ze bovenaan.
// Ze toont enkel de publieke weergaven in Supabase. Niets uit de beheer-app wordt hier geladen,
// enkel config, types en kleine hulpfuncties.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ToetsEvent, type PointerEvent as WijsEvent, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { BEHEER_PAD, FACEBOOK, INSTAGRAM, SUPABASE_KEY, SUPABASE_URL } from "../config";

// De pagina staat op de hoofdlink (index.html) en, voor oude links, op /catalogus/.
// Afbeeldingen en gegevens zoeken we relatief aan dit script (catalogus/app.js).
const BASIS = new URL("../", import.meta.url).href;
import { TALEN, type BedrijfPubliek, type Thema } from "../types";
import { actiefThema, GEWOON, maandDag, soortVan, veiligeKleur, VORMEN, type ThemaSoort } from "../lib/thema";
import { VormSvg } from "../gedeeld/Vorm";
import { euro, vandaag as vandaagLokaal } from "../lib/format";
import { kantel, kantelVrij } from "../lib/kantel";
import { veiligeFoto } from "../lib/eigenfoto";
import { TECHNIEKEN } from "../lib/categorie";
import { fotoBronnen, setLogo, type FotoKaart } from "../lib/foto";
import { SetKiezer } from "../gedeeld/SetKiezer";
import { OntwerpPagina } from "./Ontwerp";
import { kboMooi, Privacy, Voorwaarden } from "./Juridisch";
import {
  artikelZichtbaar, groepeer, groepSleutel, isNieuw, pastFilters, pastZoek, perSet, SNELFILTERS, SORTERINGEN, setIdVan, setNaam, setTaal, sorteer, zoekTekst, zoekWoorden,
  type Groep, type SetInfo, type Snelfilter, type Sortering, type Toonbaar,
} from "../lib/weergave";

// ── Gegevens ─────────────────────────────────────────────────────────────────

interface VitrineRij {
  kaart_id: string | null;
  code: string;
  naam: string;
  naam_origineel: string | null;
  soort: "kaart" | "slab" | "eigen product";
  afbeelding: string | null;
  set_naam: string | null;
  set_code: string | null;
  nummer: string | null;
  taal: string;
  conditie: string | null;
  variant: string;
  grader: string | null;
  grade: string | null;
  prijs: number | string;
  catalogus?: "en" | "asia" | null;
  sinds: string | null;       // datum van het hartje
  toegevoegd?: string | null; // sinds wanneer in de catalogus (nieuwer schema)
  foto?: string | null;       // eigen foto als er nergens een foto van de kaart is (sinds 0.6, apart geladen)
}
interface ArtikelRij {
  id: string; naam: string; soort: string; prijs: number | string; aantal: number;
  // Sinds versie 0.5 (ouder schema: ontbreken ze)
  foto?: string | null; type?: string | null; merk?: string | null; grootte?: string | null; toploader?: boolean | null;
  techniek?: string | null; artwork?: string | null; uitgestald?: boolean | null;
}

/** De vier catalogi en de startpagina. */
type Plek = "kaarten" | "binders" | "3d" | "sealed";
type Route = "start" | Plek | "ontwerp" | "privacy" | "voorwaarden";

/** Eén ding in de catalogus: een kaart (één exemplaar) of een artikel (met een aantal). */
interface Stuk extends Toonbaar {
  id: string;
  bron: "kaart" | "artikel";
  plek: Plek;
  afbeelding: string | null;
  aantal: number;
  catalogus?: "en" | "asia" | null;
  foto?: string | null;                 // eigen foto (artikel, of een kaart zonder foto)
  binder?: Pick<ArtikelRij, "merk" | "grootte" | "toploader" | "techniek" | "artwork"> | null;
  uitgestald?: boolean;                 // artikel ligt op de stand (binders in de vault: "vraag ernaar")
  type?: string;                        // artikel: binder, sealed, 3d-print of andere
}

interface KomendeBeurs { naam: string; datum: string; locatie: string | null; uren?: string | null; link?: string | null }
/** Een foto op de startpagina: een binder vooraan (Profiel › Binders vooraan) of een bericht in de Instagram-strook. */
interface EtalageRij { id: string; foto?: string | null; titel?: string | null; link?: string | null; volgorde?: number; plek?: string | null }
interface EtalageFoto { id: string; src: string; titel: string | null; link: string | null; kaal?: boolean }

const CONDITIE: Record<string, string> = { M: "Mint", NM: "Near Mint", EX: "Excellent", GD: "Good", LP: "Light Played", PL: "Played", PO: "Poor" };
const taalNaam = (t: string) => TALEN.find((x) => x.code === t)?.label ?? t;

/** Zonder type (ouder schema): raden op de naam, zoals in het beheer. */
const typeVanNaam = (naam: string) => (/binder|map\b/i.test(naam) ? "binder" : /3d|print/i.test(naam) ? "3d-print" : "andere");

function vanKaart(k: VitrineRij): Stuk {
  // Eigen producten met een eigen code (een binder, een 3D-print) horen bij Bind'r, niet bij de kaarten.
  const plek: Plek = k.soort !== "eigen product" ? "kaarten" : typeVanNaam(k.naam) === "3d-print" ? "3d" : "binders";
  return {
    id: k.code, bron: "kaart", plek, kaart_id: k.kaart_id, soort: k.soort, naam: k.naam, naam_origineel: k.naam_origineel,
    set_naam: k.set_naam, set_code: k.set_code, nummer: k.nummer, taal: k.taal, conditie: k.conditie, variant: k.variant || "normaal",
    grader: k.grader, grade: k.grade, prijs: Number(k.prijs), toegevoegd: k.toegevoegd ?? k.sinds, afbeelding: k.afbeelding, aantal: 1,
    catalogus: k.catalogus ?? null, foto: veiligeFoto(k.foto),
  };
}
function vanArtikel(a: ArtikelRij): Stuk {
  const type = a.type || (a.soort === "sealed" ? "sealed" : a.soort === "eigen product" ? typeVanNaam(a.naam) : "andere");
  const plek: Plek = type === "binder" ? "binders" : type === "3d-print" ? "3d" : "sealed";
  return {
    id: a.id, bron: "artikel", plek, type, kaart_id: null, soort: a.soort === "eigen product" ? "eigen product" : "sealed", naam: a.naam,
    set_naam: null, set_code: null, nummer: null, taal: "", conditie: null, variant: "normaal", grader: null, grade: null,
    prijs: Number(a.prijs), toegevoegd: null, afbeelding: null, aantal: a.aantal, foto: veiligeFoto(a.foto),
    binder: type === "binder" ? { merk: a.merk ?? null, grootte: a.grootte ?? null, toploader: a.toploader ?? null, techniek: a.techniek ?? null, artwork: a.artwork ?? null } : null,
    uitgestald: a.uitgestald ?? true,
  };
}

const TECHNIEK_NAAM: Record<string, string> = Object.fromEntries(TECHNIEKEN.map((t) => [t.id, t.label]));
/** "9-pocket, toploader, lasergravure" */
function binderTekst(b: NonNullable<Stuk["binder"]>): string {
  return [b.grootte, b.toploader ? "toploader" : null, b.techniek ? TECHNIEK_NAAM[b.techniek]?.toLowerCase() : null].filter(Boolean).join(", ");
}

/** Een publieke weergave lezen. Een fout geeft de HTTP-status als boodschap ("400" = onbekende kolom); met `ms` geven we het op na zoveel tijd. */
async function haal<T>(pad: string, ms?: number): Promise<T> {
  const stop = ms && typeof AbortController !== "undefined" ? new AbortController() : null;
  const klok = stop ? setTimeout(() => stop.abort(), ms) : null;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${pad}`, { headers: { apikey: SUPABASE_KEY }, signal: stop?.signal });
    if (!r.ok) throw new Error(String(r.status));
    return await (r.json() as Promise<T>);
  } finally {
    if (klok) clearTimeout(klok);
  }
}
const pauze = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Data {
  stukken: Stuk[]; instagram: string; facebook: string; bedrijf: BedrijfPubliek | null; beurzen: KomendeBeurs[]; sleutel: string | null;
  themas: Thema[];
}

/** De foto's van de startpagina: de binders vooraan en de Instagram-strook. `fout` = de eerste binder kwam niet (dan de voorbeelden). */
interface Etalage { voorpagina: EtalageRij[]; insta: EtalageRij[]; fout?: boolean }

/** De etalage verdelen: vooraan (hoogstens 12) en de Instagram-strook (de 16 bovenste). Zonder plek = Instagram (van vóór 0.13). */
function verdeel(rijen: EtalageRij[]): Etalage {
  const op = [...rijen].sort((a, b) => (a.volgorde ?? 0) - (b.volgorde ?? 0));
  return { voorpagina: op.filter((r) => r.plek === "voorpagina").slice(0, 12), insta: op.filter((r) => r.plek !== "voorpagina").slice(0, 16) };
}

/** Met ?demo=1 toont de pagina de demo van dit toestel (om te kijken hoe klanten het zien). */
function laadDemo(): (Data & { etalage: Etalage }) | null {
  if (!new URLSearchParams(location.search).has("demo")) return null;
  try {
    const d = JSON.parse(localStorage.getItem("bindr-demo-v1") || "null");
    if (!d) return { stukken: [], instagram: INSTAGRAM, facebook: FACEBOOK, bedrijf: null, beurzen: [], sleutel: null, etalage: { voorpagina: [], insta: [] }, themas: [] };
    // Zoals de publieke weergaven: enkel aangevinkte omgevingen, geen kaarten waarvan het hartje moet wisselen of het label nog niet hangt.
    const zichtbaar = new Set(((d.omgevingen ?? []) as { id: string; zichtbaar_voor_klanten: boolean }[]).filter((o) => o.zichtbaar_voor_klanten).map((o) => o.id));
    const toon = (r: { omgeving_id?: string | null }) => !zichtbaar.size || !r.omgeving_id || zichtbaar.has(r.omgeving_id);
    type DemoEx = VitrineRij & { opslag: string; status: string; hartjesprijs: number | null; hartjesdatum: string | null; vitrine_sinds?: string | null; nieuw_hartje?: number | null; omgeving_id?: string | null; label_status?: string };
    const kaarten = (d.exemplaren as DemoEx[])
      .filter((e) => e.opslag === "vitrine" && e.status === "in voorraad" && e.hartjesprijs != null && e.nieuw_hartje == null && (e.label_status === "gestickerd" || e.soort === "eigen product") && toon(e))
      .map((e) => vanKaart({ ...e, prijs: e.hartjesprijs!, sinds: e.hartjesdatum, toegevoegd: e.vitrine_sinds ?? e.hartjesdatum }));
    type DemoArt = ArtikelRij & { opslag: string; omgeving_id?: string | null; zichtbaar?: boolean | null; details?: Record<string, unknown> | null };
    const artikelen = (d.artikelen as DemoArt[])
      .filter((a) => artikelZichtbaar({ ...a, details: a.details as { type?: string } | null }) && toon(a))
      .map((a) => vanArtikel({ ...a, ...(a.details ?? {}), uitgestald: a.opslag === "vitrine" } as ArtikelRij));
    const ig = d.instellingen?.instagram;
    const vandaag = vandaagLokaal();
    const beurzen = ((d.beurzen ?? []) as (KomendeBeurs & { status: string; omgeving_id?: string | null })[])
      .filter((b) => (b.status === "gepland" || b.status === "actief") && b.datum >= vandaag && toon(b))
      .map((b) => ({ naam: b.naam, datum: b.datum, locatie: b.locatie ?? null, uren: b.uren ?? null, link: b.link ?? null }))
      .sort((a, b) => a.datum.localeCompare(b.datum));
    const etalage = verdeel(((d.etalage ?? []) as (EtalageRij & { omgeving_id?: string | null })[]).filter(toon));
    const themas = Array.isArray(d.themas) ? d.themas as Thema[] : [];
    const sleutel = typeof d.instellingen?.aanvraag_sleutel === "string" && d.instellingen.aanvraag_sleutel ? d.instellingen.aanvraag_sleutel : null;
    const fb = d.instellingen?.facebook;
    const bedrijf = d.instellingen?.bedrijf_publiek && typeof d.instellingen.bedrijf_publiek === "object" ? d.instellingen.bedrijf_publiek as BedrijfPubliek : null;
    return { stukken: [...kaarten, ...artikelen], instagram: typeof ig === "string" && ig ? ig : INSTAGRAM, facebook: typeof fb === "string" ? fb : FACEBOOK, bedrijf, beurzen, sleutel, etalage, themas };
  } catch {
    return null;
  }
}

const aantalVan = (g: Groep<Stuk>) => g.items.reduce((s, x) => s + x.aantal, 0);
const igProfiel = (ig: string) => `https://www.instagram.com/${encodeURIComponent(ig)}/`;
/** Enkel http(s)-links van een beurs (de beheerder vult ze in; nooit javascript: of zo). */
const veiligeLink = (l: string | null | undefined) => { try { const u = new URL(l ?? ""); return u.protocol === "https:" || u.protocol === "http:" ? u.href : null; } catch { return null; } };
const routeLink = (plaats: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(plaats)}`;

// ── Routes ───────────────────────────────────────────────────────────────────

const ROUTES: { id: Route; label: string; titel: string; icoon: () => ReactNode }[] = [
  { id: "start", label: "Start", titel: "Bind'r", icoon: () => <StartIcoon /> },
  { id: "kaarten", label: "Kaarten", titel: "Kaarten", icoon: () => <KaartenIcoon /> },
  { id: "binders", label: "Binders", titel: "Binders", icoon: () => <BinderIcoon /> },
  { id: "3d", label: "3D-prints", titel: "3D-prints", icoon: () => <KubusIcoon /> },
  { id: "sealed", label: "Sealed", titel: "Sealed", icoon: () => <PackIcoon /> },
  { id: "ontwerp", label: "Ontwerp", titel: "Ontwerp je binder", icoon: () => <OntwerpIcoon maat={22} /> },
];
function routeVan(hash: string): Route {
  const h = hash.replace(/^#\/?/, "").toLowerCase();
  if (h === "cookies") return "privacy";
  return (["kaarten", "binders", "3d", "sealed", "ontwerp", "privacy", "voorwaarden"] as const).find((r) => r === h) ?? "start";
}
const hrefVan = (r: Route) => (r === "start" ? "#" : `#${r}`);

// ── De pagina ────────────────────────────────────────────────────────────────

type Cat = "alles" | "kaart" | "slab";

function KlantPagina() {
  const [data, setData] = useState<Data | null>(null);
  const [sets, setSets] = useState<SetInfo | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [route, setRoute] = useState<Route>(() => routeVan(location.hash));
  const [open, setOpen] = useState<Groep<Stuk> | null>(null);
  const [zoekFocus, setZoekFocus] = useState(false);
  const demo = useMemo(laadDemo, []);
  // De filters van de kaarten blijven staan als je even naar de binders kijkt.
  const [kaartFilter, setKaartFilter] = useState<KaartFilter>({ cat: "alles", zoek: "", filters: new Set(), set: "", sort: "nieuw" });

  useEffect(() => {
    const wissel = () => {
      setRoute(routeVan(location.hash));
      setOpen(null);
      window.scrollTo({ top: 0 });
      // #cookies: naar dat stuk van de privacyverklaring.
      if (location.hash === "#cookies") setTimeout(() => document.getElementById("cookies")?.scrollIntoView({ block: "start" }), 50);
    };
    window.addEventListener("hashchange", wissel);
    return () => window.removeEventListener("hashchange", wissel);
  }, []);
  useEffect(() => {
    const titel = route === "privacy" ? "Privacy en cookies" : route === "voorwaarden" ? "Verkoopvoorwaarden" : ROUTES.find((r) => r.id === route)?.titel;
    document.title = route === "start" ? "Bind'r · Custom binders en beurscatalogus" : `${titel} · Bind'r`;
  }, [route]);

  // De bovenbalk schuift weg als je naar beneden scrolt en komt terug als je omhoog scrolt.
  const [balkWeg, setBalkWeg] = useState(false);
  useEffect(() => {
    let vorige = window.scrollY;
    const scroll = () => {
      const y = window.scrollY;
      if (Math.abs(y - vorige) < 8) return;
      setBalkWeg(y > vorige && y > 160);
      vorige = y;
    };
    window.addEventListener("scroll", scroll, { passive: true });
    return () => window.removeEventListener("scroll", scroll);
  }, []);

  // De foto's van de startpagina, los van de rest (zodat de binders vooraan niet op de catalogus wachten).
  const [etalage, setEtalage] = useState<Etalage | null>(null);
  // Elke foto komt apart (ze zijn groot), per id één keer. Lukt het niet, dan nog twee keer; daarna later opnieuw
  // (bv. als de Instagram-strook in beeld komt). Geeft false als de foto's er niet kwamen.
  const gevraagd = useRef(new Set<string>());
  const vulEtalage = async (ids: string[]): Promise<boolean> => {
    const nieuw = ids.filter((id) => !gevraagd.current.has(id));
    if (!nieuw.length || demo) return true;
    nieuw.forEach((id) => gevraagd.current.add(id));
    for (let poging = 0; poging < 3; poging++) {
      if (poging) await pauze(1500 * poging);
      try {
        const f = await haal<{ id: string; foto: string | null }[]>(`publieke_etalage?select=id,foto&id=in.(${nieuw.join(",")})`, 20000);
        const per = new Map(f.map((x) => [x.id, x.foto]));
        const vul = (l: EtalageRij[]) => l.map((e) => (per.has(e.id) ? { ...e, foto: per.get(e.id) } : e));
        setEtalage((x) => x && { ...x, voorpagina: vul(x.voorpagina), insta: vul(x.insta) });
        return true;
      } catch { /* nog eens */ }
    }
    nieuw.forEach((id) => gevraagd.current.delete(id));
    return false;
  };
  useEffect(() => {
    if (demo) { setEtalage(demo.etalage); return; }
    let weg = false;
    void (async () => {
      // Met plek (vanaf 0.13). Een ouder schema kent die kolom niet (fout 400): dan staat alles in de Instagram-strook.
      // Lukt het helemaal niet (geen internet), dan geen etalage: de voorbeeldbinders.
      const rijen = await haal<EtalageRij[]>("publieke_etalage?select=id,titel,link,volgorde,plek&order=volgorde.asc&limit=60", 15000)
        .catch((e) => (e instanceof Error && e.message === "400"
          ? haal<EtalageRij[]>("publieke_etalage?select=id,titel,link,volgorde&order=volgorde.asc&limit=16", 15000)
          : Promise.reject(e)))
        .catch(() => [] as EtalageRij[]);
      if (weg) return;
      const v = verdeel(rijen);
      setEtalage(v);
      // Vooraan: eerst de eerste binder alleen (die staat meteen vooraan), dan telkens twee; niet zolang de pagina
      // in de achtergrond staat. Komt de eerste niet, dan de voorbeeldbinders in plaats van een lege waaier.
      const ids = v.voorpagina.map((e) => e.id);
      for (let i = 0; i < ids.length && !weg; i += i ? 2 : 1) {
        while (i && document.hidden && !weg) await pauze(2000);
        const ok = await vulEtalage(ids.slice(i, i + (i ? 2 : 1)));
        if (!ok && i === 0) { if (!weg) setEtalage((x) => x && { ...x, fout: true }); return; }
      }
    })();
    return () => { weg = true; };
  }, [demo]); // eslint-disable-line react-hooks/exhaustive-deps
  /** De Instagram-strook komt in de buurt: haar foto's, per vier. */
  const vulInsta = async (ids: string[]) => {
    for (let i = 0; i < ids.length; i += 4) await vulEtalage(ids.slice(i, i + 4));
  };

  // Het thema van vandaag (Halloween, kerst …), of met ?thema=halloween een thema vooraf bekijken.
  const proefThema = useMemo(() => new URLSearchParams(location.search).get("thema"), []);
  const thema = useMemo<Thema | null>(() => {
    const lijst = data?.themas ?? [];
    return (proefThema ? lijst.find((t) => t.id === proefThema) : actiefThema(lijst, maandDag(vandaagLokaal()))) ?? null;
  }, [data?.themas, proefThema]);
  const [themaLogo, setThemaLogo] = useState<string | null>(null);
  useEffect(() => {
    setThemaLogo(null);
    if (!thema) return;
    if (demo) { setThemaLogo(veiligeFoto(thema.logo)); return; }
    haal<{ logo: string | null }[]>(`publieke_themas?select=logo&id=eq.${encodeURIComponent(thema.id)}`)
      .then((r) => setThemaLogo(veiligeFoto(r[0]?.logo))).catch(() => undefined);
  }, [thema?.id, demo]); // eslint-disable-line react-hooks/exhaustive-deps
  const soort: ThemaSoort | null = thema ? soortVan(thema.id) ?? null : null;
  const themaKleur = thema ? veiligeKleur(thema.kleur) ?? soort?.kleur ?? null : null;

  useEffect(() => {
    fetch(`${BASIS}data/sets.json`).then((r) => (r.ok ? r.json() : null)).then(setSets).catch(() => setSets(null));
    if (demo) { setData(demo); return; }
    // Eerst alles zonder foto's (snel, ook op 4G aan de stand); de eigen foto's komen daarna.
    const artikelKolommen = "id,naam,soort,prijs,aantal,type,merk,grootte,toploader,techniek,artwork,uitgestald";
    const kaartKolommen = "kaart_id,catalogus,afbeelding,soort,naam,set_naam,set_code,nummer,taal,conditie,variant,grader,grade,prijs,code,naam_origineel,sinds,toegevoegd";
    Promise.all([
      haal<VitrineRij[]>(`publieke_vitrine?select=${kaartKolommen}`).catch(() => haal<VitrineRij[]>("publieke_vitrine?select=*")),
      haal<ArtikelRij[]>(`publieke_artikelen?select=${artikelKolommen}`).catch(() => haal<ArtikelRij[]>("publieke_artikelen?select=*")).catch(() => []),
      haal<{ sleutel: string; waarde: unknown }[]>("publieke_instellingen?select=*").catch(() => []),
      haal<KomendeBeurs[]>("publieke_beurzen?select=*").catch(() => []),
      haal<Thema[]>("publieke_themas?select=id,naam,van,tot,aan,kleur,tekst").catch(() => [] as Thema[]),
    ]).then(([kaarten, artikelen, inst, beurzen, themas]) => {
      const ig = inst.find((x) => x.sleutel === "instagram")?.waarde;
      const sleutel = inst.find((x) => x.sleutel === "aanvraag_sleutel")?.waarde;
      const fb = inst.find((x) => x.sleutel === "facebook")?.waarde;
      const bedrijf = inst.find((x) => x.sleutel === "bedrijf_publiek")?.waarde;
      setData({
        stukken: [...kaarten.map(vanKaart), ...artikelen.map(vanArtikel)], instagram: typeof ig === "string" && ig ? ig : INSTAGRAM, beurzen,
        facebook: typeof fb === "string" ? fb : FACEBOOK, bedrijf: bedrijf && typeof bedrijf === "object" ? bedrijf as BedrijfPubliek : null,
        sleutel: typeof sleutel === "string" && sleutel ? sleutel : null, themas,
      });
      const vulFotos = (bron: Stuk["bron"], fotos: { id: string; foto: string | null }[]) => {
        const per = new Map(fotos.map((f) => [f.id, veiligeFoto(f.foto)]));
        if (per.size) setData((d) => d && { ...d, stukken: d.stukken.map((x) => (x.bron === bron && per.get(x.id) ? { ...x, foto: per.get(x.id) } : x)) });
      };
      if (artikelen.length) {
        haal<{ id: string; foto: string | null }[]>("publieke_artikelen?select=id,foto&foto=not.is.null").then((f) => vulFotos("artikel", f)).catch(() => undefined);
      }
      if (kaarten.length) {
        haal<{ code: string; foto: string | null }[]>("publieke_vitrine?select=code,foto&foto=not.is.null")
          .then((f) => vulFotos("kaart", f.map((x) => ({ id: x.code, foto: x.foto })))).catch(() => undefined);
      }
    }).catch(() => setFout("De catalogus kon niet geladen worden. Controleer je internet en laad de pagina opnieuw."));
  }, [demo]);

  const stukken = data?.stukken ?? [];
  const ig = data?.instagram ?? INSTAGRAM;
  const fb = veiligeLink(data?.facebook ?? FACEBOOK);
  const bedrijf = data?.bedrijf ?? null;
  const beurzen = data?.beurzen ?? [];
  const telling = useMemo(() => {
    const t: Record<Plek, number> = { kaarten: 0, binders: 0, "3d": 0, sealed: 0 };
    for (const s of stukken) t[s.plek] += s.aantal;
    return t;
  }, [stukken]);
  // Lege catalogi (nog geen 3D-prints online) laten we uit de navigatie; kaarten, binders en ontwerpen staan er altijd.
  const routes = ROUTES.filter((r) => r.id === "start" || r.id === "kaarten" || r.id === "binders" || r.id === "ontwerp" || !data || telling[r.id as Plek] > 0);

  return (
    <div className={`klant route-${route}${balkWeg ? " balk-weg" : ""}${thema ? ` thema thema-${thema.id}` : ""}`}
      style={themaKleur ? ({ "--thema": themaKleur } as React.CSSProperties) : undefined}>
      <Sfeer soort={soort} />
      <header className="klant-balk">
        <a href="#" className="klant-merk" aria-label="Bind'r, naar de start">
          <img src={themaLogo ?? `${BASIS}img/logo-woord.png`} alt="Bind'r" width={150} height={66} />
        </a>
        <nav className="klant-nav boven" aria-label="Catalogi">
          {routes.map((r) => (
            <a key={r.id} href={hrefVan(r.id)} aria-current={route === r.id ? "page" : undefined}>{r.icoon()}<span>{r.label}</span></a>
          ))}
        </nav>
        <div className="klant-balk-rechts">
          <a className="klant-ig-knop" href={igProfiel(ig)} target="_blank" rel="noreferrer" aria-label={`Instagram @${ig}`} title={`Instagram @${ig}`}>
            <IgIcoon />
          </a>
          {fb && (
            <a className="klant-ig-knop" href={fb} target="_blank" rel="noreferrer" aria-label="Facebook" title="Facebook">
              <FbIcoon />
            </a>
          )}
        </div>
      </header>

      <main className="klant-inhoud">
        {fout && <p className="klant-fout">{fout}</p>}
        {route === "start" ? (
          <Start data={data} etalage={etalage} stukken={stukken} telling={telling} beurzen={beurzen} ig={ig} demo={!!demo} thema={thema} soort={soort}
            proef={!!proefThema} onInsta={(ids) => void vulInsta(ids)} />
        ) : route === "ontwerp" ? (
          <OntwerpPagina demo={!!demo} sleutel={data?.sleutel ?? null} ig={ig} igLink={igProfiel(ig)} basis={BASIS} />
        ) : route === "privacy" ? (
          <Privacy b={bedrijf} mail={!!data?.sleutel} />
        ) : route === "voorwaarden" ? (
          <Voorwaarden b={bedrijf} />
        ) : route === "kaarten" ? (
          <Kaarten data={data} stukken={stukken} sets={sets} f={kaartFilter} zetF={setKaartFilter} onOpen={setOpen} onZoekFocus={setZoekFocus} />
        ) : (
          <Artikels plek={route} data={data} stukken={stukken} beurzen={beurzen} sets={sets} onOpen={setOpen} />
        )}
      </main>

      <Voet ig={ig} fb={fb} b={bedrijf} logo={themaLogo} />

      <nav className="klant-nav onder" aria-label="Catalogi">
        {routes.map((r) => (
          <a key={r.id} href={hrefVan(r.id)} aria-current={route === r.id ? "page" : undefined}>{r.icoon()}<span>{r.label}</span></a>
        ))}
      </nav>

      {open && <Detail g={open} beurzen={beurzen} sets={sets} demo={!!demo} onSluit={() => setOpen(null)} />}
      {data && route !== "ontwerp" && route !== "privacy" && route !== "voorwaarden" && <Eend ig={ig} verborgen={!!open || zoekFocus} />}
    </div>
  );
}

// ── Start: onze binders vooraan, wat we aanbieden, waar we staan ─────────────

/** Zolang er nog geen foto's van ons werk zijn: voorbeeldbinders met een gravure (scripts/voorbeeldbinders.cjs). */
const VOORBEELDEN = ["oceaanblauw", "geel", "rood", "roze", "paars"];
const voorbeelden = (): EtalageFoto[] => VOORBEELDEN.map((k) => ({ id: `vb-${k}`, src: `${BASIS}img/voorbeeld/${k}.webp`, titel: null, link: "#binders", kaal: true }));

function Start({ data, etalage, stukken, telling, beurzen, ig, demo, thema, soort, proef, onInsta }: {
  data: Data | null; etalage: Etalage | null; stukken: Stuk[]; telling: Record<Plek, number>; beurzen: KomendeBeurs[]; ig: string; demo: boolean;
  thema: Thema | null; soort: ThemaSoort | null; proef: boolean; onInsta: (ids: string[]) => void;
}) {
  // Vooraan: uitgeknipte foto's van onze binders (Profiel › Binders vooraan). Zolang die er niet zijn: de voorbeeldbinders.
  // Nooit door elkaar; en zolang de foto's nog laden, een lege waaier (geen voorbeelden die dan plots verspringen).
  const vooraan = etalage?.voorpagina ?? [];
  const fotos = useMemo<EtalageFoto[]>(() => {
    const uit: EtalageFoto[] = [];
    for (const e of vooraan) { const src = veiligeFoto(e.foto); if (src) uit.push({ id: e.id, src, titel: e.titel ?? null, link: veiligeLink(e.link), kaal: true }); }
    return uit;
  }, [vooraan]);
  const laden = !etalage || (vooraan.length > 0 && !fotos.length && !etalage.fout);
  // Per soort een paar beelden: de duurste met een foto eerst.
  const beelden = (p: Plek): Stuk[] => stukken.filter((s) => s.plek === p && (p === "kaarten" ? s.afbeelding : s.foto)).sort((a, b) => b.prijs - a.prijs).slice(0, 3);
  const zin = thema?.tekst?.trim() || (proef && thema ? `Voorbeeld van het thema ${thema.naam}` : "");
  return (
    <>
      {thema && zin && (
        <p className="thema-band">
          {soort && <VormSvg vorm={VORMEN[soort.zweef[0] ?? "ster"]} />}
          <span>{zin}</span>
        </p>
      )}
      <section className="held" aria-labelledby="held-titel">
        <div className="held-tekst">
          <h1 id="held-titel">Binders die even uniek zijn als je collectie</h1>
          <p>Custom binders voor Pokémon-verzamelaars, met de laser gegraveerd.{demo ? " (Voorbeeld met de demo.)" : ""}</p>
          <div className="held-knoppen">
            <a className="knop" href="#binders">Bekijk de binders</a>
          </div>
        </div>
        <Waaier fotos={laden ? [] : fotos.length ? fotos : voorbeelden()} laden={laden} />
      </section>

      <section className="aanbod" aria-labelledby="aanbod-titel">
        <h2 id="aanbod-titel">Wat je bij ons vindt</h2>
        <div className="vakken">
          <Vak plek="kaarten" titel="Kaarten" tekst={data ? `${telling.kaarten} singles en slabs` : "…"} beelden={beelden("kaarten")} />
          <Vak plek="binders" titel="Binders" tekst={data ? (telling.binders ? `${telling.binders} ontwerpen van ons` : "Ons eigen werk") : "…"} beelden={beelden("binders")}
            reserve={laden ? [] : (fotos.length ? fotos : voorbeelden()).slice(0, 3)} />
          <Vak plek="3d" titel="3D-prints" tekst={data ? (telling["3d"] ? `${telling["3d"]} stuks` : "Aan onze stand") : "…"} beelden={beelden("3d")} />
          <Vak plek="sealed" titel="Sealed" tekst={data ? (telling.sealed ? `${telling.sealed} stuks` : "Aan onze stand") : "…"} beelden={beelden("sealed")} />
        </div>
      </section>

      {/* Ontwerp je binder: één keer op de pagina, als een uitnodiging in het midden. */}
      <a className="ontwerp-banner" href="#ontwerp">
        <span className="ontwerp-banner-tekst">
          <strong>Je eigen ontwerp op een binder?</strong>
          <span>Probeer je tekening of logo op een zip-binder en vraag hem aan.</span>
        </span>
        <span className="ontwerp-banner-pijl" aria-hidden="true"><OntwerpIcoon maat={24} /></span>
      </a>

      {(etalage?.insta.length ?? 0) > 0 && <InstaStrook rijen={etalage!.insta} ig={ig} onNodig={onInsta} />}

      {/* Geen beurs gepland: dan geen lege sectie (onderaan staat al waar je ons volgt). */}
      {beurzen.length > 0 && <Beurzen beurzen={beurzen} ig={ig} geladen={!!data} />}

      <section className="over" aria-labelledby="over-titel">
        <div className="over-tekst">
          <h2 id="over-titel">Over Bind'r</h2>
          <p>Een gewone kaartmap wordt bij ons een stuk van je collectie.</p>
          <ul className="over-lijst">
            <li><OntwerpIcoon /><span><strong>Eigen ontwerp.</strong> Elk artwork maken we zelf, geïnspireerd op Pokémon, sets en card art.</span></li>
            <li><LaserIcoon /><span><strong>Lasergravure.</strong> Het ontwerp gaat er met de laser in, op de voorkant of op voor- én achterkant.</span></li>
            <li><StandIcoon /><span><strong>Op de beurs.</strong> Aan onze stand verkopen we ook kaarten, slabs en sealed, en kopen en ruilen we kaarten.</span></li>
          </ul>
        </div>
      </section>
    </>
  );
}

/**
 * Onze laatste berichten op Instagram, in een strook die rustig van links naar rechts doorloopt (twee keer dezelfde rij
 * achter elkaar, zodat ze naadloos rondgaat). Stil buiten beeld, met de muis erop, met de knop (ook op een gsm) en met
 * het toetsenbord erin (dan staat ze vooraan, zodat je ziet waar je bent); bij "minder beweging" staat ze stil en veeg
 * je zelf. De foto's laden pas als je ernaartoe scrolt.
 */
function InstaStrook({ rijen, ig, onNodig }: { rijen: EtalageRij[]; ig: string; onNodig: (ids: string[]) => void }) {
  const ref = useRef<HTMLElement>(null);
  const [inBeeld, setInBeeld] = useState(false);
  const [stil, setStil] = useState(false);
  const [breedte, setBreedte] = useState(() => (typeof innerWidth === "number" ? innerWidth : 1280));
  const nodig = useRef(onNodig);
  nodig.current = onNodig;
  const ids = rijen.map((r) => r.id).join(",");
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") { nodig.current(ids.split(",")); setInBeeld(true); return; }
    // Elke keer dat ze in de buurt komt: wat nog ontbreekt (een foto die eerder niet kwam, opnieuw).
    const io = new IntersectionObserver(([x]) => {
      setInBeeld(x.isIntersecting);
      if (x.isIntersecting) nodig.current(ids.split(","));
    }, { rootMargin: "500px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [ids]);
  useEffect(() => {
    const z = () => setBreedte(innerWidth);
    addEventListener("resize", z);
    return () => removeEventListener("resize", z);
  }, []);
  // Eén ronde is breder dan het scherm (plus één tegel), anders is er rechts even een gat als de lus herbegint.
  const stap = breedte >= 760 ? 210 : 164; // tegel + tussenruimte (klant.css)
  const nodigTegels = Math.ceil(breedte / stap) + 1;
  const ronde = Array.from({ length: Math.max(1, Math.ceil(nodigTegels / rijen.length)) }, () => rijen).flat();
  return (
    <section ref={ref} className="insta" aria-labelledby="insta-titel">
      <div className="insta-kop">
        <h2 id="insta-titel">Nieuw op Instagram</h2>
        <div className="insta-acties">
          <button type="button" className="insta-pauze" aria-pressed={stil} aria-label={stil ? "Laat de strook weer lopen" : "Zet de strook stil"}
            title={stil ? "Laten lopen" : "Stilzetten"} onClick={() => setStil(!stil)}>
            {stil ? <SpeelIcoon /> : <PauzeIcoon />}
          </button>
          <a className="insta-volg" href={igProfiel(ig)} target="_blank" rel="noreferrer"><IgIcoon maat={18} /> @{ig}</a>
        </div>
      </div>
      <div className={`insta-strook${inBeeld && !stil ? " loopt" : ""}`} style={{ "--duur": `${ronde.length * 3.4}s` } as React.CSSProperties}>
        <ul className="insta-baan">
          {[0, 1].map((kopie) => ronde.map((r, i) => {
            const extra = kopie > 0 || i >= rijen.length; // herhalingen: niet voor schermlezers en het toetsenbord
            const src = veiligeFoto(r.foto);
            return (
              <li key={`${kopie}-${i}`} className={`insta-tegel t${i % 4}${extra ? " extra" : ""}`} aria-hidden={extra || undefined}>
                <a href={veiligeLink(r.link) ?? igProfiel(ig)} target="_blank" rel="noreferrer" tabIndex={extra ? -1 : undefined}
                  aria-label={r.titel ? `${r.titel}, op Instagram` : "Bekijk dit bericht op Instagram"} draggable={false}>
                  {src ? <img src={src} alt="" loading="lazy" decoding="async" draggable={false} /> : <span className="insta-wacht" />}
                  <span className="insta-ig" aria-hidden="true"><IgIcoon maat={15} /></span>
                </a>
              </li>
            );
          }))}
        </ul>
      </div>
    </section>
  );
}

const minderBeweging = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
function useBreed(px: number): boolean {
  const [breed, setBreed] = useState(() => typeof matchMedia !== "undefined" && matchMedia(`(min-width: ${px}px)`).matches);
  useEffect(() => {
    const m = matchMedia(`(min-width: ${px}px)`);
    const z = () => setBreed(m.matches);
    m.addEventListener?.("change", z);
    return () => m.removeEventListener?.("change", z);
  }, [px]);
  return breed;
}

/**
 * Onze binders als een waaier, zoals kaarten in je hand. Om de paar seconden schuift de voorste opzij en komt de
 * volgende naar voren, met één keer een holo-glans erover (zoals een holo-kaart) en een sterretje. Vegen of tikken
 * neemt het over (dan draait hij niet meer vanzelf); stil zolang hij niet in beeld is, de muis erop staat of bij
 * "minder beweging". De bolletjes eronder tonen waar je bent en zijn ook knoppen.
 */
function Waaier({ fotos, laden = false }: { fotos: EtalageFoto[]; laden?: boolean }) {
  const breed = useBreed(1000);
  const half = breed ? 2 : 1; // zoveel links en rechts van de voorste
  const [voor, setVoor] = useState(0);
  const [stil, setStil] = useState(false);
  const [zelf, setZelf] = useState(false); // de bezoeker nam het over: niet meer vanzelf draaien
  const [inBeeld, setInBeeld] = useState(true);
  const aantal = fotos.length;
  const ref = useRef({ aantal, x: 0, id: -1 });
  ref.current.aantal = aantal;
  const veegde = useRef(false);
  const doos = useRef<HTMLDivElement>(null);
  const naar = (i: number) => setVoor(((i % Math.max(1, ref.current.aantal)) + ref.current.aantal) % Math.max(1, ref.current.aantal));
  const volgende = (stap: number) => setVoor((v) => (v + stap + ref.current.aantal) % Math.max(1, ref.current.aantal));
  useEffect(() => {
    const el = doos.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([x]) => setInBeeld(x.isIntersecting), { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, [aantal > 0]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (aantal < 2 || stil || zelf || !inBeeld || minderBeweging()) return;
    const t = setInterval(() => { if (!document.hidden) volgende(1); }, 5500);
    return () => clearInterval(t);
  }, [aantal > 1, stil, zelf, inBeeld]); // eslint-disable-line react-hooks/exhaustive-deps
  // Nog aan het laden: wel de plaats, zodat de pagina niet verspringt als de binders er zijn.
  if (!aantal) return laden ? <div className="waaier-blok" aria-hidden="true"><div className="waaier laden" /></div> : null;
  const neer = (e: WijsEvent<HTMLDivElement>) => { ref.current.x = e.clientX; ref.current.id = e.pointerId; };
  const los = (e: WijsEvent<HTMLDivElement>) => {
    if (ref.current.id !== e.pointerId) return;
    const dx = e.clientX - ref.current.x;
    ref.current.id = -1;
    if (Math.abs(dx) > 40) { volgende(dx < 0 ? 1 : -1); veegde.current = true; setZelf(true); }
  };
  return (
    <div className="waaier-blok">
      <div ref={doos} className="waaier" role="group" aria-roledescription="carrousel" aria-label="Onze binders"
        onPointerDown={neer} onPointerUp={los} onPointerCancel={() => { ref.current.id = -1; }}
        onPointerEnter={(e) => { if (e.pointerType === "mouse") setStil(true); }} onPointerLeave={() => setStil(false)}
        onFocus={() => setStil(true)} onBlur={() => setStil(false)}>
        {fotos.map((f, i) => {
          // Plaats ten opzichte van de voorste: 0 = vooraan in het midden, negatief links, positief rechts.
          let o = (i - voor + aantal) % aantal;
          if (o > aantal / 2) o -= aantal;
          const zichtbaar = Math.abs(o) <= half;
          const plek = o === 0 ? "o0" : zichtbaar ? `${o < 0 ? "l" : "r"}${Math.abs(o)}` : o < 0 ? "weg-l" : "weg-r";
          const extern = !!f.link && /^https?:/.test(f.link);
          return (
            <a key={f.id} className={`waaier-foto ${plek}${f.kaal ? " kaal" : ""}`} href={f.link ?? "#binders"}
              style={f.kaal && o === 0 ? ({ "--beeld": `url("${f.src}")` } as React.CSSProperties) : undefined}
              target={extern ? "_blank" : undefined} rel={extern ? "noreferrer" : undefined} tabIndex={zichtbaar ? 0 : -1} aria-hidden={!zichtbaar}
              aria-label={f.titel ? `${f.titel}${extern ? " (op Instagram)" : ""}` : "Bekijk onze binders"}
              onClick={(e) => {
                // Na vegen niets openen; een binder opzij eerst naar voren halen, de voorste openen.
                if (veegde.current) { veegde.current = false; e.preventDefault(); return; }
                if (o !== 0) { e.preventDefault(); setZelf(true); volgende(o); }
              }}>
              <img src={f.src} alt="" loading={zichtbaar ? "eager" : "lazy"} decoding="async" draggable={false} />
              {/* De glans en het sterretje komen opnieuw bij elke binder die vooraan landt (key = wie vooraan staat). */}
              {o === 0 && <span key={`g${voor}`} className="waaier-glans" aria-hidden="true" />}
              {o === 0 && (
                <svg key={`s${voor}`} className="waaier-ster" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 1c.7 5.6 3.4 9.3 11 11-7.6 1.7-10.3 5.4-11 11-.7-5.6-3.4-9.3-11-11 7.6-1.7 10.3-5.4 11-11Z" />
                </svg>
              )}
            </a>
          );
        })}
      </div>
      {aantal > 1 && (
        <div className="waaier-bolletjes">
          {fotos.map((f, i) => (
            <button key={f.id} type="button" className={i === voor ? "aan" : ""} aria-label={`Binder ${i + 1} van ${aantal}`} aria-current={i === voor}
              onClick={() => { setZelf(true); naar(i); }} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Een soort uit ons aanbod: een paar beelden als een klein waaiertje, met de naam en hoeveel er zijn. */
function Vak({ plek, titel, tekst, beelden, reserve = [] }: { plek: Plek; titel: string; tekst: string; beelden: Stuk[]; reserve?: EtalageFoto[] }) {
  // Nog geen foto's bij onze binders: de binders van vooraan (uitgeknipt), anders de voorbeeldbinders.
  const voorbeeld = !beelden.length ? reserve : [];
  const n = beelden.length || voorbeeld.length;
  return (
    <a className={`vak ${plek}`} href={`#${plek}`}>
      <span className={`vak-beeld n${n}`} aria-hidden="true">
        {beelden.length ? beelden.map((b) => (
          <span key={b.id} className="vak-kaart">
            {plek === "kaarten" ? <Foto kaart={b} alt="" /> : <img src={b.foto!} alt="" loading="lazy" />}
          </span>
        )) : voorbeeld.length ? voorbeeld.map((v) => (
          <span key={v.id} className="vak-kaart kaal"><img src={v.src} alt="" loading="lazy" /></span>
        )) : <span className="vak-icoon">{ROUTES.find((r) => r.id === plek)?.icoon()}</span>}
      </span>
      <span className="vak-tekst"><strong>{titel}</strong><span>{tekst}</span></span>
      <span className="vak-pijl" aria-hidden="true"><PijlIcoon /></span>
    </a>
  );
}

/**
 * De sfeer van ons logo achter alles: belletjes die zacht zweven, sterretjes die om beurten oplichten (twee tegelijk)
 * en belletjes die verschijnen, wat opstijgen en ploppen. Met een thema (Halloween, kerst …) zweeft de versiering van
 * dat thema. Bij "minder beweging" staat alles stil (en ploppen er geen).
 */
function Sfeer({ soort }: { soort: ThemaSoort | null }) {
  const deco = soort ?? GEWOON;
  return (
    <div className="sfeer" aria-hidden="true">
      {deco.zweef.length
        ? Array.from({ length: 6 }, (_, i) => <VormSvg key={`z${i}`} vorm={VORMEN[deco.zweef[i % deco.zweef.length]]} className={`zweef b${i}`} />)
        : Array.from({ length: 6 }, (_, i) => <span key={`b${i}`} className={`belletje b${i}`} />)}
      {Array.from({ length: 10 }, (_, i) => <VormSvg key={`s${i}`} vorm={VORMEN[deco.fonkel[i % deco.fonkel.length]]} className={`sterretje s${i}`} />)}
      {deco.bellen && Array.from({ length: 6 }, (_, i) => (
        <span key={`p${i}`} className={`plop p${i}`}><span className="plop-bel" /><span className="plop-ring" /></span>
      ))}
    </div>
  );
}

const MAANDEN = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
const MAANDEN_LANG = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
const DAGEN = ["zo", "ma", "di", "wo", "do", "vr", "za"];
const DAGEN_LANG = ["zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"];
const dag = (iso: string) => new Date(iso + "T12:00:00");
function datumMooi(iso: string): string {
  const d = dag(iso);
  return `${DAGEN[d.getDay()]} ${d.getDate()} ${MAANDEN[d.getMonth()]}`;
}
/** "Vandaag", "Morgen", "Over 9 dagen", "Over 3 weken" */
function nogTe(iso: string): string {
  const n = Math.round((dag(iso).getTime() - dag(vandaagLokaal()).getTime()) / 86400000);
  if (n <= 0) return "Vandaag";
  if (n === 1) return "Morgen";
  if (n < 21) return `Over ${n} dagen`;
  return `Over ${Math.round(n / 7)} weken`;
}

/** Onze komende beurzen: de eerstvolgende groot als een ticket, de rest eronder. */
function Beurzen({ beurzen, ig, geladen }: { beurzen: KomendeBeurs[]; ig: string; geladen: boolean }) {
  const [eerste, ...rest] = beurzen;
  return (
    <section className="beurzen" id="beurzen" aria-labelledby="beurzen-titel">
      <h2 id="beurzen-titel">Kom langs op onze stand</h2>
      {!geladen ? null : !eerste ? (
        <p className="beurzen-leeg">We plannen onze volgende beurzen. Volg ons op <a href={igProfiel(ig)} target="_blank" rel="noreferrer">Instagram</a> om niets te missen.</p>
      ) : (
        <>
          <article className="ticket" aria-label={`${eerste.naam}, ${DAGEN_LANG[dag(eerste.datum).getDay()]} ${dag(eerste.datum).getDate()} ${MAANDEN_LANG[dag(eerste.datum).getMonth()]}`}>
            <div className="ticket-stomp">
              <span>{DAGEN[dag(eerste.datum).getDay()]}</span>
              <strong>{dag(eerste.datum).getDate()}</strong>
              <span>{MAANDEN[dag(eerste.datum).getMonth()]}</span>
            </div>
            <div className="ticket-lijf">
              <span className="ticket-nog">{nogTe(eerste.datum)}</span>
              <h3>{eerste.naam}</h3>
              {eerste.locatie && <p className="ticket-regel"><PinIcoon />{eerste.locatie}</p>}
              {eerste.uren && <p className="ticket-regel"><KlokIcoon />{eerste.uren}</p>}
              <div className="ticket-knoppen">
                {eerste.locatie && <a className="knop klein" href={routeLink(eerste.locatie)} target="_blank" rel="noreferrer">Route</a>}
                {veiligeLink(eerste.link) && <a className="knop klein doorzichtig" href={veiligeLink(eerste.link)!} target="_blank" rel="noreferrer">Website van de beurs</a>}
              </div>
            </div>
          </article>
          {rest.length > 0 && (
            <ol className="beurs-lijst">
              {rest.map((b) => {
                const link = veiligeLink(b.link);
                return (
                  <li key={b.datum + b.naam}>
                    <span className="beurs-datum"><strong>{dag(b.datum).getDate()}</strong><em>{MAANDEN[dag(b.datum).getMonth()]}</em></span>
                    <span className="beurs-tekst">
                      <strong>{b.naam}</strong>
                      {(b.locatie || b.uren) && <span>{[b.locatie, b.uren].filter(Boolean).join(", ")}</span>}
                    </span>
                    {link && <a className="beurs-link" href={link} target="_blank" rel="noreferrer" aria-label={`Website van ${b.naam}`}><LinkIcoon /></a>}
                  </li>
                );
              })}
            </ol>
          )}
        </>
      )}
    </section>
  );
}

// ── Kaarten ──────────────────────────────────────────────────────────────────

interface KaartFilter { cat: Cat; zoek: string; filters: Set<Snelfilter>; set: string; sort: Sortering }

function Kaarten({ data, stukken, sets, f, zetF, onOpen, onZoekFocus }: {
  data: Data | null; stukken: Stuk[]; sets: SetInfo | null; f: KaartFilter; zetF: (f: KaartFilter) => void;
  onOpen: (g: Groep<Stuk>) => void; onZoekFocus: (x: boolean) => void;
}) {
  const kaarten = useMemo(() => stukken.filter((s) => s.plek === "kaarten"), [stukken]);
  const zet = (w: Partial<KaartFilter>) => zetF({ ...f, ...w });
  const slabs = kaarten.filter((s) => s.soort === "slab").length;
  const nieuwAantal = useMemo(() => kaarten.filter((s) => isNieuw(s)).length, [kaarten]);

  // Sets die in de catalogus voorkomen, nieuwste eerst.
  const setLijst = useMemo(() => {
    const m = new Map<string, { id: string; naam: string; aantal: number; release: string }>();
    for (const s of kaarten) {
      const id = setIdVan(s);
      if (!id) continue;
      const x = m.get(id) ?? { id, naam: setNaam(id, s.set_naam, sets), aantal: 0, release: sets?.[id]?.[2] ?? "" };
      x.aantal++;
      m.set(id, x);
    }
    return [...m.values()].sort((a, b) => b.release.localeCompare(a.release) || a.naam.localeCompare(b.naam));
  }, [kaarten, sets]);

  const groepen = useMemo(() => {
    const woorden = zoekWoorden(f.zoek);
    const zichtbaar = kaarten.filter((s) =>
      (f.cat === "alles" || s.soort === f.cat) &&
      (!f.set || setIdVan(s) === f.set) &&
      pastFilters(s, f.filters) &&
      (!woorden.length || pastZoek(zoekTekst(s), woorden)));
    return sorteer(groepeer(zichtbaar, groepSleutel), f.sort, (x) => x.eerste, sets);
  }, [kaarten, f, sets]);

  const actief = f.filters.size + (f.set ? 1 : 0) + (f.zoek.trim() ? 1 : 0) + (f.cat !== "alles" ? 1 : 0);
  const wisAlles = () => zetF({ ...f, filters: new Set(), set: "", zoek: "", cat: "alles" });
  const wissel = (x: Snelfilter) => {
    const n = new Set(f.filters);
    if (n.has(x)) n.delete(x); else n.add(x);
    zet({ filters: n });
  };
  const tegels = (lijst: Groep<Stuk>[], start = 0) => lijst.map((g, i) => <KlantTegel key={g.sleutel} g={g} i={start + i} onOpen={() => onOpen(g)} />);
  const totaal = groepen.reduce((s, g) => s + aantalVan(g), 0);

  return (
    <>
      <header className="sectie-kop">
        <h1>Kaarten</h1>
        <p>Singles en slabs die je aan onze stand kunt kopen.</p>
        {nieuwAantal > 0 && (
          <button className="nieuw-knop" onClick={() => zet({ filters: new Set<Snelfilter>(["nieuw"]), sort: "nieuw" })}><Sparkel /> {nieuwAantal} nieuw binnen</button>
        )}
      </header>

      {!data ? <LaadRaster /> : (
        <>
          <div className="klant-zoekrij">
            <div className="zoekbalk">
              <ZoekIcoon />
              <input value={f.zoek} onChange={(e) => zet({ zoek: e.target.value })} placeholder="Zoek een kaart of set" inputMode="search" aria-label="Zoeken"
                onFocus={() => onZoekFocus(true)} onBlur={() => onZoekFocus(false)} />
              {f.zoek && <button className="wis" onClick={() => zet({ zoek: "" })} aria-label="Wissen">✕</button>}
            </div>
            <label className="sorteer" title="Sorteren">
              <SorteerIcoon />
              <span className="sorteer-tekst">{SORTERINGEN.find((x) => x.id === f.sort)?.label}</span>
              <select value={f.sort} onChange={(e) => zet({ sort: e.target.value as Sortering })} aria-label="Sorteren">
                {SORTERINGEN.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </label>
          </div>

          <div className="klant-filters">
            {slabs > 0 && slabs < kaarten.length && (
              <div className="categorieen" role="tablist" aria-label="Soort">
                {([["alles", "Alles", kaarten.length], ["kaart", "Singles", kaarten.length - slabs], ["slab", "Slabs", slabs]] as const).map(([id, label, n]) => (
                  <button key={id} role="tab" aria-selected={f.cat === id} className={f.cat === id ? "aan" : ""} onClick={() => zet({ cat: id })}>
                    {label}{id !== "alles" && <span>{n}</span>}
                  </button>
                ))}
              </div>
            )}
            <div className="chips" aria-label="Filters">
              {setLijst.length > 1 && (
                <SetKiezer sets={setLijst.map((x) => ({ ...x, logo: setLogo(x.id, sets?.[x.id]), code: sets?.[x.id]?.[1] || null, taal: setTaal(sets?.[x.id]), intl: sets?.[x.id]?.[5] || null, eigen: sets?.[x.id]?.[6] || null }))} gekozen={f.set} onKies={(set) => zet({ set })} />
              )}
              {SNELFILTERS.map((x) => (
                <button key={x.id} className={`chip schakelchip${f.filters.has(x.id) ? " aan" : ""}`} aria-pressed={f.filters.has(x.id)} onClick={() => wissel(x.id)}>
                  <span className="schakelbol" aria-hidden="true" />{x.label}
                </button>
              ))}
            </div>
            <div className="klant-resultaat">
              <span>{totaal} {totaal === 1 ? "kaart" : "kaarten"}, {SORTERINGEN.find((x) => x.id === f.sort)?.label.toLowerCase()}</span>
              {actief > 0 && <button className="tekstknop klein" onClick={wisAlles}>Wis filters</button>}
            </div>
          </div>

          {!groepen.length ? (
            <div className="klant-leeg">
              <img src={`${BASIS}img/eend.png`} alt="" width={96} height={96} />
              <p>{kaarten.length ? "Niets gevonden met deze filters. Haal er een weg:" : "Er staan nog geen kaarten online. Kom zeker eens kijken aan onze stand."}</p>
              {actief > 0 && (
                <div className="actieve-filters">
                  {f.zoek.trim() && <button className="chip aan" onClick={() => zet({ zoek: "" })}>"{f.zoek.trim()}" ✕</button>}
                  {f.cat !== "alles" && <button className="chip aan" onClick={() => zet({ cat: "alles" })}>{f.cat === "slab" ? "Slabs" : "Singles"} ✕</button>}
                  {f.set && <button className="chip aan" onClick={() => zet({ set: "" })}>{setLijst.find((x) => x.id === f.set)?.naam ?? f.set} ✕</button>}
                  {[...f.filters].map((x) => <button key={x} className="chip aan" onClick={() => wissel(x)}>{SNELFILTERS.find((y) => y.id === x)?.label} ✕</button>)}
                </div>
              )}
              {actief > 1 && <button className="knop zacht" onClick={wisAlles}>Wis alle filters</button>}
            </div>
          ) : f.sort === "set" ? (
            <div className="set-groepen">
              {(() => {
                let teller = 0;
                return perSet(groepen, (x) => x.eerste, sets).map((s) => {
                  const start = teller;
                  teller += s.items.length;
                  return (
                    <section key={s.set + start} className="set-groep">
                      <h2 className="set-kop"><span>{s.naam}</span><em>{s.items.reduce((n, g) => n + aantalVan(g), 0)}</em></h2>
                      <div className="raster">{tegels(s.items, start)}</div>
                    </section>
                  );
                });
              })()}
            </div>
          ) : (
            <div className="raster">{tegels(groepen)}</div>
          )}
        </>
      )}
    </>
  );
}

// ── Binders, 3D-prints en sealed ─────────────────────────────────────────────

const PLEK_TEKST: Record<Exclude<Plek, "kaarten">, { titel: string; uitleg: string; leeg: string }> = {
  binders: {
    titel: "Binders",
    uitleg: "Ontworpen en gelaserd door Bind'r. Elke gravure is handwerk: kleine verschillen tussen binders horen erbij. Ligt er één niet op de stand? Vraag ernaar, we hebben ze mee.",
    leeg: "Onze binders staan binnenkort online. Je ziet ze nu al aan onze stand en op Instagram.",
  },
  "3d": { titel: "3D-prints", uitleg: "Zelf geprint: standaards, deckboxen en andere handige spullen voor je kaarten.", leeg: "Er staan nog geen 3D-prints online. Kom kijken aan onze stand." },
  sealed: { titel: "Sealed", uitleg: "Boosters, displays en ander sealed product. Zolang de voorraad strekt.", leeg: "Er staat nog geen sealed online. Kom kijken aan onze stand." },
};

function Artikels({ plek, data, stukken, beurzen, sets, onOpen }: {
  plek: Exclude<Plek, "kaarten">; data: Data | null; stukken: Stuk[]; beurzen: KomendeBeurs[]; sets: SetInfo | null; onOpen: (g: Groep<Stuk>) => void;
}) {
  const t = PLEK_TEKST[plek];
  const groepen = useMemo(() => sorteer(
    groepeer(stukken.filter((s) => s.plek === plek), (s) => (s.bron === "artikel" ? `a|${s.id}` : groepSleutel(s))),
    "prijs-hoog", (x) => x.eerste, sets,
  ), [stukken, plek, sets]);
  return (
    <>
      <header className="sectie-kop">
        <h1>{t.titel}</h1>
        <p>{t.uitleg}</p>
      </header>
      {!data ? <LaadRaster /> : !groepen.length ? (
        <div className="klant-leeg">
          <img src={`${BASIS}img/eend.png`} alt="" width={96} height={96} />
          <p>{t.leeg}</p>
          {beurzen[0] && <p className="zacht">Volgende beurs: {beurzen[0].naam}, {datumMooi(beurzen[0].datum)}.</p>}
          <a className="knop zacht" href="#">Naar de start</a>
        </div>
      ) : plek === "binders" ? (
        <div className="binders-rij">
          {groepen.map((g, i) => {
            const s = g.eerste;
            return (
              <button key={g.sleutel} className="binder-kaart" style={{ ["--i" as string]: Math.min(i, 12) }} onClick={() => onOpen(g)}>
                <ArtikelBeeld s={s} />
                <span className="binder-tekst">
                  <strong>{s.binder?.artwork || s.naam}</strong>
                  {s.binder && binderTekst(s.binder) && <span>{binderTekst(s.binder)}</span>}
                </span>
                <span className="binder-onder">
                  <Prijs p={s.prijs} />
                  <em>{s.uitgestald === false ? "vraag ernaar" : `nog ${aantalVan(g)}`}</em>
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="raster">{groepen.map((g, i) => <KlantTegel key={g.sleutel} g={g} i={i} onOpen={() => onOpen(g)} />)}</div>
      )}
    </>
  );
}

function LaadRaster() {
  return (
    <div className="raster laad-raster" aria-label="Laden">
      {Array.from({ length: 6 }, (_, i) => <div key={i} className="tegel laad-tegel" style={{ ["--i" as string]: i }}><div className="foto" /><span /><span /></div>)}
    </div>
  );
}

// ── Tegels en detail ─────────────────────────────────────────────────────────

function KlantTegel({ g, i, onOpen }: { g: Groep<Stuk>; i: number; onOpen: () => void }) {
  const s = g.eerste;
  const n = aantalVan(g);
  const nieuw = isNieuw(s);
  const slab = s.bron === "kaart" && s.soort === "slab";
  const holo = s.bron === "kaart" && s.prijs >= 50 && !slab;
  const onder = s.bron === "artikel"
    ? (s.type === "sealed" ? "Sealed" : s.type === "3d-print" ? "3D-print" : s.binder ? binderTekst(s.binder) || "Bind'r-binder" : s.soort === "eigen product" ? "Bind'r" : "")
    : [s.set_code, s.nummer].filter(Boolean).join(" ") || (s.soort === "eigen product" ? "Bind'r" : "");
  return (
    <button className={`tegel${holo ? " holo" : ""}${slab ? " slab" : ""}${s.bron === "artikel" ? " artikel-tegel" : ""}`} style={{ ["--i" as string]: Math.min(i, 24) }} onClick={onOpen} {...kantel}
      aria-label={`${s.naam}, ${euro(s.prijs)}${n > 1 ? `, ${n} stuks` : ""}`}>
      {s.bron === "artikel" || s.soort === "eigen product"
        ? <ArtikelBeeld s={s} />
        : s.soort === "slab"
          ? <div className="slab-hoes"><span className="slab-label"><b>{s.grader || "Graded"}</b><em>{s.grade}</em></span><Foto kaart={s} alt={s.naam} /></div>
          : <Foto kaart={s} alt={s.naam} />}
      {s.bron === "artikel" && !s.uitgestald && <span className="vraag-merk">Vraag ernaar</span>}
      {n > 1 && <span className="aantal-merk" aria-hidden="true">×{n}</span>}
      {nieuw && <span className="nieuw-merk">Nieuw</span>}
      <div className="tegel-info">
        <div className="tegel-naam">{s.naam}</div>
        <div className="tegel-set">{onder}</div>
        <div className="tegel-onder">
          <span className="badges">
            {s.bron === "kaart" && (s.soort === "slab" ? <span className="badge">{[s.grader, s.grade].filter(Boolean).join(" ") || "Graded"}</span> : s.conditie && <span className="badge">{s.conditie}</span>)}
            {s.bron === "kaart" && s.taal !== "EN" && s.soort !== "eigen product" && <span className="badge taal">{s.taal.startsWith("CN") ? "CN" : s.taal}</span>}
            {s.variant === "reverse holo" && <span className="badge">RH</span>}
          </span>
          <Prijs p={s.prijs} />
        </div>
      </div>
    </button>
  );
}

/** Een artikel: de eigen foto, of anders een vlak met de B van Bind'r of een sterretje voor sealed. */
function ArtikelBeeld({ s }: { s: Stuk }) {
  const bindr = s.soort === "eigen product";
  return (
    <div className={`artikel-vlak ${bindr ? "bindr" : "sealed"}${s.foto ? " met-foto" : ""}`}>
      {s.foto ? <img src={s.foto} alt={s.naam} loading="lazy" /> : <span className="artikel-glyph">{bindr ? "B" : "✦"}</span>}
      <span className="glans" />
    </div>
  );
}

/** Kaartfoto met reservebronnen (TCGdex, dan Limitless, dan pokemontcg.io). */
function Foto({ kaart, alt, groot = false }: { kaart: FotoKaart; alt: string; groot?: boolean }) {
  const bronnen = useMemo(() => fotoBronnen(kaart, groot ? "groot" : "klein"), [kaart.afbeelding, kaart.set_code, kaart.nummer, kaart.kaart_id, kaart.foto, kaart.taal, groot]);
  const [i, setI] = useState(0);
  useEffect(() => setI(0), [bronnen]);
  const bron = bronnen[i];
  return (
    <div className="foto">
      {bron && <img key={bron} src={bron} alt={alt} loading="lazy" decoding="async" onLoad={(e) => e.currentTarget.classList.add("geladen")} onError={() => setI((x) => x + 1)} />}
      <span className="foto-reserve">{alt.slice(0, 1)}</span>
      <span className="glans" />
    </div>
  );
}

/** De extra foto's van een artikel (na de hoofdfoto). */
async function artikelFotos(id: string, demo: boolean): Promise<string[]> {
  if (demo) {
    try {
      const d = JSON.parse(localStorage.getItem("bindr-demo-v1") || "{}") as { artikelfotos?: { artikel_id: string; foto: string; volgorde: number }[] };
      return (d.artikelfotos ?? []).filter((f) => f.artikel_id === id).sort((a, b) => a.volgorde - b.volgorde).map((f) => veiligeFoto(f.foto)).filter((x): x is string => !!x);
    } catch { return []; }
  }
  return haal<{ foto: string | null }[]>(`publieke_artikelfotos?select=foto&artikel_id=eq.${encodeURIComponent(id)}&order=volgorde.asc`)
    .then((r) => r.map((x) => veiligeFoto(x.foto)).filter((x): x is string => !!x)).catch(() => []);
}

function Detail({ g, beurzen, sets, demo, onSluit }: { g: Groep<Stuk>; beurzen: KomendeBeurs[]; sets: SetInfo | null; demo: boolean; onSluit: () => void }) {
  const eerste = g.eerste;
  const n = aantalVan(g);
  const [groot, setGroot] = useState(false);
  // Artikels kunnen meer foto's hebben: duimpjes onder de grote foto.
  const [extra, setExtra] = useState<string[]>([]);
  const [gekozen, setGekozen] = useState<string | null>(null);
  useEffect(() => {
    setExtra([]); setGekozen(null);
    if (eerste.bron !== "artikel") return;
    let weg = false;
    void artikelFotos(eerste.id, demo).then((f) => { if (!weg) setExtra(f); });
    return () => { weg = true; };
  }, [eerste.id, eerste.bron, demo]);
  const fotos = eerste.bron === "artikel" ? [eerste.foto, ...extra].filter((x): x is string => !!x) : [];
  const s: Stuk = gekozen ? { ...eerste, foto: gekozen } : eerste;
  const grootRef = useRef(groot);
  grootRef.current = groot;
  // Tikken (niet draaien) op de foto toont ze over het hele scherm.
  const tik = useRef<{ x: number; y: number; t: number } | null>(null);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { if (grootRef.current) setGroot(false); else onSluit(); } };
    window.addEventListener("keydown", esc);
    document.body.classList.add("geen-scroll");
    return () => { window.removeEventListener("keydown", esc); document.body.classList.remove("geen-scroll"); };
  }, [onSluit]);
  const vergroot = {
    role: "button", tabIndex: 0, "aria-label": `${s.naam} in het groot`,
    onPointerDown: (e: WijsEvent) => { tik.current = { x: e.clientX, y: e.clientY, t: Date.now() }; },
    onPointerUp: (e: WijsEvent) => { const t0 = tik.current; tik.current = null; if (t0 && Math.hypot(e.clientX - t0.x, e.clientY - t0.y) < 10 && Date.now() - t0.t < 500) setGroot(true); },
    onKeyDown: (e: ToetsEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setGroot(true); } },
  } as const;
  const beeld = () => (s.bron === "kaart" && s.soort !== "eigen product"
    ? s.soort === "slab"
      ? <div className="slab-hoes groot"><span className="slab-label"><b>{s.grader || "Graded"}</b><em>{s.grade}</em></span><Foto kaart={s} alt={s.naam} groot /></div>
      : <Foto kaart={s} alt={s.naam} groot />
    : <ArtikelBeeld s={s} />);
  return (
    <div className="sheet-achtergrond" onClick={(e) => e.target === e.currentTarget && onSluit()}>
      <div className="sheet klant-sheet" role="dialog" aria-modal="true" aria-label={s.naam}>
        <div className="sheet-greep" />
        <div className="sheet-kop">
          <div className="sheet-titel">{s.naam}</div>
          <button className="rond-knop" onClick={onSluit} aria-label="Sluiten">✕</button>
        </div>
        <div className="sheet-inhoud">
          <div className="klant-detail">
            <div className="klant-detail-links">
              <div className={`klant-detail-foto zweeft${s.bron === "kaart" && s.prijs >= 50 && s.soort === "kaart" ? " holo" : ""}`} {...vergroot}>
                <div className="kantel-vlak" {...kantelVrij}>{beeld()}</div>
              </div>
              {fotos.length > 1 && (
                <div className="detail-duimen" role="group" aria-label="Foto's">
                  {fotos.map((f, i) => (
                    <button key={i} type="button" className={(gekozen ?? fotos[0]) === f ? "aan" : ""} aria-pressed={(gekozen ?? fotos[0]) === f}
                      aria-label={`Foto ${i + 1} van ${fotos.length}`} onClick={() => setGekozen(i === 0 ? null : f)}>
                      <img src={f} alt="" loading="lazy" />
                    </button>
                  ))}
                </div>
              )}
              <span className="vergroot-hint">Tik op de foto om ze groter te zien</span>
            </div>
            <div className="klant-detail-rechts">
              <div className="detail-prijsrij">
                {n > 1 && <span className="aantal-label">{n} beschikbaar</span>}
                {isNieuw(s) && <span className="nieuw-label">Nieuw binnen</span>}
              </div>
              {s.naam_origineel && <p className="naam-origineel">{s.naam_origineel}</p>}
              <dl className="gegevens">
                {s.bron === "artikel" ? (
                  <>
                    <dt>Soort</dt><dd>{s.binder ? "Bind'r-binder" : s.type === "3d-print" ? "3D-print van Bind'r" : s.type === "sealed" ? "Sealed" : s.soort === "eigen product" ? "Bind'r-product" : "Artikel"}</dd>
                    {s.binder?.artwork && <><dt>Artwork</dt><dd>{s.binder.artwork}</dd></>}
                    {s.binder?.techniek && <><dt>Techniek</dt><dd>{TECHNIEK_NAAM[s.binder.techniek] ?? s.binder.techniek}</dd></>}
                    {s.binder?.grootte && <><dt>Grootte</dt><dd>{s.binder.grootte}{s.binder.toploader ? ", voor toploaders" : ""}</dd></>}
                    {s.binder?.merk && <><dt>Binder</dt><dd>{s.binder.merk}</dd></>}
                    <dt>Beschikbaar</dt><dd>{n > 5 ? "ja" : `nog ${n}`}{s.uitgestald === false ? " (niet uitgestald: vraag ernaar aan onze stand)" : ""}</dd>
                    {s.binder?.techniek === "laser" && <><dt>Gravure</dt><dd className="zacht">Handwerk: kleur en diepte kunnen licht verschillen van de foto.</dd></>}
                  </>
                ) : s.soort === "eigen product" ? (
                  <><dt>Soort</dt><dd>Bind'r-product</dd><dt>Beschikbaar</dt><dd>{n > 1 ? `nog ${n}` : "één stuk"}</dd></>
                ) : (
                  <>
                    {(s.set_naam || s.set_code) && <><dt>Set</dt><dd>{setNaam(setIdVan(s), s.set_naam, sets)}{sets?.[setIdVan(s)]?.[5] ? <span className="zacht"> (≈ {sets[setIdVan(s)][5]})</span> : null}</dd></>}
                    {(s.set_code || s.nummer) && <><dt>Nummer</dt><dd>{[s.set_code, s.nummer].filter(Boolean).join(" ")}</dd></>}
                    {s.soort === "slab" ? <><dt>Grade</dt><dd>{[s.grader, s.grade].filter(Boolean).join(" ")}</dd></> : s.conditie && <><dt>Conditie</dt><dd>{CONDITIE[s.conditie] ?? s.conditie}</dd></>}
                    <dt>Taal</dt><dd>{taalNaam(s.taal)}</dd>
                    {s.variant && s.variant !== "normaal" && <><dt>Variant</dt><dd>{s.variant}</dd></>}
                  </>
                )}
              </dl>
            </div>
          </div>
        </div>
        <div className="klant-detail-balk">
          <Prijs p={s.prijs} groot />
          <div className="detail-stand">
            <strong>Interesse? Vraag ernaar aan onze stand.</strong>
            <span>{beurzen.length
              ? beurzen[0].datum === vandaagLokaal()
                ? <>Vandaag op {beurzen[0].naam}{beurzen[0].locatie ? `, ${beurzen[0].locatie}` : ""}</>
                : <>Volgende beurs: {beurzen[0].naam}, {datumMooi(beurzen[0].datum)}</>
              : "Je vindt ons op de komende beurzen."}</span>
          </div>
        </div>
      </div>
      {groot && (
        <div className="kaart-groot" role="dialog" aria-modal="true" aria-label={s.naam} onClick={() => setGroot(false)}>
          <button className="rond-knop kaart-groot-sluit" onClick={() => setGroot(false)} aria-label="Sluiten" autoFocus>✕</button>
          <div className="kaart-groot-kaart">{beeld()}</div>
          <div className="kaart-groot-tekst"><strong>{s.naam}</strong>{s.bron === "kaart" && s.soort !== "eigen product" && <span>{[s.set_code, s.nummer].filter(Boolean).join(" ")}</span>}</div>
        </div>
      )}
    </div>
  );
}

function Prijs({ p, groot = false }: { p: number; groot?: boolean }) {
  return (
    <span className={`hartje${groot ? " groot" : ""}`}>
      <svg width={groot ? 18 : 13} height={groot ? 18 : 13} viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" /></svg>
      {euro(p)}
    </span>
  );
}

// ── Onderaan: Instagram en het logo ──────────────────────────────────────────

function Voet({ ig, fb, b, logo }: { ig: string; fb: string | null; b: BedrijfPubliek | null; logo: string | null }) {
  const kbo = kboMooi(b?.kbo);
  return (
    <footer className="klant-voet">
      <div className="sociaal">
        <a className="sociaal-knop" href={igProfiel(ig)} target="_blank" rel="noreferrer"><IgIcoon /> <span>Instagram<em>@{ig}</em></span></a>
        {fb && <a className="sociaal-knop" href={fb} target="_blank" rel="noreferrer"><FbIcoon /> <span>Facebook<em>Bind'r</em></span></a>}
      </div>
      <p className="sociaal-tekst">Onze nieuwste binders, lasergravures en kaarten, en waar we binnenkort staan.</p>
      <img src={logo ?? `${BASIS}img/logo-woord.png`} alt="Bind'r" className="voet-logo" width={120} height={53} />
      <p>Collectibles, crafts en 3D-prints</p>
      <div className="voet-wettelijk">
        <p>
          <strong>{b?.handelsnaam || "Bind'r"}</strong>{b?.naam ? ` · ${b.naam}` : ""}{b?.adres ? ` · ${b.adres}` : ""}
          {b?.email ? <> · <a href={`mailto:${b.email}`}>{b.email}</a></> : null}{b?.telefoon ? ` · ${b.telefoon}` : ""}
        </p>
        {kbo && <p>Ondernemingsnummer {kbo} · btw BE {kbo}</p>}
        {b?.vrijstelling !== false && <p>Bijzondere vrijstellingsregeling kleine ondernemingen: we rekenen geen btw aan. Alle prijzen zijn eindprijzen in euro, zolang de voorraad strekt.</p>}
      </div>
      <nav className="voet-links" aria-label="Over deze site">
        <a href="#privacy">Privacy en cookies</a>
        <a href="#voorwaarden">Verkoopvoorwaarden</a>
        <a className="voet-beheer" href={`${BASIS}beheer.html`}>Beheer</a>
      </nav>
    </footer>
  );
}

const EEND_SLEUTEL = "bindr-eend-v1";

function Eend({ ig, verborgen }: { ig: string; verborgen: boolean }) {
  const [toon, setToon] = useState(false);
  const [open, setOpen] = useState(true);
  const [weg, setWeg] = useState(() => {
    try {
      const t = Number(localStorage.getItem(EEND_SLEUTEL) || 0);
      return Date.now() - t < 3 * 86400000;
    } catch { return false; }
  });
  // Pas als de voet (Instagram) in beeld komt, of na 25 seconden rondkijken.
  useEffect(() => {
    if (weg) return;
    const timer = setTimeout(() => setToon(true), 25000);
    const voet = document.querySelector(".klant-voet");
    const kijker = voet && "IntersectionObserver" in window
      ? new IntersectionObserver((e) => { if (e.some((x) => x.isIntersecting)) setToon(true); }, { rootMargin: "0px 0px 200px 0px" })
      : null;
    if (voet && kijker) kijker.observe(voet);
    return () => { clearTimeout(timer); kijker?.disconnect(); };
  }, [weg]);
  // Na 7 seconden klapt de ballon dicht: enkel de eend blijft, een tik opent hem opnieuw.
  useEffect(() => {
    if (!toon || !open) return;
    const t = setTimeout(() => setOpen(false), 7000);
    return () => clearTimeout(t);
  }, [toon, open]);
  if (weg || !toon || verborgen) return null;
  const sluit = () => {
    try { localStorage.setItem(EEND_SLEUTEL, String(Date.now())); } catch { /* privé-modus */ }
    setWeg(true);
  };
  return (
    <aside className={`eend-popup${open ? "" : " dicht"}`} aria-label="Instagram">
      {open && (
        <>
          <a className="eend-ballon" href={igProfiel(ig)} target="_blank" rel="noreferrer" onClick={sluit}>
            Heb je onze recente binders al gezien?
            <span>Kijk op Instagram <IgIcoon maat={14} /></span>
          </a>
          <button className="eend-sluit" onClick={sluit} aria-label="Sluiten">✕</button>
        </>
      )}
      <button className="eend-knop" onClick={() => setOpen(!open)} aria-label={open ? "Ballon dichtklappen" : "Wat zegt de eend?"}>
        <img className="eend-beeld" src={`${BASIS}img/eend.png`} alt="" width={96} height={96} />
      </button>
    </aside>
  );
}

// ── Kleine iconen ────────────────────────────────────────────────────────────

function Svg({ maat = 20, children }: { maat?: number; children: ReactNode }) {
  return <svg width={maat} height={maat} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>;
}
const FbIcoon = ({ maat = 20 }: { maat?: number }) => <Svg maat={maat}><rect x="3.5" y="3.5" width="17" height="17" rx="5" /><path d="M15.5 8.5h-1.6a2 2 0 0 0-2 2v10M9.5 13h5" /></Svg>;
const IgIcoon = ({ maat = 20 }: { maat?: number }) => <Svg maat={maat}><rect x="3.5" y="3.5" width="17" height="17" rx="5" /><circle cx="12" cy="12" r="4" /><path d="M17 7h.01" /></Svg>;
const ZoekIcoon = () => <Svg maat={18}><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></Svg>;
const SorteerIcoon = () => <Svg maat={18}><path d="M7 4v16M3.5 16.5 7 20l3.5-3.5M17 20V4M13.5 7.5 17 4l3.5 3.5" /></Svg>;
const PinIcoon = () => <Svg maat={16}><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" /><circle cx="12" cy="10" r="2.4" /></Svg>;
const KlokIcoon = () => <Svg maat={16}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></Svg>;
const LinkIcoon = () => <Svg maat={18}><path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1" /><path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" /></Svg>;
// Navigatie: start (het hartje uit de B van het logo), kaarten, een binder met stiksel, een kubus, een boosterpack.
const StartIcoon = () => <Svg maat={22}><path d="M12 19.5s-7-4.3-7-9.6A3.9 3.9 0 0 1 12 7.6a3.9 3.9 0 0 1 7 2.3c0 5.3-7 9.6-7 9.6Z" /></Svg>;
const KaartenIcoon = () => <Svg maat={22}><rect x="7.5" y="4" width="11" height="15" rx="1.8" transform="rotate(10 13 11.5)" /><rect x="4.5" y="5" width="11" height="15" rx="1.8" /></Svg>;
const BinderIcoon = () => <Svg maat={22}><rect x="5" y="3.5" width="14" height="17" rx="2.2" /><path d="M8.5 3.5v17" /><path d="M11.5 7h4.5M11.5 7v10M16 7v10M11.5 17h4.5" strokeDasharray="1.6 1.8" /></Svg>;
const KubusIcoon = () => <Svg maat={22}><path d="M12 3.5 19.5 7.6v8.8L12 20.5l-7.5-4.1V7.6Z" /><path d="M4.5 7.6 12 11.7l7.5-4.1M12 11.7v8.8" /></Svg>;
const PackIcoon = () => <Svg maat={22}><path d="M6 3.5h12l-.9 1.5.9 1.5v11l-.9 1.5.9 1.5H6l.9-1.5L6 17.5v-11L6.9 5Z" /><path d="M9.5 12h5" /></Svg>;
const OntwerpIcoon = ({ maat = 22 }: { maat?: number }) => <Svg maat={maat}><path d="m14.5 5.5 4 4L9 19H5v-4Z" /><path d="m12.5 7.5 4 4" /></Svg>;
const LaserIcoon = () => <Svg maat={22}><path d="M9 3.5h6v5H9Z" /><path d="M12 8.5v6" /><path d="M8.5 17.5 12 14.5l3.5 3M6 20.5h12" /></Svg>;
const PauzeIcoon = () => <Svg maat={16}><path d="M9 6v12M15 6v12" strokeWidth={2.4} /></Svg>;
const SpeelIcoon = () => <Svg maat={16}><path d="M8 5.5v13l10-6.5Z" fill="currentColor" /></Svg>;
const PijlIcoon = () => <Svg maat={18}><path d="M5 12h13M13 6l6 6-6 6" /></Svg>;
const StandIcoon = () => <Svg maat={22}><path d="M3.5 9.5 6 4.5h12l2.5 5" /><path d="M3.5 9.5a2.8 2.8 0 0 0 5.67 0 2.8 2.8 0 0 0 5.66 0 2.8 2.8 0 0 0 5.67 0" /><path d="M5 12v8h14v-8" /></Svg>;
const Sparkel = () => <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2c.6 4.6 2.4 7.4 10 10-7.6 2.6-9.4 5.4-10 10-.6-4.6-2.4-7.4-10-10 7.6-2.6 9.4-5.4 10-10Z" /></svg>;

// Een link uit een herstelmail (wachtwoord vergeten) die hier landt, hoort bij het beheer.
// (ook een verlopen link: #error=…&error_code=otp_expired, dan legt het beheer het uit).
if ((/type=recovery/.test(location.hash) && /access_token=/.test(location.hash)) || /error_code=otp_expired/.test(location.hash)) location.replace(BEHEER_PAD + location.hash);
else createRoot(document.getElementById("app")!).render(<KlantPagina />);
