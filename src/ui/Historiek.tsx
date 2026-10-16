// Beurzen en transacties: wat er op een beurs gebeurt (live cijfers), alle vorige beurzen
// en alle transacties, met pijltjes per soort: verkoop (geld binnen), inkoop (geld buiten),
// ruil (kaarten over en weer) en retour.
import { useMemo, useState } from "react";
import { actieveBeurs, openBeurs, openTransactie, useApp } from "../state";
import type { Artikel, Beurs, Exemplaar, Regel, Transactie, TransactieSoort } from "../types";
import { beursCijfers, beursOverzicht, marge, PRODUCTSOORTEN, type Productsoort } from "../lib/kassa";
import { artikelType } from "../lib/categorie";
import { datumKort, euro } from "../lib/format";
import { geplandeBeurzen } from "./Beurs";
import { Icoon, Segment, Sheet } from "./common";

const tijdKort = (iso: string) => new Date(iso).toLocaleTimeString("nl-BE", { hour: "2-digit", minute: "2-digit" });
const dagLang = (iso: string) => new Date(iso).toLocaleDateString("nl-BE", { weekday: "long", day: "numeric", month: "long" });

export const SOORT: Record<TransactieSoort, { naam: string; icoon: string; uitleg: string }> = {
  verkoop: { naam: "Verkoop", icoon: "verkoop", uitleg: "geld binnen" },
  inkoop: { naam: "Inkoop", icoon: "inkoop", uitleg: "geld buiten" },
  ruil: { naam: "Ruil", icoon: "ruil", uitleg: "kaarten over en weer" },
  retour: { naam: "Retour", icoon: "terug", uitleg: "terugbetaald" },
  kas: { naam: "Kas", icoon: "geld", uitleg: "geld in of uit de koffer" },
};

const PRODUCT_ICOON: Record<Productsoort, string> = {
  kaarten: "kaartje", slabs: "slab", binders: "binder", "3d-prints": "print3d", sealed: "doos", andere: "tag",
};

/** Welke soort product een regel is, opgezocht in de voorraad (ook verkochte exemplaren blijven bewaard). */
export function useSoortVan(): (r: Regel) => Productsoort {
  const { exemplaren, artikelen } = useApp();
  return useMemo(() => {
    const ex = new Map<string, Exemplaar>(exemplaren.map((e) => [e.id, e]));
    const art = new Map<string, Artikel>(artikelen.map((a) => [a.id, a]));
    return (r: Regel) => {
      if (r.artikel_id) {
        const a = art.get(r.artikel_id);
        const t = a ? artikelType(a) : /binder/i.test(r.naam) ? "binder" : /3d|print/i.test(r.naam) ? "3d-print" : "andere";
        return t === "binder" ? "binders" : t === "3d-print" ? "3d-prints" : t === "sealed" ? "sealed" : "andere";
      }
      const e = r.exemplaar_id ? ex.get(r.exemplaar_id) : null;
      const soort = e?.soort ?? r.nieuw?.soort;
      if (soort === "slab") return "slabs";
      if (soort === "eigen product") return /binder/i.test(r.naam) ? "binders" : "andere";
      return "kaarten";
    };
  }, [exemplaren, artikelen]);
}

/** Eén transactie als rij: icoon met pijl, wat er over de toonbank ging, en het bedrag. */
/** Wat een kasbeweging was, als er geen omschrijving bij staat. */
export function kasOmschrijving(t: Pick<Transactie, "cash" | "sumup">): string {
  if (t.sumup > 0) return "Wissel: SumUp in, cash uit";
  return t.cash > 0 ? "Geld in de koffer" : t.cash < 0 ? "Geld uit de koffer" : "Wissel (cash)";
}

