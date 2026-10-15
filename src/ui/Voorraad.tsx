import { useMemo, useState } from "react";
import { doePrijscheck, openExemplaar, openToevoegen, useApp } from "../state";
import type { Exemplaar, Opslag } from "../types";
import { datumKort, euro, zonderAccenten } from "../lib/format";
import { toonCode } from "../lib/code";
import type { TeWijzigen } from "../lib/pricing";
import { Badges, Hartje, Icoon, KaartFoto, Leeg, Segment } from "./common";

type Weergave = Opslag | "alles";
type Filter = "geen" | "wijzigen" | "label" | "gereserveerd";

const IN_VOORRAAD = (e: Exemplaar) => e.status === "in voorraad" || e.status === "gereserveerd";

export function Voorraad() {
  const { exemplaren, teWijzigen, prijscheckOp, gids, artikelen } = useApp();
  const [weergave, setWeergave] = useState<Weergave>("vitrine");
  const [filter, setFilter] = useState<Filter>("geen");
  const [zoek, setZoek] = useState("");

  const actief = useMemo(() => exemplaren.filter(IN_VOORRAAD), [exemplaren]);
  const vitrine = useMemo(() => actief.filter((e) => e.opslag === "vitrine"), [actief]);
  const waardeVitrine = vitrine.reduce((s, e) => s + (e.hartjesprijs ?? 0), 0);
  const waardeArtikelen = artikelen.filter((a) => a.opslag === "vitrine").reduce((s, a) => s + (a.prijs ?? 0) * a.aantal, 0);

  const lijst = useMemo(() => {
    const q = zonderAccenten(zoek.trim());
    let l = actief.filter((e) => weergave === "alles" || e.opslag === weergave);
    if (filter === "wijzigen") l = l.filter((e) => teWijzigen.has(e.id));
    if (filter === "label") l = l.filter((e) => e.label_status !== "gestickerd");
    if (filter === "gereserveerd") l = l.filter((e) => e.status === "gereserveerd");
    if (q) {
      const woorden = q.split(/\s+/);
      l = l.filter((e) => {
        const t = zonderAccenten([e.naam, e.naam_origineel, e.set_naam, e.set_code, e.nummer, e.code, toonCode(e.code), e.taal, e.gereserveerd_voor].filter(Boolean).join(" "));
        return woorden.every((w) => t.includes(w));
      });
    }
    return [...l].sort((a, b) => {
      const wa = teWijzigen.has(a.id) ? 0 : 1;
      const wb = teWijzigen.has(b.id) ? 0 : 1;
      return wa - wb || (b.hartjesprijs ?? b.verkoopprijs ?? 0) - (a.hartjesprijs ?? a.verkoopprijs ?? 0) || a.naam.localeCompare(b.naam);
    });
  }, [actief, weergave, filter, zoek, teWijzigen]);

  const aantalLabels = actief.filter((e) => e.label_status !== "gestickerd").length;
  const aantalGereserveerd = actief.filter((e) => e.status === "gereserveerd").length;

  return (
    <div className="scherm">
      <header className="kop">
        <div>
          <h1>Voorraad</h1>
          <p className="kop-sub">
            Vitrine: {vitrine.length} exemplaren · {euro(waardeVitrine, true)}
            {waardeArtikelen > 0 && <> · artikelen {euro(waardeArtikelen, true)}</>}
          </p>
        </div>
        <button className="rond-knop groot zee" onClick={() => openToevoegen()} aria-label="Kaart toevoegen"><Icoon naam="plus" /></button>
      </header>

      <div className="werkbalk">
        <button className={`knop prijsknop${teWijzigen.size ? " actief" : ""}`} onClick={async () => { const l = await doePrijscheck(); if (l.length) { setFilter("wijzigen"); setWeergave("vitrine"); } }}>
          <Icoon naam="vernieuw" maat={18} />
          Prijzen nakijken
          {teWijzigen.size > 0 && <span className="teller">{teWijzigen.size}</span>}
        </button>
        <span className="prijsdatum">{gids ? `Prijsgids ${datumKort(gids.datum)}` : "Nog geen prijsgids"}{prijscheckOp && ` · nagekeken ${datumKort(prijscheckOp)}`}</span>
      </div>

      <Segment<Weergave>
        waarde={weergave}
        onKies={setWeergave}
        opties={[
          { waarde: "vitrine", label: `Vitrine ${vitrine.length}` },
          { waarde: "stockdoos", label: `Stockdoos ${actief.length - vitrine.length}` },
          { waarde: "alles", label: "Alles" },
        ]}
      />

      <div className="zoekbalk">
        <Icoon naam="zoek" maat={18} />
        <input value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder="Zoek op naam, set, nummer of code" inputMode="search" />
        {zoek && <button className="wis" onClick={() => setZoek("")} aria-label="Wissen"><Icoon naam="kruis" maat={16} /></button>}
      </div>

      <div className="chips">
        {teWijzigen.size > 0 && <FilterChip aan={filter === "wijzigen"} onClick={() => setFilter(filter === "wijzigen" ? "geen" : "wijzigen")} rood>Te wijzigen {teWijzigen.size}</FilterChip>}
        {aantalLabels > 0 && <FilterChip aan={filter === "label"} onClick={() => setFilter(filter === "label" ? "geen" : "label")}>Label nog niet geplakt {aantalLabels}</FilterChip>}
        {aantalGereserveerd > 0 && <FilterChip aan={filter === "gereserveerd"} onClick={() => setFilter(filter === "gereserveerd" ? "geen" : "gereserveerd")}>Gereserveerd {aantalGereserveerd}</FilterChip>}
      </div>

      {lijst.length === 0 ? (
        actief.length === 0 ? (
          <Leeg titel="Nog geen kaarten" tekst="Voeg je eerste kaart toe, of laad de testset in via Meer.">
            <button className="knop" onClick={() => openToevoegen()}><Icoon naam="plus" maat={18} /> Kaart toevoegen</button>
          </Leeg>
        ) : (
          <Leeg titel="Niets gevonden" tekst="Probeer een andere zoekterm of filter." />
        )
      ) : (
        <div className="raster">
          {lijst.map((ex, i) => <Tegel key={ex.id} ex={ex} i={i} wijzig={teWijzigen.get(ex.id)} />)}
        </div>
      )}
    </div>
  );
}

