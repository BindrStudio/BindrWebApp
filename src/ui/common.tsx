import { isValidElement, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { fotoBronnen, type FotoKaart } from "../lib/foto";
import type { Exemplaar } from "../types";
import { euro } from "../lib/format";

const PADEN: Record<string, ReactNode> = {
  chevron: <path d="m6 9 6 6 6-6" />,
  verkoop: <><path d="M7 17 17 7" /><path d="M9 7h8v8" /></>,
  inkoop: <><path d="M17 7 7 17" /><path d="M15 17H7V9" /></>,
  klok: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  historiek: <><path d="M4 12a8 8 0 1 0 2.4-5.7L4 8.5" /><path d="M4 4v4.5h4.5M12 8v4l3 2" /></>,
  wis: <><path d="M5 7h14M10 7V5h4v2M7 7l1 12.5a1.5 1.5 0 0 0 1.5 1.5h5a1.5 1.5 0 0 0 1.5-1.5L17 7" /></>,
  print3d: <><path d="M5 4h14v4H5zM8 8v3h8V8M12 11v3" /><path d="M6 20h12M8 20l1.5-6h5L16 20" /></>,
  slab: <><rect x="6" y="2.5" width="12" height="19" rx="2" /><path d="M6 7.5h12" /><rect x="8.5" y="10" width="7" height="9" rx="1" /></>,
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
  oog: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="3" /></>,
  binder: <><rect x="6" y="3.5" width="13" height="17" rx="2" /><path d="M10 3.5v17M6 8H4M6 12H4M6 16H4" /></>,
  stapel: <><rect x="6" y="8" width="12" height="12" rx="1.5" /><path d="M8 5.5h8M9.5 3h5" /></>,
  mandje: <><path d="M5 9h14l-1.2 9.6a1.5 1.5 0 0 1-1.5 1.4H7.7a1.5 1.5 0 0 1-1.5-1.4L5 9Z" /><path d="M9 9V7a3 3 0 0 1 6 0v2" /></>,
  kassa: <><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18M15.5 14.5h2.5" /></>,
  terug: <path d="M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />,
  ruil: <><path d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7" /></>,
  min: <path d="M5 12h14" />,
  waarschuwing: <><path d="M12 4 2.5 20h19L12 4Z" /><path d="M12 10v4.5M12 17.5h.01" /></>,
  grafiek: <path d="M5 20V11M11 20V5M17 20v-6M3 20h18" />,
  qr: <><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><path d="M14 14h2v2h-2zM18 18h2v2h-2zM14 18h2M18 14h2" /></>,
  instagram: <><rect x="3.5" y="3.5" width="17" height="17" rx="5" /><circle cx="12" cy="12" r="4" /><path d="M17 7h.01" /></>,
  geld: <><rect x="2.5" y="6.5" width="19" height="11" rx="1.5" /><circle cx="12" cy="12" r="2.5" /><path d="M6 9.5v5M18 9.5v5" /></>,
  kaartje: <><rect x="2.5" y="5.5" width="19" height="13" rx="2" /><path d="M2.5 10h19M6 15h4" /></>,
  foto: <><rect x="3.5" y="4.5" width="17" height="15" rx="2" /><circle cx="9" cy="10" r="1.8" /><path d="m4 17 5-5 4 4 2.5-2.5L20 17" /></>,
  sorteer: <path d="M7 4v16M3.5 16.5 7 20l3.5-3.5M17 20V4M13.5 7.5 17 4l3.5 3.5" />,
  link: <><path d="M14 5h5v5M19 5l-8 8" /><path d="M17 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 4 18.5v-10A1.5 1.5 0 0 1 5.5 7H10" /></>,
  tag: <><path d="M3.5 12.2V5a1.5 1.5 0 0 1 1.5-1.5h7.2l8.3 8.3a1.5 1.5 0 0 1 0 2.1l-6.9 6.9a1.5 1.5 0 0 1-2.1 0l-8-8.6Z" /><circle cx="8" cy="8" r="1.4" /></>,
};

export function Icoon({ naam, maat = 22, className }: { naam: keyof typeof PADEN | string; maat?: number; className?: string }) {
  return (
    <svg className={className} width={maat} height={maat} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PADEN[naam]}
    </svg>
  );
}

let sheetNr = 0;

let openSheets = 0;
const stapel: string[] = [];

