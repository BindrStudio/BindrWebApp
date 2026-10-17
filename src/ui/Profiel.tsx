// Profiel (rechtsonder): wie je bent en wat je naast de kassa vaak nodig hebt: artikels, beurzen,
// historiek, inzichten, boekhouding en het overzicht. De omgeving kies je bovenaan; instellingen zitten
// achter het tandwiel rechtsboven.
import { useMemo, useState } from "react";
import {
  actieveBeurs, actieveOmgeving, beheerThema, boekhoudingAan, inkoopThuis, logUit, openAanvragen, openArtikelen, openBoekhouding, openEtalage, openHistoriek, openInzichten, openOverzicht, openPrive, openTegoeden, openThema,
  synchroniseer, useApp,
} from "../state";
import { PinKiezen, WachtwoordWijzigen } from "./Login";
import { datumKort, euro } from "../lib/format";
import { dagontvangsten } from "../lib/boekhouding";
import { openBonnen } from "../lib/tegoed";
import { Icoon, Sheet } from "./common";
import { BeurzenSheet, geplandeBeurzen } from "./Beurs";

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
  const [wachtwoordOpen, setWachtwoordOpen] = useState(false);
  const [beurzenOpen, setBeurzenOpen] = useState(false);
  const omg = actieveOmgeving(s);
  const beurs = actieveBeurs(s);
  const boekhouding = boekhoudingAan(s);
  const volgende = geplandeBeurzen(s.beurzen)[0];
  const gepland = geplandeBeurzen(s.beurzen).length;
  const telArtikels = s.artikelen.reduce((n, a) => n + Math.max(0, a.aantal), 0);
  const jaar = new Date().getFullYear();
  const omzet = useMemo(() => dagontvangsten(s.transacties).filter((d) => d.datum.startsWith(`${jaar}-`)).reduce((x, d) => x + d.ontvangsten, 0), [s.transacties, jaar]);
  const nieuweAanvragen = (s.aanvragen ?? []).filter((a) => a.status === "nieuw").length;
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
        <button className="profiel-tegel beurzen" onClick={() => setBeurzenOpen(true)}>
          <Icoon naam="kalender" maat={26} />
          <strong>Beurzen</strong>
          <span>{volgende ? `Volgende: ${volgende.naam}, ${datumKort(volgende.datum)}` : "Plan je volgende beurs"}{gepland > 1 ? ` · ${gepland} gepland` : ""}</span>
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
        {boekhouding && (
          <button className="profiel-tegel boekhouding" onClick={openBoekhouding}>
            <Icoon naam="boek" maat={26} />
            <strong>Boekhouding</strong>
            <span>{euro(omzet, true)} omzet in {jaar} · dagontvangsten, aankopen en voorraad voor Dexxter</span>
          </button>
        )}
        <button className={`profiel-tegel thuis${beurs ? " uit" : ""}`} onClick={inkoopThuis} aria-disabled={!!beurs}>
          <Icoon naam="inkoop" maat={26} />
          <strong>Ingekocht buiten een beurs</strong>
          <span>{beurs ? `Kan niet zolang ${beurs.naam} loopt: koop in via de kassa, of sluit eerst de beurs af` : "Facebook, Vinted, een rommelmarkt: kaarten, prijs, foto of screenshot"}</span>
        </button>
        <button className="profiel-tegel tegoeden" onClick={openTegoeden}>
          <Icoon naam="tegoed" maat={26} />
          <strong>Tegoeden</strong>
          <span>{(() => { const o = openBonnen(s.transacties); const t = o.reduce((x, b) => x + b.rest, 0); return o.length ? `${euro(Math.round(t * 100) / 100)} open op ${o.length} ${o.length === 1 ? "bon" : "bonnen"}` : "Storecredit: een bon in plaats van geld"; })()}</span>
        </button>
        {boekhouding && (
          <button className="profiel-tegel prive" onClick={openPrive}>
            <Icoon naam="ruil" maat={26} />
            <strong>Privé ⇄ {omg?.naam ?? "Bind'r"}</strong>
            <span>Kaarten uit je eigen verzameling inbrengen, of meenemen naar privé</span>
          </button>
        )}
        <button className={`profiel-tegel overzicht${boekhouding ? " breed" : ""}`} onClick={openOverzicht}>
          <Icoon naam="grafiek" maat={26} />
          <strong>Overzicht</strong>
          <span>Voorraadwaarde, beurzen en export</span>
        </button>
      </div>

      <section className="groep">
        <h2 className="groep-titel">Klantenpagina</h2>
        <div className="profiel-tegels">
          <button className="profiel-tegel voorpagina" onClick={() => openEtalage("voorpagina")}>
            <Icoon naam="uitgeknipt" maat={26} />
            <strong>Binders vooraan</strong>
            <span>Foto's zonder achtergrond, bovenaan de startpagina</span>
          </button>
          <button className="profiel-tegel instagram" onClick={() => openEtalage("instagram")}>
            <Icoon naam="instagram" maat={26} />
            <strong>Instagram</strong>
            <span>Onze laatste berichten, in de strook boven de beurzen</span>
          </button>
          <button className="profiel-tegel thema" onClick={openThema}>
            <Icoon naam="thema" maat={26} />
            <strong>Thema</strong>
            <span>{(() => { const t = beheerThema(); return t ? `Nu op de site: ${t.thema.naam}` : "Halloween, kerst …: logo, kleur en versiering"; })()}</span>
          </button>
          <button className="profiel-tegel aanvragen" onClick={() => openAanvragen()}>
            <Icoon naam="brief" maat={26} />
            <strong>Aanvragen</strong>
            <span>{nieuweAanvragen ? `${nieuweAanvragen} ${nieuweAanvragen === 1 ? "nieuwe aanvraag" : "nieuwe aanvragen"}` : "Eigen binders die klanten vragen"}</span>
            {nieuweAanvragen > 0 && <span className="tegel-teller">{nieuweAanvragen}</span>}
          </button>
        </div>
      </section>

      <section className="groep">
        <h2 className="groep-titel">Account</h2>
        <div className="groep-inhoud">
          {!demo && <SyncStatus />}
          {!demo && wachtrij > 0 && online && <button className="rij-knop" onClick={() => void synchroniseer()}><Icoon naam="vernieuw" maat={18} /> Nu doorsturen</button>}
          {!demo && <button className="rij-knop" onClick={() => setPinOpen(true)}><Icoon naam="slot" maat={18} /> Pincode wijzigen</button>}
          {!demo && <button className="rij-knop" onClick={() => setWachtwoordOpen(true)}><Icoon naam="slot" maat={18} /> Wachtwoord wijzigen</button>}
          <button className="rij-knop" onClick={() => void logUit()}><Icoon naam="uit" maat={18} /> {demo ? "Demo verlaten" : "Uitloggen"}</button>
          {!demo && <p className="groep-uitleg">Je pincode opent de app op deze gsm; na 10 minuten zonder de app vraagt hij ze opnieuw. Na 10 foute pincodes moet je opnieuw inloggen met je wachtwoord. Uitloggen wist ook wat deze gsm over jou onthoudt.</p>}
        </div>
      </section>
      {beurzenOpen && <BeurzenSheet onSluit={() => setBeurzenOpen(false)} />}
      {wachtwoordOpen && (
        <Sheet titel="Wachtwoord wijzigen" onSluit={() => setWachtwoordOpen(false)}>
          <WachtwoordWijzigen onKlaar={() => setWachtwoordOpen(false)} />
        </Sheet>
      )}
      {pinOpen && (
        <Sheet titel="Pincode wijzigen" onSluit={() => setPinOpen(false)}>
          <PinKiezen inSheet onKlaar={() => setPinOpen(false)} />
        </Sheet>
      )}
    </div>
  );
}

/**
 * Hoe staat de synchronisatie? De app stuurt elke wijziging meteen door en haalt om de 30 seconden op wat
 * de anderen deden (en meteen als je de app opent of weer online komt): een knop is enkel nodig als er iets
 * blijft wachten.
 */
function SyncStatus() {
  const { wachtrij, online, bijgewerktOp } = useApp();
  const tijd = bijgewerktOp ? new Date(bijgewerktOp).toLocaleTimeString("nl-BE", { hour: "2-digit", minute: "2-digit" }) : null;
  const tekst = !online
    ? `Offline${wachtrij ? `: ${wachtrij} ${wachtrij === 1 ? "wijziging wacht" : "wijzigingen wachten"} op internet` : ": wat je doet, gaat mee zodra je weer online bent"}`
    : wachtrij
      ? `${wachtrij} ${wachtrij === 1 ? "wijziging wordt" : "wijzigingen worden"} doorgestuurd`
      : `Alles is doorgestuurd${tijd ? ` · bijgewerkt om ${tijd}` : ""}`;
  return (
    <div className="sync-rij" role="status">
      <span className={`sync-stip${!online ? " offline" : wachtrij ? " wacht" : ""}`} aria-hidden="true" />
      <span>{tekst}</span>
    </div>
  );
}
