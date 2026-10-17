import { useEffect, useMemo, useRef, useState } from "react";
import { annuleerReservering, bevestigLabel, kanNieuweBoekhouding, kanReserveren, meld, OUD_SCHEMA, openExemplaar, openToevoegen, print, prive, reserveer, SCHEMA_016, sluit, useApp, wijzig, zetHartje } from "../state";
import type { Exemplaar } from "../types";
import { CONDITIES, TALEN, VARIANTEN } from "../types";
import { dagenGeleden, datumKort, euro, getal, vandaag } from "../lib/format";
import { toonCode } from "../lib/code";
import { actieveReservering, inVoorraad, krijgtLabel, reserveringVerlopen } from "../lib/exemplaar";
import { NAKIJKEN, voorstelVoor } from "../lib/pricing";
import { labelDataUrl } from "../lib/label";
import { huidigeMaat } from "../lib/printer";
import { Badges, FotoGroot, Hartje, Icoon, KaartFoto, Kiezer, OnderAankoop, onderAankoop, Sheet, Veld } from "./common";
import { MandjeActie } from "./MandjeActie";
import { PLAATS } from "../lib/categorie";
import { setIdVan, setNaam } from "../lib/weergave";
import { useSets } from "./Voorraad";
import { MarktBlok } from "./Markt";
import { kantelVrij } from "../lib/kantel";
import { VerkopenBlok } from "./Graded";
import { gradedZoektekst } from "../lib/markt";
import { FotoKiezer } from "./FotoKiezer";
import { BewijsSheet, waarGekocht } from "./Boekhouding";
import { verwervingen } from "../lib/boekhouding";
import { regelUit } from "../lib/kassa";
import { bewijsNummer, heeftBewijs } from "../lib/boekhouding";

export function ExemplaarSheet({ id }: { id: string }) {
  const { exemplaren, gids, instellingen, teWijzigen, printer } = useApp();
  const sets = useSets();
  const ex = exemplaren.find((e) => e.id === id);
  const [bewerk, setBewerk] = useState(false);
  const [geenFoto, setGeenFoto] = useState(false);
  const [groot, setGroot] = useState(false);
  // Tikken (niet draaien) op de foto toont hem in het groot.
  const tik = useRef<{ x: number; y: number; t: number } | null>(null);
  if (!ex) return null;
  const voorstel = voorstelVoor(ex, gids, instellingen);
  const wijzigNodig = teWijzigen.get(ex.id);
  const duplicaten = exemplaren.filter((e) => e.id !== ex.id && ex.kaart_id && e.kaart_id === ex.kaart_id && e.status === "in voorraad");

  return (
    <Sheet titel={<><span className="code">{toonCode(ex.code)}</span></>} onSluit={sluit}
      actie={<button className="tekstknop" onClick={() => setBewerk(!bewerk)}>{bewerk ? "Klaar" : "Bewerk"}</button>}>
      <div className="detail-kop">
        <div className={`detail-foto zweeft${((ex.opslag === "vitrine" ? ex.hartjesprijs : ex.verkoopprijs) ?? 0) >= 50 ? " holo" : ""}`}
          role="button" tabIndex={0} aria-label={`${ex.naam} in het groot`}
          onPointerDown={(e) => { tik.current = { x: e.clientX, y: e.clientY, t: Date.now() }; }}
          onPointerUp={(e) => { const s0 = tik.current; tik.current = null; if (s0 && Math.hypot(e.clientX - s0.x, e.clientY - s0.y) < 10 && Date.now() - s0.t < 500 && !geenFoto) setGroot(true); }}
          onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && !geenFoto) { e.preventDefault(); setGroot(true); } }}>
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

      {groot && <FotoGroot src={ex.afbeelding} kaart={ex} alt={ex.naam} onSluit={() => setGroot(false)}
        onderschrift={<><strong>{ex.naam}</strong><span>{[ex.set_code, ex.nummer].filter(Boolean).join(" ")}{ex.taal ? ` · ${ex.taal}` : ""}</span></>} />}
      {(geenFoto || ex.foto || bewerk) && <EigenFoto ex={ex} geen={geenFoto} />}

      <ReserveerBlok ex={ex} />
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
        {voorstel?.nakijken && <p className="nakijken">Even nakijken. {voorstel.waarom.map((w) => NAKIJKEN[w]).join(" ")}</p>}
      </MarktBlok>}

      {krijgtLabel(ex) && <LabelBlok ex={ex} printer={printer} />}

      {bewerk ? <Bewerk ex={ex} /> : <Herkomst ex={ex} />}

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
 * Reserveren: een kaart achterhouden voor iemand (een vriend, iemand die via Instagram vroeg), aan een afgesproken
 * prijs. Ze gaat uit de catalogus naar de vault; in de kassa krijgt ze die prijs en zegt de app voor wie ze is.
 */
