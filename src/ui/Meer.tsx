import { useState } from "react";
import {
  importeerTestset, logUit, offlineKlaarzetten, useApp, vernieuwPrijsgids, voegArtikelToe, wijzigArtikel, wisDemo, zetInstellingen,
} from "../state";
import type { Artikel } from "../types";
import { APP_VERSIE } from "../config";
import { datumKort, euro, getal } from "../lib/format";
import { STANDAARD_INSTELLINGEN, type Drempel } from "../lib/pricing";
import { Icoon, Kiezer, Veld } from "./common";

export function Meer() {
  const { backend, gids, exemplaren, instellingen } = useApp();
  const demo = backend?.soort === "demo";
  const gebruiker = backend?.gebruiker();

  return (
    <div className="scherm meer">
      <header className="kop">
        <div>
          <h1>Meer</h1>
          <p className="kop-sub">{demo ? "Demo op dit toestel" : gebruiker?.naam || gebruiker?.email}</p>
        </div>
      </header>

      <Groep titel="Account">
        <Rij label={demo ? "Demomodus" : "Ingelogd als"} waarde={demo ? "gegevens blijven op dit toestel" : gebruiker?.email} />
        <button className="rij-knop" onClick={() => void logUit()}><Icoon naam="uit" maat={18} /> {demo ? "Demo verlaten" : "Uitloggen"}</button>
      </Groep>

      <Groep titel="Prijzen">
        <Rij label="Cardmarket-prijsgids" waarde={gids ? `${datumKort(gids.datum)} · ${gids.prijzen.size.toLocaleString("nl-BE")} producten` : "nog niet geladen"} />
        <button className="rij-knop" onClick={() => void vernieuwPrijsgids()}><Icoon naam="vernieuw" maat={18} /> Prijsgids opnieuw laden</button>
        <p className="groep-uitleg">De prijsgids komt elke nacht automatisch binnen. "Prijzen nakijken" in Voorraad vergelijkt de hartjes in de vitrine ermee.</p>
      </Groep>

      <Offline />

      <Prijsregels />

      <Groep titel="Labels">
        <label className="schakel rij">
          <input type="checkbox" checked={instellingen.automatischPrinten} onChange={(e) => zetInstellingen({ automatischPrinten: e.target.checked })} />
          <span>Label meteen printen bij toevoegen</span>
        </label>
      </Groep>

      <Artikelen />

      <Groep titel="Testen">
        <p className="groep-uitleg">
          De testset bevat 100 kaarten, slabs en eigen producten, plus een paar artikelen. Zo zie je meteen hoe alles werkt.
          {!demo && " Let op: je bent ingelogd, dus de testset komt in de echte voorraad."}
        </p>
        <button className="rij-knop" onClick={() => void importeerTestset()}><Icoon naam="doos" maat={18} /> Testset inladen</button>
        {demo && (
          <button className="rij-knop rood" onClick={() => { if (confirm("Alles in de demo wissen?")) void wisDemo(); }}>
            <Icoon naam="kruis" maat={18} /> Demo leegmaken
          </button>
        )}
        <Rij label="Exemplaren" waarde={String(exemplaren.length)} />
      </Groep>

      <Groep titel="Over">
        <Rij label="Versie" waarde={APP_VERSIE} />
        <p className="groep-uitleg">
          Kaartgegevens en foto's: TCGdex. Prijzen: Cardmarket-prijsgids. Op iPhone zet je de app op je beginscherm via Deel → Zet op beginscherm.
        </p>
      </Groep>
    </div>
  );
}

function Offline() {
  const { exemplaren } = useApp();
  const [stand, setStand] = useState<{ op: string; fotos: number; aantal: number } | null>(() => {
    try { return JSON.parse(localStorage.getItem("bindr-offline-v1") || "null"); } catch { return null; }
  });
  return (
    <Groep titel="Beurs zonder wifi">
      <Rij label="Klaar voor offline" waarde={stand ? `${datumKort(stand.op)} · ${stand.aantal} items, ${stand.fotos} foto's` : "nog niet"} />
      <button className="rij-knop" onClick={async () => {
        const r = await offlineKlaarzetten();
        setStand({ op: new Date().toISOString(), fotos: r.fotos, aantal: exemplaren.length });
      }}><Icoon naam="vernieuw" maat={18} /> Offline klaarzetten</button>
      <p className="groep-uitleg">Doe dit thuis met wifi, op elke gsm. De app, de kaarten, de foto's en de tekstherkenning staan dan op het toestel. Wijzigingen bewaren zonder internet komt in fase 2.</p>
    </Groep>
  );
}

function Groep({ titel, children }: { titel: string; children: React.ReactNode }) {
  return (
    <section className="groep">
      <h2 className="groep-titel">{titel}</h2>
      <div className="groep-inhoud">{children}</div>
    </section>
  );
}

function Rij({ label, waarde }: { label: string; waarde?: string | null }) {
  return <div className="rij"><span>{label}</span><span className="zacht">{waarde || "–"}</span></div>;
}

