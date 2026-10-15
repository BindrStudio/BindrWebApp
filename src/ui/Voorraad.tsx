import { useEffect, useMemo, useState } from "react";
import { doePrijscheck, huidig, openArtikel, openExemplaar, openLabels, openToevoegen, useApp } from "../state";
import type { Artikel, Exemplaar, Opslag } from "../types";
import { datumKort, euro, zonderAccenten } from "../lib/format";
import { toonCode } from "../lib/code";
import { waardeStijgers, type TeWijzigen } from "../lib/pricing";
import { CATEGORIEEN, PLAATS, categorieArtikel, categorieExemplaar, type Categorie } from "../lib/categorie";
import { inVoorraad } from "../lib/exemplaar";
import { klantUrl } from "../config";
import { kantel } from "../lib/kantel";
import {
  groepeer, groepSleutel, isNieuw, pastFilters, perSet, SNELFILTERS, SORTERINGEN, setIdVan, sorteer,
  type Groep, type SetInfo, type Snelfilter, type Sortering, type Toonbaar,
} from "../lib/weergave";
import { Badges, Hartje, Icoon, KaartFoto, Leeg } from "./common";

type Filter = "geen" | "wijzigen" | "label" | "gestegen";
type Item = { soort: "ex"; groep: Groep<Exemplaar>; t: Toonbaar } | { soort: "art"; art: Artikel; t: Toonbaar };

/** Een exemplaar zoals de catalogusweergave het ziet (prijs = het hartje of, in de vault, de waarde). */
function toonbaar(e: Exemplaar): Toonbaar {
  const prijs = e.opslag === "vitrine" ? e.hartjesprijs : e.verkoopprijs;
  return {
    kaart_id: e.kaart_id, soort: e.soort, naam: e.naam, naam_origineel: e.naam_origineel, set_naam: e.set_naam, set_code: e.set_code,
    nummer: e.nummer, taal: e.taal, conditie: e.conditie, variant: e.variant, grader: e.grader, grade: e.grade,
    prijs: prijs ?? -1, toegevoegd: e.opslag === "vitrine" ? e.vitrine_sinds ?? e.hartjesdatum ?? e.aangemaakt_op : e.aangemaakt_op,
  };
}
function toonbaarArtikel(a: Artikel): Toonbaar {
  return {
    kaart_id: null, soort: a.soort, naam: a.naam, set_naam: null, set_code: null, nummer: null, taal: "", conditie: null,
    variant: "normaal", grader: null, grade: null, prijs: a.prijs ?? -1, toegevoegd: null,
  };
}

// De sets (naam en release) komen uit een klein bestand, voor "Per set" van nieuw naar oud.
let setsLaden: Promise<SetInfo | null> | null = null;
function useSets(): SetInfo | null {
  const [sets, setSets] = useState<SetInfo | null>(null);
  useEffect(() => {
    setsLaden ??= fetch("data/sets.json").then((r) => (r.ok ? r.json() : null)).catch(() => null);
    let weg = false;
    void setsLaden.then((x) => { if (!weg) setSets(x); });
    return () => { weg = true; };
  }, []);
  return sets;
}

