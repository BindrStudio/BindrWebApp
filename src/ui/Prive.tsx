// Privé ⇄ Bind'r (Profiel): kaarten uit je eigen verzameling inbrengen in de zaak, of kaarten van de
// zaak meenemen naar privé. Zonder geld. Inbreng = een kost betaald met privémiddelen, aan de marktwaarde
// van vandaag (100%, per kaart aan te passen, met een screenshot als staving); naar privé = aan de
// aankoopwaarde (geen omzet).
import { useMemo, useState } from "react";
import { huidig, inbrengBestaand, kanNieuweBoekhouding, meld, OUD_SCHEMA, print, prive, useApp, wijzigVeel } from "../state";
import type { Exemplaar, Regel, Transactie } from "../types";
import { inVoorraad } from "../lib/exemplaar";
import { regelInbreng, regelUit, rond2 } from "../lib/kassa";
import { euro, getal, zonderAccenten } from "../lib/format";
import { metFactuurBron, verwervingen } from "../lib/boekhouding";
import { marktwaardeVan } from "../lib/markt";
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
  const { exemplaren, transacties } = useApp();
  // Zelf toegevoegd, nog niet gekocht of ingebracht (eigen producten van Bind'r niet: die kocht niemand).
  // Met een factuur gekocht (Cardmarket, winkel): die kost staat al in Dexxter, dus niet in deze lijst.
  const zelf = useMemo(() => { const v = verwervingen(transacties); return exemplaren.filter((e) => inVoorraad(e) && !v.has(e.id) && e.soort !== "eigen product" && !metFactuurBron(e.aankoopbron)); }, [exemplaren, transacties]);
  const [bron, setBron] = useState<"nieuw" | "bestaand">(zelf.length ? "bestaand" : "nieuw");
  return (
    <>
      <Segment<"nieuw" | "bestaand"> waarde={bron} onKies={setBron} opties={[{ waarde: "bestaand", label: `Al in de app (${zelf.length})` }, { waarde: "nieuw", label: "Nieuwe kaart" }]} />
      {bron === "nieuw" ? <InbrengNieuw kan={kan} onKlaar={onKlaar} /> : <InbrengBestaand kan={kan} onKlaar={onKlaar} zelf={zelf} />}
    </>
  );
}

/** Uitleg bij de waarde van een inbreng: de marktwaarde van vandaag, per kaart aan te passen. */
function WaardeUitleg() {
  return (
    <p className="zacht klein">Een inbreng telt aan de marktwaarde van vandaag (100%): wat de kaart nu waard is, niet wat je er ooit voor betaalde. Klopt de marktwaarde niet (andere conditie, een rare uitschieter), pas ze dan per kaart aan. Een screenshot van Cardmarket is je staving.</p>
  );
}

/** Het bedrag van één kaart: de marktwaarde, of wat je zelf invult. */
function WaardeVeld({ naam, markt, waarde, onWaarde }: { naam: string; markt: { waarde: number; bron: string } | null; waarde: string | undefined; onWaarde: (w: string | undefined) => void }) {
  const eigen = waarde !== undefined;
  return (
    <div className="inbreng-waarde" onClick={(x) => x.stopPropagation()}>
      <label>
        <span className="zacht klein">Waarde €</span>
        <input inputMode="decimal" placeholder={markt ? String(markt.waarde).replace(".", ",") : "Marktwaarde"} aria-label={`Waarde van ${naam}`}
          value={waarde ?? ""} onChange={(x) => onWaarde(x.target.value === "" ? undefined : x.target.value)} />
      </label>
      <span className="zacht klein">{eigen ? (markt ? `eigen schatting · markt ${euro(markt.waarde)}` : "eigen schatting") : markt ? markt.bron : "geen marktwaarde: vul ze in"}</span>
      {eigen && markt && <button type="button" className="tekstknop klein" onClick={() => onWaarde(undefined)}>Marktwaarde</button>}
    </div>
  );
}

