// Een set kiezen met het logo van de set (gedeeld door de klantenpagina en het beheer).
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { zonderAccenten } from "../lib/format";

export interface SetOptie {
  id: string;
  naam: string;
  aantal: number;
  release: string;
  logo: string | null;
  code?: string | null;  // officiële afkorting (PFL), als reserve wanneer het logo niet laadt
  taal?: "en" | "ja" | "zh";
  intl?: string | null;  // Japanse set: de internationale set met dezelfde kaarten (M6 Storm Emeralda ≈ Delta Reign)
  eigen?: string | null; // de naam in het Japans of Chinees
}

const TAALTABS = [
  { id: "en", label: "Engels" }, { id: "ja", label: "Japans" }, { id: "zh", label: "Chinees" },
] as const;

/** Zonder logo: een rond embleem met de setcode (of de beginletters), zodat de naam er niet twee keer staat. */
function Embleem({ s, klein }: { s: SetOptie; klein: boolean }) {
  const tekst = (s.code || s.naam.split(/[\s:&-]+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 3) || "?").toUpperCase();
  return klein ? <span className="set-logo-tekst klein">{s.naam}</span> : <span className="set-embleem" aria-hidden="true">{tekst}</span>;
}

function Logo({ s, klein = false }: { s: SetOptie; klein?: boolean }) {
  const [kapot, setKapot] = useState(false);
  if (!s.logo || kapot) return <Embleem s={s} klein={klein} />;
  return <img className={klein ? "set-mini" : "set-logo"} src={s.logo} alt={s.naam} loading="lazy" onError={() => setKapot(true)} />;
}

export function SetKiezer({ sets, gekozen, onKies }: { sets: SetOptie[]; gekozen: string; onKies: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const huidig = sets.find((s) => s.id === gekozen);
  const talen = TAALTABS.filter((t) => sets.some((s) => (s.taal ?? "en") === t.id));
  const [taal, setTaal] = useState<"en" | "ja" | "zh">(() => huidig?.taal ?? talen[0]?.id ?? "en");
  useEffect(() => { if (open) setTaal(huidig?.taal ?? (talen.some((t) => t.id === taal) ? taal : talen[0]?.id ?? "en")); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const lijst = useMemo(() => {
    const w = zonderAccenten(q.trim());
    // Zoeken gaat over alle talen (ook de internationale en de originele naam); anders enkel de gekozen taal.
    return w ? sets.filter((s) => zonderAccenten(`${s.naam} ${s.id} ${s.code ?? ""} ${s.intl ?? ""} ${s.eigen ?? ""}`).includes(w))
      : talen.length > 1 ? sets.filter((s) => (s.taal ?? "en") === taal) : sets;
  }, [sets, q, taal, talen.length]);
  // Per jaar van uitgave, het nieuwste eerst.
  const perJaar = useMemo(() => {
    const m = new Map<string, SetOptie[]>();
    for (const s of lijst.slice().sort((a, b) => b.release.localeCompare(a.release) || a.naam.localeCompare(b.naam))) {
      const j = s.release.slice(0, 4) || "Onbekend";
      m.set(j, [...(m.get(j) ?? []), s]);
    }
    return [...m.entries()];
  }, [lijst]);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", esc);
    document.body.classList.add("geen-scroll");
    return () => { window.removeEventListener("keydown", esc); document.body.classList.remove("geen-scroll"); };
  }, [open]);
  const kies = (id: string) => { onKies(id); setOpen(false); setQ(""); };
  let n = 0;

  return (
    <>
      <button type="button" className={`chip setkeuze-knop${gekozen ? " aan" : ""}`} onClick={() => setOpen(true)} aria-haspopup="dialog">
        {huidig ? <><Logo s={huidig} klein /><span className="verborgen-mobiel">{huidig.naam}</span></> : "Alle sets"}
        <span aria-hidden="true">▾</span>
      </button>
      {open && createPortal(
        <div className="sheet-achtergrond" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="sheet vol set-sheet" role="dialog" aria-modal="true" aria-label="Kies een set">
            <div className="sheet-greep" />
            <div className="sheet-kop">
              <div className="sheet-titel">Kies een set</div>
              <button className="rond-knop" onClick={() => setOpen(false)} aria-label="Sluiten">✕</button>
            </div>
            <div className="sheet-inhoud">
              <div className="zoekbalk">
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Zoek een set (ook Japans of internationaal)" inputMode="search" aria-label="Zoek een set" />
              </div>
              {talen.length > 1 && !q && (
                <div className="set-talen" role="tablist" aria-label="Taal van de set">
                  {talen.map((t) => (
                    <button key={t.id} role="tab" aria-selected={taal === t.id} className={`chip${taal === t.id ? " aan" : ""}`} onClick={() => setTaal(t.id)}>
                      {t.label} <span className="set-taal-aantal">{sets.filter((s) => (s.taal ?? "en") === t.id).length}</span>
                    </button>
                  ))}
                </div>
              )}
              {!q && (
                <button className={`set-tegel alle${!gekozen ? " aan" : ""}`} onClick={() => kies("")}>
                  <span className="set-logo-tekst">Alle sets</span>
                  <em>{sets.reduce((x, s) => x + s.aantal, 0)} kaarten</em>
                </button>
              )}
              {perJaar.map(([jaar, groep]) => (
                <section key={jaar} className="set-jaar">
                  <h3 className="set-jaar-kop"><span>{jaar}</span><em>{groep.length} {groep.length === 1 ? "set" : "sets"}</em></h3>
                  <div className="set-raster">
                    {groep.map((s) => (
                      <button key={s.id} className={`set-tegel${s.id === gekozen ? " aan" : ""}`} style={{ ["--i" as string]: Math.min(n++, 20) }} onClick={() => kies(s.id)}>
                        <span className="set-logo-vak"><Logo s={s} /></span>
                        <span className="set-naam">{s.naam}</span>
                        {s.intl && s.intl !== s.naam && <span className="set-intl">≈ {s.intl}</span>}
                        <em>{s.aantal} {s.aantal === 1 ? "kaart" : "kaarten"}{q && s.taal && s.taal !== "en" ? ` · ${s.taal === "ja" ? "Japans" : "Chinees"}` : ""}</em>
                      </button>
                    ))}
                  </div>
                </section>
              ))}
              {!lijst.length && <p className="zacht center">Geen set gevonden.</p>}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
