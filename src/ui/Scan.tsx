// Scannen, drie in één: de camera blijft open en herkent zelf een Bind'r-QR-code of
// (als er geen QR in beeld is en de camera even stilstaat) de kaart zelf via tekstherkenning.
// Wat herkend wordt, komt in een lijstje, zodat je meerdere kaarten na elkaar kunt nemen.
// Elk exemplaar is uniek: twee keer hetzelfde scannen zet het niet twee keer in de lijst.
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { bevestigLabel, huidig, inMandje, meld, naarTab, openExemplaar, openToevoegen, useApp } from "../state";
import type { CatalogusKaart, Exemplaar } from "../types";
import { beeldDetail, beeldVerschil, bestandNaarCanvas, duimnagel, fotoUitKader, leesQr, startCamera, stopCamera, tril } from "../lib/camera";
import { normaliseerCode, toonCode } from "../lib/code";
import { afbeelding, herken, laadCatalogus } from "../lib/catalog";
import { laadOcr, leesKaart } from "../lib/ocr";
import { regelUit } from "../lib/kassa";
import { inVoorraad } from "../lib/exemplaar";
import { euro } from "../lib/format";
import { Badges, Hartje, Icoon, KaartFoto } from "./common";

export type Via = "qr" | "foto" | "code";
const PROEFCODE = "7K2QX9";
const AUTO_SLEUTEL = "bindr-autofoto-v1";

/** Zoekt een gescande code op en bevestigt het label als het pas geprint was. */
export function verwerkCode(code: string): Exemplaar | null {
  const ex = huidig().exemplaren.find((e) => e.code === code);
  if (!ex) {
    if (code === PROEFCODE) meld("Proeflabel gelezen: de QR-code werkt", "ok");
    else meld(`Code ${toonCode(code)} staat niet in de voorraad`, "fout");
    return null;
  }
  tril();
  if (ex.label_status === "geprint") void bevestigLabel(ex);
  return ex;
}

// ── De camera ────────────────────────────────────────────────────────────────

function useCamera(actief: boolean) {
  const video = useRef<HTMLVideoElement>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [klaar, setKlaar] = useState(false);
  const [poging, setPoging] = useState(0);
  const [lamp, setLamp] = useState<{ kan: boolean; aan: boolean }>({ kan: false, aan: false });
  const stream = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!actief || !video.current) return;
    let weg = false;
    setFout(null);
    startCamera(video.current)
      .then((s) => {
        if (weg) return stopCamera(s);
        stream.current = s;
        setKlaar(true);
        const track = s.getVideoTracks()[0];
        const caps = (track?.getCapabilities?.() || {}) as { torch?: boolean };
        setLamp({ kan: !!caps.torch, aan: false });
      })
      .catch((e: Error) => {
        if (weg) return;
        setFout(e.name === "NotAllowedError"
          ? "De app mag de camera niet gebruiken. Geef toestemming in de instellingen van je browser en probeer opnieuw."
          : e.name === "NotFoundError" ? "Geen camera gevonden op dit toestel." : e.message);
      });
    return () => {
      weg = true;
      stopCamera(stream.current);
      stream.current = null;
      setKlaar(false);
    };
  }, [actief, poging]);

  const zetLamp = async (aan: boolean) => {
    const track = stream.current?.getVideoTracks()[0];
    try {
      await track?.applyConstraints({ advanced: [{ torch: aan } as MediaTrackConstraintSet] });
      setLamp({ kan: true, aan });
    } catch { setLamp({ kan: false, aan: false }); }
  };

  return { video, fout, klaar, opnieuw: () => setPoging((p) => p + 1), lamp, zetLamp };
}

export interface FotoResultaat {
  kandidaten: CatalogusKaart[];
  zeker: boolean;
  foto: string;
}

/**
 * De scanner: één camera voor QR-codes én kaartfoto's, met een sluiter, een knop voor de
 * galerij en een vak om de code te typen. `onExemplaar` krijgt elk gevonden exemplaar,
 * `onFoto` de kaarten die de tekstherkenning vond.
 */
