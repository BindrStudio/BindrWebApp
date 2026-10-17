import { useEffect, useMemo, useRef, useState } from "react";
import { alleCodes, huidig, meld, openArtikelen, openExemplaar, print, sluit, useApp, voegToe, zetInstellingen } from "../state";
import type { Catalogus, CatalogusKaart, Exemplaar, NieuwExemplaar, Opslag, Soort, Verkoop } from "../types";
import { CONDITIES, TALEN, VARIANTEN } from "../types";
import { afbeelding, herken, laadCatalogus, zoek, type Index, type Kandidaat } from "../lib/catalog";
import { uitCatalogus } from "../lib/foto";
import { nieuweCode, toonCode } from "../lib/code";
import { euro, getal, vandaag } from "../lib/format";
import { NAKIJKEN, voorstelVoor } from "../lib/pricing";
import { bestandNaarCanvas } from "../lib/camera";
import { leesKaart } from "../lib/ocr";
import { Icoon, KaartFoto, Kiezer, OnderAankoop, onderAankoop, Segment, Sheet, Veld } from "./common";
import { MarktBlok } from "./Markt";
import { kies, TOEGEVOEGD } from "../lib/grapjes";
import { GradedVelden, VerkopenBlok } from "./Graded";
import { gradedZoektekst } from "../lib/markt";

type Bron = "zoeken" | "foto" | "handmatig";

// Wat de vorige kaart had, zodat een stapel snel gaat (stapelmodus).
const vorige = { taal: "EN", conditie: "NM", opslag: "stockdoos" as Opslag, aankoopbron: "" };

export function Toevoegen({ kaartId, catalogus, opslag }: { kaartId?: string; catalogus?: Catalogus; opslag?: Opslag }) {
  const [kaart, setKaart] = useState<CatalogusKaart | null>(null);
  const [handmatig, setHandmatig] = useState(false);
  const [klaar, setKlaar] = useState<Exemplaar[] | null>(null);

  useEffect(() => {
    if (!kaartId) return;
    laadCatalogus(catalogus || "en").then((idx) => {
      const k = idx.perId.get(kaartId);
      if (k) setKaart(k);
    }).catch(() => undefined);
  }, [kaartId, catalogus]);

  const opnieuw = () => { setKaart(null); setHandmatig(false); setKlaar(null); };

  return (
    <Sheet titel={klaar ? "Toegevoegd" : kaart || handmatig ? "Details" : "Kaart toevoegen"} onSluit={sluit} vol>
      {klaar ? (
        <Klaar nieuw={klaar} onVolgende={opnieuw} />
      ) : kaart || handmatig ? (
        <Details kaart={kaart} opslag={opslag} onTerug={opnieuw} onKlaar={setKlaar} />
      ) : (
        <KiesKaart onKies={setKaart} onHandmatig={() => setHandmatig(true)} />
      )}
    </Sheet>
  );
}

