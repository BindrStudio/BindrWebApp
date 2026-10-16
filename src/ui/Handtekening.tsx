// Tekenen op het scherm (voor het borderel). We bewaren een SVG-pad met enkel M/L en getallen:
// klein (een paar kB), scherp bij het printen, en nooit iets anders dan lijnen.
import { useEffect, useRef, useState } from "react";
import { maakPad, veiligPad } from "../lib/boekhouding";
import { Sheet } from "./common";

const B = 600; // breedte van het tekenvlak in punten (de hoogte is een derde)
const H = 200;

/** Toont een handtekening (of niets als het pad niet klopt). */
export function HandtekeningBeeld({ pad, klein = false }: { pad: string | null | undefined; klein?: boolean }) {
  const d = veiligPad(pad);
  if (!d) return null;
  return (
    <svg className={`handtekening-beeld${klein ? " klein" : ""}`} viewBox={`0 0 ${B} ${H}`} role="img" aria-label="Handtekening">
      <path d={d} fill="none" stroke="currentColor" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Een tekenvlak in een sheet. `onKlaar` krijgt het pad, of null als er niets getekend werd. */
export function HandtekeningPad({ titel, uitleg, onKlaar, onSluit }: { titel: string; uitleg?: string; onKlaar: (pad: string | null) => void; onSluit: () => void }) {
  const vlak = useRef<SVGSVGElement>(null);
  const [lijnen, setLijnen] = useState<[number, number][][]>([]);
  const bezig = useRef<[number, number][] | null>(null);

  const punt = (e: React.PointerEvent): [number, number] => {
    const r = vlak.current!.getBoundingClientRect();
    return [Math.round(((e.clientX - r.left) / r.width) * B), Math.round(((e.clientY - r.top) / r.height) * H)];
  };
  const begin = (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    bezig.current = [punt(e)];
    setLijnen((l) => [...l, bezig.current!]);
  };
  const beweeg = (e: React.PointerEvent) => {
    if (!bezig.current) return;
    const p = punt(e);
    const vorig = bezig.current[bezig.current.length - 1];
    if (Math.abs(p[0] - vorig[0]) + Math.abs(p[1] - vorig[1]) < 3) return; // minder punten, zelfde lijn
    bezig.current.push(p);
    setLijnen((l) => [...l.slice(0, -1), bezig.current!.slice()]);
  };
  const stop = () => { bezig.current = null; };
  // Niet meescrollen terwijl je tekent (iOS).
  useEffect(() => {
    const el = vlak.current;
    const tegen = (e: TouchEvent) => e.preventDefault();
    el?.addEventListener("touchmove", tegen, { passive: false });
    return () => el?.removeEventListener("touchmove", tegen);
  }, []);

  const pad = maakPad(lijnen);

  return (
    <Sheet titel={titel} onSluit={onSluit}>
      {uitleg && <p className="zacht klein">{uitleg}</p>}
      <svg ref={vlak} className="handtekening-vlak" viewBox={`0 0 ${B} ${H}`}
        onPointerDown={begin} onPointerMove={beweeg} onPointerUp={stop} onPointerCancel={stop} onPointerLeave={stop}>
        <line x1={30} x2={B - 30} y1={H - 40} y2={H - 40} className="handtekening-lijn" />
        {pad && <path d={pad} fill="none" stroke="currentColor" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />}
        {!pad && <text x={B / 2} y={H / 2} textAnchor="middle" className="handtekening-hint">Teken hier met je vinger</text>}
      </svg>
      <div className="knoppenrij">
        <button className="knop zacht" onClick={() => setLijnen([])} disabled={!pad}>Opnieuw</button>
        <button className="knop" onClick={() => onKlaar(pad || null)} disabled={!pad}>Klaar</button>
      </div>
    </Sheet>
  );
}
