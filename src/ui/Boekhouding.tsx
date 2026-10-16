// Boekhouding: wat je in Dexxter ingeeft (dagontvangsten), de borderellen bij elke aankoop of
// ruil, de omzet tegenover de grens van de btw-vrijstelling en de voorraad op een datum.
// De rekenregels staan in lib/boekhouding.ts; de punten om met een boekhouder na te kijken in de README.
import { useMemo, useState, type ReactNode } from "react";
import { bedrijfVan, huidig, kanNieuweBoekhouding, meld, OUD_SCHEMA, useApp, zetBedrijf, zetIngegeven, zetTegenpartij } from "../state";
import type { Bedrijf, Beurs, Tegenpartij, Transactie } from "../types";
import {
  borderelLijnen, borderelNummer, borderelOntbreekt, csv, dagontvangsten, dagVan, dexxterLijnen, EIGEN_LIJN, heeftBorderel,
  jaaromzet, voorraadOp, type Dag, type Inventaris,
} from "../lib/boekhouding";
import { beursCijfers, CASH_GRENS, rond2 } from "../lib/kassa";
import { datumKort, euro, vandaag } from "../lib/format";
import { toonCode } from "../lib/code";
import { Icoon, Segment, Sheet, Veld } from "./common";
import { kasOmschrijving, SOORT, TransactieRij } from "./Historiek";
import { HandtekeningBeeld, HandtekeningPad } from "./Handtekening";
import { bewaarCsv, drukAf } from "./Afdruk";

