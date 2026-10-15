import { useEffect, useMemo, useRef, useState } from "react";
import {
  actieveBeurs, afrekenen, huidig, inMandje, leegMandje, meld, ongedaanMaken, openTransactie, print, totaalAanpassen,
  useApp, verwijderRegel, wijzigRegel,
} from "../state";
import type { Artikel, CatalogusKaart, Exemplaar, Regel, Transactie } from "../types";
import { CONDITIES, TALEN, VARIANTEN } from "../types";
import { inVoorraad } from "../lib/exemplaar";
import { beursCijfers, netto, regelArtikelIn, regelArtikelUit, regelIn, regelUit, totaalIn, totaalUit, type Betaling } from "../lib/kassa";
import { euro, getal, zonderAccenten } from "../lib/format";
import { nieuweCode, toonCode } from "../lib/code";
import { afbeelding } from "../lib/catalog";
import { voorstelVoor } from "../lib/pricing";
import { tril } from "../lib/camera";
import { uuid } from "../lib/uuid";
import { Badges, Hartje, Icoon, KaartFoto, Kiezer, Leeg, Segment, Sheet, Veld } from "./common";
import { MandjeActie } from "./MandjeActie";
import { CodeInvoer, FotoScanner, QrScanner } from "./Scan";
import { KiesKaart } from "./Toevoegen";
import { BeursAfsluiten, BeursStart, TransactiesLijst } from "./Beurs";

type Paneel = null | "scan" | "zoek" | "artikel" | "klantkaart" | "klantartikel" | "afrekenen" | "start" | "afsluiten" | "transacties";

export function Kassa() {
  const s = useApp();
  const beurs = actieveBeurs(s);
  const [paneel, setPaneel] = useState<Paneel>(null);
  const [klaar, setKlaar] = useState<{ t: Transactie; wisselgeld: number | null } | null>(null);
  const regels = s.mandje.regels;
  const uit = regels.map((r, i) => ({ r, i })).filter((x) => x.r.richting === "uit");
  const binnen = regels.map((r, i) => ({ r, i })).filter((x) => x.r.richting === "in");
  const n = netto(regels);
  const sluit = () => setPaneel(null);

  return (
    <div className="scherm kassa">
      <header className="kop">
        <div>
          <h1>Kassa</h1>
          <p className="kop-sub">{beurs ? beurs.naam : "Geen beurs bezig"}</p>
        </div>
        <div className="kop-knoppen">
          <button className="rond-knop groot" onClick={() => setPaneel("transacties")} aria-label="Transacties"><Icoon naam="kaartje" /></button>
        </div>
      </header>

      <BeursBalk onStart={() => setPaneel("start")} onAfsluiten={() => setPaneel("afsluiten")} />

      {klaar ? (
        <Gelukt t={klaar.t} wisselgeld={klaar.wisselgeld} onVolgende={() => setKlaar(null)} />
      ) : (
        <>
          <section className="mandje-kant">
            <div className="kant-kop">
              <h2>Wij geven</h2>
              {regels.length > 0 && <button className="tekstknop klein" onClick={() => { if (confirm("Het mandje leegmaken?")) leegMandje(); }}>Leegmaken</button>}
            </div>
            {uit.length === 0 && <p className="zacht klein kant-leeg">Scan het label achteraan de toploader, of zoek de kaart.</p>}
            {uit.map(({ r, i }) => <RegelRij key={i} r={r} i={i} />)}
            {uit.length > 1 && <TotaalRij richting="uit" totaal={totaalUit(regels)} />}
            <div className="kant-knoppen">
              <button className="knop" onClick={() => setPaneel("scan")}><Icoon naam="scan" maat={18} /> Scan</button>
              <button className="knop zacht" onClick={() => setPaneel("zoek")}><Icoon naam="zoek" maat={18} /> Zoek</button>
              <button className="knop zacht" onClick={() => setPaneel("artikel")}><Icoon naam="doos" maat={18} /> Artikel</button>
            </div>
          </section>

          <section className="mandje-kant klant">
            <div className="kant-kop">
              <h2>Wij krijgen</h2>
              <span className="zacht klein">bij ruil of inkoop</span>
            </div>
            {binnen.map(({ r, i }) => <RegelRij key={i} r={r} i={i} />)}
            {binnen.length > 1 && <TotaalRij richting="in" totaal={totaalIn(regels)} />}
            <div className="kant-knoppen">
              <button className="knop zacht" onClick={() => setPaneel("klantkaart")}><Icoon naam="plus" maat={18} /> Kaart van klant</button>
              <button className="knop zacht" onClick={() => setPaneel("klantartikel")}><Icoon naam="stapel" maat={18} /> Bulk of artikel</button>
            </div>
          </section>

          {regels.length > 0 ? (
            <div className="afreken-balk">
              <div className="netto">
                <span>{n > 0 ? "Klant betaalt" : n < 0 ? "Wij betalen" : binnen.length && uit.length ? "Ruil" : "Totaal"}</span>
                <strong>{n === 0 && binnen.length && uit.length ? "zonder geld" : euro(Math.abs(n))}</strong>
              </div>
              <button className="knop groot" onClick={() => setPaneel("afrekenen")}>Afrekenen</button>
            </div>
          ) : (
            <Leeg titel="Het mandje is leeg" tekst="Scan een kaart om te verkopen, of voeg kaarten van de klant toe voor een ruil of inkoop." />
          )}
        </>
      )}

      {paneel === "scan" && <KassaScanner onSluit={sluit} />}
      {paneel === "zoek" && <VoorraadZoeker onSluit={sluit} />}
      {paneel === "artikel" && <ArtikelKiezer onSluit={sluit} />}
      {paneel === "klantkaart" && <KlantKaart onSluit={sluit} />}
      {paneel === "klantartikel" && <KlantArtikel onSluit={sluit} />}
      {paneel === "afrekenen" && <Afrekenen onSluit={sluit} onKlaar={(t, w) => { sluit(); setKlaar({ t, wisselgeld: w }); }} />}
      {paneel === "start" && <BeursStart onSluit={sluit} />}
      {paneel === "afsluiten" && beurs && <BeursAfsluiten beurs={beurs} onSluit={sluit} />}
      {paneel === "transacties" && <TransactiesLijst beursId={beurs?.id ?? null} onSluit={sluit} />}
    </div>
  );
}