export function KiesKaart({ onKies, onHandmatig, metArtikel = true, handmatigTekst }: { onKies: (k: CatalogusKaart) => void; onHandmatig: () => void; metArtikel?: boolean; handmatigTekst?: string }) {
  const [bron, setBron] = useState<Bron>("zoeken");
  const [cat, setCat] = useState<Catalogus>(vorige.taal === "JP" || vorige.taal.startsWith("CN") ? "asia" : "en");
  const [idx, setIdx] = useState<Index | null>(null);
  const [vraag, setVraag] = useState("");
  const [fout, setFout] = useState<string | null>(null);

  useEffect(() => {
    setIdx(null);
    laadCatalogus(cat).then(setIdx).catch((e) => setFout(e.message));
  }, [cat]);

  const resultaten = useMemo(() => (idx && vraag.trim().length >= 2 ? zoek(idx, vraag) : []), [idx, vraag]);

  return (
    <div className="stappen">
      <Segment<Bron> waarde={bron} onKies={setBron} opties={[
        { waarde: "zoeken", label: "Zoeken" },
        { waarde: "foto", label: "Foto" },
        { waarde: "handmatig", label: "Handmatig" },
      ]} />
      <Segment<Catalogus> waarde={cat} onKies={setCat} opties={[
        { waarde: "en", label: "Engels / Europees" },
        { waarde: "asia", label: "Japans / Chinees" },
      ]} />
      {fout && <p className="fouttekst">{fout}</p>}
      {bron === "zoeken" && (
        <>
          <div className="zoekbalk">
            <Icoon naam="zoek" maat={18} />
            <input autoFocus value={vraag} onChange={(e) => setVraag(e.target.value)}
              placeholder={cat === "en" ? "Naam, of set en nummer (PFL 130), of 130/94" : "Naam (ook Japans of Chinees), of SV2a 173"} />
          </div>
          {!idx && <p className="zacht">Kaartencatalogus laden…</p>}
          <Resultaten kaarten={resultaten} onKies={onKies} />
          {idx && vraag.trim().length >= 2 && !resultaten.length && <p className="zacht">Niets gevonden. Probeer set en nummer, of voeg de kaart handmatig toe.</p>}
        </>
      )}
      {bron === "foto" && <FotoHerkenning cat={cat} onKies={onKies} />}
      {bron === "handmatig" && (
        <div className="blok">
          <p>{handmatigTekst ?? "Staat de kaart niet in de catalogus, of is het een slab? Vul dan zelf de gegevens in."}</p>
          <button className="knop" onClick={onHandmatig}>Handmatig invullen</button>
        </div>
      )}
      {bron === "handmatig" && metArtikel && (
        <p className="zacht klein center">Binders, sealed en 3D-prints gaan per aantal, zonder label: die voeg je toe bij{" "}
          <button className="tekstknop klein inline" onClick={() => openArtikelen()}>Meer › Artikels</button>.
        </p>
      )}
    </div>
  );
}

function Resultaten({ kaarten, onKies, scores }: { kaarten: CatalogusKaart[]; onKies: (k: CatalogusKaart) => void; scores?: Map<string, number> }) {
  const { exemplaren } = useApp();
  const aantal = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of exemplaren) if (e.kaart_id && e.status === "in voorraad") m.set(e.kaart_id, (m.get(e.kaart_id) || 0) + 1);
    return m;
  }, [exemplaren]);
  return (
    <ul className="resultaten">
      {kaarten.map((k) => (
        <li key={k.id}>
          <button onClick={() => onKies(k)}>
            <KaartFoto src={afbeelding(k)} alt={k.naam} klein kaart={uitCatalogus(k)} />
            <span className="res-tekst">
              <strong>{k.naam}</strong>
              {(k.naamJa || k.naamZhTw) && <span className="naam-origineel">{[k.naamJa, k.naamZhTw, k.naamZhCn].filter(Boolean).join(" · ")}</span>}
              <span className="zacht">{k.setNaam} · {k.setCode || k.setId} {k.nummer}{k.setTotaal ? `/${k.setTotaal}` : ""}</span>
              <span className="zacht klein">{k.zeldzaamheid}{aantal.get(k.id) ? ` · ${aantal.get(k.id)} in voorraad` : ""}{scores?.has(k.id) ? ` · score ${scores.get(k.id)}` : ""}</span>
            </span>
            <Icoon naam="pijlRechts" maat={18} />
          </button>
        </li>
      ))}
    </ul>
  );
}

