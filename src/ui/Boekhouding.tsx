// Boekhouding: wat je in Dexxter ingeeft (dagontvangsten en kosten), het aankoopbewijs bij elke
// inkoop of ruil (lijst met codes, marktwaarde, percentage en foto), de dagstaat van de aankopen,
// de omzet tegenover de grens van de btw-vrijstelling en de voorraad op een datum.
// De rekenregels staan in lib/boekhouding.ts; de punten om met een boekhouder na te kijken in de README.
import { useMemo, useState, type ReactNode } from "react";
import { bedrijfVan, fotosVan, huidig, kanNieuweBoekhouding, laadFotos, meld, openPrive, OUD_SCHEMA, useApp, zetBedrijf, zetIngegeven, zetTegenpartij } from "../state";
import type { Bedrijf, Beurs, Tegenpartij, Transactie } from "../types";
import {
  BEWIJS_GROOT, bewijsAdvies, bewijsNummer, borderelLijnen, csv, dagontvangsten, dagVan, dexxterLijnen, EIGEN_LIJN, heeftBewijs,
  jaaromzet, KANAAL, kostenLijnen, voorraadOp, waarGekocht, type Dag, type Inventaris,
} from "../lib/boekhouding";
import { beursCijfers, CASH_GRENS, rond2 } from "../lib/kassa";
import { datumKort, euro, vandaag } from "../lib/format";
import { bonCode, openTegoedOp } from "../lib/tegoed";
import { toonCode } from "../lib/code";
import { Icoon, Segment, Sheet, Veld } from "./common";
import { kasOmschrijving, SOORT, TransactieRij } from "./Historiek";
import { HandtekeningBeeld, HandtekeningPad } from "./Handtekening";
import { bewaarCsv, drukAf } from "./Afdruk";
import { FotoRij, TransactieFotos, useFotos } from "./Fotos";

