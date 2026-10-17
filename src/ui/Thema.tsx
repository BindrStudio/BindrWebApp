// Profiel › Thema: de klantenpagina in het thema van een feest of seizoen (Halloween, kerst …). Per thema een eigen
// logo, een kleur, versiering in de achtergrond en een korte zin, elk jaar in dezelfde periode (of met de hand aan).
import { useEffect, useRef, useState } from "react";
import { bewaarThema, kanThema, laadThemas, meld, SCHEMA_013, sluit, themaLijst, useApp } from "../state";
import { actiefThema, maandDag, maandDagMooi, nieuwThema, THEMA_SOORTEN, veiligeKleur, VORMEN, type ThemaSoort } from "../lib/thema";
import type { Thema, ThemaAan } from "../types";
import { vandaag } from "../lib/format";
import { veiligeFoto, verkleinUitgeknipt } from "../lib/eigenfoto";
import { klantUrl } from "../config";
import { VormSvg } from "../gedeeld/Vorm";
import { Icoon, Segment, Sheet, Veld } from "./common";

const MAANDEN = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];

/** Bekijk een thema op de klantenpagina, ook buiten de periode (?thema=halloween). */
function proefUrl(id: string, demo: boolean): string {
  const u = new URL(klantUrl(demo));
  u.searchParams.set("thema", id);
  return u.href;
}

