import { useState } from "react";
import { inMandje, meld, naarTab, sluit, useApp, voegArtikelToe, wijzigArtikel } from "../state";
import type { Artikel } from "../types";
import { euro, getal } from "../lib/format";
import { regelArtikelUit } from "../lib/kassa";
import { PLAATS } from "../lib/categorie";
import { Icoon, Kiezer, Sheet, Veld } from "./common";

const SOORTEN: { waarde: Artikel["soort"]; label: string }[] = [
  { waarde: "sealed", label: "Sealed" },
  { waarde: "eigen product", label: "Bind'r (binder, 3D-print)" },
  { waarde: "bulk", label: "Bulk" },
  { waarde: "andere", label: "Andere" },
];

/** Een artikel dat per aantal gaat: booster packs, ETB's, 3D-prints, bulk. */
export function ArtikelSheet({ id }: { id: string | null }) {
  const { artikelen } = useApp();
  const a = id ? artikelen.find((x) => x.id === id) : null;
  const [v, setV] = useState({
    naam: a?.naam ?? "",
    soort: a?.soort ?? ("sealed" as Artikel["soort"]),
    aantal: a?.aantal ?? 1,
    prijs: a?.prijs != null ? String(a.prijs).replace(".", ",") : "",
    opslag: a?.opslag ?? ("vitrine" as Artikel["opslag"]),
    opmerking: a?.opmerking ?? "",
  });
  const gewijzigd = !a || v.naam !== a.naam || v.soort !== a.soort || v.aantal !== a.aantal || getal(v.prijs) !== a.prijs || v.opslag !== a.opslag || (v.opmerking || null) !== a.opmerking;

  const bewaar = () => {
    if (!v.naam.trim()) return meld("Geef het artikel een naam", "fout");
    const w = { naam: v.naam.trim(), soort: v.soort, aantal: Math.max(0, v.aantal), prijs: getal(v.prijs), opslag: v.opslag, opmerking: v.opmerking.trim() || null };
    if (a) wijzigArtikel(a.id, w, "Artikel bewaard");
    else { voegArtikelToe(w); meld("Artikel toegevoegd"); }
    sluit();
  };

  return (
    <Sheet titel={a ? a.naam : "Nieuw artikel"} onSluit={sluit}>
      {a && (
        <div className="artikel-kop">
          <div className="groot-getal"><span>{a.aantal}</span> op voorraad</div>
          <div className="zacht">{a.prijs != null ? `${euro(a.prijs)} per stuk` : "Prijs per deal"} · {PLAATS[a.opslag].lang}</div>
          {a.aantal > 0 && (
            <button className="knop groot" onClick={() => { inMandje(regelArtikelUit(a)); meld(`${a.naam} in het mandje`, "ok", { label: "Naar kassa", doe: () => naarTab("kassa") }); sluit(); }}>
              <Icoon naam="mandje" maat={20} /> In het mandje
            </button>
          )}
        </div>
      )}
      <div className="blok formulier">
        <Veld label="Naam"><input value={v.naam} onChange={(e) => setV({ ...v, naam: e.target.value })} placeholder="Booster pack Ascended Heroes" autoFocus={!a} /></Veld>
        <Veld label="Soort"><Kiezer waarde={v.soort} opties={SOORTEN} onKies={(s) => setV({ ...v, soort: s })} /></Veld>
        <div className="twee">
          <Veld label="Aantal">
            <div className="stapper">
              <button type="button" onClick={() => setV({ ...v, aantal: Math.max(0, v.aantal - 1) })}>−</button>
              <input className="stapper-getal" inputMode="numeric" value={v.aantal} onChange={(e) => setV({ ...v, aantal: Math.max(0, Math.round(getal(e.target.value) ?? 0)) })} />
              <button type="button" onClick={() => setV({ ...v, aantal: v.aantal + 1 })}>+</button>
            </div>
          </Veld>
          <Veld label="Prijs per stuk (€)" hint={v.soort === "bulk" ? "Leeg laten = prijs per deal" : undefined}>
            <input inputMode="decimal" value={v.prijs} onChange={(e) => setV({ ...v, prijs: e.target.value })} />
          </Veld>
        </div>
        <Veld label="Waar?">
          <Kiezer waarde={v.opslag} opties={[{ waarde: "vitrine", label: "Catalogus" }, { waarde: "stockdoos", label: "Vault" }]} onKies={(o) => setV({ ...v, opslag: o })} />
        </Veld>
        <Veld label="Opmerking"><input value={v.opmerking} onChange={(e) => setV({ ...v, opmerking: e.target.value })} /></Veld>
        <button className="knop" disabled={!gewijzigd} onClick={bewaar}>{a ? "Bewaar" : "Toevoegen"}</button>
      </div>
      <p className="zacht klein">Artikelen krijgen geen eigen label. Verkopen gaat via de kassa; het aantal zakt dan vanzelf.</p>
    </Sheet>
  );
}