export function TransactieRij({ t, beheerder, compact = false }: { t: Transactie; beheerder?: string; compact?: boolean }) {
  const s = SOORT[t.soort];
  const uit = t.regels.filter((r) => r.richting === "uit");
  const binnen = t.regels.filter((r) => r.richting === "in");
  const stuks = (rs: Regel[]) => rs.reduce((n, r) => n + (r.aantal ?? 1), 0);
  const namen = (rs: Regel[]) => {
    const n = rs.map((r) => (r.aantal && r.aantal > 1 ? `${r.aantal}× ${r.naam}` : r.naam));
    return n.length > 2 ? `${n.slice(0, 2).join(", ")} en ${n.length - 2} meer` : n.join(", ");
  };
  const geld = [t.cash ? "cash" : null, t.sumup ? "SumUp" : null, t.bank ? "overschrijving" : null].filter(Boolean).join(" + ");
  // Een kasbeweging heeft geen regels: toon wat er in of uit de koffer ging.
  const bedrag = t.soort === "kas" ? t.cash : t.totaal;
  const titel = t.soort === "kas" ? t.opmerking || kasOmschrijving(t)
    : t.soort === "ruil" ? `${stuks(uit)} weg · ${stuks(binnen)} binnen`
      : t.soort === "retour" ? namen([...binnen, ...uit]) || s.naam
        : namen(t.soort === "inkoop" ? binnen : uit) || s.naam;
  return (
    <li>
      <button className={`transactie-rij ${t.soort} ${t.status}`} onClick={() => openTransactie(t.id)}>
        <span className={`tr-icoon ${t.soort}`}><Icoon naam={s.icoon} maat={20} /></span>
        <span className="transactie-tekst">
          <strong>
            {titel}
            {t.status === "ongedaan" && <em className="tr-merk">ongedaan</em>}
            {t.status === "conflict" && <em className="tr-merk rood">conflict</em>}
          </strong>
          {t.soort === "ruil" && !compact && <span className="zacht klein">{namen(uit)} ⇄ {namen(binnen)}</span>}
          <span className="zacht klein">{tijdKort(t.tijd)} · {s.naam.toLowerCase()}{geld ? ` · ${geld}` : ""}{beheerder ? ` · ${beheerder}` : ""}</span>
        </span>
        <span className={`transactie-bedrag ${bedrag > 0 ? "plus" : bedrag < 0 ? "min" : ""}`}>
          <strong>{bedrag > 0 ? `+${euro(bedrag)}` : bedrag < 0 ? `−${euro(-bedrag)}` : "±0"}</strong>
        </span>
      </button>
    </li>
  );
}

