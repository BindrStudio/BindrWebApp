// Privé ⇄ Bind'r (Profiel): kaarten uit je eigen verzameling inbrengen in de zaak, of kaarten van de
// zaak meenemen naar privé. Zonder geld. Inbreng = een kost betaald met privémiddelen, aan de waarde die
// je kiest (aangeraden: zoals bij een vreemde verkoper); naar privé = aan de aankoopwaarde (geen omzet).
import { useMemo, useState } from "react";
import { huidig, kanNieuweBoekhouding, meld, OUD_SCHEMA, print, prive, useApp } from "../state";
import type { Regel, Transactie } from "../types";
import { inVoorraad } from "../lib/exemplaar";
import { regelUit, rond2 } from "../lib/kassa";
import { euro, zonderAccenten } from "../lib/format";
import { toonCode } from "../lib/code";
import { Icoon, KaartFoto, Segment, Sheet } from "./common";
import { KlantKaart } from "./Kassa";
import { FotoKnop, FotoRij } from "./Fotos";
import { BewijsKnop, BewijsSheet } from "./Boekhouding";

export function Prive({ onSluit }: { onSluit: () => void }) {
  const s = useApp();
  const kan = kanNieuweBoekhouding(s);
  const [modus, setModus] = useState<"in" | "uit">("in");
  const [klaar, setKlaar] = useState<Transactie | null>(null);
  const [bewijs, setBewijs] = useState(false);
  const geboekt = klaar ? s.transacties.find((t) => t.id === klaar.id) ?? klaar : null;
  const nieuweIds = geboekt ? geboekt.regels.filter((r) => r.nieuw?.id).map((r) => r.nieuw!.id) : [];
  const tePrinten = s.exemplaren.filter((e) => nieuweIds.includes(e.id) && e.label_status === "te printen");

  return (
    <Sheet titel="Privé ⇄ Bind'r" onSluit={onSluit} vol>
      {!kan && <p className="nakijken">{OUD_SCHEMA}</p>}
      {geboekt ? (
        <div className="gelukt">
          <img src="img/eend.png" alt="" width={96} height={96} />
          <h2>{geboekt.regels.some((r) => r.richting === "in") ? "Ingebracht uit privé" : "Naar privé"}</h2>
          <p className="zacht">{geboekt.regels.length} {geboekt.regels.length === 1 ? "kaart" : "kaarten"} · {euro(rond2(geboekt.regels.reduce((x, r) => x + r.prijs, 0)))}</p>
          {geboekt.status === "conflict" && <p className="nakijken">Niet alles kon: een kaart was al weg. Bekijk de transactie in de historiek.</p>}
          <BewijsKnop t={geboekt} onOpen={() => setBewijs(true)} />
          <div className="knoppenrij">
            {tePrinten.length > 0 && <button className="knop" onClick={() => void print(tePrinten.map((e) => e.id))}><Icoon naam="printer" maat={18} /> Print {tePrinten.length === 1 ? "label" : `${tePrinten.length} labels`}</button>}
            <button className="knop zacht" onClick={() => setKlaar(null)}>Nog iets</button>
          </div>
          {bewijs && <BewijsSheet id={geboekt.id} onSluit={() => setBewijs(false)} />}
        </div>
      ) : (
        <>
          <Segment<"in" | "uit"> waarde={modus} onKies={setModus} opties={[{ waarde: "in", label: "Uit privé inbrengen" }, { waarde: "uit", label: "Naar privé" }]} />
          {modus === "in" ? <Inbreng kan={kan} onKlaar={setKlaar} /> : <NaarPrive kan={kan} onKlaar={setKlaar} />}
        </>
      )}
    </Sheet>
  );
}

