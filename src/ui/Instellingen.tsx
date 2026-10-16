// Instellingen (het tandwiel rechtsboven): alles wat je zelden aanpast. Wat je vaak gebruikt
// (artikels, historiek, inzichten, boekhouding, je account) staat in Profiel.
import { useState, type ReactNode } from "react";
import {
  backup, importeerTestset, meld, offlineKlaarzetten, openLabels, sluit, useApp, vernieuwPrijsgids, wisDemo, zetInstagram, zetInstellingen, zetZichtbaarVoorKlanten,
} from "../state";
import { APP_VERSIE, klantUrl } from "../config";
import { datumKort, euro, getal, vandaag } from "../lib/format";
import { STANDAARD_INSTELLINGEN, type Drempel } from "../lib/pricing";
import { PCT_MAX, PCT_MIN } from "../lib/bod";
import { Icoon, QrBeeld, Sheet } from "./common";
import { BedrijfVelden } from "./Boekhouding";
import { bewaarBestand } from "./Afdruk";

const PCTS = Array.from({ length: (PCT_MAX - PCT_MIN) / 5 + 1 }, (_, i) => PCT_MIN + i * 5);

export function Instellingen() {
  const s = useApp();
  const { backend, gids, exemplaren, instellingen } = s;
  const demo = backend?.soort === "demo";
  return (
    <Sheet titel="Instellingen" onSluit={sluit} vol>
      <div className="instellingen">
        <Prijsregels />

        <Klantencatalogus />

        <Groep titel="Labels">
          <button className="knop zacht klein" onClick={openLabels}><Icoon naam="printer" maat={16} /> Printer verbinden, proeflabel en afstellen</button>
          <label className="schakel rij">
            <input type="checkbox" checked={instellingen.automatischPrinten} onChange={(e) => zetInstellingen({ automatischPrinten: e.target.checked })} />
            <span>Label meteen printen bij toevoegen</span>
          </label>
        </Groep>

        <Groep titel="Boekhouding">
          <p className="groep-uitleg">Per omgeving: werk je als zaak (met boekhouding) of als particulier? De gegevens komen op elk aankoopbewijs en rapport (Profiel › Boekhouding).</p>
          <BedrijfVelden key={s.omgeving ?? "standaard"} />
        </Groep>

        <Groep titel="Prijzen">
          <Rij label="Cardmarket-prijsgids" waarde={gids ? `${datumKort(gids.datum)} · ${gids.prijzen.size.toLocaleString("nl-BE")} producten` : "nog niet geladen"} />
          <button className="rij-knop" onClick={() => void vernieuwPrijsgids()}><Icoon naam="vernieuw" maat={18} /> Prijsgids opnieuw laden</button>
          <p className="groep-uitleg">De prijsgids komt elke nacht automatisch binnen. "Prijzen nakijken" in de catalogus vergelijkt de hartjes ermee; de vault toont wat in waarde stijgt.</p>
        </Groep>

        <Offline />

        <Groep titel="Back-up">
          <p className="groep-uitleg">De gratis Supabase maakt zelf geen back-ups. Download dit bestand elke maand en bewaar het samen met de pdf's van de boekhouding: die moet je 10 jaar bijhouden. De foto's van aankopen staan in de dagstaten (pdf).</p>
          <button className="rij-knop" onClick={() => {
            const b = backup();
            bewaarBestand(`bindr-backup-${vandaag()}.json`, JSON.stringify(b));
            meld(`Back-up gedownload: ${b.aantallen.exemplaren} exemplaren, ${b.aantallen.transacties} transacties`);
          }}><Icoon naam="doos" maat={18} /> Back-up downloaden</button>
        </Groep>

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
            Kaartgegevens en foto's: TCGdex, Limitless TCG en pokemontcg.io. Prijzen: Cardmarket-prijsgids. Op iPhone zet je de app op je beginscherm via Deel → Zet op beginscherm.
          </p>
        </Groep>
      </div>
    </Sheet>
  );
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
      <div className="rij bod-instelling">
        <span>Standaard bij inkoop</span>
        <select value={Math.round(instellingen.inkoopPct / 5) * 5} aria-label="Inkoop in procent" onChange={(e) => zetInstellingen({ inkoopPct: Number(e.target.value) })}>
          {PCTS.map((p) => <option key={p} value={p}>{p}%</option>)}
        </select>
      </div>
      <div className="rij bod-instelling">
        <span>Standaard bij ruil</span>
        <select value={Math.round(instellingen.ruilPct / 5) * 5} aria-label="Ruil in procent" onChange={(e) => zetInstellingen({ ruilPct: Number(e.target.value) })}>
          {PCTS.map((p) => <option key={p} value={p}>{p}%</option>)}
        </select>
      </div>
      <p className="groep-uitleg">Van de marktwaarde van de kaarten van een klant. In de kassa schuif je per klant tussen {PCT_MIN} en {PCT_MAX}% en rond je af; je kiest altijd zelf.</p>
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

function Klantencatalogus() {
  const { instagram, backend, omgevingen } = useApp();
  const [naam, setNaam] = useState(instagram);
  const [qr, setQr] = useState(false);
  const url = klantUrl();
  const bekijk = klantUrl(backend?.soort === "demo");
  return (
    <Groep titel="Klantencatalogus">
      <p className="groep-uitleg">De pagina die klanten zien via onze link, zonder login: eerst wie we zijn, wat we aanbieden en onze komende beurzen (Profiel › Beurzen), dan de kaarten, binders, 3D-prints en sealed van de aangevinkte omgevingen. Kaarten waarvan het hartje eerst moet wisselen, blijven verborgen tot het nieuwe hartje bewaard is. Welke artikels klanten zien, kies je per artikel. Rechtsboven staat de knop Beheer.</p>
      {omgevingen.length > 0 && omgevingen.map((o) => (
        <label key={o.id} className="schakel rij">
          <input type="checkbox" checked={o.zichtbaar_voor_klanten} onChange={(e) => zetZichtbaarVoorKlanten(o.id, e.target.checked)} />
          <span>{o.naam} op de klantenpagina</span>
        </label>
      ))}
      <a className="rij-knop" href={bekijk} target="_blank" rel="noreferrer"><Icoon naam="oog" maat={18} /> Bekijk als klant{backend?.soort === "demo" ? " (met de demo)" : ""}</a>
      <button className="rij-knop" onClick={() => setQr(true)}><Icoon naam="qr" maat={18} /> QR-code voor aan de stand</button>
      <div className="rij instagram-rij">
        <span><Icoon naam="instagram" maat={18} /> Instagram</span>
        <span className="instagram-veld">
          @<input value={naam} onChange={(e) => setNaam(e.target.value)} placeholder="bindrstudio" autoCapitalize="none" autoCorrect="off" />
          {naam.trim().replace(/^@/, "") !== instagram && <button className="tekstknop klein" onClick={() => zetInstagram(naam)}>Bewaar</button>}
        </span>
      </div>
      <details className="wie-ziet-wat">
        <summary>Wie ziet wat?</summary>
        <table>
          <thead><tr><th></th><th>Klant</th><th>Beheerder</th></tr></thead>
          <tbody>
            <tr><td>Catalogus: foto, naam, set, conditie, prijs</td><td>ja</td><td>ja</td></tr>
            <tr><td>Hoeveel exemplaren er zijn</td><td>ja</td><td>ja</td></tr>
            <tr><td>Vault</td><td>nee</td><td>ja</td></tr>
            <tr><td>Aankoopprijs, bron, marge</td><td>nee</td><td>ja</td></tr>
            <tr><td>Kassa, beurzen, transacties</td><td>nee</td><td>ja</td></tr>
            <tr><td>Wijzigen, printen, verkopen</td><td>nee</td><td>ja</td></tr>
          </tbody>
        </table>
      </details>
      {qr && (
        <Sheet titel="Catalogus voor klanten" onSluit={() => setQr(false)}>
          <div className="stand-qr">
            <QrBeeld tekst={`${url}#kaarten`} />
            <p><strong>Scan en bekijk onze kaarten</strong></p>
            <p className="zacht klein">{url}#kaarten</p>
            <p className="zacht klein">De QR opent meteen de kaarten. Wie de gewone link opent, ziet eerst wie we zijn en onze komende beurzen.</p>
          </div>
        </Sheet>
      )}
    </Groep>
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
      <p className="groep-uitleg">Doe dit thuis met wifi, op elke gsm. De app, de kaarten, de foto's en de tekstherkenning staan dan op het toestel. Op de beurs werkt alles ook zonder internet; wijzigingen wachten op het toestel en gaan door zodra er weer verbinding is.</p>
    </Groep>
  );
}

export function Groep({ titel, children }: { titel: string; children: ReactNode }) {
  return (
    <section className="groep">
      <h2 className="groep-titel">{titel}</h2>
      <div className="groep-inhoud">{children}</div>
    </section>
  );
}

export function Rij({ label, waarde }: { label: string; waarde?: string | null }) {
  return <div className="rij"><span>{label}</span><span className="zacht">{waarde || "–"}</span></div>;
}
