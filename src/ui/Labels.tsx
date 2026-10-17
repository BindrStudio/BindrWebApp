import { useMemo, useState } from "react";
import { afstelling, kiesPrinter, koppelPrinter, loskoppelen, openExemplaar, perStrook, print, printRandtestNu, printTestlabel, useApp, wijzigVeel, zetAfstelling, zetInstellingen } from "../state";
import type { Exemplaar } from "../types";
import { toonCode } from "../lib/code";
import { krijgtLabel } from "../lib/exemplaar";
import { FICHERO_MAAT, LABELMATEN, labelDataUrl, labelRol, verschuivingTekst } from "../lib/label";
import { bluetoothMogelijk, huidigeMaat, isIphone, PRINTERS, VERSCHUIVING_MAX } from "../lib/printer";
import { ficheroDonkerte } from "../lib/fichero";
import { Icoon, Leeg, Segment } from "./common";
import { PLAATS } from "../lib/categorie";

type Lijst = "te printen" | "geprint";
const ACTIEF = (e: Exemplaar) => e.status === "in voorraad" && krijgtLabel(e);
const BLUEFY = "https://apps.apple.com/app/bluefy-web-ble-browser/id1492822055";

/** De kaarten die nog een label moeten krijgen, de oudste eerst (zoals in Labels › Te printen). */
export function wachtOpLabel(exemplaren: Exemplaar[]): Exemplaar[] {
  return exemplaren.filter((e) => ACTIEF(e) && e.label_status === "te printen").sort((a, b) => a.aangemaakt_op.localeCompare(b.aangemaakt_op));
}

