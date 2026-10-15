import { useMemo, useState } from "react";
import { doePrijscheck, huidig, openArtikel, openExemplaar, openLabels, openToevoegen, useApp } from "../state";
import type { Artikel, Exemplaar, Opslag } from "../types";
import { datumKort, euro, zonderAccenten } from "../lib/format";
import { toonCode } from "../lib/code";
import { waardeStijgers, type TeWijzigen } from "../lib/pricing";
import { CATEGORIEEN, PLAATS, categorieArtikel, categorieExemplaar, type Categorie } from "../lib/categorie";
import { inVoorraad } from "../lib/exemplaar";
import { klantUrl } from "../config";
import { Badges, Hartje, Icoon, KaartFoto, Leeg } from "./common";

type Filter = "geen" | "wijzigen" | "label" | "gereserveerd" | "gestegen";
type Item = { soort: "ex"; ex: Exemplaar } | { soort: "art"; art: Artikel };

/** De catalogus (te koop, klanten zien hem) of de vault (onze stock). */
export function Voorraad({ opslag }: { opslag: Opslag }) {
  const { exemplaren, artikelen, teWijzigen, prijscheckOp, gids, instellingen } = useApp();
  const catalogus = opslag === "vitrine";
  const [cat, setCat] = useState<Categorie | "alles">("alles");
  const [filter, setFilter] = useState<Filter>("geen");
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

  const lijst = useMemo(() => {
    const q = zonderAccenten(zoek.trim());
    const woorden = q ? q.split(/\s+/) : [];
    const past = (tekst: string) => woorden.every((w) => tekst.includes(w));
    let items: Item[] = [];
    if (filter === "geen" || filter === "label" || filter === "gereserveerd" || filter === "wijzigen" || filter === "gestegen") {
      items = ex.map((e) => ({ soort: "ex" as const, ex: e }));
      if (filter === "geen") items.push(...art.map((a) => ({ soort: "art" as const, art: a })));
    }
    items = items.filter((it) => {
      if (it.soort === "art") return (cat === "alles" || categorieArtikel(it.art) === cat) && (!woorden.length || past(zonderAccenten(it.art.naam)));
      const e = it.ex;
      if (cat !== "alles" && categorieExemplaar(e) !== cat) return false;
      if (filter === "wijzigen" && !teWijzigen.has(e.id)) return false;
      if (filter === "gestegen" && !stijgers.has(e.id)) return false;
      if (filter === "label" && e.label_status === "gestickerd") return false;
      if (filter === "gereserveerd" && e.status !== "gereserveerd") return false;
      if (woorden.length) {
        const t = zonderAccenten([e.naam, e.naam_origineel, e.set_naam, e.set_code, e.nummer, e.code, toonCode(e.code), e.taal, e.gereserveerd_voor].filter(Boolean).join(" "));
        if (!past(t)) return false;
      }
      return true;
    });
    const prijs = (it: Item) => (it.soort === "art" ? it.art.prijs ?? 0 : (catalogus ? it.ex.hartjesprijs : it.ex.verkoopprijs) ?? 0);
    return items.sort((a, b) => {
      const wa = a.soort === "ex" && band.has(a.ex.id) ? 0 : 1;
      const wb = b.soort === "ex" && band.has(b.ex.id) ? 0 : 1;
      return wa - wb || prijs(b) - prijs(a);
    });
  }, [ex, art, cat, filter, zoek, teWijzigen, stijgers, band, catalogus]);

  const aantalLabels = exemplaren.filter((e) => inVoorraad(e) && e.label_status === "te printen").length;
  const nogTePlakken = ex.filter((e) => e.label_status !== "gestickerd").length;
  const aantalGereserveerd = ex.filter((e) => e.status === "gereserveerd").length;
  const zichtbareCats = CATEGORIEEN.filter((c) => telling[c.id]);

  return (
    <div className="scherm">
      <header className="kop">
        <div>
          <h1>{PLAATS[opslag].naam}</h1>
          <p className="kop-sub">
            {catalogus ? "Te koop op de beurs · " : "Onze stock, niet zichtbaar voor klanten · "}
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
        <p className="uitleg-vault">Nieuwe kaarten uit ruil en inkoop komen hier, tot ze een hartje krijgen en naar de catalogus gaan.</p>
      )}

      {zichtbareCats.length > 1 && (
        <div className="categorieen" role="tablist">
          <button className={cat === "alles" ? "aan" : ""} onClick={() => setCat("alles")}>Alles</button>
          {zichtbareCats.map((c) => (
            <button key={c.id} className={cat === c.id ? "aan" : ""} onClick={() => setCat(cat === c.id ? "alles" : c.id)}>
              {c.label} <span>{telling[c.id]}</span>
            </button>
          ))}
        </div>
      )}

      <div className="zoekbalk">
        <Icoon naam="zoek" maat={18} />
        <input value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder="Zoek op naam, set, nummer of code" inputMode="search" />
        {zoek && <button className="wis" onClick={() => setZoek("")} aria-label="Wissen"><Icoon naam="kruis" maat={16} /></button>}
      </div>

      <div className="chips">
        {catalogus && teWijzigen.size > 0 && <FilterChip aan={filter === "wijzigen"} onClick={() => setFilter(filter === "wijzigen" ? "geen" : "wijzigen")} rood>Te wijzigen {teWijzigen.size}</FilterChip>}
        {!catalogus && stijgers.size > 0 && <FilterChip aan={filter === "gestegen"} onClick={() => setFilter(filter === "gestegen" ? "geen" : "gestegen")}>Waarde gestegen {stijgers.size}</FilterChip>}
        {nogTePlakken > 0 && <FilterChip aan={filter === "label"} onClick={() => setFilter(filter === "label" ? "geen" : "label")}>Label nog niet geplakt {nogTePlakken}</FilterChip>}
        {aantalGereserveerd > 0 && <FilterChip aan={filter === "gereserveerd"} onClick={() => setFilter(filter === "gereserveerd" ? "geen" : "gereserveerd")}>Gereserveerd {aantalGereserveerd}</FilterChip>}
      </div>

      {lijst.length === 0 ? (
        aantalStuks === 0 ? (
          <Leeg titel={catalogus ? "De catalogus is leeg" : "De vault is leeg"} tekst={catalogus ? "Voeg kaarten toe, of laad de testset in via Meer." : "Kaarten die je bijhoudt voor later komen hier."}>
            <button className="knop" onClick={() => openToevoegen(undefined, undefined, opslag)}><Icoon naam="plus" maat={18} /> Toevoegen</button>
          </Leeg>
        ) : (
          <Leeg titel="Niets gevonden" tekst="Probeer een andere zoekterm of filter." />
        )
      ) : (
        <div className="raster">
          {lijst.map((it, i) => it.soort === "ex"
            ? <Tegel key={it.ex.id} ex={it.ex} i={i} band={band.get(it.ex.id)} vault={!catalogus} />
            : <ArtikelTegel key={it.art.id} a={it.art} i={i} />)}
        </div>
      )}
    </div>
  );
}

