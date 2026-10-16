// Artikels: alles wat per aantal gaat en geen eigen label krijgt. Onze binders (hoofdproduct),
// sealed (met de prijs van Cardmarket), 3D-prints en andere. Te vinden in Meer › Artikels.
import { useEffect, useMemo, useState } from "react";
import { inMandje, meld, naarTab, openArtikel, openArtikelen, schemaOud, SCHEMA_09, sluit, useApp, voegArtikelToe, wijzigArtikel } from "../state";
import type { Artikel, ArtikelDetails, ArtikelType, Techniek } from "../types";
export { artikelOmschrijving };
import { euro, getal, zonderAccenten } from "../lib/format";
import { regelArtikelUit } from "../lib/kassa";
import { ARTIKEL_TYPES, artikelOmschrijving, artikelType, PLAATS, soortVoorType, TECHNIEKEN } from "../lib/categorie";
import { cardmarketSealedLink } from "../lib/markt";
import { laadSealed, zoekSealed, type SealedProduct } from "../lib/sealed";
import { veiligeFoto } from "../lib/eigenfoto";
import { artikelZichtbaar } from "../lib/weergave";
import { Icoon, Kiezer, Sheet, Veld } from "./common";
import { FotoKiezer } from "./FotoKiezer";

const ICOON: Record<ArtikelType, string> = { binder: "binder", sealed: "doos", "3d-print": "print3d", andere: "tag" };
const GROOTTES = ["4-pocket", "9-pocket", "12-pocket", "16-pocket"];
const SEALED_PRODUCTEN = ["Booster", "Display", "ETB", "Collectie box", "Tin", "Blister", "Andere"];
const TALEN = ["EN", "JP", "DE", "FR", "NL", "CN", "KR"];

function Beeld({ a, groot = false }: { a: Pick<Artikel, "foto" | "soort" | "naam" | "details">; groot?: boolean }) {
  const f = veiligeFoto(a.foto);
  return f
    ? <img className={`artikel-foto${groot ? " groot" : ""}`} src={f} alt={a.naam} />
    : <span className={`artikel-foto leeg${groot ? " groot" : ""}`}><Icoon naam={ICOON[artikelType(a)]} maat={groot ? 44 : 24} /></span>;
}

// ── De lijst ─────────────────────────────────────────────────────────────────