const dagLang = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("nl-BE", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const tijdKort = (iso: string) => new Date(iso).toLocaleTimeString("nl-BE", { hour: "2-digit", minute: "2-digit" });
const bedrijfOk = (b: Bedrijf) => !!(b.naam?.trim() && b.adres?.trim());

type Tab = "dagen" | "aankopen" | "voorraad" | "uitleg";

export function Boekhouding({ onSluit }: { onSluit: () => void }) {
  const s = useApp();
  const bedrijf = bedrijfVan(s);
  const nu = Number(vandaag().slice(0, 4));
  const [jaar, setJaar] = useState(nu);
  const [tab, setTab] = useState<Tab>("dagen");
  const [dag, setDag] = useState<string | null>(null);
  const [borderel, setBorderel] = useState<string | null>(null);
  const [gegevens, setGegevens] = useState(false);
  const dagen = useMemo(() => dagontvangsten(s.transacties), [s.transacties]);
  const jaren = [...new Set([nu, ...dagen.map((d) => Number(d.datum.slice(0, 4)))])].sort((a, b) => b - a);
  const omzet = jaaromzet(dagen, jaar, bedrijf.start);
  const vanJaar = dagen.filter((d) => d.datum.startsWith(`${jaar}-`));
  const ingegeven = s.boekhouding.ingegeven[s.omgeving ?? "standaard"] ?? {};
  const aankopen = s.transacties.filter((t) => heeftBorderel(t) && dagVan(t.tijd).startsWith(`${jaar}-`)).sort((a, b) => b.tijd.localeCompare(a.tijd));
  const open = dag ? dagen.find((d) => d.datum === dag) : null;
  const beursNaam = (id: string) => s.beurzen.find((b) => b.id === id)?.naam ?? "beurs";

  return (
    <Sheet titel="Boekhouding" onSluit={onSluit} vol>
      {!bedrijfOk(bedrijf) && (
        <button className="melding-kaart neer boek-gegevens" onClick={() => setGegevens(true)}>
          <Icoon naam="waarschuwing" />
          <div><strong>Vul eerst je gegevens in</strong><span>Naam, adres en ondernemingsnummer komen op elk borderel en rapport.</span></div>
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
          {!vanJaar.length && <p className="zacht center">Nog geen verkopen in {jaar}.</p>}
          <ul className="lijst">
            {vanJaar.map((d) => (
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
          {vanJaar.length > 0 && (
            <div className="knoppenrij">
              <button className="knop zacht" onClick={() => bewaarCsv(`bindr-dagontvangsten-${jaar}.csv`, dagenCsv(vanJaar, s.beurzen))}><Icoon naam="link" maat={16} /> CSV {jaar}</button>
            </div>
          )}
        </section>
      )}

      {tab === "aankopen" && (
        <section className="boek-lijst">
          <p className="zacht klein">Elke inkoop en ruil krijgt een borderel: het bewijs van je aankoop (een kost in Dexxter). Laat het tekenen aan de stand, of vul het later aan.</p>
          {!aankopen.length && <p className="zacht center">Nog geen aankopen in {jaar}.</p>}
          <ul className="lijst">
            {aankopen.map((t) => {
              const mist = borderelOntbreekt(t);
              return (
                <li key={t.id}>
                  <button className="lijst-knop" onClick={() => setBorderel(t.id)}>
                    <span className={`boek-vink${mist.length ? " mist" : " aan"}`}><Icoon naam={mist.length ? "waarschuwing" : "check"} maat={16} /></span>
                    <span className="lijst-naam">
                      <strong>{t.tegenpartij?.naam?.trim() || "Verkoper nog in te vullen"}</strong>
                      <span className="zacht klein">{borderelNummer(t)} · {datumKort(t.tijd)} · {SOORT[t.soort].naam.toLowerCase()}{mist.length ? ` · mist: ${mist.join(", ")}` : ""}</span>
                    </span>
                    <span className="rechts boek-bedrag">{euro(aankoopVan(t))}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {aankopen.length > 0 && (
            <div className="knoppenrij">
              <button className="knop zacht" onClick={() => bewaarCsv(`bindr-aankopen-${jaar}.csv`, aankopenCsv(aankopen, s.beurzen))}><Icoon naam="link" maat={16} /> CSV {jaar}</button>
            </div>
          )}
        </section>
      )}

      {tab === "voorraad" && <VoorraadOpDatum jaar={jaar} bedrijf={bedrijf} />}

      {tab === "uitleg" && <Uitleg />}

      <button className="tekstknop boek-gegevens-knop" onClick={() => setGegevens(true)}>
        <Icoon naam="tag" maat={16} /> Gegevens voor borderel en rapporten{bedrijf.naam ? `: ${bedrijf.naam}` : ""}
      </button>

      {open && <DagSheet dag={open} onSluit={() => setDag(null)} onBorderel={setBorderel} />}
      {borderel && <BorderelSheet id={borderel} onSluit={() => setBorderel(null)} />}
      {gegevens && <BedrijfSheet onSluit={() => setGegevens(false)} />}
    </Sheet>
  );
}

const aankoopVan = (t: Transactie) => rond2(t.regels.filter((r) => r.richting === "in").reduce((x, r) => x + r.prijs, 0));

// ── Jaaromzet ────────────────────────────────────────────────────────────────

function JaarTeller({ omzet, jaren, onJaar, start }: { omzet: ReturnType<typeof jaaromzet>; jaren: number[]; onJaar: (j: number) => void; start?: string | null }) {
  const vol = Math.min(100, omzet.pct);
  const toestand = omzet.omzet > omzet.tolerantie ? "over" : omzet.omzet > omzet.grens ? "rand" : omzet.pct >= 80 ? "dicht" : "ok";
  return (
    <section className={`jaar-teller ${toestand}`}>
      <div className="jaar-kop">
        <span className="zacht klein">Omzet</span>
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
          ? <>{omzet.pct}% van {euro(omzet.grens, true)}, de grens van de btw-vrijstelling{start?.startsWith(String(omzet.jaar)) ? " (startjaar: pro rata)" : ""}.</>
          : "Je activiteit begint pas later."}
        {toestand === "dicht" && " Je nadert de grens: bespreek het met je boekhouder."}
        {toestand === "rand" && " Over de grens, maar binnen de 10% marge: tot eind december blijf je vrijgesteld. Contacteer je boekhouder."}
        {toestand === "over" && " Meer dan 10% over de grens: vanaf nu is btw verschuldigd. Contacteer meteen je boekhouder."}
      </span>
    </section>
  );
}

// ── Eén dag ──────────────────────────────────────────────────────────────────

function DagSheet({ dag, onSluit, onBorderel }: { dag: Dag; onSluit: () => void; onBorderel: (id: string) => void }) {
  const s = useApp();
  const ingegeven = !!s.boekhouding.ingegeven[s.omgeving ?? "standaard"]?.[dag.datum];
  const beurzen = dag.beurzen.map((id) => s.beurzen.find((b) => b.id === id)).filter(Boolean) as Beurs[];
  const lijnen = dexxterLijnen(dag, beurzen.map((b) => b.naam).join(", ") || undefined);
  const bedrijf = bedrijfVan(s);
  const kopieer = (x: number) => {
    const tekst = x.toFixed(2).replace(".", ",");
    void navigator.clipboard?.writeText(tekst).then(() => meld(`${tekst} gekopieerd`), () => meld(tekst, "info"));
  };
  return (
    <Sheet titel={dagLang(dag.datum)} onSluit={onSluit} vol>
      <section className="blok dexxter-blok">
        <h3>In Dexxter</h3>
        <p className="zacht klein">Dagontvangsten › nieuwe inschrijving, datum {datumKort(dag.datum)}. Eén lijn per bedrag hieronder.</p>
        <ul className="dexxter-lijnen">
          {lijnen.map((l, i) => (
            <li key={i}>
              <span>{l.omschrijving}</span>
              <strong>{euro(l.bedrag)}</strong>
              <button className="tekstknop klein" onClick={() => kopieer(l.bedrag)}>Kopieer</button>
            </li>
          ))}
        </ul>
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
        <div className="afsluit-rij"><span>Geld: cash</span><strong>{euro(dag.cash)}</strong></div>
        <div className="afsluit-rij"><span>Geld: SumUp</span><strong>{euro(dag.sumup)}</strong></div>
        {dag.bank !== 0 && <div className="afsluit-rij"><span>Geld: overschrijving</span><strong>{euro(dag.bank)}</strong></div>}
        {(dag.kas !== 0 || dag.kasSumup !== 0) && <div className="afsluit-rij"><span>Kasbewegingen (geen omzet)</span><strong>{euro(dag.kas)}{dag.kasSumup ? ` · SumUp ${euro(dag.kasSumup)}` : ""}</strong></div>}
        {dag.aankopen !== 0 && <div className="afsluit-rij"><span>Aankopen (kosten, met borderel)</span><strong>{euro(dag.aankopen)}</strong></div>}
        {dag.kasSumup > 0 && <p className="zacht klein">SumUp van een kasbeweging is geen verkoop: trek het af als je de SumUp-uitbetaling met je ontvangsten vergelijkt.</p>}
      </section>

      {beurzen.map((b) => <KasRapport key={b.id} beurs={b} />)}

      <section className="blok">
        <h3>Transacties</h3>
        <ul className="transacties">
          {dag.transacties.map((t) => <TransactieRij key={t.id} t={t} beheerder={t.beheerder ? s.beheerders[t.beheerder] : undefined} />)}
        </ul>
        {dag.transacties.filter(heeftBorderel).map((t) => (
          <button key={t.id} className="tekstknop klein" onClick={() => onBorderel(t.id)}>Borderel {borderelNummer(t)}</button>
        ))}
      </section>

      <div className="knoppenrij onderaan">
        <button className="knop" onClick={() => drukAf(<DagDocument dag={dag} beurzen={beurzen} bedrijf={bedrijf} beheerders={s.beheerders} />, `Dagrapport ${dag.datum}`)}>
          <Icoon naam="printer" maat={18} /> Dagrapport (pdf)
        </button>
        <button className="knop zacht" onClick={() => bewaarCsv(`bindr-dag-${dag.datum}.csv`, transactiesCsv(dag.transacties, s.beurzen))}>CSV</button>
      </div>
    </Sheet>
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

// ── Borderel ─────────────────────────────────────────────────────────────────

/** De gegevens van de verkoper (of koper bij een ruil): particulier of handelaar. */
export function TegenpartijVelden({ waarde, onChange }: { waarde: Tegenpartij; onChange: (t: Tegenpartij) => void }) {
  const zet = (w: Partial<Tegenpartij>) => onChange({ ...waarde, ...w });
  const handelaar = waarde.type === "handelaar";
  return (
    <div className="tegenpartij">
      <Segment<"particulier" | "handelaar"> waarde={handelaar ? "handelaar" : "particulier"} onKies={(type) => zet({ type })}
        opties={[{ waarde: "particulier", label: "Particulier" }, { waarde: "handelaar", label: "Handelaar" }]} />
      <Veld label="Naam"><input value={waarde.naam ?? ""} onChange={(e) => zet({ naam: e.target.value })} autoComplete="off" placeholder={handelaar ? "naam van de zaak" : "voor- en achternaam"} /></Veld>
      {handelaar ? (
        <>
          <Veld label="Ondernemingsnummer (optioneel)"><input value={waarde.btw ?? ""} onChange={(e) => zet({ btw: e.target.value })} autoComplete="off" placeholder="BE0123.456.789" /></Veld>
          <Veld label="Factuurnummer" hint="Een handelaar geeft je een factuur: die is het bewijs. Geen factuur? Laat dan tekenen."><input value={waarde.factuur ?? ""} onChange={(e) => zet({ factuur: e.target.value })} autoComplete="off" /></Veld>
        </>
      ) : (
        <>
          <Veld label="Adres"><input value={waarde.adres ?? ""} onChange={(e) => zet({ adres: e.target.value })} autoComplete="off" placeholder="straat, nummer, postcode, gemeente" /></Veld>
          <label className="schakel">
            <input type="checkbox" checked={!!waarde.id_gecontroleerd} onChange={(e) => zet({ id_gecontroleerd: e.target.checked })} />
            <span>Identiteitskaart bekeken (we bewaren geen nummer of kopie)</span>
          </label>
        </>
      )}
    </div>
  );
}

export function BorderelSheet({ id, onSluit }: { id: string; onSluit: () => void }) {
  const s = useApp();
  const t = s.transacties.find((x) => x.id === id);
  const [tp, setTp] = useState<Tegenpartij>(() => ({ type: "particulier", ...(t?.tegenpartij ?? {}) }));
  const [tekenen, setTekenen] = useState<"verkoper" | "ons" | null>(null);
  if (!t) return null;
  const nieuw = kanNieuweBoekhouding(s);
  const bewaard = t.tegenpartij ?? {};
  const gewijzigd = JSON.stringify({ type: "particulier", ...bewaard }) !== JSON.stringify(tp);
  const getekend = !!bewaard.handtekening;
  const mist = borderelOntbreekt({ ...t, tegenpartij: tp });
  const beurs = s.beurzen.find((b) => b.id === t.beurs_id) ?? null;
  const bewaar = (extra: Partial<Tegenpartij> = {}) => {
    const nieuw: Tegenpartij = { ...tp, ...extra };
    setTp(nieuw);
    zetTegenpartij(t.id, nieuw);
  };
  const lijnenIn = borderelLijnen(t.regels, "in");
  const lijnenUit = borderelLijnen(t.regels, "uit");
  return (
    <Sheet titel={`${t.soort === "ruil" ? "Ruilborderel" : "Aankoopborderel"} ${borderelNummer(t)}`} onSluit={onSluit} vol>
      {t.status === "ongedaan" && <div className="melding-kaart neer"><Icoon naam="terug" /><div><strong>Ongedaan gemaakt</strong><span>Deze aankoop telt niet mee.</span></div></div>}
      {!nieuw && <p className="nakijken">{OUD_SCHEMA}</p>}
      <div className={`borderel-stand${mist.length ? " mist" : " ok"}`}>
        <Icoon naam={mist.length ? "waarschuwing" : "check"} maat={18} />
        <span>{mist.length ? `Nog nodig: ${mist.join(", ")}` : "Volledig. Druk het af of bewaar het als pdf voor Dexxter."}</span>
      </div>

      <section className="blok">
        <h3>{t.soort === "ruil" ? "Met wie we ruilden" : "Verkoper"}</h3>
        {getekend ? (
          <dl className="gegevens">
            <dt>Naam</dt><dd>{bewaard.naam || "–"}</dd>
            {bewaard.type === "handelaar"
              ? <><dt>Onderneming</dt><dd>{bewaard.btw || "–"}</dd><dt>Factuur</dt><dd>{bewaard.factuur || "–"}</dd></>
              : <><dt>Adres</dt><dd>{bewaard.adres || "–"}</dd><dt>Identiteit</dt><dd>{bewaard.id_gecontroleerd ? "bekeken" : "niet bekeken"}</dd></>}
          </dl>
        ) : (
          <>
            <TegenpartijVelden waarde={tp} onChange={setTp} />
            {gewijzigd && <button className="knop" disabled={!nieuw} onClick={() => { bewaar(); meld("Borderel bewaard"); }}>Bewaar</button>}
          </>
        )}
      </section>

      <section className="blok">
        <h3>{t.soort === "ruil" ? "Wat we kregen" : "Wat we kochten"}</h3>
        <BorderelTabel lijnen={lijnenIn} datum={t.tijd} />
        {t.soort === "ruil" && <><h3>Wat we gaven</h3><BorderelTabel lijnen={lijnenUit} datum={t.tijd} /></>}
        <div className="afsluit-rij totaal"><span>{t.soort === "ruil" ? (t.totaal > 0 ? "Klant betaalde bij" : t.totaal < 0 ? "Wij betaalden bij" : "Zonder bijbetaling") : "Betaald"}</span><strong>{euro(Math.abs(t.totaal))}</strong></div>
        <div className="zacht klein">{betaalTekst(t)}</div>
      </section>

      <section className="blok handtekeningen">
        <h3>Handtekeningen</h3>
        <div className="handtekening-rij">
          <div>
            <span className="zacht klein">{t.soort === "ruil" ? "Klant" : "Verkoper"}</span>
            {bewaard.handtekening ? <HandtekeningBeeld pad={bewaard.handtekening} /> : <span className="handtekening-leeg">nog niet getekend</span>}
            {!bewaard.handtekening && t.status !== "ongedaan" && nieuw && <button className="knop zacht klein" onClick={() => setTekenen("verkoper")}>Laten tekenen</button>}
            {bewaard.handtekening && <button className="tekstknop klein" onClick={() => { if (confirm("Handtekening wissen? Dan kan je de gegevens weer aanpassen en opnieuw laten tekenen.")) bewaar({ handtekening: null, getekend_op: null }); }}>Opnieuw laten tekenen</button>}
          </div>
          <div>
            <span className="zacht klein">Bind'r</span>
            {bewaard.handtekening_ons ? <HandtekeningBeeld pad={bewaard.handtekening_ons} /> : <span className="handtekening-leeg">nog niet getekend</span>}
            {!bewaard.handtekening_ons && t.status !== "ongedaan" && nieuw && <button className="knop zacht klein" onClick={() => setTekenen("ons")}>Zelf tekenen</button>}
          </div>
        </div>
        {bewaard.getekend_op && <p className="zacht klein">Getekend op {datumKort(bewaard.getekend_op)} om {tijdKort(bewaard.getekend_op)}.</p>}
      </section>

      <div className="knoppenrij onderaan">
        <button className="knop" onClick={() => drukAf(<BorderelDocument t={{ ...t, tegenpartij: { ...bewaard } }} beurs={beurs} bedrijf={bedrijfVan(s)} />, `${borderelNummer(t)}`)}>
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
].filter(Boolean).join(" + ") || "zonder geld";

/** Wat de verkoper ondertekent. */
function verklaring(t: Transactie, b: Bedrijf): string {
  const wie = b.naam?.trim() || "Bind'r";
  if (t.soort === "ruil") return `Ik ruil de kaarten op dit borderel met ${wie}, als particulier en uit mijn eigen verzameling. Ze zijn mijn eigendom. Er is geen btw op verschuldigd.`;
  return `Ik verkoop de kaarten op dit borderel aan ${wie} voor ${euro(Math.abs(t.totaal))}, als particulier en uit mijn eigen verzameling. Ze zijn mijn eigendom en ik ontving het bedrag. Er is geen btw op verschuldigd.`;
}

// ── Bedrijfsgegevens ─────────────────────────────────────────────────────────

export function BedrijfVelden() {
  const s = useApp();
  const [b, setB] = useState<Bedrijf>(() => bedrijfVan(s));
  const zelfde = JSON.stringify(b) === JSON.stringify(bedrijfVan(s));
  const omg = s.omgevingen.find((o) => o.id === s.omgeving);
  return (
    <div className="formulier">
      {omg && <p className="zacht klein">Voor {omg.naam}. Elke omgeving heeft eigen gegevens.</p>}
      <Veld label="Naam (zoals in de KBO)"><input value={b.naam ?? ""} onChange={(e) => setB({ ...b, naam: e.target.value })} /></Veld>
      <Veld label="Adres"><input value={b.adres ?? ""} onChange={(e) => setB({ ...b, adres: e.target.value })} /></Veld>
      <Veld label="Ondernemingsnummer"><input value={b.kbo ?? ""} onChange={(e) => setB({ ...b, kbo: e.target.value })} placeholder="0123.456.789" /></Veld>
      <Veld label="Begin van de activiteit" hint="Voor de grens van de btw-vrijstelling: in het eerste jaar geldt een deel van € 25.000.">
        <input type="date" value={b.start ?? ""} onChange={(e) => setB({ ...b, start: e.target.value || null })} />
      </Veld>
      <button className="knop" disabled={zelfde} onClick={() => { zetBedrijf({ naam: b.naam?.trim() || null, adres: b.adres?.trim() || null, kbo: b.kbo?.trim() || null, start: b.start || null }); meld("Gegevens bewaard"); }}>Bewaar</button>
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
  return (
    <section className="boek-lijst">
      <p className="zacht klein">Op 31 december geef je in Dexxter de waarde van je voorraad in (Personenbelasting › Voorraad), aan aankoopprijs. Die waarde neem je mee naar het nieuwe jaar.</p>
      <Veld label="Voorraad op het einde van"><input type="date" value={datum} onChange={(e) => e.target.value && setDatum(e.target.value)} /></Veld>
      <div className="voorraad-totaal">
        <span className="zacht klein">{inv.lijnen.reduce((n, l) => n + l.aantal, 0)} stuks</span>
        <strong>{euro(inv.totaal)}</strong>
        <span className="zacht klein">aankoopwaarde: dit getal gaat naar Dexxter</span>
      </div>
      {inv.zonderWaarde > 0 && <p className="nakijken klein">{inv.zonderWaarde} {inv.zonderWaarde === 1 ? "stuk heeft" : "stukken hebben"} geen aankoopprijs (tellen als € 0). Vul ze aan, of vraag je boekhouder hoe je eigen kaarten inbrengt.</p>}
      <ul className="lijst voorraad-lijst">
        {(alles ? inv.lijnen : inv.lijnen.slice(0, 40)).map((l) => (
          <li key={l.id} className="voorraad-lijn">
            <span className="lijst-naam"><strong>{l.omschrijving}</strong><span className="zacht klein">{[l.code ? toonCode(l.code) : null, l.aantal > 1 ? `${l.aantal} stuks` : null, l.herkomst, l.borderel].filter(Boolean).join(" · ")}</span></span>
            <span className={`rechts${l.zonderWaarde ? " zacht" : ""}`}>{l.zonderWaarde ? "?" : euro(l.waarde)}</span>
          </li>
        ))}
      </ul>
      {!alles && inv.lijnen.length > 40 && <button className="knop zacht breed" onClick={() => setAlles(true)}>Toon alles ({inv.lijnen.length})</button>}
      <p className="zacht klein">Artikels: het aantal volgt uit de kassa. Pas je een aantal met de hand aan, dan telt de app dat als altijd zo geweest.</p>
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
        <li><strong>Kas tellen</strong> bij het afsluiten van de beurs. Een verschil noteer je, je verbergt het niet.</li>
        <li><strong>Dagontvangsten</strong>: open de dag hierboven en geef in Dexxter elk bedrag in bij <em>Dagontvangsten</em>, op de datum van de beurs. Vink de dag aan.</li>
        <li><strong>Aankopen</strong>: bij elke inkoop of ruil een borderel. Bewaar het als pdf en voeg het in Dexxter toe als <em>uitgave</em>: aankoop van handelsgoederen, leverancier "particulier", 0% btw, het bedrag op het borderel.</li>
        <li><strong>SumUp</strong>: de commissie staat op de maandfactuur van SumUp: dat is een kost. De storting op je rekening is geen nieuwe omzet.</li>
      </ol>
      <h3>Op 31 december</h3>
      <ol>
        <li>Open <em>Voorraad</em>, kies 31/12 en geef het totaal in Dexxter in (Personenbelasting › Voorraad). Bewaar de pdf.</li>
        <li>Kijk de teller van de omzet na: boven de grens van de btw-vrijstelling moet je boekhouder iets doen.</li>
      </ol>
      <h3>Regels die de app volgt</h3>
      <ul>
        <li>Een stuk boven {euro(EIGEN_LIJN, true)} krijgt een eigen lijn in de dagontvangsten.</li>
        <li>Cash kan hoogstens {euro(CASH_GRENS, true)} per verkoop of aankoop zijn; daarboven betaal je met SumUp of een overschrijving.</li>
        <li>Een ruil telt als verkoop van onze kaart én aankoop van hun kaart, aan de afgesproken prijs.</li>
        <li>Verbeteren gebeurt met een nieuwe boeking (retour of ongedaan), nooit door iets te wissen. Elke wijziging staat in het logboek.</li>
        <li>Geld in of uit de koffer (wisselgeld, een andere stand) is geen omzet.</li>
      </ul>
      <h3>Vraag dit aan je boekhouder</h3>
      <ul>
        <li>Ruilen boeken als verkoop en aankoop (zoals de app doet), of enkel het verschil in geld?</li>
        <li>Hoe breng je kaarten in die je al had vóór je zelfstandige werd (privéverzameling)?</li>
        <li>Met drie: één onderneming of elk apart? Dat bepaalt wie aangifte doet en voor wie de grens van € 25.000 geldt.</li>
        <li>Voorraad lager waarderen als de marktprijs fors zakte?</li>
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

function BorderelDocument({ t, beurs, bedrijf }: { t: Transactie; beurs: Beurs | null; bedrijf: Bedrijf }) {
  const p = t.tegenpartij ?? {};
  const lijn = (l: ReturnType<typeof borderelLijnen>[number], i: number) => (
    <tr key={i}>
      <td>{l.naam}{l.code ? ` (${toonCode(l.code)})` : ""}<div className="doc-klein">{l.omschrijving}</div></td>
      <td className="r">{l.markt != null ? euro(l.markt) : "–"}<div className="doc-klein">{l.bron ?? ""}</div></td>
      <td className="r">{l.pct != null ? `${l.pct}%` : "–"}</td>
      <td className="r">{euro(l.prijs)}</td>
    </tr>
  );
  const binnen = borderelLijnen(t.regels, "in");
  const weg = borderelLijnen(t.regels, "uit");
  return (
    <article className="doc">
      <DocKop bedrijf={bedrijf} titel={t.soort === "ruil" ? "Ruilborderel" : "Aankoopborderel"}
        sub={<><div>Nr. {borderelNummer(t)}</div><div>{dagLang(dagVan(t.tijd))}, {tijdKort(t.tijd)}</div>{beurs && <div>{beurs.naam}{beurs.locatie ? `, ${beurs.locatie}` : ""}</div>}</>} />
      <section className="doc-blok">
        <h2>{t.soort === "ruil" ? "Tegenpartij" : "Verkoper"}</h2>
        <div>{p.naam || "…………………………………………"}</div>
        {p.type === "handelaar"
          ? <><div>Handelaar{p.btw ? `, ondernemingsnummer ${p.btw}` : ""}</div>{p.factuur && <div>Factuur nr. {p.factuur}</div>}</>
          : <><div>{p.adres || "…………………………………………"}</div><div>Particulier · identiteitskaart {p.id_gecontroleerd ? "bekeken" : "niet bekeken"}</div></>}
      </section>
      <table className="doc-tabel">
        <thead><tr><th>{t.soort === "ruil" ? "Wat Bind'r kreeg" : "Omschrijving"}</th><th className="r">Marktwaarde</th><th className="r">%</th><th className="r">Prijs</th></tr></thead>
        <tbody>{binnen.map(lijn)}</tbody>
        <tfoot><tr><td colSpan={3}>Totaal</td><td className="r">{euro(rond2(binnen.reduce((x, l) => x + l.prijs, 0)))}</td></tr></tfoot>
      </table>
      {t.soort === "ruil" && (
        <table className="doc-tabel">
          <thead><tr><th>Wat Bind'r gaf</th><th className="r">Onze prijs</th><th className="r">%</th><th className="r">Prijs</th></tr></thead>
          <tbody>{weg.map(lijn)}</tbody>
          <tfoot><tr><td colSpan={3}>Totaal</td><td className="r">{euro(rond2(weg.reduce((x, l) => x + l.prijs, 0)))}</td></tr></tfoot>
        </table>
      )}
      <p><strong>{t.soort === "ruil" ? (t.totaal > 0 ? "De klant betaalde bij" : t.totaal < 0 ? "Bind'r betaalde bij" : "Zonder bijbetaling") : "Betaald"}: {euro(Math.abs(t.totaal))}</strong> ({betaalTekst(t)}).</p>
      <p className="doc-klein">Marktwaarde: de waarde op de dag van de aankoop, volgens de vermelde bron (Cardmarket-prijsgids, laatste verkopen of eigen schatting). Het percentage is de prijs tegenover die marktwaarde.</p>
      {p.type !== "handelaar" && <p>{verklaring(t, bedrijf)}</p>}
      <div className="doc-handtekeningen">
        <div><span>{t.soort === "ruil" ? "Klant" : "Verkoper"}</span>{p.handtekening ? <HandtekeningBeeld pad={p.handtekening} /> : <div className="doc-lijn" />}</div>
        <div><span>Voor {bedrijf.naam || "Bind'r"}</span>{p.handtekening_ons ? <HandtekeningBeeld pad={p.handtekening_ons} /> : <div className="doc-lijn" />}</div>
      </div>
      <footer className="doc-voet">Gemaakt met Bind'r Voorraad · transactie {t.id}</footer>
    </article>
  );
}

function DagDocument({ dag, beurzen, bedrijf, beheerders }: { dag: Dag; beurzen: Beurs[]; bedrijf: Bedrijf; beheerders: Record<string, string> }) {
  const lijnen = dexxterLijnen(dag, beurzen.map((b) => b.naam).join(", ") || undefined);
  return (
    <article className="doc">
      <DocKop bedrijf={bedrijf} titel="Dagontvangsten" sub={<><div>{dagLang(dag.datum)}</div>{beurzen.map((b) => <div key={b.id}>{b.naam}{b.locatie ? `, ${b.locatie}` : ""}</div>)}</>} />
      <table className="doc-tabel">
        <thead><tr><th>Inschrijving</th><th className="r">Bedrag</th></tr></thead>
        <tbody>{lijnen.map((l, i) => <tr key={i}><td>{l.omschrijving}</td><td className="r">{euro(l.bedrag)}</td></tr>)}</tbody>
        <tfoot><tr><td>Totaal dagontvangsten</td><td className="r">{euro(dag.ontvangsten)}</td></tr></tfoot>
      </table>
      <table className="doc-tabel">
        <thead><tr><th>Tijd</th><th>Soort</th><th>Omschrijving</th><th className="r">Cash</th><th className="r">SumUp</th><th className="r">Bank</th></tr></thead>
        <tbody>
          {dag.transacties.map((t) => (
            <tr key={t.id}>
              <td>{tijdKort(t.tijd)}</td>
              <td>{SOORT[t.soort].naam}{t.beheerder && beheerders[t.beheerder] ? ` · ${beheerders[t.beheerder]}` : ""}</td>
              <td>{t.soort === "kas" ? t.opmerking || kasOmschrijving(t) : t.regels.map((r) => `${r.richting === "uit" ? (t.soort === "retour" ? "terug aan klant" : "verkocht") : (t.soort === "retour" ? "terug" : "gekocht")}: ${r.naam}${r.code ? ` (${toonCode(r.code)})` : ""} ${euro(r.prijs)}`).join("; ")}{heeftBorderel(t) ? ` · borderel ${borderelNummer(t)}` : ""}</td>
              <td className="r">{t.cash ? euro(t.cash) : ""}</td>
              <td className="r">{t.sumup ? euro(t.sumup) : ""}</td>
              <td className="r">{t.bank ? euro(t.bank) : ""}</td>
            </tr>
          ))}
        </tbody>
        <tfoot><tr><td colSpan={3}>Totaal geld</td><td className="r">{euro(rond2(dag.cash + dag.kas))}</td><td className="r">{euro(rond2(dag.sumup + dag.kasSumup))}</td><td className="r">{euro(dag.bank)}</td></tr></tfoot>
      </table>
      <p className="doc-klein">Verkopen {euro(dag.verkopen)} · ruil {euro(dag.ruil)} · retour {euro(dag.retour)} · aankopen {euro(dag.aankopen)}{dag.kas || dag.kasSumup ? ` · kasbewegingen ${euro(dag.kas)} cash, ${euro(dag.kasSumup)} SumUp (geen omzet)` : ""}.</p>
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
      {inv.zonderWaarde > 0 && <p className="doc-klein">{inv.zonderWaarde} stuk(ken) zonder gekende aankoopprijs, geteld aan € 0.</p>}
      <footer className="doc-voet">Gemaakt met Bind'r Voorraad op {datumKort(new Date().toISOString())}</footer>
    </article>
  );
}

// ── CSV ──────────────────────────────────────────────────────────────────────

function dagenCsv(dagen: Dag[], beurzen: Beurs[]): string {
  const naam = (id: string) => beurzen.find((b) => b.id === id)?.naam ?? "";
  return csv([
    ["datum", "beurs", "verkopen", "ruil", "retour", "dagontvangsten", "eigen_lijnen_boven_500", "cash", "sumup", "overschrijving", "kasbewegingen_cash", "kasbewegingen_sumup", "aankopen"],
    ...dagen.slice().reverse().map((d) => [d.datum, d.beurzen.map(naam).join(", "), d.verkopen, d.ruil, d.retour, d.ontvangsten,
      d.eigenLijnen.map((l) => `${l.omschrijving}${l.code ? ` ${toonCode(l.code)}` : ""}: ${l.bedrag.toFixed(2)}`).join(" | "), d.cash, d.sumup, d.bank, d.kas, d.kasSumup, d.aankopen]),
  ]);
}

function aankopenCsv(lijst: Transactie[], beurzen: Beurs[]): string {
  const naam = (id: string | null) => beurzen.find((b) => b.id === id)?.naam ?? "";
  return csv([
    ["borderel", "datum", "beurs", "soort", "tegenpartij", "type", "adres", "identiteit_bekeken", "getekend", "aankoopwaarde", "cash", "overschrijving", "status", "transactie_id"],
    ...lijst.slice().reverse().map((t) => [borderelNummer(t), dagVan(t.tijd), naam(t.beurs_id), t.soort, t.tegenpartij?.naam ?? "", t.tegenpartij?.type ?? "",
      t.tegenpartij?.adres ?? "", t.tegenpartij?.id_gecontroleerd ? "ja" : "nee", t.tegenpartij?.handtekening ? "ja" : "nee", aankoopVan(t), t.cash, t.bank ?? 0, t.status, t.id]),
  ]);
}

function inventarisCsv(inv: Inventaris): string {
  return csv([
    ["code", "omschrijving", "soort", "aantal", "aankoopdatum", "herkomst", "borderel", "aankoopwaarde"],
    ...inv.lijnen.map((l) => [l.code ? toonCode(l.code) : "", l.omschrijving, l.soort, l.aantal, l.aankoopdatum, l.herkomst, l.borderel, l.zonderWaarde ? "" : l.waarde]),
    ["", "Totaal", "", inv.lijnen.reduce((n, l) => n + l.aantal, 0), "", "", "", inv.totaal],
  ]);
}

function transactiesCsv(lijst: Transactie[], beurzen: Beurs[]): string {
  const naam = (id: string | null) => beurzen.find((b) => b.id === id)?.naam ?? "";
  const rijen: (string | number | null)[][] = [["datum", "tijd", "beurs", "soort", "richting", "code", "naam", "aantal", "prijs", "marktwaarde", "cash", "sumup", "overschrijving", "transactie_id"]];
  for (const t of lijst) {
    if (t.soort === "kas") { rijen.push([dagVan(t.tijd), tijdKort(t.tijd), naam(t.beurs_id), "kas", "", "", t.opmerking ?? kasOmschrijving(t), 1, 0, null, t.cash, t.sumup, 0, t.id]); continue; }
    for (const r of t.regels) rijen.push([dagVan(t.tijd), tijdKort(t.tijd), naam(t.beurs_id), t.soort, r.richting, r.code ? toonCode(r.code) : "", r.naam, r.aantal ?? 1, r.prijs, r.referentie ?? null, t.cash, t.sumup, t.bank ?? 0, t.id]);
  }
  return csv(rijen);
}
