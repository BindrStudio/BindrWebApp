import { useMemo, useState } from "react";
import { afstelling, koppelPrinter, loskoppelen, openExemplaar, print, printRandtestNu, printTestlabel, useApp, wijzigVeel, zetInstellingen } from "../state";
import type { Exemplaar } from "../types";
import { toonCode } from "../lib/code";
import { krijgtLabel } from "../lib/exemplaar";
import { LABELMATEN, labelDataUrl, verschuivingTekst } from "../lib/label";
import { bluetoothMogelijk, huidigeMaat, isIphone, VERSCHUIVING_MAX } from "../lib/printer";
import { Icoon, Leeg, Segment } from "./common";
import { PLAATS } from "../lib/categorie";

type Lijst = "te printen" | "geprint";
const ACTIEF = (e: Exemplaar) => e.status === "in voorraad" && krijgtLabel(e);
const BLUEFY = "https://apps.apple.com/app/bluefy-web-ble-browser/id1492822055";

export function Labels({ inSheet = false }: { inSheet?: boolean }) {
  const { exemplaren, printer, instellingen } = useApp();
  const [lijst, setLijst] = useState<Lijst>("te printen");
  const [gekozen, setGekozen] = useState<Set<string> | null>(null); // null = alles

  const tePrinten = useMemo(() => exemplaren.filter((e) => ACTIEF(e) && e.label_status === "te printen")
    .sort((a, b) => a.aangemaakt_op.localeCompare(b.aangemaakt_op)), [exemplaren]);
  const geprint = useMemo(() => exemplaren.filter((e) => ACTIEF(e) && e.label_status === "geprint"), [exemplaren]);
  const toon = lijst === "te printen" ? tePrinten : geprint;
  const selectie = gekozen ? toon.filter((e) => gekozen.has(e.id)) : toon;
  const kan = bluetoothMogelijk();

  const wissel = (id: string) => {
    const s = new Set(gekozen ?? toon.map((e) => e.id));
    if (s.has(id)) s.delete(id); else s.add(id);
    setGekozen(s);
  };

  return (
    <div className={inSheet ? "labels-in-sheet" : "scherm"}>
      {inSheet ? <p className="zacht klein">QR-labels voor de achterkant van de toploader, zonder prijs.</p> : (
        <header className="kop">
          <div>
            <h1>Labels</h1>
            <p className="kop-sub">QR-labels voor de achterkant van de toploader, zonder prijs</p>
          </div>
        </header>
      )}

      <section className={`printerkaart${printer ? " verbonden" : ""}`}>
        <div className="printer-icoon"><Icoon naam="printer" maat={26} /></div>
        <div className="printer-tekst">
          <strong>{printer || "Geen printer verbonden"}</strong>
          <span className="zacht klein">
            {printer ? `Labels ${LABELMATEN.find((l) => l.id === instellingen.labelMaat)?.label ?? ""}` : kan ? "Zet de Niimbot aan en verbind" : isIphone() ? "Op iPhone print enkel de gratis Bluefy-browser (Safari en Chrome kunnen het niet)" : "Printen werkt in Chrome op Android of een computer"}
          </span>
        </div>
        {kan ? (
          printer
            ? <button className="knop zacht klein" onClick={() => void loskoppelen()}>Loskoppelen</button>
            : <button className="knop klein" onClick={() => void koppelPrinter()}><Icoon naam="bluetooth" maat={16} /> Verbinden</button>
        ) : isIphone() ? (
          <a className="knop klein" href={BLUEFY} target="_blank" rel="noreferrer">Bluefy</a>
        ) : null}
      </section>

      <div className="maatkeuze">
        <span className="zacht klein">Labelrol</span>
        <div className="chips">
          {LABELMATEN.map((m) => (
            <button key={m.id} className={`chip${instellingen.labelMaat === m.id ? " aan" : ""}`} onClick={() => zetInstellingen({ labelMaat: m.id })}>{m.label}</button>
          ))}
        </div>
      </div>

      {kan && <Afstellen />}

      <Segment<Lijst> waarde={lijst} onKies={(l) => { setLijst(l); setGekozen(null); }} opties={[
        { waarde: "te printen", label: `Te printen ${tePrinten.length}` },
        { waarde: "geprint", label: `Nog te plakken ${geprint.length}` },
      ]} />

      {toon.length === 0 ? (
        lijst === "te printen"
          ? <Leeg titel="Alles is geprint" tekst="Nieuwe kaarten komen hier vanzelf bij." />
          : <Leeg titel="Niets meer te plakken" tekst="Geprinte labels komen hier tot je ze na het plakken scant." />
      ) : (
        <>
          <div className="lijst-acties">
            <button className="tekstknop klein" onClick={() => setGekozen(gekozen && gekozen.size === 0 ? null : new Set())}>
              {gekozen && gekozen.size === 0 ? "Alles kiezen" : "Niets kiezen"}
            </button>
            <span className="zacht klein">{selectie.length} gekozen</span>
          </div>
          <ul className="labellijst">
            {toon.map((ex) => (
              <LabelRij key={ex.id} ex={ex} aan={!gekozen || gekozen.has(ex.id)} onWissel={() => wissel(ex.id)} />
            ))}
          </ul>
          <div className={`onderbalk${inSheet ? " in-sheet" : ""}`}>
            {lijst === "te printen" ? (
              <button className="knop groot" disabled={!selectie.length} onClick={() => { void print(selectie.map((e) => e.id)); setGekozen(null); }}>
                <Icoon naam="printer" maat={20} /> {selectie.length === 1 ? "Print 1 label" : `Print ${selectie.length} labels`}
              </button>
            ) : (
              <>
                <p className="zacht klein center">Plak de labels en scan ze daarna, of zet ze hier in één keer op geplakt. Pas dan verschijnen de kaarten op de klantenpagina.</p>
                <div className="knoppenrij">
                  <button className="knop zacht" disabled={!selectie.length} onClick={() => void print(selectie.map((e) => e.id))}>Opnieuw printen</button>
                  <button className="knop" disabled={!selectie.length} onClick={() => { void wijzigVeel(selectie.map((e) => e.id), { label_status: "gestickerd" }); setGekozen(null); }}>
                    <Icoon naam="check" maat={18} /> Zijn geplakt
                  </button>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** Proeflabel, randtest en de afstelling van dit toestel (donkerte, hoger/lager, trager). */
function Afstellen() {
  const { instellingen, bezig } = useApp();
  const a = afstelling(instellingen);
  const schuif = (d: number) => {
    const n = Math.min(VERSCHUIVING_MAX, Math.max(-VERSCHUIVING_MAX, Math.round(((a.verschuiving ?? 0) + d) * 2) / 2));
    zetInstellingen({ labelVerschuiving: n });
  };
  return (
    <details className="afstellen">
      <summary>Proeflabel en afstellen</summary>
      <div className="knoppenrij">
        <button className="knop zacht klein" disabled={!!bezig} onClick={() => void printTestlabel()}><Icoon naam="printer" maat={16} /> Proeflabel</button>
        <button className="knop zacht klein" disabled={!!bezig} onClick={() => void printRandtestNu()}><Icoon naam="printer" maat={16} /> Randtest</button>
      </div>
      <p className="zacht klein">Randtest: zie je de vier randen met streepjes (1 streepje = 1 mm)? Dan valt er niets weg. Links en rechts een smal wit randje is normaal.</p>
      <div className="afstel-rij">
        <span>Donkerte</span>
        <div className="chips">
          {[1, 2, 3, 4, 5].map((d) => (
            <button key={d} className={`chip${a.donkerte === d ? " aan" : ""}`} aria-pressed={a.donkerte === d} onClick={() => zetInstellingen({ labelDonkerte: d })}>{d}{d === 3 ? " · standaard" : ""}</button>
          ))}
        </div>
      </div>
      <div className="afstel-rij">
        <span>Staat de print te hoog of te laag?</span>
        <div className="afstel-schuif">
          <button className="knop zacht klein" onClick={() => schuif(-0.5)} disabled={(a.verschuiving ?? 0) <= -VERSCHUIVING_MAX}>Hoger</button>
          <strong aria-live="polite">{verschuivingTekst(a.verschuiving ?? 0)}</strong>
          <button className="knop zacht klein" onClick={() => schuif(0.5)} disabled={(a.verschuiving ?? 0) >= VERSCHUIVING_MAX}>Lager</button>
        </div>
      </div>
      <label className="schakel rij">
        <input type="checkbox" checked={!!a.trager} onChange={(e) => zetInstellingen({ labelTrager: e.target.checked })} />
        <span>Trager printen <span className="zacht klein">(als een label leeg of half uit de printer komt)</span></span>
      </label>
      <p className="zacht klein">Dit geldt enkel voor dit toestel.</p>
    </details>
  );
}

function LabelRij({ ex, aan, onWissel }: { ex: Exemplaar; aan: boolean; onWissel: () => void }) {
  const { instellingen } = useApp();
  const beeld = useMemo(() => {
    try { return labelDataUrl(ex, huidigeMaat(instellingen.labelMaat)); } catch { return null; }
  }, [ex, instellingen.labelMaat]);
  return (
    <li className={`labelrij${aan ? " aan" : ""}`}>
      <button className="vink" onClick={onWissel} aria-label={aan ? "Niet printen" : "Wel printen"}>
        {aan && <Icoon naam="check" maat={16} />}
      </button>
      <button className="labelrij-beeld" onClick={() => openExemplaar(ex.id)}>
        {beeld ? <img src={beeld} alt={`Label ${toonCode(ex.code)}`} /> : <span className="code">{toonCode(ex.code)}</span>}
        <span className="zacht klein">{PLAATS[ex.opslag].naam} · {ex.naam}</span>
      </button>
    </li>
  );
}
