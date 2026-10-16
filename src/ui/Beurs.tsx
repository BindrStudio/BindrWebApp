import { useMemo, useState } from "react";
import {
  actieveBeurs, bewaarBeurs, conflictAanvaarden, conflictOplossen, huidig, kanNieuweBoekhouding, magOngedaan, meld, ongedaanMaken, openBeurs, openExemplaar,
  openTransactie, planBeurs, retour, schrapBeurs, sluit, sluitBeurs, startBeurs, useApp,
} from "../state";
import type { Beurs, Regel, Stand, Transactie } from "../types";
import { beursCijfers, beursOverzicht, CASH_GRENS, PRODUCTSOORTEN, retourBedrag, stand } from "../lib/kassa";
import { bewijsNummer, csv, heeftBewijs } from "../lib/boekhouding";
import { datumKort, euro, getal, vandaag } from "../lib/format";
import { normaliseerCode, toonCode } from "../lib/code";
import { inVoorraad } from "../lib/exemplaar";
import { Icoon, Sheet, Veld } from "./common";
import { BeurzenEnTransacties, kasOmschrijving, TransactieRij, useSoortVan } from "./Historiek";
import { BewijsKnop, BewijsSheet } from "./Boekhouding";
import { bewaarCsv } from "./Afdruk";

const tijdKort = (iso: string) => new Date(iso).toLocaleTimeString("nl-BE", { hour: "2-digit", minute: "2-digit" });
const SOORT_NAAM: Record<Transactie["soort"], string> = { verkoop: "Verkoop", ruil: "Ruil", inkoop: "Inkoop", retour: "Retour", kas: "Kas", prive: "Privé" };

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
      <div><span>Artikels</span><strong>{euro(st.artikelenWaarde, true)}</strong></div>
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