export function Scanner({ gepauzeerd = false, onExemplaar, onFoto, compact = false }: {
  gepauzeerd?: boolean;
  onExemplaar: (ex: Exemplaar, via: Via) => void;
  onFoto: (r: FotoResultaat) => void;
  compact?: boolean;
}) {
  const { video, fout, klaar, opnieuw, lamp, zetLamp } = useCamera(true);
  const [auto, setAuto] = useState(() => { try { return localStorage.getItem(AUTO_SLEUTEL) !== "uit"; } catch { return true; } });
  const [status, setStatus] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);
  const [flits, setFlits] = useState<"qr" | "foto" | null>(null);
  const [ocrFout, setOcrFout] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const galerij = useRef<HTMLInputElement>(null);
  const canvas = useRef<HTMLCanvasElement>(document.createElement("canvas"));

  // De lus leest de laatste waarden via refs, zodat ze niet telkens opnieuw start.
  const pauze = useRef(gepauzeerd); pauze.current = gepauzeerd;
  const autoRef = useRef(auto); autoRef.current = auto;
  const bezigRef = useRef(false);
  const cbEx = useRef(onExemplaar); cbEx.current = onExemplaar;
  const cbFoto = useRef(onFoto); cbFoto.current = onFoto;

  const knipper = (soort: "qr" | "foto") => { setFlits(soort); setTimeout(() => setFlits(null), 380); };

  /** Tekstherkenning op een foto; eigen voorraad krijgt voorrang bij twijfel. */
  const herkenFoto = async (foto: HTMLCanvasElement, handmatig: boolean): Promise<boolean> => {
    bezigRef.current = true;
    setBezig(true);
    try {
      const tekst = await leesKaart(foto, handmatig ? setStatus : undefined);
      if (handmatig) setStatus("Kaart zoeken…");
      const indexen = await Promise.all([laadCatalogus("en"), laadCatalogus("asia")]);
      const voorraad = new Set(huidig().exemplaren.filter(inVoorraad).map((e) => e.kaart_id).filter(Boolean));
      const r = herken(indexen, tekst, (k) => (voorraad.has(k.id) ? 25 : 0));
      if (r.kandidaten.length && !r.zeker && !handmatig) {
        // Vanzelf gelezen maar niet zeker: niets toevoegen, wel een tip.
        setStatus("Niet zeker herkend: tik op de sluiter voor een scherpe foto");
        return false;
      }
      if (r.kandidaten.length) {
        knipper("foto");
        tril(40);
        cbFoto.current({ kandidaten: r.kandidaten.map((k) => k.kaart), zeker: r.zeker, foto: foto.toDataURL("image/jpeg", 0.5) });
        setStatus(null);
        return true;
      }
      setStatus(handmatig ? "Geen kaart herkend. Hou de kaart recht in het kader, met het nummer onderaan scherp." : null);
      return false;
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      setOcrFout(m);
      setStatus(m);
      return false;
    } finally {
      bezigRef.current = false;
      setBezig(false);
    }
  };

  useEffect(() => {
    if (!klaar) return;
    if (autoRef.current) laadOcr().catch((e) => setOcrFout(e instanceof Error ? e.message : String(e)));
    let stop = false;
    let laatsteCode = { code: "", tijd: 0 };
    let geenBindr = 0;
    let vorige: Uint8Array | null = null;
    let stilSinds = 0;
    let laatsteQr = 0;
    let laatsteOcr = 0;
    let ocrBeeld: Uint8Array | null = null;

    const lus = () => {
      if (stop) return;
      const v = video.current;
      if (!pauze.current && v && v.readyState >= 2) {
        const nu = Date.now();
        const { code, ruw } = leesQr(v, canvas.current);
        if (code) {
          laatsteQr = nu;
          if (code !== laatsteCode.code || nu - laatsteCode.tijd > 2500) {
            laatsteCode = { code, tijd: nu };
            const ex = verwerkCode(code);
            if (ex) { knipper("qr"); cbEx.current(ex, "qr"); }
          } else laatsteCode.tijd = nu;
        } else if (ruw && nu - geenBindr > 4000) {
          laatsteQr = nu;
          geenBindr = nu;
          meld("Dit is geen Bind'r-code", "info", undefined, 2500);
        }

        // Geen QR-code? Staat het beeld even stil en is er iets te zien, dan lezen we de kaart zelf.
        const duim = duimnagel(v);
        if (beeldVerschil(duim, vorige) > 7) stilSinds = nu;
        vorige = duim;
        if (autoRef.current && !bezigRef.current && !ocrFout &&
            nu - stilSinds > 900 && nu - laatsteQr > 1500 && nu - laatsteOcr > 2500 &&
            beeldDetail(duim) > 22 && beeldVerschil(duim, ocrBeeld) > 12) {
          laatsteOcr = nu;
          ocrBeeld = duim;
          setStatus("Kaart lezen…");
          void herkenFoto(fotoUitKader(v), false).then(() => { laatsteOcr = Date.now(); });
        }
      }
      setTimeout(() => requestAnimationFrame(lus), 140);
    };
    lus();
    return () => { stop = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [klaar, ocrFout]);

  const zetAuto = (aan: boolean) => {
    setAuto(aan);
    try { localStorage.setItem(AUTO_SLEUTEL, aan ? "aan" : "uit"); } catch { /* privé-modus */ }
    if (aan) { setOcrFout(null); laadOcr().catch((e) => setOcrFout(e instanceof Error ? e.message : String(e))); }
  };

  const typ = (t: string) => {
    setCode(t);
    const c = normaliseerCode(t);
    if (!c) return;
    const ex = verwerkCode(c);
    if (ex) { onExemplaar(ex, "code"); setCode(""); }
  };

  return (
    <div className={`scanner${compact ? " compact" : ""}`}>
      <div className={`camera-vak kaartvorm${flits ? ` flits ${flits}` : ""}`}>
        <video ref={video} className="camera-video" playsInline muted />
        {fout ? <CameraFout tekst={fout} onOpnieuw={opnieuw} /> : (
          <>
            <div className={`zoeker kaart${bezig ? " leest" : ""}`} aria-hidden="true"><span /><span /><span /><span /><i className="scanlijn" /></div>
            {!klaar && <div className="camera-laden">Camera starten…</div>}
            <div className="camera-status" aria-live="polite">
              {bezig ? <><span className="draaier klein" /> {status ?? "Kaart lezen…"}</> : status ?? (auto && !ocrFout ? "QR-code of kaart in beeld houden" : "Richt op de QR-code")}
            </div>
            <label className={`auto-schakel${auto && !ocrFout ? " aan" : ""}`} title={ocrFout ? `Kaarten herkennen lukt nu niet: ${ocrFout}` : "Kaarten vanzelf herkennen als er geen QR-code in beeld is"}>
              <input type="checkbox" checked={auto} onChange={(e) => zetAuto(e.target.checked)} />
              <span>{ocrFout && auto ? "Kaart: offline" : "Kaart vanzelf"}</span>
            </label>
            {lamp.kan && (
              <button className={`rond-knop lamp${lamp.aan ? " aan" : ""}`} onClick={() => void zetLamp(!lamp.aan)} aria-label="Zaklamp">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3h8l-1 5H9L8 3ZM9 8l1 13h4l1-13" /></svg>
              </button>
            )}
          </>
        )}
      </div>

      <div className="scanner-knoppen">
        <button className="rond-knop groot" onClick={() => galerij.current?.click()} aria-label="Foto uit de galerij" title="Foto uit de galerij"><Icoon naam="kaartje" maat={20} /></button>
        <div className="code-rij typ-code">
          <Icoon naam="toetsen" maat={18} />
          <input className="code-veld klein" value={code} onChange={(e) => typ(e.target.value)} placeholder="Of typ de code" maxLength={9}
            autoCapitalize="characters" autoCorrect="off" spellCheck={false} aria-label="Code typen" />
        </div>
        <button className="sluiter klein" disabled={!klaar || bezig} aria-label="Foto van de kaart nemen" title="Foto van de kaart nemen"
          onClick={() => video.current && void herkenFoto(fotoUitKader(video.current), true)}><span /></button>
      </div>
      <input ref={galerij} type="file" accept="image/*" hidden
        onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void herkenFoto(await bestandNaarCanvas(f), true); }} />
    </div>
  );
}

