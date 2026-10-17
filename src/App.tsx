import { Component, useEffect, useRef, useState, type ReactNode } from "react";
import { meldAanwezig, naarTab, sluit, sluitToast, start, useApp, type Tab } from "./state";
import { Voorraad } from "./ui/Voorraad";
import { Scan } from "./ui/Scan";
import { Labels } from "./ui/Labels";
import { Profiel } from "./ui/Profiel";
import { Instellingen } from "./ui/Instellingen";
import { Boekhouding } from "./ui/Boekhouding";
import { Inzichten } from "./ui/Inzichten";
import { BeurzenEnTransacties } from "./ui/Historiek";
import { AfdrukLaag } from "./ui/Afdruk";
import { Prive } from "./ui/Prive";
import { EtalageSheet } from "./ui/Etalage";
import { ThemaSheet } from "./ui/Thema";
import { AanvragenSheet } from "./ui/Aanvragen";
import { Login, PinKiezen, Slot, WachtwoordKiezen } from "./ui/Login";
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
  { id: "profiel", label: "Profiel", icoon: "profiel" },
];

export function App() {
  const { fase, open, toasts, bezig, online, backend, tab, wachtrij, mandje, beurzen, aanvragen, omgeving, omgevingen } = useApp();

  // Een andere omgeving dan de eerste (Brent …) krijgt een iets andere achtergrond: zo zie je meteen waar je werkt.
  useEffect(() => {
    const i = [...omgevingen].sort((a, b) => a.volgorde - b.volgorde).findIndex((o) => o.id === omgeving);
    const root = document.documentElement;
    if (i > 0) root.dataset.omgeving = String(((i - 1) % 3) + 1);
    else delete root.dataset.omgeving;
    // De balk van de browser (Android) en het statusbalkje mee laten kleuren.
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", getComputedStyle(root).getPropertyValue("--perzik").trim() || "#fcebd7");
  }, [omgeving, omgevingen]);

  useEffect(() => { void start(); }, []);
  // Van welke kant komt het nieuwe scherm? Een tab naar rechts schuift van rechts binnen.
  const vorige = useRef(tab);
  const [richting, setRichting] = useState<"rechts" | "links" | null>(null);
  useEffect(() => {
    const a = TABS.findIndex((t) => t.id === vorige.current);
    const b = TABS.findIndex((t) => t.id === tab);
    setRichting(a === b ? null : b > a ? "rechts" : "links");
    vorige.current = tab;
    history.replaceState(null, "", tab === "catalogus" ? location.pathname : `#${tab}`);
    window.scrollTo(0, 0);
    void meldAanwezig();
  }, [tab]);
  // De eerste keer dat de app opengaat (per sessie): een korte intro.
  const [intro, setIntro] = useState(() => { try { return !sessionStorage.getItem("bindr-intro"); } catch { return false; } });
  useEffect(() => {
    if (fase !== "klaar" || !intro) return;
    try { sessionStorage.setItem("bindr-intro", "1"); } catch { /* privé-modus */ }
    const t = setTimeout(() => setIntro(false), 1400);
    return () => clearTimeout(t);
  }, [fase, intro]);

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
  if (fase === "wachtwoord") return <><WachtwoordKiezen /><Toasts toasts={toasts} /></>;

  const inMandje = mandje.regels.length;
  const beursBezig = beurzen.some((b) => b.status === "actief");
  const nieuweAanvragen = (aanvragen ?? []).filter((a) => a.status === "nieuw").length;

  return (
    <div className={`app${intro ? " intro" : ""}`}>
      {backend?.soort === "demo" && <div className="demo-band">Demo · alleen op dit toestel</div>}
      {backend?.soort === "supabase" && (!online || wachtrij > 0) && (
        <div className={`offline-band${online ? " bezig" : ""}`}>
          {online ? `Wijzigingen doorsturen… (${wachtrij})` : `Offline${wachtrij ? ` · ${wachtrij} ${wachtrij === 1 ? "wijziging wacht" : "wijzigingen wachten"}` : ""} · alles werkt verder`}
        </div>
      )}
      <Bovenbalk />
      <main key={tab} className={`tab-inhoud${richting ? ` van-${richting}` : ""}`}>
        {tab === "catalogus" && <Voorraad opslag="vitrine" />}
        {tab === "vault" && <Voorraad opslag="stockdoos" />}
        {tab === "scan" && <Scan />}
        {tab === "kassa" && <Kassa />}
        {tab === "profiel" && <Profiel />}
      </main>
      <nav className="tabbalk" style={{ ["--tab" as string]: TABS.findIndex((t) => t.id === tab) }}>
        <span className={`tab-duim${tab === "scan" ? " weg" : ""}`} aria-hidden="true" />
        {TABS.map((t) => (
          <button key={t.id} className={`${tab === t.id ? "aan" : ""}${t.id === "scan" ? " scan-tab" : ""}`} onClick={() => naarTab(t.id)} aria-current={tab === t.id ? "page" : undefined}>
            <span className="tab-icoon">
              <Icoon naam={t.icoon} maat={t.id === "scan" ? 28 : 24} />
              {t.id === "kassa" && inMandje > 0 && <span className="tab-teller">{inMandje}</span>}
              {t.id === "kassa" && beursBezig && !inMandje && <span className="tab-live" aria-label="Beurs bezig" />}
              {t.id === "profiel" && nieuweAanvragen > 0 && <span className="tab-teller" aria-label={`${nieuweAanvragen} nieuwe aanvragen`}>{nieuweAanvragen}</span>}
            </span>
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
      <Vangnet sleutel={JSON.stringify(open ?? null)}>
        {open?.soort === "exemplaar" && <ExemplaarSheet id={open.id} />}
        {open?.soort === "artikel" && <ArtikelSheet key={open.id ?? `nieuw-${open.type}`} id={open.id} type={open.type} vanLijst={open.vanLijst} />}
        {open?.soort === "artikelen" && <Artikelen type={open.type} />}
        {open?.soort === "toevoegen" && <Toevoegen key={open.kaartId || "nieuw"} kaartId={open.kaartId} catalogus={open.catalogus} opslag={open.opslag} />}
        {open?.soort === "labels" && <Sheet titel="Labels" onSluit={sluit} vol><Labels inSheet /></Sheet>}
        {open?.soort === "transactie" && <TransactieSheet id={open.id} />}
        {open?.soort === "beurs" && <BeursRapport id={open.id} />}
        {open?.soort === "overzicht" && <Overzicht />}
        {open?.soort === "instellingen" && <Instellingen />}
        {open?.soort === "boekhouding" && <Boekhouding onSluit={sluit} />}
        {open?.soort === "inzichten" && <Inzichten onSluit={sluit} />}
        {open?.soort === "historiek" && <BeurzenEnTransacties onSluit={sluit} />}
        {open?.soort === "prive" && <Prive onSluit={sluit} />}
        {open?.soort === "etalage" && <EtalageSheet key={open.plek} plek={open.plek} />}
        {open?.soort === "thema" && <ThemaSheet />}
        {open?.soort === "aanvragen" && <AanvragenSheet id={open.id} />}
      </Vangnet>
      <AfdrukLaag />
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

/**
 * Loopt er iets mis in een scherm dat over de app opent (Instellingen, een kaart, de boekhouding …), dan
 * toont dit vangnet wat er misging in plaats van niets, en blijft de rest van de app werken.
 */
class Vangnet extends Component<{ sleutel: string; children: ReactNode }, { fout: string | null }> {
  state = { fout: null as string | null };
  static getDerivedStateFromError(e: unknown) { return { fout: e instanceof Error ? e.message : String(e) }; }
  componentDidCatch(e: unknown) { console.error("Fout in een scherm:", e); }
  componentDidUpdate(vorige: { sleutel: string }) { if (vorige.sleutel !== this.props.sleutel && this.state.fout) this.setState({ fout: null }); }
  render() {
    if (!this.state.fout) return this.props.children;
    return (
      <Sheet titel="Er ging iets mis" onSluit={() => { this.setState({ fout: null }); sluit(); }}>
        <p>Dit scherm kon niet openen. Herlaad de app en probeer opnieuw. Blijft het gebeuren, geef dan deze melding door:</p>
        <p className="nakijken klein">{this.state.fout}</p>
        <button className="knop" onClick={() => location.reload()}>App herladen</button>
      </Sheet>
    );
  }
}