function FotoHerkenning({ cat, onKies }: { cat: Catalogus; onKies: (k: CatalogusKaart) => void }) {
  const invoer = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [res, setRes] = useState<{ kandidaten: Kandidaat[]; zeker: boolean } | null>(null);
  const [foto, setFoto] = useState<string | null>(null);

  const verwerk = async (file: File) => {
    setRes(null);
    try {
      const canvas = await bestandNaarCanvas(file);
      setFoto(canvas.toDataURL("image/jpeg", 0.7));
      const tekst = await leesKaart(canvas, setStatus);
      setStatus("Kaart zoeken…");
      const indexen = [await laadCatalogus(cat)];
      if (cat === "en") indexen.push(await laadCatalogus("asia"));
      const r = herken(indexen, tekst);
      setRes(r);
      setStatus(r.kandidaten.length ? null : "Geen nummer gevonden. Neem de foto recht van voren, met de onderkant van de kaart scherp in beeld, of zoek op naam.");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="foto-herkenning">
      <input ref={invoer} type="file" accept="image/*" capture="environment" hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void verwerk(f); e.target.value = ""; }} />
      <button className="knop groot" onClick={() => invoer.current?.click()}><Icoon naam="camera" /> Foto van de kaart nemen</button>
      <p className="zacht klein">Leg de kaart op een effen ondergrond, recht van boven, met het nummer onderaan scherp in beeld.</p>
      {foto && <img className="foto-voorbeeld" src={foto} alt="Genomen foto" />}
      {status && <p className="status">{status}</p>}
      {res && res.kandidaten.length > 0 && (
        <>
          <p className={res.zeker ? "zeker" : "nakijken"}>{res.zeker ? "Zeker herkend" : "Kijk na welke kaart het is"}</p>
          <Resultaten kaarten={res.kandidaten.map((k) => k.kaart)} onKies={onKies} />
        </>
      )}
    </div>
  );
}

