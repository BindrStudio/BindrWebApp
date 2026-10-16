// Profiel (rechtsonder): wie je bent, waar je werkt, en wat je naast de kassa vaak nodig hebt:
// artikels, beurzen en transacties, inzichten, boekhouding en het overzicht. Instellingen zitten
// achter het tandwiel rechtsboven.
import { useMemo, useState } from "react";
import {
  actieveBeurs, actieveOmgeving, inkoopThuis, logUit, openArtikelen, openBoekhouding, openHistoriek, openInzichten, openOverzicht, openPrive,
  synchroniseer, useApp, wisselOmgeving,
} from "../state";
import { PinKiezen } from "./Login";
import { euro } from "../lib/format";
import { dagontvangsten } from "../lib/boekhouding";
import { Icoon, Sheet } from "./common";

function initialen(naam: string): string {
  const d = naam.trim().split(/\s+/);
  return (d.length > 1 ? d[0][0] + d[d.length - 1][0] : naam.slice(0, 2)).toUpperCase();
}

export function Profiel() {
  const s = useApp();
  const { backend, wachtrij, online } = s;
  const demo = backend?.soort === "demo";
  const gebruiker = backend?.gebruiker();
  const naam = demo ? "Demo" : gebruiker?.naam || gebruiker?.email || "Beheerder";
  const [pinOpen, setPinOpen] = useState(false);
  const omg = actieveOmgeving(s);
  const beurs = actieveBeurs(s);
  const telArtikels = s.artikelen.reduce((n, a) => n + Math.max(0, a.aantal), 0);
  const jaar = new Date().getFullYear();
  const omzet = useMemo(() => dagontvangsten(s.transacties).filter((d) => d.datum.startsWith(`${jaar}-`)).reduce((x, d) => x + d.ontvangsten, 0), [s.transacties, jaar]);
  const verkocht = s.transacties.filter((t) => t.status !== "ongedaan" && (t.soort === "verkoop" || t.soort === "ruil")).length;

  return (
    <div className="scherm profiel">
      <section className="profiel-kaart">
        <span className="profiel-avatar" aria-hidden="true">{initialen(naam)}</span>
        <div className="profiel-wie">
          <h1>{naam}</h1>
          <p className="zacht">{demo ? "Demo op dit toestel" : gebruiker?.email}{omg ? ` · ${omg.naam}` : ""}</p>
          {beurs && <p className="beurs-live"><span className="live-stip" /> {beurs.naam}</p>}
        </div>
      </section>

      <div className="profiel-tegels">
        <button className="profiel-tegel binders" onClick={() => openArtikelen("binder")}>
          <Icoon naam="binder" maat={26} />
          <strong>Artikels</strong>
          <span>{telArtikels} op voorraad · binders, sealed, 3D-prints</span>
        </button>
        <button className="profiel-tegel historiek" onClick={openHistoriek}>
          <Icoon naam="historiek" maat={26} />
          <strong>Historiek</strong>
          <span>Beurzen en {verkocht} verkopen en ruilen</span>
        </button>
        <button className="profiel-tegel inzichten" onClick={openInzichten}>
          <Icoon naam="inzicht" maat={26} />
          <strong>Inzichten</strong>
          <span>Wat verkoopt, wat blijft liggen</span>
        </button>
        <button className="profiel-tegel boekhouding" onClick={openBoekhouding}>
          <Icoon naam="boek" maat={26} />
          <strong>Boekhouding</strong>
          <span>{euro(omzet, true)} omzet in {jaar} · dagontvangsten, aankopen en voorraad voor Dexxter</span>
        </button>
        <button className="profiel-tegel thuis" onClick={inkoopThuis}>
          <Icoon naam="inkoop" maat={26} />
          <strong>Ingekocht buiten een beurs</strong>
          <span>Facebook, Vinted, een rommelmarkt: kaarten, prijs, foto of screenshot</span>
        </button>
        <button className="profiel-tegel prive" onClick={openPrive}>
          <Icoon naam="ruil" maat={26} />
          <strong>Privé ⇄ Bind'r</strong>
          <span>Kaarten uit je eigen verzameling inbrengen, of meenemen naar privé</span>
        </button>
        <button className="profiel-tegel overzicht" onClick={openOverzicht}>
          <Icoon naam="grafiek" maat={26} />
          <strong>Overzicht</strong>
          <span>Voorraadwaarde, komende beurzen, export</span>
        </button>
      </div>

      {s.omgevingen.length > 1 && (
        <section className="groep">
          <h2 className="groep-titel">Waar werk je?</h2>
          <div className="groep-inhoud">
            {s.omgevingen.map((o) => (
              <button key={o.id} className={`rij-knop omgeving-wissel${o.id === s.omgeving ? " aan" : ""}`} onClick={() => wisselOmgeving(o.id)} disabled={o.id === s.omgeving}>
                {o.id === s.omgeving ? <Icoon naam="check" maat={18} /> : <span className="leeg-bol" />} {o.naam}
              </button>
            ))}
            <p className="groep-uitleg">Elke omgeving heeft een eigen catalogus, vault, kassa, beurzen en boekhouding.</p>
          </div>
        </section>
      )}

      <section className="groep">
        <h2 className="groep-titel">Account</h2>
        <div className="groep-inhoud">
          {!demo && <div className="rij"><span>Synchronisatie</span><span className="zacht">{wachtrij ? `${wachtrij} wijzigingen wachten${online ? "" : " op internet"}` : "alles is doorgestuurd"}</span></div>}
          {!demo && <button className="rij-knop" onClick={() => void synchroniseer()}><Icoon naam="vernieuw" maat={18} /> Nu synchroniseren</button>}
          {!demo && <button className="rij-knop" onClick={() => setPinOpen(true)}><Icoon naam="slot" maat={18} /> Pincode wijzigen</button>}
          <button className="rij-knop" onClick={() => void logUit()}><Icoon naam="uit" maat={18} /> {demo ? "Demo verlaten" : "Uitloggen"}</button>
          {!demo && <p className="groep-uitleg">Na 10 minuten zonder de app vraagt hij je pincode opnieuw. Uitloggen wist ook wat deze gsm over jou onthoudt.</p>}
        </div>
      </section>
      {pinOpen && (
        <Sheet titel="Pincode wijzigen" onSluit={() => setPinOpen(false)}>
          <PinKiezen inSheet onKlaar={() => setPinOpen(false)} />
        </Sheet>
      )}
    </div>
  );
}