export function Artikelen({ type: start }: { type?: ArtikelType }) {
  const { artikelen } = useApp();
  const [type, setType] = useState<ArtikelType>(start ?? "binder");
  const [zoek, setZoek] = useState("");
  const telling = useMemo(() => {
    const t: Record<string, number> = {};
    for (const a of artikelen) t[artikelType(a)] = (t[artikelType(a)] ?? 0) + 1;
    return t;
  }, [artikelen]);
  const lijst = useMemo(() => {
    const w = zonderAccenten(zoek.trim());
    return artikelen
      .filter((a) => artikelType(a) === type && (!w || zonderAccenten(`${a.naam} ${artikelOmschrijving(a)}`).includes(w)))
      .sort((a, b) => (b.aantal > 0 ? 1 : 0) - (a.aantal > 0 ? 1 : 0) || a.naam.localeCompare(b.naam));
  }, [artikelen, type, zoek]);
  const stuks = lijst.reduce((n, a) => n + a.aantal, 0);
  const naam = ARTIKEL_TYPES.find((t) => t.id === type)!;

  return (
    <Sheet titel="Artikels" onSluit={sluit} vol>
      <div className="chips artikel-types">
        {ARTIKEL_TYPES.map((t) => (
          <button key={t.id} className={`chip${t.id === type ? " aan" : ""}`} onClick={() => setType(t.id)}>
            <Icoon naam={ICOON[t.id]} maat={16} /> {t.meervoud}{telling[t.id] ? <span className="chip-aantal">{telling[t.id]}</span> : null}
          </button>
        ))}
      </div>
      <button className="knop groot" onClick={() => openArtikel(null, type)}>
        <Icoon naam="plus" maat={20} /> {type === "binder" ? "Nieuwe binder" : type === "sealed" ? "Nieuw sealed product" : type === "3d-print" ? "Nieuwe 3D-print" : "Nieuw artikel"}
      </button>
      {lijst.length > 4 && (
        <div className="zoekbalk"><input value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder={`Zoek in ${naam.meervoud.toLowerCase()}`} inputMode="search" /></div>
      )}
      {!lijst.length ? (
        <p className="zacht center">{type === "binder" ? "Nog geen binders. Voeg jullie binders toe met hun artwork, techniek en foto: klanten zien ze op de klantenpagina, ook die niet uitgestald liggen." : "Nog niets in deze lijst."}</p>
      ) : (
        <>
          <p className="zacht klein">{lijst.length} {lijst.length === 1 ? "artikel" : "artikels"} · {stuks} op voorraad</p>
          <ul className="artikel-lijst">
            {lijst.map((a) => (
              <li key={a.id}>
                <button className={`artikel-rij${a.aantal ? "" : " op"}`} onClick={() => openArtikel(a.id)}>
                  <Beeld a={a} />
                  <span className="artikel-rij-tekst">
                    <strong>{a.naam}</strong>
                    {artikelOmschrijving(a) && <span className="zacht klein">{artikelOmschrijving(a)}</span>}
                    <span className="zacht klein">{PLAATS[a.opslag].naam}{a.prijs != null ? ` · ${euro(a.prijs)}` : " · prijs op vraag"}{artikelZichtbaar(a) ? <span className="op-klant"> · <Icoon naam="oog" maat={12} /> klanten</span> : null}</span>
                  </span>
                  <span className="artikel-rij-aantal">{a.aantal ? <><strong>{a.aantal}</strong><em>{a.aantal === 1 ? "stuk" : "stuks"}</em></> : <em>op</em>}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="zacht klein">Artikels krijgen geen eigen label. Verkopen gaat in de kassa via <strong>Artikel</strong>; het aantal zakt dan vanzelf.</p>
    </Sheet>
  );
}

// ── Eén artikel: bekijken, aanpassen of nieuw ────────────────────────────────

/** Foto nemen of kiezen; wordt verkleind en meteen getoond. */
/** Sealed opzoeken in de productlijst van Cardmarket (prijs en link). */
function SealedZoeker({ naam, onKies }: { naam: string; onKies: (p: SealedProduct) => void }) {
  const [q, setQ] = useState(naam);
  const [lijst, setLijst] = useState<SealedProduct[] | null | "laden">("laden");
  useEffect(() => { let weg = false; void laadSealed().then((x) => { if (!weg) setLijst(x?.producten ?? null); }); return () => { weg = true; }; }, []);
  const res = Array.isArray(lijst) && q.trim().length > 1 ? zoekSealed(lijst, q, 8) : [];
  return (
    <div className="sealed-zoeker">
      <div className="zoekbalk"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Zoek op Cardmarket, bv. Ascended Heroes booster" inputMode="search" /></div>
      {lijst === "laden" && <p className="zacht klein">Productlijst laden…</p>}
      {lijst === null && <p className="zacht klein">De productlijst van Cardmarket is (nog) niet beschikbaar. Zoek het product met de knop hieronder en vul de prijs zelf in.</p>}
      {res.length > 0 && (
        <ul className="lijst">
          {res.map((p) => (
            <li key={p.id}>
              <button className="lijst-knop" onClick={() => onKies(p)}>
                <span className="lijst-naam"><strong>{p.naam}</strong> <span className="zacht klein">{p.categorie}</span></span>
                <span className="rechts">{p.trend != null ? euro(p.trend) : euro(p.laagste)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {Array.isArray(lijst) && q.trim().length > 1 && !res.length && <p className="zacht klein">Niets gevonden in de productlijst.</p>}
      {q.trim() && <a className="tekstknop klein" href={cardmarketSealedLink(null, q)} target="_blank" rel="noreferrer"><Icoon naam="link" maat={14} /> Zoek "{q.trim()}" op Cardmarket</a>}
    </div>
  );
}

/** De Cardmarket-prijs van een sealed product dat we kennen. */
function SealedPrijs({ id, naam }: { id: number; naam: string }) {
  const [p, setP] = useState<SealedProduct | null>(null);
  useEffect(() => { let weg = false; void laadSealed().then((x) => { if (!weg) setP(x?.producten.find((y) => y.id === id) ?? null); }); return () => { weg = true; }; }, [id]);
  return (
    <div className="sealed-prijs">
      {p ? (
        <div className="markt-cijfers klein">
          <div><span>Trend</span><strong>{euro(p.trend)}</strong></div>
          <div><span>Laagste</span><strong>{euro(p.laagste)}</strong></div>
          <div><span>Gem. 30 d</span><strong>{euro(p.gem30)}</strong></div>
        </div>
      ) : <p className="zacht klein">Cardmarket-product {id}</p>}
      <a className="knop zacht klein" href={cardmarketSealedLink(id, naam)} target="_blank" rel="noreferrer"><Icoon naam="link" maat={14} /> Bekijk op Cardmarket (BE en NL)</a>
    </div>
  );
}

interface Formulier {
  naam: string;
  aantal: number;
  prijs: string;
  aankoopprijs: string;
  opslag: Artikel["opslag"];
  opmerking: string;
  foto: string | null;
  details: ArtikelDetails;
  cardmarket_id: number | null;
  zichtbaar: boolean | null;   // op de klantenpagina (leeg: zoals standaard)
}

const vorigeBinder: ArtikelDetails = { merk: "Vault X", grootte: "9-pocket", toploader: false, techniek: "laser" };

export function ArtikelSheet({ id, type: nieuwType, vanLijst }: { id: string | null; type?: ArtikelType; vanLijst?: boolean }) {
  const app = useApp();
  const { artikelen, instellingen } = app;
  const a = id ? artikelen.find((x) => x.id === id) : null;
  const type: ArtikelType = a ? artikelType(a) : nieuwType ?? "sealed";
  const begin = (): Formulier => ({
    naam: a?.naam ?? "",
    aantal: a?.aantal ?? 1,
    prijs: a?.prijs != null ? String(a.prijs).replace(".", ",") : "",
    aankoopprijs: a?.aankoopprijs != null ? String(a.aankoopprijs).replace(".", ",") : "",
    opslag: a?.opslag ?? "vitrine",
    opmerking: a?.opmerking ?? "",
    foto: a?.foto ?? null,
    details: { ...(a ? {} : type === "binder" ? vorigeBinder : {}), ...(a?.details ?? {}), type },
    cardmarket_id: a?.cardmarket_id ?? null,
    zichtbaar: a?.zichtbaar ?? null,
  });
  const [v, setV] = useState<Formulier>(begin);
  const [zoekSealed, setZoekSealed] = useState(!a && type === "sealed");
  const d = v.details;
  const zetD = (w: Partial<ArtikelDetails>) => setV({ ...v, details: { ...v.details, ...w } });
  const terug = () => (vanLijst ? openArtikelen(type) : sluit());

  const naamVoorstel = type === "binder" ? [d.artwork ? `Binder ${d.artwork}` : "Binder", d.grootte].filter(Boolean).join(" · ") : "";
  const bewaar = () => {
    const naam = v.naam.trim() || naamVoorstel;
    if (!naam) return meld("Geef het artikel een naam", "fout");
    const w: Partial<Artikel> = {
      naam, soort: soortVoorType(type), prijs: getal(v.prijs), aankoopprijs: getal(v.aankoopprijs),
      opslag: v.opslag, opmerking: v.opmerking.trim() || null, foto: v.foto, details: { ...d, type }, cardmarket_id: v.cardmarket_id,
      zichtbaar: v.zichtbaar,
    };
    if (type === "binder") Object.assign(vorigeBinder, { merk: d.merk, grootte: d.grootte, toploader: d.toploader, techniek: d.techniek });
    if (a) {
      // Enkel wat veranderde: het aantal (dat een andere gsm intussen kan verkocht hebben) en een
      // ongewijzigde foto gaan niet opnieuw mee.
      const veranderd = Object.fromEntries(Object.entries(w).filter(([k, x]) => JSON.stringify(x ?? null) !== JSON.stringify((a as unknown as Record<string, unknown>)[k] ?? null)));
      if (Object.keys(veranderd).length) wijzigArtikel(a.id, veranderd, "Artikel bewaard");
    } else { voegArtikelToe({ ...w, naam, aantal: Math.max(0, v.aantal) }); meld(`${naam} toegevoegd`); }
    terug();
  };
  const marge = getal(v.prijs) != null && getal(v.aankoopprijs) != null ? getal(v.prijs)! - getal(v.aankoopprijs)! : null;
  // −1 / +1 op wat nu op voorraad is (ook als een andere gsm net iets verkocht).
  const zetAantal = (delta: number) => {
    if (!a) return;
    const aantal = Math.max(0, a.aantal + delta);
    wijzigArtikel(a.id, { aantal }, `Nog ${aantal} op voorraad`, delta > 0 ? "bijgeteld" : "afgeteld");
  };

  return (
    <Sheet titel={a ? a.naam : type === "binder" ? "Nieuwe binder" : type === "sealed" ? "Nieuw sealed product" : type === "3d-print" ? "Nieuwe 3D-print" : "Nieuw artikel"} onSluit={terug}>
      {a && (
        <div className="artikel-kop">
          <Beeld a={{ ...a, foto: v.foto }} groot />
          <div className="artikel-kop-tekst">
            {artikelOmschrijving(a) && <p className="zacht">{artikelOmschrijving(a)}</p>}
            <div className="groot-getal"><span>{a.aantal}</span> op voorraad</div>
            <div className="zacht">{a.prijs != null ? `${euro(a.prijs)} per stuk` : "Prijs op vraag"} · {PLAATS[a.opslag].lang}</div>
            <div className="knoppenrij">
              <button className="knop zacht klein" onClick={() => zetAantal(-1)} disabled={!a.aantal} aria-label="Eén minder op voorraad">−1</button>
              <button className="knop zacht klein" onClick={() => zetAantal(1)} aria-label="Eén meer op voorraad">+1</button>
            </div>
            <p className="zacht klein">Bijgekocht of kapot: tel hier bij of af. De app onthoudt wanneer, zodat de voorraad op 31/12 klopt.</p>
          </div>
          {a.aantal > 0 && (
            <button className="knop groot artikel-mandje" onClick={() => { inMandje(regelArtikelUit(a)); meld(`${a.naam} in het mandje`, "ok", { label: "Naar kassa", doe: () => naarTab("kassa") }); sluit(); }}>
              <Icoon naam="mandje" maat={20} /> In het mandje
            </button>
          )}
        </div>
      )}

      <div className="blok formulier">
        <FotoKiezer foto={v.foto} onFoto={(foto) => setV((x) => ({ ...x, foto }))} />

        {type === "sealed" && (
          zoekSealed
            ? <SealedZoeker naam={v.naam} onKies={(p) => { setV({ ...v, naam: v.naam || p.naam, cardmarket_id: p.id, prijs: v.prijs || (p.trend != null ? String(Math.round(p.trend)) : "") }); setZoekSealed(false); }} />
            : v.cardmarket_id
              ? <><SealedPrijs id={v.cardmarket_id} naam={v.naam} /><button className="tekstknop klein" onClick={() => setZoekSealed(true)}>Ander product op Cardmarket</button></>
              : <button className="knop zacht" onClick={() => setZoekSealed(true)}><Icoon naam="zoek" maat={16} /> Zoek de prijs op Cardmarket</button>
        )}

        {type === "binder" && (
          <>
            <Veld label="Artwork (welk ontwerp staat erop?)"><input value={d.artwork ?? ""} onChange={(e) => zetD({ artwork: e.target.value })} placeholder="bv. Gengar, Eevee-evoluties, eigen naam" /></Veld>
            <Veld label="Techniek"><Kiezer waarde={(d.techniek ?? "") as Techniek} opties={TECHNIEKEN.map((t) => ({ waarde: t.id, label: t.label }))} onKies={(t) => zetD({ techniek: t })} /></Veld>
            <Veld label="Grootte"><Kiezer waarde={d.grootte ?? ""} opties={GROOTTES} onKies={(g) => zetD({ grootte: g })} /></Veld>
            <label className="schakel">
              <input type="checkbox" checked={!!d.toploader} onChange={(e) => zetD({ toploader: e.target.checked })} />
              <span>Binder voor toploaders</span>
            </label>
            <Veld label="Merk of model"><input value={d.merk ?? ""} onChange={(e) => zetD({ merk: e.target.value })} placeholder="bv. Vault X" /></Veld>
          </>
        )}

        {type === "sealed" && (
          <>
            <Veld label="Soort"><Kiezer waarde={d.product ?? ""} opties={SEALED_PRODUCTEN} onKies={(p) => zetD({ product: p })} /></Veld>
            <div className="twee">
              <Veld label="Set"><input value={d.set ?? ""} onChange={(e) => zetD({ set: e.target.value })} placeholder="bv. Ascended Heroes" /></Veld>
              <Veld label="Taal"><select value={d.taal ?? "EN"} onChange={(e) => zetD({ taal: e.target.value })}>{TALEN.map((t) => <option key={t}>{t}</option>)}</select></Veld>
            </div>
          </>
        )}

        <Veld label="Naam" hint={!v.naam && naamVoorstel ? `Laat leeg voor "${naamVoorstel}"` : undefined}>
          <input value={v.naam} onChange={(e) => setV({ ...v, naam: e.target.value })} placeholder={naamVoorstel || (type === "sealed" ? "Booster pack Ascended Heroes" : type === "3d-print" ? "3D-print deckbox" : "Naam")} />
        </Veld>
        <div className="twee">
          <Veld label="Verkoopprijs per stuk (€)"><input inputMode="decimal" value={v.prijs} onChange={(e) => setV({ ...v, prijs: e.target.value })} /></Veld>
          <Veld label={type === "binder" || type === "3d-print" ? "Kostprijs per stuk (€)" : "Inkoopprijs per stuk (€)"}
            hint={marge != null && instellingen.toonMarge ? `Marge ${marge >= 0 ? "+" : "−"}${euro(Math.abs(marge))} per stuk` : "Optioneel: enkel voor de voorraad op 31/12. De kosten zelf geef je apart in Dexxter in."}>
            <input inputMode="decimal" value={v.aankoopprijs} onChange={(e) => setV({ ...v, aankoopprijs: e.target.value })} />
          </Veld>
        </div>
        {!a && (
          <Veld label="Aantal op voorraad">
            <div className="stapper">
              <button type="button" onClick={() => setV({ ...v, aantal: Math.max(0, v.aantal - 1) })}>−</button>
              <input className="stapper-getal" inputMode="numeric" value={v.aantal} onChange={(e) => setV({ ...v, aantal: Math.max(0, Math.round(getal(e.target.value) ?? 0)) })} />
              <button type="button" onClick={() => setV({ ...v, aantal: v.aantal + 1 })}>+</button>
            </div>
          </Veld>
        )}
        <Veld label="Waar ligt het?">
          <Kiezer waarde={v.opslag} opties={[{ waarde: "vitrine", label: "Catalogus (uitgestald)" }, { waarde: "stockdoos", label: "Vault" }]} onKies={(o) => setV({ ...v, opslag: o })} />
        </Veld>
        {(() => {
          // Op de klantenpagina: standaard wat in de catalogus ligt en al onze binders; per stuk aan of uit te zetten.
          const standaard = v.opslag === "vitrine" || type === "binder";
          const aan = v.zichtbaar ?? standaard;
          const zonderPrijs = getal(v.prijs) == null;
          return (
            <div className="klant-schakel">
              <label className="schakel rij">
                <input type="checkbox" checked={aan} onChange={(e) => setV({ ...v, zichtbaar: e.target.checked === standaard ? null : e.target.checked })} />
                <span>Op de klantenpagina <span className="zacht klein">{aan
                  ? zonderPrijs ? "(eerst een verkoopprijs invullen)" : v.opslag === "stockdoos" ? "(klanten zien \"vraag ernaar\")" : "(klanten zien het met de prijs)"
                  : "(verborgen voor klanten)"}</span></span>
              </label>
              {schemaOud(app) && v.zichtbaar !== null && <p className="nakijken klein">{SCHEMA_09}</p>}
            </div>
          );
        })()}
        <Veld label="Opmerking"><input value={v.opmerking} onChange={(e) => setV({ ...v, opmerking: e.target.value })} /></Veld>
        <div className="sheet-actie">
          <button className="knop groot" disabled={type === "binder" && !a && !d.artwork?.trim() && !v.naam.trim()} onClick={bewaar}>{a ? "Bewaar" : "Toevoegen"}</button>
        </div>
      </div>
    </Sheet>
  );
}
