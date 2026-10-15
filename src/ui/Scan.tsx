import { useEffect, useMemo, useRef, useState } from "react";
import { bevestigLabel, huidig, meld, openExemplaar, openToevoegen, useApp } from "../state";
import type { CatalogusKaart, Exemplaar } from "../types";
import { leesQr, startCamera, stopCamera, fotoUitVideo, bestandNaarCanvas, tril } from "../lib/camera";
import { normaliseerCode, toonCode } from "../lib/code";
import { afbeelding, herken, laadCatalogus, type Kandidaat } from "../lib/catalog";
import { leesKaart } from "../lib/ocr";
import { euro } from "../lib/format";
import { Badges, Hartje, Icoon, KaartFoto, Segment } from "./common";

type Modus = "qr" | "foto" | "code";
const PROEFCODE = "7K2QX9";

export function Scan() {
  const { open } = useApp();
  const [modus, setModus] = useState<Modus>("qr");
  const [snel, setSnel] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);

  return (
    <div className="scherm scan">
      <header className="kop">
        <div>
          <h1>Scannen</h1>
          <p className="kop-sub">
            {modus === "qr" ? "Richt op de QR-code achteraan de toploader" : modus === "foto" ? "Neem een foto van de voorkant van de kaart" : "Typ de code van het label"}
          </p>
        </div>
      </header>
      <Segment<Modus> waarde={modus} onKies={setModus} opties={[
        { waarde: "qr", label: "QR-code" },
        { waarde: "foto", label: "Foto" },
        { waarde: "code", label: "Code typen" },
      ]} />

      {modus === "qr" && (
        <>
          <QrScanner gepauzeerd={!!open} onCode={(ex) => {
            if (snel) setRecent((r) => [ex.id, ...r.filter((x) => x !== ex.id)].slice(0, 30));
            else openExemplaar(ex.id);
          }} />
          <label className="schakel">
            <input type="checkbox" checked={snel} onChange={(e) => setSnel(e.target.checked)} />
            <span>Labels na elkaar bevestigen <span className="zacht klein">(opent de kaart niet)</span></span>
          </label>
          {snel && <Recent ids={recent} />}
        </>
      )}
      {modus === "foto" && <FotoScanner gepauzeerd={!!open} />}
      {modus === "code" && <CodeInvoer />}
    </div>
  );
}

/** Zoekt een gescande code op en bevestigt het label als het pas geprint was. */
function verwerkCode(code: string): Exemplaar | null {
  const ex = huidig().exemplaren.find((e) => e.code === code);
  if (!ex) {
    if (code === PROEFCODE) meld("Proeflabel gelezen: de QR-code werkt", "ok");
    else meld(`Code ${toonCode(code)} staat niet in de voorraad`, "fout");
    return null;
  }
  tril();
  if (ex.label_status === "geprint") void bevestigLabel(ex);
  if (ex.status !== "in voorraad" && ex.status !== "gereserveerd") meld(`Let op: ${ex.naam} staat op "${ex.status}"`, "info");
  return ex;
}

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

function CameraFout({ tekst, onOpnieuw }: { tekst: string; onOpnieuw: () => void }) {
  return (
    <div className="camera-fout">
      <Icoon naam="camera" maat={32} />
      <p>{tekst}</p>
      <button className="knop" onClick={onOpnieuw}>Opnieuw proberen</button>
    </div>
  );
}

