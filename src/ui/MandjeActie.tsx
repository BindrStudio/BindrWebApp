import { useState } from "react";
import { huidig, inMandje, meld, naarTab, openTransactie, useApp, wijzig } from "../state";
import type { Exemplaar } from "../types";
import { inVoorraad } from "../lib/exemplaar";
import { regelUit } from "../lib/kassa";
import { datumKort, euro, getal, vandaag } from "../lib/format";
import { Icoon } from "./common";

/**
 * De knop "In het mandje" voor één exemplaar, met de twee vragen die de beurs nodig heeft:
 * een gereserveerde kaart (bewust ophalen) en een kaart uit de vault (eerst een hartje).
 */
export function MandjeActie({ ex, naToevoegen, onAnnuleer, stil = false, vraagMeteen = false }: {
  ex: Exemplaar; naToevoegen?: () => void; onAnnuleer?: () => void; stil?: boolean; vraagMeteen?: boolean;
}) {
  const { mandje } = useApp();
  const [stap, setStap] = useState<null | "reservatie" | "vault">(() =>
    !vraagMeteen || !inVoorraad(ex) ? null : ex.status === "gereserveerd" ? "reservatie" : ex.opslag === "stockdoos" ? "vault" : null);
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
    if (!stil) meld(`${actueel.naam} in het mandje`, "ok", { label: "Naar kassa", doe: () => naarTab("kassa") });
    setStap(null);
    naToevoegen?.();
  };
  const klik = () => {
    if (ex.status === "gereserveerd") setStap("reservatie");
    else if (ex.opslag === "stockdoos") setStap("vault");
    else voegToe();
  };

  if (stap === "reservatie") {
    return (
      <div className="mandje-actie vraag">
        <p><strong>Gereserveerd voor {ex.gereserveerd_voor || "een klant"}.</strong> Is dit de klant die reserveerde?</p>
        <div className="knoppenrij">
          <button className="knop" onClick={() => (ex.opslag === "stockdoos" ? setStap("vault") : voegToe())}>Ja, reservatie ophalen</button>
          <button className="knop zacht" onClick={() => { setStap(null); onAnnuleer?.(); }}>Nee, niet verkopen</button>
        </div>
      </div>
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
            wijzig(ex.id, { opslag: "vitrine", hartjesprijs: prijs, hartjesdatum: vandaag(), verkoopprijs: prijs });
            voegToe();
          }}>Naar catalogus en in het mandje</button>
          <button className="knop zacht" onClick={() => { setStap(null); onAnnuleer?.(); }}>Annuleer</button>
        </div>
      </div>
    );
  }

  return (
    <button className="knop groot mandje-knop" onClick={klik}>
      <Icoon naam="mandje" maat={20} /> In het mandje
      {ex.status === "gereserveerd" && <span className="mini-label">gereserveerd</span>}
      {ex.opslag === "stockdoos" && <span className="mini-label">vault</span>}
    </button>
  );
}