/** De catalogus (te koop, klanten zien hem) of de vault (onze stock). */
export function Voorraad({ opslag }: { opslag: Opslag }) {
  const { exemplaren, artikelen, teWijzigen, prijscheckOp, gids, instellingen } = useApp();
  const catalogus = opslag === "vitrine";
  const sets = useSets();
  const [cat, setCat] = useState<Categorie | "alles">("alles");
  const [filter, setFilter] = useState<Filter>("geen");
  const [snel, setSnel] = useState<Set<Snelfilter>>(new Set());
  const [set, setSet] = useState("");
  const [sort, setSort] = useState<Sortering>("prijs-hoog");
  const [zoek, setZoek] = useState("");

  const ex = useMemo(() => exemplaren.filter((e) => inVoorraad(e) && e.opslag === opslag), [exemplaren, opslag]);
  const art = useMemo(() => artikelen.filter((a) => a.opslag === opslag && (a.aantal > 0 || !catalogus)), [artikelen, opslag, catalogus]);
  const stijgers = useMemo(() => (catalogus ? new Map<string, TeWijzigen>() : waardeStijgers(exemplaren, gids, instellingen)), [catalogus, exemplaren, gids, instellingen]);
  const band = catalogus ? teWijzigen : stijgers;

  const waarde = ex.reduce((s, e) => s + ((catalogus ? e.hartjesprijs : e.verkoopprijs) ?? 0), 0) + art.reduce((s, a) => s + (a.prijs ?? 0) * a.aantal, 0);
  const aantalStuks = ex.length + art.length;

  const telling = useMemo(() => {
    const t: Record<string, number> = {};
    for (const e of ex) t[categorieExemplaar(e)] = (t[categorieExemplaar(e)] || 0) + 1;
    for (const a of art) t[categorieArtikel(a)] = (t[categorieArtikel(a)] || 0) + 1;
    return t;
  }, [ex, art]);

  const setLijst = useMemo(() => {
    const m = new Map<string, { id: string; naam: string; aantal: number; release: string }>();
    for (const e of ex) {
      if (e.soort === "eigen product") continue;
      const id = setIdVan(e);
      if (!id) continue;
      const x = m.get(id) ?? { id, naam: e.set_naam || sets?.[id]?.[0] || id, aantal: 0, release: sets?.[id]?.[2] ?? "" };
      x.aantal++;
      m.set(id, x);
    }
    return [...m.values()].sort((a, b) => b.release.localeCompare(a.release) || a.naam.localeCompare(b.naam));
  }, [ex, sets]);

  const lijst = useMemo(() => {
    const q = zonderAccenten(zoek.trim());
    const woorden = q ? q.split(/\s+/) : [];
    const past = (tekst: string) => woorden.every((w) => tekst.includes(w));
    const passend = ex.filter((e) => {
      if (cat !== "alles" && categorieExemplaar(e) !== cat) return false;
      if (filter === "wijzigen" && !teWijzigen.has(e.id)) return false;
      if (filter === "gestegen" && !stijgers.has(e.id)) return false;
      if (filter === "label" && e.label_status === "gestickerd") return false;
      if (set && setIdVan(e) !== set) return false;
      if (snel.size && !pastFilters(toonbaar(e), snel)) return false;
      if (woorden.length) {
        const t = zonderAccenten([e.naam, e.naam_origineel, e.set_naam, e.set_code, e.nummer, e.code, toonCode(e.code), e.taal].filter(Boolean).join(" "));
        if (!past(t)) return false;
      }
      return true;
    });
    // Dubbels (zelfde kaart, conditie en prijs) worden één tegel met een aantal.
    const groepen = groepeer(passend, (e) => groepSleutel(toonbaar(e)) + (band.has(e.id) ? "|band" : ""));
    let items: Item[] = groepen.map((g) => ({ soort: "ex" as const, groep: g, t: toonbaar(g.eerste) }));
    if (filter === "geen" && !set && !snel.size) {
      items.push(...art
        .filter((a) => (cat === "alles" || categorieArtikel(a) === cat) && (!woorden.length || past(zonderAccenten(a.naam))))
        .map((a) => ({ soort: "art" as const, art: a, t: toonbaarArtikel(a) })));
    }
    items = sorteer(items, sort, (it) => it.t, sets);
    // Wat moet wisselen of in waarde steeg, staat altijd bovenaan.
    const bovenaan = (it: Item) => (it.soort === "ex" && it.groep.items.some((e) => band.has(e.id)) ? 0 : 1);
    return items.map((it, i) => ({ it, i })).sort((a, b) => bovenaan(a.it) - bovenaan(b.it) || a.i - b.i).map((x) => x.it);
  }, [ex, art, cat, filter, zoek, teWijzigen, stijgers, band, set, snel, sort, sets]);

  const aantalLabels = exemplaren.filter((e) => inVoorraad(e) && e.label_status === "te printen").length;
  const nogTePlakken = ex.filter((e) => e.label_status !== "gestickerd").length;
  const zichtbareCats = CATEGORIEEN.filter((c) => telling[c.id]);
  const wisselSnel = (f: Snelfilter) => { const n = new Set(snel); if (n.has(f)) n.delete(f); else n.add(f); setSnel(n); };
  const nieuwAantal = useMemo(() => ex.filter((e) => isNieuw(toonbaar(e))).length, [ex]);

  const tegel = (it: Item, i: number) => it.soort === "ex"
    ? <Tegel key={it.groep.sleutel} ex={it.groep.eerste} aantal={it.groep.items.length} i={i} band={band.get(it.groep.eerste.id)} vault={!catalogus} labelOpen={it.groep.items.some((e) => e.label_status !== "gestickerd")} />
    : <ArtikelTegel key={it.art.id} a={it.art} i={i} />;

  return (
    <div className="scherm">
      <header className="kop">
        <div>
          <h1>{PLAATS[opslag].naam}</h1>
          <p className="kop-sub">
            {ex.length} {ex.length === 1 ? "exemplaar" : "exemplaren"}{art.length ? ` · ${art.length} artikelen` : ""} · {euro(waarde, true)}
          </p>
        </div>
        <div className="kop-knoppen">
          {catalogus && <a className="rond-knop groot" href={klantUrl(huidig().backend?.soort === "demo")} target="_blank" rel="noreferrer" aria-label="Bekijk als klant" title="Bekijk als klant"><Icoon naam="oog" /></a>}
          <button className="rond-knop groot" onClick={openLabels} aria-label="Labels">
            <Icoon naam="printer" />
            {aantalLabels > 0 && <span className="knop-teller">{aantalLabels}</span>}
          </button>
          <button className="rond-knop groot zee" onClick={() => openToevoegen(undefined, undefined, opslag)} aria-label="Toevoegen"><Icoon naam="plus" /></button>
        </div>
      </header>

      {catalogus ? (
        <div className="werkbalk">
          <button className={`knop prijsknop${teWijzigen.size ? " actief" : ""}`} onClick={async () => { const l = await doePrijscheck(); if (l.length) setFilter("wijzigen"); }}>
            <Icoon naam="vernieuw" maat={18} />
            Prijzen nakijken
            {teWijzigen.size > 0 && <span className="teller">{teWijzigen.size}</span>}
          </button>
          <span className="prijsdatum">{gids ? `Prijsgids ${datumKort(gids.datum)}` : "Nog geen prijsgids"}{prijscheckOp && ` · nagekeken ${datumKort(prijscheckOp)}`}</span>
        </div>
      ) : (
        <p className="uitleg-vault">Onze eigen stock, klanten zien dit niet. Kaarten uit ruil en inkoop komen hier tot ze een hartje krijgen.</p>
      )}

      {zichtbareCats.length > 1 && (
        <div className="categorieen" role="tablist">
          <button role="tab" aria-selected={cat === "alles"} className={cat === "alles" ? "aan" : ""} onClick={() => setCat("alles")}>Alles</button>
          {zichtbareCats.map((c) => (
            <button key={c.id} role="tab" aria-selected={cat === c.id} className={cat === c.id ? "aan" : ""} onClick={() => setCat(cat === c.id ? "alles" : c.id)}>
              {c.label} <span>{telling[c.id]}</span>
            </button>
          ))}
        </div>
      )}

      <div className="filterbalk">
      <div className="zoekrij">
        <div className="zoekbalk">
          <Icoon naam="zoek" maat={18} />
          <input value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder="Naam, set of code" inputMode="search" />
          {zoek && <button className="wis" onClick={() => setZoek("")} aria-label="Wissen"><Icoon naam="kruis" maat={16} /></button>}
        </div>
        <label className="sorteerknop">
          <Icoon naam="sorteer" maat={18} />
          <select value={sort} onChange={(e) => setSort(e.target.value as Sortering)} aria-label="Sorteren">
            {SORTERINGEN.map((x) => <option key={x.id} value={x.id}>{x.id === "nieuw" && !catalogus ? "Nieuwste eerst" : x.label}</option>)}
          </select>
        </label>
      </div>

      <div className="chips">
        {setLijst.length > 1 && (
          <label className={`chip setkeuze${set ? " aan" : ""}`}>
            <select value={set} onChange={(e) => setSet(e.target.value)} aria-label="Set">
              <option value="">Alle sets</option>
              {setLijst.map((x) => <option key={x.id} value={x.id}>{x.naam} ({x.aantal})</option>)}
            </select>
          </label>
        )}
        {catalogus && teWijzigen.size > 0 && <FilterChip aan={filter === "wijzigen"} onClick={() => setFilter(filter === "wijzigen" ? "geen" : "wijzigen")} rood>Te wijzigen {teWijzigen.size}</FilterChip>}
        {!catalogus && stijgers.size > 0 && <FilterChip aan={filter === "gestegen"} onClick={() => setFilter(filter === "gestegen" ? "geen" : "gestegen")}>Waarde gestegen {stijgers.size}</FilterChip>}
        {nogTePlakken > 0 && <FilterChip aan={filter === "label"} onClick={() => setFilter(filter === "label" ? "geen" : "label")}>Label nog niet geplakt {nogTePlakken}</FilterChip>}
        {SNELFILTERS.filter((f) => f.id !== "nieuw" || nieuwAantal > 0).map((f) => (
          <FilterChip key={f.id} aan={snel.has(f.id)} onClick={() => wisselSnel(f.id)}>{f.id === "nieuw" ? `${catalogus ? "Nieuw binnen" : "Nieuw"} ${nieuwAantal}` : f.label}</FilterChip>
        ))}
      </div>
      </div>

      {lijst.length === 0 ? (
        aantalStuks === 0 ? (
          <Leeg titel={catalogus ? "De catalogus is leeg" : "De vault is leeg"} tekst={catalogus ? "Voeg kaarten toe, of laad de testset in via Meer." : "Kaarten die je bijhoudt voor later komen hier."}>
            <button className="knop" onClick={() => openToevoegen(undefined, undefined, opslag)}><Icoon naam="plus" maat={18} /> Toevoegen</button>
          </Leeg>
        ) : (
          <Leeg titel="Niets gevonden" tekst="Probeer een andere zoekterm of filter.">
            <button className="knop zacht" onClick={() => { setZoek(""); setFilter("geen"); setSnel(new Set()); setSet(""); setCat("alles"); }}>Wis filters</button>
          </Leeg>
        )
      ) : sort === "set" ? (
        <div className="set-groepen">
          {(() => {
            let teller = 0;
            return perSet(lijst, (it) => it.t).map((g) => {
              const start = teller;
              teller += g.items.length;
              return (
                <section key={g.set + start} className="set-groep">
                  <h2 className="set-kop"><span>{g.naam}</span><em>{g.items.reduce((n, it) => n + (it.soort === "ex" ? it.groep.items.length : 1), 0)}</em></h2>
                  <div className="raster">{g.items.map((it, j) => tegel(it, start + j))}</div>
                </section>
              );
            });
          })()}
        </div>
      ) : (
        <div className="raster">{lijst.map((it, i) => tegel(it, i))}</div>
      )}
    </div>
  );
}