/** De gekozen waarde van één kaart (zelf ingevuld gaat voor), met de bron voor het bewijs. */
function gekozenWaarde(markt: { waarde: number; bron: string } | null, eigen: string | undefined): { waarde: number; bron: string } | null {
  const m = getal(eigen ?? "");
  if (eigen !== undefined && m != null && m > 0) {
    return { waarde: rond2(m), bron: markt && rond2(m) !== markt.waarde ? `eigen schatting (${markt.bron}: ${euro(markt.waarde)})` : markt?.bron ?? "eigen schatting" };
  }
  return markt;
}

const LIJKT_PRIVE = /priv|eigen|collectie|verzameling/i;

/**
 * Kaarten die al in de app staan (zelf toegevoegd, bv. de eigen verzameling bij de start) maar nog niet
 * als aankoop of inbreng in de boeken staan. Je kiest welke uit privé komen; elke kaart krijgt haar
 * marktwaarde (of wat je zelf invult) als aankoopprijs, alles samen één bewijs PB-…. Wat met een factuur
 * gekocht werd, duid je apart aan: die kost staat al in Dexxter.
 */
function InbrengBestaand({ kan, onKlaar, zelf }: { kan: boolean; onKlaar: (t: Transactie) => void; zelf: Exemplaar[] }) {
  const { gids, instellingen, gedeeltelijk } = useApp();
  const [q, setQ] = useState("");
  const [toon, setToon] = useState(40);
  const [eigen, setEigen] = useState<Record<string, string>>({}); // zelf ingevulde marktwaarde
  const [gekozen, setGekozen] = useState<Set<string>>(() => new Set(zelf.filter((e) => !e.aankoopbron || LIJKT_PRIVE.test(e.aankoopbron)).map((e) => e.id)));
  const [fotos, setFotos] = useState<string[]>([]);
  const markt = useMemo(() => new Map(zelf.map((e) => [e.id, marktwaardeVan(e, gids, instellingen)])), [zelf, gids, instellingen]);
  const waardeVan = (e: Exemplaar) => gekozenWaarde(markt.get(e.id) ?? null, eigen[e.id]);
  const lijst = useMemo(() => {
    const w = zonderAccenten(q.trim()).split(/\s+/).filter(Boolean);
    return zelf.filter((e) => !w.length || w.every((x) => zonderAccenten([e.naam, e.set_code, e.nummer, e.code, e.aankoopbron].filter(Boolean).join(" ")).includes(x)));
  }, [zelf, q]);
  const keuze = zelf.filter((e) => gekozen.has(e.id));
  const metWaarde = keuze.map((e) => ({ e, m: waardeVan(e) }));
  const totaal = rond2(metWaarde.reduce((s, x) => s + (x.m?.waarde ?? 0), 0));
  const zonder = metWaarde.filter((x) => !x.m).length;
  const wissel = (id: string) => { const n = new Set(gekozen); if (n.has(id)) n.delete(id); else n.add(id); setGekozen(n); };
  const boek = () => {
    try {
      const regels = metWaarde.map(({ e, m }) => regelInbreng(e, m?.waarde ?? 0, m?.waarde ?? null, m?.bron ?? null, 100));
      onKlaar(inbrengBestaand(regels, fotos));
    } catch (e) {
      meld(e instanceof Error ? e.message : String(e), "fout");
    }
  };
  const [factuurVraag, setFactuurVraag] = useState(false);
  const metFactuur = () => {
    const ids = keuze.map((e) => e.id);
    wijzigVeel(ids, { aankoopbron: "factuur" });
    setGekozen(new Set());
    setFactuurVraag(false);
    meld(`${ids.length === 1 ? "1 kaart" : `${ids.length} kaarten`} aangeduid als gekocht met factuur`);
  };
  if (gedeeltelijk) return <p className="nakijken klein">Zonder internet kent de app enkel de voorraad en de laatste maanden. Breng kaarten in als je weer online bent.</p>;
  if (!zelf.length) return <p className="zacht klein">Alle kaarten in de app staan al als aankoop of inbreng in de boeken.</p>;
  return (
    <section className="prive-blok">
      <p className="zacht klein">Kaarten die je zelf toevoegde, zonder aankoop in de app: bv. je verzameling bij de start. Kies wat uit je privéverzameling komt. Gekocht met een factuur (Cardmarket, winkel)? Kies ze en duid ze onderaan aan als <em>met factuur</em>: hun kost staat al in Dexxter.</p>
      <div className="zoekbalk">
        <Icoon naam="zoek" maat={18} />
        <input value={q} onChange={(e) => { setQ(e.target.value); setToon(40); }} placeholder="Naam, set, code of bron" aria-label="Zoek in de zelf toegevoegde kaarten" />
      </div>
      <div className="lijst-acties">
        <button className="tekstknop klein" onClick={() => setGekozen(new Set([...gekozen, ...lijst.map((e) => e.id)]))}>Alles kiezen</button>
        <button className="tekstknop klein" onClick={() => { const n = new Set(gekozen); for (const e of lijst) n.delete(e.id); setGekozen(n); }}>Niets kiezen</button>
        <span className="zacht klein">{keuze.length} gekozen</span>
      </div>
      <ul className="resultaten inbreng-lijst">
        {lijst.slice(0, toon).map((e) => {
          const m = waardeVan(e);
          return (
            <li key={e.id} className={gekozen.has(e.id) ? "open" : ""}>
              <button onClick={() => wissel(e.id)} aria-pressed={gekozen.has(e.id)}>
                <KaartFoto src={e.afbeelding} alt={e.naam} klein kaart={e} />
                <span className="res-tekst">
                  <strong>{e.naam}</strong>
                  <span className="zacht">{[e.set_code, e.nummer, e.conditie].filter(Boolean).join(" ")} · {e.aankoopbron || "zelf toegevoegd"}</span>
                  {!gekozen.has(e.id) && <span className="zacht klein">{m ? `markt ${euro(m.waarde)} · ${m.bron}` : "geen marktwaarde"}</span>}
                </span>
                <span className="rechts">{gekozen.has(e.id) ? <Icoon naam="check" maat={20} /> : null}</span>
              </button>
              {gekozen.has(e.id) && (
                <WaardeVeld naam={e.naam} markt={markt.get(e.id) ?? null} waarde={eigen[e.id]}
                  onWaarde={(w) => { const n = { ...eigen }; if (w === undefined) delete n[e.id]; else n[e.id] = w; setEigen(n); }} />
              )}
            </li>
          );
        })}
      </ul>
      {lijst.length > toon && <button className="knop zacht breed" onClick={() => setToon(toon + 40)}>Toon meer</button>}
      {keuze.length > 0 && (
        <>
          <WaardeUitleg />
          {zonder > 0 && <p className="nakijken klein">{zonder === 1 ? "Eén gekozen kaart heeft" : `${zonder} gekozen kaarten hebben`} nog geen waarde. Vul ze in of laat ze uit.</p>}
          <div className="afreken-fotos">
            <FotoRij fotos={fotos} onWeg={(i) => setFotos(fotos.filter((_, j) => j !== i))} />
            <FotoKnop klein tekst={fotos.length ? "Nog een foto" : "Screenshot van de marktwaarde"} onFoto={(f) => setFotos((x) => [...x, f])} />
          </div>
          <div className="afreken-overzicht">
            <div className="afreken-netto"><span>Inbreng ({keuze.length} {keuze.length === 1 ? "kaart" : "kaarten"})</span><strong>{euro(totaal)}</strong></div>
          </div>
          <button className="knop groot" onClick={boek} disabled={!kan || zonder > 0}><Icoon naam="check" maat={20} /> {keuze.length} inbrengen in Bind'r</button>
          {factuurVraag ? (
            <div className="knoppenrij">
              <button className="knop zacht" onClick={metFactuur}>Ja, {keuze.length === 1 ? "deze kaart" : `deze ${keuze.length} kaarten`}</button>
              <button className="knop zacht" onClick={() => setFactuurVraag(false)}>Toch niet</button>
            </div>
          ) : (
            <button className="knop zacht" onClick={() => setFactuurVraag(true)}><Icoon naam="boek" maat={18} /> {keuze.length === 1 ? "Gekocht met factuur" : `${keuze.length} gekocht met factuur`}</button>
          )}
          <p className="zacht klein">Met factuur: de kaart blijft in de voorraad, maar komt niet als inbreng in de boeken (de factuur staat al in Dexxter). Vul de aankoopprijs in bij de kaart zelf.</p>
        </>
      )}
    </section>
  );
}

