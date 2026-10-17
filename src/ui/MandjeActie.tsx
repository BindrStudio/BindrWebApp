import { useState } from "react";
import { huidig, inMandje, meld, naarTab, openTransactie, useApp, wijzig } from "../state";
import type { Exemplaar } from "../types";
import { actieveReservering, inVoorraad } from "../lib/exemplaar";
import { regelUit } from "../lib/kassa";
import { datumKort, euro, getal, vandaag } from "../lib/format";
import { Icoon, OnderAankoop, onderAankoop } from "./common";

/**
 * De knop "In het mandje" voor één exemplaar. Een kaart uit de vault krijgt eerst een hartje
 * en gaat naar de catalogus, zodat de verkoop klopt met wat de klant zag. Een gereserveerde kaart niet:
 * die gaat meteen in het mandje, aan de afgesproken prijs (inMandje zegt voor wie).
 */
export function MandjeActie({ ex, naToevoegen, onAnnuleer, stil = false, vraagMeteen = false }: {
  ex: Exemplaar; naToevoegen?: () => void; onAnnuleer?: () => void; stil?: boolean; vraagMeteen?: boolean;
}) {
  const { mandje } = useApp();
  const res = actieveReservering(ex);
  const [stap, setStap] = useState<null | "vault" | "verlies">(() =>
    vraagMeteen && inVoorraad(ex) && ex.opslag === "stockdoos" && !actieveReservering(ex) ? "vault" : null);
  const [hartje, setHartje] = useState(String(ex.hartjesprijs ?? ex.verkoopprijs ?? ""));

  if (!inVoorraad(ex)) {
    return (
      <div className="mandje-actie weg">
        <Icoon naam="waarschuwing" maat={20} />
        <div>
          <strong>Niet meer in voorraad: {ex.status}</strong>
          {ex.afgeboekt_op && <span> op {datumKort(ex.afgeboekt_op)}</span>}
          {ex.transactie_id && <button className="tekstknop klein" onClick={() => openTransactie(ex.transactie_id!)}>Bekijk transactie</button>}
        </div>
      </div>
    );
  }

  if (mandje.regels.some((r) => r.exemplaar_id === ex.id && r.richting === "uit")) {
    return (
      <div className="mandje-actie in">
        <Icoon naam="check" maat={20} /> In het mandje
        <button className="tekstknop" onClick={() => naarTab("kassa")}>Naar kassa</button>
      </div>
    );
  }

  const voegToe = () => {
    const actueel = huidig().exemplaren.find((x) => x.id === ex.id) ?? ex;
    inMandje(regelUit(actueel));
    if (!stil && !actieveReservering(actueel)) meld(`${actueel.naam} in het mandje`, "ok", { label: "Naar kassa", doe: () => naarTab("kassa") });
    setStap(null);
    naToevoegen?.();
  };
  const klik = () => {
    if (ex.opslag === "stockdoos" && !res) setStap("vault");
    else voegToe();
  };

  const naarCatalogusEnMandje = (prijs: number) => {
    wijzig(ex.id, { opslag: "vitrine", hartjesprijs: prijs, hartjesdatum: vandaag(), verkoopprijs: prijs });
    voegToe();
  };

  if (stap === "verlies") {
    const prijs = Math.round(getal(hartje) ?? 0);
    return (
      <OnderAankoop prijs={prijs} aankoop={ex.aankoopprijs!} vaultTekst="Laat in de vault"
        uitleg={`Jullie betaalden ${euro(ex.aankoopprijs)}. Verkopen aan ${euro(prijs)} kost geld; misschien beter even laten liggen.`}
        tochTekst={`Toch verkopen aan ${euro(prijs)}`}
        onVault={() => { setStap(null); onAnnuleer?.(); }}
        onToch={() => naarCatalogusEnMandje(prijs)}
        onAnders={() => setStap("vault")} />
    );
  }

  if (stap === "vault") {
    const p = getal(hartje);
    return (
      <div className="mandje-actie vraag">
        <p><strong>Deze kaart ligt in de vault.</strong> Zet ze eerst in de catalogus met een hartje{ex.verkoopprijs != null ? ` (waarde ${euro(ex.verkoopprijs)})` : ""}:</p>
        <div className="euro-invoer klein"><span>€</span><input inputMode="numeric" value={hartje} onChange={(e) => setHartje(e.target.value)} autoFocus /></div>
        <div className="knoppenrij">
          <button className="knop" disabled={p == null || p <= 0} onClick={() => {
            const prijs = Math.round(p!);
            if (onderAankoop(prijs, ex.aankoopprijs)) return setStap("verlies");
            naarCatalogusEnMandje(prijs);
          }}>Naar catalogus en in het mandje</button>
          <button className="knop zacht" onClick={() => { setStap(null); onAnnuleer?.(); }}>Annuleer</button>
        </div>
      </div>
    );
  }

  return (
    <button className="knop groot mandje-knop" onClick={klik}>
      <Icoon naam="mandje" maat={20} /> {res ? `Verkopen aan ${res.voor}` : "In het mandje"}
      {ex.opslag === "stockdoos" && !res && <span className="mini-label">vault</span>}
      {res?.prijs != null && <span className="mini-label">{euro(res.prijs)}</span>}
    </button>
  );
}