function ReserveerBlok({ ex }: { ex: Exemplaar }) {
  const res = actieveReservering(ex);
  const [open, setOpen] = useState(false);
  const [voor, setVoor] = useState("");
  const [prijs, setPrijs] = useState("");
  const [tot, setTot] = useState("");
  const [opmerking, setOpmerking] = useState("");
  if (!inVoorraad(ex)) return null;
  if (res) {
    const verlopen = reserveringVerlopen(res, vandaag());
    return (
      <div className={`reservering-kaart${verlopen ? " verlopen" : ""}`}>
        <Icoon naam="slot" maat={20} />
        <div>
          <strong>Gereserveerd voor {res.voor}</strong>
          <span>
            {res.prijs != null ? `Afgesproken prijs ${euro(res.prijs)}` : "Aan de gewone prijs"}
            {res.tot ? ` · ${verlopen ? "verlopen op" : "tot"} ${datumKort(res.tot)}` : ""} · sinds {datumKort(res.op)}
          </span>
          {res.opmerking && <span className="zacht">{res.opmerking}</span>}
          <span className="zacht klein">Ze ligt in de vault en staat niet op de klantenpagina. Komt {res.voor} ze halen: tik op Verkopen aan {res.voor}.</span>
          <div className="knoppenrij">
            {res.vorige_opslag === "vitrine" && <button className="knop zacht klein" onClick={() => annuleerReservering(ex, true)}>Opheffen, terug naar de catalogus</button>}
            <button className="tekstknop klein" onClick={() => annuleerReservering(ex, false)}>{res.vorige_opslag === "vitrine" ? "Opheffen, in de vault laten" : "Reservering opheffen"}</button>
          </div>
        </div>
      </div>
    );
  }
  if (!open) {
    return (
      <button className="knop zacht reserveer-knop" onClick={() => { setPrijs(String(ex.opslag === "vitrine" ? ex.hartjesprijs ?? "" : ex.verkoopprijs ?? ex.hartjesprijs ?? "")); setOpen(true); }}>
        <Icoon naam="slot" maat={18} /> Reserveren voor iemand
      </button>
    );
  }
  if (!kanReserveren()) return <p className="nakijken">{SCHEMA_016}</p>;
  const p = prijs.trim() ? getal(prijs) : null;
  const bewaar = () => {
    try {
      reserveer(ex, { voor, prijs: p, tot: tot || null, opmerking });
      setOpen(false);
    } catch (e) {
      meld(e instanceof Error ? e.message : String(e), "fout");
    }
  };
  return (
    <section className="blok reserveer-form">
      <h3>Reserveren</h3>
      <p className="zacht klein">De kaart gaat uit de catalogus (ook op de klantenpagina) en ligt in de vault tot de persoon ze komt halen.</p>
      <Veld label="Voor wie?">
        <input value={voor} onChange={(e) => setVoor(e.target.value)} placeholder="Naam (of @instagram)" maxLength={80} autoFocus />
      </Veld>
      <Veld label="Afgesproken prijs (€)" hint="Leeg = de gewone prijs.">
        <input inputMode="decimal" value={prijs} onChange={(e) => setPrijs(e.target.value)} />
      </Veld>
      <Veld label="Tot wanneer? (optioneel)">
        <input type="date" value={tot} min={vandaag()} onChange={(e) => setTot(e.target.value)} />
      </Veld>
      <Veld label="Opmerking (optioneel)">
        <input value={opmerking} onChange={(e) => setOpmerking(e.target.value)} maxLength={200} placeholder="bv. komt naar de beurs in Gent" />
      </Veld>
      <div className="knoppenrij">
        <button className="knop" disabled={!voor.trim() || (prijs.trim() !== "" && (p == null || p <= 0))} onClick={bewaar}>Reserveren</button>
        <button className="knop zacht" onClick={() => setOpen(false)}>Annuleer</button>
      </div>
    </section>
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

/**
 * Waar komt dit exemplaar vandaan? Via de code vind je de aankoop, ruil of inbreng terug: wanneer,
 * waar, van wie, aan welke marktwaarde en welk percentage, en de foto's.
 */
function Herkomst({ ex }: { ex: Exemplaar }) {
  const { transacties, beurzen } = useApp();
  const [bewijs, setBewijs] = useState(false);
  const t = useMemo(() => verwervingen(transacties).get(ex.id), [transacties, ex.id]);
  const r = t?.regels.find((x) => x.richting === "in" && (x.nieuw?.id === ex.id || x.exemplaar_id === ex.id));
  const soort = t ? (t.soort === "ruil" ? "Geruild" : t.soort === "prive" ? "Uit privé ingebracht" : "Ingekocht") : null;
  return (
    <section className="blok herkomst">
      <h3>Herkomst</h3>
      {t && r ? (
        <>
          <p className="herkomst-zin"><strong>{soort}</strong> op {datumKort(t.tijd)} · {waarGekocht(t, beurzen)}{t.tegenpartij?.naam ? ` · van ${t.tegenpartij.naam}` : ""}</p>
          <dl className="gegevens">
            <dt>Betaald</dt><dd>{euro(r.prijs)}{r.referentie ? ` (${Math.round((r.prijs / r.referentie) * 100)}% van ${euro(r.referentie)})` : ""}</dd>
            {r.referentie_bron && <><dt>Marktwaarde</dt><dd>{r.referentie_bron}, {datumKort(t.tijd)}</dd></>}
            {ex.opmerking && <><dt>Opmerking</dt><dd>{ex.opmerking}</dd></>}
          </dl>
          {heeftBewijs(t) && <button className="knop zacht klein" onClick={() => setBewijs(true)}><Icoon naam="foto" maat={16} /> Bewijs en foto's · {bewijsNummer(t)}</button>}
          {bewijs && <BewijsSheet id={t.id} onSluit={() => setBewijs(false)} />}
        </>
      ) : (
        <dl className="gegevens">
          <dt>Aankoop</dt><dd>{euro(ex.aankoopprijs)}</dd>
          <dt>Datum</dt><dd>{datumKort(ex.aankoopdatum ?? ex.aangemaakt_op)}</dd>
          <dt>Bron</dt><dd>{ex.aankoopbron || "zelf toegevoegd"}</dd>
          {ex.opmerking && <><dt>Opmerking</dt><dd>{ex.opmerking}</dd></>}
        </dl>
      )}
    </section>
  );
}

/** Ligt de kaart in de catalogus maar zien klanten ze (nog) niet? Zeg waarom. */
function KlantZiet({ ex }: { ex: Exemplaar }) {
  const { omgevingen } = useApp();
  if (ex.opslag !== "vitrine" || ex.status !== "in voorraad") return null;
  const redenen: string[] = [];
  if (krijgtLabel(ex) && ex.label_status === "te printen") redenen.push("het label is nog niet geprint");
  else if (krijgtLabel(ex) && ex.label_status === "geprint") redenen.push("het label is nog niet geplakt");
  if (ex.hartjesprijs == null) redenen.push("er staat nog geen hartje op");
  if (ex.nieuw_hartje != null) redenen.push("het hartje moet eerst wisselen");
  const omg = omgevingen.find((o) => o.id === ex.omgeving_id);
  if (omg && !omg.zichtbaar_voor_klanten) redenen.push(`${omg.naam} staat niet op de klantenpagina`);
  if (!redenen.length) return null;
  return (
    <div className="klant-ziet">
      <Icoon naam="oog" maat={18} />
      <span>Klanten zien deze kaart nog niet: {redenen.join(", ")}.</span>
      {krijgtLabel(ex) && ex.label_status === "geprint" && <button className="tekstknop klein" onClick={() => bevestigLabel(ex)}>Label is geplakt</button>}
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
    try { return labelDataUrl(ex, huidigeMaat(instellingen.labelMaat, instellingen.labelPrinter)); } catch { return null; }
  }, [ex.code, ex.naam, ex.set_code, ex.nummer, ex.conditie, ex.taal, ex.variant, ex.grader, ex.grade, ex.soort, instellingen.labelMaat, instellingen.labelPrinter, printer]);
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
  const { transacties, gedeeltelijk } = useApp();
  // Ingekocht, geruild of ingebracht: de aankoopprijs is wat er op het bewijs staat (en in Dexxter).
  // Zonder internet kent de app enkel de laatste maanden: dan liever niets aanpassen.
  const via = useMemo(() => verwervingen(transacties).get(ex.id), [transacties, ex.id]) ?? (gedeeltelijk ? true : undefined);
  const [v, setV] = useState({
    naam: ex.naam, conditie: ex.conditie || "NM", taal: ex.taal, variant: ex.variant,
    aankoopprijs: ex.aankoopprijs?.toString() ?? "", aankoopbron: ex.aankoopbron ?? "",
    opmerking: ex.opmerking ?? "",
    verkoopprijs: ex.verkoopprijs?.toString() ?? "",
  });
  const bewaar = () => {
    void wijzig(ex.id, {
      naam: v.naam.trim() || ex.naam, conditie: v.conditie, taal: v.taal, variant: v.variant,
      ...(via ? {} : { aankoopprijs: getal(v.aankoopprijs), aankoopbron: v.aankoopbron.trim() || null }), opmerking: v.opmerking.trim() || null,
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
      {via ? (
        <p className="zacht klein">Aankoopprijs {euro(ex.aankoopprijs)}: zo staat ze op het bewijs (en in Dexxter), dus die pas je hier niet aan.</p>
      ) : (
        <>
          <Veld label="Aankoopprijs (€)"><input inputMode="decimal" value={v.aankoopprijs} onChange={(e) => setV({ ...v, aankoopprijs: e.target.value })} /></Veld>
          <Veld label="Aankoopbron"><input value={v.aankoopbron} onChange={(e) => setV({ ...v, aankoopbron: e.target.value })} placeholder="Cardmarket, winkel, pack opening…" /></Veld>
        </>
      )}
      <Veld label="Opmerking"><textarea rows={2} value={v.opmerking} onChange={(e) => setV({ ...v, opmerking: e.target.value })} /></Veld>
      <button className="knop" onClick={bewaar}>Bewaar</button>
    </section>
  );
}

function UitVoorraad({ ex }: { ex: Exemplaar }) {
  const [open, setOpen] = useState(false);
  const kan = kanNieuweBoekhouding(useApp());
  if (ex.status !== "in voorraad") return null;
  if (!open) return <button className="knop zacht rood" onClick={() => setOpen(true)}><Icoon naam="uit" maat={18} /> Uit voorraad</button>;
  const weg = (reden: string) => { void wijzig(ex.id, { status: "weg", afgeboekt_op: new Date().toISOString(), opmerking: [ex.opmerking, reden].filter(Boolean).join(" · ") }, "Uit de voorraad gehaald", true); sluit(); };
  return (
    <div className="uit-keuze">
      <p className="zacht">Verkopen en ruilen gaan via de kassa. Hier haal je een kaart uit de voorraad zonder verkoop. Voor je eigen verzameling: kies <strong>Naar privé</strong> (dan klopt de boekhouding).</p>
      <div className="knoppenrij">
        <button className="knop zacht" disabled={!kan} onClick={() => {
          try { prive([], [regelUit(ex, ex.aankoopprijs ?? 0)]); meld("Naar privé, aan de aankoopprijs"); sluit(); } catch (e) { meld(e instanceof Error ? e.message : String(e), "fout"); }
        }}>Naar privé</button>
        <button className="knop zacht rood" onClick={() => weg("kwijt")}>Kwijt</button>
        <button className="knop zacht rood" onClick={() => weg("beschadigd")}>Beschadigd</button>
        <button className="tekstknop" onClick={() => setOpen(false)}>Annuleer</button>
      </div>
    </div>
  );
}