function CameraFout({ tekst, onOpnieuw }: { tekst: string; onOpnieuw: () => void }) {
  return (
    <div className="camera-fout">
      <Icoon naam="camera" maat={32} />
      <p>{tekst}</p>
      <button className="knop" onClick={onOpnieuw}>Opnieuw proberen</button>
    </div>
  );
}

// ── Het lijstje met wat gescand is (blijft staan als je even van tabblad wisselt) ──

export type LijstItem =
  | { sleutel: string; soort: "ex"; id: string; via: Via }
  | { sleutel: string; soort: "kaart"; kandidaten: CatalogusKaart[]; zeker: boolean; foto: string; gekozen: CatalogusKaart | null };

let lijst: LijstItem[] = [];
const luisteraars = new Set<() => void>();
const zetLijst = (l: LijstItem[]) => { lijst = l; luisteraars.forEach((f) => f()); };
const useLijst = () => useSyncExternalStore((f) => { luisteraars.add(f); return () => luisteraars.delete(f); }, () => lijst);

/** Een exemplaar in de lijst; hetzelfde exemplaar komt er nooit twee keer in. */
function lijstExemplaar(ex: Exemplaar, via: Via): boolean {
  if (lijst.some((x) => x.soort === "ex" && x.id === ex.id)) {
    meld(`${ex.naam} ${toonCode(ex.code)} staat al in de lijst`, "info", undefined, 1800);
    return false;
  }
  zetLijst([{ sleutel: ex.id, soort: "ex", id: ex.id, via }, ...lijst]);
  return true;
}