export function Sheet({ titel, onSluit, children, vol = false, actie }: { titel?: ReactNode; onSluit: () => void; children: ReactNode; vol?: boolean; actie?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useRef(`sheet-titel-${++sheetNr}`);
  // Escape sluit enkel de bovenste sheet (er kan een sheet op een sheet liggen).
  useEffect(() => {
    const mijn = id.current;
    stapel.push(mijn);
    return () => { const i = stapel.lastIndexOf(mijn); if (i >= 0) stapel.splice(i, 1); };
  }, []);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape" && stapel[stapel.length - 1] === id.current) onSluit(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onSluit]);
  // Sheets kunnen op elkaar liggen: de pagina blijft vast tot de laatste dicht is.
  useEffect(() => {
    openSheets++;
    document.body.classList.add("geen-scroll");
    return () => { if (--openSheets <= 0) { openSheets = 0; document.body.classList.remove("geen-scroll"); } };
  }, []);
  // Focus naar de sheet bij openen (tenzij een veld zelf autofocus vraagt), en terug bij sluiten.
  useEffect(() => {
    const vorige = document.activeElement as HTMLElement | null;
    if (!ref.current?.contains(document.activeElement)) ref.current?.focus({ preventScroll: true });
    return () => { vorige?.focus?.({ preventScroll: true }); };
  }, []);
  // Via een portaal naar <body>: een sheet in een sheet blijft zo gewoon over het hele scherm.
  return createPortal(
    <div className="sheet-achtergrond" onClick={(e) => e.target === e.currentTarget && onSluit()}>
      <div className={`sheet${vol ? " vol" : ""}`} ref={ref} role="dialog" aria-modal="true" aria-labelledby={id.current} tabIndex={-1}>
        <div className="sheet-greep" />
        <div className="sheet-kop">
          <div className="sheet-titel" id={id.current}>{titel}</div>
          {actie}
          <button className="rond-knop" onClick={onSluit} aria-label="Sluiten"><Icoon naam="kruis" maat={18} /></button>
        </div>
        <div className="sheet-inhoud">{children}</div>
      </div>
    </div>,
    document.body,
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
    </span>
  );
}

/**
 * Een kaartfoto. Met `kaart` probeert hij na TCGdex ook de reservebronnen (Limitless,
 * pokemontcg.io); lukt niets, dan blijft de eerste letter van de naam staan.
 */
export function KaartFoto({ src, alt, klein = false, kaart, groot = false }: { src: string | null; alt: string; klein?: boolean; kaart?: FotoKaart; groot?: boolean }) {
  const bronnen = useMemo(() => (kaart ? fotoBronnen({ ...kaart, afbeelding: src }, groot ? "groot" : "klein") : src ? [src] : []), [src, kaart?.set_code, kaart?.nummer, kaart?.kaart_id, groot]);
  const [i, setI] = useState(0);
  useEffect(() => setI(0), [bronnen]);
  const bron = bronnen[i];
  return (
    <div className={`foto${klein ? " klein" : ""}`}>
      {bron ? (
        <img key={bron} src={bron} alt={alt} loading="lazy" decoding="async"
          onLoad={(e) => e.currentTarget.classList.add("geladen")}
          onError={() => setI((x) => x + 1)} />
      ) : null}
      <span className="foto-reserve">{alt.slice(0, 1)}</span>
    </div>
  );
}

/**
 * Een veld met een label. Enkel rond één invoerveld is het een echte <label>: rond knoppen
 * (keuzes, een teller) zou het label anders de eerste knop "indrukken" en die knop zijn naam geven.
 */
export function Veld({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  const c = isValidElement<{ className?: string }>(children) ? children : null;
  const invoer = !!c && (["input", "select", "textarea"].includes(c.type as string) || (typeof c.type === "string" && /euro-invoer/.test(c.props.className ?? "")));
  const inhoud = (
    <>
      <span className="veld-label">{label}</span>
      {children}
      {hint && <span className="veld-hint">{hint}</span>}
    </>
  );
  return invoer ? <label className="veld">{inhoud}</label> : <div className="veld" role="group" aria-label={label}>{inhoud}</div>;
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

/** Een QR-code als SVG (scherp op elk scherm en bij het printen). */
export function QrBeeld({ tekst, maat = 240 }: { tekst: string; maat?: number }) {
  if (typeof window === "undefined" || !window.qrcode) return null;
  const qr = window.qrcode(0, "M");
  qr.addData(tekst);
  qr.make();
  const n = qr.getModuleCount();
  let d = "";
  for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (qr.isDark(r, k)) d += `M${k + 4} ${r + 4}h1v1h-1z`;
  return (
    <svg className="qr-beeld" width={maat} height={maat} viewBox={`0 0 ${n + 8} ${n + 8}`} shapeRendering="crispEdges" role="img" aria-label="QR-code">
      <rect width={n + 8} height={n + 8} fill="#fff" />
      <path d={d} fill="#000" />
    </svg>
  );
}

/** Is dit hartje lager dan (of gelijk aan) wat we ervoor betaalden? */
export const onderAankoop = (prijs: number | null | undefined, aankoop: number | null | undefined) =>
  prijs != null && aankoop != null && aankoop > 0 && prijs <= aankoop;

/**
 * Waarschuwing vóór een hartje onder de aankoopprijs: misschien een tikfout, of beter
 * om de kaart even mee te nemen in de vault tot ze weer meer waard is.
 */
export function OnderAankoop({ prijs, aankoop, onToch, onVault, onAnders, tochTekst, vaultTekst, uitleg }: {
  prijs: number; aankoop: number; onToch: () => void; onVault?: () => void; onAnders?: () => void;
  tochTekst?: string; vaultTekst?: string; uitleg?: string;
}) {
  const verlies = Math.round((aankoop - prijs) * 100) / 100;
  return (
    <div className="onder-aankoop" role="alertdialog" aria-label="Onder de aankoopprijs">
      <div className="onder-aankoop-kop">
        <Icoon naam="waarschuwing" maat={20} />
        <strong>{verlies > 0 ? `${euro(prijs)} is ${euro(verlies)} minder dan jullie betaalden` : `${euro(prijs)} is precies de aankoopprijs`}</strong>
      </div>
      <p>{uitleg ?? `Aankoopprijs ${euro(aankoop)}. Klopt dat hartje, of is het slimmer om de kaart even in de vault te bewaren tot ze weer meer waard is?`}</p>
      <div className="knoppenrij">
        {onVault && <button className="knop" onClick={onVault}><Icoon naam="doos" maat={18} /> {vaultTekst ?? "Naar de vault"}</button>}
        <button className="knop zacht" onClick={onToch}>{tochTekst ?? `Toch ${euro(prijs)}`}</button>
        {onAnders && <button className="tekstknop" onClick={onAnders}>Andere prijs</button>}
      </div>
    </div>
  );
}
