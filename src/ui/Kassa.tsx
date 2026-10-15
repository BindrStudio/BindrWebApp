import { useEffect, useMemo, useRef, useState } from "react";
import {
  actieveBeurs, afrekenen, alleCodes, huidig, inMandje, mandjeLegen, meld, ongedaanMaken, openTransactie, print, totaalAanpassen,
  bodPct, useApp, verwijderRegel, wijzigRegel, zetArtikelAantal, zetBod, zetInstellingen,
} from "../state";
import type { Artikel, CatalogusKaart, Exemplaar, Regel, Transactie } from "../types";
import { CONDITIES, TALEN, VARIANTEN } from "../types";
import { inVoorraad } from "../lib/exemplaar";
import { beursCijfers, marge, netto, regelArtikelUit, regelIn, regelUit, totaalIn, totaalUit, type Betaling } from "../lib/kassa";
import { datumKort, euro, getal, vandaag, zonderAccenten } from "../lib/format";
import { nieuweCode, toonCode } from "../lib/code";
import { afbeelding } from "../lib/catalog";
import { uitCatalogus } from "../lib/foto";
import { voorstelVoor } from "../lib/pricing";
import { tril } from "../lib/camera";
import { uuid } from "../lib/uuid";
import { Badges, Hartje, Icoon, KaartFoto, Kiezer, Leeg, Segment, Sheet, Veld } from "./common";
import { MandjeActie } from "./MandjeActie";
import { Scanner, type FotoResultaat } from "./Scan";
import { KiesKaart } from "./Toevoegen";
import { BeursAfsluiten, BeursStart, geplandeBeurzen } from "./Beurs";
import { BeursDashboard, BeurzenEnTransacties } from "./Historiek";
import { GradedVelden, SoldLinks } from "./Graded";
import { cardmarketLink, gradedZoektekst } from "../lib/markt";
import { afrondKeuzes, bodBedrag, marktwaarde, PCT_MAX, PCT_MIN, procentVan, type BodInstelling } from "../lib/bod";
import { GELUKT, kies, MANDJE_LEEG } from "../lib/grapjes";

type Paneel = null | "scan" | "zoek" | "artikel" | "klantkaart" | "afrekenen" | "start" | "plan" | "afsluiten" | "transacties";