export function ThemaSheet() {
  const app = useApp();
  const kan = kanThema(app);
  const [bewerk, setBewerk] = useState<string | null>(null);
  useEffect(() => { if (kan) void laadThemas(); }, [kan]);
  const lijst = themaLijst();
  const md = maandDag(vandaag());
  const soort = THEMA_SOORTEN.find((s) => s.id === bewerk);
  if (soort) {
    const bewaard = lijst?.find((t) => t.id === soort.id) ?? null;
    return <ThemaBewerk key={soort.id} soort={soort} bewaard={bewaard} demo={app.backend?.soort === "demo"} onTerug={() => setBewerk(null)} />;
  }
  // Hetzelfde thema als de klantenpagina: met de hand aan gaat voor een periode.
  const nu = lijst ? actiefThema(lijst, md) : null;
  return (
    <Sheet titel="Thema" onSluit={sluit} vol>
      <p className="zacht">
        Voor een feest of seizoen: een eigen logo, een kleur, versiering in de achtergrond en een korte zin op de klantenpagina.
        Zet het één keer klaar; daarna komt het elk jaar vanzelf in de periode.
      </p>
      {!kan ? <p className="nakijken">{SCHEMA_013}</p> : lijst == null ? <p className="zacht">Laden…</p> : (
        <>
          <p className={`thema-nu${nu ? " aan" : ""}`}>{nu ? <>Nu op de site: <strong>{nu.naam}</strong></> : "Nu geen thema: de gewone site met belletjes en sterretjes."}</p>
          <ul className="thema-lijst">
            {THEMA_SOORTEN.map((s) => {
              const t = lijst.find((x) => x.id === s.id);
              const logo = veiligeFoto(t?.logo);
              const status = !t ? "Nog niet klaargezet" : t.aan === "uit" ? "Uit" : t.aan === "aan" ? "Staat aan" : `Elk jaar ${maandDagMooi(t.van)} – ${maandDagMooi(t.tot)}`;
              return (
                <li key={s.id}>
                  <button className="thema-rij" onClick={() => setBewerk(s.id)} style={{ ["--thema" as string]: veiligeKleur(t?.kleur) ?? s.kleur }}>
                    <span className="thema-vormpje"><VormSvg vorm={VORMEN[s.zweef[0] ?? "ster"]} /></span>
                    <span className="thema-rij-tekst">
                      <strong>{s.naam}</strong>
                      <span>{status}{t && logo ? " · eigen logo" : ""}</span>
                    </span>
                    {t && nu?.id === t.id && <span className="thema-live">Nu</span>}
                    <Icoon naam="chevron" maat={18} className="thema-pijl" />
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Sheet>
  );
}

function ThemaBewerk({ soort, bewaard, demo, onTerug }: { soort: ThemaSoort; bewaard: Thema | null; demo: boolean; onTerug: () => void }) {
  const [v, setV] = useState<Thema>(() => ({ ...nieuwThema(soort), ...bewaard }));
  const [logoNieuw, setLogoNieuw] = useState(false); // enkel een nieuw of gewist logo gaat (opnieuw) naar de server
  const [bezig, setBezig] = useState(false);
  const invoer = useRef<HTMLInputElement>(null);
  const kleur = veiligeKleur(v.kleur) ?? soort.kleur;
  const logo = veiligeFoto(v.logo);
  const gewijzigd = logoNieuw || !bewaard || (["van", "tot", "aan", "kleur", "tekst"] as const).some((k) => (v[k] ?? null) !== (bewaard[k] ?? null));

  const kiesLogo = async (f: File | undefined) => {
    if (!f) return;
    setBezig(true);
    try {
      const { url, doorzichtig } = await verkleinUitgeknipt(f, 600, 390_000);
      setV((x) => ({ ...x, logo: url }));
      setLogoNieuw(true);
      if (!doorzichtig) meld("Dit logo heeft een achtergrond. Een PNG zonder achtergrond staat mooier bovenaan.", "info", undefined, 6000);
    } catch (e) {
      meld(e instanceof Error ? e.message : String(e), "fout");
    } finally {
      setBezig(false);
    }
  };
  const bewaar = () => {
    bewaarThema({ ...v, kleur: veiligeKleur(v.kleur), logo: logoNieuw ? v.logo ?? null : undefined });
    setLogoNieuw(false);
    meld(v.aan === "uit" ? `${soort.naam} staat klaar (uit)` : v.aan === "aan" ? `${soort.naam} staat nu op de site` : `${soort.naam} komt elk jaar van ${maandDagMooi(v.van)} tot ${maandDagMooi(v.tot)}`);
    onTerug();
  };

  return (
    <Sheet titel={soort.naam} onSluit={sluit} vol>
      <button className="tekstknop terug-knop" onClick={onTerug}><Icoon naam="chevron" maat={16} /> Alle thema's</button>

      <div className="thema-proef" style={{ ["--thema" as string]: kleur }} aria-label="Zo ziet het eruit">
        <div className="thema-proef-balk">
          <img src={logo ?? "img/logo-woord.png"} alt="" />
        </div>
        {v.tekst?.trim() && <p className="thema-proef-zin">{v.tekst}</p>}
        <div className="thema-proef-vormen">
          {[...soort.zweef, ...soort.fonkel].slice(0, 5).map((n, i) => <VormSvg key={i} vorm={VORMEN[n]} className={`v${i}`} />)}
        </div>
      </div>

      <div className="formulier">
        <Veld label="Wanneer">
          <Segment<ThemaAan> waarde={v.aan} onKies={(aan) => setV({ ...v, aan })} opties={[
            { waarde: "periode", label: "Elk jaar" }, { waarde: "aan", label: "Nu aan" }, { waarde: "uit", label: "Uit" },
          ]} />
        </Veld>
        {v.aan !== "uit" && (
          <div className="thema-periode">
            <DatumKies label="Van" waarde={v.van} onKies={(van) => setV({ ...v, van })} />
            <DatumKies label="Tot en met" waarde={v.tot} onKies={(tot) => setV({ ...v, tot })} />
            <p className="zacht klein">
              {v.aan === "aan" ? "Staat nu aan, tot je het uitzet. De periode geldt weer als je Elk jaar kiest." : "Elk jaar opnieuw, ook over nieuwjaar heen (bv. 1 december tot 6 januari)."}
              {soort.uitleg ? ` ${soort.uitleg}` : ""}
            </p>
          </div>
        )}
        <Veld label="Logo" hint="Een PNG zonder achtergrond, zoals ons gewone logo (bv. met een pompoen of een kerstmuts erbij).">
          <div className="knoppenrij">
            <button className="knop zacht" disabled={bezig} onClick={() => invoer.current?.click()}><Icoon naam="foto" maat={18} /> {bezig ? "Bezig…" : logo ? "Ander logo" : "Eigen logo kiezen"}</button>
            {logo && <button className="tekstknop" onClick={() => { setV({ ...v, logo: null }); setLogoNieuw(true); }}>Gewone logo</button>}
          </div>
        </Veld>
        <input ref={invoer} type="file" accept="image/png,image/webp,image/*" hidden onChange={(e) => { void kiesLogo(e.target.files?.[0]); e.target.value = ""; }} />
        <Veld label="Kleur" hint="Voor de gloed achter de binders en de zin bovenaan.">
          <div className="thema-kleur">
            <input type="color" value={kleur} onChange={(e) => setV({ ...v, kleur: e.target.value })} aria-label="Kleur" />
            {kleur !== soort.kleur && <button className="tekstknop" onClick={() => setV({ ...v, kleur: soort.kleur })}>Standaardkleur</button>}
          </div>
        </Veld>
        <Veld label="Zin bovenaan (optioneel)">
          <input value={v.tekst ?? ""} maxLength={120} placeholder={soort.hint} onChange={(e) => setV({ ...v, tekst: e.target.value })} />
        </Veld>
        <a className="knop zacht" href={proefUrl(soort.id, demo)} target="_blank" rel="noreferrer"><Icoon naam="oog" maat={18} /> Bekijk op de site{gewijzigd ? " (na bewaren)" : ""}</a>
      </div>
      <div className="sheet-actie">
        <button className="knop groot" disabled={!gewijzigd || bezig} onClick={bewaar}>Bewaar</button>
      </div>
    </Sheet>
  );
}

/** Een dag en een maand (zonder jaar: het thema komt elk jaar terug). */
function DatumKies({ label, waarde, onKies }: { label: string; waarde: string | null; onKies: (md: string) => void }) {
  const m = waarde ? Number(waarde.slice(0, 2)) : 1;
  const d = waarde ? Number(waarde.slice(3)) : 1;
  const zet = (mm: number, dd: number) => {
    const max = new Date(2024, mm, 0).getDate(); // 2024: schrikkeljaar, dus 29 februari mag
    onKies(`${String(mm).padStart(2, "0")}-${String(Math.min(dd, max)).padStart(2, "0")}`);
  };
  return (
    <div className="veld datum-kies">
      <span className="veld-label">{label}</span>
      <div>
        <select value={d} onChange={(e) => zet(m, Number(e.target.value))} aria-label={`${label}: dag`}>
          {Array.from({ length: new Date(2024, m, 0).getDate() }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
        </select>
        <select value={m} onChange={(e) => zet(Number(e.target.value), d)} aria-label={`${label}: maand`}>
          {MAANDEN.map((naam, i) => <option key={naam} value={i + 1}>{naam}</option>)}
        </select>
      </div>
    </div>
  );
}