/** Live cijfers van de beurs die bezig is: wat er verkocht, ingekocht en geruild werd. */
export function BeursDashboard({ beurs }: { beurs: Beurs }) {
  const s = useApp();
  const soortVan = useSoortVan();
  const tr = useMemo(() => s.transacties.filter((t) => t.beurs_id === beurs.id), [s.transacties, beurs.id]);
  const o = useMemo(() => beursOverzicht(tr, soortVan), [tr, soortVan]);
  const c = useMemo(() => beursCijfers(beurs, tr), [beurs, tr]);
  const m = useMemo(() => marge(tr.filter((t) => t.status !== "ongedaan" && t.soort === "verkoop").flatMap((t) => t.regels)), [tr]);
  const laatste = tr.slice().sort((a, b) => b.tijd.localeCompare(a.tijd)).slice(0, 3);
  const soorten = PRODUCTSOORTEN.filter((p) => o.verkocht[p.id].aantal > 0);
  return (
    <section className="beurs-dashboard">
      <div className="bd-raster">
        <div className="bd-tegel groot verkoop">
          <span className="bd-kop"><Icoon naam="verkoop" maat={16} /> Verkocht</span>
          <strong>{euro(o.verkochtTotaal.bedrag)}</strong>
          <em>{o.verkochtTotaal.aantal} {o.verkochtTotaal.aantal === 1 ? "stuk" : "stuks"}</em>
        </div>
        <div className="bd-tegel inkoop">
          <span className="bd-kop"><Icoon naam="inkoop" maat={16} /> Ingekocht</span>
          <strong>{euro(o.ingekocht.bedrag)}</strong>
          <em>{o.ingekocht.aantal} {o.ingekocht.aantal === 1 ? "stuk" : "stuks"}</em>
        </div>
        <div className="bd-tegel ruil">
          <span className="bd-kop"><Icoon naam="ruil" maat={16} /> Ruil</span>
          <strong>{o.trades.aantal}</strong>
          <em>{o.trades.weg} weg · {o.trades.binnen} binnen</em>
        </div>
      </div>
      {soorten.length > 0 && (
        <div className="bd-soorten">
          {soorten.map((p) => (
            <div key={p.id} className="bd-soort">
              <Icoon naam={PRODUCT_ICOON[p.id]} maat={18} />
              <span><strong>{o.verkocht[p.id].aantal}</strong> {o.verkocht[p.id].aantal === 1 ? p.een : p.veel}</span>
              <em>{euro(o.verkocht[p.id].bedrag)}</em>
            </div>
          ))}
        </div>
      )}
      <div className="bd-regels">
        {(o.trades.bijbetaaldDoorKlant > 0 || o.trades.bijbetaaldDoorOns > 0) && (
          <div className="afsluit-rij"><span>Bijbetaald bij ruil</span><strong>+{euro(o.trades.bijbetaaldDoorKlant)} / −{euro(o.trades.bijbetaaldDoorOns)}</strong></div>
        )}
        {o.retour.aantal > 0 && <div className="afsluit-rij"><span>Retour</span><strong>{o.retour.aantal} · −{euro(o.retour.bedrag)}</strong></div>}
        {c.korting > 0 && <div className="afsluit-rij"><span>Korting gegeven</span><strong>{euro(c.korting)}</strong></div>}
        {s.instellingen.toonMarge && m.gekend > 0 && (
          <div className="afsluit-rij"><span>Marge op verkochte kaarten</span><strong className={m.winst < 0 ? "rood-tekst" : "groen-tekst"}>{m.winst < 0 ? "−" : "+"}{euro(Math.abs(m.winst))}</strong></div>
        )}
      </div>
      {laatste.length > 0 && (
        <>
          <h3 className="bd-titel">Laatste transacties</h3>
          <ul className="transacties">{laatste.map((t) => <TransactieRij key={t.id} t={t} compact beheerder={t.beheerder ? s.beheerders[t.beheerder] : undefined} />)}</ul>
        </>
      )}
      <button className="tekstknop klein" onClick={() => openBeurs(beurs.id)}>Volledig overzicht van {beurs.naam}</button>
    </section>
  );
}

type Weergave = "beurzen" | "transacties";
type Filter = "alles" | TransactieSoort;