function FilterChip({ aan, onClick, children, rood }: { aan: boolean; onClick: () => void; children: React.ReactNode; rood?: boolean }) {
  return <button className={`chip${aan ? " aan" : ""}${rood ? " rood" : ""}`} onClick={onClick}>{children}</button>;
}

export function Tegel({ ex, i, wijzig }: { ex: Exemplaar; i: number; wijzig?: TeWijzigen }) {
  const prijs = ex.opslag === "vitrine" ? ex.hartjesprijs : ex.verkoopprijs;
  const duur = (prijs ?? 0) >= 50;
  return (
    <button
      className={`tegel${wijzig ? " wijzig" : ""}${duur ? " holo" : ""}`}
      style={{ ["--i" as string]: Math.min(i, 24) }}
      onClick={() => openExemplaar(ex.id)}
    >
      <KaartFoto src={ex.afbeelding} alt={ex.naam} />
      <div className="tegel-info">
        <div className="tegel-naam">{ex.naam}</div>
        <div className="tegel-set">{[ex.set_code, ex.nummer].filter(Boolean).join(" ") || ex.soort}</div>
        <Badges ex={ex} />
        <div className="tegel-onder">
          {ex.opslag === "vitrine" ? <Hartje prijs={ex.hartjesprijs} /> : <span className="waarde">{euro(ex.verkoopprijs)}</span>}
          {ex.label_status !== "gestickerd" && <span className="label-stip" title="Label nog niet geplakt"><Icoon naam="label" maat={14} /></span>}
        </div>
      </div>
      {wijzig && (
        <div className={`wijzig-band ${wijzig.richting}`}>
          <Icoon naam={wijzig.richting === "op" ? "op" : "neer"} maat={14} />
          {euro(wijzig.oud)} → {euro(wijzig.nieuw)}
        </div>
      )}
    </button>
  );
}