export function TransactieSheet({ id }: { id: string }) {
  const { transacties, beheerders, exemplaren } = useApp();
  const t = transacties.find((x) => x.id === id);
  // Retour: welke regels gaan terug (onze stukken komen terug, hun stukken geven we terug).
  const [retourKeuze, setRetourKeuze] = useState<Set<number> | null>(null);
  const [eigenBedrag, setEigenBedrag] = useState<string | null>(null);
  const [perBank, setPerBank] = useState(false);
  const [borderel, setBorderel] = useState(false);
  if (!t) return null;
  const nieuw = kanNieuweBoekhouding();
  // Wat al terugging (een eerdere retour van deze transactie) kan niet nog eens terug.
  const retours = transacties.filter((x) => x.soort === "retour" && x.status !== "ongedaan" && x.regels.some((r) => r.van === t.id));
  const artikelTerug = (id: string, richting: Regel["richting"]) => retours.flatMap((x) => x.regels)
    .filter((r) => r.van === t.id && r.artikel_id === id && r.richting === richting).reduce((n, r) => n + (r.aantal ?? 1), 0);
  const kanTerug = (r: Regel) => {
    if (r.richting === "uit") {
      if (r.exemplaar_id) { const e = exemplaren.find((x) => x.id === r.exemplaar_id); return !!e && e.status !== "in voorraad" && e.transactie_id === t.id; }
      return !!r.artikel_id && artikelTerug(r.artikel_id, "in") < (r.aantal ?? 1);
    }
    if (!nieuw) return false; // hun stukken teruggeven kan pas met het nieuwe schema
    if (r.nieuw?.id) return exemplaren.find((x) => x.id === r.nieuw!.id)?.status === "in voorraad";
    return !!r.artikel_id && artikelTerug(r.artikel_id, "uit") < (r.aantal ?? 1);
  };
  const terugbaar = t.soort !== "retour" && t.soort !== "kas" ? t.regels.map((r, i) => ({ r, i })).filter((x) => kanTerug(x.r)) : [];
  const gekozen = retourKeuze ? terugbaar.filter((x) => retourKeuze.has(x.i)) : [];
  const terugIn = gekozen.filter((x) => x.r.richting === "uit").map((x) => x.r);
  const terugUit = gekozen.filter((x) => x.r.richting === "in").map((x) => x.r);
  const standaard = retourBedrag(terugIn, terugUit);
  const bedrag = eigenBedrag != null ? getal(eigenBedrag) : standaard;
  const naam = (r: Regel) => `${r.naam}${r.aantal && r.aantal > 1 ? ` × ${r.aantal}` : ""}`;

  return (
    <Sheet titel={`${SOORT_NAAM[t.soort]} · ${datumKort(t.tijd)} ${tijdKort(t.tijd)}`} onSluit={sluit}>
      {t.status === "ongedaan" && <div className="melding-kaart neer"><Icoon naam="terug" /><div><strong>Ongedaan gemaakt</strong><span>Deze transactie telt niet mee.</span></div></div>}
      {t.conflicten.map((c) => <ConflictBlok key={c.exemplaar_id ?? c.artikel_id} t={t} conflictId={(c.exemplaar_id ?? c.artikel_id)!} reden={c.reden} isExemplaar={!!c.exemplaar_id} />)}

      {t.soort === "kas" ? (
        <section className="blok">
          <div className="afsluit-rij"><span>{t.opmerking || kasOmschrijving(t)}</span><strong>{euro(t.cash)} cash</strong></div>
          {t.sumup !== 0 && <div className="afsluit-rij"><span>SumUp</span><strong>{euro(t.sumup)}</strong></div>}
          {t.tegenpartij?.naam && <div className="afsluit-rij"><span>Met</span><strong>{t.tegenpartij.naam}</strong></div>}
          <p className="zacht klein">Een kasbeweging is geen omzet: ze telt enkel mee in de kas.</p>
        </section>
      ) : (
        <section className="blok">
          {t.regels.map((r, i) => {
            const ex = r.exemplaar_id ? exemplaren.find((e) => e.id === r.exemplaar_id) : r.nieuw?.id ? exemplaren.find((e) => e.id === r.nieuw!.id) : null;
            const kiesbaar = retourKeuze && terugbaar.some((x) => x.i === i);
            return (
              <div key={i} className={`regel ${r.richting}`}>
                <div className="regel-icoon"><Icoon naam={r.richting === "uit" ? "uit" : "plus"} maat={18} /></div>
                <div className="regel-tekst">
                  <strong>{naam(r)}</strong>
                  <span className="zacht klein">
                    {t.soort === "retour" ? (r.richting === "in" ? "kwam terug" : "teruggegeven aan de klant") : r.richting === "uit" ? "wij gaven" : "wij kregen"}
                    {r.code && <> · <span className="code">{toonCode(r.code)}</span></>}
                    {r.hartjesprijs != null && r.prijs !== r.hartjesprijs && <> · hartje {euro(r.hartjesprijs)}</>}
                    {r.referentie != null && <> · markt {euro(r.referentie)}</>}
                  </span>
                  {ex && <button className="tekstknop klein" onClick={() => openExemplaar(ex.id)}>Bekijk exemplaar</button>}
                </div>
                <div className="regel-prijs"><strong>{euro(r.prijs)}</strong></div>
                {kiesbaar && (
                  <input type="checkbox" className="vinkvak" checked={retourKeuze!.has(i)} onChange={(e) => {
                    const k = new Set(retourKeuze);
                    if (e.target.checked) k.add(i); else k.delete(i);
                    setRetourKeuze(k);
                    setEigenBedrag(null);
                  }} aria-label={`${naam(r)} terug`} />
                )}
              </div>
            );
          })}
        </section>
      )}

      {t.soort !== "kas" && (
        <section className="blok">
          <div className="afsluit-rij"><span>{t.totaal >= 0 ? "Ontvangen" : "Uitbetaald"}</span><strong>{euro(Math.abs(t.totaal))}</strong></div>
          {t.cash !== 0 && <div className="afsluit-rij"><span>Cash</span><strong>{euro(t.cash)}</strong></div>}
          {t.sumup !== 0 && <div className="afsluit-rij"><span>SumUp</span><strong>{euro(t.sumup)}</strong></div>}
          {!!t.bank && <div className="afsluit-rij"><span>Overschrijving</span><strong>{euro(t.bank)}</strong></div>}
          {t.beheerder && <div className="afsluit-rij"><span>Door</span><strong>{beheerders[t.beheerder] ?? "beheerder"}</strong></div>}
        </section>
      )}
      {t.soort === "kas" && t.beheerder && <div className="afsluit-rij"><span>Door</span><strong>{beheerders[t.beheerder] ?? "beheerder"}</strong></div>}

      {(heeftBewijs(t) || t.soort === "prive") && nieuw && <BewijsKnop t={t} onOpen={() => setBorderel(true)} />}
      {borderel && <BewijsSheet id={t.id} onSluit={() => setBorderel(false)} />}

      {retourKeuze && (
        <section className="blok retour-blok">
          <h3>{terugUit.length ? "Deal terugdraaien" : "Retour"}</h3>
          <p className="zacht klein">Vink aan wat teruggaat. Onze stukken komen terug in voorraad; wat de klant ons gaf, geven we terug (dat moet nog in voorraad zijn). Altijd cash.</p>
          <Veld label={standaard < 0 ? "De klant betaalt ons terug (€)" : "Wij betalen terug (€)"} hint={eigenBedrag != null ? `Volgens de prijzen: ${euro(Math.abs(standaard))}` : "Pas aan als je iets anders afspreekt."}>
            <span className="euro-invoer"><span>€</span><input inputMode="decimal" value={eigenBedrag ?? String(Math.abs(standaard)).replace(".", ",")}
              onChange={(e) => setEigenBedrag(e.target.value)} aria-label="Bedrag terug" /></span>
          </Veld>
          {nieuw && (
            <label className="schakel">
              <input type="checkbox" checked={perBank || Math.abs(bedrag ?? 0) > CASH_GRENS} disabled={Math.abs(bedrag ?? 0) > CASH_GRENS} onChange={(e) => setPerBank(e.target.checked)} />
              <span>Per overschrijving{Math.abs(bedrag ?? 0) > CASH_GRENS ? ` (boven ${euro(CASH_GRENS, true)} kan cash niet)` : ""}</span>
            </label>
          )}
          {!nieuw && <p className="zacht klein">Stukken van de klant teruggeven en per overschrijving terugbetalen kan pas na de update van de database.</p>}
        </section>
      )}
      {retours.length > 0 && !retourKeuze && <p className="zacht klein">Er werd al iets van deze transactie teruggenomen. Wil je alles terugdraaien, maak dan eerst die retour ongedaan.</p>}

      {t.status !== "ongedaan" && (
        <div className="knoppenrij onderaan">
          {terugbaar.length > 0 && !retourKeuze && <button className="knop zacht" onClick={() => setRetourKeuze(new Set(terugbaar.filter((x) => x.r.richting === "uit").map((x) => x.i)))}><Icoon naam="terug" maat={18} /> Retour of terugdraaien</button>}
          {retourKeuze && (() => {
            // Het bedrag in het veld is altijd positief; de richting volgt uit wat er teruggaat.
            const terug = bedrag == null ? null : (standaard < 0 ? -Math.abs(bedrag) : Math.abs(bedrag));
            return (
              <>
                <button className="knop" disabled={!gekozen.length || terug == null} onClick={() => {
                  const regelsIn = terugIn.map((r) => {
                    const ex = r.exemplaar_id ? huidig().exemplaren.find((e) => e.id === r.exemplaar_id) : null;
                    // Wat het was vóór de retour, om de retour later ongedaan te kunnen maken.
                    return { ...r, van: t.id, vorige_status: ex?.status ?? null, vorige_afgeboekt_op: ex?.afgeboekt_op ?? null, vorige_transactie_id: ex?.transactie_id ?? null };
                  });
                  const x = Math.round(terug! * 100) / 100;
                  const bank = nieuw && (perBank || Math.abs(x) > CASH_GRENS);
                  try {
                    const geboekt = retour(regelsIn, x, terugUit.map((r) => ({ ...r, van: t.id })), bank);
                    const hoe = bank ? "per overschrijving" : "cash";
                    meld(geboekt.status === "conflict" ? "Retour geboekt, maar niet alles kon terug: bekijk de transactie" : x > 0 ? `Retour: ${euro(x)} ${hoe} terug` : x < 0 ? `Teruggedraaid: klant betaalt ${euro(-x)} ${hoe}` : "Teruggedraaid zonder geld", geboekt.status === "conflict" ? "fout" : "ok");
                    setRetourKeuze(null);
                    setEigenBedrag(null);
                  } catch (e) {
                    meld(e instanceof Error ? e.message : String(e), "fout");
                  }
                }}>{terug == null ? "Bedrag?" : terug > 0 ? `${euro(terug)} ${perBank || Math.abs(terug) > CASH_GRENS ? "terug per overschrijving" : "cash terug"}` : terug < 0 ? `Klant betaalt ${euro(-terug)}` : "Terugdraaien"}</button>
                <button className="tekstknop" onClick={() => { setRetourKeuze(null); setEigenBedrag(null); }}>Annuleer</button>
              </>
            );
          })()}
          {!retourKeuze && !retours.length && magOngedaan(t) && <button className="knop zacht rood" onClick={() => { if (confirm("Deze transactie ongedaan maken? De voorraad en de kas gaan terug.")) ongedaanMaken(t.id); }}>Ongedaan maken</button>}
          {!retourKeuze && !magOngedaan(t) && <p className="zacht klein">Ongedaan maken kan enkel dezelfde dag: een vorige dag staat misschien al in Dexxter. {t.soort === "kas" ? "Boek vandaag een kasbeweging in de andere richting." : t.soort === "prive" ? "Draai het vandaag om met Privé ⇄ Bind'r." : "Draai het terug met een retour; die komt op vandaag."}</p>}
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
  const soortVan = useSoortVan();
  const b = s.beurzen.find((x) => x.id === id);
  if (!b) return null;
  const tr = s.transacties.filter((t) => t.beurs_id === b.id);
  const c = beursCijfers(b, tr);
  const o = beursOverzicht(tr, soortVan);
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
        <h3>Per soort</h3>
        {PRODUCTSOORTEN.filter((p) => o.verkocht[p.id].aantal > 0).map((p) => (
          <div key={p.id} className="afsluit-rij"><span>{p.label} verkocht</span><strong>{o.verkocht[p.id].aantal} · {euro(o.verkocht[p.id].bedrag)}</strong></div>
        ))}
        <div className="afsluit-rij"><span>Ingekocht</span><strong>{o.ingekocht.aantal} · {euro(o.ingekocht.bedrag)}</strong></div>
        <div className="afsluit-rij"><span>Ruil</span><strong>{o.trades.aantal} ({o.trades.weg} weg, {o.trades.binnen} binnen)</strong></div>
        {o.retour.aantal > 0 && <div className="afsluit-rij"><span>Retour</span><strong>{o.retour.aantal} · −{euro(o.retour.bedrag)}</strong></div>}
      </section>
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
  const [historiek, setHistoriek] = useState(false);
  return (
    <Sheet titel="Overzicht" onSluit={sluit} vol>
      <div className="rapport-raster">
        <Cijfer label="Catalogus" waarde={euro(st.catalogusWaarde, true)} sub={`${st.catalogus} stuks, hartjes`} />
        <Cijfer label="Vault" waarde={euro(vaultWaarde, true)} sub={`${vault.length} stuks, waarde`} />
        <Cijfer label="Artikels" waarde={euro(st.artikelenWaarde, true)} sub="in de catalogus" />
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
      <button className="knop zacht" onClick={() => setHistoriek(true)}><Icoon naam="historiek" maat={18} /> Alle transacties bekijken</button>
      {historiek && <BeurzenEnTransacties start="transacties" onSluit={() => setHistoriek(false)} />}
      <button className="knop zacht" onClick={() => downloadCsv(`bindr-transacties-${vandaag()}.csv`, s.transacties, s.beheerders, s.beurzen)}>Alle transacties als CSV</button>
    </Sheet>
  );
}

function downloadCsv(naam: string, transacties: Transactie[], beheerders: Record<string, string>, beurzen: Beurs[] = huidig().beurzen) {
  const beursNaam = Object.fromEntries(beurzen.map((b) => [b.id, b.naam]));
  const kop = ["datum", "tijd", "beurs", "soort", "status", "beheerder", "richting", "code", "naam", "aantal", "hartjesprijs", "prijs", "marktwaarde", "aankoopprijs", "transactie_totaal", "cash", "sumup", "overschrijving", "bewijs", "transactie_id"];
  const rijen: (string | number | null | undefined)[][] = [kop];
  for (const t of transacties.slice().sort((a, b) => a.tijd.localeCompare(b.tijd))) {
    const basis = [t.tijd.slice(0, 10), tijdKort(t.tijd), t.beurs_id ? beursNaam[t.beurs_id] ?? "" : "", t.soort, t.status, t.beheerder ? beheerders[t.beheerder] ?? "" : ""];
    const geld = [t.totaal, t.cash, t.sumup, t.bank ?? 0, heeftBewijs(t) ? bewijsNummer(t) : "", t.id];
    if (!t.regels.length) rijen.push([...basis, "", "", t.opmerking ?? kasOmschrijving(t), 1, null, 0, null, null, ...geld]);
    for (const r of t.regels) {
      rijen.push([...basis, r.richting, r.code ? toonCode(r.code) : "", r.naam, r.aantal ?? 1, r.hartjesprijs, r.prijs, r.referentie, r.aankoopprijs, ...geld]);
    }
  }
  bewaarCsv(naam, csv(rijen));
}