function BeursBalk({ onStart, onAfsluiten }: { onStart: () => void; onAfsluiten: () => void }) {
  const s = useApp();
  const beurs = actieveBeurs(s);
  const cijfers = useMemo(() => (beurs ? beursCijfers(beurs, s.transacties.filter((t) => t.beurs_id === beurs.id)) : null), [beurs, s.transacties]);
  if (!beurs || !cijfers) {
    return (
      <div className="beurs-balk leeg">
        <div>
          <strong>Geen beurs bezig</strong>
          <span className="zacht klein">Start een beurs om de cashkoffer en SumUp bij te houden.</span>
        </div>
        <button className="knop klein" onClick={onStart}>Beurs starten</button>
      </div>
    );
  }
  return (
    <div className="beurs-balk">
      <div className="beurs-cijfer"><span>Cashkoffer</span><strong>{euro(cijfers.kasVerwacht)}</strong></div>
      <div className="beurs-cijfer"><span>SumUp</span><strong>{euro(cijfers.sumup)}</strong></div>
      <div className="beurs-cijfer"><span>Verkocht</span><strong>{cijfers.verkocht}</strong></div>
      {cijfers.conflicten > 0 && <span className="badge rood-badge">{cijfers.conflicten} conflict</span>}
      <button className="knop zacht klein" onClick={onAfsluiten}>Afsluiten</button>
    </div>
  );
}

