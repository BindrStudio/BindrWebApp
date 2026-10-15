import { useMemo, useState } from "react";
import {
  actieveBeurs, bewaarBeurs, conflictAanvaarden, conflictOplossen, huidig, meld, ongedaanMaken, openBeurs, openExemplaar,
  openTransactie, planBeurs, retour, schrapBeurs, sluit, sluitBeurs, startBeurs, useApp,
} from "../state";
import type { Beurs, Regel, Stand, Transactie } from "../types";
import { beursCijfers, stand } from "../lib/kassa";
import { datumKort, euro, getal, vandaag } from "../lib/format";
import { normaliseerCode, toonCode } from "../lib/code";
import { inVoorraad } from "../lib/exemplaar";
import { Icoon, Sheet, Veld } from "./common";

const tijdKort = (iso: string) => new Date(iso).toLocaleTimeString("nl-BE", { hour: "2-digit", minute: "2-digit" });
const SOORT_NAAM: Record<Transactie["soort"], string> = { verkoop: "Verkoop", ruil: "Ruil", inkoop: "Inkoop", retour: "Retour" };

// ── Beurs starten en afsluiten ───────────────────────────────────────────────

/** Komende beurzen van deze omgeving, de eerste eerst. */
export function geplandeBeurzen(beurzen: Beurs[]): Beurs[] {
  const nu = vandaag();
  return beurzen.filter((b) => b.status === "gepland" && b.datum >= nu).sort((a, b) => a.datum.localeCompare(b.datum));
}

/**
 * Een beurs starten (met de cashkoffer) of enkel plannen: geplande beurzen verschijnen
 * op de klantenpagina bij "Bezoek onze stand". Starten kan vanuit een geplande beurs.
 */
export function BeursStart({ onSluit, plannen = false }: { onSluit: () => void; plannen?: boolean }) {
  const s = useApp();
  const st = stand(s);
  const gepland = geplandeBeurzen(s.beurzen);
  const vandaagGepland = gepland.find((b) => b.datum === vandaag());
  const [gekozen, setGekozen] = useState<string | null>(plannen ? null : vandaagGepland?.id ?? null);
  const basis = gepland.find((b) => b.id === gekozen);
  const [v, setV] = useState({
    naam: basis?.naam ?? "", datum: basis?.datum ?? vandaag(), locatie: basis?.locatie ?? "", startkas: "",
  });
  const kies = (b: Beurs | null) => {
    setGekozen(b?.id ?? null);
    setV({ ...v, naam: b?.naam ?? "", datum: b?.datum ?? vandaag(), locatie: b?.locatie ?? "" });
  };
  const kas = getal(v.startkas);
  return (
    <Sheet titel={plannen ? "Beurs plannen" : "Beurs starten"} onSluit={onSluit}>
      <div className="formulier">
        {!plannen && gepland.length > 0 && (
          <Veld label="Gepland">
            <div className="kiezer">
              {gepland.slice(0, 4).map((b) => (
                <button key={b.id} type="button" className={`chip${gekozen === b.id ? " aan" : ""}`} onClick={() => kies(gekozen === b.id ? null : b)}>
                  {b.naam} · {datumKort(b.datum)}
                </button>
              ))}
            </div>
          </Veld>
        )}
        <Veld label="Naam"><input value={v.naam} onChange={(e) => setV({ ...v, naam: e.target.value })} placeholder="bv. Beurs Gent" autoFocus={!basis} /></Veld>
        <div className="twee">
          <Veld label="Datum"><input type="date" value={v.datum} onChange={(e) => setV({ ...v, datum: e.target.value })} /></Veld>
          <Veld label="Plaats"><input value={v.locatie} onChange={(e) => setV({ ...v, locatie: e.target.value })} placeholder="bv. ICC Gent" /></Veld>
        </div>
        {plannen ? (
          <>
            <p className="zacht klein">Klanten zien geplande beurzen op de klantenpagina, bij "Bezoek onze stand". Op de dag zelf start je hem met één tik.</p>
            <button className="knop groot" disabled={!v.naam.trim() || v.datum < vandaag()} onClick={() => {
              planBeurs({ naam: v.naam, datum: v.datum, locatie: v.locatie });
              onSluit();
            }}>Beurs plannen</button>
          </>
        ) : (
          <>
            <Veld label="Startbedrag in de cashkoffer (€)" hint="Tel het geld in de koffer en vul het exacte bedrag in.">
              <input inputMode="decimal" value={v.startkas} onChange={(e) => setV({ ...v, startkas: e.target.value })} placeholder="150" autoFocus={!!basis} />
            </Veld>
            <div className="stand-blok">
              <span className="zacht klein">De app noteert nu de stand bij de start</span>
              <StandRij st={st} />
            </div>
            <button className="knop groot" disabled={kas == null || kas < 0} onClick={() => {
              try {
                startBeurs({ naam: v.naam || `Beurs ${datumKort(v.datum)}`, datum: v.datum, startkas: kas!, locatie: v.locatie.trim() || null, geplandId: gekozen });
                onSluit();
              } catch (e) { meld((e as Error).message, "fout"); }
            }}>Beurs starten</button>
          </>
        )}
      </div>
    </Sheet>
  );
}