export function QrScanner({ gepauzeerd, onCode }: { gepauzeerd: boolean; onCode: (ex: Exemplaar) => void }) {
  const { video, fout, klaar, opnieuw, lamp, zetLamp } = useCamera(true);
  const canvas = useRef<HTMLCanvasElement>(document.createElement("canvas"));
  const laatste = useRef<{ code: string; tijd: number }>({ code: "", tijd: 0 });
  const [flits, setFlits] = useState(false);
  const pauze = useRef(gepauzeerd);
  pauze.current = gepauzeerd;
  const cb = useRef(onCode);
  cb.current = onCode;

  useEffect(() => {
    if (!klaar) return;
    let stop = false;
    let geenBindr = 0;
    const lus = () => {
      if (stop) return;
      if (!pauze.current && video.current) {
        const { code, ruw } = leesQr(video.current, canvas.current);
        const nu = Date.now();
        if (code) {
          if (code !== laatste.current.code || nu - laatste.current.tijd > 2500) {
            laatste.current = { code, tijd: nu };
            setFlits(true);
            setTimeout(() => setFlits(false), 350);
            const ex = verwerkCode(code);
            if (ex) cb.current(ex);
          } else laatste.current.tijd = nu;
        } else if (ruw && nu - geenBindr > 4000) {
          geenBindr = nu;
          meld("Dit is geen Bind'r-code", "info", undefined, 2500);
        }
      }
      setTimeout(() => requestAnimationFrame(lus), 120);
    };
    lus();
    return () => { stop = true; };
  }, [klaar]);

  return (
    <div className={`camera-vak${flits ? " flits" : ""}`}>
      <video ref={video} className="camera-video" playsInline muted />
      {fout ? <CameraFout tekst={fout} onOpnieuw={opnieuw} /> : (
        <>
          <div className="zoeker qr" aria-hidden="true"><span /><span /><span /><span /></div>
          {!klaar && <div className="camera-laden">Camera starten…</div>}
          {lamp.kan && (
            <button className={`rond-knop lamp${lamp.aan ? " aan" : ""}`} onClick={() => void zetLamp(!lamp.aan)} aria-label="Zaklamp">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3h8l-1 5H9L8 3ZM9 8l1 13h4l1-13" /></svg>
            </button>
          )}
        </>
      )}
    </div>
  );
}

