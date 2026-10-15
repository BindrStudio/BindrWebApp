import { useEffect } from "react";
import { meldAanwezig, naarTab, sluit, sluitToast, start, useApp, type Tab } from "./state";
import { Voorraad } from "./ui/Voorraad";
import { Scan } from "./ui/Scan";
import { Labels } from "./ui/Labels";
import { Meer } from "./ui/Meer";
import { Login, PinKiezen, Slot } from "./ui/Login";
import { Bovenbalk } from "./ui/Bovenbalk";
import { ExemplaarSheet } from "./ui/ExemplaarSheet";
import { ArtikelSheet, Artikelen } from "./ui/Artikelen";
import { Toevoegen } from "./ui/Toevoegen";
import { Kassa } from "./ui/Kassa";
import { BeursRapport, Overzicht, TransactieSheet } from "./ui/Beurs";
import { Icoon, Sheet } from "./ui/common";

const TABS: { id: Tab; label: string; icoon: string }[] = [
  { id: "catalogus", label: "Catalogus", icoon: "vitrine" },
  { id: "vault", label: "Vault", icoon: "doos" },
  { id: "scan", label: "Scan", icoon: "scan" },
  { id: "kassa", label: "Kassa", icoon: "kassa" },
  { id: "meer", label: "Meer", icoon: "meer" },
];

export function App() {
  const { fase, open, toasts, bezig, online, backend, tab, wachtrij, mandje, beurzen } = useApp();

  useEffect(() => { void start(); }, []);
  useEffect(() => {
    history.replaceState(null, "", tab === "catalogus" ? location.pathname : `#${tab}`);
    window.scrollTo(0, 0);
    void meldAanwezig();
  }, [tab]);

  if (fase === "start" || fase === "laden") {
    return (
      <div className="splash">
        <img src="img/logo.png" alt="Bind'r" width={200} />
        <div className="laadbalk"><span /></div>
      </div>
    );
  }
  if (fase === "login") return <><Login /><Toasts toasts={toasts} /></>;
  if (fase === "slot") return <><Slot /><Toasts toasts={toasts} /></>;
  if (fase === "pin") return <><PinKiezen /><Toasts toasts={toasts} /></>;

  const inMandje = mandje.regels.length;
  const beursBezig = beurzen.some((b) => b.status === "actief");

  return (
    <div className="app">
      {backend?.soort === "demo" && <div className="demo-band">Demo · alleen op dit toestel</div>}
      {backend?.soort === "supabase" && (!online || wachtrij > 0) && (
        <div className={`offline-band${online ? " bezig" : ""}`}>
          {online ? `Wijzigingen doorsturen… (${wachtrij})` : `Offline${wachtrij ? ` · ${wachtrij} ${wachtrij === 1 ? "wijziging wacht" : "wijzigingen wachten"}` : ""} · alles werkt verder`}
        </div>
      )}
      <Bovenbalk />
      <main key={tab} className="tab-inhoud">
        {tab === "catalogus" && <Voorraad opslag="vitrine" />}
        {tab === "vault" && <Voorraad opslag="stockdoos" />}
        {tab === "scan" && <Scan />}
        {tab === "kassa" && <Kassa />}
        {tab === "meer" && <Meer />}
      </main>
      <nav className="tabbalk">
        {TABS.map((t) => (
          <button key={t.id} className={`${tab === t.id ? "aan" : ""}${t.id === "scan" ? " scan-tab" : ""}`} onClick={() => naarTab(t.id)} aria-current={tab === t.id ? "page" : undefined}>
            <span className="tab-icoon">
              <Icoon naam={t.icoon} maat={t.id === "scan" ? 28 : 24} />
              {t.id === "kassa" && inMandje > 0 && <span className="tab-teller">{inMandje}</span>}
              {t.id === "kassa" && beursBezig && !inMandje && <span className="tab-live" aria-label="Beurs bezig" />}
            </span>
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
      {open?.soort === "exemplaar" && <ExemplaarSheet id={open.id} />}
      {open?.soort === "artikel" && <ArtikelSheet key={open.id ?? `nieuw-${open.type}`} id={open.id} type={open.type} vanLijst={open.vanLijst} />}
      {open?.soort === "artikelen" && <Artikelen type={open.type} />}
      {open?.soort === "toevoegen" && <Toevoegen key={open.kaartId || "nieuw"} kaartId={open.kaartId} catalogus={open.catalogus} opslag={open.opslag} />}
      {open?.soort === "labels" && <Sheet titel="Labels" onSluit={sluit} vol><Labels inSheet /></Sheet>}
      {open?.soort === "transactie" && <TransactieSheet id={open.id} />}
      {open?.soort === "beurs" && <BeursRapport id={open.id} />}
      {open?.soort === "overzicht" && <Overzicht />}
      {bezig && (
        <div className="bezig" role="status">
          <div className="bezig-kaart"><span className="draaier" />{bezig}</div>
        </div>
      )}
      <Toasts toasts={toasts} />
    </div>
  );
}

function Toasts({ toasts }: { toasts: ReturnType<typeof useApp>["toasts"] }) {
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.soort}`} onClick={() => sluitToast(t.id)}>
          <Icoon naam={t.soort === "fout" ? "kruis" : t.soort === "info" ? "hart" : "check"} maat={18} />
          <span>{t.tekst}</span>
          {t.actie && <button onClick={(e) => { e.stopPropagation(); t.actie!.doe(); sluitToast(t.id); }}>{t.actie.label}</button>}
        </div>
      ))}
    </div>
  );
}
