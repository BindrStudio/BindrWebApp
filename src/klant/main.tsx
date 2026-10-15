// De klantencatalogus: een aparte, publieke pagina zonder login en zonder beheerfuncties.
// Ze toont enkel wat in de catalogus (vitrine) ligt, via de publieke weergaven in Supabase.
// Niets uit de beheer-app wordt hier geladen.
import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { SUPABASE_KEY, SUPABASE_URL } from "../config";
import { TALEN } from "../types";
import { euro, zonderAccenten } from "../lib/format";
import { toonCode } from "../lib/code";

interface Kaart {
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
  prijs: number;
  sinds: string | null;
}
interface Artikel { id: string; naam: string; soort: string; prijs: number; aantal: number }
type Item = { soort: "kaart"; k: Kaart } | { soort: "artikel"; a: Artikel };
type Cat = "alles" | "singles" | "slabs" | "sealed" | "bindr";

const CONDITIE: Record<string, string> = { M: "Mint", NM: "Near Mint", EX: "Excellent", GD: "Good", LP: "Light Played", PL: "Played", PO: "Poor" };
const taalNaam = (t: string) => TALEN.find((x) => x.code === t)?.label ?? t;
const catVan = (it: Item): Cat => (it.soort === "artikel"
  ? (it.a.soort === "eigen product" ? "bindr" : "sealed")
  : it.k.soort === "slab" ? "slabs" : it.k.soort === "eigen product" ? "bindr" : "singles");

