import { useEffect, useState, type ReactNode } from "react";
import { useApp } from "../state";
import type { Catalogus } from "../types";
import { TALEN } from "../types";
import { datumKort, euro } from "../lib/format";
import { laadCatalogus } from "../lib/catalog";
import { marktprijs } from "../lib/pricing";
import { cardmarketKentTaal, cardmarketLink, grapje, NIET_OP_CARDMARKET, marktinfo, procent, RICHTING_TEKST, setGrapje, setTrend, type Richting, type SetTrend } from "../lib/markt";
import { Icoon } from "./common";

const TALEN_MET_GIDS = new Set(["EN", "JP"]);

/**
 * Alles wat de Cardmarket-prijsgids zegt over een kaart: prijzen, stijgt of daalt het
 * (met een grapje), hoe de set beweegt, en een link naar de goedkoopste aanbiedingen in BE en NL.
 */
export function MarktBlok({ cardmarketId, variant, taal, setId, catalogus, soort = "kaart", children }: {
  cardmarketId: number | null;
  variant: string;
  taal: string;
  setId?: string | null;
  catalogus?: Catalogus | null;
  soort?: string;
  children?: ReactNode;
}) {
  const { gids } = useApp();
  const info = TALEN_MET_GIDS.has(taal) ? marktinfo(cardmarketId, variant, gids) : null;
  const markt = info ? marktprijs(info) : null;
  const [set, setSet] = useState<{ naam: string; trend: SetTrend | null } | null>(null);

  useEffect(() => {
    setSet(null);
    if (!setId || !catalogus || !gids) return;
    let weg = false;
    laadCatalogus(catalogus).then((idx) => {
      const kaarten = idx.kaarten.filter((k) => k.setId === setId);
      const ids = kaarten.map((k) => k.cardmarket).filter((x): x is number => !!x);
      if (!weg) setSet({ naam: kaarten[0]?.setNaam || setId, trend: setTrend(ids, gids) });
    }).catch(() => undefined);
    return () => { weg = true; };
  }, [setId, catalogus, gids]);

  const taalNaam = TALEN.find((t) => t.code === taal)?.label ?? taal;
  const reden = soort !== "kaart" ? "Slabs en eigen producten staan niet in de prijsgids: prijs zelf."
    : !cardmarketId ? "Geen Cardmarket-koppeling voor deze kaart: prijs zelf."
    : !TALEN_MET_GIDS.has(taal) ? "De prijsgids geeft geen prijs per taal: de cijfers gelden enkel voor Engels en Japans."
    : !gids ? "Nog geen prijsgids geladen." : "Nog geen prijs in de gids voor deze kaart.";

  return (
    <section className="blok markt">
      <div className="markt-kop">
        <h3>Cardmarket</h3>
        {gids && <span className="zacht klein">prijsgids {datumKort(gids.datum)}{info?.holo ? " · holo" : ""}</span>}
      </div>
      {info ? (
        <>
          {markt != null && (
            <div className="marktprijs">
              <span>Marktprijs (NM)</span>
              <strong>{euro(markt)}</strong>
              <em>De middelste van trend, week en maand: één uitschieter trekt de prijs niet mee.</em>
            </div>
          )}
          <div className="prijsrij">
            <Stat label="Trend" waarde={euro(info.trend)} />
            <Stat label="Laagste" waarde={euro(info.laagste)} />
            <Stat label="Gem. 7 d" waarde={euro(info.gem7)} />
            <Stat label="Gem. 30 d" waarde={euro(info.gem30)} />
          </div>
          {info.richting ? (
            <div className={`trend-kaart ${info.richting}`}>
              <span className="trend-pijl"><TrendPijl r={info.richting} /></span>
              <div>
                <strong>{RICHTING_TEKST[info.richting]} {info.verandering != null && <span>{procent(info.verandering)}</span>}</strong>
                <span className="grapje">{grapje(info.richting, cardmarketId ?? "")}</span>
                <em>{info.basis === "week" ? "Gemiddelde van deze week tegenover de maand" : "Trend tegenover het gemiddelde van de maand"}</em>
              </div>
            </div>
          ) : (
            <p className="zacht klein">Te weinig prijsgegevens (of te goedkoop) om een richting te geven.</p>
          )}
        </>
      ) : (
        <p className="zacht">{reden}</p>
      )}
      {set?.trend && (
        <div className={`set-trend ${set.trend.richting}`}>
          <TrendPijl r={set.trend.richting} klein />
          <span>Set <strong>{set.naam}</strong>: {RICHTING_TEKST[set.trend.richting].toLowerCase()} {procent(set.trend.verandering)}
            <span className="set-grapje">{setGrapje(set.trend.richting, set.naam)}</span></span>
          <em>{set.trend.kaarten} kaarten</em>
        </div>
      )}
      {children}
      {cardmarketId && (
        <div className="cm-links">
          <a className="knop zacht cm-knop" href={cardmarketLink(cardmarketId, taal)} target="_blank" rel="noreferrer">
            Goedkoopste in België en Nederland <Icoon naam="link" maat={16} />
          </a>
          {!cardmarketKentTaal(taal) && <span className="zacht klein">{NIET_OP_CARDMARKET}</span>}
          <span className="zacht klein">
            Near Mint · {cardmarketKentTaal(taal) ? taalNaam : "alle talen"} · enkel{" "}
            <a href={cardmarketLink(cardmarketId, taal, ["BE"])} target="_blank" rel="noreferrer">België</a>{" "}of{" "}
            <a href={cardmarketLink(cardmarketId, taal, ["NL"])} target="_blank" rel="noreferrer">Nederland</a>
          </span>
        </div>
      )}
    </section>
  );
}

export function Stat({ label, waarde, nadruk }: { label: string; waarde: string; nadruk?: boolean }) {
  return <div className={`stat${nadruk ? " nadruk" : ""}`}><span>{label}</span><strong>{waarde}</strong></div>;
}

function TrendPijl({ r, klein = false }: { r: Richting; klein?: boolean }) {
  const d = r === "stabiel" ? "M4 12h15m-4-4 4 4-4 4"
    : r === "op" ? "M6 17 17 6M9 6h8v8"
    : r === "hard-op" ? "M7 11l5-5 5 5M7 18l5-5 5 5"
    : r === "neer" ? "M6 7l11 11M17 10v8H9"
    : "M7 6l5 5 5-5M7 13l5 5 5-5";
  const m = klein ? 16 : 22;
  return <svg width={m} height={m} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;
}