function Recent({ ids }: { ids: string[] }) {
  const { exemplaren } = useApp();
  if (!ids.length) return <p className="zacht center">Scan de labels die je net plakte. Elk gescand label staat dan op "hangt erop".</p>;
  return (
    <ul className="lijst">
      {ids.map((id) => {
        const ex = exemplaren.find((e) => e.id === id);
        if (!ex) return null;
        return (
          <li key={id}>
            <button className="lijst-knop" onClick={() => openExemplaar(id)}>
              <span className="vinkje"><Icoon naam="check" maat={16} /></span>
              <span className="code">{toonCode(ex.code)}</span>
              <span className="lijst-naam">{ex.naam}</span>
              <span className="rechts zacht">{ex.opslag === "vitrine" ? "catalogus" : "vault"}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function FotoScanner({ gepauzeerd, kies }: { gepauzeerd: boolean; kies?: (ex: Exemplaar) => void }) {
  const [res, setRes] = useState<{ kandidaten: Kandidaat[]; zeker: boolean; foto: string } | null>(null);
  const { video, fout, klaar, opnieuw } = useCamera(!gepauzeerd && !res);
  const invoer = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);

  const verwerk = async (foto: HTMLCanvasElement) => {
    setBezig(true);
    setRes(null);
    try {
      const tekst = await leesKaart(foto, setStatus);
      setStatus("Kaart zoeken…");
      const indexen = await Promise.all([laadCatalogus("en"), laadCatalogus("asia")]);
      const r = herken(indexen, tekst);
      setRes({ ...r, foto: foto.toDataURL("image/jpeg", 0.6) });
      setStatus(r.kandidaten.length ? null : "Geen kaartnummer gevonden. Hou de kaart recht en dichtbij, met het nummer onderaan scherp, of zoek op naam in Voorraad.");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setBezig(false);
    }
  };

  return (
    <>
      {!res && (
        <div className="camera-vak kaartvorm">
          <video ref={video} className="camera-video" playsInline muted />
          {fout ? <CameraFout tekst={fout} onOpnieuw={opnieuw} /> : (
            <>
              <div className="zoeker kaart" aria-hidden="true"><span /><span /><span /><span /></div>
              {!klaar && <div className="camera-laden">Camera starten…</div>}
            </>
          )}
        </div>
      )}
      <input ref={invoer} type="file" accept="image/*" hidden
        onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void verwerk(await bestandNaarCanvas(f)); }} />
      {!res && (
        <div className="camera-knoppen">
          <button className="tekstknop" onClick={() => invoer.current?.click()}>Uit galerij</button>
          <button className="sluiter" disabled={!klaar || bezig} aria-label="Foto nemen"
            onClick={() => video.current && void verwerk(fotoUitVideo(video.current))}><span /></button>
          <span className="sluiter-ruimte" />
        </div>
      )}
      {status && <p className="status center">{status}</p>}
      {res && <Kandidaten res={res} kies={kies} onOpnieuw={() => { setRes(null); setStatus(null); }} />}
    </>
  );
}

function Kandidaten({ res, onOpnieuw, kies }: { res: { kandidaten: Kandidaat[]; zeker: boolean; foto: string }; onOpnieuw: () => void; kies?: (ex: Exemplaar) => void }) {
  const [open, setOpen] = useState<string | null>(res.zeker ? res.kandidaten[0]?.kaart.id ?? null : null);
  return (
    <div className="kandidaten">
      <div className="kandidaten-kop">
        <img src={res.foto} alt="Genomen foto" />
        <div>
          <strong className={res.zeker ? "zeker" : "nakijken"}>{res.kandidaten.length ? (res.zeker ? "Herkend" : "Welke kaart is het?") : "Niet herkend"}</strong>
          <button className="knop zacht klein" onClick={onOpnieuw}><Icoon naam="camera" maat={16} /> Nieuwe foto</button>
        </div>
      </div>
      <ul className="resultaten">
        {res.kandidaten.map(({ kaart }) => (
          <li key={kaart.id} className={open === kaart.id ? "open" : ""}>
            <button onClick={() => setOpen(open === kaart.id ? null : kaart.id)}>
              <KaartFoto src={afbeelding(kaart)} alt={kaart.naam} klein />
              <span className="res-tekst">
                <strong>{kaart.naam}</strong>
                {kaart.naamJa && <span className="naam-origineel">{[kaart.naamJa, kaart.naamZhTw].filter(Boolean).join(" · ")}</span>}
                <span className="zacht">{kaart.setNaam} · {kaart.setCode || kaart.setId} {kaart.nummer}{kaart.setTotaal ? `/${kaart.setTotaal}` : ""}</span>
              </span>
              <Icoon naam="pijlRechts" maat={18} />
            </button>
            {open === kaart.id && <InVoorraad kaart={kaart} kies={kies} />}
          </li>
        ))}
      </ul>
    </div>
  );
}

function InVoorraad({ kaart, kies }: { kaart: CatalogusKaart; kies?: (ex: Exemplaar) => void }) {
  const { exemplaren } = useApp();
  const lijst = useMemo(() => exemplaren.filter((e) => e.kaart_id === kaart.id && (e.status === "in voorraad" || e.status === "gereserveerd")), [exemplaren, kaart.id]);
  return (
    <div className="in-voorraad">
      {lijst.length ? (
        <ul className="lijst">
          {lijst.map((ex) => (
            <li key={ex.id}>
              <button className="lijst-knop" onClick={() => (kies ? kies(ex) : openExemplaar(ex.id))}>
                <span className="code">{toonCode(ex.code)}</span>
                <Badges ex={ex} />
                <span className="rechts">{ex.opslag === "vitrine" ? <Hartje prijs={ex.hartjesprijs} /> : <span className="zacht">vault · {euro(ex.verkoopprijs)}</span>}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : <p className="zacht">Niet in voorraad.</p>}
      {!kies && <button className="knop zacht" onClick={() => openToevoegen(kaart.id, kaart.catalogus)}><Icoon naam="plus" maat={18} /> Exemplaar toevoegen</button>}
    </div>
  );
}

export function CodeInvoer({ kies }: { kies?: (ex: Exemplaar) => void }) {
  const [tekst, setTekst] = useState("");
  const [gevonden, setGevonden] = useState<Exemplaar | null>(null);
  const invoer = useRef<HTMLInputElement>(null);
  useEffect(() => { invoer.current?.focus(); }, []);

  const zoek = (t: string) => {
    setTekst(t);
    const code = normaliseerCode(t);
    if (!code) { setGevonden(null); return; }
    const ex = verwerkCode(code);
    setGevonden(ex);
    if (ex) { if (kies) kies(ex); else openExemplaar(ex.id); setTekst(""); }
  };

  return (
    <div className="code-invoer">
      <input ref={invoer} className="code-veld" value={tekst} onChange={(e) => zoek(e.target.value)} placeholder="7K2-QX9" maxLength={9}
        autoCapitalize="characters" autoCorrect="off" spellCheck={false} />
      <p className="zacht center">De code staat naast de QR-code op het label. Een O mag ook een 0 zijn.</p>
      {gevonden && <p className="center">Laatst gevonden: <strong>{gevonden.naam}</strong></p>}
    </div>
  );
}