function RegelRij({ r, i }: { r: Regel; i: number }) {
  const { exemplaren } = useApp();
  const ex = r.exemplaar_id ? exemplaren.find((e) => e.id === r.exemplaar_id) : null;
  const beeld = ex?.afbeelding ?? r.nieuw?.afbeelding ?? null;
  const [bewerk, setBewerk] = useState(false);
  const [waarde, setWaarde] = useState(String(r.prijs));
  const korting = r.hartjesprijs != null && r.prijs < r.hartjesprijs;
  const opslaan = () => {
    const p = getal(waarde);
    if (p != null && p >= 0) wijzigRegel(i, { prijs: Math.round(p * 100) / 100 });
    setBewerk(false);
  };
  return (
    <div className={`regel ${r.richting}`}>
      {r.artikel_id ? <div className="regel-icoon"><Icoon naam={r.richting === "in" ? "stapel" : "doos"} maat={22} /></div> : <KaartFoto src={beeld} alt={r.naam} klein />}
      <div className="regel-tekst">
        <strong>{r.naam}</strong>
        <span className="zacht klein">
          {r.code && <span className="code">{toonCode(r.code)}</span>}
          {ex && <> · {[ex.set_code, ex.nummer].filter(Boolean).join(" ")} {ex.conditie}</>}
          {r.nieuw && <> · {[r.nieuw.set_code, r.nieuw.nummer].filter(Boolean).join(" ")} {r.nieuw.conditie} {r.nieuw.taal !== "EN" ? r.nieuw.taal : ""}</>}
          {r.referentie != null && <> · ref. {euro(r.referentie)}</>}
        </span>
        {r.artikel_id && r.richting === "uit" && (
          <span className="stapper klein">
            <button onClick={() => {
              const aantal = Math.max(1, (r.aantal ?? 1) - 1);
              const per = (r.hartjesprijs ?? 0) / (r.aantal ?? 1);
              wijzigRegel(i, { aantal, hartjesprijs: per * aantal, prijs: Math.round(per * aantal * 100) / 100 });
            }} aria-label="Eén minder">−</button>
            <span>{r.aantal ?? 1}</span>
            <button onClick={() => {
              const aantal = (r.aantal ?? 1) + 1;
              const per = (r.hartjesprijs ?? 0) / (r.aantal ?? 1);
              wijzigRegel(i, { aantal, hartjesprijs: per * aantal, prijs: Math.round(per * aantal * 100) / 100 });
            }} aria-label="Eén meer">+</button>
          </span>
        )}
        {r.artikel_id && r.richting === "in" && <span className="zacht klein">{r.aantal} stuks</span>}
      </div>
      <div className="regel-prijs">
        {bewerk ? (
          <span className="euro-invoer mini">
            <span>€</span>
            <input autoFocus inputMode="decimal" value={waarde} onChange={(e) => setWaarde(e.target.value)} onBlur={opslaan} onKeyDown={(e) => e.key === "Enter" && opslaan()} />
          </span>
        ) : (
          <button className="prijs-knop" onClick={() => { setWaarde(String(r.prijs).replace(".", ",")); setBewerk(true); }} aria-label="Prijs aanpassen">
            {korting && <s>{euro(r.hartjesprijs)}</s>}
            <strong>{r.richting === "in" && r.prijs === 0 ? "waarde?" : euro(r.prijs)}</strong>
          </button>
        )}
      </div>
      <button className="rond-knop" onClick={() => verwijderRegel(i)} aria-label="Uit het mandje"><Icoon naam="kruis" maat={16} /></button>
    </div>
  );
}

function TotaalRij({ richting, totaal }: { richting: "uit" | "in"; totaal: number }) {
  const [bewerk, setBewerk] = useState(false);
  const [waarde, setWaarde] = useState("");
  const opslaan = () => {
    const p = getal(waarde);
    if (p != null && p >= 0) {
      totaalAanpassen(richting, p);
      meld(richting === "uit" ? "Elke kaart zakt met hetzelfde percentage" : "Verdeeld volgens de referentieprijs");
    }
    setBewerk(false);
  };
  return (
    <div className="totaal-rij">
      <span>{richting === "uit" ? "Samen" : "Waarde samen"}</span>
      {bewerk ? (
        <span className="euro-invoer mini">
          <span>€</span>
          <input autoFocus inputMode="decimal" value={waarde} onChange={(e) => setWaarde(e.target.value)} onBlur={opslaan} onKeyDown={(e) => e.key === "Enter" && opslaan()} />
        </span>
      ) : (
        <button className="prijs-knop" onClick={() => { setWaarde(String(totaal).replace(".", ",")); setBewerk(true); }}>
          <strong>{euro(totaal)}</strong> <span className="zacht klein">aanpassen</span>
        </button>
      )}
    </div>
  );
}

// ── Toevoegen aan het mandje ─────────────────────────────────────────────────

