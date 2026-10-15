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
  code?: string | null; // officiële afkorting (PFL), als reserve wanneer het logo niet laadt
}

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
  const lijst = useMemo(() => {
    const w = zonderAccenten(q.trim());
    return w ? sets.filter((s) => zonderAccenten(`${s.naam} ${s.id}`).includes(w)) : sets;
  }, [sets, q]);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", esc);
    document.body.classList.add("geen-scroll");
    return () => { window.removeEventListener("keydown", esc); document.body.classList.remove("geen-scroll"); };
  }, [open]);
  const kies = (id: string) => { onKies(id); setOpen(false); setQ(""); };

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
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Zoek een set" inputMode="search" aria-label="Zoek een set" />
              </div>
              <div className="set-raster">
                {!q && (
                  <button className={`set-tegel alle${!gekozen ? " aan" : ""}`} onClick={() => kies("")}>
                    <span className="set-logo-tekst">Alle sets</span>
                    <em>{sets.reduce((n, s) => n + s.aantal, 0)} kaarten</em>
                  </button>
                )}
                {lijst.map((s, i) => (
                  <button key={s.id} className={`set-tegel${s.id === gekozen ? " aan" : ""}`} style={{ ["--i" as string]: Math.min(i, 20) }} onClick={() => kies(s.id)}>
                    <span className="set-logo-vak"><Logo s={s} /></span>
                    <span className="set-naam">{s.naam}</span>
                    <em>{s.aantal} {s.aantal === 1 ? "kaart" : "kaarten"}{s.release ? ` · ${s.release.slice(0, 4)}` : ""}</em>
                  </button>
                ))}
              </div>
              {!lijst.length && <p className="zacht center">Geen set gevonden.</p>}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