/** De komende beurzen, met schrappen (in het overzicht en bij de kassa). */
export function KomendeBeurzen({ onPlan }: { onPlan: () => void }) {
  const { beurzen } = useApp();
  const lijst = geplandeBeurzen(beurzen);
  const [weg, setWeg] = useState<string | null>(null);
  return (
    <section className="blok">
      <div className="blok-kop"><h3>Komende beurzen</h3><button className="tekstknop klein" onClick={onPlan}><Icoon naam="plus" maat={16} /> Plannen</button></div>
      {!lijst.length && <p className="zacht klein">Niets gepland. Geplande beurzen staan ook op de klantenpagina.</p>}
      <ul className="lijst">
        {lijst.map((b) => (
          <li key={b.id} className="komend-rij">
            <span className="komend-datum"><strong>{new Date(b.datum + "T12:00:00").getDate()}</strong>{new Date(b.datum + "T12:00:00").toLocaleDateString("nl-BE", { month: "short" })}</span>
            <span className="lijst-naam"><strong>{b.naam}</strong>{b.locatie && <span className="zacht klein"> · {b.locatie}</span>}</span>
            {weg === b.id ? (
              <span className="rechts knoppenrij klein">
                <button className="tekstknop klein rood" onClick={() => { schrapBeurs(b.id); setWeg(null); }}>Schrappen</button>
                <button className="tekstknop klein" onClick={() => setWeg(null)}>Toch niet</button>
              </span>
            ) : <button className="rond-knop rechts" onClick={() => setWeg(b.id)} aria-label={`${b.naam} schrappen`}><Icoon naam="kruis" maat={14} /></button>}
          </li>
        ))}
      </ul>
    </section>
  );
}

function StandRij({ st }: { st: Stand }) {
  return (
    <div className="stand-rij">
      <div><span>Catalogus</span><strong>{st.catalogus} stuks</strong><em>{euro(st.catalogusWaarde, true)}</em></div>
      <div><span>Artikelen</span><strong>{euro(st.artikelenWaarde, true)}</strong></div>
      <div><span>Voorraad</span><strong>{st.voorraad} stuks</strong></div>
    </div>
  );
}

