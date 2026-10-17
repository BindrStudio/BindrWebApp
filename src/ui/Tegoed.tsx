// Profiel › Tegoeden: de tegoedbonnen (storecredit). Iemand verkocht ons kaarten en kreeg een bon in plaats van geld;
// hier zie je wat er nog op elke bon staat, van wie, en waar hij gebruikt werd. Betalen met een bon gaat in de kassa.
import { useMemo, useState } from "react";
import { kanTegoed, openTransactie, SCHEMA_016, sluit, useApp } from "../state";
import { tegoedbonnen, zoekBonnen, type Tegoedbon } from "../lib/tegoed";
import { datumKort, euro } from "../lib/format";
import { Icoon, Sheet } from "./common";

export function TegoedSheet() {
  const { transacties, gedeeltelijk } = useApp();
  const [zoek, setZoek] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [ookOp, setOokOp] = useState(false);
  const alle = useMemo(() => tegoedbonnen(transacties).reverse(), [transacties]);
  const openstaand = alle.filter((b) => b.rest > 0.004);
  const totaal = Math.round(openstaand.reduce((s, b) => s + b.rest, 0) * 100) / 100;
  const lijst = zoekBonnen(ookOp ? alle : openstaand, zoek);
  return (
    <Sheet titel="Tegoeden" onSluit={sluit} vol>
      <p className="zacht">
        Verkoopt iemand ons kaarten en wil hij liever tegoed dan geld? Kies bij Afrekenen <strong>Tegoed</strong>: hij krijgt een bon op
        naam. Later betaalt hij er (een deel van) een aankoop mee: kies dan bij Afrekenen weer Tegoed.
      </p>
      {!kanTegoed() && <p className="nakijken">{SCHEMA_016}</p>}
      {gedeeltelijk && <p className="nakijken klein">Offline gestart: oudere bonnen (van meer dan 120 dagen geleden) zie je pas als je weer online bent.</p>}
      <div className="tegoed-totaal">
        <Icoon naam="tegoed" maat={22} />
        <div><strong>{euro(totaal)}</strong><span className="zacht klein">nog open op {openstaand.length} {openstaand.length === 1 ? "bon" : "bonnen"} (dat zijn we aan klanten verschuldigd)</span></div>
      </div>
      {alle.length > 4 && <input value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder="Zoek op naam of code (TG-…)" aria-label="Zoek een tegoedbon" />}
      {!lijst.length ? <p className="zacht">{alle.length ? "Geen bon gevonden." : "Nog geen tegoedbonnen."}</p> : (
        <ul className="bon-lijst">
          {lijst.map((b) => <BonRij key={b.id} b={b} open={open === b.id} onOpen={() => setOpen(open === b.id ? null : b.id)} />)}
        </ul>
      )}
      {alle.length > openstaand.length && (
        <button className="tekstknop" onClick={() => setOokOp(!ookOp)}>{ookOp ? "Enkel de open bonnen" : `Ook de opgebruikte bonnen (${alle.length - openstaand.length})`}</button>
      )}
      <p className="zacht klein">
        Voor de boekhouding: de inkoop tegen een bon is een aankoop (zoals een ruil, met de betaling later); betalen met een bon is een
        ontvangst (een aparte lijn bij de dagontvangsten). Wat er op 31 december nog open staat, is een schuld aan klanten: zie Boekhouding.
      </p>
    </Sheet>
  );
}

function BonRij({ b, open, onOpen }: { b: Tegoedbon; open: boolean; onOpen: () => void }) {
  return (
    <li>
      <button className={`bon-rij zonder-vink${b.rest <= 0.004 ? " op" : ""}`} aria-expanded={open} onClick={onOpen}>
        <span className="bon-tekst"><strong>{b.naam}</strong><span className="zacht klein">{b.code} · {datumKort(b.datum)}</span></span>
        <span className="bon-bedragen">
          <strong className="bon-rest">{b.rest > 0.004 ? euro(b.rest) : "op"}</strong>
          {b.gebruikt > 0 && <span className="zacht klein">van {euro(b.bedrag)}</span>}
        </span>
      </button>
      {open && (
        <div className="bon-detail">
          <button className="lijst-knop" onClick={() => openTransactie(b.id)}>
            <span>{datumKort(b.datum)} · {b.transactie.soort === "retour" ? "bon gekregen voor een retour" : "bon gekregen voor kaarten"}</span><span className="rechts">+ {euro(b.bedrag)}</span>
          </button>
          {b.gebruik.map((g) => (
            <button key={g.transactie.id} className="lijst-knop" onClick={() => openTransactie(g.transactie.id)}>
              <span>{datumKort(g.transactie.tijd)} · {g.transactie.soort === "retour" ? "teruggegeven (deal teruggedraaid)" : "gebruikt"}</span><span className="rechts">− {euro(g.bedrag)}</span>
            </button>
          ))}
          {b.rest < -0.004 && <p className="nakijken klein">Er werd {euro(-b.rest)} meer gebruikt dan er op de bon stond (bv. twee gsm's tegelijk offline). Kijk de betalingen na.</p>}
        </div>
      )}
    </li>
  );
}
