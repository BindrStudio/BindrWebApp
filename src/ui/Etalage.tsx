// Profiel › Etalage: de foto's van ons werk die op de startpagina van de klanten zweven en afwisselen.
// Instagram laat geen foto's ophalen zonder een app bij Meta; daarom zet je ze hier zelf (bewaar de foto
// van Instagram op je gsm en kies ze hier, met de link naar het bericht erbij).
import { useEffect, useRef, useState } from "react";
import {
  etalageLijst, kanEtalage, laadEtalage, meld, nieuweEtalagefoto, SCHEMA_010, schuifEtalagefoto, sluit, useApp, verwijderEtalagefoto, voegEtalagefotoToe, wijzigEtalagefoto,
} from "../state";
import type { Etalagefoto } from "../types";
import { veiligeFoto, verkleinFoto } from "../lib/eigenfoto";
import { klantUrl } from "../config";
import { Icoon, Sheet } from "./common";

const MAX = 24;

export function EtalageSheet() {
  const app = useApp();
  const kan = kanEtalage(app);
  const invoer = useRef<HTMLInputElement>(null);
  const [bezig, setBezig] = useState(false);
  useEffect(() => { if (kan) void laadEtalage(); }, [kan]);
  const lijst = etalageLijst();

  const voegToe = async (bestanden: FileList | null) => {
    if (!bestanden?.length) return;
    setBezig(true);
    try {
      let n = 0;
      for (const f of Array.from(bestanden).slice(0, MAX - (lijst?.length ?? 0))) {
        voegEtalagefotoToe(nieuweEtalagefoto(await verkleinFoto(f, 1000)));
        n++;
      }
      if (n) meld(n === 1 ? "Foto in de etalage" : `${n} foto's in de etalage`);
    } catch (e) {
      meld(e instanceof Error ? e.message : String(e), "fout");
    } finally {
      setBezig(false);
    }
  };

  return (
    <Sheet titel="Etalage" onSluit={sluit} vol>
      <p className="zacht">
        Foto's van jullie binders zweven op de startpagina van de klanten en wisselen om de paar seconden. Neem een foto van
        Instagram (bewaar ze op je gsm) of een nieuwe, en zet de link naar het bericht erbij.
      </p>
      {!kan ? <p className="nakijken">{SCHEMA_010}</p> : (
        <>
          <div className="knoppenrij">
            <button className="knop" disabled={bezig || (lijst?.length ?? 0) >= MAX} onClick={() => invoer.current?.click()}>
              <Icoon naam="camera" maat={18} /> {bezig ? "Bezig…" : "Foto's toevoegen"}
            </button>
            <a className="knop zacht" href={klantUrl(app.backend?.soort === "demo")} target="_blank" rel="noreferrer"><Icoon naam="oog" maat={18} /> Bekijk als klant</a>
          </div>
          <input ref={invoer} type="file" accept="image/*" multiple hidden onChange={(e) => { void voegToe(e.target.files); e.target.value = ""; }} />
          {lijst == null ? <p className="zacht">Laden…</p> : !lijst.length ? (
            <div className="etalage-leeg">
              <Icoon naam="etalage" maat={40} />
              <p>Nog geen foto's. Zolang de etalage leeg is, tonen we de foto's van jullie binders (Profiel › Artikels).</p>
            </div>
          ) : (
            <ul className="etalage-lijst">
              {lijst.map((f, i) => <EtalageRij key={f.id} f={f} eerste={i === 0} laatste={i === lijst.length - 1} />)}
            </ul>
          )}
          <p className="zacht klein">Tip: vierkante foto's of staande foto's van één binder werken het best. Klanten zien enkel de foto's, de titel en de link.</p>
        </>
      )}
    </Sheet>
  );
}

function EtalageRij({ f, eerste, laatste }: { f: Etalagefoto; eerste: boolean; laatste: boolean }) {
  const [titel, setTitel] = useState(f.titel ?? "");
  const [link, setLink] = useState(f.link ?? "");
  const [zeker, setZeker] = useState(false);
  useEffect(() => { setTitel(f.titel ?? ""); setLink(f.link ?? ""); }, [f.titel, f.link]);
  const bewaar = () => {
    if ((titel.trim() || null) === (f.titel ?? null) && (link.trim() || null) === (f.link ?? null)) return;
    if (!wijzigEtalagefoto(f, { titel, link })) setLink(f.link ?? "");
  };
  const beeld = veiligeFoto(f.foto);
  return (
    <li className="etalage-rij">
      <span className="etalage-beeld">{beeld ? <img src={beeld} alt="" /> : <Icoon naam="foto" />}</span>
      <div className="etalage-velden">
        <input value={titel} onChange={(e) => setTitel(e.target.value)} onBlur={bewaar} placeholder="Titel (bv. Gengar op zwart)" maxLength={120} aria-label="Titel" />
        <input value={link} onChange={(e) => setLink(e.target.value)} onBlur={bewaar} placeholder="Link naar Instagram (optioneel)" inputMode="url" aria-label="Link" />
        <div className="etalage-knoppen">
          <button className="rond-knop" disabled={eerste} onClick={() => schuifEtalagefoto(f, -1)} aria-label="Naar voren"><Icoon naam="op" maat={16} /></button>
          <button className="rond-knop" disabled={laatste} onClick={() => schuifEtalagefoto(f, 1)} aria-label="Naar achteren"><Icoon naam="neer" maat={16} /></button>
          {zeker
            ? <button className="knop klein rood" onClick={() => verwijderEtalagefoto(f)}>Weghalen</button>
            : <button className="tekstknop klein rood" onClick={() => setZeker(true)}>Weg</button>}
        </div>
      </div>
    </li>
  );
}
