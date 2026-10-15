import { useEffect, useRef, type ReactNode } from "react";
import type { Exemplaar } from "../types";
import { euro } from "../lib/format";

const PADEN: Record<string, ReactNode> = {
  doos: <><path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5v-9Z" /><path d="m3 7.5 9 4.5 9-4.5M12 12v9" /></>,
  scan: <><path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16" /><path d="M7 12h10" /></>,
  label: <><path d="M3.5 12.2V5a1.5 1.5 0 0 1 1.5-1.5h7.2l8.3 8.3a1.5 1.5 0 0 1 0 2.1l-6.9 6.9a1.5 1.5 0 0 1-2.1 0l-8-8.6Z" /><circle cx="8" cy="8" r="1.4" /></>,
  meer: <><circle cx="5.5" cy="12" r="1.3" /><circle cx="12" cy="12" r="1.3" /><circle cx="18.5" cy="12" r="1.3" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  zoek: <><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></>,
  camera: <><path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2.2l1.5-2h5.6l1.5 2h2.2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5v-9Z" /><circle cx="12" cy="13" r="3.5" /></>,
  printer: <><path d="M7 9V4h10v5" /><rect x="4" y="9" width="16" height="7" rx="1.5" /><path d="M7 14h10v6H7z" /></>,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  kruis: <path d="M6 6l12 12M18 6 6 18" />,
  pijlRechts: <path d="m9 5 7 7-7 7" />,
  vernieuw: <><path d="M20 11a8 8 0 0 0-14.3-4.9L4 8" /><path d="M4 4v4h4M4 13a8 8 0 0 0 14.3 4.9L20 16" /><path d="M20 20v-4h-4" /></>,
  op: <path d="M12 19V5m-6 6 6-6 6 6" />,
  neer: <path d="M12 5v14m-6-6 6 6 6-6" />,
  slot: <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  slotOpen: <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 7.5-2" /></>,
  hart: <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" />,
  bluetooth: <path d="m7 7 10 10-5 4V3l5 4L7 17" />,
  toetsen: <><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M7 10h.01M11 10h.01M15 10h.01M7 14h10" /></>,
  vitrine: <><rect x="3.5" y="4" width="17" height="13" rx="2" /><path d="M3.5 13h17M8 20h8M12 17v3" /></>,
  uit: <><path d="M15 4h3.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H15" /><path d="m10 16 4-4-4-4M14 12H4" /></>,
};

export function Icoon({ naam, maat = 22, className }: { naam: keyof typeof PADEN | string; maat?: number; className?: string }) {
  return (
    <svg className={className} width={maat} height={maat} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PADEN[naam]}
    </svg>
  );
}

export function Sheet({ titel, onSluit, children, vol = false, actie }: { titel?: ReactNode; onSluit: () => void; children: ReactNode; vol?: boolean; actie?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onSluit();
    window.addEventListener("keydown", esc);
    document.body.classList.add("geen-scroll");
    return () => { window.removeEventListener("keydown", esc); document.body.classList.remove("geen-scroll"); };
  }, [onSluit]);
  return (
    <div className="sheet-achtergrond" onClick={(e) => e.target === e.currentTarget && onSluit()}>
      <div className={`sheet${vol ? " vol" : ""}`} ref={ref} role="dialog" aria-modal="true">
        <div className="sheet-greep" />
        <div className="sheet-kop">
          <div className="sheet-titel">{titel}</div>
          {actie}
          <button className="rond-knop" onClick={onSluit} aria-label="Sluiten"><Icoon naam="kruis" maat={18} /></button>
        </div>
        <div className="sheet-inhoud">{children}</div>
      </div>
    </div>
  );
}

export function Segment<T extends string>({ waarde, opties, onKies }: { waarde: T; opties: { waarde: T; label: ReactNode }[]; onKies: (w: T) => void }) {
  const i = Math.max(0, opties.findIndex((o) => o.waarde === waarde));
  return (
    <div className="segment" style={{ ["--n" as string]: opties.length, ["--i" as string]: i }}>
      <span className="segment-duim" />
      {opties.map((o) => (
        <button key={o.waarde} className={o.waarde === waarde ? "aan" : ""} onClick={() => onKies(o.waarde)}>{o.label}</button>
      ))}
    </div>
  );
}

export function Leeg({ titel, tekst, children }: { titel: string; tekst?: string; children?: ReactNode }) {
  return (
    <div className="leeg">
      <img src="img/eend.png" alt="" width={112} height={112} />
      <h3>{titel}</h3>
      {tekst && <p>{tekst}</p>}
      {children}
    </div>
  );
}

export function Hartje({ prijs, groot = false }: { prijs: number | null; groot?: boolean }) {
  return (
    <span className={`hartje${groot ? " groot" : ""}${prijs == null ? " leeg-hart" : ""}`}>
      <Icoon naam="hart" maat={groot ? 18 : 14} />
      {prijs == null ? "geen hartje" : euro(prijs)}
    </span>
  );
}

export function Badges({ ex }: { ex: Exemplaar }) {
  return (
    <span className="badges">
      {ex.soort === "slab" ? <span className="badge">{[ex.grader, ex.grade].filter(Boolean).join(" ") || "slab"}</span> : ex.conditie && <span className="badge">{ex.conditie}</span>}
      {ex.taal !== "EN" && ex.soort !== "eigen product" && <span className="badge taal">{ex.taal.startsWith("CN") ? "CN" : ex.taal}</span>}
      {ex.variant === "reverse holo" && <span className="badge">RH</span>}
      {ex.status === "gereserveerd" && <span className="badge geel">gereserveerd</span>}
    </span>
  );
}

export function KaartFoto({ src, alt, klein = false }: { src: string | null; alt: string; klein?: boolean }) {
  return (
    <div className={`foto${klein ? " klein" : ""}`}>
      {src ? (
        <img src={src} alt={alt} loading="lazy" decoding="async"
          onLoad={(e) => e.currentTarget.classList.add("geladen")}
          onError={(e) => { e.currentTarget.style.display = "none"; }} />
      ) : null}
      <span className="foto-reserve">{alt.slice(0, 1)}</span>
    </div>
  );
}

export function Veld({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="veld">
      <span className="veld-label">{label}</span>
      {children}
      {hint && <span className="veld-hint">{hint}</span>}
    </label>
  );
}

export function Kiezer<T extends string>({ waarde, opties, onKies }: { waarde: T; opties: readonly T[] | { waarde: T; label: string }[]; onKies: (w: T) => void }) {
  const lijst = (opties as unknown[]).map((o) => (typeof o === "string" ? { waarde: o as T, label: o as string } : (o as { waarde: T; label: string })));
  return (
    <div className="kiezer">
      {lijst.map((o) => (
        <button type="button" key={o.waarde} className={`chip${o.waarde === waarde ? " aan" : ""}`} onClick={() => onKies(o.waarde)}>{o.label}</button>
      ))}
    </div>
  );
}