export function BeursAfsluiten({ beurs, onSluit }: { beurs: Beurs; onSluit: () => void }) {
  const { transacties } = useApp();
  const c = beursCijfers(beurs, transacties.filter((t) => t.beurs_id === beurs.id));
  const [geteld, setGeteld] = useState("");
  const [sumupOk, setSumupOk] = useState(false);
  const g = getal(geteld);
  const verschil = g != null ? Math.round((g - c.kasVerwacht) * 100) / 100 : null;
  return (
    <Sheet titel={`${beurs.naam} afsluiten`} onSluit={onSluit}>
      <div className="formulier">
        <div className="afsluit-rij"><span>Startbedrag</span><strong>{euro(beurs.startkas)}</strong></div>
        <div className="afsluit-rij"><span>Cash erbij (netto)</span><strong>{euro(c.cash)}</strong></div>
        <div className="afsluit-rij groot"><span>Verwacht in de cashkoffer</span><strong>{euro(c.kasVerwacht)}</strong></div>
        <Veld label="Geteld in de cashkoffer (€)">
          <input inputMode="decimal" value={geteld} onChange={(e) => setGeteld(e.target.value)} autoFocus />
        </Veld>
        {verschil != null && (
          <p className={verschil === 0 ? "zeker" : "nakijken"}>
            {verschil === 0 ? "De kas klopt." : verschil > 0 ? `${euro(verschil)} te veel in de koffer.` : `${euro(-verschil)} te weinig in de koffer.`}
          </p>
        )}
        <div className="afsluit-rij groot"><span>SumUp volgens de app</span><strong>{euro(c.sumup)}</strong></div>
        <label className="schakel">
          <input type="checkbox" checked={sumupOk} onChange={(e) => setSumupOk(e.target.checked)} />
          <span>Klopt met het totaal in de SumUp-app</span>
        </label>
        {c.conflicten > 0 && <p className="nakijken">Er {c.conflicten === 1 ? "is nog 1 conflict" : `zijn nog ${c.conflicten} conflicten`} om na te kijken. Je kunt toch afsluiten.</p>}
        <button className="knop groot" onClick={() => {
          if (!confirm(`${beurs.naam} stoppen? Daarna komen verkopen niet meer in deze kassa.`)) return;
          const b = sluitBeurs(beurs, { getelde_kas: g, sumup_bevestigd: sumupOk });
          onSluit();
          openBeurs(b.id);
        }}>Beurs stoppen</button>
      </div>
    </Sheet>
  );
}

// ── Transacties ──────────────────────────────────────────────────────────────

export function TransactiesLijst({ beursId, onSluit }: { beursId: string | null; onSluit: () => void }) {
  const { transacties, beheerders } = useApp();
  const lijst = useMemo(() => transacties.filter((t) => (beursId ? t.beurs_id === beursId : true)).slice().sort((a, b) => b.tijd.localeCompare(a.tijd)).slice(0, beursId ? 500 : 100), [transacties, beursId]);
  return (
    <Sheet titel={beursId ? "Transacties van deze beurs" : "Laatste transacties"} onSluit={onSluit} vol>
      {!lijst.length && <p className="zacht">Nog geen transacties.</p>}
      <ul className="transacties">
        {lijst.map((t) => <TransactieRij key={t.id} t={t} beheerder={t.beheerder ? beheerders[t.beheerder] : undefined} />)}
      </ul>
    </Sheet>
  );
}

function TransactieRij({ t, beheerder }: { t: Transactie; beheerder?: string }) {
  const namen = t.regels.map((r) => r.naam).join(", ");
  return (
    <li>
      <button className={`transactie-rij ${t.status}`} onClick={() => openTransactie(t.id)}>
        <span className="transactie-tijd">{tijdKort(t.tijd)}</span>
        <span className="transactie-tekst">
          <strong>{SOORT_NAAM[t.soort]}{t.status === "ongedaan" ? " (ongedaan)" : ""}{t.status === "conflict" ? " · conflict" : ""}</strong>
          <span className="zacht klein">{namen}</span>
          {beheerder && <span className="zacht klein">door {beheerder}</span>}
        </span>
        <span className="transactie-bedrag">
          <strong>{t.totaal >= 0 ? euro(t.totaal) : `− ${euro(-t.totaal)}`}</strong>
          <span className="zacht klein">{[t.cash ? "cash" : null, t.sumup ? "SumUp" : null].filter(Boolean).join(" + ") || "geen geld"}</span>
        </span>
      </button>
    </li>
  );
}