/** Een herkende kaart: met één exemplaar in voorraad meteen dat exemplaar, anders kiezen. */
function lijstFoto(r: FotoResultaat) {
  const s = huidig();
  const inLijst = new Set(lijst.filter((x) => x.soort === "ex").map((x) => (x as { id: string }).id));
  if (r.zeker) {
    const kaart = r.kandidaten[0];
    const vrij = s.exemplaren.filter((e) => e.kaart_id === kaart.id && inVoorraad(e) && !inLijst.has(e.id));
    const totaal = s.exemplaren.filter((e) => e.kaart_id === kaart.id && inVoorraad(e)).length;
    if (vrij.length === 1 && totaal === 1) { lijstExemplaar(vrij[0], "foto"); return; }
    if (totaal > 0 && vrij.length === 0) { meld(`${kaart.naam}: alle exemplaren staan al in de lijst`, "info", undefined, 2200); return; }
    if (lijst.some((x) => x.soort === "kaart" && x.gekozen?.id === kaart.id)) return; // staat al klaar om te kiezen
    zetLijst([{ sleutel: `k-${kaart.id}-${Date.now()}`, soort: "kaart", kandidaten: [kaart], zeker: true, foto: r.foto, gekozen: kaart }, ...lijst]);
    return;
  }
  const eerste = lijst[0];
  if (eerste?.soort === "kaart" && !eerste.gekozen && eerste.kandidaten[0]?.id === r.kandidaten[0]?.id) return; // dezelfde twijfel
  zetLijst([{ sleutel: `k-${Date.now()}`, soort: "kaart", kandidaten: r.kandidaten, zeker: false, foto: r.foto, gekozen: null }, ...lijst]);
}

function haalUitLijst(sleutel: string) { zetLijst(lijst.filter((x) => x.sleutel !== sleutel)); }