const dagLang = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("nl-BE", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const tijdKort = (iso: string) => new Date(iso).toLocaleTimeString("nl-BE", { hour: "2-digit", minute: "2-digit" });
const bedrijfOk = (b: Bedrijf) => !!(b.naam?.trim() && b.adres?.trim());

export { KANAAL, waarGekocht };

type Tab = "dagen" | "aankopen" | "voorraad" | "uitleg";

export function Boekhouding({ onSluit }: { onSluit: () => void }) {
  const s = useApp();
  const bedrijf = bedrijfVan(s);
  const nu = Number(vandaag().slice(0, 4));
  const [jaar, setJaar] = useState(nu);
  const [tab, setTab] = useState<Tab>("dagen");
  const [dag, setDag] = useState<string | null>(null);
  const [aankoopDag, setAankoopDag] = useState<string | null>(null);
  const [bewijs, setBewijs] = useState<string | null>(null);
  const [gegevens, setGegevens] = useState(false);
  const dagen = useMemo(() => dagontvangsten(s.transacties), [s.transacties]);
  const jaren = [...new Set([nu, ...dagen.map((d) => Number(d.datum.slice(0, 4)))])].sort((a, b) => b - a);
  const omzet = jaaromzet(dagen, jaar, bedrijf.start);
  const vanJaar = dagen.filter((d) => d.datum.startsWith(`${jaar}-`));
  const verkoopDagen = vanJaar.filter((d) => d.transacties.some((t) => t.soort === "verkoop" || t.soort === "ruil" || t.soort === "retour"));
  const aankoopDagen = vanJaar.filter((d) => d.aankopen !== 0 || d.inbreng !== 0 || d.onttrekking !== 0);
  const ingegeven = s.boekhouding.ingegeven[s.omgeving ?? "standaard"] ?? {};
  const open = dag ? dagen.find((d) => d.datum === dag) : null;
  const openAankoop = aankoopDag ? dagen.find((d) => d.datum === aankoopDag) : null;
  const beursNaam = (id: string) => s.beurzen.find((b) => b.id === id)?.naam ?? "beurs";

  return (
    <Sheet titel="Boekhouding" onSluit={onSluit} vol>
      {s.gedeeltelijk && <p className="nakijken klein">Zonder internet: de app kent nu enkel de laatste maanden. De cijfers en de voorraad kloppen pas weer als je online bent.</p>}
      {!bedrijfOk(bedrijf) && (
        <button className="melding-kaart neer boek-gegevens" onClick={() => setGegevens(true)}>
          <Icoon naam="waarschuwing" />
          <div><strong>Vul eerst je gegevens in</strong><span>Naam, adres en ondernemingsnummer komen op elk aankoopbewijs en rapport.</span></div>
        </button>
      )}

      <JaarTeller omzet={omzet} jaren={jaren} onJaar={setJaar} start={bedrijf.start} />

      <Segment<Tab> waarde={tab} onKies={setTab} opties={[
        { waarde: "dagen", label: "Verkoop" }, { waarde: "aankopen", label: "Aankoop" },
        { waarde: "voorraad", label: "Voorraad" }, { waarde: "uitleg", label: "Hoe?" },
      ]} />

      {tab === "dagen" && (
        <section className="boek-lijst">
          <p className="zacht klein">Elke dag met verkopen is één inschrijving in Dexxter (dagontvangsten). Tik op een dag voor de bedragen.</p>
          {!verkoopDagen.length && <p className="zacht center">Nog geen verkopen in {jaar}.</p>}
          <ul className="lijst">
            {verkoopDagen.map((d) => (
              <li key={d.datum}>
                <button className="lijst-knop boek-dag" onClick={() => setDag(d.datum)}>
                  <span className={`boek-vink${ingegeven[d.datum] ? " aan" : ""}`} aria-label={ingegeven[d.datum] ? "In Dexxter" : "Nog niet in Dexxter"}>
                    <Icoon naam={ingegeven[d.datum] ? "check" : "klok"} maat={16} />
                  </span>
                  <span className="lijst-naam">
                    <strong>{dagLang(d.datum)}</strong>
                    <span className="zacht klein">
                      {d.beurzen.map(beursNaam).join(", ") || "zonder beurs"}
                      {d.eigenLijnen.length > 0 && ` · ${d.eigenLijnen.length} boven ${euro(EIGEN_LIJN, true)}`}
                      {d.retour !== 0 && " · met retour"}
                    </span>
                  </span>
                  <span className="rechts boek-bedrag">{euro(d.ontvangsten)}</span>
                </button>
              </li>
            ))}
          </ul>
          {verkoopDagen.length > 0 && (
            <div className="knoppenrij">
              <button className="knop zacht" onClick={() => bewaarCsv(`bindr-dagontvangsten-${jaar}.csv`, dagenCsv(verkoopDagen, s.beurzen))}><Icoon naam="link" maat={16} /> CSV {jaar}</button>
            </div>
          )}
        </section>
      )}

      {tab === "aankopen" && (
        <section className="boek-lijst">
          <p className="zacht klein">Per dag één kost in Dexxter, met de dagstaat als bijlage: alle aankopen met codes, marktwaarde, percentage, prijs en foto's. Zo kan je elke kaart terugvinden.</p>
          {!aankoopDagen.length && <p className="zacht center">Nog geen aankopen in {jaar}.</p>}
          <ul className="lijst">
            {aankoopDagen.map((d) => (
              <li key={d.datum}>
                <button className="lijst-knop boek-dag" onClick={() => setAankoopDag(d.datum)}>
                  <span className="boek-vink"><Icoon naam="inkoop" maat={16} /></span>
                  <span className="lijst-naam">
                    <strong>{dagLang(d.datum)}</strong>
                    <span className="zacht klein">
                      {[d.aankopenGeld ? `inkoop ${euro(d.aankopenGeld)}` : null, d.aankopenRuil ? `via ruil ${euro(d.aankopenRuil)}` : null,
                        d.aankopenTegoed ? `tegen tegoedbon ${euro(d.aankopenTegoed)}` : null, d.aankopenFactuur ? `met factuur ${euro(d.aankopenFactuur)}` : null,
                        d.inbreng ? `uit privé ${euro(d.inbreng)}` : null, d.onttrekking ? `naar privé ${euro(d.onttrekking)}` : null].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <span className="rechts boek-bedrag">{euro(rond2(d.aankopen + d.inbreng))}</span>
                </button>
              </li>
            ))}
          </ul>
          {aankoopDagen.length > 0 && (
            <div className="knoppenrij">
              <button className="knop zacht" onClick={() => bewaarCsv(`bindr-aankopen-${jaar}.csv`, aankopenCsv(aankoopDagen.flatMap((d) => d.transacties.filter((t) => heeftBewijs(t) || t.soort === "prive")), s.beurzen))}><Icoon naam="link" maat={16} /> CSV {jaar}</button>
            </div>
          )}
        </section>
      )}

      {tab === "voorraad" && <VoorraadOpDatum jaar={jaar} bedrijf={bedrijf} />}

      {tab === "uitleg" && <Uitleg />}

      <button className="tekstknop boek-gegevens-knop" onClick={() => setGegevens(true)}>
        <Icoon naam="tag" maat={16} /> Gegevens voor aankoopbewijs en rapporten{bedrijf.naam ? `: ${bedrijf.naam}` : ""}
      </button>

      {open && <DagSheet dag={open} onSluit={() => setDag(null)} onAankopen={() => { setDag(null); setAankoopDag(open.datum); }} />}
      {openAankoop && <AankoopDagSheet dag={openAankoop} onSluit={() => setAankoopDag(null)} onBewijs={setBewijs} />}
      {bewijs && <BewijsSheet id={bewijs} onSluit={() => setBewijs(null)} />}
      {gegevens && <BedrijfSheet onSluit={() => setGegevens(false)} />}
    </Sheet>
  );
}

const aankoopVan = (t: Transactie) => rond2(t.regels.filter((r) => r.richting === "in").reduce((x, r) => x + r.prijs, 0));

// ── Jaaromzet ────────────────────────────────────────────────────────────────

function JaarTeller({ omzet, jaren, onJaar, start }: { omzet: ReturnType<typeof jaaromzet>; jaren: number[]; onJaar: (j: number) => void; start?: string | null }) {
  const vol = Math.min(100, omzet.pct);
  const toestand = omzet.omzet > omzet.tolerantie ? "over" : omzet.omzet > omzet.grens ? "rand" : omzet.pct >= 90 ? "dicht" : "ok";
  return (
    <section className={`jaar-teller ${toestand}`}>
      <div className="jaar-kop">
        <span className="zacht klein">Omzet (verkoop en ruil)</span>
        <select value={omzet.jaar} onChange={(e) => onJaar(Number(e.target.value))} aria-label="Jaar">
          {jaren.map((j) => <option key={j} value={j}>{j}</option>)}
        </select>
      </div>
      <strong className="jaar-omzet">{euro(omzet.omzet)}</strong>
      <div className="jaar-balk" role="img" aria-label={`${omzet.pct}% van de grens`}>
        <span style={{ width: `${vol}%` }} />
      </div>
      <span className="zacht klein">
        {omzet.grens > 0
          ? <>{omzet.pct}% van {euro(omzet.grens, true)}, de grens van de btw-vrijstelling{start?.startsWith(String(omzet.jaar)) ? " (startjaar: pro rata)" : ""}. Nog {euro(Math.max(0, rond2(omzet.grens - omzet.omzet)), true)} ruimte.</>
          : "Je activiteit begint pas later."}
        {toestand === "dicht" && " Je nadert de grens: bespreek het met je boekhouder."}
        {toestand === "rand" && " Over de grens, maar binnen de 10% marge: tot eind december blijf je vrijgesteld. Contacteer je boekhouder."}
        {toestand === "over" && " Meer dan 10% over de grens: vanaf nu is btw verschuldigd. Contacteer meteen je boekhouder."}
      </span>
    </section>
  );
}

// ── Eén dag: verkoop ─────────────────────────────────────────────────────────

function DagSheet({ dag, onSluit, onAankopen }: { dag: Dag; onSluit: () => void; onAankopen: () => void }) {
  const s = useApp();
  const ingegeven = !!s.boekhouding.ingegeven[s.omgeving ?? "standaard"]?.[dag.datum];
  const beurzen = dag.beurzen.map((id) => s.beurzen.find((b) => b.id === id)).filter(Boolean) as Beurs[];
  const lijnen = dexxterLijnen(dag, beurzen.map((b) => b.naam).join(", ") || undefined);
  const bedrijf = bedrijfVan(s);
  return (
    <Sheet titel={dagLang(dag.datum)} onSluit={onSluit} vol>
      <section className="blok dexxter-blok">
        <h3>In Dexxter</h3>
        <p className="zacht klein">Dagontvangsten › nieuwe inschrijving, datum {datumKort(dag.datum)}. Eén lijn per bedrag hieronder.</p>
        <DexxterLijnen lijnen={lijnen} />
        {dag.eigenLijnen.length > 0 && <p className="zacht klein">Stukken boven {euro(EIGEN_LIJN, true)} staan apart, met een omschrijving (verplicht sinds 2026).</p>}
        <label className="schakel">
          <input type="checkbox" checked={ingegeven} onChange={(e) => zetIngegeven(dag.datum, e.target.checked)} />
          <span>Ingegeven in Dexxter</span>
        </label>
      </section>

      <section className="blok">
        <h3>Zo komt het tot stand</h3>
        <div className="afsluit-rij"><span>Verkopen</span><strong>{euro(dag.verkopen)}</strong></div>
        {dag.ruil !== 0 && <div className="afsluit-rij"><span>Ruil (onze kaarten, aan de afgesproken prijs)</span><strong>{euro(dag.ruil)}</strong></div>}
        {dag.retour !== 0 && <div className="afsluit-rij"><span>Retour</span><strong>{euro(dag.retour)}</strong></div>}
        <div className="afsluit-rij totaal"><span>Ontvangsten</span><strong>{euro(dag.ontvangsten)}</strong></div>
        <div className="afsluit-rij"><span>waarvan kaarten en slabs</span><strong>{euro(dag.kaarten)}</strong></div>
        <div className="afsluit-rij"><span>waarvan artikels (binders, sealed, 3D)</span><strong>{euro(dag.artikels)}</strong></div>
        <div className="afsluit-rij"><span>Geld: cash</span><strong>{euro(dag.cash)}</strong></div>
        <div className="afsluit-rij"><span>Geld: SumUp</span><strong>{euro(dag.sumup)}</strong></div>
        {dag.bank !== 0 && <div className="afsluit-rij"><span>Geld: overschrijving</span><strong>{euro(dag.bank)}</strong></div>}
        {dag.verkopenTegoed !== 0 && <div className="afsluit-rij"><span>Betaald met een tegoedbon (geen geld, wel omzet)</span><strong>{euro(dag.verkopenTegoed)}</strong></div>}
        {dag.verzending !== 0 && <div className="afsluit-rij"><span>waarvan verzendkosten aangerekend</span><strong>{euro(dag.verzending)}</strong></div>}
        {dag.aankopenTegoed !== 0 && <div className="afsluit-rij"><span>Gekocht tegen een tegoedbon (geen geld, wel een kost)</span><strong>{euro(dag.aankopenTegoed)}</strong></div>}
        {(dag.kas !== 0 || dag.kasSumup !== 0) && <div className="afsluit-rij"><span>Kasbewegingen (geen omzet)</span><strong>{euro(dag.kas)}{dag.kasSumup ? ` · SumUp ${euro(dag.kasSumup)}` : ""}</strong></div>}
        {dag.kasSumup > 0 && <p className="zacht klein">SumUp van een kasbeweging is geen verkoop: trek het af als je de SumUp-uitbetaling met je ontvangsten vergelijkt.</p>}
        <p className="zacht klein">Een ruil telt als verkoop van onze kaarten: die waarde telt mee voor de grens van de btw-vrijstelling. Hun kaarten staan als kost bij de aankopen van deze dag.</p>
      </section>

      {(dag.aankopen !== 0 || dag.inbreng !== 0 || dag.onttrekking !== 0) && (
        <button className="borderel-knop mist" onClick={onAankopen}>
          <Icoon naam="inkoop" maat={18} />
          <span><strong>Aankopen van deze dag: {euro(rond2(dag.aankopen + dag.inbreng))}</strong><span className="zacht klein">dagstaat en kosten voor Dexxter</span></span>
        </button>
      )}

      {beurzen.map((b) => <KasRapport key={b.id} beurs={b} />)}

      <section className="blok">
        <h3>Transacties</h3>
        <ul className="transacties">
          {dag.transacties.map((t) => <TransactieRij key={t.id} t={t} beheerder={t.beheerder ? s.beheerders[t.beheerder] : undefined} />)}
        </ul>
      </section>

      <div className="knoppenrij onderaan">
        <button className="knop" onClick={() => drukAf(<DagDocument dag={dag} beurzen={beurzen} bedrijf={bedrijf} beheerders={s.beheerders} />, `Dagontvangsten ${dag.datum}`)}>
          <Icoon naam="printer" maat={18} /> Dagrapport (pdf)
        </button>
        <button className="knop zacht" onClick={() => bewaarCsv(`bindr-dag-${dag.datum}.csv`, transactiesCsv(dag.transacties, s.beurzen))}>CSV</button>
      </div>
    </Sheet>
  );
}

function DexxterLijnen({ lijnen }: { lijnen: { omschrijving: string; bedrag: number }[] }) {
  const kopieer = (x: number) => {
    const tekst = x.toFixed(2).replace(".", ",");
    void navigator.clipboard?.writeText(tekst).then(() => meld(`${tekst} gekopieerd`), () => meld(tekst, "info"));
  };
  return (
    <ul className="dexxter-lijnen">
      {lijnen.map((l, i) => (
        <li key={i}>
          <span>{l.omschrijving}</span>
          <strong>{euro(l.bedrag)}</strong>
          <button className="tekstknop klein" onClick={() => kopieer(l.bedrag)}>Kopieer</button>
        </li>
      ))}
    </ul>
  );
}

function KasRapport({ beurs }: { beurs: Beurs }) {
  const { transacties } = useApp();
  const c = beursCijfers(beurs, transacties.filter((t) => t.beurs_id === beurs.id));
  const kas = rond2(transacties.filter((t) => t.beurs_id === beurs.id && t.soort === "kas" && t.status !== "ongedaan").reduce((x, t) => x + t.cash, 0));
  return (
    <section className="blok">
      <h3>Kas · {beurs.naam}</h3>
      <div className="afsluit-rij"><span>Startkas</span><strong>{euro(beurs.startkas ?? 0)}</strong></div>
      <div className="afsluit-rij"><span>Cash van verkopen, aankopen en retours</span><strong>{euro(rond2(c.cash - kas))}</strong></div>
      {kas !== 0 && <div className="afsluit-rij"><span>Kasbewegingen</span><strong>{euro(kas)}</strong></div>}
      <div className="afsluit-rij totaal"><span>Verwacht in de koffer</span><strong>{euro(c.kasVerwacht)}</strong></div>
      {beurs.getelde_kas != null && (
        <div className={`afsluit-rij${Math.abs(beurs.getelde_kas - c.kasVerwacht) >= 0.01 ? " verschil" : ""}`}>
          <span>Geteld</span><strong>{euro(beurs.getelde_kas)}{Math.abs(beurs.getelde_kas - c.kasVerwacht) >= 0.01 ? ` (verschil ${euro(rond2(beurs.getelde_kas - c.kasVerwacht))})` : ""}</strong>
        </div>
      )}
    </section>
  );
}

// ── Eén dag: aankopen ────────────────────────────────────────────────────────

/** De kosten van een dag voor Dexxter: elk een uitgave, met de dagstaat als bijlage. */
export { kostenLijnen };

function AankoopDagSheet({ dag, onSluit, onBewijs }: { dag: Dag; onSluit: () => void; onBewijs: (id: string) => void }) {
  const s = useApp();
  const lijst = dag.transacties.filter((t) => heeftBewijs(t) || t.soort === "prive" || (t.soort === "retour" && t.regels.some((r) => r.richting === "uit")));
  const van = useFotos(lijst.map((t) => t.id));
  const beurzen = dag.beurzen.map((id) => s.beurzen.find((b) => b.id === id)).filter(Boolean) as Beurs[];
  const bedrijf = bedrijfVan(s);
  const [bezig, setBezig] = useState(false);
  const print = async () => {
    setBezig(true);
    await laadFotos(lijst.map((t) => t.id));
    setBezig(false);
    drukAf(<DagstaatAankopen dag={dag} lijst={lijst} beurzen={s.beurzen} bedrijf={bedrijf} />, `Aankopen ${dag.datum}`);
  };
  return (
    <Sheet titel={`Aankopen · ${dagLang(dag.datum)}`} onSluit={onSluit} vol>
      <section className="blok dexxter-blok">
        <h3>In Dexxter</h3>
        <p className="zacht klein">Uitgaven › nieuwe uitgave, datum {datumKort(dag.datum)}: aankoop van handelsgoederen, leverancier "particulieren", 0% btw. Voeg de dagstaat (pdf) toe als bijlage.</p>
        <DexxterLijnen lijnen={kostenLijnen(dag, beurzen.map((b) => b.naam).join(", ") || undefined)} />
        {dag.aankopenFactuur !== 0 && <p className="zacht klein">Met factuur: {euro(dag.aankopenFactuur)}. Die staat niet in de lijnen hierboven: geef elke factuur apart in Dexxter in (met de factuur als bijlage).</p>}
        {dag.onttrekking !== 0 && <p className="zacht klein">Naar privé: {euro(dag.onttrekking)} aan aankoopwaarde. In Dexxter als "verkoop aan jezelf" aan die waarde; geen dagontvangst van klanten en geen omzet voor de grens (laat bevestigen door je boekhouder).</p>}
        <button className="knop" disabled={bezig} onClick={() => void print()}><Icoon naam="printer" maat={18} /> {bezig ? "Foto's laden…" : "Dagstaat aankopen (pdf)"}</button>
      </section>

      <ul className="lijst boek-lijst">
        {lijst.map((t) => {
          const advies = heeftBewijs(t) ? bewijsAdvies(t, van(t.id).length) : [];
          return (
            <li key={t.id}>
              <button className="lijst-knop" onClick={() => onBewijs(t.id)}>
                <span className={`boek-vink${advies.length ? " mist" : " aan"}`}><Icoon naam={advies.length ? "foto" : "check"} maat={16} /></span>
                <span className="lijst-naam">
                  <strong>{t.soort === "prive" ? (t.regels.some((r) => r.richting === "in") ? "Uit privé ingebracht" : "Naar privé") : t.tegenpartij?.naam?.trim() || "Verkoper zonder naam"}</strong>
                  <span className="zacht klein">{tijdKort(t.tijd)} · {SOORT[t.soort].naam.toLowerCase()} · {waarGekocht(t, s.beurzen)}{advies.length ? ` · aangeraden: ${advies.join(", ")}` : ""}</span>
                </span>
                <span className="rechts boek-bedrag">{euro(t.soort === "prive" && !t.regels.some((r) => r.richting === "in") ? rond2(t.regels.reduce((x, r) => x + r.prijs, 0)) : aankoopVan(t))}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}

// ── Aankoopbewijs ────────────────────────────────────────────────────────────

/**
 * Wie verkocht (geen verplichting aan de stand): minstens een voornaam; vanaf € 250 liefst de
 * volledige naam en de gemeente. Een handelaar geeft een factuur. Geen identiteitskaart.
 */
/** Waar we buiten een beurs kochten: online, op een rommelmarkt of elders. */
export function KanaalVeld({ waarde, onChange, label = "Waar gekocht?" }: { waarde: Tegenpartij; onChange: (t: Tegenpartij) => void; label?: string }) {
  return (
    <Veld label={label}>
      <div className="kiezer">
        {(["online", "rommelmarkt", "andere"] as const).map((k) => (
          <button key={k} type="button" className={`chip${waarde.kanaal === k ? " aan" : ""}`} onClick={() => onChange({ ...waarde, kanaal: k })}>{KANAAL[k]}</button>
        ))}
      </div>
    </Veld>
  );
}

/** Op een beurs: kochten we van een andere stand? Enkel ter info (bv. om later te zien wat je bij vendors kocht). */
export function VendorSchakel({ waarde, onChange }: { waarde: Tegenpartij; onChange: (t: Tegenpartij) => void }) {
  return (
    <label className="schakel rij">
      <input type="checkbox" checked={!!waarde.vendor} onChange={(e) => onChange({ ...waarde, vendor: e.target.checked })} />
      <span>Van een andere vendor <span className="zacht klein">(een stand op de beurs; enkel ter info)</span></span>
    </label>
  );
}

export function TegenpartijVelden({ waarde, onChange, groot = false, kanaal = false }: {
  waarde: Tegenpartij; onChange: (t: Tegenpartij) => void; groot?: boolean; kanaal?: boolean;
}) {
  const zet = (w: Partial<Tegenpartij>) => onChange({ ...waarde, ...w });
  const handelaar = waarde.type === "handelaar";
  return (
    <div className="tegenpartij">
      <label className="schakel rij">
        <input type="checkbox" checked={!!waarde.met_factuur} onChange={(e) => zet(e.target.checked ? { met_factuur: true, type: "handelaar" } : { met_factuur: false })} />
        <span>Met factuur <span className="zacht klein">(de factuur geef je zelf in Dexxter in; telt niet in de dagstaat)</span></span>
      </label>
      <Segment<"particulier" | "handelaar"> waarde={handelaar ? "handelaar" : "particulier"} onKies={(type) => zet({ type })}
        opties={[{ waarde: "particulier", label: "Particulier" }, { waarde: "handelaar", label: "Handelaar" }]} />
      {kanaal && <KanaalVeld waarde={waarde} onChange={onChange} />}
      <Veld label={handelaar ? "Naam van de zaak" : groot ? "Naam" : "Naam (minstens een voornaam)"}>
        <input value={waarde.naam ?? ""} onChange={(e) => zet({ naam: e.target.value })} autoComplete="off" placeholder={handelaar ? "naam van de zaak" : "bv. Jan"} />
      </Veld>
      {handelaar ? (
        <>
          <Veld label="Ondernemingsnummer (optioneel)"><input value={waarde.btw ?? ""} onChange={(e) => zet({ btw: e.target.value })} autoComplete="off" placeholder="BE0123.456.789" /></Veld>
          <Veld label="Factuurnummer" hint={waarde.met_factuur ? "De factuur is het bewijs. Geef ze in Dexxter in als aparte uitgave." : "Een handelaar geeft je een factuur: die is het bewijs."}><input value={waarde.factuur ?? ""} onChange={(e) => zet({ factuur: e.target.value })} autoComplete="off" /></Veld>
        </>
      ) : (
        <Veld label={groot ? `Gemeente (aangeraden boven ${euro(BEWIJS_GROOT, true)})` : "Gemeente (optioneel)"}>
          <input value={waarde.adres ?? ""} onChange={(e) => zet({ adres: e.target.value })} autoComplete="off" placeholder="bv. Gent" />
        </Veld>
      )}
    </div>
  );
}

export function BewijsSheet({ id, onSluit }: { id: string; onSluit: () => void }) {
  const s = useApp();
  const t = s.transacties.find((x) => x.id === id);
  const [tp, setTp] = useState<Tegenpartij>(() => ({ type: "particulier", ...(t?.tegenpartij ?? {}) }));
  const [tekenen, setTekenen] = useState<"verkoper" | "ons" | null>(null);
  const van = useFotos(t ? [t.id] : []);
  if (!t) return null;
  const nieuw = kanNieuweBoekhouding(s);
  const bewaard = t.tegenpartij ?? {};
  const gewijzigd = JSON.stringify({ type: "particulier", ...bewaard }) !== JSON.stringify(tp);
  const fotos = van(t.id);
  const advies = heeftBewijs(t) ? bewijsAdvies({ ...t, tegenpartij: tp }, fotos.length) : [];
  const beurs = s.beurzen.find((b) => b.id === t.beurs_id) ?? null;
  const priveIn = t.soort === "prive" && t.regels.some((r) => r.richting === "in");
  const groot = aankoopVan(t) >= BEWIJS_GROOT;
  const bewaar = (extra: Partial<Tegenpartij> = {}) => {
    const n: Tegenpartij = { ...tp, ...extra };
    setTp(n);
    zetTegenpartij(t.id, n);
  };
  const lijnenIn = borderelLijnen(t.regels, "in");
  const lijnenUit = borderelLijnen(t.regels, "uit");
  const titel = t.soort === "prive" ? (priveIn ? "Inbreng uit privé" : "Naar privé") : t.soort === "ruil" ? "Ruil" : "Aankoop";
  return (
    <Sheet titel={`${titel} ${bewijsNummer(t)}`} onSluit={onSluit} vol>
      {t.status === "ongedaan" && <div className="melding-kaart neer"><Icoon naam="terug" /><div><strong>Ongedaan gemaakt</strong><span>Deze aankoop telt niet mee.</span></div></div>}
      {!nieuw && <p className="nakijken">{OUD_SCHEMA}</p>}
      <p className="zacht klein">{dagLang(dagVan(t.tijd))} om {tijdKort(t.tijd)} · {waarGekocht(t, s.beurzen)}</p>
      {heeftBewijs(t) && (
        <div className={`borderel-stand${advies.length ? " mist" : " ok"}`}>
          <Icoon naam={advies.length ? "foto" : "check"} maat={18} />
          <span>{advies.length ? `Sterker met: ${advies.join(", ")}` : "In orde: de lijst, de marktwaarde en de foto's zijn het bewijs."}</span>
        </div>
      )}

      <section className="blok">
        <h3>Foto's</h3>
        <p className="zacht klein">{priveIn ? "Bv. een screenshot van de Cardmarket-prijzen." : "De gekochte kaarten op tafel, of een screenshot van het gesprek bij een online aankoop."}</p>
        <TransactieFotos id={t.id} kan={nieuw && t.status !== "ongedaan"} />
      </section>

      {t.soort !== "prive" && (
        <section className="blok">
          <h3>{t.soort === "ruil" ? "Met wie we ruilden" : "Verkoper"} <span className="zacht klein">(optioneel)</span></h3>
          {bewaard.handtekening ? (
            <dl className="gegevens">
              <dt>Naam</dt><dd>{bewaard.naam || "–"}</dd>
              {bewaard.type === "handelaar"
                ? <><dt>Onderneming</dt><dd>{bewaard.btw || "–"}</dd><dt>Factuur</dt><dd>{bewaard.factuur || "–"}</dd></>
                : <><dt>Gemeente</dt><dd>{bewaard.adres || "–"}</dd></>}
            </dl>
          ) : (
            <>
              <TegenpartijVelden waarde={tp} onChange={setTp} groot={groot} kanaal={!t.beurs_id} />
              {gewijzigd && <button className="knop" disabled={!nieuw} onClick={() => { bewaar(); meld("Aankoopbewijs bewaard"); }}>Bewaar</button>}
            </>
          )}
        </section>
      )}

      <section className="blok">
        <h3>{t.soort === "ruil" ? "Wat we kregen" : t.soort === "prive" && !priveIn ? "Naar privé" : "Wat we kregen"}</h3>
        {lijnenIn.length > 0 && <BorderelTabel lijnen={lijnenIn} datum={t.tijd} />}
        {(t.soort === "ruil" || (t.soort === "prive" && lijnenUit.length > 0)) && (
          <>{t.soort === "ruil" && <h3>Wat we gaven</h3>}<BorderelTabel lijnen={lijnenUit} datum={t.tijd} /></>
        )}
        {t.soort === "prive"
          ? <p className="zacht klein">{priveIn ? "Geen geld: een kost die je met privémiddelen betaalde." : "Geen geld: de aankoopwaarde gaat uit de kosten (onttrekking)."}</p>
          : <><div className="afsluit-rij totaal"><span>{t.soort === "ruil" ? (t.totaal > 0 ? "Klant betaalde bij" : t.totaal < 0 ? "Wij betaalden bij" : "Zonder bijbetaling") : "Betaald"}</span><strong>{euro(Math.abs(t.totaal))}</strong></div>
            <div className="zacht klein">{betaalTekst(t)}</div>
            {(t.tegoed ?? 0) < 0 && <p className="zacht klein">{bonTekst(t, bedrijfVan(s))}</p>}</>}
      </section>

      {t.soort !== "prive" && (groot || bewaard.handtekening || bewaard.handtekening_ons) && (
        <section className="blok handtekeningen">
          <h3>Handtekening <span className="zacht klein">(aangeraden boven {euro(BEWIJS_GROOT, true)})</span></h3>
          <div className="handtekening-rij">
            <div>
              <span className="zacht klein">{t.soort === "ruil" ? "Klant" : "Verkoper"}</span>
              {bewaard.handtekening ? <HandtekeningBeeld pad={bewaard.handtekening} /> : <span className="handtekening-leeg">niet getekend</span>}
              {!bewaard.handtekening && t.status !== "ongedaan" && nieuw && <button className="knop zacht klein" onClick={() => setTekenen("verkoper")}>Laten tekenen</button>}
              {bewaard.handtekening && <button className="tekstknop klein" onClick={() => { if (confirm("Handtekening wissen? Dan kan je de gegevens weer aanpassen en opnieuw laten tekenen.")) bewaar({ handtekening: null, getekend_op: null }); }}>Opnieuw laten tekenen</button>}
            </div>
            <div>
              <span className="zacht klein">Bind'r</span>
              {bewaard.handtekening_ons ? <HandtekeningBeeld pad={bewaard.handtekening_ons} /> : <span className="handtekening-leeg">niet getekend</span>}
              {!bewaard.handtekening_ons && t.status !== "ongedaan" && nieuw && <button className="knop zacht klein" onClick={() => setTekenen("ons")}>Zelf tekenen</button>}
            </div>
          </div>
          {bewaard.getekend_op && <p className="zacht klein">Getekend op {datumKort(bewaard.getekend_op)} om {tijdKort(bewaard.getekend_op)}.</p>}
        </section>
      )}

      <div className="knoppenrij onderaan">
        <button className="knop" onClick={async () => { await laadFotos([t.id]); drukAf(<BewijsDocument t={{ ...t, tegenpartij: { ...bewaard } }} beurs={beurs} beurzen={s.beurzen} bedrijf={bedrijfVan(s)} />, bewijsNummer(t)); }}>
          <Icoon naam="printer" maat={18} /> Afdrukken of pdf
        </button>
      </div>

      {tekenen && (
        <HandtekeningPad titel={tekenen === "verkoper" ? "Handtekening van de verkoper" : "Handtekening Bind'r"}
          uitleg={tekenen === "verkoper" ? verklaring(t, bedrijfVan(s)) : "Voor akkoord, namens Bind'r."}
          onSluit={() => setTekenen(null)}
          onKlaar={(pad) => {
            if (tekenen === "verkoper") bewaar({ handtekening: pad, getekend_op: new Date().toISOString() });
            else bewaar({ handtekening_ons: pad });
            setTekenen(null);
            meld("Handtekening bewaard");
          }} />
      )}
    </Sheet>
  );
}

/** Knop naar het aankoopbewijs, met wat het sterker zou maken (na het afrekenen en in de transactie). */
export function BewijsKnop({ t, onOpen }: { t: Transactie; onOpen: () => void }) {
  const van = useFotos([t.id]);
  const advies = bewijsAdvies(t, van(t.id).length);
  return (
    <button className={`borderel-knop${advies.length ? " mist" : ""}`} onClick={onOpen}>
      <Icoon naam={advies.length ? "foto" : "check"} maat={18} />
      <span><strong>Aankoopbewijs {bewijsNummer(t)}</strong><span className="zacht klein">{advies.length ? `aangeraden: ${advies.join(", ")}` : "in orde"}</span></span>
    </button>
  );
}

function BorderelTabel({ lijnen, datum }: { lijnen: ReturnType<typeof borderelLijnen>; datum: string }) {
  return (
    <ul className="borderel-lijnen">
      {lijnen.map((l, i) => (
        <li key={i}>
          <span className="borderel-naam"><strong>{l.naam}</strong>{l.code && <span className="code"> {toonCode(l.code)}</span>}<span className="zacht klein">{l.omschrijving}</span></span>
          <span className="borderel-cijfers">
            <strong>{euro(l.prijs)}</strong>
            {l.markt != null && <span className="zacht klein">markt {euro(l.markt)}{l.pct != null ? ` · ${l.pct}%` : ""}</span>}
            {l.bron && l.bron !== "onze prijs" && <span className="zacht klein">{l.bron}, {datumKort(datum)}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

const betaalTekst = (t: Transactie) => [
  t.cash ? `cash ${euro(Math.abs(t.cash))}` : null, t.sumup ? `SumUp ${euro(Math.abs(t.sumup))}` : null, t.bank ? `overschrijving ${euro(Math.abs(t.bank))}` : null,
  (t.tegoed ?? 0) < 0 ? `tegoedbon ${bonCode(t)} ${euro(-(t.tegoed ?? 0))}` : (t.tegoed ?? 0) > 0 ? `tegoed ${euro(t.tegoed ?? 0)}` : null,
].filter(Boolean).join(" + ") || "zonder geld";

/** Een inkoop tegen een tegoedbon: wat de bon is (op het bewijs en het scherm). */
function bonTekst(t: Transactie, b: Bedrijf): string {
  const wie = b.naam?.trim() || "Bind'r";
  return `Betaald met tegoedbon ${bonCode(t)} van ${euro(-(t.tegoed ?? 0))}, op naam van ${t.tegenpartij?.naam?.trim() || "de verkoper"}, uitgegeven op ${datumKort(t.tijd)}. Inwisselbaar bij ${wie} voor kaarten en artikels, niet in geld.`;
}

/** Wat de verkoper ondertekent (enkel als hij tekent). */
function verklaring(t: Transactie, b: Bedrijf): string {
  const wie = b.naam?.trim() || "Bind'r";
  if (t.soort === "ruil") return `Ik ruil de kaarten op dit bewijs met ${wie}, als particulier en uit mijn eigen verzameling. Ze zijn mijn eigendom.`;
  const bon = -(t.tegoed ?? 0);
  if (bon > 0) {
    const geld = rond2(Math.abs(t.totaal) - bon);
    return `Ik verkoop de kaarten op dit bewijs aan ${wie} voor ${euro(Math.abs(t.totaal))}, als particulier en uit mijn eigen verzameling. Ze zijn mijn eigendom. Ik ontving ${geld > 0 ? `${euro(geld)} en ` : ""}tegoedbon ${bonCode(t)} van ${euro(bon)}, op mijn naam en inwisselbaar bij ${wie} voor kaarten en artikels.`;
  }
  return `Ik verkoop de kaarten op dit bewijs aan ${wie} voor ${euro(Math.abs(t.totaal))}, als particulier en uit mijn eigen verzameling. Ze zijn mijn eigendom en ik ontving het bedrag.`;
}

// ── Bedrijfsgegevens ─────────────────────────────────────────────────────────

export function BedrijfVelden() {
  const s = useApp();
  const [b, setB] = useState<Bedrijf>(() => bedrijfVan(s));
  const opgeslagen = bedrijfVan(s);
  const zelfde = ["naam", "adres", "kbo", "start"].every((k) => (b[k as keyof Bedrijf] ?? null) === (opgeslagen[k as keyof Bedrijf] ?? null));
  const omg = s.omgevingen.find((o) => o.id === s.omgeving);
  const aan = bedrijfVan(s).boekhouding !== false;
  return (
    <div className="formulier">
      <label className="schakel rij">
        <input type="checkbox" checked={aan} onChange={(e) => { zetBedrijf({ ...bedrijfVan(huidig()), boekhouding: e.target.checked }); meld(e.target.checked ? `Boekhouding aan${omg ? ` voor ${omg.naam}` : ""}` : `${omg?.naam ?? "Deze omgeving"} werkt nu als particulier`); }} />
        <span>Boekhouding{omg ? ` voor ${omg.naam}` : ""} <span className="zacht klein">{aan ? "(als zaak: aankoopbewijzen, dagontvangsten, privé ⇄ zaak)" : "(uit: je werkt als particulier, zonder aankoopbewijzen of boekhouding)"}</span></span>
      </label>
      {!aan && <p className="zacht klein">De kassa, de kas en de beurzen werken gewoon. Profiel toont geen Boekhouding en geen Privé ⇄ zaak. Zet ze aan zodra je als zaak start: wat je al boekte, komt dan mee in de boekhouding.</p>}
      {aan && <>
      {omg && <p className="zacht klein">Voor {omg.naam}. Elke omgeving heeft eigen gegevens.</p>}
      <Veld label="Naam (zoals in de KBO)"><input value={b.naam ?? ""} onChange={(e) => setB({ ...b, naam: e.target.value })} /></Veld>
      <Veld label="Adres"><input value={b.adres ?? ""} onChange={(e) => setB({ ...b, adres: e.target.value })} /></Veld>
      <Veld label="Ondernemingsnummer"><input value={b.kbo ?? ""} onChange={(e) => setB({ ...b, kbo: e.target.value })} placeholder="0123.456.789" /></Veld>
      <Veld label="Begin van de activiteit" hint="Voor de grens van de btw-vrijstelling: in het eerste jaar geldt een deel van € 25.000.">
        <input type="date" value={b.start ?? ""} onChange={(e) => setB({ ...b, start: e.target.value || null })} />
      </Veld>
      <button className="knop" disabled={zelfde} onClick={() => { zetBedrijf({ ...bedrijfVan(huidig()), naam: b.naam?.trim() || null, adres: b.adres?.trim() || null, kbo: b.kbo?.trim() || null, start: b.start || null }); meld("Gegevens bewaard"); }}>Bewaar</button>
      </>}
    </div>
  );
}

function BedrijfSheet({ onSluit }: { onSluit: () => void }) {
  return <Sheet titel="Gegevens voor de boekhouding" onSluit={onSluit}><BedrijfVelden /></Sheet>;
}

// ── Voorraad op een datum ────────────────────────────────────────────────────

function VoorraadOpDatum({ jaar, bedrijf }: { jaar: number; bedrijf: Bedrijf }) {
  const s = useApp();
  const standaard = jaar < Number(vandaag().slice(0, 4)) ? `${jaar}-12-31` : vandaag();
  const [datum, setDatum] = useState(standaard);
  const [alles, setAlles] = useState(false);
  const inv = useMemo(() => {
    const h = huidig();
    return voorraadOp(datum, h.exemplaren, h.artikelen, h.transacties);
  }, [datum, s.exemplaren, s.artikelen, s.transacties]);
  const tegoed = useMemo(() => openTegoedOp(huidig().transacties, datum), [datum, s.transacties]);
  const kaarten = inv.lijnen.filter((l) => l.code);
  const artikels = inv.lijnen.filter((l) => !l.code);
  const som = (ls: typeof inv.lijnen) => rond2(ls.reduce((x, l) => x + l.waarde, 0));
  return (
    <section className="boek-lijst">
      <p className="zacht klein">Op 31 december geef je in Dexxter de waarde van je voorraad in (Personenbelasting › Voorraad), aan aankoopprijs. Die waarde neem je mee naar het nieuwe jaar.</p>
      <Veld label="Voorraad op het einde van"><input type="date" value={datum} onChange={(e) => e.target.value && setDatum(e.target.value)} /></Veld>
      <div className="voorraad-totaal">
        <span className="zacht klein">{inv.lijnen.reduce((n, l) => n + l.aantal, 0)} stuks</span>
        <strong>{euro(inv.totaal)}</strong>
        <span className="zacht klein">kaarten {euro(som(kaarten))} · artikels {euro(som(artikels))}</span>
      </div>
      {tegoed > 0 && (
        <p className="nakijken klein">
          Open tegoedbonnen op die dag: <strong>{euro(tegoed)}</strong>. Dat zijn we nog aan klanten verschuldigd (een schuld, geen voorraad).
          Geef het bedrag op 31/12 door aan je boekhouder, met de lijst uit Profiel › Tegoeden.
        </p>
      )}
      {inv.zonderWaarde > 0 && <p className="nakijken klein">{inv.zonderWaarde} {inv.zonderWaarde === 1 ? "lijn heeft" : "lijnen hebben"} geen aankoop- of kostprijs (tellen als € 0). Lege binders en ander materiaal om te verkopen horen ook in de voorraad: vul vóór 31/12 de kostprijs in bij de artikels.</p>}
      {inv.zonderAankoop.aantal > 0 && (
        <div className="nakijken klein">
          <p>{inv.zonderAankoop.aantal} {inv.zonderAankoop.aantal === 1 ? "kaart werd" : "kaarten werden"} zelf toegevoegd, zonder aankoop in de app ({euro(inv.zonderAankoop.waarde)}). Gekocht met een factuur (Cardmarket, winkel)? Dan is dat in orde. Uit je eigen verzameling? Breng ze in, anders staat hun kost nergens.</p>
          {kanNieuweBoekhouding() && <button className="knop zacht klein" onClick={openPrive}>Privé ⇄ Bind'r › Al in de app</button>}
        </div>
      )}
      <ul className="lijst voorraad-lijst">
        {(alles ? inv.lijnen : inv.lijnen.slice(0, 40)).map((l) => (
          <li key={l.id} className="voorraad-lijn">
            <span className="lijst-naam"><strong>{l.omschrijving}</strong><span className="zacht klein">{[l.code ? toonCode(l.code) : null, l.aantal > 1 ? `${l.aantal} stuks` : null, l.herkomst, l.borderel].filter(Boolean).join(" · ")}</span></span>
            <span className={`rechts${l.zonderWaarde ? " zacht" : ""}`}>{l.zonderWaarde ? "?" : euro(l.waarde)}</span>
          </li>
        ))}
      </ul>
      {!alles && inv.lijnen.length > 40 && <button className="knop zacht breed" onClick={() => setAlles(true)}>Toon alles ({inv.lijnen.length})</button>}
      <p className="zacht klein">Artikels: het aantal volgt uit de kassa en uit wat je met de hand bij- of aftelde (de app onthoudt wanneer). Kaarten die je pas later uit privé inbracht, tellen vanaf die dag.</p>
      <div className="knoppenrij">
        <button className="knop" onClick={() => drukAf(<InventarisDocument inv={inv} bedrijf={bedrijf} />, `Voorraad ${datum}`)}><Icoon naam="printer" maat={18} /> Inventaris (pdf)</button>
        <button className="knop zacht" onClick={() => bewaarCsv(`bindr-voorraad-${datum}.csv`, inventarisCsv(inv))}>CSV</button>
      </div>
    </section>
  );
}

// ── Uitleg ───────────────────────────────────────────────────────────────────

function Uitleg() {
  return (
    <section className="boek-uitleg">
      <h3>Na elke beurs (5 minuten)</h3>
      <ol>
        <li><strong>Kas tellen</strong> bij het afsluiten van de beurs. Een verschil noteer je, je verbergt het niet. Leg je privégeld bij in de koffer, boek het dan via <em>Kas › Geld erbij</em>.</li>
        <li><strong>Verkoop</strong>: open de dag en geef in Dexxter elk bedrag in bij <em>Dagontvangsten</em>, op de datum van de beurs. Vink de dag aan.</li>
        <li><strong>Aankoop</strong>: open de dag bij Aankoop en geef in Dexxter per lijn één uitgave in (aankoop van handelsgoederen, 0% btw), met de dagstaat (pdf) als bijlage. Een aankoop trek je nooit af van de dagontvangsten.</li>
        <li><strong>SumUp</strong>: de commissie staat op de maandfactuur van SumUp: dat is een kost. De storting op je rekening is geen nieuwe omzet.</li>
      </ol>
      <h3>Het bewijs van een aankoop</h3>
      <ul>
        <li>Aan de stand hoeft niemand iets te tekenen. Het bewijs is de lijst die de app maakt: elke kaart met haar code, de marktwaarde met bron en datum, het percentage en wat we betaalden, plus een foto van de gekochte kaarten.</li>
        <li>Vraag minstens een voornaam. Vanaf {euro(BEWIJS_GROOT, true)}: liefst de volledige naam, de gemeente en een handtekening op de gsm, of betaal per overschrijving.</li>
        <li>Online gekocht (Facebook, Vinted) of op een rommelmarkt: boek het via de kassa (Van de klant) en neem een screenshot van het gesprek of de advertentie als foto.</li>
        <li>Elke kaart heeft een code: vanuit een kaart vind je altijd terug wanneer, waar en aan welke prijs we ze kochten, met de foto's.</li>
        <li>Cash kan hoogstens {euro(CASH_GRENS, true)} per aankoop of verkoop; daarboven per overschrijving.</li>
      </ul>
      <h3>Ruil</h3>
      <ul>
        <li>Een ruil telt als verkoop van onze kaarten (dagontvangst, aan de afgesproken prijs, met wat de klant bijbetaalt) én aankoop van hun kaarten (kost). De winst is dezelfde als wanneer je enkel het verschil boekt.</li>
        <li>Waarom niet enkel het verschil? Voor de btw is een ruil een levering aan de normale waarde: die telt mee voor de grens van € 25.000. Enkel het verschil boeken toont te weinig omzet. De teller bovenaan telt de ruilwaarde mee.</li>
      </ul>
      <h3>Tegoedbon (storecredit)</h3>
      <ul>
        <li>Verkoopt iemand ons kaarten en wil hij liever tegoed? Kies bij Afrekenen <em>Tegoed</em>. Bijvoorbeeld: kaarten met een marktwaarde van € 30, we geven € 25 tegoed. Dat is een aankoop van € 25 (lijn <em>Aankoop kaarten tegen tegoedbon</em> op de dagstaat), met een aankoopbewijs en een bon TG-… op zijn naam.</li>
        <li>Later koopt hij een kaart van € 25 en betaalt met de bon: dat is een gewone verkoop van € 25 (dagontvangst, lijn <em>Verkoop betaald met tegoedbon</em>), ook al komt er geen geld binnen. Betaalt hij een deel met de bon, dan is de rest cash of SumUp zoals altijd.</li>
        <li>Zo kloppen de cijfers: de kaarten die we kregen zijn een kost, de kaart die we gaven is omzet, en de bon zelf is tussendoor een schuld aan de klant.</li>
        <li>Op 31 december: wat er nog op de bonnen staat, zie je bij <em>Voorraad</em> (open tegoedbonnen) en in <em>Profiel › Tegoeden</em>. Geef dat aan je boekhouder door.</li>
      </ul>
      <h3>Online verkocht (Instagram, Facebook) en verzenden</h3>
      <ol>
        <li>Staat het product nog niet in de app? Maak het eerst aan (een kaart via Toevoegen, een binder, 3D-print of sealed bij <em>Profiel › Artikels</em>). Zo klopt de voorraad.</li>
        <li>Open <em>Profiel › Verkocht buiten een beurs</em>, zet het in het mandje en kies bij Afrekenen hoe hij betaalde (meestal overschrijving). Vul in waar je het verkocht en bij <em>Wanneer betaald?</em> de dag dat het geld binnenkwam.</li>
        <li>Verzonden? Vul bij <em>Verzendkosten aanrekenen</em> in wat de klant ervoor betaalde. Dat is omzet (een eigen lijn bij de dagontvangsten). Wat de post jou kost (bpost-bonnetje, verzendlabel) is een kost: die geef je apart in Dexxter in, met het bonnetje.</li>
        <li>Komt de klant het halen? Dan geen verzendkosten; betaalt hij cash bij het afhalen, kies dan de dag van het afhalen.</li>
        <li>De dag die telt, is de dag dat je het geld ontving. De app is je dagontvangstenboek: boek elke verkoop de dag zelf. In Dexxter mag je de dagtotalen later ingeven (bv. op het einde van de maand), elk op zijn eigen datum.</li>
      </ol>
      <h3>Starten met je eigen verzameling</h3>
      <ol>
        <li>Zet de kaarten gewoon in de app (scannen, zoeken), zonder aankoopprijs: die ken je toch niet meer.</li>
        <li>Open <em>Profiel › Privé ⇄ Bind'r › Al in de app</em>. Kies wat uit je verzameling komt. Wat je met een factuur kocht (Cardmarket, winkel), duid je aan als <em>gekocht met factuur</em>: die kost staat al in Dexxter.</li>
        <li>De app neemt per kaart de marktwaarde (Cardmarket-trend met de conditie, bij slabs de opgezochte verkopen, anders je verkoopprijs). Klopt die niet, vul dan zelf de waarde in. Neem een screenshot van de prijsgids als foto.</li>
        <li>Eén bewijs PB-… met alle kaarten. In Dexxter: één aankoop "van jezelf als particulier" aan dat bedrag (zoals Dexxter het voor spullen van vóór de start uitlegt). Wat op 31/12 nog niet verkocht is, gaat naar de voorraad: zo wordt enkel wat je verkocht een kost.</li>
        <li>Kaarten van iemand anders (een vriend, een medebeheerder) zijn geen inbreng maar een aankoop bij een particulier: via de kassa, met bewijs.</li>
      </ol>
      <h3>Privé en Bind'r</h3>
      <ul>
        <li>In <em>Profiel › Privé</em> breng je kaarten uit je eigen verzameling in, of neem je kaarten mee naar privé. Er gaat geen geld over en weer.</li>
        <li>Inbreng: een kost die je met privémiddelen betaalde, aan de marktwaarde op de dag van de inbreng (100%, niet wat je er ooit voor betaalde). Neem een realistische waarde (de trend voor die conditie, geen hoogste vraagprijs), pas ze per kaart aan als ze niet klopt en bewaar een screenshot als staving. Lager mag altijd.</li>
        <li>Naar privé: aan de aankoopwaarde. Dat neutraliseert de kost; het is geen omzet.</li>
      </ul>
      <h3>Op 31 december</h3>
      <ol>
        <li>Open <em>Voorraad</em>, kies 31/12 en geef het totaal in Dexxter in (Personenbelasting › Voorraad). Bewaar de pdf. Ook lege binders en materiaal om te verkopen tellen mee, aan kostprijs.</li>
        <li>Kijk de teller van de omzet na: boven de grens van de btw-vrijstelling moet je boekhouder iets doen.</li>
      </ol>
      <h3>Regels die de app volgt</h3>
      <ul>
        <li>Een stuk boven {euro(EIGEN_LIJN, true)} krijgt een eigen lijn in de dagontvangsten.</li>
        <li>Verbeteren gebeurt met een nieuwe boeking, nooit door iets te wissen. Ongedaan maken kan enkel dezelfde dag; daarna een retour (op de dag dat het gebeurt), zodat een dag die al in Dexxter staat niet meer verandert. Elke wijziging staat in het logboek.</li>
        <li>De aankoopprijs van een ingekochte, geruilde of ingebrachte kaart staat vast: zo staat ze op het bewijs en in Dexxter.</li>
        <li>Een kaart voor je eigen verzameling gaat via <em>Naar privé</em>, niet via "uit voorraad" (dat is enkel voor kwijt of beschadigd).</li>
        <li>Geld in of uit de koffer (wisselgeld, een andere stand) is geen omzet.</li>
        <li>Artikels (binders, sealed, 3D-prints) tellen als omzet; hun kosten geef je apart in Dexxter in (bv. de factuur van de binders).</li>
        <li>Alles 10 jaar bewaren, ook de foto's.</li>
      </ul>
      <h3>Laat bevestigen door je boekhouder</h3>
      <ul>
        <li>Is een aankoopbewijs zonder handtekening (lijst, marktwaarde en foto) voldoende voor jouw situatie?</li>
        <li>Aan welke waarde breng je kaarten uit je privéverzameling in, en hoe boek je "naar privé" in Dexxter?</li>
        <li>Met drie: één onderneming of elk apart? Dat bepaalt wie aangifte doet en voor wie de grens van € 25.000 geldt.</li>
        <li>De eigen verzameling inbrengen als aankoop van jezelf (zoals Dexxter het uitlegt) of anders? Er circuleert ook een andere lezing (privégoederen kunnen niet "verkocht" worden aan je eigen eenmanszaak): laat dit zeker bevestigen.</li>
        <li>Moet je ook dagen zonder verkoop (€ 0) ingeven in Dexxter?</li>
        <li>Mag je de dagtotalen van online verkopen op het einde van de maand in Dexxter ingeven, als de app ze elke dag bijhoudt?</li>
        <li>Tegoedbonnen: is "aankoop + schuld aan de klant, verkoop bij het inwisselen" goed voor jou, en hoe zet je de open bonnen op 31/12 in je aangifte?</li>
      </ul>
      <p className="zacht klein">Dit is geen boekhoudkundig of fiscaal advies. De app maakt de cijfers en documenten; je boekhouder beslist hoe ze geboekt worden.</p>
    </section>
  );
}

// ── Documenten om af te drukken ──────────────────────────────────────────────

function DocKop({ titel, sub, bedrijf }: { titel: string; sub?: ReactNode; bedrijf: Bedrijf }) {
  return (
    <header className="doc-kop">
      <div>
        <strong>{bedrijf.naam || "Bind'r"}</strong>
        {bedrijf.adres && <div>{bedrijf.adres}</div>}
        {bedrijf.kbo && <div>Ondernemingsnummer {bedrijf.kbo}</div>}
        <div>Kleine onderneming, vrijgesteld van btw</div>
      </div>
      <div className="doc-titel">
        <h1>{titel}</h1>
        {sub}
      </div>
    </header>
  );
}

function LijnTabel({ lijnen, kop }: { lijnen: ReturnType<typeof borderelLijnen>; kop: string }) {
  return (
    <table className="doc-tabel">
      <thead><tr><th>{kop}</th><th className="r">Marktwaarde</th><th className="r">%</th><th className="r">Prijs</th></tr></thead>
      <tbody>
        {lijnen.map((l, i) => (
          <tr key={i}>
            <td>{l.naam}{l.code ? ` (${toonCode(l.code)})` : ""}<div className="doc-klein">{l.omschrijving}</div></td>
            <td className="r">{l.markt != null ? euro(l.markt) : "–"}<div className="doc-klein">{l.bron ?? ""}</div></td>
            <td className="r">{l.pct != null ? `${l.pct}%` : "–"}</td>
            <td className="r">{euro(l.prijs)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot><tr><td colSpan={3}>Totaal</td><td className="r">{euro(rond2(lijnen.reduce((x, l) => x + l.prijs, 0)))}</td></tr></tfoot>
    </table>
  );
}

/** Eén aankoop, ruil of privé-overdracht met alles wat we weten, en de foto's. */
function BewijsBlok({ t, beurzen }: { t: Transactie; beurzen: Beurs[] }) {
  const p = t.tegenpartij ?? {};
  const binnen = borderelLijnen(t.regels, "in");
  const weg = borderelLijnen(t.regels, "uit");
  const fotos = fotosVan(t.id);
  return (
    <section className="doc-bewijs">
      <h2>{bewijsNummer(t)} · {tijdKort(t.tijd)} · {SOORT[t.soort].naam} · {waarGekocht(t, beurzen)}</h2>
      {t.soort !== "prive" && (
        <div className="doc-klein">
          {p.type === "handelaar" ? `Handelaar: ${p.naam || "–"}${p.btw ? `, ${p.btw}` : ""}${p.factuur ? `, factuur ${p.factuur}` : ""}` : `Verkoper (particulier): ${p.naam || "niet genoteerd"}${p.adres ? `, ${p.adres}` : ""}`}
          {p.vendor ? " · van een andere stand" : ""}{p.met_factuur ? " · met factuur (apart ingegeven)" : ""}
          {" · "}{betaalTekst(t)}{t.status === "ongedaan" ? " · ONGEDAAN GEMAAKT" : ""}
        </div>
      )}
      {binnen.length > 0 && <LijnTabel lijnen={binnen} kop={t.soort === "prive" ? "Ingebracht uit privé" : "Wat Bind'r kreeg"} />}
      {weg.length > 0 && <LijnTabel lijnen={weg} kop={t.soort === "prive" ? "Naar privé (aankoopwaarde)" : t.soort === "retour" ? "Teruggegeven" : "Wat Bind'r gaf"} />}
      {(p.handtekening || p.handtekening_ons) && (
        <div className="doc-handtekeningen">
          <div><span>Verkoper</span>{p.handtekening ? <HandtekeningBeeld pad={p.handtekening} /> : <div className="doc-lijn" />}</div>
          <div><span>Bind'r</span>{p.handtekening_ons ? <HandtekeningBeeld pad={p.handtekening_ons} /> : <div className="doc-lijn" />}</div>
        </div>
      )}
      {fotos.length > 0 && <div className="doc-fotos">{fotos.map((f) => <img key={f.id} src={f.foto} alt="" />)}</div>}
    </section>
  );
}

function BewijsDocument({ t, beurs, beurzen, bedrijf }: { t: Transactie; beurs: Beurs | null; beurzen: Beurs[]; bedrijf: Bedrijf }) {
  return (
    <article className="doc">
      <DocKop bedrijf={bedrijf} titel={t.soort === "prive" ? "Privé ⇄ Bind'r" : t.soort === "ruil" ? "Ruil" : "Aankoopbewijs"}
        sub={<><div>Nr. {bewijsNummer(t)}</div><div>{dagLang(dagVan(t.tijd))}, {tijdKort(t.tijd)}</div>{beurs && <div>{beurs.naam}{beurs.locatie ? `, ${beurs.locatie}` : ""}</div>}</>} />
      <BewijsBlok t={t} beurzen={beurzen} />
      <p className="doc-klein">Marktwaarde: de waarde op de dag van de aankoop, volgens de vermelde bron (Cardmarket-prijsgids, laatste verkopen of eigen schatting). Het percentage is de prijs tegenover die marktwaarde. Elke kaart kreeg een eigen code (label).</p>
      {(t.tegoed ?? 0) < 0 && <p className="doc-klein">{bonTekst(t, bedrijf)}</p>}
      {t.tegenpartij?.handtekening && <p className="doc-klein">{verklaring(t, bedrijf)}</p>}
      <footer className="doc-voet">Gemaakt met Bind'r Voorraad · transactie {t.id}</footer>
    </article>
  );
}

function DagstaatAankopen({ dag, lijst, beurzen, bedrijf }: { dag: Dag; lijst: Transactie[]; beurzen: Beurs[]; bedrijf: Bedrijf }) {
  const kosten = kostenLijnen(dag);
  return (
    <article className="doc">
      <DocKop bedrijf={bedrijf} titel="Dagstaat aankopen" sub={<div>{dagLang(dag.datum)}</div>} />
      <table className="doc-tabel">
        <thead><tr><th>Kost voor de boekhouding</th><th className="r">Bedrag</th></tr></thead>
        <tbody>{kosten.map((k, i) => <tr key={i}><td>{k.omschrijving}</td><td className="r">{euro(k.bedrag)}</td></tr>)}</tbody>
        <tfoot><tr><td>Totaal</td><td className="r">{euro(rond2(kosten.reduce((x, k) => x + k.bedrag, 0)))}</td></tr></tfoot>
      </table>
      {dag.onttrekking !== 0 && <p className="doc-klein">Naar privé (aankoopwaarde, geen omzet): {euro(dag.onttrekking)}.</p>}
      {dag.aankopenFactuur !== 0 && <p className="doc-klein">Met factuur (apart ingegeven, niet in het totaal hierboven): {euro(dag.aankopenFactuur)}.</p>}
      {lijst.map((t) => <BewijsBlok key={t.id} t={t} beurzen={beurzen} />)}
      <p className="doc-klein">Marktwaarde volgens de vermelde bron op de dag van de aankoop. Elke kaart kreeg een eigen code (label), zodat ze tot deze aankoop terug te volgen is.</p>
      <footer className="doc-voet">Gemaakt met Bind'r Voorraad op {datumKort(new Date().toISOString())}</footer>
    </article>
  );
}

function DagDocument({ dag, beurzen, bedrijf, beheerders }: { dag: Dag; beurzen: Beurs[]; bedrijf: Bedrijf; beheerders: Record<string, string> }) {
  const lijnen = dexxterLijnen(dag, beurzen.map((b) => b.naam).join(", ") || undefined);
  const metTegoed = dag.transacties.some((t) => t.tegoed);
  const tegoedSom = rond2(dag.transacties.reduce((x, t) => x + (t.tegoed ?? 0), 0));
  return (
    <article className="doc">
      <DocKop bedrijf={bedrijf} titel="Dagontvangsten" sub={<><div>{dagLang(dag.datum)}</div>{beurzen.map((b) => <div key={b.id}>{b.naam}{b.locatie ? `, ${b.locatie}` : ""}</div>)}</>} />
      <table className="doc-tabel">
        <thead><tr><th>Inschrijving</th><th className="r">Bedrag</th></tr></thead>
        <tbody>{lijnen.map((l, i) => <tr key={i}><td>{l.omschrijving}</td><td className="r">{euro(l.bedrag)}</td></tr>)}</tbody>
        <tfoot><tr><td>Totaal dagontvangsten</td><td className="r">{euro(dag.ontvangsten)}</td></tr></tfoot>
      </table>
      <table className="doc-tabel">
        <thead><tr><th>Tijd</th><th>Soort</th><th>Omschrijving</th><th className="r">Cash</th><th className="r">SumUp</th><th className="r">Bank</th>{metTegoed && <th className="r">Tegoed</th>}</tr></thead>
        <tbody>
          {dag.transacties.map((t) => (
            <tr key={t.id}>
              <td>{tijdKort(t.tijd)}</td>
              <td>{SOORT[t.soort].naam}{t.beheerder && beheerders[t.beheerder] ? ` · ${beheerders[t.beheerder]}` : ""}</td>
              <td>{t.soort === "kas" ? t.opmerking || kasOmschrijving(t) : t.regels.map((r) => `${r.richting === "uit" ? (t.soort === "retour" ? "terug aan klant" : t.soort === "prive" ? "naar privé" : "verkocht") : (t.soort === "retour" ? "terug" : t.soort === "prive" ? "uit privé" : "gekocht")}: ${r.naam}${r.code ? ` (${toonCode(r.code)})` : ""} ${euro(r.prijs)}`).join("; ")}{heeftBewijs(t) ? ` · ${bewijsNummer(t)}` : ""}</td>
              <td className="r">{t.cash ? euro(t.cash) : ""}</td>
              <td className="r">{t.sumup ? euro(t.sumup) : ""}</td>
              <td className="r">{t.bank ? euro(t.bank) : ""}</td>
              {metTegoed && <td className="r">{t.tegoed ? `${euro(t.tegoed)}${t.tegoed < 0 ? ` (bon ${bonCode(t)})` : ""}` : ""}</td>}
            </tr>
          ))}
        </tbody>
        <tfoot><tr><td colSpan={3}>Totaal geld</td><td className="r">{euro(rond2(dag.cash + dag.kas))}</td><td className="r">{euro(rond2(dag.sumup + dag.kasSumup))}</td><td className="r">{euro(dag.bank)}</td>{metTegoed && <td className="r">{euro(tegoedSom)}</td>}</tr></tfoot>
      </table>
      <p className="doc-klein">Verkopen {euro(dag.verkopen)} · ruil {euro(dag.ruil)} · retour {euro(dag.retour)} · waarvan kaarten {euro(dag.kaarten)} en artikels {euro(dag.artikels)}{dag.verzending ? ` · verzendkosten ${euro(dag.verzending)}` : ""} · aankopen {euro(dag.aankopen)}{dag.verkopenTegoed ? ` · betaald met tegoedbon ${euro(dag.verkopenTegoed)}` : ""}{dag.aankopenTegoed ? ` · gekocht tegen tegoedbon ${euro(dag.aankopenTegoed)}` : ""}{dag.kas || dag.kasSumup ? ` · kasbewegingen ${euro(dag.kas)} cash, ${euro(dag.kasSumup)} SumUp (geen omzet)` : ""}. Tegoed is geen geld: een bon die we gaven (−) of waarmee betaald werd (+).</p>
      <footer className="doc-voet">Gemaakt met Bind'r Voorraad op {datumKort(new Date().toISOString())}</footer>
    </article>
  );
}

function InventarisDocument({ inv, bedrijf }: { inv: Inventaris; bedrijf: Bedrijf }) {
  return (
    <article className="doc">
      <DocKop bedrijf={bedrijf} titel="Inventaris" sub={<div>Voorraad op {dagLang(inv.datum)}, aan aankoopwaarde</div>} />
      <table className="doc-tabel">
        <thead><tr><th>Code</th><th>Omschrijving</th><th className="r">Aantal</th><th>Herkomst</th><th className="r">Waarde</th></tr></thead>
        <tbody>
          {inv.lijnen.map((l) => (
            <tr key={l.id}><td>{l.code ? toonCode(l.code) : ""}</td><td>{l.omschrijving}{l.aankoopdatum ? <span className="doc-klein"> · {datumKort(l.aankoopdatum)}</span> : null}</td><td className="r">{l.aantal}</td><td>{l.herkomst}{l.borderel ? ` · ${l.borderel}` : ""}</td><td className="r">{l.zonderWaarde ? "?" : euro(l.waarde)}</td></tr>
          ))}
        </tbody>
        <tfoot><tr><td colSpan={4}>Totaal ({inv.lijnen.reduce((n, l) => n + l.aantal, 0)} stuks)</td><td className="r">{euro(inv.totaal)}</td></tr></tfoot>
      </table>
      {inv.zonderWaarde > 0 && <p className="doc-klein">{inv.zonderWaarde} lijn(en) zonder gekende aankoop- of kostprijs, geteld aan € 0.</p>}
      <footer className="doc-voet">Gemaakt met Bind'r Voorraad op {datumKort(new Date().toISOString())}</footer>
    </article>
  );
}

// ── CSV ──────────────────────────────────────────────────────────────────────

function dagenCsv(dagen: Dag[], beurzen: Beurs[]): string {
  const naam = (id: string) => beurzen.find((b) => b.id === id)?.naam ?? "";
  return csv([
    ["datum", "beurs", "verkopen", "ruil", "retour", "dagontvangsten", "waarvan_kaarten", "waarvan_artikels", "waarvan_verzending", "eigen_lijnen_boven_500", "cash", "sumup", "overschrijving", "betaald_met_tegoed", "kasbewegingen_cash", "kasbewegingen_sumup", "aankopen", "waarvan_tegen_tegoed", "inbreng_prive", "naar_prive"],
    ...dagen.slice().reverse().map((d) => [d.datum, d.beurzen.map(naam).join(", "), d.verkopen, d.ruil, d.retour, d.ontvangsten, d.kaarten, d.artikels, d.verzending,
      d.eigenLijnen.map((l) => `${l.omschrijving}${l.code ? ` ${toonCode(l.code)}` : ""}: ${l.bedrag.toFixed(2)}`).join(" | "), d.cash, d.sumup, d.bank, d.verkopenTegoed, d.kas, d.kasSumup, d.aankopen, d.aankopenTegoed, d.inbreng, d.onttrekking]),
  ]);
}

function aankopenCsv(lijst: Transactie[], beurzen: Beurs[]): string {
  const rijen: (string | number | null)[][] = [["bewijs", "datum", "tijd", "waar", "soort", "verkoper", "type", "gemeente", "getekend", "code", "kaart", "richting", "marktwaarde", "bron", "pct", "prijs", "cash", "overschrijving", "tegoed", "status", "transactie_id"]];
  for (const t of lijst.slice().sort((a, b) => a.tijd.localeCompare(b.tijd))) {
    for (const r of t.regels) {
      const markt = r.richting === "in" ? r.referentie ?? null : r.hartjesprijs ?? null;
      rijen.push([bewijsNummer(t), dagVan(t.tijd), tijdKort(t.tijd), waarGekocht(t, beurzen), t.soort, t.tegenpartij?.naam ?? "", t.tegenpartij?.type ?? "",
        t.tegenpartij?.adres ?? "", t.tegenpartij?.handtekening ? "ja" : "nee", r.code ? toonCode(r.code) : "", r.naam, r.richting, markt,
        r.richting === "in" ? r.referentie_bron ?? "" : "", markt ? Math.round((r.prijs / markt) * 100) : null, r.prijs, t.cash, t.bank ?? 0, t.tegoed ?? 0, t.status, t.id]);
    }
  }
  return csv(rijen);
}

function inventarisCsv(inv: Inventaris): string {
  return csv([
    ["code", "omschrijving", "soort", "aantal", "aankoopdatum", "herkomst", "bewijs", "aankoopwaarde"],
    ...inv.lijnen.map((l) => [l.code ? toonCode(l.code) : "", l.omschrijving, l.soort, l.aantal, l.aankoopdatum, l.herkomst, l.borderel, l.zonderWaarde ? "" : l.waarde]),
    ["", "Totaal", "", inv.lijnen.reduce((n, l) => n + l.aantal, 0), "", "", "", inv.totaal],
  ]);
}

function transactiesCsv(lijst: Transactie[], beurzen: Beurs[]): string {
  const naam = (id: string | null) => beurzen.find((b) => b.id === id)?.naam ?? "";
  const rijen: (string | number | null)[][] = [["datum", "tijd", "beurs", "soort", "richting", "code", "naam", "aantal", "prijs", "marktwaarde", "cash", "sumup", "overschrijving", "tegoed", "transactie_id"]];
  for (const t of lijst) {
    if (t.soort === "kas") { rijen.push([dagVan(t.tijd), tijdKort(t.tijd), naam(t.beurs_id), "kas", "", "", t.opmerking ?? kasOmschrijving(t), 1, 0, null, t.cash, t.sumup, 0, 0, t.id]); continue; }
    for (const r of t.regels) rijen.push([dagVan(t.tijd), tijdKort(t.tijd), naam(t.beurs_id), t.soort, r.richting, r.code ? toonCode(r.code) : "", r.naam, r.aantal ?? 1, r.prijs, r.referentie ?? null, t.cash, t.sumup, t.bank ?? 0, t.tegoed ?? 0, t.id]);
  }
  return csv(rijen);
}