export function TransactieSheet({ id }: { id: string }) {
  const { transacties, beheerders, exemplaren } = useApp();
  const t = transacties.find((x) => x.id === id);
  const [retourKeuze, setRetourKeuze] = useState<Set<number> | null>(null);
  if (!t) return null;
  const uit = t.regels.map((r, i) => ({ r, i })).filter((x) => x.r.richting === "uit");
  const retourBedrag = retourKeuze ? uit.filter((x) => retourKeuze.has(x.i)).reduce((s, x) => s + x.r.prijs, 0) : 0;

  return (
    <Sheet titel={`${SOORT_NAAM[t.soort]} · ${datumKort(t.tijd)} ${tijdKort(t.tijd)}`} onSluit={sluit}>
      {t.status === "ongedaan" && <div className="melding-kaart neer"><Icoon naam="terug" /><div><strong>Ongedaan gemaakt</strong><span>Deze transactie telt niet mee.</span></div></div>}
      {t.conflicten.map((c) => <ConflictBlok key={c.exemplaar_id ?? c.artikel_id} t={t} conflictId={(c.exemplaar_id ?? c.artikel_id)!} reden={c.reden} isExemplaar={!!c.exemplaar_id} />)}

      <section className="blok">
        {t.regels.map((r, i) => {
          const ex = r.exemplaar_id ? exemplaren.find((e) => e.id === r.exemplaar_id) : r.nieuw?.id ? exemplaren.find((e) => e.id === r.nieuw!.id) : null;
          return (
            <div key={i} className={`regel ${r.richting}`}>
              <div className="regel-icoon"><Icoon naam={r.richting === "uit" ? "uit" : "plus"} maat={18} /></div>
              <div className="regel-tekst">
                <strong>{r.naam}{r.aantal && r.aantal > 1 ? ` × ${r.aantal}` : ""}</strong>
                <span className="zacht klein">
                  {r.richting === "uit" ? (t.soort === "retour" ? "terug" : "wij gaven") : t.soort === "retour" ? "terug" : "wij kregen"}
                  {r.code && <> · <span className="code">{toonCode(r.code)}</span></>}
                  {r.hartjesprijs != null && r.prijs !== r.hartjesprijs && <> · hartje {euro(r.hartjesprijs)}</>}
                </span>
                {ex && <button className="tekstknop klein" onClick={() => openExemplaar(ex.id)}>Bekijk exemplaar</button>}
              </div>
              <div className="regel-prijs"><strong>{euro(r.prijs)}</strong></div>
              {retourKeuze && r.richting === "uit" && t.soort !== "retour" && (
                <input type="checkbox" className="vinkvak" checked={retourKeuze.has(i)} onChange={(e) => {
                  const k = new Set(retourKeuze);
                  if (e.target.checked) k.add(i); else k.delete(i);
                  setRetourKeuze(k);
                }} aria-label="Retour" />
              )}
            </div>
          );
        })}
      </section>

      <section className="blok">
        <div className="afsluit-rij"><span>{t.totaal >= 0 ? "Ontvangen" : "Uitbetaald"}</span><strong>{euro(Math.abs(t.totaal))}</strong></div>
        {t.cash !== 0 && <div className="afsluit-rij"><span>Cash</span><strong>{euro(t.cash)}</strong></div>}
        {t.sumup !== 0 && <div className="afsluit-rij"><span>SumUp</span><strong>{euro(t.sumup)}</strong></div>}
        {t.beheerder && <div className="afsluit-rij"><span>Door</span><strong>{beheerders[t.beheerder] ?? "beheerder"}</strong></div>}
      </section>

      {t.status !== "ongedaan" && (
        <div className="knoppenrij onderaan">
          {t.soort !== "retour" && uit.length > 0 && !retourKeuze && <button className="knop zacht" onClick={() => setRetourKeuze(new Set(uit.map((x) => x.i)))}><Icoon naam="terug" maat={18} /> Retour</button>}
          {retourKeuze && (
            <>
              <button className="knop" disabled={!retourKeuze.size} onClick={() => {
                const regels: Regel[] = uit.filter((x) => retourKeuze.has(x.i)).map(({ r }) => {
                  const ex = r.exemplaar_id ? huidig().exemplaren.find((e) => e.id === r.exemplaar_id) : null;
                  return { ...r, vorige_status: ex?.status ?? null };
                });
                retour(regels, Math.round(retourBedrag * 100) / 100);
                meld(`Retour: ${euro(retourBedrag)} cash terug`);
                setRetourKeuze(null);
              }}>Retour: {euro(retourBedrag)} cash terug</button>
              <button className="tekstknop" onClick={() => setRetourKeuze(null)}>Annuleer</button>
            </>
          )}
          {!retourKeuze && <button className="knop zacht rood" onClick={() => { if (confirm("Deze transactie ongedaan maken? De voorraad en de kas gaan terug.")) ongedaanMaken(t.id); }}>Ongedaan maken</button>}
        </div>
      )}
    </Sheet>
  );
}