function Inbreng({ kan, onKlaar }: { kan: boolean; onKlaar: (t: Transactie) => void }) {
  const { instellingen } = useApp();
  const standaard = Math.round(instellingen.inkoopPct / 5) * 5;
  const [regels, setRegels] = useState<Regel[]>([]);
  const [pct, setPct] = useState(standaard);
  const [kiezen, setKiezen] = useState(false);
  const [fotos, setFotos] = useState<string[]>([]);
  const metPrijs = regels.map((r) => ({ ...r, pct, prijs: rond2(((r.referentie ?? 0) * pct) / 100) }));
  const markt = rond2(regels.reduce((x, r) => x + (r.referentie ?? 0), 0));
  const totaal = rond2(metPrijs.reduce((x, r) => x + r.prijs, 0));
  const zonder = regels.filter((r) => !(r.referentie ?? 0)).length;
  const boek = () => {
    try {
      onKlaar(prive(metPrijs, [], fotos));
    } catch (e) {
      meld(e instanceof Error ? e.message : String(e), "fout");
    }
  };
  return (
    <section className="prive-blok">
      <p className="zacht klein">Kaarten uit je eigen verzameling die Bind'r verkoopt. Ze komen in de vault met een eigen label, en de waarde telt als kost (betaald met je eigen middelen). Er gaat geen geld over en weer.</p>
      {regels.length > 0 && (
        <ul className="lijst">
          {metPrijs.map((r, i) => (
            <li key={r.nieuw?.id ?? i} className="regel in">
              <KaartFoto src={r.nieuw?.afbeelding ?? null} alt={r.naam} klein kaart={r.nieuw ?? undefined} />
              <div className="regel-tekst">
                <strong>{r.naam}</strong>
                <span className="zacht klein">{[r.nieuw?.set_code, r.nieuw?.nummer].filter(Boolean).join(" ")} {r.nieuw?.conditie ?? ""} · {r.referentie ? `markt ${euro(r.referentie)}` : "geen marktwaarde"}</span>
              </div>
              <div className="regel-prijs"><strong>{euro(r.prijs)}</strong></div>
              <button className="rond-knop" onClick={() => setRegels(regels.filter((_, j) => j !== i))} aria-label="Weg"><Icoon naam="kruis" maat={14} /></button>
            </li>
          ))}
        </ul>
      )}
      <button className="knop zacht" onClick={() => setKiezen(true)} disabled={!kan}><Icoon naam="plus" maat={18} /> Kaart toevoegen</button>
      {regels.length > 0 && (
        <>
          <div className="prive-pct">
            <span className="veld-label">Waarde: % van de marktwaarde ({euro(markt)})</span>
            <div className="kiezer">
              {[...new Set([standaard, 80, 90, 100])].sort((a, b) => a - b).map((p) => (
                <button key={p} type="button" className={`chip${pct === p ? " aan" : ""}`} onClick={() => setPct(p)}>{p}%{p === standaard ? " · aangeraden" : ""}</button>
              ))}
            </div>
            <p className="zacht klein">{pct === 100
              ? "100% van de marktwaarde: let op, als een kaart sinds je aankoop in waarde steeg, wordt die winst zo een aftrekbare kost. Bespreek dit met je boekhouder."
              : "Zoals bij een vreemde verkoper (je gewone inkooppercentage): dat raden de bronnen aan."}</p>
          </div>
          {zonder > 0 && <p className="nakijken klein">{zonder === 1 ? "Eén kaart heeft" : `${zonder} kaarten hebben`} geen marktwaarde en telt aan € 0.</p>}
          <div className="afreken-fotos">
            <FotoRij fotos={fotos} onWeg={(i) => setFotos(fotos.filter((_, j) => j !== i))} />
            <FotoKnop klein tekst={fotos.length ? "Nog een foto" : "Screenshot van de marktwaarde"} onFoto={(f) => setFotos((x) => [...x, f])} />
          </div>
          <div className="afreken-overzicht">
            <div className="afreken-netto"><span>Inbreng ({regels.length} {regels.length === 1 ? "kaart" : "kaarten"})</span><strong>{euro(totaal)}</strong></div>
          </div>
          <button className="knop groot" onClick={boek} disabled={!kan}><Icoon naam="check" maat={20} /> Inbrengen in Bind'r</button>
        </>
      )}
      {kiezen && <KlantKaart titel="Kaart uit je verzameling" bezet={regels.map((r) => r.nieuw?.code).filter(Boolean) as string[]}
        onRegel={(r) => setRegels((x) => [...x, r])} onSluit={() => setKiezen(false)} />}
    </section>
  );
}

