import { useEffect, useMemo, useState } from "react";
import { bevestigLabel, kanNieuweBoekhouding, OUD_SCHEMA, openExemplaar, openToevoegen, print, sluit, useApp, wijzig, zetHartje } from "../state";
import type { Exemplaar } from "../types";
import { CONDITIES, TALEN, VARIANTEN } from "../types";
import { dagenGeleden, datumKort, euro, getal } from "../lib/format";
import { toonCode } from "../lib/code";
import { voorstelVoor } from "../lib/pricing";
import { labelDataUrl } from "../lib/label";
import { huidigeMaat } from "../lib/printer";
import { Badges, Hartje, Icoon, KaartFoto, Kiezer, OnderAankoop, onderAankoop, Sheet, Veld } from "./common";
import { MandjeActie } from "./MandjeActie";
import { PLAATS } from "../lib/categorie";
import { setIdVan, setNaam } from "../lib/weergave";
import { useSets } from "./Voorraad";
import { MarktBlok } from "./Markt";
import { kantelVrij } from "../lib/kantel";
import { VerkopenBlok } from "./Graded";
import { gradedZoektekst } from "../lib/markt";
import { FotoKiezer } from "./FotoKiezer";

export function ExemplaarSheet({ id }: { id: string }) {
  const { exemplaren, gids, instellingen, teWijzigen, printer } = useApp();
  const sets = useSets();
  const ex = exemplaren.find((e) => e.id === id);
  const [bewerk, setBewerk] = useState(false);
  const [geenFoto, setGeenFoto] = useState(false);
  if (!ex) return null;
  const voorstel = voorstelVoor(ex, gids, instellingen);
  const wijzigNodig = teWijzigen.get(ex.id);
  const duplicaten = exemplaren.filter((e) => e.id !== ex.id && ex.kaart_id && e.kaart_id === ex.kaart_id && e.status === "in voorraad");

  return (
    <Sheet titel={<><span className="code">{toonCode(ex.code)}</span></>} onSluit={sluit}
      actie={<button className="tekstknop" onClick={() => setBewerk(!bewerk)}>{bewerk ? "Klaar" : "Bewerk"}</button>}>
      <div className="detail-kop">
        <div className={`detail-foto zweeft${((ex.opslag === "vitrine" ? ex.hartjesprijs : ex.verkoopprijs) ?? 0) >= 50 ? " holo" : ""}`}>
          <div className="kantel-vlak" {...kantelVrij}>
            {ex.soort === "slab" ? (
              <div className="slab-hoes groot">
                <span className="slab-label"><b>{ex.grader || "Graded"}</b><em>{ex.grade}</em></span>
                <KaartFoto src={ex.afbeelding} kaart={ex} groot alt={ex.naam} onGeenFoto={setGeenFoto} />
              </div>
            ) : <KaartFoto src={ex.afbeelding} kaart={ex} groot alt={ex.naam} onGeenFoto={setGeenFoto} />}
            <span className="glans" />
          </div>
        </div>
        <div className="detail-titel">
          <h2>{ex.naam}</h2>
          {ex.naam_origineel && <div className="naam-origineel">{ex.naam_origineel}</div>}
          <div className="detail-set">{[sets ? setNaam(setIdVan(ex), ex.set_naam, sets) : ex.set_naam, [ex.set_code, ex.nummer].filter(Boolean).join(" ")].filter(Boolean).join(" · ")}</div>
          <Badges ex={ex} />
          <div className="detail-plaats">
            <OpslagKnop ex={ex} />
          </div>
        </div>
      </div>

      {(geenFoto || ex.foto || bewerk) && <EigenFoto ex={ex} geen={geenFoto} />}

      <MandjeActie ex={ex} />
      <KlantZiet ex={ex} />

      {wijzigNodig && (
        <div className={`melding-kaart ${wijzigNodig.richting}`}>
          <Icoon naam={wijzigNodig.richting === "op" ? "op" : "neer"} />
          <div>
            <strong>Nieuw hartje nodig: {euro(wijzigNodig.nieuw)}</strong>
            <span>Het huidige hartje ({euro(wijzigNodig.oud)}) dateert van {datumKort(ex.hartjesdatum)}.</span>
            {onderAankoop(wijzigNodig.nieuw, ex.aankoopprijs) && <span className="onder-aankoop-tip">Let op: dat is onder de aankoopprijs ({euro(ex.aankoopprijs)}). Misschien beter even naar de vault.</span>}
          </div>
        </div>
      )}

      <HartjeBlok ex={ex} voorstelPrijs={wijzigNodig?.nieuw ?? voorstel?.voorstel ?? null} />

      {ex.soort === "slab" && (
        <VerkopenBlok verkopen={ex.verkopen ?? []} grader={ex.grader} cert={ex.cert}
          zoek={gradedZoektekst({ naam: ex.naam, nummer: ex.nummer, grader: ex.grader, grade: ex.grade })}
          onChange={(verkopen) => void wijzig(ex.id, { verkopen }, undefined, true)} />
      )}
      {ex.soort !== "slab" && <MarktBlok cardmarketId={ex.cardmarket_id} variant={ex.variant} taal={ex.taal} setId={ex.kaart_id ? setIdVan(ex) : null} catalogus={ex.catalogus} soort={ex.soort}>
        {voorstel && (
          <div className="voorstel-rij">
            <span>Voorstel voor {ex.conditie ?? "NM"}{voorstel.factor !== 1 ? ` (${Math.round(voorstel.factor * 100)}%)` : ""}</span>
            <strong>{euro(voorstel.voorstel)}</strong>
          </div>
        )}
        {voorstel?.nakijken && <p className="nakijken">Trend en 30-dagengemiddelde wijken sterk af: even nakijken.</p>}
      </MarktBlok>}

      <LabelBlok ex={ex} printer={printer} />

      {bewerk ? <Bewerk ex={ex} /> : (
        <section className="blok">
          <h3>Aankoop</h3>
          <dl className="gegevens">
            <dt>Prijs</dt><dd>{euro(ex.aankoopprijs)}</dd>
            <dt>Datum</dt><dd>{datumKort(ex.aankoopdatum)}</dd>
            <dt>Bron</dt><dd>{ex.aankoopbron || "–"}</dd>
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
                  <span className="zacht">{PLAATS[d.opslag].naam}</span>
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

/**
 * Geen foto te vinden (bv. een nieuwe Japanse promo)? Neem er zelf een. Ze gaat voor op de
 * andere bronnen, ook op de klantenpagina. Liefst de kaart recht van voren, zonder sleeve.
 */
function EigenFoto({ ex, geen }: { ex: Exemplaar; geen: boolean }) {
  const kan = kanNieuweBoekhouding();
  return (
    <section className={`blok eigen-foto${geen && !ex.foto ? " geen" : ""}`}>
      <h3>{ex.foto ? "Eigen foto" : "Geen foto gevonden"}</h3>
      {!ex.foto && <p className="zacht klein">{kan ? "Neem een foto van de kaart, recht van voren. Ze komt ook op de klantenpagina." : OUD_SCHEMA}</p>}
      {kan && <FotoKiezer foto={ex.foto} max={560} wat="de kaart"
        onFoto={(foto) => void wijzig(ex.id, { foto }, foto ? "Foto bewaard" : "Foto weg", true)} />}
    </section>
  );
}

/** Ligt de kaart in de catalogus maar zien klanten ze (nog) niet? Zeg waarom. */
function KlantZiet({ ex }: { ex: Exemplaar }) {
  const { omgevingen } = useApp();
  if (ex.opslag !== "vitrine" || ex.status !== "in voorraad") return null;
  const redenen: string[] = [];
  if (ex.label_status === "te printen") redenen.push("het label is nog niet geprint");
  else if (ex.label_status === "geprint") redenen.push("het label is nog niet geplakt");
  if (ex.hartjesprijs == null) redenen.push("er staat nog geen hartje op");
  if (ex.nieuw_hartje != null) redenen.push("het hartje moet eerst wisselen");
  const omg = omgevingen.find((o) => o.id === ex.omgeving_id);
  if (omg && !omg.zichtbaar_voor_klanten) redenen.push(`${omg.naam} staat niet op de klantenpagina`);
  if (!redenen.length) return null;
  return (
    <div className="klant-ziet">
      <Icoon naam="oog" maat={18} />
      <span>Klanten zien deze kaart nog niet: {redenen.join(", ")}.</span>
      {ex.label_status === "geprint" && <button className="tekstknop klein" onClick={() => bevestigLabel(ex)}>Label is geplakt</button>}
    </div>
  );
}

function OpslagKnop({ ex }: { ex: Exemplaar }) {
  const naarVitrine = ex.opslag === "stockdoos";
  const [vraag, setVraag] = useState<number | null>(null);
  useEffect(() => setVraag(null), [ex.id, ex.opslag]);
  const naarCatalogus = (p: number | null) => {
    if (ex.hartjesprijs == null) {
      void wijzig(ex.id, { opslag: "vitrine", hartjesprijs: p, hartjesdatum: p != null ? new Date().toISOString().slice(0, 10) : null }, "Naar de catalogus. Schrijf het hartje en kijk de prijs na.", true);
    } else {
      void wijzig(ex.id, { opslag: "vitrine" }, "Naar de catalogus", true);
    }
  };
  const klik = () => {
    if (!naarVitrine) return void wijzig(ex.id, { opslag: "stockdoos" }, "Naar de vault", true);
    const p = ex.hartjesprijs ?? ex.verkoopprijs ?? null;
    if (onderAankoop(p, ex.aankoopprijs)) return setVraag(p);
    naarCatalogus(p);
  };
  return (
    <>
      <button className={`plaats ${ex.opslag}`} onClick={klik}>
        <Icoon naam={ex.opslag === "vitrine" ? "vitrine" : "doos"} maat={18} />
        <span className="plaats-tekst">
          <strong>{PLAATS[ex.opslag].lang}</strong>
          <span>{naarVitrine ? "Tik om naar de catalogus te verplaatsen" : "Tik om naar de vault te verplaatsen"}</span>
        </span>
      </button>
      {vraag != null && (
        <OnderAankoop prijs={vraag} aankoop={ex.aankoopprijs!} vaultTekst="Laat in de vault"
          uitleg={`Jullie betaalden ${euro(ex.aankoopprijs)}. In de catalogus komt ze met dat hartje onder de aankoopprijs. Even laten liggen?`}
          onVault={() => setVraag(null)} onToch={() => { setVraag(null); naarCatalogus(vraag); }} />
      )}
    </>
  );
}

function HartjeBlok({ ex, voorstelPrijs }: { ex: Exemplaar; voorstelPrijs: number | null }) {
  const [invoer, setInvoer] = useState("");
  const [open, setOpen] = useState(false);
  useEffect(() => { setOpen(false); setInvoer(""); }, [ex.id]);
  const leeftijd = dagenGeleden(ex.hartjesdatum);
  const vitrine = ex.opslag === "vitrine";
  // Hartje onder de aankoopprijs? Eerst vragen of dat klopt, of de kaart beter naar de vault gaat.
  const [twijfel, setTwijfel] = useState<{ prijs: number; handmatig: boolean } | null>(null);
  useEffect(() => setTwijfel(null), [ex.id]);
  const bewaar = (prijs: number, handmatig: boolean) => {
    // In de vitrine hoort bij elke prijs een geschreven hartje; in de stockdoos enkel de verkoopprijs.
    if (vitrine) void zetHartje(ex.id, prijs, handmatig);
    else void wijzig(ex.id, { verkoopprijs: prijs, prijs_handmatig: handmatig }, `Verkoopprijs ${prijs} euro bewaard`, true);
    setOpen(false);
    setTwijfel(null);
  };
  const opslaan = (handmatig: boolean) => {
    const p = getal(invoer);
    if (p == null || p < 0) return;
    const prijs = Math.round(p);
    if (vitrine && onderAankoop(prijs, ex.aankoopprijs)) return setTwijfel({ prijs, handmatig });
    bewaar(prijs, handmatig);
  };
  const naarVault = (prijs: number, handmatig: boolean) => {
    void wijzig(ex.id, { opslag: "stockdoos", verkoopprijs: prijs, prijs_handmatig: handmatig },
      "Naar de vault. Haal het hartje van de sleeve; ze wacht daar tot ze weer meer waard is.", true);
    setOpen(false);
    setTwijfel(null);
  };
  return (
    <section className="blok hartje-blok">
      <div className="hartje-rij">
        <div>
          <h3>{ex.opslag === "vitrine" ? "Prijs op het hartje" : "Waarde in de vault"}</h3>
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
      {open && twijfel && (
        <OnderAankoop prijs={twijfel.prijs} aankoop={ex.aankoopprijs!}
          onVault={() => naarVault(twijfel.prijs, twijfel.handmatig)}
          onToch={() => bewaar(twijfel.prijs, twijfel.handmatig)}
          onAnders={() => setTwijfel(null)} />
      )}
      {open && !twijfel && (
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
    opmerking: ex.opmerking ?? "",
    verkoopprijs: ex.verkoopprijs?.toString() ?? "",
  });
  const bewaar = () => {
    void wijzig(ex.id, {
      naam: v.naam.trim() || ex.naam, conditie: v.conditie, taal: v.taal, variant: v.variant,
      aankoopprijs: getal(v.aankoopprijs), aankoopbron: v.aankoopbron.trim() || null, opmerking: v.opmerking.trim() || null,
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
      <Veld label="Opmerking"><textarea rows={2} value={v.opmerking} onChange={(e) => setV({ ...v, opmerking: e.target.value })} /></Veld>
      <button className="knop" onClick={bewaar}>Bewaar</button>
    </section>
  );
}

function UitVoorraad({ ex }: { ex: Exemplaar }) {
  const [open, setOpen] = useState(false);
  if (ex.status !== "in voorraad") return null;
  if (!open) return <button className="knop zacht rood" onClick={() => setOpen(true)}><Icoon naam="uit" maat={18} /> Uit voorraad</button>;
  return (
    <div className="uit-keuze">
      <p className="zacht">Verkopen en ruilen gaan via de kassa (In het mandje). Hier haal je een kaart uit de voorraad zonder verkoop: kwijt, beschadigd of voor de eigen collectie.</p>
      <div className="knoppenrij">
        <button className="knop zacht rood" onClick={() => { void wijzig(ex.id, { status: "weg", afgeboekt_op: new Date().toISOString() }, "Uit de voorraad gehaald", true); sluit(); }}>Uit voorraad halen</button>
        <button className="tekstknop" onClick={() => setOpen(false)}>Annuleer</button>
      </div>
    </div>
  );
}