function ConflictBlok({ t, conflictId, reden, isExemplaar }: { t: Transactie; conflictId: string; reden: string; isExemplaar: boolean }) {
  const { exemplaren } = useApp();
  const [code, setCode] = useState("");
  const oud = exemplaren.find((e) => e.id === conflictId);
  const nieuw = (() => { const c = normaliseerCode(code); return c ? exemplaren.find((e) => e.code === c) : null; })();
  return (
    <div className="conflict">
      <div className="conflict-kop"><Icoon naam="waarschuwing" maat={20} /><strong>Conflict: {oud ? `${oud.naam} ${toonCode(oud.code)}` : "artikel"} was {reden.replace(/^al /, "al ")}</strong></div>
      <p className="zacht klein">Twee toestellen boekten hetzelfde, of er werd een verkeerde code getypt. Kijk het label van de verkochte kaart na.</p>
      {isExemplaar && (
        <>
          <div className="code-rij">
            <input className="code-veld klein" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Juiste code, bv. XT6-6CZ" />
            <button className="knop" disabled={!nieuw || !inVoorraad(nieuw)} onClick={() => conflictOplossen(t.id, conflictId, nieuw!.id)}>Zet op deze kaart</button>
          </div>
          {nieuw && <p className="klein">{nieuw.naam} · {inVoorraad(nieuw) ? "in voorraad" : `al ${nieuw.status}`}</p>}
        </>
      )}
      <button className="tekstknop klein" onClick={() => conflictAanvaarden(t.id, conflictId)}>Laten zo (het geld telt, de voorraad verandert niet)</button>
    </div>
  );
}

// ── Rapport van een beurs en het overzicht ───────────────────────────────────