async function haal<T>(pad: string): Promise<T> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${pad}`, { headers: { apikey: SUPABASE_KEY } });
  if (!r.ok) throw new Error(String(r.status));
  return r.json() as Promise<T>;
}

/** Met ?demo=1 toont de pagina de demo van dit toestel (om te kijken hoe klanten het zien). */
function laadDemo(): { kaarten: Kaart[]; artikelen: Artikel[]; instagram: string } | null {
  if (!new URLSearchParams(location.search).has("demo")) return null;
  try {
    const d = JSON.parse(localStorage.getItem("bindr-demo-v1") || "null");
    if (!d) return { kaarten: [], artikelen: [], instagram: "" };
    const kaarten = (d.exemplaren as (Kaart & { opslag: string; status: string; hartjesprijs: number | null; hartjesdatum: string | null })[])
      .filter((e) => e.opslag === "vitrine" && e.status === "in voorraad" && e.hartjesprijs != null)
      .map((e) => ({
        code: e.code, naam: e.naam, naam_origineel: e.naam_origineel, soort: e.soort, afbeelding: e.afbeelding,
        set_naam: e.set_naam, set_code: e.set_code, nummer: e.nummer, taal: e.taal, conditie: e.conditie,
        variant: e.variant, grader: e.grader, grade: e.grade, prijs: e.hartjesprijs!, sinds: e.hartjesdatum,
      }));
    const artikelen = (d.artikelen as (Artikel & { opslag: string })[])
      .filter((a) => a.opslag === "vitrine" && a.aantal > 0 && a.prijs != null)
      .map((a) => ({ id: a.id, naam: a.naam, soort: a.soort, prijs: a.prijs, aantal: a.aantal }));
    return { kaarten, artikelen, instagram: typeof d.instellingen?.instagram === "string" ? d.instellingen.instagram : "" };
  } catch {
    return null;
  }
}

function Catalogus() {
  const [data, setData] = useState<{ kaarten: Kaart[]; artikelen: Artikel[]; instagram: string } | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [cat, setCat] = useState<Cat>("alles");
  const [zoek, setZoek] = useState("");
  const [sort, setSort] = useState<"prijs-hoog" | "prijs-laag" | "nieuw" | "naam">("prijs-hoog");
  const [open, setOpen] = useState<Item | null>(null);
  const [melding, setMelding] = useState<string | null>(null);
  const demo = useMemo(laadDemo, []);

  useEffect(() => {
    if (demo) { setData(demo); return; }
    Promise.all([
      haal<Kaart[]>("publieke_vitrine?select=*"),
      haal<Artikel[]>("publieke_artikelen?select=*").catch(() => []),
      haal<{ sleutel: string; waarde: unknown }[]>("publieke_instellingen?select=*").catch(() => []),
    ]).then(([kaarten, artikelen, inst]) => {
      const ig = inst.find((x) => x.sleutel === "instagram")?.waarde;
      setData({ kaarten: kaarten.map((k) => ({ ...k, prijs: Number(k.prijs) })), artikelen: artikelen.map((a) => ({ ...a, prijs: Number(a.prijs) })), instagram: typeof ig === "string" ? ig : "" });
    }).catch(() => setFout("De catalogus kon niet geladen worden. Probeer het straks opnieuw."));
  }, [demo]);

  const items: Item[] = useMemo(() => data ? [
    ...data.kaarten.map((k) => ({ soort: "kaart" as const, k })),
    ...data.artikelen.map((a) => ({ soort: "artikel" as const, a })),
  ] : [], [data]);

  const telling = useMemo(() => {
    const t: Partial<Record<Cat, number>> = {};
    for (const it of items) t[catVan(it)] = (t[catVan(it)] ?? 0) + 1;
    return t;
  }, [items]);

  const lijst = useMemo(() => {
    const woorden = zonderAccenten(zoek.trim()).split(/\s+/).filter(Boolean);
    const prijs = (it: Item) => (it.soort === "kaart" ? it.k.prijs : it.a.prijs);
    const naam = (it: Item) => (it.soort === "kaart" ? it.k.naam : it.a.naam);
    return items
      .filter((it) => cat === "alles" || catVan(it) === cat)
      .filter((it) => {
        if (!woorden.length) return true;
        const t = zonderAccenten(it.soort === "kaart"
          ? [it.k.naam, it.k.naam_origineel, it.k.set_naam, it.k.set_code, it.k.nummer].filter(Boolean).join(" ")
          : it.a.naam);
        return woorden.every((w) => t.includes(w));
      })
      .sort((a, b) => {
        if (sort === "prijs-hoog") return prijs(b) - prijs(a);
        if (sort === "prijs-laag") return prijs(a) - prijs(b);
        if (sort === "naam") return naam(a).localeCompare(naam(b));
        const sa = a.soort === "kaart" ? a.k.sinds ?? "" : "";
        const sb = b.soort === "kaart" ? b.k.sinds ?? "" : "";
        return sb.localeCompare(sa);
      });
  }, [items, cat, zoek, sort]);

  const reserveer = async (it: Item) => {
    const tekst = it.soort === "kaart"
      ? `Hoi Bind'r! Ik wil graag reserveren: ${it.k.naam} (${[it.k.set_code, it.k.nummer].filter(Boolean).join(" ")}${it.k.conditie ? `, ${it.k.conditie}` : ""}) voor ${euro(it.k.prijs)}. Ref ${toonCode(it.k.code)}`
      : `Hoi Bind'r! Ik wil graag reserveren: ${it.a.naam} voor ${euro(it.a.prijs)}.`;
    try { await navigator.clipboard.writeText(tekst); setMelding("Bericht gekopieerd. Plak het in je Instagram-bericht."); }
    catch { setMelding(tekst); }
    if (data?.instagram) window.open(`https://ig.me/m/${encodeURIComponent(data.instagram)}`, "_blank", "noopener");
  };

  return (
    <div className="klant">
      <header className="klant-kop">
        <img src="../img/logo.png" alt="Bind'r" className="klant-logo" />
        <div>
          <h1>Beurscatalogus</h1>
          <p>Kaarten, slabs en Bind'r-producten die je bij ons kunt kopen.{demo ? " (voorbeeld met de demo)" : ""}</p>
        </div>
      </header>

      {fout && <p className="klant-fout">{fout}</p>}
      {!data && !fout && <div className="laadbalk klant-laden"><span /></div>}

      {data && (
        <>
          <div className="klant-filters">
            <div className="categorieen">
              {(["alles", "singles", "slabs", "sealed", "bindr"] as Cat[]).filter((c) => c === "alles" || telling[c]).map((c) => (
                <button key={c} className={cat === c ? "aan" : ""} onClick={() => setCat(c)}>
                  {{ alles: "Alles", singles: "Singles", slabs: "Slabs", sealed: "Sealed", bindr: "Bind'r" }[c]}
                  {c !== "alles" && <span>{telling[c]}</span>}
                </button>
              ))}
            </div>
            <div className="klant-zoekrij">
              <div className="zoekbalk">
                <input value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder="Zoek een kaart" inputMode="search" />
              </div>
              <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="Sorteren">
                <option value="prijs-hoog">Duurste eerst</option>
                <option value="prijs-laag">Goedkoopste eerst</option>
                <option value="nieuw">Nieuwste eerst</option>
                <option value="naam">Op naam</option>
              </select>
            </div>
          </div>

          {!lijst.length ? <p className="klant-leeg">{items.length ? "Niets gevonden. Probeer een andere zoekterm." : "De catalogus is nog leeg. Kom zeker eens langs op de beurs!"}</p> : (
            <div className="raster">
              {lijst.map((it, i) => <KlantTegel key={it.soort === "kaart" ? it.k.code : it.a.id} it={it} i={i} onOpen={() => setOpen(it)} />)}
            </div>
          )}
          <p className="klant-voet">Prijzen in euro, zolang de voorraad strekt. Een reservatie is pas definitief als wij ze bevestigen.</p>
        </>
      )}

      {open && (
        <div className="sheet-achtergrond" onClick={(e) => e.target === e.currentTarget && setOpen(null)}>
          <div className="sheet" role="dialog" aria-modal="true">
            <div className="sheet-greep" />
            <div className="sheet-kop">
              <div className="sheet-titel">{open.soort === "kaart" ? open.k.naam : open.a.naam}</div>
              <button className="rond-knop" onClick={() => setOpen(null)} aria-label="Sluiten">✕</button>
            </div>
            <div className="sheet-inhoud">
              <Detail it={open} />
              {data?.instagram ? (
                <button className="knop groot" onClick={() => void reserveer(open)}>Reserveer via Instagram</button>
              ) : (
                <p className="zacht">Interesse? Vraag ernaar aan onze stand.</p>
              )}
              {melding && <p className="klant-melding">{melding}</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function KlantTegel({ it, i, onOpen }: { it: Item; i: number; onOpen: () => void }) {
  if (it.soort === "artikel") {
    return (
      <button className="tegel artikel-tegel" style={{ ["--i" as string]: Math.min(i, 24) }} onClick={onOpen}>
        <div className={`artikel-vlak ${it.a.soort === "eigen product" ? "bindr" : "sealed"}`}><span className="artikel-glyph">{it.a.soort === "eigen product" ? "B" : "✦"}</span></div>
        <div className="tegel-info">
          <div className="tegel-naam">{it.a.naam}</div>
          <div className="tegel-set">{it.a.soort === "eigen product" ? "Bind'r" : "Sealed"}</div>
          <div className="tegel-onder"><span className="hartje">♥ {euro(it.a.prijs)}</span></div>
        </div>
      </button>
    );
  }
  const k = it.k;
  return (
    <button className={`tegel${k.prijs >= 50 ? " holo" : ""}`} style={{ ["--i" as string]: Math.min(i, 24) }} onClick={onOpen}>
      <Foto src={k.afbeelding} alt={k.naam} />
      <div className="tegel-info">
        <div className="tegel-naam">{k.naam}</div>
        <div className="tegel-set">{[k.set_code, k.nummer].filter(Boolean).join(" ") || (k.soort === "eigen product" ? "Bind'r" : "")}</div>
        <span className="badges">
          {k.soort === "slab" ? <span className="badge">{[k.grader, k.grade].filter(Boolean).join(" ")}</span> : k.conditie && <span className="badge">{k.conditie}</span>}
          {k.taal !== "EN" && k.soort !== "eigen product" && <span className="badge taal">{k.taal.startsWith("CN") ? "CN" : k.taal}</span>}
        </span>
        <div className="tegel-onder"><span className="hartje">♥ {euro(k.prijs)}</span></div>
      </div>
    </button>
  );
}

function Foto({ src, alt, groot = false }: { src: string | null; alt: string; groot?: boolean }) {
  return (
    <div className="foto">
      {src && <img src={groot ? src.replace("/low.webp", "/high.webp") : src} alt={alt} loading="lazy" onLoad={(e) => e.currentTarget.classList.add("geladen")} onError={(e) => { e.currentTarget.style.display = "none"; }} />}
      <span className="foto-reserve">{alt.slice(0, 1)}</span>
    </div>
  );
}

function Detail({ it }: { it: Item }) {
  if (it.soort === "artikel") {
    return (
      <div className="klant-detail">
        <dl className="gegevens">
          <dt>Prijs</dt><dd><strong>{euro(it.a.prijs)}</strong></dd>
          <dt>Soort</dt><dd>{it.a.soort === "eigen product" ? "Bind'r-product" : "Sealed"}</dd>
          <dt>Beschikbaar</dt><dd>{it.a.aantal > 5 ? "ja" : `nog ${it.a.aantal}`}</dd>
        </dl>
      </div>
    );
  }
  const k = it.k;
  return (
    <div className="klant-detail">
      <div className="klant-detail-foto"><Foto src={k.afbeelding} alt={k.naam} groot /></div>
      <div className="hartje groot">♥ {euro(k.prijs)}</div>
      {k.naam_origineel && <p className="naam-origineel">{k.naam_origineel}</p>}
      <dl className="gegevens">
        {k.set_naam && <><dt>Set</dt><dd>{k.set_naam}</dd></>}
        {(k.set_code || k.nummer) && <><dt>Nummer</dt><dd>{[k.set_code, k.nummer].filter(Boolean).join(" ")}</dd></>}
        {k.soort === "slab" ? <><dt>Grade</dt><dd>{[k.grader, k.grade].filter(Boolean).join(" ")}</dd></> : k.conditie && <><dt>Conditie</dt><dd>{CONDITIE[k.conditie] ?? k.conditie}</dd></>}
        {k.soort !== "eigen product" && <><dt>Taal</dt><dd>{taalNaam(k.taal)}</dd></>}
        {k.variant && k.variant !== "normaal" && <><dt>Variant</dt><dd>{k.variant}</dd></>}
        <dt>Referentie</dt><dd className="code">{toonCode(k.code)}</dd>
      </dl>
    </div>
  );
}

createRoot(document.getElementById("app")!).render(<Catalogus />);
