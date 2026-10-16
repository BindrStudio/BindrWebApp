// Foto's bij een aankoop: de gekochte kaarten aan de stand, of een screenshot van het gesprek
// bij een aankoop via Facebook. Ze horen bij het aankoopbewijs en de dagstaat.
import { useEffect, useRef, useState } from "react";
import { fotosVan, laadFotos, meld, useApp, verwijderAankoopfoto, voegAankoopfotoToe } from "../state";
import type { Aankoopfoto } from "../types";
import { veiligeFoto, verkleinFoto } from "../lib/eigenfoto";
import { Icoon } from "./common";

/** Maat van een bewijsfoto: groot genoeg om kaarten te herkennen, klein genoeg voor de wachtrij. */
export const BEWIJS_MAAT = 1100;

/** De foto's van deze transacties (laadt ze één keer; herrendert als er iets bijkomt). */
export function useFotos(ids: string[]): (id: string) => Aankoopfoto[] {
  useApp(); // herrender bij fotoVersie
  const sleutel = ids.join(",");
  useEffect(() => { void laadFotos(ids); }, [sleutel]); // eslint-disable-line react-hooks/exhaustive-deps
  return fotosVan;
}

/** Een knop om een foto te nemen of te kiezen (verkleind), meerdere na elkaar. */
export function FotoKnop({ onFoto, tekst = "Foto nemen", klein = false }: { onFoto: (f: string) => void; tekst?: string; klein?: boolean }) {
  const invoer = useRef<HTMLInputElement>(null);
  const [bezig, setBezig] = useState(false);
  const kies = async (lijst: FileList | null) => {
    if (!lijst?.length) return;
    setBezig(true);
    try {
      for (const f of Array.from(lijst).slice(0, 6)) onFoto(await verkleinFoto(f, BEWIJS_MAAT));
    } catch (e) {
      meld(e instanceof Error ? e.message : String(e), "fout");
    } finally {
      setBezig(false);
    }
  };
  return (
    <>
      <button type="button" className={`knop zacht${klein ? " klein" : ""}`} disabled={bezig} onClick={() => invoer.current?.click()}>
        <Icoon naam="camera" maat={16} /> {bezig ? "Bezig…" : tekst}
      </button>
      <input ref={invoer} type="file" accept="image/*" multiple hidden onChange={(e) => { void kies(e.target.files); e.target.value = ""; }} />
    </>
  );
}

/** Rij met kleine foto's; tik om groot te zien. */
export function FotoRij({ fotos, onWeg }: { fotos: string[]; onWeg?: (i: number) => void }) {
  const [groot, setGroot] = useState<string | null>(null);
  const veilig = fotos.map(veiligeFoto);
  if (!fotos.length) return null;
  return (
    <>
      <div className="foto-rij">
        {veilig.map((f, i) => f && (
          <span key={i} className="foto-duim">
            <button type="button" onClick={() => setGroot(f)} aria-label={`Foto ${i + 1} groot bekijken`}><img src={f} alt="" /></button>
            {onWeg && <button type="button" className="foto-weg" onClick={() => onWeg(i)} aria-label={`Foto ${i + 1} weg`}><Icoon naam="kruis" maat={12} /></button>}
          </span>
        ))}
      </div>
      {groot && (
        <button type="button" className="foto-groot" onClick={() => setGroot(null)} aria-label="Sluiten">
          <img src={groot} alt="Foto bij de aankoop" />
        </button>
      )}
    </>
  );
}

/** De foto's van een geboekte transactie: bekijken, erbij nemen, weghalen. */
export function TransactieFotos({ id, kan = true }: { id: string; kan?: boolean }) {
  const van = useFotos([id]);
  const fotos = van(id);
  return (
    <div className="transactie-fotos">
      <FotoRij fotos={fotos.map((f) => f.foto)} onWeg={kan ? (i) => { if (confirm("Deze foto weghalen?")) verwijderAankoopfoto(fotos[i]); } : undefined} />
      {kan && <FotoKnop klein tekst={fotos.length ? "Nog een foto" : "Foto nemen"} onFoto={(f) => { voegAankoopfotoToe(id, f); meld("Foto bewaard"); }} />}
    </div>
  );
}
