// Graded kaarten (slabs): grader, grade en certificaat, en de prijs zoals verzamelaars die
// bepalen: de laatste verkopen op eBay. Die zoeken we op via gewone links (scrapen mag niet);
// wat je vindt, typ je hier in en de app maakt er een schatting van.
import { useState } from "react";
import type { Verkoop } from "../types";
import { datumKort, euro, getal, vandaag } from "../lib/format";
import { certLink, ebaySoldLink, schattingUitVerkopen } from "../lib/markt";
import { Icoon, Kiezer, Veld } from "./common";

export const GRADERS = ["PSA", "CGC", "BGS", "SGC", "ACE", "TAG"] as const;

export function GradedVelden({ grader, grade, cert, onChange }: {
  grader: string; grade: string; cert: string; onChange: (w: { grader?: string; grade?: string; cert?: string }) => void;
}) {
  return (
    <div className="graded-velden">
      <Veld label="Grader"><Kiezer waarde={grader} opties={[...GRADERS]} onKies={(g) => onChange({ grader: g })} /></Veld>
      <div className="twee">
        <Veld label="Grade"><input inputMode="decimal" value={grade} onChange={(e) => onChange({ grade: e.target.value })} placeholder="10" /></Veld>
        <Veld label="Certificaat (optioneel)"><input inputMode="numeric" value={cert} onChange={(e) => onChange({ cert: e.target.value })} placeholder="nummer op het label" /></Veld>
      </div>
    </div>
  );
}

/** Knop naar de verkochte advertenties op eBay (en het certificaat, als we het nummer hebben). */
export function SoldLinks({ zoek, grader, cert }: { zoek: string; grader?: string | null; cert?: string | null }) {
  const c = certLink(grader, cert);
  return (
    <div className="sold-links">
      <a className="knop zacht klein" href={ebaySoldLink(zoek)} target="_blank" rel="noreferrer"><Icoon naam="link" maat={14} /> Verkochte op eBay</a>
      {c && <a className="knop zacht klein" href={c} target="_blank" rel="noreferrer">Certificaat</a>}
    </div>
  );
}

/**
 * De laatste verkopen die je opzocht: datum, prijs en bron. De app toont een schatting
 * (mediaan, recente verkopen tellen dubbel) en geeft die door als voorstel.
 */
export function VerkopenBlok({ verkopen, onChange, zoek, grader, cert, onSchatting }: {
  verkopen: Verkoop[]; onChange: (v: Verkoop[]) => void; zoek: string; grader?: string | null; cert?: string | null;
  onSchatting?: (x: number) => void;
}) {
  const [v, setV] = useState({ datum: vandaag(), prijs: "", bron: "eBay" });
  const schatting = schattingUitVerkopen(verkopen);
  const voegToe = () => {
    const p = getal(v.prijs);
    if (p == null || p <= 0) return;
    onChange([...verkopen, { datum: v.datum || vandaag(), prijs: Math.round(p * 100) / 100, bron: v.bron }].sort((a, b) => b.datum.localeCompare(a.datum)).slice(0, 12));
    setV({ ...v, prijs: "" });
  };
  return (
    <section className="blok verkopen-blok">
      <h3>Laatste verkopen</h3>
      <p className="zacht klein">Graded kaarten prijs je op wat ze echt opbrachten. Zoek "{zoek}" op, en typ hier de laatste verkopen in.</p>
      <SoldLinks zoek={zoek} grader={grader} cert={cert} />
      {verkopen.length > 0 && (
        <ul className="verkopen">
          {verkopen.map((x, i) => (
            <li key={`${x.datum}-${i}`}>
              <span>{datumKort(x.datum)}</span>
              <span className="zacht klein">{x.bron}</span>
              <strong>{euro(x.prijs)}</strong>
              <button className="rond-knop" onClick={() => onChange(verkopen.filter((_, j) => j !== i))} aria-label="Weg"><Icoon naam="kruis" maat={14} /></button>
            </li>
          ))}
        </ul>
      )}
      <div className="verkoop-invoer">
        <input type="date" value={v.datum} onChange={(e) => setV({ ...v, datum: e.target.value })} aria-label="Datum van de verkoop" />
        <span className="euro-invoer mini"><span>€</span><input inputMode="decimal" value={v.prijs} onChange={(e) => setV({ ...v, prijs: e.target.value })} placeholder="prijs" aria-label="Prijs"
          onKeyDown={(e) => e.key === "Enter" && voegToe()} /></span>
        <select value={v.bron} onChange={(e) => setV({ ...v, bron: e.target.value })} aria-label="Bron">
          {["eBay", "Cardmarket", "Vinted", "Beurs", "Andere"].map((b) => <option key={b}>{b}</option>)}
        </select>
        <button className="knop klein" onClick={voegToe} disabled={!(getal(v.prijs) ?? 0)}>Voeg toe</button>
      </div>
      {schatting != null && (
        <div className="schatting">
          <span>Schatting uit {verkopen.length} {verkopen.length === 1 ? "verkoop" : "verkopen"}</span>
          <strong>{euro(schatting)}</strong>
          {onSchatting && <button className="tekstknop klein" onClick={() => onSchatting(schatting)}>Gebruik</button>}
        </div>
      )}
    </section>
  );
}
