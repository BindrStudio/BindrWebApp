import { useEffect, useMemo, useState } from "react";
import { openExemplaar, openToevoegen, print, sluit, useApp, wijzig, zetHartje } from "../state";
import type { Exemplaar } from "../types";
import { CONDITIES, TALEN, VARIANTEN } from "../types";
import { dagenGeleden, datumKort, euro, getal } from "../lib/format";
import { toonCode } from "../lib/code";
import { voorstelVoor } from "../lib/pricing";
import { labelDataUrl } from "../lib/label";
import { huidigeMaat } from "../lib/printer";
import { Badges, Hartje, Icoon, KaartFoto, Kiezer, Sheet, Veld } from "./common";

export function ExemplaarSheet({ id }: { id: string }) {
  const { exemplaren, gids, instellingen, teWijzigen, printer } = useApp();
  const ex = exemplaren.find((e) => e.id === id);
  const [bewerk, setBewerk] = useState(false);
  if (!ex) return null;
  const voorstel = voorstelVoor(ex, gids, instellingen);
  const wijzigNodig = teWijzigen.get(ex.id);
  const duplicaten = exemplaren.filter((e) => e.id !== ex.id && ex.kaart_id && e.kaart_id === ex.kaart_id && (e.status === "in voorraad" || e.status === "gereserveerd"));

  return (
    <Sheet titel={<><span className="code">{toonCode(ex.code)}</span></>} onSluit={sluit}
      actie={<button className="tekstknop" onClick={() => setBewerk(!bewerk)}>{bewerk ? "Klaar" : "Bewerk"}</button>}>
      <div className="detail-kop">
        <KaartFoto src={ex.afbeelding?.replace("/low.webp", "/high.webp") ?? null} alt={ex.naam} />
        <div className="detail-titel">
          <h2>{ex.naam}</h2>
          {ex.naam_origineel && <div className="naam-origineel">{ex.naam_origineel}</div>}
          <div className="detail-set">{[ex.set_naam, [ex.set_code, ex.nummer].filter(Boolean).join(" ")].filter(Boolean).join(" · ")}</div>
          <Badges ex={ex} />
          <div className="detail-plaats">
            <OpslagKnop ex={ex} />
          </div>
        </div>
      </div>

      {wijzigNodig && (
        <div className={`melding-kaart ${wijzigNodig.richting}`}>
          <Icoon naam={wijzigNodig.richting === "op" ? "op" : "neer"} />
          <div>
            <strong>Nieuw hartje nodig: {euro(wijzigNodig.nieuw)}</strong>
            <span>Het huidige hartje ({euro(wijzigNodig.oud)}) dateert van {datumKort(ex.hartjesdatum)}.</span>
          </div>
        </div>
      )}

      <HartjeBlok ex={ex} voorstelPrijs={wijzigNodig?.nieuw ?? voorstel?.voorstel ?? null} />

      <section className="blok">
        <h3>Cardmarket</h3>
        {voorstel ? (
          <div className="prijsrij">
            <Stat label="Trend" waarde={euro(voorstel.trend)} />
            <Stat label="Laagste" waarde={euro(voorstel.laagste)} />
            <Stat label="Gem. 30 d" waarde={euro(voorstel.gem30)} />
            <Stat label="Voorstel" waarde={euro(voorstel.voorstel)} nadruk />
          </div>
        ) : (
          <p className="zacht">
            {ex.soort !== "kaart" ? "Slabs en eigen producten prijs je zelf." :
              !ex.cardmarket_id ? "Geen Cardmarket-koppeling voor deze kaart: prijs zelf." :
              !["EN", "JP"].includes(ex.taal) ? "De prijsgids geeft geen prijs per taal: prijs deze kaart zelf." :
              "Nog geen prijs in de gids voor deze kaart."}
          </p>
        )}
        {voorstel?.nakijken && <p className="nakijken">Trend en 30-dagengemiddelde wijken sterk af: even nakijken.</p>}
        {voorstel && voorstel.factor !== 1 && <p className="zacht">Voorstel met conditie {ex.conditie} ({Math.round(voorstel.factor * 100)}%).</p>}
        {gids && <p className="zacht klein">Prijsgids van {datumKort(gids.datum)}{voorstel?.holo ? " · holo-prijs" : ""}</p>}
        {ex.cardmarket_id && (
          <a className="link" href={`https://www.cardmarket.com/en/Pokemon/Products?idProduct=${ex.cardmarket_id}`} target="_blank" rel="noreferrer">
            Bekijk op Cardmarket <Icoon naam="pijlRechts" maat={14} />
          </a>
        )}
      </section>

      <LabelBlok ex={ex} printer={printer} />

      {bewerk ? <Bewerk ex={ex} /> : (
        <section className="blok">
          <h3>Aankoop</h3>
          <dl className="gegevens">
            <dt>Prijs</dt><dd>{euro(ex.aankoopprijs)}</dd>
            <dt>Datum</dt><dd>{datumKort(ex.aankoopdatum)}</dd>
            <dt>Bron</dt><dd>{ex.aankoopbron || "–"}</dd>
            {ex.status === "gereserveerd" && <><dt>Gereserveerd</dt><dd>{ex.gereserveerd_voor || "ja"}</dd></>}
            {ex.opmerking && <><dt>Opmerking</dt><dd>{ex.opmerking}</dd></>}
          </dl>
        </section>
      )}

      {duplicaten.length > 0 && (
        <section className="blok">
          <h3>Andere exemplaren van deze kaart ({duplicaten.length})</h3>
          <ul className="lijst">
            {duplicaten.map((d) => (
              <li key={d.id}>
                <button className="lijst-knop" onClick={() => openExemplaar(d.id)}>
                  <span className="code">{toonCode(d.code)}</span>
                  <Badges ex={d} />
                  <span className="zacht">{d.opslag}</span>
                  <span className="rechts">{d.opslag === "vitrine" ? euro(d.hartjesprijs) : euro(d.verkoopprijs)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="knoppenrij onderaan">
        {ex.kaart_id && <button className="knop zacht" onClick={() => openToevoegen(ex.kaart_id!, ex.catalogus || "en")}><Icoon naam="plus" maat={18} /> Nog een exemplaar</button>}
        <UitVoorraad ex={ex} />
      </div>
    </Sheet>
  );
}

function Stat({ label, waarde, nadruk }: { label: string; waarde: string; nadruk?: boolean }) {
  return <div className={`stat${nadruk ? " nadruk" : ""}`}><span>{label}</span><strong>{waarde}</strong></div>;
}

function OpslagKnop({ ex }: { ex: Exemplaar }) {
  const naarVitrine = ex.opslag === "stockdoos";
  return (
    <button className={`plaats ${ex.opslag}`} onClick={() => {
      if (naarVitrine && ex.hartjesprijs == null) {
        const p = ex.verkoopprijs ?? null;
        void wijzig(ex.id, { opslag: "vitrine", hartjesprijs: p, hartjesdatum: p != null ? new Date().toISOString().slice(0, 10) : null }, "Naar de vitrine. Schrijf het hartje en kijk de prijs na.", true);
      } else {
        void wijzig(ex.id, { opslag: naarVitrine ? "vitrine" : "stockdoos" }, naarVitrine ? "Naar de vitrine" : "Naar de stockdoos", true);
      }
    }}>
      <Icoon naam={ex.opslag === "vitrine" ? "vitrine" : "doos"} maat={18} />
      <span className="plaats-tekst">
        <strong>{ex.opslag === "vitrine" ? "In de vitrine" : "In de stockdoos"}</strong>
        <span>{naarVitrine ? "Tik om naar de vitrine te verplaatsen" : "Tik om naar de stockdoos te verplaatsen"}</span>
      </span>
    </button>
  );
}

function HartjeBlok({ ex, voorstelPrijs }: { ex: Exemplaar; voorstelPrijs: number | null }) {
  const [invoer, setInvoer] = useState("");
  const [open, setOpen] = useState(false);
  useEffect(() => { setOpen(false); setInvoer(""); }, [ex.id]);
  const leeftijd = dagenGeleden(ex.hartjesdatum);
  const vitrine = ex.opslag === "vitrine";
  const opslaan = (handmatig: boolean) => {
    const p = getal(invoer);
    if (p == null || p < 0) return;
    // In de vitrine hoort bij elke prijs een geschreven hartje; in de stockdoos enkel de verkoopprijs.
    if (vitrine) void zetHartje(ex.id, Math.round(p), handmatig);
    else void wijzig(ex.id, { verkoopprijs: Math.round(p), prijs_handmatig: handmatig }, `Verkoopprijs ${Math.round(p)} euro bewaard`, true);
    setOpen(false);
  };
  return (
    <section className="blok hartje-blok">
      <div className="hartje-rij">
        <div>
          <h3>{ex.opslag === "vitrine" ? "Prijs op het hartje" : "Verkoopprijs"}</h3>
          <div className="hartje-groot">
            {ex.opslag === "vitrine" ? <Hartje prijs={ex.hartjesprijs} groot /> : <span className="waarde groot">{euro(ex.verkoopprijs)}</span>}
            {ex.prijs_handmatig && <span className="slot" title="Eigen prijs: de herprijsknop slaat deze kaart over"><Icoon naam="slot" maat={16} /> eigen prijs</span>}
          </div>
          {ex.opslag === "vitrine" && ex.hartjesdatum && (
            <p className="zacht">Geschreven op {datumKort(ex.hartjesdatum)}{leeftijd === 0 ? " (vandaag)" : leeftijd === 1 ? " (gisteren)" : leeftijd != null ? ` (${leeftijd} dagen geleden)` : ""}</p>
          )}
        </div>
        {!open && <button className="knop klein" onClick={() => { setInvoer(String(voorstelPrijs ?? ex.hartjesprijs ?? ex.verkoopprijs ?? "")); setOpen(true); }}>{vitrine ? "Nieuw hartje" : "Prijs wijzigen"}</button>}
      </div>
      {open && (
        <div className="hartje-invoer">
          <div className="euro-invoer">
            <span>€</span>
            <input autoFocus inputMode="numeric" value={invoer} onChange={(e) => setInvoer(e.target.value)} onKeyDown={(e) => e.key === "Enter" && opslaan(ex.prijs_handmatig)} />
          </div>
          <div className="knoppenrij">
            <button className="knop" onClick={() => opslaan(voorstelPrijs != null && getal(invoer) !== voorstelPrijs ? true : ex.prijs_handmatig)}>{vitrine ? "Bewaar hartje" : "Bewaar prijs"}</button>
            <button className="knop zacht" onClick={() => setOpen(false)}>Annuleer</button>
          </div>
          {voorstelPrijs != null && <p className="zacht klein">Wijk je af van het voorstel ({euro(voorstelPrijs)}), dan krijgt de kaart een slotje: de herprijsknop stelt ze dan niet meer voor.</p>}
        </div>
      )}
      {ex.prijs_handmatig && (
        <button className="tekstknop" onClick={() => void wijzig(ex.id, { prijs_handmatig: false }, "Slotje eraf: de herprijsknop kijkt deze kaart weer na")}>
          <Icoon naam="slotOpen" maat={16} /> Slotje eraf
        </button>
      )}
    </section>
  );
}

function LabelBlok({ ex, printer }: { ex: Exemplaar; printer: string | null }) {
  const { instellingen } = useApp();
  const voorbeeld = useMemo(() => {
    try { return labelDataUrl(ex, huidigeMaat(instellingen.labelMaat)); } catch { return null; }
  }, [ex.code, ex.naam, ex.set_code, ex.nummer, ex.conditie, ex.taal, ex.variant, ex.grader, ex.grade, ex.soort, instellingen.labelMaat, printer]);
  const status = { "te printen": "Nog te printen", geprint: "Geprint, nog niet gescand na het plakken", gestickerd: "Hangt op de kaart" }[ex.label_status];
  return (
    <section className="blok">
      <h3>QR-label</h3>
      {voorbeeld && <img className="label-voorbeeld" src={voorbeeld} alt={`Label ${toonCode(ex.code)}`} />}
      <p className="zacht">{status}</p>
      <div className="knoppenrij">
        <button className="knop" onClick={() => void print([ex.id])}><Icoon naam="printer" maat={18} /> Print label</button>
        {ex.label_status !== "gestickerd" && (
          <button className="knop zacht" onClick={() => void wijzig(ex.id, { label_status: "gestickerd" }, "Label staat op geplakt")}>Label hangt erop</button>
        )}
      </div>
      {!printer && <p className="zacht klein">De eerste keer kies je de printer in het Bluetooth-venster.</p>}
      {voorbeeld && <a className="tekstknop klein" href={voorbeeld} download={`label-${ex.code}.png`}>Label als afbeelding bewaren</a>}
    </section>
  );
}

function Bewerk({ ex }: { ex: Exemplaar }) {
  const [v, setV] = useState({
    naam: ex.naam, conditie: ex.conditie || "NM", taal: ex.taal, variant: ex.variant,
    aankoopprijs: ex.aankoopprijs?.toString() ?? "", aankoopbron: ex.aankoopbron ?? "",
    opmerking: ex.opmerking ?? "", gereserveerd: ex.status === "gereserveerd", gereserveerd_voor: ex.gereserveerd_voor ?? "",
    verkoopprijs: ex.verkoopprijs?.toString() ?? "",
  });
  const bewaar = () => {
    void wijzig(ex.id, {
      naam: v.naam.trim() || ex.naam, conditie: v.conditie, taal: v.taal, variant: v.variant,
      aankoopprijs: getal(v.aankoopprijs), aankoopbron: v.aankoopbron.trim() || null, opmerking: v.opmerking.trim() || null,
      status: v.gereserveerd ? "gereserveerd" : ex.status === "gereserveerd" ? "in voorraad" : ex.status, gereserveerd_voor: v.gereserveerd ? v.gereserveerd_voor.trim() || null : null,
      ...(ex.opslag === "stockdoos" ? { verkoopprijs: getal(v.verkoopprijs) } : {}),
    }, "Wijzigingen bewaard", true);
  };
  return (
    <section className="blok formulier">
      <h3>Bewerken</h3>
      <Veld label="Naam (Engels, ook op het label)"><input value={v.naam} onChange={(e) => setV({ ...v, naam: e.target.value })} /></Veld>
      <Veld label="Conditie"><Kiezer waarde={v.conditie} opties={CONDITIES} onKies={(c) => setV({ ...v, conditie: c })} /></Veld>
      <Veld label="Taal">
        <select value={v.taal} onChange={(e) => setV({ ...v, taal: e.target.value })}>
          {TALEN.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
        </select>
      </Veld>
      <Veld label="Variant"><Kiezer waarde={v.variant} opties={VARIANTEN} onKies={(c) => setV({ ...v, variant: c })} /></Veld>
      {ex.opslag === "stockdoos" && <Veld label="Waarde / verkoopprijs (€)"><input inputMode="decimal" value={v.verkoopprijs} onChange={(e) => setV({ ...v, verkoopprijs: e.target.value })} /></Veld>}
      <Veld label="Aankoopprijs (€)"><input inputMode="decimal" value={v.aankoopprijs} onChange={(e) => setV({ ...v, aankoopprijs: e.target.value })} /></Veld>
      <Veld label="Aankoopbron"><input value={v.aankoopbron} onChange={(e) => setV({ ...v, aankoopbron: e.target.value })} placeholder="beurs, particulier, ruil…" /></Veld>
      <label className="schakel">
        <input type="checkbox" checked={v.gereserveerd} onChange={(e) => setV({ ...v, gereserveerd: e.target.checked })} />
        <span>Gereserveerd</span>
      </label>
      {v.gereserveerd && <Veld label="Voor wie (bv. Instagram-naam)"><input value={v.gereserveerd_voor} onChange={(e) => setV({ ...v, gereserveerd_voor: e.target.value })} /></Veld>}
      <Veld label="Opmerking"><textarea rows={2} value={v.opmerking} onChange={(e) => setV({ ...v, opmerking: e.target.value })} /></Veld>
      <button className="knop" onClick={bewaar}>Bewaar</button>
    </section>
  );
}

function UitVoorraad({ ex }: { ex: Exemplaar }) {
  const [open, setOpen] = useState(false);
  if (!open) return <button className="knop zacht rood" onClick={() => setOpen(true)}><Icoon naam="uit" maat={18} /> Uit voorraad</button>;
  const zet = (status: Exemplaar["status"], tekst: string) => {
    void wijzig(ex.id, { status }, tekst, true);
    sluit();
  };
  return (
    <div className="uit-keuze">
      <p className="zacht">Verkopen aan de stand komt in de beursmodus (fase 2). Nu kun je een kaart enkel uit de voorraad halen:</p>
      <div className="knoppenrij">
        <button className="knop zacht" onClick={() => zet("verkocht", "Als verkocht gemarkeerd")}>Verkocht</button>
        <button className="knop zacht" onClick={() => zet("geruild", "Als geruild gemarkeerd")}>Geruild</button>
        <button className="knop zacht" onClick={() => zet("weg", "Uit de voorraad gehaald")}>Weg</button>
        <button className="tekstknop" onClick={() => setOpen(false)}>Annuleer</button>
      </div>
    </div>
  );
}