function KassaScanner({ onSluit }: { onSluit: () => void }) {
  const [modus, setModus] = useState<"qr" | "foto" | "code">("qr");
  const [vraag, setVraag] = useState<Exemplaar | null>(null);
  const { mandje } = useApp();
  const recent = mandje.regels.filter((r) => r.richting === "uit").slice(-4).reverse();

  const kies = (ex: Exemplaar) => {
    const s = huidig();
    const actueel = s.exemplaren.find((e) => e.id === ex.id) ?? ex;
    const al = s.mandje.regels.some((r) => r.exemplaar_id === actueel.id && r.richting === "uit");
    if (al) { meld(`${actueel.naam} zit al in het mandje`, "info", undefined, 2000); return; }
    if (inVoorraad(actueel) && actueel.status === "in voorraad" && actueel.opslag === "vitrine") {
      inMandje(regelUit(actueel));
      tril(40);
      meld(`${actueel.naam} · ${euro(actueel.hartjesprijs)}`, "ok", undefined, 2000);
    } else {
      setVraag(actueel); // gereserveerd, vault of al weg: eerst een vraag
    }
  };

  return (
    <Sheet titel="Scannen voor het mandje" onSluit={onSluit} vol>
      <Segment<"qr" | "foto" | "code"> waarde={modus} onKies={(m) => { setModus(m); setVraag(null); }} opties={[
        { waarde: "qr", label: "QR-code" }, { waarde: "foto", label: "Foto" }, { waarde: "code", label: "Code typen" },
      ]} />
      {vraag && (
        <div className="blok">
          <strong>{vraag.naam} <span className="code">{toonCode(vraag.code)}</span></strong>
          <MandjeActie key={vraag.id} ex={vraag} stil vraagMeteen onAnnuleer={() => setVraag(null)} naToevoegen={() => { setVraag(null); meld("In het mandje", "ok", undefined, 2000); }} />
          <button className="tekstknop" onClick={() => setVraag(null)}>Verder scannen</button>
        </div>
      )}
      {modus === "qr" && <QrScanner gepauzeerd={!!vraag} onCode={kies} />}
      {modus === "foto" && <FotoScanner gepauzeerd={!!vraag} kies={kies} />}
      {modus === "code" && <CodeInvoer kies={kies} />}
      {recent.length > 0 && (
        <div className="recent-mandje">
          <span className="zacht klein">Net toegevoegd</span>
          {recent.map((r, i) => <div key={i} className="recent-regel"><Icoon naam="check" maat={14} /> {r.naam} <span className="rechts">{euro(r.prijs)}</span></div>)}
        </div>
      )}
      <button className="knop groot" onClick={onSluit}>Klaar</button>
    </Sheet>
  );
}

function VoorraadZoeker({ onSluit }: { onSluit: () => void }) {
  const { exemplaren } = useApp();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const resultaten = useMemo(() => {
    const woorden = zonderAccenten(q.trim()).split(/\s+/).filter(Boolean);
    if (!woorden.length) return [];
    return exemplaren.filter(inVoorraad).filter((e) => {
      const t = zonderAccenten([e.naam, e.naam_origineel, e.set_naam, e.set_code, e.nummer, e.code, toonCode(e.code)].filter(Boolean).join(" "));
      return woorden.every((w) => t.includes(w));
    }).sort((a, b) => (a.opslag === b.opslag ? 0 : a.opslag === "vitrine" ? -1 : 1)).slice(0, 40);
  }, [q, exemplaren]);
  return (
    <Sheet titel="Zoek in de voorraad" onSluit={onSluit} vol>
      <div className="zoekbalk">
        <Icoon naam="zoek" maat={18} />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Naam, set, nummer of code" />
      </div>
      <ul className="resultaten">
        {resultaten.map((e) => (
          <li key={e.id} className={open === e.id ? "open" : ""}>
            <button onClick={() => setOpen(open === e.id ? null : e.id)}>
              <KaartFoto src={e.afbeelding} alt={e.naam} klein />
              <span className="res-tekst">
                <strong>{e.naam}</strong>
                <span className="zacht">{[e.set_code, e.nummer].filter(Boolean).join(" ")} · <span className="code">{toonCode(e.code)}</span></span>
                <Badges ex={e} />
              </span>
              <span className="rechts">{e.opslag === "vitrine" ? <Hartje prijs={e.hartjesprijs} /> : <span className="zacht klein">vault · {euro(e.verkoopprijs)}</span>}</span>
            </button>
            {open === e.id && <div className="in-voorraad"><MandjeActie ex={e} naToevoegen={() => setOpen(null)} /></div>}
          </li>
        ))}
      </ul>
      {q.trim() && !resultaten.length && <p className="zacht center">Niets in voorraad gevonden.</p>}
    </Sheet>
  );
}