export function BeursRapport({ id }: { id: string }) {
  const s = useApp();
  const b = s.beurzen.find((x) => x.id === id);
  if (!b) return null;
  const tr = s.transacties.filter((t) => t.beurs_id === b.id);
  const c = beursCijfers(b, tr);
  const einde = b.stand_einde ?? (b.status === "actief" ? stand(s) : null);
  const resultaat = Math.round((c.omzet - c.uitbetaald) * 100) / 100;
  const verschil = b.getelde_kas != null ? Math.round((b.getelde_kas - c.kasVerwacht) * 100) / 100 : null;
  return (
    <Sheet titel={b.naam} onSluit={sluit} vol>
      <p className="zacht">{datumKort(b.datum)} · {b.status === "actief" ? "bezig" : b.status === "afgesloten" ? `afgesloten ${b.afgesloten_op ? tijdKort(b.afgesloten_op) : ""}` : "gepland"}</p>
      <div className="rapport-raster">
        <Cijfer label="Omzet" waarde={euro(c.omzet)} />
        <Cijfer label="Cash" waarde={euro(c.cash)} />
        <Cijfer label="SumUp" waarde={euro(c.sumup)} />
        <Cijfer label="Uitbetaald" waarde={euro(c.uitbetaald)} sub="inkoop, bijbetalen, retour" />
        <Cijfer label="Resultaat" waarde={euro(resultaat)} sub="omzet − uitbetaald" nadruk />
        <Cijfer label="Korting gegeven" waarde={euro(c.korting)} />
        <Cijfer label="Marge" waarde={c.marge == null ? "–" : euro(c.marge)} sub="op verkochte kaarten met aankoopprijs" />
      </div>
      <section className="blok">
        <h3>Kaarten</h3>
        <div className="afsluit-rij"><span>Verkocht</span><strong>{c.verkocht}</strong></div>
        <div className="afsluit-rij"><span>Weggeruild</span><strong>{c.weggeruild}</strong></div>
        <div className="afsluit-rij"><span>Nieuw binnen</span><strong>{c.nieuwViaRuil + c.nieuwViaInkoop} ({c.nieuwViaRuil} via ruil, {c.nieuwViaInkoop} via inkoop)</strong></div>
        {b.stand_start && einde && (
          <>
            <div className="afsluit-rij"><span>Voorraad</span><strong>{b.stand_start.voorraad} → {einde.voorraad}</strong></div>
            <div className="afsluit-rij"><span>Catalogus</span><strong>{b.stand_start.catalogus} → {einde.catalogus} stuks</strong></div>
            <div className="afsluit-rij"><span>Waarde catalogus</span><strong>{euro(b.stand_start.catalogusWaarde, true)} → {euro(einde.catalogusWaarde, true)}</strong></div>
          </>
        )}
      </section>
      <section className="blok">
        <h3>Kas</h3>
        <div className="afsluit-rij"><span>Startbedrag</span><strong>{euro(b.startkas)}</strong></div>
        <div className="afsluit-rij"><span>Verwacht</span><strong>{euro(c.kasVerwacht)}</strong></div>
        {b.getelde_kas != null && <div className="afsluit-rij"><span>Geteld</span><strong>{euro(b.getelde_kas)}{verschil ? ` (${verschil > 0 ? "+" : "−"}${euro(Math.abs(verschil))})` : " · klopt"}</strong></div>}
        <div className="afsluit-rij"><span>SumUp nagekeken</span><strong>{b.sumup_bevestigd ? "ja" : "nee"}</strong></div>
        {b.status === "afgesloten" && !b.sumup_bevestigd && <button className="tekstknop klein" onClick={() => bewaarBeurs({ ...b, sumup_bevestigd: true })}>SumUp klopt</button>}
      </section>
      <section className="blok">
        <h3>Transacties ({c.transacties})</h3>
        <ul className="transacties">
          {tr.slice().sort((x, y) => y.tijd.localeCompare(x.tijd)).map((t) => <TransactieRij key={t.id} t={t} beheerder={t.beheerder ? s.beheerders[t.beheerder] : undefined} />)}
        </ul>
        <button className="knop zacht" onClick={() => downloadCsv(`${b.naam} ${b.datum}.csv`, tr, s.beheerders)}>Exporteer als CSV</button>
      </section>
    </Sheet>
  );
}

function Cijfer({ label, waarde, sub, nadruk }: { label: string; waarde: string; sub?: string; nadruk?: boolean }) {
  return <div className={`cijfer${nadruk ? " nadruk" : ""}`}><span>{label}</span><strong>{waarde}</strong>{sub && <em>{sub}</em>}</div>;
}