function Details({ kaart, opslag, onTerug, onKlaar }: { kaart: CatalogusKaart | null; opslag?: Opslag; onTerug: () => void; onKlaar: (n: Exemplaar[]) => void }) {
  const { gids, instellingen, exemplaren } = useApp();
  const asia = kaart?.catalogus === "asia";
  const [soort, setSoort] = useState<Soort>("kaart");
  const [v, setV] = useState({
    naam: kaart?.naam ?? "",
    setNaam: kaart?.setNaam ?? "",
    setCode: kaart ? kaart.setCode || kaart.setId : "",
    nummer: kaart?.nummer ?? "",
    taal: asia ? (vorige.taal === "JP" || vorige.taal.startsWith("CN") ? vorige.taal : "JP") : (vorige.taal === "JP" || vorige.taal.startsWith("CN") ? "EN" : vorige.taal),
    conditie: vorige.conditie,
    variant: "normaal",
    aantal: 1,
    opslag: opslag ?? vorige.opslag,
    prijs: "",
    aankoopprijs: "",
    aankoopbron: vorige.aankoopbron,
    opmerking: "",
    grader: "PSA",
    grade: "10",
    cert: "",
  });
  const [verkopen, setVerkopen] = useState<Verkoop[]>([]);
  // Graded: neem de verkopen over die we eerder opzochten voor dezelfde kaart, grader en grade.
  useEffect(() => {
    if (soort !== "slab" || !kaart || verkopen.length) return;
    const eerder = exemplaren.find((e) => e.kaart_id === kaart.id && e.grader === v.grader && e.grade === v.grade && e.verkopen?.length);
    if (eerder?.verkopen) setVerkopen(eerder.verkopen);
  }, [soort, kaart, v.grader, v.grade]); // eslint-disable-line react-hooks/exhaustive-deps
  const [prijsAangeraakt, setPrijsAangeraakt] = useState(false);
  const [printen, setPrinten] = useState(instellingen.automatischPrinten);
  const [bezig, setBezig] = useState(false);

  const proef: Exemplaar = useMemo(() => ({
    soort, cardmarket_id: kaart?.cardmarket ?? null, taal: v.taal, conditie: v.conditie, variant: v.variant,
  }) as Exemplaar, [soort, kaart, v.taal, v.conditie, v.variant]);
  const voorstel = voorstelVoor(proef, gids, instellingen);
  useEffect(() => {
    if (!prijsAangeraakt) setV((x) => ({ ...x, prijs: voorstel ? String(voorstel.voorstel) : "" }));
  }, [voorstel?.voorstel, prijsAangeraakt]);

  const inVoorraad = kaart ? exemplaren.filter((e) => e.kaart_id === kaart.id && e.status === "in voorraad").length : 0;
  const naamOrigineel = kaart?.catalogus === "asia" ? (v.taal.startsWith("CN") ? kaart.naamZhTw || kaart.naamZhCn || kaart.naamJa : kaart.naamJa || kaart.naamZhTw) || null : null;

  // "Toch deze prijs" geldt voor de ingevulde prijs en aankoopprijs; verander je er één, dan vragen we opnieuw.
  const [verliesOk, setVerliesOk] = useState("");
  const bewaar = async () => {
    const prijs = getal(v.prijs);
    if (!v.naam.trim()) return meld("Vul een naam in", "fout");
    if (v.opslag === "vitrine" && prijs == null) return meld("Een kaart in de catalogus heeft een hartjesprijs nodig", "fout");
    setBezig(true);
    try {
      const codes = alleCodes();
      const handmatigePrijs = prijs != null && (!voorstel || prijs !== voorstel.voorstel);
      const rijen: NieuwExemplaar[] = Array.from({ length: Math.max(1, v.aantal) }, () => {
        const code = nieuweCode(codes);
        codes.add(code);
        return {
          code, soort, naam: v.naam.trim(), naam_origineel: naamOrigineel,
          kaart_id: kaart?.id ?? null, catalogus: kaart?.catalogus ?? null, afbeelding: kaart ? afbeelding(kaart) : null,
          set_naam: v.setNaam.trim() || null, set_code: v.setCode.trim() || null, nummer: v.nummer.trim() || null,
          taal: soort === "eigen product" ? "EN" : v.taal, conditie: soort === "kaart" ? v.conditie : null, variant: v.variant,
          grader: soort === "slab" ? v.grader.trim() || null : null, grade: soort === "slab" ? v.grade.trim() || null : null,
          cert: soort === "slab" ? v.cert.trim() || null : null, verkopen: soort === "slab" && verkopen.length ? verkopen : null,
          cardmarket_id: kaart?.cardmarket ?? null, opslag: v.opslag, status: "in voorraad",
          verkoopprijs: prijs, prijs_handmatig: handmatigePrijs,
          hartjesprijs: v.opslag === "vitrine" ? prijs : null, hartjesdatum: v.opslag === "vitrine" ? vandaag() : null,
          aankoopprijs: getal(v.aankoopprijs), aankoopdatum: vandaag(), aankoopbron: v.aankoopbron.trim() || null,
          label_status: "te printen", opmerking: v.opmerking.trim() || null,
        };
      });
      const nieuw = voegToe(rijen);
      Object.assign(vorige, { taal: v.taal, conditie: v.conditie, opslag: v.opslag, aankoopbron: v.aankoopbron });
      if (printen) void print(nieuw.map((e) => e.id));
      onKlaar(nieuw);
    } catch (e) {
      meld(e instanceof Error ? e.message : String(e), "fout");
    } finally {
      setBezig(false);
    }
  };

  const talen = asia ? TALEN.filter((t) => t.asia) : TALEN;

  return (
    <div className="formulier">
      {kaart ? (
        <div className="gekozen">
          <KaartFoto src={afbeelding(kaart)} alt={kaart.naam} klein kaart={uitCatalogus(kaart)} />
          <div>
            <strong>{kaart.naam}</strong>
            {naamOrigineel && <div className="naam-origineel">{naamOrigineel}</div>}
            <div className="zacht">{kaart.setNaam} · {kaart.setCode || kaart.setId} {kaart.nummer}{kaart.setTotaal ? `/${kaart.setTotaal}` : ""}</div>
            {inVoorraad > 0 && <div className="zacht klein">Al {inVoorraad} in voorraad</div>}
          </div>
          <button className="tekstknop" onClick={onTerug}>Andere kaart</button>
        </div>
      ) : (
        <>
          <Veld label="Soort"><Kiezer waarde={soort} opties={[{ waarde: "kaart", label: "Kaart" }, { waarde: "slab", label: "Slab" }]} onKies={setSoort} /></Veld>
          <p className="zacht klein">Binders, 3D-prints en sealed krijgen geen QR-label: die voeg je toe bij <button type="button" className="tekstknop klein" onClick={() => openArtikelen("binder")}>Profiel › Artikels</button>.</p>
          <Veld label="Naam (Engels, ook op het label)"><input value={v.naam} onChange={(e) => setV({ ...v, naam: e.target.value })} placeholder={soort === "eigen product" ? "Custom binder 9-pocket, gravure Gengar" : "Pikachu"} /></Veld>
          {soort !== "eigen product" && (
            <div className="twee">
              <Veld label="Setcode"><input value={v.setCode} onChange={(e) => setV({ ...v, setCode: e.target.value })} placeholder="PFL" /></Veld>
              <Veld label="Nummer"><input value={v.nummer} onChange={(e) => setV({ ...v, nummer: e.target.value })} placeholder="130" /></Veld>
            </div>
          )}
          {soort !== "eigen product" && <Veld label="Setnaam"><input value={v.setNaam} onChange={(e) => setV({ ...v, setNaam: e.target.value })} /></Veld>}

          <button className="tekstknop" onClick={onTerug}>Toch zoeken in de catalogus</button>
        </>
      )}

      {kaart && (
        <Segment<"kaart" | "slab"> waarde={soort === "slab" ? "slab" : "kaart"} onKies={(x) => { setSoort(x); setPrijsAangeraakt(false); }}
          opties={[{ waarde: "kaart", label: "Gewone kaart" }, { waarde: "slab", label: "Graded (slab)" }]} />
      )}
      {soort === "slab" && (
        <>
          <GradedVelden grader={v.grader} grade={v.grade} cert={v.cert} onChange={(w) => setV({ ...v, ...w })} />
          <VerkopenBlok verkopen={verkopen} onChange={setVerkopen} grader={v.grader} cert={v.cert}
            zoek={gradedZoektekst({ naam: v.naam, nummer: v.nummer, setTotaal: kaart?.setTotaal, grader: v.grader, grade: v.grade })}
            onSchatting={(x) => { setPrijsAangeraakt(true); setV((y) => ({ ...y, prijs: String(Math.round(x)) })); }} />
        </>
      )}
      {kaart && soort === "kaart" && (
        <MarktBlok cardmarketId={kaart.cardmarket} variant={v.variant} taal={v.taal} setId={kaart.setId} catalogus={kaart.catalogus}>
          {voorstel && (
            <div className="voorstel-rij">
              <span>Voorstel voor {v.conditie}{voorstel.factor !== 1 ? ` (${Math.round(voorstel.factor * 100)}% van de marktprijs)` : ""}{voorstel.nakijken ? " · nakijken" : ""}</span>
              <strong>{euro(voorstel.voorstel)}</strong>
            </div>
          )}
          {voorstel?.nakijken && <p className="nakijken klein">{voorstel.waarom.map((w) => NAKIJKEN[w]).join(" ")}</p>}
        </MarktBlok>
      )}

      {soort !== "eigen product" && (
        <>
          <Veld label="Taal">
            <select value={v.taal} onChange={(e) => setV({ ...v, taal: e.target.value })}>
              {talen.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
            </select>
          </Veld>
          {soort === "kaart" && <Veld label="Conditie"><Kiezer waarde={v.conditie} opties={CONDITIES} onKies={(c) => setV({ ...v, conditie: c })} /></Veld>}
          <Veld label="Variant"><Kiezer waarde={v.variant} opties={VARIANTEN} onKies={(c) => setV({ ...v, variant: c })} /></Veld>
        </>
      )}

      <Veld label="Waar ligt het?">
        <Kiezer waarde={v.opslag} opties={[{ waarde: "vitrine", label: "Catalogus (met hartje)" }, { waarde: "stockdoos", label: "Vault" }]} onKies={(o) => setV({ ...v, opslag: o })} />
      </Veld>

      <div className="twee">
        <Veld label={v.opslag === "vitrine" ? "Prijs op het hartje (€)" : "Verkoopprijs (€)"}
          hint={voorstel ? <>Voorstel {euro(voorstel.voorstel)} · markt {euro(voorstel.referentie)}{voorstel.nakijken ? " · nakijken" : ""}</> : soort === "kaart" ? "Geen voorstel: prijs zelf" : undefined}>
          <input inputMode="numeric" value={v.prijs} onChange={(e) => { setPrijsAangeraakt(true); setV({ ...v, prijs: e.target.value }); }} />
        </Veld>
        <Veld label="Aankoopprijs (€)"><input inputMode="decimal" value={v.aankoopprijs} onChange={(e) => setV({ ...v, aankoopprijs: e.target.value })} /></Veld>
      </div>
      {v.opslag === "vitrine" && onderAankoop(getal(v.prijs), getal(v.aankoopprijs)) && verliesOk !== `${v.prijs}|${v.aankoopprijs}` && (
        <OnderAankoop prijs={getal(v.prijs)!} aankoop={getal(v.aankoopprijs)!} vaultTekst="Leg ze in de vault"
          onVault={() => setV({ ...v, opslag: "stockdoos" })} onToch={() => setVerliesOk(`${v.prijs}|${v.aankoopprijs}`)} />
      )}
      <Veld label="Aankoopbron"><input value={v.aankoopbron} onChange={(e) => setV({ ...v, aankoopbron: e.target.value })} placeholder="beurs, particulier, pack opening, ruil…" /></Veld>

      <Veld label="Aantal exemplaren" hint="Elk exemplaar krijgt een eigen code en label.">
        <div className="stapper">
          <button type="button" onClick={() => setV({ ...v, aantal: Math.max(1, v.aantal - 1) })}>−</button>
          <span>{v.aantal}</span>
          <button type="button" onClick={() => setV({ ...v, aantal: Math.min(50, v.aantal + 1) })}>+</button>
        </div>
      </Veld>
      <Veld label="Opmerking"><input value={v.opmerking} onChange={(e) => setV({ ...v, opmerking: e.target.value })} /></Veld>

      <label className="schakel">
        <input type="checkbox" checked={printen} onChange={(e) => { setPrinten(e.target.checked); zetInstellingen({ automatischPrinten: e.target.checked }); }} />
        <span>Label meteen printen</span>
      </label>

      <div className="sheet-actie">
        <button className="knop groot" disabled={bezig} onClick={bewaar}>
          {bezig ? "Bezig…" : v.aantal > 1 ? `${v.aantal} exemplaren toevoegen` : "Toevoegen"}{getal(v.prijs) != null && !bezig ? ` · ${euro(getal(v.prijs))}` : ""}
        </button>
      </div>
    </div>
  );
}

function Klaar({ nieuw, onVolgende }: { nieuw: Exemplaar[]; onVolgende: () => void }) {
  const { exemplaren } = useApp();
  const actueel = nieuw.map((n) => exemplaren.find((e) => e.id === n.id) || n);
  const nogTePrinten = actueel.filter((e) => e.label_status === "te printen");
  return (
    <div className="klaar">
      <div className="sparkles" aria-hidden="true"><span>✦</span><span>✦</span><span>✦</span></div>
      <h2>{nieuw.length === 1 ? "Exemplaar toegevoegd" : `${nieuw.length} exemplaren toegevoegd`}</h2>
      <p className="gelukt-grapje">{kies(TOEGEVOEGD, nieuw[0]?.id)}</p>
      <ul className="lijst">
        {actueel.map((e) => (
          <li key={e.id}>
            <button className="lijst-knop" onClick={() => openExemplaar(e.id)}>
              <span className="code">{toonCode(e.code)}</span>
              <span>{e.naam}</span>
              <span className="rechts zacht">{e.label_status === "te printen" ? "label te printen" : "label geprint"}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="knoppenrij">
        {nogTePrinten.length > 0 && <button className="knop" onClick={() => void print(nogTePrinten.map((e) => e.id))}><Icoon naam="printer" maat={18} /> Print {nogTePrinten.length === 1 ? "label" : `${nogTePrinten.length} labels`}</button>}
        <button className="knop zacht" onClick={onVolgende}><Icoon naam="plus" maat={18} /> Volgende kaart</button>
        <button className="tekstknop" onClick={sluit}>Klaar</button>
      </div>
    </div>
  );
}
