import { useState } from "react";
import {
  actieveOmgeving, importeerTestset, logUit, offlineKlaarzetten, openOverzicht, synchroniseer, useApp, vernieuwPrijsgids, wisDemo, wisselOmgeving,
  zetInstagram, zetInstellingen, zetZichtbaarVoorKlanten,
} from "../state";
import { PinKiezen } from "./Login";
import { APP_VERSIE, klantUrl } from "../config";
import { datumKort, euro, getal } from "../lib/format";
import { STANDAARD_INSTELLINGEN, type Drempel } from "../lib/pricing";
import { Icoon, QrBeeld, Sheet } from "./common";

export function Meer() {
  const s = useApp();
  const { backend, gids, exemplaren, instellingen, wachtrij, online } = s;
  const demo = backend?.soort === "demo";
  const gebruiker = backend?.gebruiker();
  const [pinOpen, setPinOpen] = useState(false);
  const omg = actieveOmgeving(s);

  return (
    <div className="scherm meer">
      <header className="kop">
        <div>
          <h1>Meer</h1>
          <p className="kop-sub">{demo ? "Demo op dit toestel" : gebruiker?.naam || gebruiker?.email}{omg ? ` · ${omg.naam}` : ""}</p>
        </div>
      </header>

      <Groep titel="Account">
        <Rij label={demo ? "Demomodus" : "Ingelogd als"} waarde={demo ? "gegevens blijven op dit toestel" : gebruiker?.email} />
        {!demo && <Rij label="Synchronisatie" waarde={wachtrij ? `${wachtrij} wijzigingen wachten${online ? "" : " op internet"}` : "alles is doorgestuurd"} />}
        {!demo && <button className="rij-knop" onClick={() => void synchroniseer()}><Icoon naam="vernieuw" maat={18} /> Nu synchroniseren</button>}
        {!demo && <button className="rij-knop" onClick={() => setPinOpen(true)}><Icoon naam="slot" maat={18} /> Pincode wijzigen</button>}
        <button className="rij-knop" onClick={() => void logUit()}><Icoon naam="uit" maat={18} /> {demo ? "Demo verlaten" : "Uitloggen"}</button>
        {!demo && <p className="groep-uitleg">Na 10 minuten zonder de app vraagt hij je pincode opnieuw. Uitloggen wist ook wat deze gsm over jou onthoudt.</p>}
      </Groep>
      {pinOpen && (
        <Sheet titel="Pincode wijzigen" onSluit={() => setPinOpen(false)}>
          <PinKiezen inSheet onKlaar={() => setPinOpen(false)} />
        </Sheet>
      )}

      {s.omgevingen.length > 0 && (
        <Groep titel="Omgevingen">
          <p className="groep-uitleg">Elke omgeving heeft een eigen catalogus, vault, kassa en beurzen. Wat aangevinkt staat, verschijnt samen op de klantenpagina.</p>
          {s.omgevingen.map((o) => (
            <div key={o.id} className="rij omgeving-rij">
              <button className={`omgeving-wissel${o.id === s.omgeving ? " aan" : ""}`} onClick={() => wisselOmgeving(o.id)} disabled={o.id === s.omgeving}>
                {o.id === s.omgeving ? <Icoon naam="check" maat={16} /> : <span className="leeg-bol" />} {o.naam}
              </button>
              <label className="schakel klein-schakel">
                <span className="zacht klein">klantenpagina</span>
                <input type="checkbox" checked={o.zichtbaar_voor_klanten} onChange={(e) => zetZichtbaarVoorKlanten(o.id, e.target.checked)} aria-label={`${o.naam} op de klantenpagina`} />
              </label>
            </div>
          ))}
        </Groep>
      )}

      <Klantencatalogus />

      <Groep titel="Overzicht">
        <button className="rij-knop" onClick={openOverzicht}><Icoon naam="grafiek" maat={18} /> Beurzen, omzet en voorraadwaarde</button>
      </Groep>

      <Groep titel="Prijzen">
        <Rij label="Cardmarket-prijsgids" waarde={gids ? `${datumKort(gids.datum)} · ${gids.prijzen.size.toLocaleString("nl-BE")} producten` : "nog niet geladen"} />
        <button className="rij-knop" onClick={() => void vernieuwPrijsgids()}><Icoon naam="vernieuw" maat={18} /> Prijsgids opnieuw laden</button>
        <p className="groep-uitleg">De prijsgids komt elke nacht automatisch binnen. "Prijzen nakijken" in de catalogus vergelijkt de hartjes ermee; de vault toont wat in waarde stijgt.</p>
      </Groep>

      <Offline />

      <Prijsregels />

      <Groep titel="Labels">
        <label className="schakel rij">
          <input type="checkbox" checked={instellingen.automatischPrinten} onChange={(e) => zetInstellingen({ automatischPrinten: e.target.checked })} />
          <span>Label meteen printen bij toevoegen</span>
        </label>
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
      <p className="groep-uitleg">Doe dit thuis met wifi, op elke gsm. De app, de kaarten, de foto's en de tekstherkenning staan dan op het toestel. Op de beurs werkt alles ook zonder internet; wijzigingen wachten op het toestel en gaan door zodra er weer verbinding is.</p>
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
      <div className="rij bod-instelling">
        <span>Bod bij inkoop</span>
        <span className="pct-veld"><input inputMode="numeric" defaultValue={instellingen.inkoopPct} aria-label="Inkoop in procent"
          onBlur={(e) => { const n = getal(e.target.value); if (n != null && n > 0 && n <= 100) zetInstellingen({ inkoopPct: Math.round(n) }); }} /> %</span>
      </div>
      <div className="rij bod-instelling">
        <span>Waarde bij ruil</span>
        <span className="pct-veld"><input inputMode="numeric" defaultValue={instellingen.ruilPct} aria-label="Ruil in procent"
          onBlur={(e) => { const n = getal(e.target.value); if (n != null && n > 0 && n <= 100) zetInstellingen({ ruilPct: Math.round(n) }); }} /> %</span>
      </div>
      <p className="groep-uitleg">Van de marktwaarde (Cardmarket, met conditie) van de kaarten van een klant. De kassa stelt ronde bedragen voor; je kiest altijd zelf.</p>
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
  const { instagram, backend } = useApp();
  const [naam, setNaam] = useState(instagram);
  const [qr, setQr] = useState(false);
  const url = klantUrl();
  const bekijk = klantUrl(backend?.soort === "demo");
  return (
    <Groep titel="Klantencatalogus">
      <p className="groep-uitleg">De pagina die klanten zien via onze link, zonder login: wat in de catalogus van de aangevinkte omgevingen ligt, met foto, conditie en prijs. Kaarten waarvan het hartje eerst moet wisselen, blijven verborgen tot het nieuwe hartje bewaard is. Rechtsboven staat de knop Beheer.</p>
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
            <QrBeeld tekst={url} />
            <p><strong>Scan en bekijk onze catalogus</strong></p>
            <p className="zacht klein">{url}</p>
          </div>
        </Sheet>
      )}
    </Groep>
  );
}
