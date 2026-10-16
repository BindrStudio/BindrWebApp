// De klantencatalogus: een aparte, publieke pagina zonder login en zonder beheerfuncties.
// Ze toont enkel wat in de catalogus (vitrine) ligt, via de publieke weergaven in Supabase.
// Niets uit de beheer-app wordt hier geladen, enkel config, types en kleine hulpfuncties.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { INSTAGRAM, SUPABASE_KEY, SUPABASE_URL } from "../config";

// De pagina staat op de hoofdlink (index.html) en, voor oude links, op /catalogus/.
// Afbeeldingen en gegevens zoeken we relatief aan dit script (catalogus/app.js).
const BASIS = new URL("../", import.meta.url).href;
import { TALEN } from "../types";
import { euro, vandaag as vandaagLokaal } from "../lib/format";
import { kantel, kantelVrij } from "../lib/kantel";
import { veiligeFoto } from "../lib/eigenfoto";
import { TECHNIEKEN } from "../lib/categorie";
import { fotoBronnen, setLogo, type FotoKaart } from "../lib/foto";
import { SetKiezer } from "../gedeeld/SetKiezer";
import {
  groepeer, groepSleutel, isNieuw, pastFilters, pastZoek, perSet, SNELFILTERS, SORTERINGEN, setIdVan, setNaam, setTaal, sorteer, zoekTekst, zoekWoorden,
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

/** Eén ding in de catalogus: een kaart (één exemplaar) of een artikel (met een aantal). */
interface Stuk extends Toonbaar {
  id: string;
  bron: "kaart" | "artikel";
  afbeelding: string | null;
  aantal: number;
  catalogus?: "en" | "asia" | null;
  foto?: string | null;                 // eigen foto (artikel, of een kaart zonder foto)
  binder?: Pick<ArtikelRij, "merk" | "grootte" | "toploader" | "techniek" | "artwork"> | null;
  uitgestald?: boolean;                 // artikel ligt op de stand (binders in de vault: "vraag ernaar")
}

interface KomendeBeurs { naam: string; datum: string; locatie: string | null }

type Cat = "alles" | "singles" | "slabs" | "sealed" | "bindr";
const CATS: { id: Cat; label: string }[] = [
  { id: "alles", label: "Alles" }, { id: "singles", label: "Singles" }, { id: "slabs", label: "Slabs" },
  { id: "sealed", label: "Sealed" }, { id: "bindr", label: "Bind'r" },
];
const catVan = (s: Stuk): Cat => (s.bron === "artikel"
  ? (s.soort === "eigen product" ? "bindr" : "sealed")
  : s.soort === "slab" ? "slabs" : s.soort === "eigen product" ? "bindr" : "singles");

const CONDITIE: Record<string, string> = { M: "Mint", NM: "Near Mint", EX: "Excellent", GD: "Good", LP: "Light Played", PL: "Played", PO: "Poor" };
const taalNaam = (t: string) => TALEN.find((x) => x.code === t)?.label ?? t;

function vanKaart(k: VitrineRij): Stuk {
  return {
    id: k.code, bron: "kaart", kaart_id: k.kaart_id, soort: k.soort, naam: k.naam, naam_origineel: k.naam_origineel,
    set_naam: k.set_naam, set_code: k.set_code, nummer: k.nummer, taal: k.taal, conditie: k.conditie, variant: k.variant || "normaal",
    grader: k.grader, grade: k.grade, prijs: Number(k.prijs), toegevoegd: k.toegevoegd ?? k.sinds, afbeelding: k.afbeelding, aantal: 1,
    catalogus: k.catalogus ?? null, foto: veiligeFoto(k.foto),
  };
}
function vanArtikel(a: ArtikelRij): Stuk {
  const binder = a.type === "binder" || (!a.type && a.soort === "eigen product" && /binder/i.test(a.naam));
  return {
    id: a.id, bron: "artikel", kaart_id: null, soort: a.soort === "eigen product" ? "eigen product" : "sealed", naam: a.naam,
    set_naam: null, set_code: null, nummer: null, taal: "", conditie: null, variant: "normaal", grader: null, grade: null,
    prijs: Number(a.prijs), toegevoegd: null, afbeelding: null, aantal: a.aantal, foto: veiligeFoto(a.foto),
    binder: binder ? { merk: a.merk ?? null, grootte: a.grootte ?? null, toploader: a.toploader ?? null, techniek: a.techniek ?? null, artwork: a.artwork ?? null } : null,
    uitgestald: a.uitgestald ?? true,
  };
}

const TECHNIEK_NAAM: Record<string, string> = Object.fromEntries(TECHNIEKEN.map((t) => [t.id, t.label]));
/** "9-pocket · toploader · lasergravure" */
function binderTekst(b: NonNullable<Stuk["binder"]>, metArtwork = false): string {
  return [metArtwork ? b.artwork : null, b.grootte, b.toploader ? "toploader" : null, b.techniek ? TECHNIEK_NAAM[b.techniek]?.toLowerCase() : null].filter(Boolean).join(" · ");
}

async function haal<T>(pad: string): Promise<T> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${pad}`, { headers: { apikey: SUPABASE_KEY } });
  if (!r.ok) throw new Error(String(r.status));
  return r.json() as Promise<T>;
}

interface Data { stukken: Stuk[]; instagram: string; beurzen: KomendeBeurs[] }

/** Met ?demo=1 toont de pagina de demo van dit toestel (om te kijken hoe klanten het zien). */
function laadDemo(): Data | null {
  if (!new URLSearchParams(location.search).has("demo")) return null;
  try {
    const d = JSON.parse(localStorage.getItem("bindr-demo-v1") || "null");
    if (!d) return { stukken: [], instagram: INSTAGRAM, beurzen: [] };
    // Zoals de publieke weergaven: enkel aangevinkte omgevingen, geen kaarten waarvan het hartje moet wisselen of het label nog niet hangt.
    const zichtbaar = new Set(((d.omgevingen ?? []) as { id: string; zichtbaar_voor_klanten: boolean }[]).filter((o) => o.zichtbaar_voor_klanten).map((o) => o.id));
    const toon = (r: { omgeving_id?: string | null }) => !zichtbaar.size || !r.omgeving_id || zichtbaar.has(r.omgeving_id);
    type DemoEx = VitrineRij & { opslag: string; status: string; hartjesprijs: number | null; hartjesdatum: string | null; vitrine_sinds?: string | null; nieuw_hartje?: number | null; omgeving_id?: string | null; label_status?: string };
    const kaarten = (d.exemplaren as DemoEx[])
      .filter((e) => e.opslag === "vitrine" && e.status === "in voorraad" && e.hartjesprijs != null && e.nieuw_hartje == null && e.label_status === "gestickerd" && toon(e))
      .map((e) => vanKaart({ ...e, prijs: e.hartjesprijs!, sinds: e.hartjesdatum, toegevoegd: e.vitrine_sinds ?? e.hartjesdatum }));
    type DemoArt = ArtikelRij & { opslag: string; omgeving_id?: string | null; details?: Record<string, unknown> | null };
    const artikelen = (d.artikelen as DemoArt[])
      .filter((a) => (a.opslag === "vitrine" || a.details?.type === "binder") && a.aantal > 0 && a.prijs != null && toon(a))
      .map((a) => vanArtikel({ ...a, ...(a.details ?? {}), uitgestald: a.opslag === "vitrine" } as ArtikelRij));
    const ig = d.instellingen?.instagram;
    const vandaag = vandaagLokaal();
    const beurzen = ((d.beurzen ?? []) as (KomendeBeurs & { status: string; omgeving_id?: string | null })[])
      .filter((b) => (b.status === "gepland" || b.status === "actief") && b.datum >= vandaag && toon(b))
      .map((b) => ({ naam: b.naam, datum: b.datum, locatie: b.locatie ?? null }))
      .sort((a, b) => a.datum.localeCompare(b.datum));
    return { stukken: [...kaarten, ...artikelen], instagram: typeof ig === "string" && ig ? ig : INSTAGRAM, beurzen };
  } catch {
    return null;
  }
}

const aantalVan = (g: Groep<Stuk>) => g.items.reduce((s, x) => s + x.aantal, 0);
const igProfiel = (ig: string) => `https://www.instagram.com/${encodeURIComponent(ig)}/`;

// ── De pagina ────────────────────────────────────────────────────────────────

function Catalogus() {
  const [data, setData] = useState<Data | null>(null);
  const [sets, setSets] = useState<SetInfo | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [cat, setCat] = useState<Cat>("alles");
  const [zoek, setZoek] = useState("");
  const [filters, setFilters] = useState<Set<Snelfilter>>(new Set());
  const [set, setSet] = useState("");
  const [sort, setSort] = useState<Sortering>("nieuw");
  const [open, setOpen] = useState<Groep<Stuk> | null>(null);
  const demo = useMemo(laadDemo, []);
  const lijstRef = useRef<HTMLDivElement>(null);
  const [zoekFocus, setZoekFocus] = useState(false);

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
    ]).then(([kaarten, artikelen, inst, beurzen]) => {
      const ig = inst.find((x) => x.sleutel === "instagram")?.waarde;
      setData({ stukken: [...kaarten.map(vanKaart), ...artikelen.map(vanArtikel)], instagram: typeof ig === "string" && ig ? ig : INSTAGRAM, beurzen });
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
    }).catch(() => setFout("De catalogus kon niet geladen worden. Probeer het straks opnieuw."));
  }, [demo]);

  const stukken = data?.stukken ?? [];
  const ig = data?.instagram ?? INSTAGRAM;
  const beurzen = data?.beurzen ?? [];

  const telling = useMemo(() => {
    const t: Partial<Record<Cat, number>> = {};
    for (const s of stukken) t[catVan(s)] = (t[catVan(s)] ?? 0) + s.aantal;
    return t;
  }, [stukken]);
  const nieuwAantal = useMemo(() => stukken.filter((s) => isNieuw(s)).length, [stukken]);
  // Drie mooie kaarten voor de waaier in het welkomstblok (de duurste met een foto).
  const waaier = useMemo(() => stukken.filter((s) => s.bron === "kaart" && s.afbeelding && s.soort === "kaart")
    .sort((a, b) => b.prijs - a.prijs).slice(0, 3), [stukken]);

  // Sets die in de catalogus voorkomen, nieuwste eerst.
  const setLijst = useMemo(() => {
    const m = new Map<string, { id: string; naam: string; aantal: number; release: string }>();
    for (const s of stukken) {
      if (s.bron !== "kaart" || s.soort === "eigen product") continue;
      const id = setIdVan(s);
      if (!id) continue;
      const x = m.get(id) ?? { id, naam: setNaam(id, s.set_naam, sets), aantal: 0, release: sets?.[id]?.[2] ?? "" };
      x.aantal++;
      m.set(id, x);
    }
    return [...m.values()].sort((a, b) => b.release.localeCompare(a.release) || a.naam.localeCompare(b.naam));
  }, [stukken, sets]);

  // Binders apart en groot bovenaan (bij "Alles" en "Bind'r", zonder zoeken of filters); dan niet nog eens in het raster.
  const binderVitrine = (cat === "alles" || cat === "bindr") && !zoek.trim() && !filters.size && !set;
  const groepen = useMemo(() => {
    const woorden = zoekWoorden(zoek);
    const zichtbaar = stukken.filter((s) =>
      !(binderVitrine && s.binder) &&
      (cat === "alles" || catVan(s) === cat) &&
      (!set || setIdVan(s) === set) &&
      pastFilters(s, filters) &&
      (!woorden.length || pastZoek(zoekTekst(s), woorden)));
    const g = groepeer(zichtbaar, (s) => (s.bron === "artikel" ? `a|${s.id}` : groepSleutel(s)));
    return sorteer(g, sort, (x) => x.eerste, sets);
  }, [stukken, cat, set, filters, zoek, sort, sets, binderVitrine]);

  const actief = filters.size + (set ? 1 : 0) + (zoek.trim() ? 1 : 0) + (cat !== "alles" ? 1 : 0);
  const binderGroepen = useMemo(() => (binderVitrine ? groepeer(stukken.filter((s) => s.binder), (s) => `a|${s.id}`) : []), [stukken, binderVitrine]);
  const wisAlles = () => { setFilters(new Set()); setSet(""); setZoek(""); setCat("alles"); };
  const wissel = (f: Snelfilter) => {
    const n = new Set(filters);
    if (n.has(f)) n.delete(f); else n.add(f);
    setFilters(n);
  };
  const naarLijst = () => lijstRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  const tegels = (lijst: Groep<Stuk>[], start = 0) => lijst.map((g, i) => (
    <KlantTegel key={g.sleutel} g={g} i={start + i} onOpen={() => setOpen(g)} />
  ));

  return (
    <div className={`klant${balkWeg ? " balk-weg" : ""}`}>
      <header className="klant-balk">
        <a href="#" className="klant-merk" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: "smooth" }); }} aria-label="Bind'r, naar boven">
          <img src={`${BASIS}img/logo-woord.png`} alt="Bind'r" width={150} height={66} />
        </a>
        <div className="klant-balk-rechts">
          <a className="klant-ig-knop" href={igProfiel(ig)} target="_blank" rel="noreferrer" aria-label={`Instagram @${ig}`}>
            <IgIcoon /> <span>@{ig}</span>
          </a>
          <a className="klant-beheer-knop" href={`${BASIS}beheer.html`} title="Beheer (enkel voor Bind'r)">
            <SlotIcoon /> <span>Beheer</span>
          </a>
        </div>
      </header>

      <section className="klant-held">
        <div className="held-tekst">
          <span className="held-label"><Sparkel /> Beurscatalogus</span>
          <h1>Hier vind je onze volledige catalogus</h1>
          <p>Kaarten, slabs en Bind'r-producten die je bij ons op de beurs kunt kopen.{demo ? " (Voorbeeld met de demo.)" : ""}</p>
          <div className="held-knoppen">
            <button className="knop klein" onClick={naarLijst}>Bekijk alles</button>
            {nieuwAantal > 0 && (
              <button className="knop klein zacht" onClick={() => { setFilters(new Set<Snelfilter>(["nieuw"])); setSort("nieuw"); naarLijst(); }}>
                <Sparkel /> {nieuwAantal} nieuw binnen
              </button>
            )}
          </div>
        </div>
        <div className="held-beeld" aria-hidden="true">
          {waaier.length === 3 && (
            <div className="waaier">
              {waaier.map((k, i) => <img key={k.id} className={`w${i}`} src={k.afbeelding!} alt="" loading="lazy" onLoad={(e) => e.currentTarget.classList.add("geladen")} onError={(e) => { e.currentTarget.style.display = "none"; }} />)}
            </div>
          )}
          <span className="held-bel" />
          <img className="held-eend" src={`${BASIS}img/eend.png`} alt="" width={180} height={180} />
          <span className="held-ster s1"><Sparkel /></span>
          <span className="held-ster s2"><Sparkel /></span>
          <span className="held-ster s3"><Sparkel /></span>
        </div>
        {data && (
          <div className="held-cijfers">
            {CATS.filter((c) => c.id !== "alles" && telling[c.id]).map((c) => (
              <button key={c.id} onClick={() => { setCat(c.id); naarLijst(); }}>
                <strong>{telling[c.id]}</strong><span>{c.label}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      {binderGroepen.length > 0 && <Binders binders={binderGroepen} onOpen={setOpen} />}

      {fout && <p className="klant-fout">{fout}</p>}
      {!data && !fout && (
        <div className="raster laad-raster" aria-label="Catalogus laden">
          {Array.from({ length: 6 }, (_, i) => <div key={i} className="tegel laad-tegel" style={{ ["--i" as string]: i }}><div className="foto" /><span /><span /></div>)}
        </div>
      )}

      {data && (
        <>
          <div className="klant-zoekrij" ref={lijstRef}>
            <div className="zoekbalk">
              <ZoekIcoon />
              <input value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder="Zoek een kaart of set" inputMode="search" aria-label="Zoeken"
                onFocus={() => setZoekFocus(true)} onBlur={() => setZoekFocus(false)} />
              {zoek && <button className="wis" onClick={() => setZoek("")} aria-label="Wissen">✕</button>}
            </div>
            <label className="sorteer" title="Sorteren">
              <SorteerIcoon />
              <span className="sorteer-tekst">{SORTERINGEN.find((x) => x.id === sort)?.label}</span>
              <select value={sort} onChange={(e) => setSort(e.target.value as Sortering)} aria-label="Sorteren">
                {SORTERINGEN.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </label>
          </div>

          <div className="klant-filters">
            <div className="categorieen" role="tablist" aria-label="Soort">
              {CATS.filter((c) => c.id === "alles" || telling[c.id]).map((c) => (
                <button key={c.id} role="tab" aria-selected={cat === c.id} className={cat === c.id ? "aan" : ""} onClick={() => setCat(c.id)}>
                  {c.label}{c.id !== "alles" && <span>{telling[c.id]}</span>}
                </button>
              ))}
            </div>
            <div className="chips" aria-label="Filters">
              {setLijst.length > 1 && (
                <SetKiezer sets={setLijst.map((x) => ({ ...x, logo: setLogo(x.id, sets?.[x.id]), code: sets?.[x.id]?.[1] || null, taal: setTaal(sets?.[x.id]), intl: sets?.[x.id]?.[5] || null, eigen: sets?.[x.id]?.[6] || null }))} gekozen={set} onKies={setSet} />
              )}
              {SNELFILTERS.map((f) => (
                <button key={f.id} className={`chip schakelchip${filters.has(f.id) ? " aan" : ""}`} aria-pressed={filters.has(f.id)} onClick={() => wissel(f.id)}>
                  <span className="schakelbol" aria-hidden="true" />{f.label}
                </button>
              ))}
            </div>
            <div className="klant-resultaat">
              <span>{(() => { const n = groepen.reduce((s, g) => s + aantalVan(g), 0); return `${n} ${n === 1 ? "stuk" : "stuks"}`; })()} · {SORTERINGEN.find((x) => x.id === sort)?.label.toLowerCase()}</span>
              {actief > 0 && <button className="tekstknop klein" onClick={wisAlles}>Wis filters</button>}
            </div>
          </div>

          {!groepen.length && binderGroepen.length ? null : !groepen.length ? (
            <div className="klant-leeg">
              <img src={`${BASIS}img/eend.png`} alt="" width={96} height={96} />
              <p>{stukken.length ? "Niets gevonden met deze filters. Haal er een weg:" : "De catalogus is nog leeg. Kom zeker eens langs op de beurs!"}</p>
              {actief > 0 && (
                <div className="actieve-filters">
                  {zoek.trim() && <button className="chip aan" onClick={() => setZoek("")}>"{zoek.trim()}" ✕</button>}
                  {cat !== "alles" && <button className="chip aan" onClick={() => setCat("alles")}>{CATS.find((c) => c.id === cat)?.label} ✕</button>}
                  {set && <button className="chip aan" onClick={() => setSet("")}>{setLijst.find((x) => x.id === set)?.naam ?? set} ✕</button>}
                  {[...filters].map((f) => <button key={f} className="chip aan" onClick={() => wissel(f)}>{SNELFILTERS.find((x) => x.id === f)?.label} ✕</button>)}
                </div>
              )}
              {actief > 1 && <button className="knop zacht" onClick={wisAlles}>Wis alle filters</button>}
            </div>
          ) : sort === "set" ? (
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

      <Voet ig={ig} beurzen={beurzen} />

      {open && <Detail g={open} beurzen={beurzen} sets={sets} onSluit={() => setOpen(null)} />}
      {data && <Eend ig={ig} verborgen={!!open || zoekFocus || !groepen.length} />}
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
  return (
    <button className={`tegel${holo ? " holo" : ""}${slab ? " slab" : ""}${s.bron === "artikel" ? " artikel-tegel" : ""}`} style={{ ["--i" as string]: Math.min(i, 24) }} onClick={onOpen} {...kantel}
      aria-label={`${s.naam}, ${euro(s.prijs)}${n > 1 ? `, ${n} stuks` : ""}`}>
      {s.bron === "artikel"
        ? <ArtikelBeeld s={s} />
        : s.soort === "slab"
          ? <div className="slab-hoes"><span className="slab-label"><b>{s.grader || "Graded"}</b><em>{s.grade}</em></span><Foto kaart={s} alt={s.naam} /></div>
          : <Foto kaart={s} alt={s.naam} />}
      {s.bron === "artikel" && !s.uitgestald && <span className="vraag-merk">Vraag ernaar</span>}
      {n > 1 && <span className="aantal-merk" aria-hidden="true">×{n}</span>}
      {nieuw && <span className="nieuw-merk">Nieuw</span>}
      <div className="tegel-info">
        <div className="tegel-naam">{s.naam}</div>
        <div className="tegel-set">{s.bron === "artikel" ? (s.binder ? binderTekst(s.binder) || "Bind'r-binder" : s.soort === "eigen product" ? "Bind'r" : "Sealed") : [s.set_code, s.nummer].filter(Boolean).join(" ") || (s.soort === "eigen product" ? "Bind'r" : "")}</div>
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

/** Onze binders, groot in beeld: ook die niet uitgestald liggen. */
function Binders({ binders, onOpen }: { binders: Groep<Stuk>[]; onOpen: (g: Groep<Stuk>) => void }) {
  return (
    <section className="binders" aria-label="Onze binders">
      <div className="binders-kop">
        <h2>Onze binders</h2>
        <p>Handgemaakt door Bind'r. Staat er één niet op de stand? Vraag ernaar, we hebben ze mee.</p>
      </div>
      <div className="binders-rij">
        {binders.map((g, i) => {
          const s = g.eerste;
          return (
            <button key={g.sleutel} className="binder-kaart" style={{ ["--i" as string]: i }} onClick={() => onOpen(g)}>
              <ArtikelBeeld s={s} />
              <span className="binder-tekst">
                <strong>{s.binder?.artwork || s.naam}</strong>
                <span>{s.binder ? binderTekst(s.binder) : ""}</span>
              </span>
              <span className="binder-onder">
                <Prijs p={s.prijs} />
                <em>{s.uitgestald ? `nog ${aantalVan(g)}` : "vraag ernaar"}</em>
              </span>
            </button>
          );
        })}
      </div>
    </section>
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

const MAANDEN = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
const DAGEN = ["zo", "ma", "di", "wo", "do", "vr", "za"];
function datumMooi(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  return `${DAGEN[d.getDay()]} ${d.getDate()} ${MAANDEN[d.getMonth()]}`;
}

function Detail({ g, beurzen, sets, onSluit }: { g: Groep<Stuk>; beurzen: KomendeBeurs[]; sets: SetInfo | null; onSluit: () => void }) {
  const s = g.eerste;
  const n = aantalVan(g);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onSluit();
    window.addEventListener("keydown", esc);
    document.body.classList.add("geen-scroll");
    return () => { window.removeEventListener("keydown", esc); document.body.classList.remove("geen-scroll"); };
  }, [onSluit]);
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
            {s.bron === "kaart" ? (
              <div className={`klant-detail-foto zweeft${s.prijs >= 50 && s.soort !== "slab" ? " holo" : ""}`}><div className="kantel-vlak" {...kantelVrij}>
                {s.soort === "slab"
                  ? <div className="slab-hoes groot"><span className="slab-label"><b>{s.grader || "Graded"}</b><em>{s.grade}</em></span><Foto kaart={s} alt={s.naam} groot /></div>
                  : <Foto kaart={s} alt={s.naam} groot />}
              </div></div>
            ) : (
              <div className="klant-detail-foto zweeft"><div className="kantel-vlak" {...kantelVrij}><ArtikelBeeld s={s} /></div></div>
            )}
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
                  <dt>Soort</dt><dd>{s.binder ? "Bind'r-binder" : s.soort === "eigen product" ? "Bind'r-product" : "Sealed"}</dd>
                  {s.binder?.artwork && <><dt>Artwork</dt><dd>{s.binder.artwork}</dd></>}
                  {s.binder?.techniek && <><dt>Techniek</dt><dd>{TECHNIEK_NAAM[s.binder.techniek] ?? s.binder.techniek}</dd></>}
                  {s.binder?.grootte && <><dt>Grootte</dt><dd>{s.binder.grootte}{s.binder.toploader ? ", voor toploaders" : ""}</dd></>}
                  {s.binder?.merk && <><dt>Binder</dt><dd>{s.binder.merk}</dd></>}
                  <dt>Beschikbaar</dt><dd>{n > 5 ? "ja" : `nog ${n}`}{s.uitgestald === false ? " (niet uitgestald: vraag ernaar aan onze stand)" : ""}</dd>
                </>
              ) : (
                <>
                  {(s.set_naam || s.set_code) && <><dt>Set</dt><dd>{setNaam(setIdVan(s), s.set_naam, sets)}{sets?.[setIdVan(s)]?.[5] ? <span className="zacht"> (≈ {sets[setIdVan(s)][5]})</span> : null}</dd></>}
                  {(s.set_code || s.nummer) && <><dt>Nummer</dt><dd>{[s.set_code, s.nummer].filter(Boolean).join(" ")}</dd></>}
                  {s.soort === "slab" ? <><dt>Grade</dt><dd>{[s.grader, s.grade].filter(Boolean).join(" ")}</dd></> : s.conditie && <><dt>Conditie</dt><dd>{CONDITIE[s.conditie] ?? s.conditie}</dd></>}
                  {s.soort !== "eigen product" && <><dt>Taal</dt><dd>{taalNaam(s.taal)}</dd></>}
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
                ? <>Vandaag op {beurzen[0].naam}{beurzen[0].locatie ? ` · ${beurzen[0].locatie}` : ""}</>
                : <>Volgende beurs: {beurzen[0].naam}, {datumMooi(beurzen[0].datum)}{beurzen[0].locatie ? ` · ${beurzen[0].locatie}` : ""}</>
              : "Je vindt ons op de komende beurzen."}</span>
          </div>
        </div>
      </div>
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

// ── Instagram: onderaan de pagina en de eend ─────────────────────────────────

function Voet({ ig, beurzen }: { ig: string; beurzen: KomendeBeurs[] }) {
  return (
    <footer className="klant-voet">
      <section className="komende-beurzen">
        <h2>Bezoek onze stand</h2>
        {beurzen.length ? (
          <ul>
            {beurzen.slice(0, 6).map((b) => (
              <li key={b.datum + b.naam}>
                <span className="beurs-datum"><strong>{new Date(b.datum + "T12:00:00").getDate()}</strong><em>{MAANDEN[new Date(b.datum + "T12:00:00").getMonth()]}</em></span>
                <span className="beurs-tekst"><strong>{b.naam}</strong>{b.locatie && <span>{b.locatie}</span>}</span>
              </li>
            ))}
          </ul>
        ) : <p>De volgende beurzen staan binnenkort hier. Volg ons op Instagram om niets te missen.</p>}
      </section>
      <a className="ig-blok" href={igProfiel(ig)} target="_blank" rel="noreferrer">
        <span className="ig-blok-icoon"><IgIcoon maat={28} /></span>
        <span className="ig-blok-tekst">
          <strong>Volg ons op Instagram</strong>
          <span>Onze nieuwste custom binders, lasergravures en kaarten. @{ig}</span>
        </span>
        <span className="ig-blok-pijl" aria-hidden="true">→</span>
      </a>
      <img src={`${BASIS}img/logo-woord.png`} alt="Bind'r" className="voet-logo" width={120} height={53} />
      <p>Collectibles · Crafts · 3D prints</p>
      <p className="zacht">Prijzen in euro, zolang de voorraad strekt.</p>
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
const SlotIcoon = () => <Svg maat={16}><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></Svg>;
const IgIcoon = ({ maat = 20 }: { maat?: number }) => <Svg maat={maat}><rect x="3.5" y="3.5" width="17" height="17" rx="5" /><circle cx="12" cy="12" r="4" /><path d="M17 7h.01" /></Svg>;
const ZoekIcoon = () => <Svg maat={18}><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></Svg>;
const SorteerIcoon = () => <Svg maat={18}><path d="M7 4v16M3.5 16.5 7 20l3.5-3.5M17 20V4M13.5 7.5 17 4l3.5 3.5" /></Svg>;
const Sparkel = () => <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2c.6 4.6 2.4 7.4 10 10-7.6 2.6-9.4 5.4-10 10-.6-4.6-2.4-7.4-10-10 7.6-2.6 9.4-5.4 10-10Z" /></svg>;

createRoot(document.getElementById("app")!).render(<Catalogus />);