/** Alle beurzen (bezig, gepland, voorbij) en alle transacties, per dag. */
export function BeurzenEnTransacties({ onSluit, start = "beurzen" }: { onSluit: () => void; start?: Weergave }) {
  const s = useApp();
  const [weergave, setWeergave] = useState<Weergave>(start);
  const [filter, setFilter] = useState<Filter>("alles");
  const [meer, setMeer] = useState(60);
  const actief = actieveBeurs(s);
  const gepland = geplandeBeurzen(s.beurzen);
  const voorbij = s.beurzen.filter((b) => b.status === "afgesloten").sort((a, b) => b.datum.localeCompare(a.datum));
  const perBeurs = useMemo(() => {
    const m = new Map<string, Transactie[]>();
    for (const t of s.transacties) if (t.beurs_id) m.set(t.beurs_id, [...(m.get(t.beurs_id) ?? []), t]);
    return m;
  }, [s.transacties]);

  const lijst = useMemo(() => s.transacties.filter((t) => filter === "alles" || t.soort === filter).sort((a, b) => b.tijd.localeCompare(a.tijd)), [s.transacties, filter]);
  const dagen = useMemo(() => {
    const uit: { dag: string; items: Transactie[] }[] = [];
    for (const t of lijst.slice(0, meer)) {
      const d = t.tijd.slice(0, 10);
      if (uit[uit.length - 1]?.dag !== d) uit.push({ dag: d, items: [] });
      uit[uit.length - 1].items.push(t);
    }
    return uit;
  }, [lijst, meer]);
  const geteld = (soort: TransactieSoort) => s.transacties.filter((t) => t.soort === soort && t.status !== "ongedaan").length;
  const beursNaam = (id: string | null) => (id ? s.beurzen.find((b) => b.id === id)?.naam : null);

  const beursRij = (b: Beurs, label?: string) => {
    const tr = perBeurs.get(b.id) ?? [];
    const c = beursCijfers(b, tr);
    return (
      <li key={b.id}>
        <button className={`beurs-rij ${b.status}`} onClick={() => openBeurs(b.id)}>
          <span className="komend-datum"><strong>{new Date(b.datum + "T12:00:00").getDate()}</strong>{new Date(b.datum + "T12:00:00").toLocaleDateString("nl-BE", { month: "short" })}</span>
          <span className="lijst-naam">
            <strong>{b.naam}</strong>
            <span className="zacht klein">{label ?? `${c.transacties} transacties · ${c.verkocht} kaarten verkocht`}{b.locatie ? ` · ${b.locatie}` : ""}</span>
          </span>
          {b.status !== "gepland" && <span className="rechts beurs-rij-bedrag"><strong>{euro(c.omzet, true)}</strong><em>omzet</em></span>}
        </button>
      </li>
    );
  };

  return (
    <Sheet titel="Beurzen en transacties" onSluit={onSluit} vol>
      <Segment<Weergave> waarde={weergave} onKies={setWeergave} opties={[{ waarde: "beurzen", label: "Beurzen" }, { waarde: "transacties", label: "Alle transacties" }]} />
      {weergave === "beurzen" ? (
        <>
          {actief && (
            <section className="blok">
              <h3><span className="stip groen" /> Bezig</h3>
              <ul className="lijst">{beursRij(actief)}</ul>
            </section>
          )}
          {gepland.length > 0 && (
            <section className="blok">
              <h3>Gepland</h3>
              <ul className="lijst">{gepland.map((b) => beursRij(b, datumKort(b.datum)))}</ul>
            </section>
          )}
          <section className="blok">
            <h3>Vorige beurzen</h3>
            {!voorbij.length && <p className="zacht">Nog geen afgesloten beurzen. Na het afsluiten vind je ze hier terug, met alle cijfers en transacties.</p>}
            <ul className="lijst">{voorbij.map((b) => beursRij(b))}</ul>
          </section>
        </>
      ) : (
        <>
          <div className="chips filterchips">
            {(["alles", "verkoop", "inkoop", "ruil", "retour"] as Filter[]).map((f) => (
              <button key={f} className={`chip${filter === f ? " aan" : ""}`} onClick={() => setFilter(f)}>
                {f === "alles" ? "Alles" : <><Icoon naam={SOORT[f].icoon} maat={14} /> {SOORT[f].naam} {geteld(f)}</>}
              </button>
            ))}
          </div>
          {!lijst.length && <p className="zacht">Nog geen transacties.</p>}
          {dagen.map((d) => (
            <section key={d.dag} className="dag-groep">
              <h3 className="dag-kop">{dagLang(d.dag + "T12:00:00")}{beursNaam(d.items[0].beurs_id) ? <span className="zacht"> · {beursNaam(d.items[0].beurs_id)}</span> : null}</h3>
              <ul className="transacties">{d.items.map((t) => <TransactieRij key={t.id} t={t} beheerder={t.beheerder ? s.beheerders[t.beheerder] : undefined} />)}</ul>
            </section>
          ))}
          {lijst.length > meer && <button className="knop zacht" onClick={() => setMeer(meer + 100)}>Toon meer ({lijst.length - meer})</button>}
        </>
      )}
    </Sheet>
  );
}
