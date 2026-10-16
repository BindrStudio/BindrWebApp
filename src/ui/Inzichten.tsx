// Inzichten (Profiel › Inzichten): geen kassa, wel wat je wil weten na een paar beurzen.
// Welke sets en Pokémon verkopen, in welke prijsklasse, wanneer, hoe snel, en wat blijft liggen.
import { useMemo, useState } from "react";
import { openExemplaar, useApp } from "../state";
import {
  blijftLiggen, groepeer, kerncijfers, perPrijsklasse, perUur, verkochteStukken, type Groep, type VerkochtStuk,
} from "../lib/inzichten";
import { PRODUCTSOORTEN } from "../lib/kassa";
import { TALEN } from "../types";
import { euro } from "../lib/format";
import { toonCode } from "../lib/code";
import { Icoon, Segment, Sheet } from "./common";
import { useSoortVan } from "./Historiek";

type Periode = "alles" | "jaar" | "30" | string; // of een beurs-id
type Maat = "omzet" | "aantal";

const taalNaam = (t: string) => TALEN.find((x) => x.code === t)?.label ?? t;

export function Inzichten({ onSluit }: { onSluit: () => void }) {
  const s = useApp();
  const soortVan = useSoortVan();
  const [periode, setPeriode] = useState<Periode>("alles");
  const [maat, setMaat] = useState<Maat>("omzet");
  const alles = useMemo(() => verkochteStukken(s.transacties, s.exemplaren, s.artikelen, soortVan), [s.transacties, s.exemplaren, s.artikelen, soortVan]);
  const beurzen = s.beurzen.filter((b) => b.status !== "gepland").sort((a, b) => b.datum.localeCompare(a.datum));
  const stukken = useMemo(() => {
    const nu = Date.now();
    return alles.filter((x) => periode === "alles" ? true
      : periode === "jaar" ? x.tijd.startsWith(String(new Date().getFullYear()))
        : periode === "30" ? nu - Date.parse(x.tijd) < 30 * 86400000
          : x.beurs_id === periode);
  }, [alles, periode]);
  const k = kerncijfers(stukken);
  const kaarten = stukken.filter((x) => x.soort === "kaarten" || x.soort === "slabs");
  const sets = groepeer(kaarten, (x) => x.set, maat);
  const pokemon = groepeer(kaarten, (x) => x.pokemon, "aantal");
  const soorten = groepeer(stukken, (x) => PRODUCTSOORTEN.find((p) => p.id === x.soort)?.label ?? x.soort, maat);
  const talen = groepeer(kaarten, (x) => (x.taal ? taalNaam(x.taal) : null), maat);
  const condities = groepeer(kaarten, (x) => x.conditie, maat);
  const perBeurs = groepeer(alles, (x) => s.beurzen.find((b) => b.id === x.beurs_id)?.naam ?? null, "omzet");
  const duurste = stukken.slice().sort((a, b) => b.prijs - a.prijs).slice(0, 5);
  const snelste = kaarten.filter((x) => x.dagen != null).sort((a, b) => a.dagen! - b.dagen!)[0];
  const liggen = blijftLiggen(s.exemplaren);

  return (
    <Sheet titel="Inzichten" onSluit={onSluit} vol>
      <div className="inzicht-filter">
        <select value={periode} onChange={(e) => setPeriode(e.target.value)} aria-label="Periode">
          <option value="alles">Altijd</option>
          <option value="jaar">Dit jaar</option>
          <option value="30">Laatste 30 dagen</option>
          {beurzen.length > 0 && <optgroup label="Beurs">{beurzen.map((b) => <option key={b.id} value={b.id}>{b.naam}</option>)}</optgroup>}
        </select>
        <Segment<Maat> waarde={maat} onKies={setMaat} opties={[{ waarde: "omzet", label: "In euro" }, { waarde: "aantal", label: "In stuks" }]} />
      </div>

      {!stukken.length ? (
        <div className="leeg inzicht-leeg">
          <img src="img/eend.png" alt="" width={96} height={96} />
          <strong>Nog niets verkocht{periode !== "alles" ? " in deze periode" : ""}</strong>
          <span className="zacht">Na je eerste verkopen zie je hier wat het best loopt.</span>
        </div>
      ) : (
        <>
          <section className="inzicht-kern">
            <Kern label="Verkocht" waarde={euro(k.omzet, true)} sub={`${k.stuks} ${k.stuks === 1 ? "stuk" : "stuks"}${k.dagen > 1 ? ` op ${k.dagen} dagen` : ""}`} />
            <Kern label="Gemiddeld" waarde={k.gemiddeld != null ? euro(k.gemiddeld) : "–"} sub={k.mediaanPrijs != null ? `de helft onder ${euro(k.mediaanPrijs)}` : ""} />
            <Kern label="Marge" waarde={k.margePct != null ? `${k.margePct > 0 ? "+" : ""}${k.margePct}%` : "–"} sub={k.marge != null ? `${euro(k.marge, true)} winst` : "aankoopprijs onbekend"} />
            <Kern label="Ligt gemiddeld" waarde={k.mediaanDagen != null ? `${k.mediaanDagen} d` : "–"} sub="tot het verkocht is" />
          </section>

          {pokemon.length > 0 && (
            <section className="inzicht-blok">
              <h3><Icoon naam="hart" maat={18} /> Populairste Pokémon</h3>
              <div className="podium">
                {pokemon.slice(0, 3).map((p, i) => (
                  <div key={p.sleutel} className={`podium-plek plek-${i + 1}`}>
                    <strong>{p.sleutel}</strong>
                    <span>{p.aantal}×</span>
                    <span className="podium-trede">{i + 1}</span>
                  </div>
                ))}
              </div>
              {pokemon.length > 3 && <p className="zacht klein">Daarna: {pokemon.slice(3, 8).map((p) => `${p.sleutel} (${p.aantal})`).join(", ")}.</p>}
            </section>
          )}

          <Balken titel="Sets die het best verkopen" icoon="kaartje" groepen={sets} maat={maat} leeg="Nog geen kaarten met een set." />

          <section className="inzicht-blok">
            <h3><Icoon naam="prijs" maat={18} /> Prijsklassen <span className="zacht klein">(in euro)</span></h3>
            <Kolommen groepen={perPrijsklasse(stukken)} maat={maat} />
            <p className="zacht klein">{besteKlasse(perPrijsklasse(stukken), maat)}</p>
          </section>

          <Balken titel="Wat verkoopt" icoon="doos" groepen={soorten} maat={maat} />

          <div className="inzicht-twee">
            <Balken titel="Talen" groepen={talen} maat={maat} klein />
            <Balken titel="Condities" groepen={condities} maat={maat} klein />
          </div>

          <section className="inzicht-blok">
            <h3><Icoon naam="klok" maat={18} /> Wanneer er verkocht wordt</h3>
            <Kolommen groepen={perUur(stukken)} maat={maat} uur />
            <p className="zacht klein">{drukstUur(perUur(stukken))}</p>
          </section>

          {periode === "alles" && perBeurs.length > 1 && <Balken titel="Beste beurzen" icoon="vitrine" groepen={perBeurs} maat="omzet" />}

          <section className="inzicht-blok">
            <h3><Icoon naam="op" maat={18} /> Duurste verkopen</h3>
            <ol className="inzicht-top">
              {duurste.map((x, i) => <li key={i}><span>{x.naam}{x.code ? <span className="code"> {toonCode(x.code)}</span> : null}</span><strong>{euro(x.prijs)}</strong></li>)}
            </ol>
            {snelste && snelste.dagen != null && <p className="zacht klein">Snelste verkoop: {snelste.naam}, {snelste.dagen === 0 ? "dezelfde dag" : `na ${snelste.dagen} ${snelste.dagen === 1 ? "dag" : "dagen"}`} in de catalogus.</p>}
          </section>
        </>
      )}

      {liggen.length > 0 && (
        <section className="inzicht-blok">
          <h3><Icoon naam="klok" maat={18} /> Ligt al lang in de catalogus</h3>
          <p className="zacht klein">Tijd voor een ander hartje, of naar de vault?</p>
          <ul className="lijst">
            {liggen.map(({ e, dagen }) => (
              <li key={e.id}>
                <button className="lijst-knop" onClick={() => openExemplaar(e.id)}>
                  <span className="lijst-naam"><strong>{e.naam}</strong><span className="zacht klein">{[e.set_code, e.nummer].filter(Boolean).join(" ")} · {dagen} dagen</span></span>
                  <span className="rechts">{euro(e.hartjesprijs)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Sheet>
  );
}

function Kern({ label, waarde, sub }: { label: string; waarde: string; sub?: string }) {
  return <div className="kern"><span className="zacht klein">{label}</span><strong>{waarde}</strong>{sub && <span className="zacht klein">{sub}</span>}</div>;
}

function Balken({ titel, icoon, groepen, maat, leeg, klein = false }: { titel: string; icoon?: string; groepen: Groep[]; maat: Maat; leeg?: string; klein?: boolean }) {
  const [alles, setAlles] = useState(false);
  const top = groepen[0] ? Math.max(...groepen.map((g) => g[maat])) : 0;
  const toon = alles ? groepen : groepen.slice(0, klein ? 4 : 6);
  return (
    <section className={`inzicht-blok${klein ? " klein" : ""}`}>
      <h3>{icoon && <Icoon naam={icoon} maat={18} />} {titel}</h3>
      {!groepen.length ? <p className="zacht klein">{leeg ?? "Nog niets."}</p> : (
        <ul className="balken">
          {toon.map((g, i) => (
            <li key={g.sleutel} style={{ ["--i" as string]: i }}>
              <span className="balk-label">{g.sleutel}</span>
              <span className="balk"><span style={{ width: `${top ? Math.max(2, (g[maat] / top) * 100) : 0}%` }} /></span>
              <span className="balk-waarde">{maat === "omzet" ? euro(g.omzet, true) : g.aantal}</span>
            </li>
          ))}
        </ul>
      )}
      {groepen.length > toon.length && <button className="tekstknop klein" onClick={() => setAlles(true)}>Toon alle {groepen.length}</button>}
    </section>
  );
}

function Kolommen({ groepen, maat, uur = false }: { groepen: Groep[]; maat: Maat; uur?: boolean }) {
  const top = Math.max(1, ...groepen.map((g) => g[maat]));
  return (
    <div className={`kolommen${uur ? " uren" : ""}`} role="img" aria-label={groepen.map((g) => `${g.sleutel}: ${maat === "omzet" ? euro(g.omzet) : g.aantal}`).join(", ")}>
      {groepen.map((g, i) => (
        <div key={g.sleutel} className="kolom" style={{ ["--i" as string]: i }}>
          <span className="kolom-waarde">{g[maat] ? (maat === "omzet" ? euro(g.omzet, true) : g.aantal) : ""}</span>
          <span className="kolom-balk" style={{ height: `${(g[maat] / top) * 100}%` }} />
          <span className="kolom-label">{uur ? `${g.sleutel}u` : g.sleutel.replace(/€\s?/g, "").replace("tot ", "<")}</span>
        </div>
      ))}
    </div>
  );
}

function besteKlasse(g: Groep[], maat: Maat): string {
  const beste = g.slice().sort((a, b) => b[maat] - a[maat])[0];
  const stuks = g.slice().sort((a, b) => b.aantal - a.aantal)[0];
  if (!beste || !beste[maat]) return "";
  return maat === "omzet"
    ? `Het meeste geld komt uit ${beste.sleutel}${stuks.sleutel !== beste.sleutel ? `, de meeste stuks uit ${stuks.sleutel}` : ""}.`
    : `De meeste stuks gaan weg in ${beste.sleutel}.`;
}

function drukstUur(g: Groep[]): string {
  const beste = g.slice().sort((a, b) => b.aantal - a.aantal)[0];
  return beste && beste.aantal ? `Het drukst tussen ${beste.sleutel} en ${Number(beste.sleutel) + 1} uur: zorg dan voor genoeg handen aan de stand.` : "";
}

export type { VerkochtStuk };