function ArtikelKiezer({ onSluit }: { onSluit: () => void }) {
  const { artikelen, mandje } = useApp();
  const lijst = artikelen.filter((a) => a.aantal > 0 && a.prijs != null);
  const inMand = (a: Artikel) => mandje.regels.find((r) => r.artikel_id === a.id && r.richting === "uit")?.aantal ?? 0;
  return (
    <Sheet titel="Artikel verkopen" onSluit={onSluit}>
      {!lijst.length && <p className="zacht">Geen artikelen met een prijs op voorraad. Voeg ze toe in de catalogus.</p>}
      <ul className="lijst">
        {lijst.map((a) => (
          <li key={a.id}>
            <button className="lijst-knop" disabled={inMand(a) >= a.aantal} onClick={() => { inMandje(regelArtikelUit(a)); tril(); }}>
              <Icoon naam={a.soort === "eigen product" ? "binder" : "doos"} maat={20} />
              <span className="lijst-naam">{a.naam}</span>
              <span className="zacht klein">nog {a.aantal - inMand(a)}</span>
              <span className="rechts"><strong>{euro(a.prijs)}</strong></span>
              {inMand(a) > 0 && <span className="mini-label">{inMand(a)} in mandje</span>}
            </button>
          </li>
        ))}
      </ul>
      <button className="knop groot" onClick={onSluit}>Klaar</button>
    </Sheet>
  );
}

// Wat de klant meebrengt bij een ruil of inkoop, met dezelfde taal en conditie als de vorige kaart.
const vorigeKlantKaart = { taal: "EN", conditie: "NM" };

function KlantKaart({ onSluit }: { onSluit: () => void }) {
  const [kaart, setKaart] = useState<CatalogusKaart | null>(null);
  const [handmatig, setHandmatig] = useState(false);
  const [teller, setTeller] = useState(0);
  const reset = () => { setKaart(null); setHandmatig(false); setTeller((t) => t + 1); };
  return (
    <Sheet titel={kaart || handmatig ? "Kaart van de klant" : "Welke kaart brengt de klant?"} onSluit={onSluit} vol>
      {kaart || handmatig
        ? <KlantKaartDetails key={teller} kaart={kaart} onTerug={reset} onKlaar={() => { reset(); meld("In het mandje (wij krijgen). Volgende kaart, of Klaar.", "ok", undefined, 2500); }} />
        : <KiesKaart onKies={setKaart} onHandmatig={() => setHandmatig(true)} metArtikel={false} handmatigTekst="Staat de kaart niet in de catalogus? Vul dan zelf naam, set en nummer in." />}
      <button className="tekstknop" onClick={onSluit}>Klaar</button>
    </Sheet>
  );
}