function InbrengNieuw({ kan, onKlaar }: { kan: boolean; onKlaar: (t: Transactie) => void }) {
  const [regels, setRegels] = useState<Regel[]>([]);
  const [eigen, setEigen] = useState<Record<string, string>>({}); // zelf ingevulde waarde per regel (op code)
  const [kiezen, setKiezen] = useState(false);
  const [fotos, setFotos] = useState<string[]>([]);
  const sleutel = (r: Regel, i: number) => r.nieuw?.code ?? String(i);
  const marktVan = (r: Regel) => (r.referentie ?? 0) > 0 ? { waarde: rond2(r.referentie!), bron: r.referentie_bron ?? "marktwaarde" } : null;
  const metPrijs = regels.map((r, i) => {
    const w = gekozenWaarde(marktVan(r), eigen[sleutel(r, i)]);
    return { ...r, pct: 100, prijs: w?.waarde ?? 0, referentie: w?.waarde ?? null, referentie_bron: w?.bron ?? null };
  });
  const totaal = rond2(metPrijs.reduce((x, r) => x + r.prijs, 0));
  const zonder = metPrijs.filter((r) => !r.prijs).length;
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
            <li key={r.nieuw?.id ?? i} className="regel in regel-met-waarde">
              <KaartFoto src={r.nieuw?.afbeelding ?? null} alt={r.naam} klein kaart={r.nieuw ?? undefined} />
              <div className="regel-tekst">
                <strong>{r.naam}</strong>
                <span className="zacht klein">{[r.nieuw?.set_code, r.nieuw?.nummer].filter(Boolean).join(" ")} {r.nieuw?.conditie ?? ""}</span>
              </div>
              <div className="regel-prijs"><strong>{euro(r.prijs)}</strong></div>
              <button className="rond-knop" onClick={() => { setRegels(regels.filter((_, j) => j !== i)); const n = { ...eigen }; delete n[sleutel(regels[i], i)]; setEigen(n); }} aria-label="Weg"><Icoon naam="kruis" maat={14} /></button>
              <WaardeVeld naam={r.naam} markt={marktVan(regels[i])} waarde={eigen[sleutel(regels[i], i)]}
                onWaarde={(w) => { const k = sleutel(regels[i], i); const n = { ...eigen }; if (w === undefined) delete n[k]; else n[k] = w; setEigen(n); }} />
            </li>
          ))}
        </ul>
      )}
      <button className="knop zacht" onClick={() => setKiezen(true)} disabled={!kan}><Icoon naam="plus" maat={18} /> Kaart toevoegen</button>
      {regels.length > 0 && (
        <>
          <WaardeUitleg />
          {zonder > 0 && <p className="nakijken klein">{zonder === 1 ? "Eén kaart heeft" : `${zonder} kaarten hebben`} nog geen waarde. Vul ze in of laat ze uit.</p>}
          <div className="afreken-fotos">
            <FotoRij fotos={fotos} onWeg={(i) => setFotos(fotos.filter((_, j) => j !== i))} />
            <FotoKnop klein tekst={fotos.length ? "Nog een foto" : "Screenshot van de marktwaarde"} onFoto={(f) => setFotos((x) => [...x, f])} />
          </div>
          <div className="afreken-overzicht">
            <div className="afreken-netto"><span>Inbreng ({regels.length} {regels.length === 1 ? "kaart" : "kaarten"})</span><strong>{euro(totaal)}</strong></div>
          </div>
          <button className="knop groot" onClick={boek} disabled={!kan || zonder > 0}><Icoon naam="check" maat={20} /> Inbrengen in Bind'r</button>
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