export function Kassa() {
  const s = useApp();
  const beurs = actieveBeurs(s);
  const [paneel, setPaneel] = useState<Paneel>(null);
  const [klaar, setKlaar] = useState<{ t: Transactie; wisselgeld: number | null } | null>(null);
  const [leegTekst] = useState(() => kies(MANDJE_LEEG));
  const regels = s.mandje.regels;
  const uit = regels.map((r, i) => ({ r, i })).filter((x) => x.r.richting === "uit");
  const binnen = regels.map((r, i) => ({ r, i })).filter((x) => x.r.richting === "in");
  const n = netto(regels);
  const sluit = () => setPaneel(null);
  const naKlantKaarten = () => {
    sluit();
    setTimeout(() => document.querySelector(".bod-paneel")?.scrollIntoView({ behavior: "smooth", block: "center" }), 120);
  };

  return (
    <div className="scherm kassa">
      <header className="kop">
        <div>
          <h1>Kassa</h1>
          {beurs
            ? <p className="beurs-live"><span className="live-stip" /> Beurs bezig · {beurs.naam}{beurs.gestart_op ? ` · sinds ${new Date(beurs.gestart_op).toLocaleTimeString("nl-BE", { hour: "2-digit", minute: "2-digit" })}` : ""}</p>
            : <p className="kop-sub">Geen beurs bezig</p>}
        </div>
        <div className="kop-knoppen">
          <button className="pil-knop" onClick={() => setPaneel("transacties")}><Icoon naam="historiek" maat={18} /> Historiek</button>
        </div>
      </header>

      <BeursBalk onStart={() => setPaneel("start")} onPlan={() => setPaneel("plan")} onAfsluiten={() => setPaneel("afsluiten")} />

      {klaar ? (
        <Gelukt t={klaar.t} wisselgeld={klaar.wisselgeld} onVolgende={() => setKlaar(null)} />
      ) : (
        <>
          <section className="mandje-kant">
            <div className="kant-kop">
              <div>
                <h2>Uit onze voorraad</h2>
                <span className="zacht klein">wat de klant meeneemt</span>
              </div>
              <div className="kant-kop-knoppen">
                <MargeKnop />
                {regels.length > 0 && <button className="tekstknop klein" onClick={mandjeLegen}>Leegmaken</button>}
              </div>
            </div>
            {uit.length === 0 && <p className="zacht klein kant-leeg">Scan het label achteraan de toploader, of zoek de kaart.</p>}
            {uit.map(({ r, i }) => <RegelRij key={i} r={r} i={i} />)}
            {uit.length > 1 && <TotaalRij richting="uit" totaal={totaalUit(regels)} />}
            {s.instellingen.toonMarge && uit.length > 0 && <MargeRij regels={regels} />}
            <div className="kant-knoppen">
              <button className="knop" onClick={() => setPaneel("scan")}><Icoon naam="scan" maat={18} /> Scan</button>
              <button className="knop zacht" onClick={() => setPaneel("zoek")}><Icoon naam="zoek" maat={18} /> Zoek</button>
              <button className="knop zacht" onClick={() => setPaneel("artikel")}><Icoon naam="doos" maat={18} /> Artikel</button>
            </div>
          </section>

          <section className="mandje-kant klant">
            <div className="kant-kop">
              <div>
                <h2>Van de klant</h2>
                <span className="zacht klein">kaarten die wij krijgen, bij ruil of inkoop</span>
              </div>
            </div>
            {binnen.map(({ r, i }) => <RegelRij key={i} r={r} i={i} />)}
            {binnen.some((x) => (x.r.referentie ?? 0) > 0)
              ? <BodPaneel />
              : binnen.length > 1 && <TotaalRij richting="in" totaal={totaalIn(regels)} />}
            <div className="kant-knoppen">
              <button className="knop zacht" onClick={() => setPaneel("klantkaart")}><Icoon naam="plus" maat={18} /> Kaart van klant</button>
            </div>
          </section>

          {regels.length > 0 ? (
            <div className="afreken-balk">
              <button className="rond-knop groot zee" onClick={() => setPaneel("scan")} aria-label="Nog een kaart scannen" title="Nog een kaart scannen"><Icoon naam="scan" /></button>
              <div className="netto">
                <span>{n > 0 ? "Klant betaalt" : n < 0 ? "Wij betalen" : binnen.length && uit.length ? "Ruil" : "Totaal"}</span>
                <strong>{n === 0 && binnen.length && uit.length ? "zonder geld" : euro(Math.abs(n))}</strong>
              </div>
              <button className="knop groot" onClick={() => setPaneel("afrekenen")}>Afrekenen</button>
            </div>
          ) : (
            <Leeg titel="Het mandje is leeg" tekst={leegTekst} />
          )}
        </>
      )}

      {paneel === "scan" && <KassaScanner onSluit={sluit} />}
      {paneel === "zoek" && <VoorraadZoeker onSluit={sluit} />}
      {paneel === "artikel" && <ArtikelKiezer onSluit={sluit} />}
      {paneel === "klantkaart" && <KlantKaart onSluit={naKlantKaarten} />}
      {paneel === "afrekenen" && <Afrekenen onSluit={sluit} onKlaar={(t, w) => { sluit(); setKlaar({ t, wisselgeld: w }); }} />}
      {paneel === "start" && <BeursStart onSluit={sluit} />}
      {paneel === "plan" && <BeursStart plannen onSluit={sluit} />}
      {paneel === "afsluiten" && beurs && <BeursAfsluiten beurs={beurs} onSluit={sluit} />}
      {paneel === "transacties" && <BeurzenEnTransacties onSluit={sluit} />}
    </div>
  );
}