function FilterChip({ aan, onClick, children, rood }: { aan: boolean; onClick: () => void; children: React.ReactNode; rood?: boolean }) {
  return <button className={`chip${aan ? " aan" : ""}${rood ? " rood" : ""}`} aria-pressed={aan} onClick={onClick}>{children}</button>;
}

export function Tegel({ ex, i, band, vault, aantal = 1, labelOpen }: { ex: Exemplaar; i: number; band?: TeWijzigen; vault?: boolean; aantal?: number; labelOpen?: boolean }) {
  const prijs = ex.opslag === "vitrine" ? ex.hartjesprijs : ex.verkoopprijs;
  const duur = (prijs ?? 0) >= 50;
  const label = labelOpen ?? ex.label_status !== "gestickerd";
  return (
    <button
      className={`tegel${band && !vault ? " wijzig" : ""}${duur ? " holo" : ""}`}
      style={{ ["--i" as string]: Math.min(i, 24) }}
      onClick={() => openExemplaar(ex.id)}
      {...kantel}
    >
      <div className="foto-vak">
        <KaartFoto src={ex.afbeelding} alt={ex.naam} />
        <span className="glans" />
      </div>
      {aantal > 1 && <span className="aantal-merk" title={`${aantal} exemplaren`}>×{aantal}</span>}
      <div className="tegel-info">
        <div className="tegel-naam">{ex.naam}</div>
        <div className="tegel-set">{[ex.set_code, ex.nummer].filter(Boolean).join(" ") || (ex.soort === "eigen product" ? "Bind'r" : ex.soort)}</div>
        <Badges ex={ex} />
        <div className="tegel-onder">
          {ex.opslag === "vitrine" ? <Hartje prijs={ex.hartjesprijs} /> : <span className="waarde">{euro(ex.verkoopprijs)}</span>}
          {label && <span className="label-stip" title="Label nog niet geplakt"><Icoon naam="label" maat={14} /></span>}
        </div>
      </div>
      {band && (
        <div className={`wijzig-band ${vault ? "stijger" : band.richting}`}>
          <Icoon naam={band.richting === "op" ? "op" : "neer"} maat={14} />
          {euro(band.oud)} → {euro(band.nieuw)}
        </div>
      )}
    </button>
  );
}

function ArtikelTegel({ a, i }: { a: Artikel; i: number }) {
  return (
    <button className="tegel artikel-tegel" style={{ ["--i" as string]: Math.min(i, 24) }} onClick={() => openArtikel(a.id)} {...kantel}>
      <div className={`artikel-vlak ${categorieArtikel(a)}`}>
        <span className="glans" />
        <Icoon naam={a.soort === "eigen product" ? "binder" : "doos"} maat={40} />
        <span className="artikel-aantal">× {a.aantal}</span>
      </div>
      <div className="tegel-info">
        <div className="tegel-naam">{a.naam}</div>
        <div className="tegel-set">{a.soort === "eigen product" ? "Bind'r" : a.soort}{a.aantal === 0 ? " · op" : ""}</div>
        <div className="tegel-onder">
          {a.prijs != null ? <span className="hartje"><Icoon naam="hart" maat={14} />{euro(a.prijs)}</span> : <span className="waarde">per deal</span>}
        </div>
      </div>
    </button>
  );
}
