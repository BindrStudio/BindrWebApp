// Een eigen foto nemen of kiezen (binder, sealed, of een kaart waarvan nergens een foto bestaat).
import { useRef, useState } from "react";
import { meld } from "../state";
import { veiligeFoto, verkleinFoto } from "../lib/eigenfoto";
import { Icoon } from "./common";

export function FotoKiezer({ foto, onFoto, max = 720, wat = "het artikel" }: {
  foto: string | null | undefined; onFoto: (f: string | null) => void; max?: number; wat?: string;
}) {
  const invoer = useRef<HTMLInputElement>(null);
  const [bezig, setBezig] = useState(false);
  const kies = async (f: File | undefined) => {
    if (!f) return;
    setBezig(true);
    try { onFoto(await verkleinFoto(f, max)); } catch (e) { meld(e instanceof Error ? e.message : String(e), "fout"); } finally { setBezig(false); }
  };
  const f = veiligeFoto(foto);
  return (
    <div className="foto-kiezer">
      {f ? <img src={f} alt={`Foto van ${wat}`} /> : <span className="foto-kiezer-leeg"><Icoon naam="foto" maat={30} /></span>}
      <div className="foto-kiezer-knoppen">
        <button type="button" className="knop zacht klein" disabled={bezig} onClick={() => invoer.current?.click()}>
          <Icoon naam="camera" maat={16} /> {bezig ? "Bezig…" : f ? "Andere foto" : "Foto nemen of kiezen"}
        </button>
        {f && <button type="button" className="tekstknop klein" onClick={() => onFoto(null)}>Foto weg</button>}
      </div>
      <input ref={invoer} type="file" accept="image/*" hidden onChange={(e) => { void kies(e.target.files?.[0]); e.target.value = ""; }} />
    </div>
  );
}