function BeursBalk({ onStart, onPlan, onAfsluiten }: { onStart: () => void; onPlan: () => void; onAfsluiten: () => void }) {
  const s = useApp();
  const beurs = actieveBeurs(s);
  const cijfers = useMemo(() => (beurs ? beursCijfers(beurs, s.transacties.filter((t) => t.beurs_id === beurs.id)) : null), [beurs, s.transacties]);
  const [open, setOpen] = useState(() => { try { return localStorage.getItem("bindr-beurscijfers") === "1"; } catch { return false; } });
  const zetOpen = (x: boolean) => { setOpen(x); try { localStorage.setItem("bindr-beurscijfers", x ? "1" : "0"); } catch { /* */ } };
  const [vol, setVol] = useState(false);
  const leeg = !s.mandje.regels.length;
  useEffect(() => { if (leeg) setVol(false); }, [leeg]);
  if (!beurs || !cijfers) {
    const volgende = geplandeBeurzen(s.beurzen)[0];
    const isVandaag = volgende?.datum === vandaag();
    return (
      <div className="beurs-balk leeg">
        <div>
          <strong>Geen beurs bezig</strong>
          {volgende
            ? <span className="beurs-volgende">{isVandaag ? "Vandaag" : "Volgende"}: {volgende.naam} · {datumKort(volgende.datum)}</span>
            : <span className="zacht klein">Start een beurs om de cashkoffer en SumUp bij te houden.</span>}
          <button className="tekstknop klein" onClick={onPlan}>Beurs plannen</button>
        </div>
        <button className="knop klein" onClick={onStart}>{isVandaag ? "Starten" : "Beurs starten"}</button>
      </div>
    );
  }
  // Met iets in het mandje: de beurs als één smalle balk, zodat het mandje in beeld blijft.
  if (s.mandje.regels.length > 0 && !open && !vol) {
    return (
      <button className="beurs-balk compact" onClick={() => setVol(true)} aria-label="Toon de cijfers van de beurs">
        <span className="live-stip" />
        <span>Kas <strong>{euro(cijfers.kasVerwacht)}</strong></span>
        <span>SumUp <strong>{euro(cijfers.sumup)}</strong></span>
        {cijfers.conflicten > 0 && <span className="badge rood-badge">{cijfers.conflicten}</span>}
        <Icoon naam="chevron" maat={16} />
      </button>
    );
  }
  return (
    <>
      <div className="beurs-balk">
        <div className="beurs-cijfer"><span>Cashkoffer</span><strong>{euro(cijfers.kasVerwacht)}</strong></div>
        <div className="beurs-cijfer"><span>SumUp</span><strong>{euro(cijfers.sumup)}</strong></div>
        <div className="beurs-cijfer"><span>Transacties</span><strong>{cijfers.transacties}</strong></div>
        {cijfers.conflicten > 0 && <span className="badge rood-badge">{cijfers.conflicten} conflict</span>}
        <button className="tekstknop klein afsluit-knop" onClick={onAfsluiten}>Afsluiten</button>
        <button className={`beurs-meer${open ? " open" : ""}`} onClick={() => zetOpen(!open)} aria-expanded={open}>
          {open ? "Minder cijfers" : "Cijfers van deze beurs"} <Icoon naam="chevron" maat={14} />
        </button>
      </div>
      {open && <BeursDashboard beurs={beurs} />}
    </>
  );
}

function RegelRij({ r, i }: { r: Regel; i: number }) {
  const { exemplaren, instellingen } = useApp();
  const toonMarge = !!instellingen.toonMarge;
  const ex = r.exemplaar_id ? exemplaren.find((e) => e.id === r.exemplaar_id) : null;
  const beeld = ex?.afbeelding ?? r.nieuw?.afbeelding ?? null;
  const [bewerk, setBewerk] = useState(false);
  const [waarde, setWaarde] = useState(String(r.prijs));
  const korting = r.hartjesprijs != null && r.prijs < r.hartjesprijs;
  // Een kaart van de klant: je past de marktwaarde aan; wat we betalen volgt uit het bod.
  const klantKaart = r.richting === "in" && !!r.nieuw;
  const opslaan = () => {
    const p = getal(waarde);
    if (klantKaart) wijzigRegel(i, p != null && p > 0 ? { referentie: Math.round(p * 100) / 100 } : { referentie: null, prijs: 0 });
    else if (p != null && p >= 0) wijzigRegel(i, { prijs: Math.round(p * 100) / 100 });
    setBewerk(false);
  };
  return (
    <div className={`regel ${r.richting}`}>
      {r.artikel_id ? <div className="regel-icoon"><Icoon naam={r.richting === "in" ? "stapel" : "doos"} maat={22} /></div> : <KaartFoto src={beeld} alt={r.naam} klein kaart={ex ?? r.nieuw ?? undefined} />}
      <div className="regel-tekst">
        <strong>{r.naam}</strong>
        <span className="zacht klein">
          {r.code && <span className="code">{toonCode(r.code)}</span>}
          {ex && <> · {[ex.set_code, ex.nummer].filter(Boolean).join(" ")} {ex.conditie}</>}
          {r.nieuw && <> · {[r.nieuw.set_code, r.nieuw.nummer].filter(Boolean).join(" ")} {r.nieuw.conditie} {r.nieuw.taal !== "EN" ? r.nieuw.taal : ""}</>}
          {r.nieuw?.soort === "slab" && <> · {[r.nieuw.grader, r.nieuw.grade].filter(Boolean).join(" ")}</>}
        </span>
        {toonMarge && r.richting === "uit" && (!r.artikel_id || r.aankoopprijs != null) && (
          r.aankoopprijs != null
            ? <span className={`regel-marge${r.prijs - r.aankoopprijs < 0 ? " min" : ""}`}>inkoop {euro(r.aankoopprijs)} · {plusMin(r.prijs - r.aankoopprijs)}</span>
            : <span className="regel-marge onbekend">inkoop niet ingevuld</span>
        )}
        {r.artikel_id && r.richting === "uit" && (
          <span className="stapper klein">
            <button onClick={() => zetArtikelAantal(i, (r.aantal ?? 1) - 1)} aria-label="Eén minder">−</button>
            <span>{r.aantal ?? 1}</span>
            <button onClick={() => zetArtikelAantal(i, (r.aantal ?? 1) + 1)} aria-label="Eén meer">+</button>
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
          klantKaart ? (
            <button className="prijs-knop" onClick={() => { setWaarde(r.referentie ? String(r.referentie).replace(".", ",") : ""); setBewerk(true); }} aria-label="Marktwaarde aanpassen">
              <strong>{r.referentie || r.prijs > 0 ? euro(r.prijs) : "markt?"}</strong>
              <span className="regel-markt">{r.referentie ? `markt ${euro(r.referentie)}` : r.prijs > 0 ? "geen marktwaarde" : "tik om in te vullen"}</span>
            </button>
          ) : (
            <button className="prijs-knop" onClick={() => { setWaarde(String(r.prijs).replace(".", ",")); setBewerk(true); }} aria-label="Prijs aanpassen">
              {korting && <s>{euro(r.hartjesprijs)}</s>}
              <strong>{r.richting === "in" && r.prijs === 0 ? "waarde?" : euro(r.prijs)}</strong>
            </button>
          )
        )}
      </div>
      <button className="rond-knop" onClick={() => verwijderRegel(i)} aria-label="Uit het mandje"><Icoon naam="kruis" maat={16} /></button>
    </div>
  );
}