function FilterChip({ aan, onClick, children, rood }: { aan: boolean; onClick: () => void; children: React.ReactNode; rood?: boolean }) {
  return <button className={`chip${aan ? " aan" : ""}${rood ? " rood" : ""}`} onClick={onClick}>{children}</button>;
}

export function Tegel({ ex, i, band, vault }: { ex: Exemplaar; i: number; band?: TeWijzigen; vault?: boolean }) {
  const prijs = ex.opslag === "vitrine" ? ex.hartjesprijs : ex.verkoopprijs;
  const duur = (prijs ?? 0) >= 50;
  return (
    <button
      className={`tegel${band && !vault ? " wijzig" : ""}${duur ? " holo" : ""}`}
      style={{ ["--i" as string]: Math.min(i, 24) }}
      onClick={() => openExemplaar(ex.id)}
    >
      <KaartFoto src={ex.afbeelding} alt={ex.naam} />
      <div className="tegel-info">
        <div className="tegel-naam">{ex.naam}</div>
        <div className="tegel-set">{[ex.set_code, ex.nummer].filter(Boolean).join(" ") || (ex.soort === "eigen product" ? "Bind'r" : ex.soort)}</div>
        <Badges ex={ex} />
        <div className="tegel-onder">
          {ex.opslag === "vitrine" ? <Hartje prijs={ex.hartjesprijs} /> : <span className="waarde">{euro(ex.verkoopprijs)}</span>}
          {ex.label_status !== "gestickerd" && <span className="label-stip" title="Label nog niet geplakt"><Icoon naam="label" maat={14} /></span>}
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
    <button className="tegel artikel-tegel" style={{ ["--i" as string]: Math.min(i, 24) }} onClick={() => openArtikel(a.id)}>
      <div className={`artikel-vlak ${categorieArtikel(a)}`}>
        <Icoon naam={a.soort === "eigen product" ? "binder" : a.soort === "bulk" ? "stapel" : "doos"} maat={40} />
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
