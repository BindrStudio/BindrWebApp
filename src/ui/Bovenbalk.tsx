import { useState } from "react";
import { actieveBeurs, actieveOmgeving, naarTab, openInstellingen, useApp, wisselOmgeving } from "../state";
import { Icoon, Sheet } from "./common";

const SCHERM: Record<string, string> = { catalogus: "catalogus", vault: "vault", scan: "scannen", kassa: "kassa", profiel: "profiel", meer: "profiel" };

function initialen(naam: string): string {
  const d = naam.trim().split(/\s+/);
  return (d.length > 1 ? d[0][0] + d[d.length - 1][0] : naam.slice(0, 2)).toUpperCase();
}

function geleden(iso: string): string {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  return m <= 1 ? "nu" : `${m} min geleden`;
}

/** Bovenaan: het logo, wie er bezig is, en in welke omgeving je werkt (met een groene stip als er een beurs loopt). */
export function Bovenbalk() {
  const s = useApp();
  const [open, setOpen] = useState(false);
  const omg = actieveOmgeving(s);
  const beurs = actieveBeurs(s);
  const ik = s.backend?.gebruikerId();
  const anderen = s.aanwezig.filter((a) => a.user_id !== ik);
  const naamVan = (id: string) => s.beheerders[id] ?? "Beheerder";
  const omgNaam = (id: string | null) => s.omgevingen.find((o) => o.id === id)?.naam ?? "";

  return (
    <header className="merkbalk">
      <img src="img/logo-woord.png" alt="Bind'r" width={68} height={30} />
      <div className="merk-rechts">
        {anderen.length > 0 && (
          <button className="aanwezigen" onClick={() => setOpen(true)} aria-label={`${anderen.length} anderen bezig`}>
            {anderen.slice(0, 3).map((a) => (
              <span key={a.user_id} className={`avatar${a.omgeving_id && a.omgeving_id !== s.omgeving ? " elders" : ""}`} title={`${naamVan(a.user_id)} · ${omgNaam(a.omgeving_id)} · ${SCHERM[a.scherm ?? ""] ?? ""}`}>
                {initialen(naamVan(a.user_id))}
              </span>
            ))}
          </button>
        )}
        {(s.omgevingen.length > 1 || beurs) && (
          <button className={`omgeving-pil${beurs ? " beurs" : ""}`} onClick={() => setOpen(true)}>
            {beurs && <span className="stip" />}
            <span>{omg?.naam ?? beurs?.naam}</span>
            {s.omgevingen.length > 1 && <Icoon naam="chevron" maat={14} />}
          </button>
        )}
        <button className="tandwiel-knop" onClick={openInstellingen} aria-label="Instellingen" title="Instellingen">
          <Icoon naam="tandwiel" maat={22} />
        </button>
      </div>
      {open && (
        <Sheet titel="Omgeving en team" onSluit={() => setOpen(false)}>
          {s.omgevingen.length > 1 && (
            <section className="blok">
              <h3>Waar werk je?</h3>
              <p className="zacht klein">Elke omgeving heeft een eigen catalogus, vault, kassa en beurzen.</p>
              <div className="omgeving-keuze">
                {s.omgevingen.map((o) => (
                  <button key={o.id} className={`omgeving-optie${o.id === s.omgeving ? " aan" : ""}`} onClick={() => { wisselOmgeving(o.id); setOpen(false); }}>
                    <span className="omgeving-bol">{initialen(o.naam)}</span>
                    <span className="omgeving-tekst"><strong>{o.naam}</strong><span className="zacht klein">{o.zichtbaar_voor_klanten ? "op de klantenpagina" : "niet op de klantenpagina"}</span></span>
                    {o.id === s.omgeving && <Icoon naam="check" maat={18} />}
                  </button>
                ))}
              </div>
            </section>
          )}
          {beurs && (
            <section className="blok">
              <h3>Beurs bezig</h3>
              <button className="lijst-knop" onClick={() => { setOpen(false); naarTab("kassa"); }}>
                <span className="stip groen" /><span className="lijst-naam">{beurs.naam}</span><span className="rechts tekstknop">Naar de kassa</span>
              </button>
            </section>
          )}
          <section className="blok">
            <h3>Wie is er bezig?</h3>
            {!s.aanwezig.length ? <p className="zacht">Enkel jij{s.backend?.soort === "demo" ? " (in de demo zie je de anderen niet)" : ""}.</p> : (
              <ul className="lijst">
                {s.aanwezig.slice().sort((a, b) => b.laatst.localeCompare(a.laatst)).map((a) => (
                  <li key={a.user_id} className="aanwezig-rij">
                    <span className={`avatar${a.omgeving_id && a.omgeving_id !== s.omgeving ? " elders" : ""}`}>{initialen(naamVan(a.user_id))}</span>
                    <span className="lijst-naam"><strong>{a.user_id === ik ? "Jij" : naamVan(a.user_id)}</strong> <span className="zacht klein">{[omgNaam(a.omgeving_id), SCHERM[a.scherm ?? ""]].filter(Boolean).join(" · ")}</span></span>
                    <span className="rechts zacht klein">{geleden(a.laatst)}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="zacht klein">Werken jullie tegelijk? Dat mag: elke verkoop wordt apart geboekt. Verkochten twee gsm's hetzelfde exemplaar, dan toont de kassa een conflict om op te lossen. De app haalt om de 30 seconden op wat de anderen deden.</p>
          </section>
        </Sheet>
      )}
    </header>
  );
}