export function Scan() {
  const { open } = useApp();
  const items = useLijst();
  return (
    <div className="scherm scan">
      <header className="kop">
        <div>
          <h1>Scannen</h1>
        </div>
      </header>
      <Scanner gepauzeerd={!!open} onExemplaar={(ex, via) => lijstExemplaar(ex, via)} onFoto={lijstFoto} compact={items.length > 0} />
      <ScanLijst items={items} />
    </div>
  );
}

function ScanLijst({ items }: { items: LijstItem[] }) {
  const { exemplaren, mandje } = useApp();
  const perId = useMemo(() => new Map(exemplaren.map((e) => [e.id, e])), [exemplaren]);
  if (!items.length) {
    return (
      <div className="scan-leeg">
        <p><strong>Scan na elkaar.</strong> Alles wat herkend wordt, komt hier in een lijstje. Een label dat je net plakte, staat na het scannen op "hangt erop".</p>
      </div>
    );
  }
  const exs = items.filter((x) => x.soort === "ex").map((x) => perId.get((x as { id: string }).id)).filter(Boolean) as Exemplaar[];
  const inMand = new Set(mandje.regels.filter((r) => r.richting === "uit").map((r) => r.exemplaar_id));
  const teKoop = exs.filter((e) => inVoorraad(e) && e.opslag === "vitrine" && !inMand.has(e.id));
  const vault = exs.filter((e) => inVoorraad(e) && e.opslag === "stockdoos");
  const waarde = teKoop.reduce((s, e) => s + (e.hartjesprijs ?? 0), 0);

  const allesInMandje = () => {
    for (const e of teKoop) inMandje(regelUit(e));
    const blijft = new Set(exs.filter((e) => !teKoop.includes(e)).map((e) => e.id));
    zetLijst(lijst.filter((x) => x.soort !== "ex" || blijft.has(x.id)));
    meld(`${teKoop.length} ${teKoop.length === 1 ? "kaart" : "kaarten"} in het mandje${vault.length ? `. ${vault.length} uit de vault blijven staan: geef ze eerst een hartje.` : ""}`, "ok",
      { label: "Naar kassa", doe: () => naarTab("kassa") });
  };

  return (
    <section className="scan-lijst">
      <div className="scan-lijst-kop">
        <h2>Gescand <span>{items.length}</span></h2>
        <button className="tekstknop klein" onClick={() => zetLijst([])}>Leegmaken</button>
      </div>
      <ul>
        {items.map((it) => (
          <li key={it.sleutel} className="scan-item">
            {it.soort === "ex" ? <ExItem ex={perId.get(it.id)} via={it.via} inMandje={inMand.has(it.id)} onWeg={() => haalUitLijst(it.sleutel)} />
              : <KaartItem it={it} onWeg={() => haalUitLijst(it.sleutel)} />}
          </li>
        ))}
      </ul>
      {teKoop.length > 0 && (
        <button className="knop groot" onClick={allesInMandje}>
          <Icoon naam="mandje" maat={20} /> {teKoop.length === 1 ? "In het mandje" : `Alle ${teKoop.length} in het mandje`} · {euro(waarde)}
        </button>
      )}
    </section>
  );
}

function ExItem({ ex, via, inMandje: mand, onWeg }: { ex?: Exemplaar; via: Via; inMandje: boolean; onWeg: () => void }) {
  if (!ex) return null;
  return (
    <div className="scan-rij">
      <button className="scan-rij-knop" onClick={() => openExemplaar(ex.id)}>
        <KaartFoto src={ex.afbeelding} alt={ex.naam} klein />
        <span className="res-tekst">
          <strong>{ex.naam}</strong>
          <span className="zacht"><span className="code">{toonCode(ex.code)}</span> · {[ex.set_code, ex.nummer].filter(Boolean).join(" ")}</span>
          <span className="scan-labels">
            <Badges ex={ex} />
            <span className={`via ${via}`}>{via === "qr" ? "QR" : via === "foto" ? "foto" : "code"}</span>
            {!inVoorraad(ex) && <span className="badge rood-badge">{ex.status}</span>}
            {inVoorraad(ex) && ex.opslag === "stockdoos" && <span className="badge geel">vault</span>}
            {mand && <span className="badge">in mandje</span>}
          </span>
        </span>
        <span className="rechts">{ex.opslag === "vitrine" ? <Hartje prijs={ex.hartjesprijs} /> : <span className="waarde">{euro(ex.verkoopprijs)}</span>}</span>
      </button>
      <button className="rond-knop" onClick={onWeg} aria-label="Uit de lijst"><Icoon naam="kruis" maat={14} /></button>
    </div>
  );
}