function Prijsregels() {
  const { instellingen } = useApp();
  const [open, setOpen] = useState(false);
  const zetDrempel = (i: number, d: Partial<Drempel>) => {
    const drempels = instellingen.drempels.map((x, j) => (j === i ? { ...x, ...d } : x));
    zetInstellingen({ drempels });
  };
  return (
    <Groep titel="Prijsregels">
      <button className="rij-knop" onClick={() => setOpen(!open)}>
        <Icoon naam={open ? "neer" : "pijlRechts"} maat={18} /> Drempels en conditiefactoren
      </button>
      {open && (
        <div className="prijsregels">
          <p className="groep-uitleg">Een hartje licht pas op als het voorstel minstens zoveel euro verschilt. Het voorstel wordt afgerond op hele euro's.</p>
          <table>
            <thead><tr><th>Hartje</th><th>Pas vanaf</th></tr></thead>
            <tbody>
              {instellingen.drempels.map((d, i) => {
                const vorige = i ? instellingen.drempels[i - 1].tot : 0;
                return (
                  <tr key={i}>
                    <td>{d.tot == null ? `vanaf ${euro(vorige)}` : `${euro(vorige)} – ${euro(d.tot)}`}</td>
                    <td><input inputMode="numeric" defaultValue={d.verschil} onBlur={(e) => { const n = getal(e.target.value); if (n != null && n > 0) zetDrempel(i, { verschil: n }); }} /> €</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="groep-uitleg">Conditiefactor: het deel van de Cardmarket-prijs dat het voorstel wordt. Kijk het altijd zelf na.</p>
          <div className="factoren">
            {Object.entries(instellingen.conditiefactoren).map(([c, f]) => (
              <label key={c}>
                <span>{c}</span>
                <input inputMode="decimal" defaultValue={String(f).replace(".", ",")}
                  onBlur={(e) => { const n = getal(e.target.value); if (n != null && n > 0 && n <= 2) zetInstellingen({ conditiefactoren: { ...instellingen.conditiefactoren, [c]: n } }); }} />
              </label>
            ))}
          </div>
          <button className="tekstknop klein" onClick={() => { zetInstellingen({ drempels: STANDAARD_INSTELLINGEN.drempels, conditiefactoren: STANDAARD_INSTELLINGEN.conditiefactoren }); setOpen(false); }}>
            Standaard terugzetten
          </button>
        </div>
      )}
    </Groep>
  );
}

function Artikelen() {
  const { artikelen } = useApp();
  const [nieuw, setNieuw] = useState(false);
  const totaal = artikelen.reduce((s, a) => s + (a.prijs ?? 0) * a.aantal, 0);
  return (
    <Groep titel="Artikelen">
      <p className="groep-uitleg">Sealed, binders, 3D-prints en bulk: geteld per stuk, zonder eigen label. Samen {euro(totaal, true)}.</p>
      <ul className="artikelen">
        {artikelen.map((a) => <ArtikelRij key={a.id} a={a} />)}
      </ul>
      {nieuw ? <NieuwArtikelForm onKlaar={() => setNieuw(false)} /> : (
        <button className="rij-knop" onClick={() => setNieuw(true)}><Icoon naam="plus" maat={18} /> Artikel toevoegen</button>
      )}
    </Groep>
  );
}

function ArtikelRij({ a }: { a: Artikel }) {
  return (
    <li className="artikel">
      <div className="artikel-tekst">
        <strong>{a.naam}</strong>
        <span className="zacht klein">{a.soort} · {a.opslag} · {euro(a.prijs)}</span>
      </div>
      <div className="stapper klein">
        <button onClick={() => void wijzigArtikel(a.id, { aantal: Math.max(0, a.aantal - 1) })} aria-label="Eén minder">−</button>
        <span>{a.aantal}</span>
        <button onClick={() => void wijzigArtikel(a.id, { aantal: a.aantal + 1 })} aria-label="Eén meer">+</button>
      </div>
    </li>
  );
}

function NieuwArtikelForm({ onKlaar }: { onKlaar: () => void }) {
  const [v, setV] = useState({ naam: "", soort: "eigen product" as Artikel["soort"], aantal: "1", prijs: "", opslag: "vitrine" as Artikel["opslag"] });
  return (
    <div className="formulier compact">
      <Veld label="Naam"><input autoFocus value={v.naam} onChange={(e) => setV({ ...v, naam: e.target.value })} placeholder="Binder 9-pocket, gravure naar keuze" /></Veld>
      <Veld label="Soort">
        <Kiezer waarde={v.soort} onKies={(s) => setV({ ...v, soort: s })}
          opties={[{ waarde: "eigen product", label: "Eigen product" }, { waarde: "sealed", label: "Sealed" }, { waarde: "bulk", label: "Bulk" }, { waarde: "andere", label: "Andere" }]} />
      </Veld>
      <div className="twee">
        <Veld label="Aantal"><input inputMode="numeric" value={v.aantal} onChange={(e) => setV({ ...v, aantal: e.target.value })} /></Veld>
        <Veld label="Prijs per stuk (€)"><input inputMode="decimal" value={v.prijs} onChange={(e) => setV({ ...v, prijs: e.target.value })} /></Veld>
      </div>
      <Veld label="Waar?"><Kiezer waarde={v.opslag} onKies={(o) => setV({ ...v, opslag: o })} opties={[{ waarde: "vitrine", label: "Vitrine" }, { waarde: "stockdoos", label: "Stockdoos" }]} /></Veld>
      <div className="knoppenrij">
        <button className="knop" disabled={!v.naam.trim()} onClick={async () => {
          await voegArtikelToe({ naam: v.naam.trim(), soort: v.soort, aantal: Math.max(0, Math.round(getal(v.aantal) ?? 1)), prijs: getal(v.prijs), opslag: v.opslag });
          onKlaar();
        }}>Toevoegen</button>
        <button className="tekstknop" onClick={onKlaar}>Annuleren</button>
      </div>
    </div>
  );
}