function KlantKaartDetails({ kaart, onTerug, onKlaar }: { kaart: CatalogusKaart | null; onTerug: () => void; onKlaar: () => void }) {
  const { gids, instellingen } = useApp();
  const asia = kaart?.catalogus === "asia";
  const [v, setV] = useState({
    naam: kaart?.naam ?? "",
    setCode: kaart ? kaart.setCode || kaart.setId : "",
    nummer: kaart?.nummer ?? "",
    taal: asia ? "JP" : vorigeKlantKaart.taal === "JP" || vorigeKlantKaart.taal.startsWith("CN") ? "EN" : vorigeKlantKaart.taal,
    conditie: vorigeKlantKaart.conditie,
    variant: "normaal",
    waarde: "",
  });
  const proef = (conditie: string) => voorstelVoor({ soort: "kaart", cardmarket_id: kaart?.cardmarket ?? null, taal: v.taal, conditie, variant: v.variant } as Exemplaar, gids, instellingen);
  const nm = proef("NM");
  const metConditie = proef(v.conditie);

  const toevoegen = () => {
    if (!v.naam.trim()) return meld("Vul een naam in", "fout");
    const s = huidig();
    const codes = new Set([...s.exemplaren.map((e) => e.code), ...s.mandje.regels.map((r) => r.nieuw?.code).filter(Boolean) as string[]]);
    const naamOrigineel = kaart?.catalogus === "asia" ? (v.taal.startsWith("CN") ? kaart.naamZhTw || kaart.naamZhCn || kaart.naamJa : kaart.naamJa || kaart.naamZhTw) || null : null;
    const nieuw = {
      id: uuid(), code: nieuweCode(codes), soort: "kaart" as const, naam: v.naam.trim(), naam_origineel: naamOrigineel,
      kaart_id: kaart?.id ?? null, catalogus: kaart?.catalogus ?? null, afbeelding: kaart ? afbeelding(kaart) : null,
      set_naam: kaart?.setNaam ?? null, set_code: v.setCode.trim() || null, nummer: v.nummer.trim() || null,
      taal: v.taal, conditie: v.conditie, variant: v.variant, cardmarket_id: kaart?.cardmarket ?? null,
      opslag: "stockdoos" as const, verkoopprijs: metConditie?.voorstel ?? null,
    };
    Object.assign(vorigeKlantKaart, { taal: v.taal, conditie: v.conditie });
    inMandje(regelIn(nieuw, getal(v.waarde) ?? 0, metConditie?.voorstel ?? null));
    onKlaar();
  };

  const talen = asia ? TALEN.filter((t) => t.asia) : TALEN;
  return (
    <div className="formulier">
      {kaart ? (
        <div className="gekozen">
          <KaartFoto src={afbeelding(kaart)} alt={kaart.naam} klein />
          <div>
            <strong>{kaart.naam}</strong>
            <div className="zacht">{kaart.setNaam} · {kaart.setCode || kaart.setId} {kaart.nummer}</div>
          </div>
          <button className="tekstknop" onClick={onTerug}>Andere kaart</button>
        </div>
      ) : (
        <>
          <Veld label="Naam (Engels)"><input value={v.naam} onChange={(e) => setV({ ...v, naam: e.target.value })} autoFocus /></Veld>
          <div className="twee">
            <Veld label="Setcode"><input value={v.setCode} onChange={(e) => setV({ ...v, setCode: e.target.value })} /></Veld>
            <Veld label="Nummer"><input value={v.nummer} onChange={(e) => setV({ ...v, nummer: e.target.value })} /></Veld>
          </div>
        </>
      )}
      <Veld label="Taal">
        <select value={v.taal} onChange={(e) => setV({ ...v, taal: e.target.value })}>
          {talen.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
        </select>
      </Veld>
      <Veld label="Conditie (kies zelf)"><Kiezer waarde={v.conditie} opties={CONDITIES} onKies={(c) => setV({ ...v, conditie: c })} /></Veld>
      <Veld label="Variant"><Kiezer waarde={v.variant} opties={VARIANTEN} onKies={(c) => setV({ ...v, variant: c })} /></Veld>
      <div className="referentie">
        <div><span>Near Mint-referentie</span><strong>{nm ? euro(nm.referentie) : "geen"}</strong></div>
        <div><span>Met conditie {v.conditie}</span><strong>{metConditie ? euro(metConditie.voorstel) : "–"}</strong></div>
      </div>
      <Veld label="Ruilwaarde of inkoopprijs (€)" hint="Leeg laten mag: dan geef je straks één totaal voor alle kaarten van de klant.">
        <input inputMode="decimal" value={v.waarde} onChange={(e) => setV({ ...v, waarde: e.target.value })} placeholder="bv. 15" />
      </Veld>
      <button className="knop groot" onClick={toevoegen}><Icoon naam="plus" maat={18} /> In het mandje</button>
      <p className="zacht klein">De kaart krijgt na het afrekenen een eigen code en label, en komt in de vault tot jullie er een hartje op zetten.</p>
    </div>
  );
}

function KlantArtikel({ onSluit }: { onSluit: () => void }) {
  const { artikelen } = useApp();
  const [id, setId] = useState(artikelen.find((a) => a.soort === "bulk")?.id ?? artikelen[0]?.id ?? "");
  const [aantal, setAantal] = useState("50");
  const [prijs, setPrijs] = useState("");
  const a = artikelen.find((x) => x.id === id);
  return (
    <Sheet titel="Bulk of artikel van de klant" onSluit={onSluit}>
      {!artikelen.length ? <p className="zacht">Maak eerst een artikel aan in de catalogus (bv. "Bulkkaarten").</p> : (
        <div className="formulier">
          <Veld label="Artikel">
            <select value={id} onChange={(e) => setId(e.target.value)}>
              {artikelen.map((x) => <option key={x.id} value={x.id}>{x.naam} ({x.aantal})</option>)}
            </select>
          </Veld>
          <div className="twee">
            <Veld label="Aantal"><input inputMode="numeric" value={aantal} onChange={(e) => setAantal(e.target.value)} /></Veld>
            <Veld label="Prijs voor alles (€)"><input inputMode="decimal" value={prijs} onChange={(e) => setPrijs(e.target.value)} autoFocus /></Veld>
          </div>
          <button className="knop groot" disabled={!a || !(getal(aantal)! > 0)} onClick={() => {
            inMandje(regelArtikelIn(a!, Math.round(getal(aantal)!), getal(prijs) ?? 0));
            onSluit();
          }}>In het mandje</button>
        </div>
      )}
    </Sheet>
  );
}

// ── Afrekenen ────────────────────────────────────────────────────────────────

function Afrekenen({ onSluit, onKlaar }: { onSluit: () => void; onKlaar: (t: Transactie, wisselgeld: number | null) => void }) {
  const { mandje } = useApp();
  const regels = mandje.regels;
  const n = netto(regels);
  const [wijze, setWijze] = useState<"cash" | "sumup" | "beide">("cash");
  const [gegeven, setGegeven] = useState("");
  const [cashDeel, setCashDeel] = useState("");

  const waarschuwingen = regels.flatMap((r) => {
    const w: string[] = [];
    if (r.richting === "uit" && r.aankoopprijs != null && r.prijs < r.aankoopprijs) w.push(`${r.naam}: onder de aankoopprijs (${euro(r.aankoopprijs)})`);
    else if (r.richting === "uit" && r.hartjesprijs && r.prijs < r.hartjesprijs * 0.8) w.push(`${r.naam}: meer dan 20% korting`);
    if (r.richting === "in" && !r.prijs) w.push(`${r.naam}: nog geen waarde`);
    return w;
  });

  let betaling: Betaling | null;
  if (n <= 0) betaling = { cash: n, sumup: 0 };
  else if (wijze === "cash") betaling = { cash: n, sumup: 0 };
  else if (wijze === "sumup") betaling = { cash: 0, sumup: n };
  else {
    const c = getal(cashDeel);
    betaling = c != null && c >= 0 && c <= n ? { cash: Math.round(c * 100) / 100, sumup: Math.round((n - c) * 100) / 100 } : null;
  }
  const g = getal(gegeven);
  const cashTeOntvangen = betaling && betaling.cash > 0 ? betaling.cash : 0;
  const wisselgeld = cashTeOntvangen && g != null && g >= cashTeOntvangen ? Math.round((g - cashTeOntvangen) * 100) / 100 : null;
  const snel = useMemo(() => {
    if (!cashTeOntvangen) return [];
    const opties = [cashTeOntvangen, ...[5, 10, 20, 50, 100].map((b) => Math.ceil(cashTeOntvangen / b) * b)];
    return [...new Set(opties)].filter((x) => x >= cashTeOntvangen).slice(0, 5);
  }, [cashTeOntvangen]);

  const bevestig = () => {
    if (!betaling) return meld("Vul het cash-deel in", "fout");
    try {
      const t = afrekenen(betaling);
      onKlaar(t, wisselgeld);
    } catch (e) {
      meld(e instanceof Error ? e.message : String(e), "fout");
    }
  };

  return (
    <Sheet titel="Afrekenen" onSluit={onSluit}>
      <div className="afreken-overzicht">
        {totaalUit(regels) > 0 && <div><span>Wij geven</span><strong>{euro(totaalUit(regels))}</strong></div>}
        {regels.some((r) => r.richting === "in") && <div><span>Wij krijgen</span><strong>− {euro(totaalIn(regels))}</strong></div>}
        <div className="afreken-netto"><span>{n > 0 ? "Klant betaalt" : n < 0 ? "Wij betalen terug" : "Te betalen"}</span><strong>{euro(Math.abs(n))}</strong></div>
      </div>

      {waarschuwingen.length > 0 && (
        <div className="waarschuwing">
          <Icoon naam="waarschuwing" maat={18} />
          <div>{waarschuwingen.map((w, i) => <div key={i}>{w}</div>)}<span className="zacht klein">Je kunt toch afrekenen.</span></div>
        </div>
      )}

      {n > 0 && (
        <>
          <Segment<"cash" | "sumup" | "beide"> waarde={wijze} onKies={setWijze} opties={[
            { waarde: "cash", label: "Cash" }, { waarde: "sumup", label: "SumUp" }, { waarde: "beide", label: "Beide" },
          ]} />
          {wijze === "beide" && (
            <Veld label="Deel in cash (€)" hint={betaling ? `SumUp: ${euro(betaling.sumup)}` : `Tussen 0 en ${euro(n)}`}>
              <input inputMode="decimal" value={cashDeel} onChange={(e) => setCashDeel(e.target.value)} autoFocus />
            </Veld>
          )}
          {wijze === "sumup" && <p className="zacht">Reken {euro(n)} af op het SumUp-toestel. Gelukt? Tik dan op Betaald.</p>}
          {cashTeOntvangen > 0 && (
            <div className="wisselgeld">
              <span className="veld-label">Klant geeft (optioneel)</span>
              <div className="kiezer">
                {snel.map((b) => <button key={b} className={`chip${g === b ? " aan" : ""}`} onClick={() => setGegeven(String(b))}>{euro(b)}</button>)}
              </div>
              <input inputMode="decimal" value={gegeven} onChange={(e) => setGegeven(e.target.value)} placeholder="Ander bedrag" />
              {wisselgeld != null && <div className="wisselgeld-bedrag">Wisselgeld <strong>{euro(wisselgeld)}</strong></div>}
            </div>
          )}
        </>
      )}
      {n < 0 && <p>Geef de klant <strong>{euro(-n)}</strong> uit de cashkoffer.</p>}
      {n === 0 && <p className="zacht">Er gaat geen geld over en weer.</p>}

      <button className="knop groot" disabled={!betaling} onClick={bevestig}>
        <Icoon naam="check" maat={20} /> {n > 0 ? (wijze === "sumup" ? "Betaald met SumUp" : "Betaald") : n < 0 ? "Uitbetaald" : "Bevestigen"}
      </button>
    </Sheet>
  );
}

function Gelukt({ t, wisselgeld, onVolgende }: { t: Transactie; wisselgeld: number | null; onVolgende: () => void }) {
  const { exemplaren, transacties } = useApp();
  const huidigT = transacties.find((x) => x.id === t.id) ?? t;
  const [kanTerug, setKanTerug] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => { timer.current = setTimeout(() => setKanTerug(false), 5000); return () => clearTimeout(timer.current); }, []);
  const nieuwIds = t.regels.filter((r) => r.nieuw?.id).map((r) => r.nieuw!.id);
  const tePrinten = exemplaren.filter((e) => nieuwIds.includes(e.id) && e.label_status === "te printen");
  const titel = t.soort === "verkoop" ? "Verkocht" : t.soort === "inkoop" ? "Ingekocht" : "Ruil geboekt";
  return (
    <div className="gelukt">
      <img src="img/eend.png" alt="" width={110} height={110} />
      <h2>{huidigT.status === "ongedaan" ? "Ongedaan gemaakt" : titel}</h2>
      <p className="gelukt-bedrag">
        {t.totaal > 0 ? `${euro(t.totaal)} ontvangen` : t.totaal < 0 ? `${euro(-t.totaal)} uitbetaald` : "zonder geld"}
        {t.cash > 0 && t.sumup > 0 && <span className="zacht"> ({euro(t.cash)} cash, {euro(t.sumup)} SumUp)</span>}
        {t.sumup > 0 && !t.cash && <span className="zacht"> via SumUp</span>}
      </p>
      {wisselgeld != null && wisselgeld > 0 && <p className="wisselgeld-bedrag">Wisselgeld <strong>{euro(wisselgeld)}</strong></p>}
      {huidigT.status === "conflict" && <button className="knop zacht rood" onClick={() => openTransactie(t.id)}>Conflict nakijken</button>}
      <div className="knoppenrij">
        {tePrinten.length > 0 && huidigT.status !== "ongedaan" && (
          <button className="knop" onClick={() => void print(tePrinten.map((e) => e.id))}><Icoon naam="printer" maat={18} /> Print {tePrinten.length === 1 ? "label" : `${tePrinten.length} labels`}</button>
        )}
        <button className="knop zacht" onClick={onVolgende}>Volgende klant</button>
      </div>
      {kanTerug && huidigT.status !== "ongedaan" && <button className="tekstknop" onClick={() => ongedaanMaken(t.id)}><Icoon naam="terug" maat={16} /> Ongedaan maken</button>}
    </div>
  );
}