export function Labels({ inSheet = false }: { inSheet?: boolean }) {
  const { exemplaren, instellingen } = useApp();
  const [lijst, setLijst] = useState<Lijst>("te printen");
  const [gekozen, setGekozen] = useState<Set<string> | null>(null); // null = alles

  const tePrinten = useMemo(() => wachtOpLabel(exemplaren), [exemplaren]);
  const per = perStrook(instellingen);
  const geprint = useMemo(() => exemplaren.filter((e) => ACTIEF(e) && e.label_status === "geprint"), [exemplaren]);
  const toon = lijst === "te printen" ? tePrinten : geprint;
  const selectie = gekozen ? toon.filter((e) => gekozen.has(e.id)) : toon;
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

      <PrinterBlok />

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
            {per === 2 && selectie.length % 2 === 1 && (
              <p className="zacht klein center strook-tip">
                {selectie.length} {selectie.length === 1 ? "label" : "labels"} = {Math.ceil(selectie.length / 2)} {selectie.length === 1 ? "strook" : "strookjes"}: één helft blijft leeg.{toon.length > selectie.length ? " Kies er nog één bij om niets te verspillen." : ""}
              </p>
            )}
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

/** Welke printer, verbonden of niet, en de afstelling ervan (voor de samenvatting in een kaart). */
export function printerSamenvatting(printer: string | null, i: ReturnType<typeof useApp>["instellingen"]): string {
  return printerDelen(printer, i).join(" · ");
}

/** Dezelfde samenvatting in stukjes (een kaart zet elk stukje op één regel: "50 × 15 mm" breekt niet). */
export function printerDelen(printer: string | null, i: ReturnType<typeof useApp>["instellingen"]): string[] {
  const soort = i.labelPrinter ?? "niimbot";
  const a = afstelling(i);
  const wie = printer ?? (soort === "fichero" ? "Fichero" : "Niimbot");
  const r = labelRol(i.labelMaat);
  const rol = soort === "fichero" ? `${FICHERO_MAAT.mmBreed} × ${FICHERO_MAAT.mmHoog} mm` : r.kort ?? r.label;
  const donker = soort === "fichero" ? ["licht", "normaal", "donker"][ficheroDonkerte(a.donkerte)] : `donkerte ${a.donkerte}`;
  const opzij = soort === "niimbot" && r.per === 2 && a.zijwaarts ? verschuivingTekst(a.zijwaarts, true) : null;
  return [wie, printer ? "verbonden" : null, rol, donker, a.verschuiving ? verschuivingTekst(a.verschuiving, soort === "fichero") : null, opzij, a.trager ? "trager" : null].filter((x): x is string => !!x);
}

/**
 * De printer van dit toestel: welke (Niimbot of Fichero), verbinden, de labelrol en de afstelling.
 * Dezelfde in Labels en onderaan een kaart, zodat je overal ziet en kiest waarmee je print.
 */
export function PrinterBlok() {
  const { printer, instellingen } = useApp();
  const soort = instellingen.labelPrinter ?? "niimbot";
  const fichero = soort === "fichero";
  const kan = bluetoothMogelijk(soort);
  const r = labelRol(instellingen.labelMaat);
  const rol = fichero ? `${FICHERO_MAAT.mmBreed} × ${FICHERO_MAAT.mmHoog} mm` : r.label;
  return (
    <div className="printer-blok">
      <div className="maatkeuze printerkeuze">
        <span className="zacht klein">Printer van deze gsm</span>
        <div className="chips">
          {PRINTERS.map((p) => (
            <button key={p.id} className={`chip${soort === p.id ? " aan" : ""}`} aria-pressed={soort === p.id} onClick={() => void kiesPrinter(p.id)}>
              {p.label} <span className="zacht klein">{p.rol}</span>
            </button>
          ))}
        </div>
      </div>

      <section className={`printerkaart${printer ? " verbonden" : ""}`}>
        <div className="printer-icoon"><Icoon naam="printer" maat={26} /></div>
        <div className="printer-tekst">
          <strong>{printer || `${fichero ? "Fichero" : "Niimbot"} niet verbonden`}</strong>
          <span className="zacht klein">
            {printer ? `Labels ${rol}` : kan ? `Zet de ${fichero ? "Fichero" : "Niimbot"} aan en verbind (of tik gewoon op Print)` : isIphone() ? "Op iPhone print enkel de gratis Bluefy-browser (Safari en Chrome kunnen het niet)" : "Printen werkt in Chrome op Android of een computer"}
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

      {fichero ? (
        <p className="zacht klein">Labelrol 30 × 14 mm. Het label loopt in de lengte door de printer; de app draait het zelf.</p>
      ) : (
        <div className="maatkeuze">
          <span className="zacht klein">Labelrol</span>
          <div className="chips">
            {LABELMATEN.map((m) => (
              <button key={m.id} className={`chip${r.id === m.id ? " aan" : ""}`} aria-pressed={r.id === m.id} onClick={() => zetInstellingen({ labelMaat: m.id })}>{m.label}</button>
            ))}
          </div>
          {r.per === 2 && (
            <p className="zacht klein">
              Twee labels naast elkaar op één strook. De printer schuift altijd een hele strook door: print je één label,
              dan komt het links en blijft de rechterhelft leeg. Bij <em>Te printen</em> komen ze per twee op een strook.
            </p>
          )}
        </div>
      )}

      {kan && <Afstellen />}
      <FicheroUitleg />
    </div>
  );
}

/** Hoe je met de Fichero (Action) print: eenmalig klaarzetten, dan gewoon printen. */
function FicheroUitleg() {
  return (
    <details className="afstellen fichero-uitleg">
      <summary>Zo print je met de Fichero (Action)</summary>
      <ol>
        <li><strong>Rol erin:</strong> labels van 30 × 14 mm (de rol van Action). Klep dicht en de printer aanzetten. Opladen gaat met de USB-C-kabel.</li>
        <li><strong>Niet koppelen</strong> in de Bluetooth-instellingen van je gsm, en sluit de app <em>Fichero Printer</em> (die je normaal bij deze printer gebruikt): die houdt de verbinding anders vast.</li>
        <li><strong>Fichero kiezen:</strong> tik bij <em>Printer van deze gsm</em> op <em>Fichero</em>. Dat onthoudt deze gsm, tot je terug <em>Niimbot</em> kiest; elke printer houdt zijn eigen afstelling.</li>
        <li><strong>Verbinden:</strong> tik op <em>Verbinden</em> en kies de printer (heet FICHERO_… of D11s_…). Android: in Chrome, met Bluetooth en locatie aan. iPhone: in de gratis app Bluefy.</li>
        <li><strong>De eerste keer:</strong> print een <em>Proeflabel</em> en scan het met Scan. Print ook een <em>Randtest</em>: staat de print te ver links of rechts, schuif per halve mm; te licht, kies <em>Donker</em>.</li>
        <li><strong>Daarna:</strong> bij <em>Te printen</em> kies je de kaarten en tik je <em>Print</em>. Plak het label achteraan op de toploader en scan het: pas dan staat de kaart op de klantenpagina.</li>
        <li><strong>Lukt het niet?</strong> Komt een label leeg of half uit de printer: zet <em>Trager printen</em> aan. Vindt de gsm de printer niet: printer aan, dichterbij, de app Fichero Printer dicht. De app zegt het ook als de klep openstaat of de labels op zijn.</li>
        <li><strong>Terug naar de Niimbot:</strong> tik bij <em>Printer van deze gsm</em> op <em>Niimbot</em>. Staat de Fichero nog aan, dan zoekt de app enkel een Fichero en vindt ze de Niimbot niet.</li>
      </ol>
    </details>
  );
}

/** Proeflabel, randtest en de afstelling van dit toestel (donkerte, hoger/lager, trager). */
export function Afstellen() {
  const { instellingen, bezig } = useApp();
  const a = afstelling(instellingen);
  const fichero = a.printer === "fichero";
  const duo = perStrook(instellingen) === 2;
  const stap = (nu: number | undefined, d: number) => Math.min(VERSCHUIVING_MAX, Math.max(-VERSCHUIVING_MAX, Math.round(((nu ?? 0) + d) * 2) / 2));
  const schuif = (d: number) => zetAfstelling({ verschuiving: stap(a.verschuiving, d) });
  const opzij = (d: number) => zetAfstelling({ zijwaarts: stap(a.zijwaarts, d) });
  return (
    <details className="afstellen">
      <summary>Proeflabel en afstellen ({fichero ? "Fichero" : "Niimbot"})</summary>
      <div className="knoppenrij">
        <button className="knop zacht klein" disabled={!!bezig} onClick={() => void printTestlabel()}><Icoon naam="printer" maat={16} /> Proeflabel</button>
        <button className="knop zacht klein" disabled={!!bezig} onClick={() => void printRandtestNu()}><Icoon naam="printer" maat={16} /> Randtest</button>
      </div>
      <p className="zacht klein">
        {duo
          ? "Randtest: een kader op elk label (1 streepje = 1 mm). Zie je op allebei de vier randen? Dan valt er niets weg. Valt links of rechts een rand weg of loopt een kader over de ruimte tussen de labels: schuif naar links of rechts."
          : "Randtest: zie je de vier randen met streepjes (1 streepje = 1 mm)? Dan valt er niets weg."}
        {fichero ? " Boven en onder een smal wit randje is normaal: de printkop is 12 mm breed." : duo ? "" : " Links en rechts een smal wit randje is normaal."}
      </p>
      <div className="afstel-rij">
        <span>Donkerte</span>
        <div className="chips">
          {fichero
            ? ([[1, "Licht"], [3, "Normaal · standaard"], [5, "Donker"]] as const).map(([d, naam]) => {
              const aan = ficheroDonkerte(a.donkerte) === ficheroDonkerte(d);
              return <button key={d} className={`chip${aan ? " aan" : ""}`} aria-pressed={aan} onClick={() => zetAfstelling({ donkerte: d })}>{naam}</button>;
            })
            : [1, 2, 3, 4, 5].map((d) => (
              <button key={d} className={`chip${a.donkerte === d ? " aan" : ""}`} aria-pressed={a.donkerte === d} onClick={() => zetAfstelling({ donkerte: d })}>{d}{d === 3 ? " · standaard" : ""}</button>
            ))}
        </div>
      </div>
      <div className="afstel-rij">
        <span>{fichero ? "Staat de print te ver naar links of rechts?" : "Staat de print te hoog of te laag?"}</span>
        <div className="afstel-schuif">
          <button className="knop zacht klein" onClick={() => schuif(-0.5)} disabled={(a.verschuiving ?? 0) <= -VERSCHUIVING_MAX}>{fichero ? "Naar links" : "Hoger"}</button>
          <strong aria-live="polite">{verschuivingTekst(a.verschuiving ?? 0, fichero)}</strong>
          <button className="knop zacht klein" onClick={() => schuif(0.5)} disabled={(a.verschuiving ?? 0) >= VERSCHUIVING_MAX}>{fichero ? "Naar rechts" : "Lager"}</button>
        </div>
      </div>
      {duo && (
        <div className="afstel-rij">
          <span>Staat de print te ver naar links of rechts?</span>
          <div className="afstel-schuif zijwaarts">
            <button className="knop zacht klein" onClick={() => opzij(-0.5)} disabled={(a.zijwaarts ?? 0) <= -VERSCHUIVING_MAX}>Naar links</button>
            <strong aria-live="polite">{verschuivingTekst(a.zijwaarts ?? 0, true)}</strong>
            <button className="knop zacht klein" onClick={() => opzij(0.5)} disabled={(a.zijwaarts ?? 0) >= VERSCHUIVING_MAX}>Naar rechts</button>
          </div>
        </div>
      )}
      <label className="schakel rij">
        <input type="checkbox" checked={!!a.trager} onChange={(e) => zetAfstelling({ trager: e.target.checked })} />
        <span>Trager printen <span className="zacht klein">(als een label leeg of half uit de printer komt)</span></span>
      </label>
      <p className="zacht klein">Dit geldt enkel voor deze gsm en enkel voor de {fichero ? "Fichero" : "Niimbot"}: elke printer houdt zijn eigen afstelling.</p>
    </details>
  );
}

function LabelRij({ ex, aan, onWissel }: { ex: Exemplaar; aan: boolean; onWissel: () => void }) {
  const { instellingen } = useApp();
  const beeld = useMemo(() => {
    try { return labelDataUrl(ex, huidigeMaat(instellingen.labelMaat, instellingen.labelPrinter)); } catch { return null; }
  }, [ex, instellingen.labelMaat, instellingen.labelPrinter]);
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