/** Een kaart herkend op een foto: kies de juiste kaart en dan het exemplaar. */
function KaartItem({ it, onWeg }: { it: Extract<LijstItem, { soort: "kaart" }>; onWeg: () => void }) {
  const { exemplaren } = useApp();
  const inLijst = new Set(lijst.filter((x) => x.soort === "ex").map((x) => (x as { id: string }).id));
  const kaart = it.gekozen;
  const exs = kaart ? exemplaren.filter((e) => e.kaart_id === kaart.id && inVoorraad(e)) : [];
  const kiesKaart = (k: CatalogusKaart) => {
    const vrij = huidig().exemplaren.filter((e) => e.kaart_id === k.id && inVoorraad(e) && !inLijst.has(e.id));
    if (vrij.length === 1) {
      zetLijst(lijst.map((x) => (x.sleutel === it.sleutel ? { sleutel: vrij[0].id, soort: "ex" as const, id: vrij[0].id, via: "foto" as const } : x)));
    } else {
      zetLijst(lijst.map((x) => (x.sleutel === it.sleutel ? { ...it, gekozen: k } : x)));
    }
  };
  const kiesEx = (e: Exemplaar) => {
    if (inLijst.has(e.id)) return;
    zetLijst(lijst.map((x) => (x.sleutel === it.sleutel ? { sleutel: e.id, soort: "ex" as const, id: e.id, via: "foto" as const } : x)));
  };
  return (
    <div className="scan-kaart">
      <div className="scan-rij">
        <img className="scan-foto" src={it.foto} alt="" />
        <div className="res-tekst">
          {kaart ? (
            <>
              <strong>{kaart.naam}</strong>
              <span className="zacht">{kaart.setCode || kaart.setId} {kaart.nummer} · {exs.length ? `${exs.length} in voorraad: welke?` : "niet in voorraad"}</span>
            </>
          ) : (
            <>
              <strong>Welke kaart is het?</strong>
              <span className="zacht">Niet zeker herkend</span>
            </>
          )}
        </div>
        <button className="rond-knop" onClick={onWeg} aria-label="Uit de lijst"><Icoon naam="kruis" maat={14} /></button>
      </div>
      {!kaart && (
        <div className="scan-keuzes">
          {it.kandidaten.slice(0, 5).map((k) => (
            <button key={k.id} className="scan-keuze" onClick={() => kiesKaart(k)}>
              <KaartFoto src={afbeelding(k)} alt={k.naam} klein />
              <span><strong>{k.naam}</strong><em>{k.setCode || k.setId} {k.nummer}</em></span>
            </button>
          ))}
        </div>
      )}
      {kaart && exs.length > 0 && (
        <div className="scan-keuzes">
          {exs.map((e) => (
            <button key={e.id} className={`scan-keuze ex${inLijst.has(e.id) ? " al" : ""}`} disabled={inLijst.has(e.id)} onClick={() => kiesEx(e)}>
              <span className="code">{toonCode(e.code)}</span>
              <Badges ex={e} />
              <span className="rechts">{e.opslag === "vitrine" ? euro(e.hartjesprijs) : `vault ${euro(e.verkoopprijs)}`}</span>
            </button>
          ))}
        </div>
      )}
      {kaart && !exs.length && (
        <button className="knop zacht klein" onClick={() => openToevoegen(kaart.id, kaart.catalogus)}><Icoon naam="plus" maat={16} /> Toevoegen aan de voorraad</button>
      )}
    </div>
  );
}
