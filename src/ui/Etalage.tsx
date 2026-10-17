// Profiel › Binders vooraan en Profiel › Instagram: de foto's op de startpagina van de klanten.
// - Vooraan: uitgeknipte foto's van onze binders (zonder achtergrond), in de waaier bovenaan.
// - Instagram: onze laatste berichten, in een strook die doorloopt net boven de beurzen. Instagram laat geen foto's
//   ophalen zonder een app bij Meta; daarom zet je ze hier zelf (bewaar de foto op je gsm en plak de link erbij).
import { useEffect, useRef, useState } from "react";
import {
  etalageLijst, kanEtalage, kanThema, laadEtalage, meld, nieuweEtalagefoto, SCHEMA_010, SCHEMA_013, schuifEtalagefoto, sluit, useApp, verwijderEtalagefoto, voegEtalagefotoToe, wijzigEtalagefoto,
} from "../state";
import type { Etalagefoto, EtalagePlek } from "../types";
import { veiligeFoto, verkleinFoto, verkleinUitgeknipt } from "../lib/eigenfoto";
import { klantUrl } from "../config";
import { Icoon, Sheet } from "./common";

const TEKST: Record<EtalagePlek, { titel: string; max: number; uitleg: string; leeg: string; tip: string; link: string; titelVeld: string; toegevoegd: (n: number) => string }> = {
  voorpagina: {
    titel: "Binders vooraan",
    max: 12,
    uitleg: "De binders bovenaan de startpagina, in de waaier die om de paar seconden draait. Gebruik foto's zonder achtergrond: dan zweven ze echt over de pagina.",
    leeg: "Nog geen binders. Zolang hier niets staat, tonen we voorbeeldbinders.",
    tip: "Zonder achtergrond op een iPhone: open de foto, hou de binder ingedrukt tot hij loskomt en kies Deel › Bewaar afbeelding. Die nieuwe foto kies je hier. Een foto op een vlakke achtergrond (een wit blad) knipt de app zelf uit. Recht van voren staat het mooist.",
    link: "Link (optioneel)",
    titelVeld: "Naam (niet zichtbaar)",
    toegevoegd: (n) => (n === 1 ? "Binder vooraan gezet" : `${n} binders vooraan gezet`),
  },
  instagram: {
    titel: "Instagram",
    max: 30,
    uitleg: "Onze laatste berichten lopen onderaan de startpagina voorbij, net boven de beurzen. Bewaar de foto van je bericht op je gsm, kies ze hier en plak de link naar het bericht erbij.",
    leeg: "Nog geen berichten. Zolang hier niets staat, is er geen strook.",
    tip: "De bovenste staat eerst; een nieuwe foto komt bovenaan. De strook toont er hoogstens 16.",
    link: "Link naar het bericht op Instagram",
    titelVeld: "Titel (optioneel)",
    toegevoegd: (n) => (n === 1 ? "Foto in de Instagram-strook" : `${n} foto's in de Instagram-strook`),
  },
};

export function EtalageSheet({ plek }: { plek: EtalagePlek }) {
  const app = useApp();
  const t = TEKST[plek];
  const kan = kanEtalage(app) && (plek === "instagram" || kanThema(app));
  const invoer = useRef<HTMLInputElement>(null);
  const [bezig, setBezig] = useState(false);
  useEffect(() => { if (kan) void laadEtalage(); }, [kan]);
  const lijst = etalageLijst(plek);

  const voegToe = async (bestanden: FileList | null) => {
    if (!bestanden?.length) return;
    setBezig(true);
    try {
      let n = 0, metAchtergrond = 0, weggehaald = 0;
      for (const f of Array.from(bestanden).slice(0, t.max - (lijst?.length ?? 0))) {
        if (plek === "voorpagina") {
          const r = await verkleinUitgeknipt(f);
          if (!r.doorzichtig) metAchtergrond++;
          if (r.weggehaald) weggehaald++;
          const url = r.url;
          voegEtalagefotoToe(nieuweEtalagefoto(url, plek));
        } else {
          voegEtalagefotoToe(nieuweEtalagefoto(await verkleinFoto(f, 480), plek)); // de tegels zijn hoogstens 188 px breed
        }
        n++;
      }
      if (metAchtergrond) meld(`${metAchtergrond === 1 ? "Die foto heeft" : `${metAchtergrond} foto's hebben`} nog een achtergrond. Ze staan vooraan, maar zonder achtergrond is het mooier.`, "info", undefined, 7000);
      else if (weggehaald) meld(`${t.toegevoegd(n)}. ${weggehaald === 1 ? "Een vlakke achtergrond is" : "Vlakke achtergronden zijn"} weggehaald.`, "info", undefined, 5000);
      else if (n) meld(t.toegevoegd(n));
    } catch (e) {
      meld(e instanceof Error ? e.message : String(e), "fout");
    } finally {
      setBezig(false);
    }
  };

  const demo = app.backend?.soort === "demo";
  return (
    <Sheet titel={t.titel} onSluit={sluit} vol>
      <p className="zacht">{t.uitleg}</p>
      {!kan ? <p className="nakijken">{plek === "voorpagina" ? SCHEMA_013 : SCHEMA_010}</p> : (
        <>
          <div className="knoppenrij">
            <button className="knop" disabled={bezig || (lijst?.length ?? 0) >= t.max} onClick={() => invoer.current?.click()}>
              <Icoon naam={plek === "voorpagina" ? "uitgeknipt" : "camera"} maat={18} /> {bezig ? "Bezig…" : "Foto's toevoegen"}
            </button>
            <a className="knop zacht" href={klantUrl(demo)} target="_blank" rel="noreferrer"><Icoon naam="oog" maat={18} /> Bekijk als klant</a>
          </div>
          <input ref={invoer} type="file" accept={plek === "voorpagina" ? "image/png,image/webp,image/*" : "image/*"} multiple hidden
            onChange={(e) => { void voegToe(e.target.files); e.target.value = ""; }} />
          {lijst == null ? <p className="zacht">Laden…</p> : !lijst.length ? (
            <div className="etalage-leeg">
              <Icoon naam={plek === "voorpagina" ? "binder" : "instagram"} maat={40} />
              <p>{t.leeg}</p>
            </div>
          ) : (
            <ul className={`etalage-lijst ${plek}`}>
              {lijst.map((f, i) => <EtalageRij key={f.id} f={f} plek={plek} eerste={i === 0} laatste={i === lijst.length - 1} />)}
            </ul>
          )}
          <p className="zacht klein">{t.tip} Klanten zien enkel de foto's{plek === "instagram" ? ", de titel" : ""} en de link.</p>
        </>
      )}
    </Sheet>
  );
}

function EtalageRij({ f, plek, eerste, laatste }: { f: Etalagefoto; plek: EtalagePlek; eerste: boolean; laatste: boolean }) {
  const t = TEKST[plek];
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
      <span className={`etalage-beeld${plek === "voorpagina" ? " uitgeknipt" : ""}`}>{beeld ? <img src={beeld} alt="" /> : <Icoon naam="foto" />}</span>
      <div className="etalage-velden">
        <input value={titel} onChange={(e) => setTitel(e.target.value)} onBlur={bewaar} placeholder={t.titelVeld} maxLength={120} aria-label="Titel" />
        <input value={link} onChange={(e) => setLink(e.target.value)} onBlur={bewaar} placeholder={t.link} inputMode="url" aria-label="Link" />
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