const plusMin = (x: number) => `${x < 0 ? "−" : "+"}${euro(Math.abs(Math.round(x * 100) / 100))}`.replace(/\s/g, "\u00a0");

/** Oogje: inkoopprijzen en marge tonen of verbergen (enkel op deze gsm, standaard verborgen voor wie meekijkt). */
function MargeKnop() {
  const { instellingen } = useApp();
  const aan = !!instellingen.toonMarge;
  return (
    <button className={`marge-knop${aan ? " aan" : ""}`} onClick={() => zetInstellingen({ toonMarge: !aan })} aria-pressed={aan}
      title={aan ? "Inkoopprijzen verbergen" : "Inkoopprijzen tonen"}>
      <Icoon naam="oog" maat={16} /> Inkoop
    </button>
  );
}

function MargeRij({ regels }: { regels: Regel[] }) {
  const m = marge(regels);
  if (!m.gekend) return <p className="marge-rij onbekend">Geen aankoopprijs gekend: geen marge te tonen.</p>;
  return (
    <div className={`marge-rij${m.winst < 0 ? " min" : ""}`}>
      <span>Marge{m.onbekend ? ` (${m.gekend} van ${m.gekend + m.onbekend})` : ""}</span>
      <strong>{plusMin(m.winst)}{m.pct != null && <small> · {m.pct > 0 ? "+" : ""}{m.pct}%</small>}</strong>
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

// ── Bod op de kaarten van de klant ───────────────────────────────────────────

/**
 * Het bod voor de kaarten van de klant, zoals aan de stand: de marktwaarde van alle kaarten
 * samen, een percentage (slider van 65 tot 95%, per 5%), afronden naar boven of onder,
 * en wat we dan per kaart echt betalen (zo komt het ook in de boekhouding).
 */
function BodPaneel() {
  const { mandje } = useApp();
  const [eigen, setEigen] = useState(() => (mandje.bod?.afronding === "eigen" && mandje.bod.eigen != null ? String(mandje.bod.eigen).replace(".", ",") : ""));
  const m = marktwaarde(mandje.regels);
  const pct = bodPct(mandje);
  const ruil = mandje.regels.some((r) => r.richting === "uit");
  const b = mandje.bod ?? { afronding: "exact" as const };
  const exact = bodBedrag(m.totaal, pct, { afronding: "exact" });
  const keuzes = afrondKeuzes(exact, b.afronding);
  const zonderMarkt = mandje.regels.filter((r) => r.richting === "in" && !((r.referentie ?? 0) > 0)).reduce((x, r) => x + r.prijs, 0);
  const kies = (w: Partial<BodInstelling>) => { zetBod(w); tril(); };
  // Werd het eigen bod opzijgezet (andere kaarten), dan ook het veld leegmaken.
  useEffect(() => { if (b.afronding !== "eigen") setEigen(""); }, [b.afronding]);
  const typ = (tekst: string) => {
    setEigen(tekst);
    const n = getal(tekst);
    if (n != null && n >= 0) zetBod({ afronding: "eigen", eigen: Math.round(n * 100) / 100 });
    else if (!tekst.trim() && b.afronding === "eigen") zetBod({ afronding: "exact", eigen: null });
  };
  const nuPct = procentVan(m.bod, m.totaal);
  return (
    <div className="bod-paneel">
      <div className="bod-kop">
        <span className="zacht klein">Marktwaarde · {m.kaarten} {m.kaarten === 1 ? "kaart" : "kaarten"}</span>
        <strong className="bod-markt">{euro(m.totaal)}</strong>
      </div>
      <label className="bod-slider">
        <span className="bod-slider-kop"><span>{ruil ? "Ruil" : "Inkoop"} · % van de marktwaarde</span><strong>{pct}%</strong></span>
        <input type="range" min={PCT_MIN} max={PCT_MAX} step={5} value={pct} aria-label="Percentage van de marktwaarde"
          onChange={(e) => { setEigen(""); kies({ pct: Number(e.target.value), afronding: b.afronding === "eigen" ? "exact" : b.afronding, eigen: null }); }} />
        <span className="bod-schaal" aria-hidden="true">{Array.from({ length: (PCT_MAX - PCT_MIN) / 5 + 1 }, (_, i) => <span key={i}>{PCT_MIN + i * 5}</span>)}</span>
      </label>
      <div className="bod-som">{pct}% van {euro(m.totaal)} = <strong>{euro(exact)}</strong></div>
      <div className="bod-keuzes">
        {keuzes.map((k) => (
          <button key={k.afronding} className={`bod-keuze${b.afronding === k.afronding ? " aan" : ""}`} onClick={() => { setEigen(""); kies({ afronding: k.afronding, eigen: null }); }}>
            <strong>{euro(k.bedrag)}</strong>
            <span>{k.afronding === "exact" ? "exact" : k.afronding.startsWith("omlaag") ? "↓ afronden" : "↑ afronden"}</span>
          </button>
        ))}
      </div>
      <div className="bod-eigen">
        <span className={`euro-invoer mini${b.afronding === "eigen" ? " aan" : ""}`}><span>€</span>
          <input inputMode="decimal" value={eigen} placeholder="Eigen bod" aria-label="Eigen bod" onChange={(e) => typ(e.target.value)} />
        </span>
        {b.afronding === "eigen" ? <span className={`bod-pct${nuPct > 100 ? " hoog" : ""}`}>{nuPct}%</span> : <span className="zacht klein">of typ zelf een bedrag</span>}
      </div>
      <div className={`bod-stand${m.bod > m.totaal ? " hoog" : ""}`}>
        <Icoon naam={m.bod > m.totaal ? "waarschuwing" : "check"} maat={16} />
        <span>We betalen <strong>{euro(m.bod)}</strong> · {nuPct}% van de marktwaarde{m.bod > m.totaal ? ", meer dan ze waard zijn" : ""}</span>
      </div>
      {zonderMarkt > 0 && <p className="zacht klein">Plus {euro(zonderMarkt)} voor kaarten zonder marktwaarde.</p>}
      <p className="zacht klein bod-uitleg">Per kaart zie je hierboven wat we echt betalen (in verhouding tot de marktwaarde). Zo komt het ook in de boekhouding.</p>
      {m.zonder > 0 && <p className="nakijken klein">{m.zonder === 1 ? "1 kaart heeft" : `${m.zonder} kaarten hebben`} geen marktwaarde: tik op "markt?" om ze er een te geven.</p>}
    </div>
  );
}

// ── Toevoegen aan het mandje ─────────────────────────────────────────────────

function KassaScanner({ onSluit }: { onSluit: () => void }) {
  const [vraag, setVraag] = useState<Exemplaar | null>(null);
  const [foto, setFoto] = useState<FotoResultaat | null>(null);
  const { mandje } = useApp();
  const recent = mandje.regels.filter((r) => r.richting === "uit").slice(-4).reverse();

  const kies = (ex: Exemplaar) => {
    const s = huidig();
    const actueel = s.exemplaren.find((e) => e.id === ex.id) ?? ex;
    const al = s.mandje.regels.some((r) => r.exemplaar_id === actueel.id && r.richting === "uit");
    if (al) { meld(`${actueel.naam} zit al in het mandje`, "info", undefined, 2000); return; }
    setFoto(null);
    if (inVoorraad(actueel) && actueel.opslag === "vitrine") {
      inMandje(regelUit(actueel));
      tril(40); // de lijst "Net toegevoegd" toont het al: geen extra melding
    } else {
      setVraag(actueel); // vault of al weg: eerst een vraag
    }
  };

  // Een kaart herkend op een foto: met precies één vrij exemplaar meteen in het mandje, anders kiezen.
  const opFoto = (r: FotoResultaat) => {
    if (r.zeker) {
      const s = huidig();
      const inMand = new Set(s.mandje.regels.map((x) => x.exemplaar_id));
      const vrij = s.exemplaren.filter((e) => e.kaart_id === r.kandidaten[0].id && inVoorraad(e) && !inMand.has(e.id));
      if (vrij.length === 1) return kies(vrij[0]);
    }
    setFoto(r);
  };

  return (
    <Sheet titel="Scannen voor het mandje" onSluit={onSluit} vol>
      {vraag && (
        <div className="blok">
          <strong>{vraag.naam} <span className="code">{toonCode(vraag.code)}</span></strong>
          <MandjeActie key={vraag.id} ex={vraag} stil vraagMeteen onAnnuleer={() => setVraag(null)} naToevoegen={() => setVraag(null)} />
          <button className="tekstknop" onClick={() => setVraag(null)}>Verder scannen</button>
        </div>
      )}
      {foto && <FotoKeuze r={foto} onKies={kies} onWeg={() => setFoto(null)} />}
      <Scanner gepauzeerd={!!vraag || !!foto} onExemplaar={(ex) => kies(ex)} onFoto={opFoto} compact />
      {recent.length > 0 && (
        <div className="recent-mandje">
          <span className="zacht klein">Net toegevoegd</span>
          {recent.map((r, i) => <div key={`${r.exemplaar_id ?? r.artikel_id}-${i}`} className="recent-regel"><Icoon naam="check" maat={14} /> {r.naam} <span className="rechts">{euro(r.prijs)}</span></div>)}
        </div>
      )}
      <div className="sheet-actie">
        <button className="knop groot" onClick={onSluit}>Klaar{mandje.regels.length ? ` · ${euro(totaalUit(mandje.regels))}` : ""}</button>
      </div>
    </Sheet>
  );
}

/** Na een kaartfoto in de kassa: welke kaart, en welk exemplaar ervan? */
function FotoKeuze({ r, onKies, onWeg }: { r: FotoResultaat; onKies: (ex: Exemplaar) => void; onWeg: () => void }) {
  const { exemplaren, mandje } = useApp();
  const [kaart, setKaart] = useState<CatalogusKaart | null>(r.zeker ? r.kandidaten[0] : null);
  const inMand = new Set(mandje.regels.map((x) => x.exemplaar_id));
  const exs = kaart ? exemplaren.filter((e) => e.kaart_id === kaart.id && inVoorraad(e)) : [];
  return (
    <div className="blok foto-keuze">
      <div className="scan-rij">
        <img className="scan-foto" src={r.foto} alt="" />
        <div className="res-tekst">
          <strong>{kaart ? kaart.naam : "Welke kaart is het?"}</strong>
          <span className="zacht">{kaart ? `${kaart.setCode || kaart.setId} ${kaart.nummer} · ${exs.length ? "kies het exemplaar" : "niet in voorraad"}` : "Niet zeker herkend"}</span>
        </div>
        <button className="rond-knop" onClick={onWeg} aria-label="Sluiten"><Icoon naam="kruis" maat={14} /></button>
      </div>
      <div className="scan-keuzes">
        {!kaart && r.kandidaten.slice(0, 5).map((k) => (
          <button key={k.id} className="scan-keuze" onClick={() => setKaart(k)}>
            <KaartFoto src={afbeelding(k)} alt={k.naam} klein kaart={uitCatalogus(k)} />
            <span><strong>{k.naam}</strong><em>{k.setCode || k.setId} {k.nummer}</em></span>
          </button>
        ))}
        {kaart && exs.map((e) => (
          <button key={e.id} className={`scan-keuze ex${inMand.has(e.id) ? " al" : ""}`} disabled={inMand.has(e.id)} onClick={() => onKies(e)}>
            <span className="code">{toonCode(e.code)}</span>
            <Badges ex={e} />
            <span className="rechts">{e.opslag === "vitrine" ? euro(e.hartjesprijs) : `vault ${euro(e.verkoopprijs)}`}</span>
          </button>
        ))}
      </div>
    </div>
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
              <KaartFoto src={e.afbeelding} alt={e.naam} klein kaart={e} />
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
  const { mandje } = useApp();
  const start = useRef(mandje.regels.filter((r) => r.richting === "in").length);
  const erbij = mandje.regels.filter((r) => r.richting === "in").length - start.current;
  const [kaart, setKaart] = useState<CatalogusKaart | null>(null);
  const [handmatig, setHandmatig] = useState(false);
  const [teller, setTeller] = useState(0);
  const reset = () => { setKaart(null); setHandmatig(false); setTeller((t) => t + 1); };
  return (
    <Sheet titel={kaart || handmatig ? "Kaart van de klant" : "Welke kaart brengt de klant?"} onSluit={onSluit} vol>
      {kaart || handmatig
        ? <KlantKaartDetails key={teller} kaart={kaart} onTerug={reset} onKlaar={() => { reset(); meld("Kaart van de klant toegevoegd. Volgende kaart, of Klaar.", "ok", undefined, 1800); }} />
        : <KiesKaart onKies={setKaart} onHandmatig={() => setHandmatig(true)} metArtikel={false} handmatigTekst="Staat de kaart niet in de catalogus? Vul dan zelf naam, set en nummer in." />}
      {!(kaart || handmatig) && (
        <div className="sheet-actie">
          <button className="knop groot" onClick={onSluit}>Klaar{erbij > 0 ? ` · ${erbij} ${erbij === 1 ? "kaart" : "kaarten"}` : ""}</button>
        </div>
      )}
    </Sheet>
  );
}

/**
 * Een kaart van de klant toevoegen, zoals aan de stand: kaart opzoeken, een idee van de
 * marktwaarde (Cardmarket, of voor graded de laatste eBay-verkopen), zelf de marktwaarde
 * ingeven en toevoegen. Het percentage en het afronden gebeuren daarna voor alle kaarten samen.
 */
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
    graded: false,
    grader: "PSA",
    grade: "10",
    cert: "",
    markt: "",
  });
  const [aangeraakt, setAangeraakt] = useState(false);
  const proef = (conditie: string) => voorstelVoor({ soort: "kaart", cardmarket_id: kaart?.cardmarket ?? null, taal: v.taal, conditie, variant: v.variant } as Exemplaar, gids, instellingen);
  const nm = proef("NM");
  const metConditie = proef(v.conditie);
  // Marktwaarde met conditie, op de cent (het voorstel is afgerond op hele euro's, minimum 1).
  const voorstel = !v.graded && metConditie ? Math.round(metConditie.referentie * metConditie.factor * 100) / 100 : null;
  useEffect(() => {
    if (!aangeraakt) setV((x) => ({ ...x, markt: voorstel != null ? String(voorstel).replace(".", ",") : "" }));
  }, [voorstel, aangeraakt]);
  const markt = getal(v.markt);
  const zoek = gradedZoektekst({ naam: v.naam, nummer: v.nummer, setTotaal: kaart?.setTotaal, grader: v.grader, grade: v.grade });

  const toevoegen = () => {
    if (!v.naam.trim()) return meld("Vul een naam in", "fout");
    const s = huidig();
    const codes = new Set([...alleCodes(), ...s.mandje.regels.map((r) => r.nieuw?.code).filter(Boolean) as string[]]);
    const naamOrigineel = kaart?.catalogus === "asia" ? (v.taal.startsWith("CN") ? kaart.naamZhTw || kaart.naamZhCn || kaart.naamJa : kaart.naamJa || kaart.naamZhTw) || null : null;
    const nieuw = {
      id: uuid(), code: nieuweCode(codes), soort: (v.graded ? "slab" : "kaart") as Exemplaar["soort"], naam: v.naam.trim(), naam_origineel: naamOrigineel,
      kaart_id: kaart?.id ?? null, catalogus: kaart?.catalogus ?? null, afbeelding: kaart ? afbeelding(kaart) : null,
      set_naam: kaart?.setNaam ?? null, set_code: v.setCode.trim() || null, nummer: v.nummer.trim() || null,
      taal: v.taal, conditie: v.graded ? null : v.conditie, variant: v.variant, cardmarket_id: kaart?.cardmarket ?? null,
      grader: v.graded ? v.grader : null, grade: v.graded ? v.grade.trim() || null : null, cert: v.graded ? v.cert.trim() || null : null,
      opslag: "stockdoos" as const, verkoopprijs: v.graded ? (markt != null ? Math.round(markt) : null) : metConditie?.voorstel ?? (markt != null ? Math.max(1, Math.round(markt)) : null),
    };
    Object.assign(vorigeKlantKaart, { taal: v.taal, conditie: v.conditie });
    // Prijs 0: het bod (percentage × marktwaarde, afgerond) verdeelt straks over alle kaarten.
    inMandje(regelIn(nieuw, 0, markt != null && markt > 0 ? markt : null));
    onKlaar();
  };

  const talen = asia ? TALEN.filter((t) => t.asia) : TALEN;
  return (
    <div className="formulier">
      {kaart ? (
        <div className="gekozen">
          <KaartFoto src={afbeelding(kaart)} alt={kaart.naam} klein kaart={uitCatalogus(kaart)} />
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
      <Segment<"raw" | "graded"> waarde={v.graded ? "graded" : "raw"} onKies={(x) => { setV({ ...v, graded: x === "graded" }); setAangeraakt(false); }}
        opties={[{ waarde: "raw", label: "Gewone kaart" }, { waarde: "graded", label: "Graded (slab)" }]} />
      {v.graded
        ? <GradedVelden grader={v.grader} grade={v.grade} cert={v.cert} onChange={(w) => setV({ ...v, ...w })} />
        : (
          <>
            <Veld label="Conditie"><Kiezer waarde={v.conditie} opties={CONDITIES} onKies={(c) => setV({ ...v, conditie: c })} /></Veld>
            <div className="twee">
              <Veld label="Taal">
                <select value={v.taal} onChange={(e) => setV({ ...v, taal: e.target.value })}>
                  {talen.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
                </select>
              </Veld>
              <Veld label="Variant">
                <select value={v.variant} onChange={(e) => setV({ ...v, variant: e.target.value })}>
                  {VARIANTEN.map((x) => <option key={x}>{x}</option>)}
                </select>
              </Veld>
            </div>
          </>
        )}

      <div className="markt-idee">
        {v.graded ? (
          <>
            <span className="zacht klein">Graded: kijk naar de laatste verkopen van "{zoek}".</span>
            <SoldLinks zoek={zoek} grader={v.grader} cert={v.cert} />
          </>
        ) : (
          <>
            <span className="zacht klein">
              {nm ? <>Cardmarket trend <strong>{euro(nm.referentie)}</strong> (NM){voorstel != null && v.conditie !== "NM" ? <> · {v.conditie}: <strong>{euro(voorstel)}</strong></> : null}</> : "Geen prijs in de prijsgids voor deze kaart."}
            </span>
            {kaart?.cardmarket
              ? <a className="knop zacht klein" href={cardmarketLink(kaart.cardmarket, v.taal)} target="_blank" rel="noreferrer"><Icoon naam="link" maat={14} /> Zelf kijken op Cardmarket</a>
              : <a className="knop zacht klein" href={`https://www.cardmarket.com/en/Pokemon/Products/Search?${new URLSearchParams({ searchString: [v.naam, v.nummer].filter(Boolean).join(" ") })}`} target="_blank" rel="noreferrer"><Icoon naam="link" maat={14} /> Zoek op Cardmarket</a>}
          </>
        )}
      </div>
      <Veld label="Marktwaarde (€)" hint="Wat de kaart waard is. Het percentage voor inkoop of ruil kies je daarna voor alle kaarten samen.">
        <span className="euro-invoer groot-invoer"><span>€</span>
          <input inputMode="decimal" value={v.markt} onChange={(e) => { setAangeraakt(true); setV({ ...v, markt: e.target.value }); }} placeholder="bv. 15" aria-label="Marktwaarde" />
        </span>
      </Veld>
      <div className="sheet-actie">
        <button className="knop groot" onClick={toevoegen}>
          <Icoon naam="plus" maat={18} /> Toevoegen{markt != null && markt > 0 ? ` · markt ${euro(markt)}` : ""}
        </button>
      </div>
    </div>
  );
}

// ── Afrekenen ────────────────────────────────────────────────────────────────

function Afrekenen({ onSluit, onKlaar }: { onSluit: () => void; onKlaar: (t: Transactie, wisselgeld: number | null) => void }) {
  const { mandje, instellingen } = useApp();
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
        {totaalUit(regels) > 0 && <div><span>Uit onze voorraad</span><strong>{euro(totaalUit(regels))}</strong></div>}
        {regels.some((r) => r.richting === "in") && <div><span>Van de klant</span><strong>− {euro(totaalIn(regels))}</strong></div>}
        <div className="afreken-netto"><span>{n > 0 ? "Klant betaalt" : n < 0 ? "Wij betalen de klant" : "Te betalen"}</span><strong>{euro(Math.abs(n))}</strong></div>
      </div>
      {instellingen.toonMarge && totaalUit(regels) > 0 && <MargeRij regels={regels} />}

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
      {huidigT.status !== "ongedaan" && <p className="gelukt-grapje">{kies(GELUKT[t.soort], t.id)}</p>}
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
        <button className="knop groot volgende-klant" onClick={onVolgende}>Volgende klant</button>
      </div>
      {kanTerug && huidigT.status !== "ongedaan" && <button className="tekstknop" onClick={() => ongedaanMaken(t.id)}><Icoon naam="terug" maat={16} /> Ongedaan maken</button>}
    </div>
  );
}
