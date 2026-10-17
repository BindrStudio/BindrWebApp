// Profiel › Thema: de klantenpagina in het thema van een feest of seizoen (Halloween, kerst …). Per thema een eigen
// logo, een kleur, versiering in de achtergrond en een korte zin, elk jaar in dezelfde periode (of met de hand aan).
import { useEffect, useRef, useState } from "react";
import { bewaarThema, kanThema, laadThemas, meld, SCHEMA_013, sluit, themaLijst, useApp } from "../state";
import { actiefThema, LOGO_SOORTEN, maandDag, maandDagMooi, nieuwThema, THEMA_SOORTEN, veiligeKleur, VORMEN, type LogoSoort, type ThemaSoort } from "../lib/thema";
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
              const eigen = !!t && LOGO_SOORTEN.some((l) => veiligeFoto(t[l.id]));
              const eend = veiligeFoto(t?.logo_eend) ?? s.logos?.logo_eend;
              const status = !t ? "Nog niet klaargezet" : t.aan === "uit" ? "Uit" : t.aan === "aan" ? "Staat aan" : `Elk jaar ${maandDagMooi(t.van)} – ${maandDagMooi(t.tot)}`;
              return (
                <li key={s.id}>
                  <button className="thema-rij" onClick={() => setBewerk(s.id)} style={{ ["--thema" as string]: veiligeKleur(t?.kleur) ?? s.kleur }}>
                    <span className="thema-vormpje">{eend ? <img src={eend} alt="" /> : <VormSvg vorm={VORMEN[s.zweef[0] ?? "ster"]} />}</span>
                    <span className="thema-rij-tekst">
                      <strong>{s.naam}</strong>
                      <span>{status}{eigen ? " · eigen logo's" : s.logos ? " · logo's klaar" : ""}</span>
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
  // Enkel een nieuw of gewist logo gaat (opnieuw) naar de server; de rest blijft daar staan.
  const [logoNieuw, setLogoNieuw] = useState<Set<LogoSoort>>(new Set());
  const [bezig, setBezig] = useState<LogoSoort | null>(null);
  const [kies, setKies] = useState<LogoSoort>("logo");
  const invoer = useRef<HTMLInputElement>(null);
  const kleur = veiligeKleur(v.kleur) ?? soort.kleur;
  const gewijzigd = logoNieuw.size > 0 || !bewaard || (["van", "tot", "aan", "kleur", "tekst"] as const).some((k) => (v[k] ?? null) !== (bewaard[k] ?? null));
  /** Welk beeld er voor dit logo op de site staat, en van waar het komt. */
  const bron = (k: LogoSoort): { src: string; van: "eigen" | "mee" | "gewoon" } => {
    const eigen = veiligeFoto(v[k]);
    if (eigen) return { src: eigen, van: "eigen" };
    const mee = soort.logos?.[k];
    return mee ? { src: mee, van: "mee" } : { src: LOGO_SOORTEN.find((l) => l.id === k)!.gewoon, van: "gewoon" };
  };

  const kiesLogo = async (f: File | undefined) => {
    if (!f) return;
    const k = kies;
    setBezig(k);
    try {
      // Een logo staat hoogstens zo'n 300 px breed op de site (bij Over Bind'r): 800 px is scherp genoeg.
      const { url, doorzichtig, weggehaald } = await verkleinUitgeknipt(f, 800, 390_000);
      setV((x) => ({ ...x, [k]: url }));
      setLogoNieuw((n) => new Set(n).add(k));
      if (weggehaald) meld("De achtergrond is weggehaald en de lege rand eraf.", "info", undefined, 4000);
      else if (!doorzichtig) meld("Dit logo heeft een achtergrond die we niet konden weghalen. Een PNG zonder achtergrond staat mooier.", "info", undefined, 6000);
    } catch (e) {
      meld(e instanceof Error ? e.message : String(e), "fout");
    } finally {
      setBezig(null);
    }
  };
  const bewaar = () => {
    const logos = Object.fromEntries(LOGO_SOORTEN.map(({ id }) => [id, logoNieuw.has(id) ? v[id] ?? null : undefined]));
    bewaarThema({ ...v, kleur: veiligeKleur(v.kleur), ...logos });
    setLogoNieuw(new Set());
    meld(v.aan === "uit" ? `${soort.naam} staat klaar (uit)` : v.aan === "aan" ? `${soort.naam} staat nu op de site` : `${soort.naam} komt elk jaar van ${maandDagMooi(v.van)} tot ${maandDagMooi(v.tot)}`);
    onTerug();
  };

  return (
    <Sheet titel={soort.naam} onSluit={sluit} vol>
      <button className="tekstknop terug-knop" onClick={onTerug}><Icoon naam="chevron" maat={16} /> Alle thema's</button>

      <div className="thema-proef" style={{ ["--thema" as string]: kleur }} aria-label="Zo ziet het eruit">
        <div className="thema-proef-balk">
          <img src={bron("logo").src} alt="" />
        </div>
        <p className="thema-proef-zin">
          <img src={bron("logo_eend").src} alt="" />
          <span>{v.tekst?.trim() || soort.hint}</span>
        </p>
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
        <div className="veld">
          <span className="veld-label">Logo's</span>
          <span className="veld-hint">Drie versies, zoals ons gewone logo. Heeft het een vlakke achtergrond (zoals crème), dan halen we die zelf weg.</span>
          <ul className="thema-logos">
            {LOGO_SOORTEN.map((l) => {
              const b = bron(l.id);
              return (
                <li key={l.id} className="thema-logo-item">
                  <span className={`thema-logo-beeld ${l.id}`}><img src={b.src} alt="" /></span>
                  <span className="thema-logo-tekst">
                    <strong>{l.label}</strong>
                    <span>{l.waar}</span>
                    <em>{b.van === "eigen" ? "Eigen logo" : b.van === "mee" ? "Meegeleverd met de app" : "Nu ons gewone logo"}</em>
                  </span>
                  <span className="thema-logo-knoppen">
                    <button className="knop klein zacht" disabled={!!bezig} onClick={() => { setKies(l.id); invoer.current?.click(); }}>
                      {bezig === l.id ? "Bezig…" : b.van === "eigen" ? "Ander" : "Kiezen"}
                    </button>
                    {b.van === "eigen" && (
                      <button className="tekstknop klein" onClick={() => { setV({ ...v, [l.id]: null }); setLogoNieuw((n) => new Set(n).add(l.id)); }}>Weg</button>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
        <input ref={invoer} type="file" accept="image/png,image/webp,image/*" hidden onChange={(e) => { void kiesLogo(e.target.files?.[0]); e.target.value = ""; }} />
        <Veld label="Kleur" hint="Voor de gloed achter de binders, de zin bovenaan en Nu live op de beurs.">
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
        <button className="knop groot" disabled={!gewijzigd || !!bezig} onClick={bewaar}>Bewaar</button>
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