export function Overzicht() {
  const s = useApp();
  const st = stand(s);
  const vault = s.exemplaren.filter((e) => inVoorraad(e) && e.opslag === "stockdoos");
  const vaultWaarde = vault.reduce((x, e) => x + (e.verkoopprijs ?? 0), 0);
  const aankoop = s.exemplaren.filter(inVoorraad).reduce((x, e) => x + (e.aankoopprijs ?? 0), 0);
  const leeftijd = (() => {
    const actief = s.exemplaren.filter(inVoorraad);
    if (!actief.length) return null;
    const nu = Date.now();
    return Math.round(actief.reduce((x, e) => x + (nu - Date.parse(e.aangemaakt_op)) / 86400000, 0) / actief.length);
  })();
  const actief = actieveBeurs(s);
  const [plan, setPlan] = useState(false);
  return (
    <Sheet titel="Overzicht" onSluit={sluit} vol>
      <div className="rapport-raster">
        <Cijfer label="Catalogus" waarde={euro(st.catalogusWaarde, true)} sub={`${st.catalogus} stuks, hartjes`} />
        <Cijfer label="Vault" waarde={euro(vaultWaarde, true)} sub={`${vault.length} stuks, waarde`} />
        <Cijfer label="Artikelen" waarde={euro(st.artikelenWaarde, true)} sub="in de catalogus" />
        <Cijfer label="Aankoopwaarde" waarde={euro(aankoop, true)} sub="van alles in voorraad" />
        <Cijfer label="Gemiddelde ouderdom" waarde={leeftijd == null ? "–" : `${leeftijd} dagen`} sub="sinds invoer" />
      </div>
      <KomendeBeurzen onPlan={() => setPlan(true)} />
      {plan && <BeursStart plannen onSluit={() => setPlan(false)} />}
      <section className="blok">
        <h3>Beurzen</h3>
        {!s.beurzen.some((b) => b.status !== "gepland") && <p className="zacht">Nog geen beurzen.</p>}
        <ul className="lijst">
          {s.beurzen.filter((b) => b.status !== "gepland").sort((a, b) => b.datum.localeCompare(a.datum)).map((b) => {
            const c = beursCijfers(b, s.transacties.filter((t) => t.beurs_id === b.id));
            return (
              <li key={b.id}>
                <button className="lijst-knop" onClick={() => openBeurs(b.id)}>
                  <span className="lijst-naam"><strong>{b.naam}</strong> <span className="zacht klein">{datumKort(b.datum)}{b.id === actief?.id ? " · bezig" : ""}</span></span>
                  <span className="rechts">{euro(c.omzet, true)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>
      <button className="knop zacht" onClick={() => downloadCsv(`bindr-transacties-${vandaag()}.csv`, s.transacties, s.beheerders, s.beurzen)}>Alle transacties als CSV</button>
    </Sheet>
  );
}

function downloadCsv(naam: string, transacties: Transactie[], beheerders: Record<string, string>, beurzen: Beurs[] = huidig().beurzen) {
  const beursNaam = Object.fromEntries(beurzen.map((b) => [b.id, b.naam]));
  const kop = ["datum", "tijd", "beurs", "soort", "status", "beheerder", "richting", "code", "naam", "aantal", "hartjesprijs", "prijs", "aankoopprijs", "transactie_totaal", "cash", "sumup", "transactie_id"];
  const rijen: (string | number | null | undefined)[][] = [kop];
  for (const t of transacties.slice().sort((a, b) => a.tijd.localeCompare(b.tijd))) {
    for (const r of t.regels) {
      rijen.push([t.tijd.slice(0, 10), tijdKort(t.tijd), t.beurs_id ? beursNaam[t.beurs_id] ?? "" : "", t.soort, t.status,
        t.beheerder ? beheerders[t.beheerder] ?? "" : "", r.richting, r.code ? toonCode(r.code) : "", r.naam, r.aantal ?? 1,
        r.hartjesprijs, r.prijs, r.aankoopprijs, t.totaal, t.cash, t.sumup, t.id]);
    }
  }
  const tekst = rijen.map((r) => r.map((v) => {
    const x = v == null ? "" : typeof v === "number" ? String(v).replace(".", ",") : String(v);
    return /[;"\n]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x;
  }).join(";")).join("\n");
  const url = URL.createObjectURL(new Blob(["﻿" + tekst], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = naam;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
