import { useEffect, useState } from "react";
import { sluitToast, start, useApp } from "./state";
import { Voorraad } from "./ui/Voorraad";
import { Scan } from "./ui/Scan";
import { Labels } from "./ui/Labels";
import { Meer } from "./ui/Meer";
import { Login } from "./ui/Login";
import { ExemplaarSheet } from "./ui/ExemplaarSheet";
import { Toevoegen } from "./ui/Toevoegen";
import { Icoon } from "./ui/common";

type Tab = "voorraad" | "scan" | "labels" | "meer";
const TABS: { id: Tab; label: string; icoon: string }[] = [
  { id: "voorraad", label: "Voorraad", icoon: "doos" },
  { id: "scan", label: "Scan", icoon: "scan" },
  { id: "labels", label: "Labels", icoon: "label" },
  { id: "meer", label: "Meer", icoon: "meer" },
];

function beginTab(): Tab {
  const h = location.hash.replace("#", "") as Tab;
  return TABS.some((t) => t.id === h) ? h : "voorraad";
}

export function App() {
  const { fase, open, toasts, bezig, online, backend, exemplaren } = useApp();
  const [tab, setTab] = useState<Tab>(beginTab);

  useEffect(() => { void start(); }, []);
  useEffect(() => {
    history.replaceState(null, "", tab === "voorraad" ? location.pathname : `#${tab}`);
    window.scrollTo(0, 0);
  }, [tab]);

  if (fase === "start" || fase === "laden") {
    return (
      <div className="splash">
        <img src="img/logo.png" alt="Bind'r" width={180} />
        <div className="laadbalk"><span /></div>
      </div>
    );
  }
  if (fase === "login") return <><Login /><Toasts toasts={toasts} /></>;

  const tePrinten = exemplaren.filter((e) => e.label_status === "te printen" && (e.status === "in voorraad" || e.status === "gereserveerd")).length;

  return (
    <div className="app">
      {backend?.soort === "demo" && <div className="demo-band">Demo · alleen op dit toestel</div>}
      {!online && backend?.soort === "supabase" && <div className="offline-band">Geen internet · wijzigingen lukken pas weer met verbinding</div>}
      <main key={tab} className="tab-inhoud">
        {tab === "voorraad" && <Voorraad />}
        {tab === "scan" && <Scan />}
        {tab === "labels" && <Labels />}
        {tab === "meer" && <Meer />}
      </main>
      <nav className="tabbalk">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? "aan" : ""} onClick={() => setTab(t.id)} aria-current={tab === t.id ? "page" : undefined}>
            <span className="tab-icoon">
              <Icoon naam={t.icoon} maat={24} />
              {t.id === "labels" && tePrinten > 0 && <span className="tab-teller">{tePrinten > 99 ? "99+" : tePrinten}</span>}
            </span>
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
      {open?.soort === "exemplaar" && <ExemplaarSheet id={open.id} />}
      {open?.soort === "toevoegen" && <Toevoegen key={open.kaartId || "nieuw"} kaartId={open.kaartId} catalogus={open.catalogus} />}
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