function NaarPrive({ kan, onKlaar }: { kan: boolean; onKlaar: (t: Transactie) => void }) {
  const { exemplaren } = useApp();
  const [q, setQ] = useState("");
  const [gekozen, setGekozen] = useState<Set<string>>(new Set());
  const [toon, setToon] = useState(30);
  const lijst = useMemo(() => {
    const w = zonderAccenten(q.trim()).split(/\s+/).filter(Boolean);
    return exemplaren.filter(inVoorraad).filter((e) => !w.length || w.every((x) => zonderAccenten([e.naam, e.set_code, e.nummer, e.code, toonCode(e.code)].filter(Boolean).join(" ")).includes(x)))
      .sort((a, b) => b.aangemaakt_op.localeCompare(a.aangemaakt_op));
  }, [exemplaren, q]);
  const keuze = exemplaren.filter((e) => gekozen.has(e.id));
  const totaal = rond2(keuze.reduce((x, e) => x + (e.aankoopprijs ?? 0), 0));
  const zonder = keuze.filter((e) => e.aankoopprijs == null).length;
  const wissel = (id: string) => { const n = new Set(gekozen); if (n.has(id)) n.delete(id); else n.add(id); setGekozen(n); };
  const boek = () => {
    try {
      const h = huidig();
      const weg = [...gekozen].map((id) => h.exemplaren.find((e) => e.id === id)!).filter(Boolean).map((e) => regelUit(e, e.aankoopprijs ?? 0));
      onKlaar(prive([], weg));
    } catch (e) {
      meld(e instanceof Error ? e.message : String(e), "fout");
    }
  };
  return (
    <section className="prive-blok">
      <p className="zacht klein">Kaarten die je uit de zaak meeneemt voor je eigen verzameling. Ze gaan uit de voorraad aan hun aankoopwaarde: dat haalt de kost terug weg. Geen verkoop en geen omzet.</p>
      <div className="zoekbalk">
        <Icoon naam="zoek" maat={18} />
        <input value={q} onChange={(e) => { setQ(e.target.value); setToon(30); }} placeholder="Naam, set, nummer of code" aria-label="Zoek in de voorraad" />
      </div>
      <ul className="resultaten">
        {lijst.slice(0, toon).map((e) => (
          <li key={e.id} className={gekozen.has(e.id) ? "open" : ""}>
            <button onClick={() => wissel(e.id)} aria-pressed={gekozen.has(e.id)}>
              <KaartFoto src={e.afbeelding} alt={e.naam} klein kaart={e} />
              <span className="res-tekst">
                <strong>{e.naam}</strong>
                <span className="zacht">{[e.set_code, e.nummer].filter(Boolean).join(" ")} · <span className="code">{toonCode(e.code)}</span></span>
              </span>
              <span className="rechts">{gekozen.has(e.id) ? <Icoon naam="check" maat={20} /> : <span className="zacht klein">{e.aankoopprijs != null ? euro(e.aankoopprijs) : "?"}</span>}</span>
            </button>
          </li>
        ))}
      </ul>
      {lijst.length > toon && <button className="knop zacht breed" onClick={() => setToon(toon + 30)}>Toon meer</button>}
      {keuze.length > 0 && (
        <div className="sheet-actie">
          {zonder > 0 && <p className="nakijken klein">{zonder === 1 ? "Eén kaart heeft" : `${zonder} kaarten hebben`} geen aankoopprijs (telt aan € 0).</p>}
          <button className="knop groot" onClick={boek} disabled={!kan}><Icoon naam="check" maat={20} /> {keuze.length} naar privé · {euro(totaal)}</button>
        </div>
      )}
    </section>
  );
}
