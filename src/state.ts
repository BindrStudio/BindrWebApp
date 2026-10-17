// Eén centrale toestand voor de hele app, met acties. Componenten lezen via useApp().
//
// Elke wijziging gebeurt meteen op het toestel (zodat de app ook zonder internet
// werkt) en gaat daarna via een wachtrij naar de server. Lukt dat niet door een
// netwerkfout, dan blijft ze in de wachtrij tot er weer verbinding is.
import { useSyncExternalStore } from "react";
import { Fout, isNetwerkFout, type Alles, type Backend, type PrijsMarkering } from "./store/backend";
import { DemoBackend } from "./store/demo";
import { BOEKHOUDING_VANAF, ETALAGE_VANAF, FEED_VANAF, SupabaseBackend, THEMA_VANAF } from "./store/supabase";
import type { Aankoopfoto, Aanvraag, AanvraagStatus, Aanwezig, Artikel, Artikelfoto, Etalagefoto, EtalagePlek, Thema, ArtikelType, Bedrijf, BedrijfPubliek, Beurs, Exemplaar, NieuwArtikel, NieuwExemplaar, Omgeving, Regel, Tegenpartij, Transactie } from "./types";
import { bewaarPin, controleerPin, isOudePin, isVergrendeld, leesPin, maakPinVanToestel, markeerActief, pinFout, teVeelPogingen, wachtwoordFout, wisPin, wisPogingen, VERGRENDEL_NA_MS } from "./lib/pin";
import { laadPrijsgids, type Prijsgids } from "./lib/prices";
import { prijscheck, STANDAARD_INSTELLINGEN, type Instellingen, type TeWijzigen } from "./lib/pricing";
import { dagVan, euro, vandaag } from "./lib/format";
import { HARTJES_OK, kies } from "./lib/grapjes";
import { laadTestset } from "./lib/testset";
import { printLabels, printRandtest, printerNaam, verbindPrinter, ontkoppelPrinter, type Afstelling } from "./lib/printer";
import { laadCatalogus } from "./lib/catalog";
import { laadOcr } from "./lib/ocr";
import { uuid } from "./lib/uuid";
import { actiefThema, maandDag, soortVan, themaLogo, type ThemaSoort } from "./lib/thema";
import { veiligeFoto } from "./lib/eigenfoto";
import { inVoorraad, metTelling, metVitrineSinds, schoonArtikel, schoonExemplaar, standaardArtikel, standaardExemplaar } from "./lib/exemplaar";
import {
  aanvaardConflict, losConflictOp, maakOngedaan, nieuweKasbeweging, nieuwePrive, nieuweRetour, nieuweTransactie, pasToe, pasTotaalAan, stand,
  type Betaling,
} from "./lib/kassa";
import { toonCode } from "./lib/code";
import { bodVanExact, exactBod, marktwaarde, pasBodToe, PCT_MAX, PCT_MIN, type BodInstelling } from "./lib/bod";
import { APP_VERSIE, BEHEER_PAD, FACEBOOK, INSTAGRAM } from "./config";

export interface Toast {
  id: number;
  tekst: string;
  soort: "ok" | "fout" | "info";
  actie?: { label: string; doe: () => void };
}

export type Tab = "catalogus" | "vault" | "scan" | "kassa" | "profiel";

export type Open =
  | { soort: "exemplaar"; id: string }
  | { soort: "toevoegen"; kaartId?: string; catalogus?: "en" | "asia"; opslag?: "vitrine" | "stockdoos" }
  | { soort: "artikel"; id: string | null; type?: ArtikelType; vanLijst?: boolean }
  | { soort: "artikelen"; type?: ArtikelType }
  | { soort: "labels" }
  | { soort: "transactie"; id: string }
  | { soort: "beurs"; id: string }
  | { soort: "overzicht" }
  | { soort: "instellingen" }
  | { soort: "boekhouding" }
  | { soort: "inzichten" }
  | { soort: "historiek" }
  | { soort: "prive" }
  | { soort: "etalage"; plek: EtalagePlek }
  | { soort: "thema" }
  | { soort: "aanvragen"; id?: string }
  | { soort: "inkoopThuis" }      // naar de kassa, meteen "Kaart van klant" (inkoop buiten een beurs)
  | null;

export interface Mandje {
  regels: Regel[];
  bod?: BodInstelling | null; // het bod op de kaarten van de klant (percentage en afronding)
}

export interface State {
  // slot = vergrendeld (pincode ingeven), pin = een pincode kiezen
  fase: "start" | "login" | "slot" | "pin" | "wachtwoord" | "laden" | "klaar";
  backend: Backend | null;
  exemplaren: Exemplaar[];
  artikelen: Artikel[];
  beurzen: Beurs[];
  transacties: Transactie[];
  beheerders: Record<string, string>;
  gids: Prijsgids | null;
  teWijzigen: Map<string, TeWijzigen>;
  prijscheckOp: string | null;
  instellingen: Instellingen;
  instagram: string;
  facebook: string;                // link naar onze Facebook-pagina (leeg = niet tonen)
  bedrijfPubliek: BedrijfPubliek | null; // wettelijke gegevens op de klantenpagina
  aanvraagSleutel: string | null; // Web3Forms: aanvragen van klanten ook per mail (openbaar bedoeld)
  instagramFeed: string | null; // JSON-feed van Behold: onze Instagram-berichten automatisch op de klantenpagina (openbaar bedoeld)
  /** Boekhouding (gedeeld via de database): bedrijfsgegevens en welke dagen al in Dexxter staan, per omgeving. */
  boekhouding: { bedrijven: Record<string, Bedrijf>; ingegeven: Record<string, Record<string, boolean>> };
  toasts: Toast[];
  online: boolean;
  wachtrij: number;
  printer: string | null;
  bezig: string | null;
  open: Open;
  tab: Tab;
  mandje: Mandje;
  omgevingen: Omgeving[];
  omgeving: string | null;  // de omgeving waarin je nu werkt (Bind'r of Brent)
  aanwezig: Aanwezig[];     // wie er de laatste minuten bezig was
  fotoVersie: number;       // telt op als er foto's (aankoop, artikel, etalage) geladen of toegevoegd werden
  aanvragen: Aanvraag[] | null; // aanvragen voor een eigen binder (null = nog niet geladen of oud schema)
  gedeeltelijk: boolean;    // offline gestart met de kopie: enkel de voorraad en de laatste maanden historiek
  bijgewerktOp: string | null; // laatste keer dat de app iets van de server haalde
}

const MODUS = "bindr-modus";
const PRIJSCHECK = "bindr-prijscheck-v2";
const INSTELLINGEN = "bindr-instellingen-v1";
const MANDJE = "bindr-mandje-v1";
const OMGEVING = "bindr-omgeving-v1";
const mandjeSleutel = (omgeving: string | null) => (omgeving ? `bindr-mandje-v2-${omgeving}` : MANDJE);

function leesJson<T>(sleutel: string, standaard: T): T {
  try {
    const v = localStorage.getItem(sleutel);
    return v ? { ...standaard, ...JSON.parse(v) } : standaard;
  } catch {
    return standaard;
  }
}
function schrijf(sleutel: string, waarde: unknown) {
  try { localStorage.setItem(sleutel, JSON.stringify(waarde)); } catch { /* vol of privé-modus */ }
}

function beginTab(): Tab {
  const h = (typeof location !== "undefined" ? location.hash.replace("#", "") : "") as Tab;
  if ((h as string) === "meer") return "profiel"; // oude links
  return ["catalogus", "vault", "scan", "kassa", "profiel"].includes(h) ? h : "catalogus";
}

let state: State = {
  fase: "start",
  backend: null,
  exemplaren: [],
  artikelen: [],
  beurzen: [],
  transacties: [],
  beheerders: {},
  gids: null,
  teWijzigen: new Map(),
  prijscheckOp: null,
  instellingen: leesJson(INSTELLINGEN, STANDAARD_INSTELLINGEN),
  instagram: INSTAGRAM,
  facebook: FACEBOOK,
  bedrijfPubliek: null,
  aanvraagSleutel: null,
  instagramFeed: null,
  boekhouding: { bedrijven: {}, ingegeven: {} },
  toasts: [],
  online: typeof navigator === "undefined" ? true : navigator.onLine,
  wachtrij: 0,
  printer: null,
  bezig: null,
  open: null,
  tab: beginTab(),
  mandje: leesJson<Mandje>(MANDJE, { regels: [] }),
  omgevingen: [],
  omgeving: null,
  aanwezig: [],
  fotoVersie: 0,
  aanvragen: null,
  gedeeltelijk: false,
  bijgewerktOp: null,
};

/** Welke hartjes moeten wisselen: wat de laatste prijscheck markeerde (gedeeld via de database). */
function teWijzigenUit(exemplaren: Exemplaar[]): Map<string, TeWijzigen> {
  const m = new Map<string, TeWijzigen>();
  for (const e of exemplaren) {
    if (e.nieuw_hartje == null || e.opslag !== "vitrine" || !inVoorraad(e) || e.hartjesprijs == null || e.prijs_handmatig) continue;
    if (e.nieuw_hartje === e.hartjesprijs) continue;
    m.set(e.id, { id: e.id, oud: e.hartjesprijs, nieuw: e.nieuw_hartje, richting: e.nieuw_hartje > e.hartjesprijs ? "op" : "neer" });
  }
  return m;
}

const luisteraars = new Set<() => void>();
function zet(deel: Partial<State>) {
  if ("exemplaren" in deel && deel.exemplaren) deel = { ...deel, teWijzigen: teWijzigenUit(deel.exemplaren) };
  state = { ...state, ...deel };
  if ("exemplaren" in deel || "artikelen" in deel || "beurzen" in deel || "transacties" in deel) bewaarKopieLater();
  if ("mandje" in deel) schrijf(mandjeSleutel(state.omgeving), state.mandje);
  luisteraars.forEach((l) => l());
}

// ── Omgevingen: de rijen van de andere omgevingen staan apart ────────────────
// De schermen werken enkel met de actieve omgeving (state.exemplaren enz.). Wat bij een
// andere omgeving hoort, bewaren we hier, zodat wisselen en de kopie op het toestel kloppen.
let buiten: Alles = { exemplaren: [], artikelen: [], beurzen: [], transacties: [] };

function hoortHier(r: { omgeving_id?: string | null }, omgeving = state.omgeving): boolean {
  if (!omgeving) return true;
  return (r.omgeving_id ?? state.omgevingen[0]?.id ?? omgeving) === omgeving;
}

function splits(alles: Alles, omgeving = state.omgeving): Alles {
  const hier = (r: { omgeving_id?: string | null }) => hoortHier(r, omgeving);
  buiten = {
    exemplaren: alles.exemplaren.filter((r) => !hier(r)),
    artikelen: alles.artikelen.filter((r) => !hier(r)),
    beurzen: alles.beurzen.filter((r) => !hier(r)),
    transacties: alles.transacties.filter((r) => !hier(r)),
  };
  return {
    exemplaren: alles.exemplaren.filter(hier),
    artikelen: alles.artikelen.filter(hier),
    beurzen: alles.beurzen.filter(hier),
    transacties: alles.transacties.filter(hier),
  };
}

function alleRijen(): Alles {
  return {
    exemplaren: [...state.exemplaren, ...buiten.exemplaren],
    artikelen: [...state.artikelen, ...buiten.artikelen],
    beurzen: [...state.beurzen, ...buiten.beurzen],
    transacties: [...state.transacties, ...buiten.transacties],
  };
}

/** Alle codes, ook van de andere omgevingen: een nieuwe code mag nergens al bestaan. */
export function alleCodes(): Set<string> {
  return new Set([...state.exemplaren, ...buiten.exemplaren].map((e) => e.code));
}

/** Een gescande code die bij een andere omgeving hoort. */
export function codeElders(code: string): { exemplaar: Exemplaar; omgeving: Omgeving | undefined } | null {
  const e = buiten.exemplaren.find((x) => x.code === code);
  return e ? { exemplaar: e, omgeving: state.omgevingen.find((o) => o.id === e.omgeving_id) } : null;
}

export const actieveOmgeving = (s: State = state) => s.omgevingen.find((o) => o.id === s.omgeving) ?? null;

const omgevingSleutel = (b: Backend) => `${OMGEVING}-${b.soort}-${b.gebruikerId() ?? "?"}`;

/** Wissel van omgeving: een andere catalogus, vault, kassa en beurzen. */
export function wisselOmgeving(id: string) {
  if (id === state.omgeving || !state.omgevingen.some((o) => o.id === id)) return;
  const alles = alleRijen();
  schrijf(mandjeSleutel(state.omgeving), state.mandje);
  const deel = splits(alles, id);
  zet({ ...deel, omgeving: id, mandje: leesJson<Mandje>(mandjeSleutel(id), { regels: [] }), open: null });
  if (state.backend) schrijf(omgevingSleutel(state.backend), id);
  meld(`Je werkt nu in ${actieveOmgeving()?.naam ?? "de andere omgeving"}`, "info");
  void meldAanwezig();
}

/** Een omgeving wel of niet tonen op de klantenpagina. */
export function zetZichtbaarVoorKlanten(id: string, zichtbaar: boolean) {
  const o = state.omgevingen.find((x) => x.id === id);
  if (!o) return;
  const nieuw = { ...o, zichtbaar_voor_klanten: zichtbaar };
  zet({ omgevingen: state.omgevingen.map((x) => (x.id === id ? nieuw : x)) });
  inRij({ soort: "omgeving", omgeving: nieuw });
}
export function useApp(): State {
  return useSyncExternalStore(
    (l) => { luisteraars.add(l); return () => luisteraars.delete(l); },
    () => state,
  );
}
export const huidig = () => state;

// ── Meldingen ────────────────────────────────────────────────────────────────
let toastId = 1;
export function meld(tekst: string, soort: Toast["soort"] = "ok", actie?: Toast["actie"], ms = 2800) {
  // Eén melding tegelijk, bovenaan: een nieuwe vervangt de vorige, zodat ze nooit knoppen afdekken.
  const t: Toast = { id: toastId++, tekst, soort, actie };
  zet({ toasts: [t] });
  setTimeout(() => zet({ toasts: state.toasts.filter((x) => x.id !== t.id) }), actie ? Math.max(ms, 5500) : ms);
}
export function sluitToast(id: number) {
  zet({ toasts: state.toasts.filter((x) => x.id !== id) });
}
function fout(e: unknown) {
  meld(e instanceof Error ? e.message : String(e), "fout", undefined, 6000);
}

// ── Navigatie binnen de app ──────────────────────────────────────────────────
export function naarTab(tab: Tab) { zet({ tab, open: null }); }
export function openExemplaar(id: string) { zet({ open: { soort: "exemplaar", id } }); }
export function openArtikel(id: string | null, type?: ArtikelType) {
  zet({ open: { soort: "artikel", id, type, vanLijst: state.open?.soort === "artikelen" } });
}
export function openArtikelen(type?: ArtikelType) { zet({ open: { soort: "artikelen", type } }); }
export function openToevoegen(kaartId?: string, catalogus?: "en" | "asia", opslag?: "vitrine" | "stockdoos") {
  zet({ open: { soort: "toevoegen", kaartId, catalogus, opslag } });
}
export function openLabels() { zet({ open: { soort: "labels" } }); }
export function openTransactie(id: string) { zet({ open: { soort: "transactie", id } }); }
export function openBeurs(id: string) { zet({ open: { soort: "beurs", id } }); }
export function openOverzicht() { zet({ open: { soort: "overzicht" } }); }
export function openInstellingen() { zet({ open: { soort: "instellingen" } }); }
export function openBoekhouding() { zet({ open: { soort: "boekhouding" } }); }
export function openInzichten() { zet({ open: { soort: "inzichten" } }); }
export function openHistoriek() { zet({ open: { soort: "historiek" } }); }
export function openPrive() { zet({ open: { soort: "prive" } }); }
export function openEtalage(plek: EtalagePlek) { zet({ open: { soort: "etalage", plek } }); }
export function openThema() { zet({ open: { soort: "thema" } }); }
export function openAanvragen(id?: string) { zet({ open: { soort: "aanvragen", id } }); }
/** Kaarten gekocht buiten een beurs (Facebook, rommelmarkt): via de kassa, Van de klant. */
/** Kopen buiten een beurs (Facebook, rommelmarkt): enkel als er geen beurs loopt, anders klopt de kas niet. */
export function inkoopThuis() {
  const b = actieveBeurs();
  if (b) return meld(`${b.naam} loopt nog: koop in via de kassa, of sluit eerst de beurs af.`, "fout");
  zet({ tab: "kassa", open: { soort: "inkoopThuis" } });
}
export function sluit() { zet({ open: null }); }

// ── Kopie op het toestel (Supabase): om offline te kunnen starten ────────────
const kopieSleutel = (b: Backend) => `bindr-kopie-v2-${b.gebruikerId() ?? "?"}`;
let kopieTimer: ReturnType<typeof setTimeout> | null = null;
function bewaarKopieLater() {
  const b = state.backend;
  if (!b || b.soort !== "supabase" || state.fase !== "klaar") return;
  if (kopieTimer) clearTimeout(kopieTimer);
  kopieTimer = setTimeout(() => {
    try {
      localStorage.setItem(kopieSleutel(b), JSON.stringify(kopieVan(alleRijen())));
    } catch {
      // Te groot of vol: liever geen kopie dan een oude (die zou verkochte kaarten als voorraad tonen).
      try { localStorage.removeItem(kopieSleutel(b)); } catch { /* */ }
    }
  }, 800);
}

/**
 * Een back-up van alles (alle omgevingen): voorraad, artikels, beurzen, transacties en de gedeelde
 * instellingen. Supabase gratis maakt zelf geen back-ups. Foto's bij aankopen zitten niet in dit bestand:
 * die staan in de dagstaten (pdf).
 */
export function backup() {
  const alles = alleRijen();
  return {
    soort: "bindr-backup", versie: 1, op: new Date().toISOString(), appVersie: APP_VERSIE,
    omgevingen: state.omgevingen, instagram: state.instagram, boekhouding: state.boekhouding,
    prijsregels: (({ drempels, conditiefactoren, nakijkenAfwijking, inkoopPct, ruilPct }) => ({ drempels, conditiefactoren, nakijkenAfwijking, inkoopPct, ruilPct }))(state.instellingen),
    aantallen: { exemplaren: alles.exemplaren.length, artikelen: alles.artikelen.length, beurzen: alles.beurzen.length, transacties: alles.transacties.length },
    ...alles,
  };
}

/** Wat een kopie bijhoudt: de voorraad en wat de laatste maanden gebeurde (genoeg voor een beurs zonder internet). */
export const KOPIE_DAGEN = 120;
export function kopieVan(alles: Alles, nu = Date.now()) {
  const grens = nu - KOPIE_DAGEN * 86400000;
  const recent = (iso?: string | null) => !!iso && Date.parse(iso) >= grens;
  // Zonder foto's (die zijn groot en komen terug van de server): zo blijft er plaats voor de wachtrij.
  return {
    op: new Date(nu).toISOString(), gedeeltelijk: true,
    beurzen: alles.beurzen,
    artikelen: alles.artikelen.map(({ foto: _f, ...a }) => a),
    exemplaren: alles.exemplaren.filter((e) => inVoorraad(e) || recent(e.gewijzigd_op) || recent(e.afgeboekt_op)).map((e) => (e.foto ? { ...e, foto: undefined } : e)),
    transacties: alles.transacties.filter((t) => recent(t.tijd)),
    omgevingen: state.omgevingen, omgeving: state.omgeving, serverTijd,
  };
}
function leesKopie(b: Backend) {
  try {
    const k = JSON.parse(localStorage.getItem(kopieSleutel(b)) || "null");
    return k && Array.isArray(k.exemplaren) ? k : null;
  } catch {
    return null;
  }
}

// ── Wachtrij: wijzigingen die nog naar de server moeten ─────────────────────
type Op =
  | { soort: "exemplarenNieuw"; rijen: NieuwExemplaar[] }
  | { soort: "exemplaarWijzig"; id: string; wijziging: Partial<Exemplaar> }
  | { soort: "exemplarenWijzig"; ids: string[]; wijziging: Partial<Exemplaar> }
  | { soort: "artikelenNieuw"; rijen: NieuwArtikel[] }
  | { soort: "artikelWijzig"; id: string; wijziging: Partial<Artikel> }
  | { soort: "beurs"; beurs: Beurs }
  | { soort: "beursWeg"; id: string }
  | { soort: "beursGepland"; id: string; w: Pick<Beurs, "naam" | "datum" | "locatie" | "uren" | "link"> }
  | { soort: "transactie"; t: Transactie }
  | { soort: "ongedaan"; id: string }
  | { soort: "conflictOplossen"; id: string; oud: string; nieuw: string }
  | { soort: "conflictAanvaarden"; id: string; item: string }
  | { soort: "tegenpartij"; id: string; tegenpartij: Tegenpartij | null }
  | { soort: "aankoopfoto"; f: Aankoopfoto }
  | { soort: "aankoopfotoWeg"; id: string }
  | { soort: "artikelfoto"; f: Artikelfoto }
  | { soort: "artikelfotoWeg"; id: string }
  | { soort: "etalage"; f: Etalagefoto }
  | { soort: "etalageWijzig"; id: string; w: Partial<Pick<Etalagefoto, "titel" | "link" | "volgorde">> }
  | { soort: "etalageWeg"; id: string }
  | { soort: "thema"; t: Thema }
  | { soort: "aanvraagStatus"; id: string; status: AanvraagStatus }
  | { soort: "aanvraagWeg"; id: string }
  | { soort: "instelling"; sleutel: string; waarde: unknown }
  | { soort: "prijzen"; omgeving: string | null; lijst: PrijsMarkering[] }
  | { soort: "omgeving"; omgeving: Omgeving };

interface Wachtend { nr: number; op: Op }
let rij: Wachtend[] = [];
let rijNr = 0;
const rijSleutel = (b: Backend) => `bindr-wachtrij-v1-${b.soort}-${b.gebruikerId() ?? "?"}`;

function laadRij(b: Backend) {
  try { rij = JSON.parse(localStorage.getItem(rijSleutel(b)) || "[]"); } catch { rij = []; }
  rijNr = rij.reduce((m, w) => Math.max(m, w.nr), 0);
  zet({ wachtrij: rij.length });
}
function bewaarRij() {
  const b = state.backend;
  if (b) {
    try {
      localStorage.setItem(rijSleutel(b), JSON.stringify(rij));
    } catch {
      // Toestel vol: de kopie van de voorraad mag weg (die komt terug van de server), de wachtrij niet.
      try { localStorage.removeItem(kopieSleutel(b)); localStorage.setItem(rijSleutel(b), JSON.stringify(rij)); } catch {
        meld("Het geheugen van deze gsm is vol: wat nog moet doorgaan, staat enkel in de app. Sluit de app niet tot er internet is.", "fout", undefined, 12000);
      }
    }
  }
  zet({ wachtrij: rij.length });
}
function inRij(op: Op) {
  rij.push({ nr: ++rijNr, op });
  bewaarRij();
  void spoel();
}

async function voerUit(op: Op) {
  const b = state.backend!;
  switch (op.soort) {
    case "exemplarenNieuw": await b.voegExemplarenToe(op.rijen); break;
    case "exemplaarWijzig": await b.wijzigExemplaar(op.id, op.wijziging); break;
    case "exemplarenWijzig": await b.wijzigExemplaren(op.ids, op.wijziging); break;
    case "artikelenNieuw": await b.voegArtikelenToe(op.rijen); break;
    case "artikelWijzig": await b.wijzigArtikel(op.id, op.wijziging); break;
    case "beurs": await b.bewaarBeurs(op.beurs); break;
    case "beursWeg": await b.verwijderBeurs(op.id); break;
    case "beursGepland": await b.wijzigGeplandeBeurs(op.id, op.w); break;
    case "instelling": await b.bewaarInstelling(op.sleutel, op.waarde); break;
    case "prijzen": await b.markeerPrijzen(op.omgeving, op.lijst); break;
    case "omgeving": await b.bewaarOmgeving(op.omgeving); break;
    case "transactie": {
      const t = await b.boekTransactie(op.t);
      const lokaal = state.transacties.find((x) => x.id === t.id) ?? buiten.transacties.find((x) => x.id === t.id);
      vervangTransactie({ ...lokaal, ...t });
      if (t.status === "conflict" && lokaal?.status !== "conflict") {
        meld("Conflict bij het doorsturen: een exemplaar was al weg. Kijk het na in de kassa.", "fout", { label: "Bekijk", doe: () => openTransactie(t.id) }, 9000);
        nodigHerladen = true;
      }
      break;
    }
    case "ongedaan": vervangTransactie(await b.maakOngedaan(op.id)); break;
    case "conflictOplossen": vervangTransactie(await b.losConflictOp(op.id, op.oud, op.nieuw)); break;
    case "conflictAanvaarden": vervangTransactie(await b.aanvaardConflict(op.id, op.item)); break;
    case "tegenpartij": await b.zetTegenpartij(op.id, op.tegenpartij); break;
    case "aankoopfoto": await b.bewaarAankoopfoto(op.f); break;
    case "aankoopfotoWeg": await b.verwijderAankoopfoto(op.id); break;
    case "artikelfoto": await b.bewaarArtikelfoto(op.f); break;
    case "artikelfotoWeg": await b.verwijderArtikelfoto(op.id); break;
    case "etalage": await b.bewaarEtalage(op.f); break;
    case "etalageWijzig": await b.wijzigEtalage(op.id, op.w); break;
    case "etalageWeg": await b.verwijderEtalage(op.id); break;
    case "thema": await b.bewaarThema(op.t); break;
    case "aanvraagStatus": await b.zetAanvraagStatus(op.id, op.status); break;
    case "aanvraagWeg": await b.verwijderAanvraag(op.id); break;
  }
}

let spoelen = false;
let nodigHerladen = false;
let blokMelding = false;
let opnieuwTimer: ReturnType<typeof setTimeout> | null = null;

/** Stuurt de wachtrij door, in volgorde. Stopt bij een netwerkfout en probeert later opnieuw. */
export async function spoel(): Promise<boolean> {
  if (spoelen || !state.backend) return false;
  spoelen = true;
  let gelukt = true;
  try {
    while (rij.length) {
      const w = rij[0];
      try {
        await voerUit(w.op);
      } catch (e) {
        const status = (e as { status?: number }).status;
        if (isNetwerkFout(e) || status === 401 || status === 403 || status === 404 || (status ?? 0) >= 500) {
          // Geen verbinding, sessie verlopen, database nog niet bijgewerkt of serverfout:
          // niets weggooien, later opnieuw proberen.
          if (sessieVerlopen()) { naarLoginNaVerlopen(); gelukt = false; return false; }
          if (isNetwerkFout(e)) zet({ online: false });
          else if (!blokMelding) { blokMelding = true; fout(new Error(`Wijzigingen wachten: ${e instanceof Error ? e.message : String(e)}`)); }
          if (opnieuwTimer) clearTimeout(opnieuwTimer);
          opnieuwTimer = setTimeout(() => void spoel(), 20000);
          gelukt = false;
          return false;
        }
        // De server weigert deze ene wijziging (ongeldige gegevens): niet blijven proberen, wel melden.
        fout(new Error(`Niet bewaard: ${e instanceof Error ? e.message : String(e)}`));
        nodigHerladen = true;
      }
      rij.shift();
      bewaarRij();
    }
    if (!state.online) zet({ online: true });
    blokMelding = false;
    return true;
  } finally {
    spoelen = false;
    if (gelukt && nodigHerladen && !rij.length && state.fase === "klaar") {
      nodigHerladen = false;
      void herlaad();
    }
  }
}

/** Staat er voor deze transactie nog een borderel in de wachtrij? Dan is dat de nieuwste versie. */
function wachtendeTegenpartij(id: string): { tegenpartij: Transactie["tegenpartij"] } | null {
  for (let i = rij.length - 1; i >= 0; i--) {
    const op = rij[i].op;
    if (op.soort === "tegenpartij" && op.id === id) return { tegenpartij: op.tegenpartij };
  }
  return null;
}

function vervangTransactie(t: Transactie) {
  const wacht = wachtendeTegenpartij(t.id);
  if (wacht) t = { ...t, tegenpartij: wacht.tegenpartij };
  // Een transactie van een andere omgeving (geboekt vóór je wisselde) blijft daar.
  if (buiten.transacties.some((x) => x.id === t.id)) {
    buiten = { ...buiten, transacties: buiten.transacties.map((x) => (x.id === t.id ? { ...x, ...t } : x)) };
    bewaarKopieLater();
    return;
  }
  if (!hoortHier(t) && !state.transacties.some((x) => x.id === t.id)) {
    buiten = { ...buiten, transacties: [...buiten.transacties, t] };
    bewaarKopieLater();
    return;
  }
  const i = state.transacties.findIndex((x) => x.id === t.id);
  zet({ transacties: i < 0 ? [...state.transacties, t] : state.transacties.map((x) => (x.id === t.id ? t : x)) });
}

/** Werd de sessie op de server ingetrokken (bv. een nieuw wachtwoord op een andere gsm)? */
const sessieVerlopen = () => state.backend?.soort === "supabase" && (state.backend as SupabaseBackend).verlopen;

/** Opnieuw inloggen; de wachtrij blijft op het toestel en gaat door na de login. */
function naarLoginNaVerlopen() {
  void state.backend?.logUit(); // de oude sessie van dit toestel opruimen
  // Een pincode van dit toestel mag blijven (na het inloggen met je wachtwoord volstaat ze weer). Een oude
  // pincode (van vóór 0.11 ook het wachtwoord) gaat weg.
  if (isOudePin(leesPin())) wisPin();
  wachtend = null;
  zet({ backend: null, fase: "login", open: null });
  meld("Je sessie is verlopen. Log opnieuw in met je e-mail en wachtwoord; wat nog moest doorgaan, blijft bewaard.", "fout", undefined, 9000);
}

// ── Start, login, demo ───────────────────────────────────────────────────────
/** Wachtrij doorsturen en daarna de verse toestand ophalen. */
export async function synchroniseer() {
  if (await spoel()) await herlaad();
}

let gestart = false;
let wachtend: Backend | null = null; // ingelogd, maar nog vergrendeld of zonder pincode

export async function start() {
  if (!gestart && typeof window !== "undefined") {
    gestart = true;
    window.addEventListener("online", () => { zet({ online: true }); void synchroniseer(); });
    window.addEventListener("offline", () => zet({ online: false }));
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        // Weg uit de app: de 10 minuten tellen vanaf nu (tenzij ze al voorbij waren).
        if (state.fase === "klaar") { if (moetVergrendelen()) vergrendel(); else markeerActief(); }
        return;
      }
      if (state.fase === "klaar" && moetVergrendelen()) return vergrendel();
      if (state.fase === "wachtwoord" && wachtwoordStapVerlopen()) return void stopWachtwoordStap();
      if (state.fase === "klaar") void synchroniseer();
    });
    // Elke tik of toets telt als "bezig": pas na 10 minuten niets doen vraagt de app de pincode opnieuw.
    let laatsteTik = 0;
    const bezigMet = () => {
      if (state.fase !== "klaar" || Date.now() - laatsteTik < 30000) return;
      laatsteTik = Date.now();
      markeerActief();
    };
    window.addEventListener("pointerdown", bezigMet, { passive: true });
    window.addEventListener("keydown", bezigMet, { passive: true });
    // Ook als de gsm open op tafel ligt: na 10 minuten zonder tik vergrendelen.
    setInterval(() => {
      if (state.fase === "klaar" && moetVergrendelen()) vergrendel();
      // Ook het scherm voor een nieuw wachtwoord blijft niet open liggen (het kent je huidige wachtwoord).
      if (state.fase === "wachtwoord" && wachtwoordStapVerlopen()) void stopWachtwoordStap();
    }, 30000);
    // Samen werken: om de 30 seconden ophalen wat de anderen deden, om de minuut melden dat je er bent.
    setInterval(() => {
      if (document.visibilityState === "visible" && state.fase === "klaar" && state.backend?.soort === "supabase") void haalWijzigingen();
    }, 30000);
    setInterval(() => {
      if (document.visibilityState === "visible" && state.fase === "klaar" && state.backend?.soort === "supabase") void meldAanwezig();
    }, 60000);
  }
  // De link uit een herstelmail (wachtwoord vergeten): een nieuw wachtwoord kiezen. Een verlopen of al gebruikte
  // link komt terug als #error=…&error_code=otp_expired.
  if (typeof location !== "undefined" && /type=recovery/.test(location.hash)) return herstelVanLink(location.hash);
  if (typeof location !== "undefined" && /error_code=/.test(location.hash)) {
    try { history.replaceState(null, "", location.pathname + location.search); } catch { /* */ }
    meld("Deze link is verlopen of al gebruikt. Vraag op het inlogscherm een nieuwe mail.", "fout", undefined, 12000);
  }
  const modus = localStorage.getItem(MODUS);
  if (modus === "demo") return gebruik(new DemoBackend());
  const backend = SupabaseBackend.herstel();
  if (!backend) return zet({ fase: "login" });
  const pin = leesPin();
  wachtend = backend;
  laadRij(backend); // zodat uitloggen vanop het slotscherm weet wat er nog moet doorgaan
  if (!pin || pin.user_id !== backend.gebruikerId()) {
    // Geen pincode op dit toestel (bv. "Later" gekozen): niet zomaar open laten, opnieuw inloggen.
    // De wachtrij blijft bewaard en gaat door na de login.
    wachtend = null;
    await backend.logUit();
    return zet({ fase: "login" });
  }
  // Te veel foute pincodes, maar de app werd afgesloten voor de sessie weg was: alsnog weg.
  if (teVeelPogingen()) return wisNaTeVeelPogingen();
  if (isOudePin(pin)) markeerZwak(backend.gebruikerId());
  if (isVergrendeld()) return zet({ fase: "slot", backend: null });
  if (moetNieuwWachtwoord(backend)) return naarWachtwoord(backend, { huidig: null, pin: null, reden: isOudePin(pin) ? "oud" : "zwak" });
  await gebruik(backend);
}

// ── Pincode en wachtwoord ───────────────────────────────────────────────────
// Het wachtwoord van het account vraagt de app enkel bij het inloggen (nieuwe gsm, sessie verlopen, na
// uitloggen). De pincode opent de app op dit toestel en gaat nooit naar de server (lib/pin.ts).

/** De pincode op dit toestel, enkel als ze van wie nu ingelogd is. */
function eigenPin(b: Backend | null = state.backend ?? wachtend) {
  const p = leesPin();
  return p && b && p.user_id === b.gebruikerId() ? p : null;
}

const moetVergrendelen = () => state.backend?.soort === "supabase" && !!eigenPin() && isVergrendeld();

function vergrendel() {
  if (state.backend?.soort !== "supabase") return;
  wachtend = state.backend;
  zet({ fase: "slot", open: null });
}

/**
 * Voor het verplichte nieuwe wachtwoord (fase "wachtwoord"), enkel in het geheugen: het huidige wachtwoord als
 * het net ingetypt werd (de oude pincode die ook het wachtwoord was, of een zwak wachtwoord bij het inloggen;
 * anders vraagt het scherm het), de pincode die daarna de pincode van dit toestel wordt, en sinds wanneer
 * (na 10 minuten vergeet de app het huidige wachtwoord en gaat ze op slot).
 */
let nieuwWachtwoord: { huidig: string | null; pin: string | null; reden: "oud" | "zwak" | "herstel"; sinds: number } | null = null;

/** Waarom de app een nieuw wachtwoord vraagt (voor de uitleg op het scherm). */
export const redenNieuwWachtwoord = () => nieuwWachtwoord?.reden ?? null;
/** Moet het scherm het huidige wachtwoord vragen? (niet na een herstelmail, niet als het net ingetypt werd) */
export const vraagHuidigWachtwoord = () => !!nieuwWachtwoord && nieuwWachtwoord.reden !== "herstel" && nieuwWachtwoord.huidig === null;

// Weet dit toestel dat het wachtwoord van deze gebruiker nog zwak is (de oude pincode)? Dan vraagt de app een
// nieuw, ook na herladen of als iemand intussen enkel de pincode wijzigde. Weg zodra het nieuwe bewaard is.
const ZWAK_WACHTWOORD = "bindr-zwak-wachtwoord-v1";
function markeerZwak(id: string | null) { if (id) try { localStorage.setItem(ZWAK_WACHTWOORD, id); } catch { /* */ } }
function wisZwak() { try { localStorage.removeItem(ZWAK_WACHTWOORD); } catch { /* */ } }
const zwakVoor = (id: string | null) => { try { return !!id && localStorage.getItem(ZWAK_WACHTWOORD) === id; } catch { return false; } };
/** Enkel met internet: zonder gaat de app gewoon open en vraagt ze het de volgende keer. */
const moetNieuwWachtwoord = (b: Backend) => b.soort === "supabase" && zwakVoor(b.gebruikerId()) && navigator.onLine !== false;

function naarWachtwoord(b: Backend, w: Omit<NonNullable<typeof nieuwWachtwoord>, "sinds">) {
  nieuwWachtwoord = { ...w, sinds: Date.now() };
  wachtend = b;
  zet({ fase: "wachtwoord", open: null });
}

const wachtwoordStapVerlopen = () => !!nieuwWachtwoord && Date.now() - nieuwWachtwoord.sinds > VERGRENDEL_NA_MS;

/** Te lang op het scherm voor een nieuw wachtwoord: het huidige vergeten, op slot (of opnieuw inloggen). */
async function stopWachtwoordStap() {
  const b = state.backend ?? wachtend;
  nieuwWachtwoord = null;
  if (b && eigenPin(b)) {
    wachtend = b;
    zet({ fase: "slot", open: null });
  } else {
    await afmelden();
    meld("Te lang gewacht. Log opnieuw in.", "info");
  }
}

/** Verder na het slot of de login: eerst nog een sterk wachtwoord of een pincode, dan de app. */
async function verder(b: Backend, o: { oudMag?: boolean; later?: boolean } = {}) {
  markeerActief();
  if (!o.later && moetNieuwWachtwoord(b)) return naarWachtwoord(b, { huidig: null, pin: null, reden: "zwak" });
  const p = eigenPin(b);
  if (!p || (!o.oudMag && isOudePin(p))) {
    wachtend = b;
    return zet({ fase: "pin" });
  }
  if (state.backend === b && state.exemplaren.length + state.artikelen.length + state.beurzen.length > 0) {
    wachtend = null;
    zet({ fase: "klaar" });
    void synchroniseer();
  } else {
    await gebruik(b);
  }
}

/** Een pincode nagaan (slot, of eerst de huidige bij wijzigen). Na 10 foute weg met de sessie van deze gsm. */
export async function controleerEigenPin(pin: string): Promise<boolean> {
  if (await controleerPin(pin)) return true;
  if (teVeelPogingen()) await wisNaTeVeelPogingen();
  return false;
}

/** De pincode op dit toestel: ontgrendelt de app (ook zonder internet). */
export async function ontgrendel(pin: string): Promise<boolean> {
  const p = eigenPin();
  if (!p) { await logUit(); return false; }
  if (!(await controleerEigenPin(pin))) return false;
  const b = state.backend ?? wachtend;
  if (!b) { await logUit(); return false; }
  // Een pincode van vóór 0.11 was ook het wachtwoord: eerst een sterk wachtwoord (zonder internet de volgende keer).
  if (isOudePin(p)) markeerZwak(b.gebruikerId());
  if (moetNieuwWachtwoord(b)) {
    markeerActief();
    naarWachtwoord(b, isOudePin(p) ? { huidig: pin, pin, reden: "oud" } : { huidig: null, pin: null, reden: "zwak" });
    return true;
  }
  await verder(b, { oudMag: true });
  return true;
}

/** Na 10 foute pincodes: de sessie van deze gsm weg. Wat nog moest doorgaan, blijft bewaard tot de volgende login. */
async function wisNaTeVeelPogingen() {
  await afmelden();
  meld("Te veel foute pincodes. Log opnieuw in met je e-mail en wachtwoord; wat nog moest doorgaan, blijft bewaard.", "fout", undefined, 12000);
}

/** Inloggen met e-mail en wachtwoord (nieuwe gsm, sessie verlopen of na uitloggen). */
export async function logInMetWachtwoord(email: string, wachtwoord: string) {
  const b = await SupabaseBackend.logIn(email, wachtwoord);
  localStorage.setItem(MODUS, "supabase");
  wisPogingen(); // met het wachtwoord bewezen wie je bent: de foute pincodes van daarvoor tellen niet meer
  const id = b.gebruikerId();
  if (leesPin() && leesPin()!.user_id !== id) wisPin(); // de pincode van iemand anders hoort hier niet
  wachtend = b;
  if (wachtwoordFout(wachtwoord, email)) {
    markeerZwak(id);
    // Was het wachtwoord de oude pincode (6 cijfers), dan wordt die daarna de pincode van deze gsm,
    // tenzij hier al een eigen pincode is.
    const p = eigenPin(b);
    const pin = /^\d{6}$/.test(wachtwoord) && (!p || isOudePin(p)) ? wachtwoord : null;
    return naarWachtwoord(b, { huidig: wachtwoord, pin, reden: pin ? "oud" : "zwak" });
  }
  // Een sterk wachtwoord: niets meer te vragen. Een oude pincode (het oude wachtwoord) heeft geen zin meer.
  if (zwakVoor(id)) wisZwak();
  if (isOudePin(eigenPin(b))) wisPin();
  await verder(b);
}

/** Wachtwoord vergeten: een herstelmail. De link opent het beheer en vraagt een nieuw wachtwoord. */
export async function stuurHerstelmail(email: string) {
  const terug = new URL(BEHEER_PAD, location.href).href.replace(/[?#].*$/, "");
  await SupabaseBackend.stuurHerstelmail(email, terug);
}

async function herstelVanLink(hash: string) {
  // De tokens meteen uit de adresbalk (en de geschiedenis) halen.
  try { history.replaceState(null, "", location.pathname + location.search); } catch { /* */ }
  try {
    const b = await SupabaseBackend.vanHerstellink(hash);
    if (!b) return zet({ fase: "login" });
    localStorage.setItem(MODUS, "supabase");
    if (leesPin()?.user_id !== b.gebruikerId()) wisPin();
    naarWachtwoord(b, { huidig: null, pin: null, reden: "herstel" });
  } catch (e) {
    zet({ fase: "login" });
    meld(e instanceof Error ? e.message : String(e), "fout", undefined, 9000);
  }
}

/** Na een nieuw wachtwoord: een oude pincode is niet langer het wachtwoord en blijft de pincode van deze gsm. */
async function naNieuwWachtwoord(b: Backend, pin: string | null) {
  wisZwak();
  const p = eigenPin(b);
  if (p && isOudePin(p)) maakPinVanToestel();
  else if (!p && pin) await bewaarPin((b as SupabaseBackend).sessieInfo(), pin);
}

/** Het verplichte nieuwe wachtwoord (fase "wachtwoord"). `huidig` = wat de gebruiker intypte als het scherm erom vroeg. */
export async function kiesWachtwoord(nieuw: string, huidig?: string) {
  const b = (state.backend?.soort === "supabase" ? state.backend : wachtend) as SupabaseBackend | null;
  if (!b || !nieuwWachtwoord) throw new Error("Log eerst in");
  if (wachtwoordStapVerlopen()) { await stopWachtwoordStap(); return; }
  const fout = wachtwoordFout(nieuw, b.sessieInfo().email);
  if (fout) throw new Error(fout);
  const w = nieuwWachtwoord;
  const oud = w.reden === "herstel" ? null : (w.huidig ?? huidig ?? "");
  if (oud === "") throw new Error("Vul eerst je huidige wachtwoord in.");
  try {
    await b.wijzigWachtwoord(oud, nieuw);
  } catch (e) {
    // De oude pincode werkt niet meer als wachtwoord: op een andere gsm koos iemand al een nieuw wachtwoord.
    if (w.reden === "oud" && w.huidig !== null && e instanceof Fout && e.status === 400 && /klopt niet/.test(e.message)) {
      nieuwWachtwoord = null;
      wisZwak();
      wisPin();
      wachtend = null;
      void b.logUit();
      zet({ backend: null, fase: "login", open: null });
      meld("Je wachtwoord werd al aangepast, misschien op een andere gsm. Log in met je nieuwe wachtwoord.", "fout", undefined, 9000);
      return;
    }
    throw e;
  }
  nieuwWachtwoord = null;
  await naNieuwWachtwoord(b, w.pin);
  meld("Nieuw wachtwoord bewaard. Je andere gsm's vragen het bij de volgende keer.");
  await verder(b, { oudMag: true });
}

/** Geen internet bij het verplichte wachtwoord: de app toch openen (hij vraagt het de volgende keer). */
export async function wachtwoordLater() {
  const b = state.backend ?? wachtend;
  if (!b || !nieuwWachtwoord || nieuwWachtwoord.reden === "herstel") return;
  const { pin } = nieuwWachtwoord;
  nieuwWachtwoord = null;
  // De oude pincode blijft voorlopig de pincode van deze gsm; het zwakke wachtwoord blijft gemarkeerd.
  if (pin && !eigenPin(b)) await bewaarPin((b as SupabaseBackend).sessieInfo(), pin);
  await verder(b, { oudMag: true, later: true });
}

/** Een nieuw wachtwoord vanuit Profiel: eerst het huidige. */
export async function wijzigWachtwoord(huidig: string, nieuw: string) {
  const b = state.backend;
  if (!b || b.soort !== "supabase") throw new Error("In de demo is er geen wachtwoord.");
  const fout = wachtwoordFout(nieuw, (b as SupabaseBackend).sessieInfo().email);
  if (fout) throw new Error(fout);
  await b.wijzigWachtwoord(huidig, nieuw);
  await naNieuwWachtwoord(b, null);
  markeerActief();
  meld("Nieuw wachtwoord bewaard. Je andere gsm's vragen het bij de volgende keer.");
}

/** Een pincode voor dit toestel kiezen of wijzigen (ook zonder internet). */
export async function kiesPincode(pin: string, huidige?: string) {
  const b = state.backend ?? wachtend;
  if (!b || b.soort !== "supabase") throw new Error("Log eerst in");
  // Wie de gsm even vasthoudt, mag de pincode niet zomaar veranderen (ook een oude pincode niet).
  if (eigenPin(b) && !(huidige && (await controleerEigenPin(huidige)))) throw new Error("Je huidige pincode klopt niet.");
  const f = pinFout(pin);
  if (f) throw new Error(f);
  // Was de oude pincode ook het wachtwoord, dan blijft het wachtwoord zwak tot er een nieuw is.
  if (isOudePin(eigenPin(b))) markeerZwak(b.gebruikerId());
  await bewaarPin((b as SupabaseBackend).sessieInfo(), pin);
  markeerActief();
  if (state.fase === "klaar") meld("Nieuwe pincode bewaard");
  else await verder(b);
}

/** Zonder pincode verder (enkel tot de volgende keer dat de app start). */
export async function pincodeLater() {
  if (wachtend) await gebruik(wachtend);
}

/** Heeft dit toestel een eigen pincode voor wie ingelogd is? */
export const heeftEigenPin = () => !!eigenPin();

/** Wie dit toestel gebruikt (voor het slotscherm). */
export const pinGebruiker = () => eigenPin();

/** Het e-mailadres van wie inlogt (om een wachtwoordmanager het juiste account te laten bewaren). */
export const ingelogdEmail = () => {
  const b = state.backend ?? wachtend;
  return b?.soort === "supabase" ? (b as SupabaseBackend).sessieInfo().email : "";
};

async function gebruik(backend: Backend) {
  zet({ backend, fase: "laden" });
  wachtend = null;
  laadRij(backend);
  zet({ prijscheckOp: leesJson<{ datum: string | null }>(PRIJSCHECK + backend.soort, { datum: null }).datum });
  try {
    // Eerst de omgevingen: daaruit volgt ook welke versie van de database er draait.
    const omgevingen = await backend.laadOmgevingen(); // een oude database (404) geeft [], andere fouten stoppen hier
    const gekozen = (() => { try { return JSON.parse(localStorage.getItem(omgevingSleutel(backend)) || "null") as string | null; } catch { return null; } })();
    const omgeving = omgevingen.find((o) => o.id === gekozen)?.id ?? omgevingen[0]?.id ?? null;
    zet({ omgevingen, omgeving, mandje: leesMandje(omgeving, omgevingen) });
    await spoel();
    const [alles, gids, beheerders, gedeeld] = await Promise.all([
      backend.laadAlles(), laadPrijsgids(), backend.laadBeheerders().catch(() => []), backend.laadInstellingen().catch(() => null),
    ]);
    serverTijd = laatsteTijd(alles);
    laatsteVolledig = Date.now();
    zet({ ...splits(alles), gids, beheerders: Object.fromEntries(beheerders.map((b) => [b.user_id, b.naam])), fase: "klaar", gedeeltelijk: false, bijgewerktOp: new Date().toISOString() });
    // Loopt er een beurs? Dan opent de app op de kassa (tenzij een ander tabblad gevraagd werd).
    if (typeof location !== "undefined" && !location.hash && state.beurzen.some((b) => b.status === "actief")) zet({ tab: "kassa" });
    // Mislukt het laden van de gedeelde instellingen, dan niets overschrijven (anders wist de volgende wijziging alles).
    if (gedeeld) pasGedeeldToe(gedeeld);
    bewaarKopieLater();
    void meldAanwezig();
    void laadAanvragen();
    if ((backend as { schemaOud?: boolean }).schemaOud) {
      meld("De database is nog niet bijgewerkt voor de kassa. Voer supabase/schema.sql opnieuw uit in Supabase.", "fout", undefined, 15000);
    } else if (backend.soort === "supabase" && ((backend as SupabaseBackend).versie ?? 4) < 4) {
      meld("De database is nog niet bijgewerkt (omgevingen, artikels, graded). Voer supabase/schema.sql opnieuw uit in Supabase.", "fout", undefined, 15000);
    }
  } catch (e) {
    const kopie = backend.soort === "supabase" && isNetwerkFout(e) ? leesKopie(backend) : null;
    if (kopie) {
      const gids = await laadPrijsgids();
      const omgevingen: Omgeving[] = kopie.omgevingen ?? [];
      const omgeving: string | null = kopie.omgeving ?? omgevingen[0]?.id ?? null;
      serverTijd = kopie.serverTijd ?? null;
      zet({ omgevingen, omgeving, mandje: leesMandje(omgeving, omgevingen) });
      zet({
        ...splits({
          exemplaren: kopie.exemplaren.map(schoonExemplaar), artikelen: (kopie.artikelen ?? []).map(schoonArtikel),
          beurzen: kopie.beurzen ?? [], transacties: kopie.transacties ?? [],
        }),
        gids, fase: "klaar", online: false, gedeeltelijk: !!kopie.gedeeltelijk,
      });
      meld("Geen verbinding: je werkt met de voorraad op dit toestel (en de laatste maanden historiek). Wijzigingen gaan door zodra er internet is.", "info", undefined, 7000);
      return;
    }
    fout(e);
    zet({ fase: backend.soort === "demo" ? "klaar" : "login", backend: backend.soort === "demo" ? backend : null });
  }
}

/** Het mandje van een omgeving (het oude, gedeelde mandje gaat naar de eerste omgeving). */
function leesMandje(omgeving: string | null, omgevingen: Omgeving[]): Mandje {
  const eigen = leesJson<Mandje | null>(mandjeSleutel(omgeving), null);
  if (eigen) return eigen;
  return omgeving === omgevingen[0]?.id || !omgeving ? leesJson<Mandje>(MANDJE, { regels: [] }) : { regels: [] };
}

function pasGedeeldToe(g: Record<string, unknown>) {
  const pr = g.prijsregels as Partial<Instellingen> | undefined;
  const deel: Partial<State> = {
    instagram: typeof g.instagram === "string" && g.instagram ? g.instagram : INSTAGRAM,
    facebook: typeof g.facebook === "string" ? g.facebook : FACEBOOK,
    bedrijfPubliek: g.bedrijf_publiek && typeof g.bedrijf_publiek === "object" ? g.bedrijf_publiek as BedrijfPubliek : null,
    aanvraagSleutel: typeof g.aanvraag_sleutel === "string" && g.aanvraag_sleutel ? g.aanvraag_sleutel : null,
    instagramFeed: typeof g.instagram_feed === "string" && g.instagram_feed ? g.instagram_feed : null,
  };
  const bedrijven: Record<string, Bedrijf> = {};
  const ingegeven: Record<string, Record<string, boolean>> = {};
  for (const [k, v] of Object.entries(g)) {
    // dexxter:<omgeving>:<dag> = true/false (één rij per dag: zo overschrijven twee gsm's elkaar niet)
    const dag = /^dexxter:(.+):(\d{4}-\d{2}-\d{2})$/.exec(k);
    if (dag) { if (v === true) (ingegeven[dag[1]] ??= {})[dag[2]] = true; continue; }
    if (!v || typeof v !== "object" || Array.isArray(v)) continue;
    if (k.startsWith("bedrijf:")) bedrijven[k.slice(8)] = v as Bedrijf;
  }
  deel.boekhouding = { bedrijven, ingegeven };
  if (pr && Array.isArray(pr.drempels)) {
    const i = {
      ...state.instellingen, drempels: pr.drempels,
      conditiefactoren: pr.conditiefactoren ?? state.instellingen.conditiefactoren,
      nakijkenAfwijking: pr.nakijkenAfwijking ?? state.instellingen.nakijkenAfwijking,
      inkoopPct: typeof pr.inkoopPct === "number" ? pr.inkoopPct : state.instellingen.inkoopPct,
      ruilPct: typeof pr.ruilPct === "number" ? pr.ruilPct : state.instellingen.ruilPct,
    };
    schrijf(INSTELLINGEN, i);
    deel.instellingen = i;
  }
  zet(deel);
}

/** Enkel voor tests en de demo: inloggen met e-mail en wachtwoord zonder pincode-stap. */
export async function logIn(email: string, wachtwoord: string) {
  const b = await SupabaseBackend.logIn(email, wachtwoord);
  localStorage.setItem(MODUS, "supabase");
  await gebruik(b);
}

export async function startDemo() {
  localStorage.setItem(MODUS, "demo");
  await gebruik(new DemoBackend());
}

export async function logUit() {
  const b = state.backend ?? wachtend;
  if (b?.soort === "demo" && rij.length && !confirm(`Er wachten nog ${rij.length} wijzigingen. Toch stoppen?`)) return;
  if (b?.soort === "supabase" && rij.length
    && !confirm(`Er wachten nog ${rij.length} wijzigingen op internet. Ze blijven op deze gsm en gaan door zodra jij hier weer inlogt. Toch uitloggen?`)) return;
  await afmelden();
}

/** Uitloggen zonder te vragen: de sessie, de pincode en de kopie (tenzij er nog iets moet doorgaan) gaan weg. */
async function afmelden() {
  const b = state.backend ?? wachtend;
  nieuwWachtwoord = null;
  // Eerst alles op het toestel wissen (de sessie meteen, in logUit), pas daarna wachten op de server:
  // wie de app afsluit terwijl die nog bezig is, houdt zo toch geen sessie of pincode over.
  wisPin();
  const weg = b?.logUit();
  if (b?.soort === "demo") localStorage.removeItem(rijSleutel(b));
  // De kopie op het toestel (voorraad, aankoopprijzen) gaat weg, tenzij er nog iets moet doorgaan.
  if (b?.soort === "supabase" && !rij.length) try { localStorage.removeItem(kopieSleutel(b)); } catch { /* */ }
  rij = [];
  // Het mandje van elke omgeving leegmaken: de volgende gebruiker begint met een leeg mandje.
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith("bindr-mandje-")) localStorage.removeItem(k);
  } catch { /* */ }
  buiten = { exemplaren: [], artikelen: [], beurzen: [], transacties: [] };
  wachtend = null;
  localStorage.removeItem(MODUS);
  zet({
    backend: null, fase: "login", exemplaren: [], artikelen: [], beurzen: [], transacties: [], teWijzigen: new Map(), prijscheckOp: null,
    open: null, wachtrij: 0, mandje: { regels: [] }, omgevingen: [], omgeving: null, aanwezig: [], aanvragen: null,
  });
  artikelfotoCache.clear();
  etalageCache = null;
  themaCache = null;
  themasVolledig = false;
  themaLogosGeladen.clear();
  if (beheerThemaOpnieuw) clearTimeout(beheerThemaOpnieuw);
  beheerThemaOpnieuw = null;
  beheerThemaPogingen = 0;
  await weg?.catch(() => undefined);
}

// ── Samen werken: wijzigingen van de anderen en wie er bezig is ─────────────
let serverTijd: string | null = null; // de laatste wijziging die we van de server kennen

function laatsteTijd(a: Alles): string | null {
  let m: string | null = null;
  for (const lijst of [a.exemplaren, a.artikelen, a.beurzen, a.transacties] as { gewijzigd_op?: string | null }[][]) {
    for (const r of lijst) if (r.gewijzigd_op && (!m || r.gewijzigd_op > m)) m = r.gewijzigd_op;
  }
  return m;
}

let laatsteVolledig = 0;

/** Oude database (zonder kolom nieuw_hartje): de markeringen van de prijscheck blijven dan lokaal staan. */
function behoudMarkering(alles: Alles): Alles {
  const b = state.backend;
  if (!b || b.soort !== "supabase" || (b as SupabaseBackend).versie !== 2) return alles;
  const lokaal = new Map(alleRijen().exemplaren.filter((e) => e.nieuw_hartje != null).map((e) => [e.id, e.nieuw_hartje]));
  if (!lokaal.size) return alles;
  return { ...alles, exemplaren: alles.exemplaren.map((e) => (lokaal.has(e.id) && e.nieuw_hartje == null ? { ...e, nieuw_hartje: lokaal.get(e.id) } : e)) };
}

/**
 * Haalt enkel op wat sinds de vorige keer veranderde; om het half uur alles (ook wat verdween). Alles
 * ophalen kost het meeste dataverkeer (na een paar jaar enkele MB per keer), dus niet vaker dan nodig.
 */
const VOLLEDIG_OM = 30 * 60000;
async function haalWijzigingen() {
  const b = state.backend;
  if (!b || rij.length) return;
  if (!serverTijd || Date.now() - laatsteVolledig > VOLLEDIG_OM) return herlaad();
  try {
    // Een minuut overlap: een wijziging die net vóór de vorige keer begon maar later klaar was, valt er zo niet tussenuit.
    const sinds = new Date(Date.parse(serverTijd) - 60000).toISOString();
    const w = await b.laadWijzigingen(sinds);
    if (!w) return; // oude database: enkel de volledige herlaad om de 5 minuten
    if (rij.length) return;
    const n = w.exemplaren.length + w.artikelen.length + w.beurzen.length + w.transacties.length;
    zet({ bijgewerktOp: new Date().toISOString() });
    if (!n) return;
    const samen = <T extends { id: string }>(oud: T[], nieuw: T[]) => {
      const per = new Map(nieuw.map((x) => [x.id, x]));
      const uit = oud.map((x) => per.get(x.id) ?? x);
      const bekend = new Set(oud.map((x) => x.id));
      return [...uit, ...nieuw.filter((x) => !bekend.has(x.id))];
    };
    const alles = alleRijen();
    serverTijd = laatsteTijd(w) ?? serverTijd;
    zet({
      ...splits({
        exemplaren: samen(alles.exemplaren, w.exemplaren), artikelen: samen(alles.artikelen, w.artikelen),
        beurzen: samen(alles.beurzen, w.beurzen), transacties: samen(alles.transacties, w.transacties),
      }),
      online: true,
    });
  } catch (e) {
    if (sessieVerlopen()) naarLoginNaVerlopen();
    else if (isNetwerkFout(e)) zet({ online: false });
  }
}

/** Meldt dat je bezig bent (omgeving en scherm) en haalt op wie er nog bezig is. */
export async function meldAanwezig() {
  const b = state.backend;
  if (!b || b.soort !== "supabase" || state.fase !== "klaar") return;
  try {
    const lijst = await b.meldAanwezig(state.omgeving, state.tab);
    zet({ aanwezig: lijst });
  } catch { /* niet erg: volgende keer */ }
}

/** Haalt de verse toestand van de server (bv. wat andere toestellen deden). Enkel als de wachtrij leeg is. */
export async function herlaad() {
  if (!state.backend || rij.length) return;
  try {
    const [alles, omgevingen, gedeeld] = await Promise.all([
      state.backend.laadAlles(), state.backend.laadOmgevingen().catch(() => state.omgevingen), state.backend.laadInstellingen().catch(() => null),
    ]);
    if (rij.length) return; // ondertussen iets gewijzigd: volgende keer
    if (gedeeld) pasGedeeldToe(gedeeld);
    laatsteVolledig = Date.now();
    serverTijd = laatsteTijd(alles);
    if (omgevingen.length) {
      // Pas nu omgevingen (de database werd net bijgewerkt)? Kies er dan een.
      const omgeving = omgevingen.some((o) => o.id === state.omgeving) ? state.omgeving : omgevingen[0].id;
      zet({ omgevingen, omgeving });
    }
    zet({ ...splits(behoudMarkering(alles)), online: true, gedeeltelijk: false, bijgewerktOp: new Date().toISOString() });
    void laadAanvragen();
  } catch (e) {
    if (sessieVerlopen()) naarLoginNaVerlopen();
    else if (isNetwerkFout(e)) zet({ online: false }); else fout(e);
  }
}

export async function wisDemo() {
  DemoBackend.wis();
  localStorage.removeItem(PRIJSCHECK + "demo");
  buiten = { exemplaren: [], artikelen: [], beurzen: [], transacties: [] };
  if (state.backend) localStorage.removeItem(rijSleutel(state.backend));
  rij = [];
  zet({ mandje: { regels: [] } });
  await gebruik(new DemoBackend());
}

// ── Exemplaren ───────────────────────────────────────────────────────────────
function vervang(nieuw: Exemplaar[]) {
  const per = new Map(nieuw.map((e) => [e.id, e]));
  zet({ exemplaren: state.exemplaren.map((e) => per.get(e.id) || e) });
}

/** Voegt exemplaren toe (meteen zichtbaar; de server volgt via de wachtrij). */
export function voegToe(rijen: NieuwExemplaar[]): Exemplaar[] {
  if (!state.backend) throw new Error("Niet ingelogd");
  const codes = alleCodes();
  for (const r of rijen) {
    if (codes.has(r.code)) throw new Error(`Code ${toonCode(r.code)} bestaat al`);
    codes.add(r.code);
  }
  const nu = new Date().toISOString();
  const metId = rijen.map((r) => ({ ...r, id: r.id ?? uuid(), ...(state.omgeving ? { omgeving_id: state.omgeving } : {}) }));
  const nieuw = metId.map((r) => standaardExemplaar(r, nu));
  zet({ exemplaren: [...state.exemplaren, ...nieuw] });
  inRij({ soort: "exemplarenNieuw", rijen: metId });
  return nieuw;
}

/** Wijzigt één exemplaar; met `ongedaan` krijgt de melding een knop om terug te zetten. */
export function wijzig(id: string, wijziging: Partial<Exemplaar>, melding?: string, ongedaan = false): Exemplaar | undefined {
  const oud = state.exemplaren.find((e) => e.id === id);
  if (!oud) return;
  // Naar de vault: dan moet er ook geen nieuw hartje meer op.
  if (wijziging.opslag === "stockdoos" && oud.nieuw_hartje != null) wijziging = { ...wijziging, nieuw_hartje: null };
  const nieuw = metVitrineSinds(oud, { ...oud, ...wijziging, gewijzigd_op: new Date().toISOString() });
  vervang([nieuw]);
  inRij({ soort: "exemplaarWijzig", id, wijziging });
  if (melding) {
    const terug = Object.fromEntries(Object.keys(wijziging).map((k) => [k, oud[k as keyof Exemplaar]])) as Partial<Exemplaar>;
    meld(melding, "ok", ongedaan ? { label: "Ongedaan maken", doe: () => void wijzig(id, terug, "Teruggezet") } : undefined);
  }
  return nieuw;
}

export function wijzigVeel(ids: string[], wijziging: Partial<Exemplaar>) {
  if (!ids.length) return;
  const set = new Set(ids);
  zet({ exemplaren: state.exemplaren.map((e) => (set.has(e.id) ? metVitrineSinds(e, { ...e, ...wijziging }) : e)) });
  inRij({ soort: "exemplarenWijzig", ids, wijziging });
}

// ── Artikelen ────────────────────────────────────────────────────────────────
export function voegArtikelToe(r: NieuwArtikel): Artikel {
  const a = standaardArtikel({ ...r, id: r.id ?? uuid(), ...(state.omgeving ? { omgeving_id: state.omgeving } : {}) });
  zet({ artikelen: [...state.artikelen, a] });
  inRij({ soort: "artikelenNieuw", rijen: [a] });
  return a;
}
export function wijzigArtikel(id: string, w: Partial<Artikel>, melding?: string, reden: string | null = null) {
  const oud = state.artikelen.find((x) => x.id === id);
  // Nieuwe details (een formulier dat al open stond) mogen geen tellingen wissen: samenvoegen.
  if (oud && w.details && (oud.details?.tellingen?.length || w.details.tellingen?.length)) {
    const alle = [...(oud.details?.tellingen ?? []), ...(w.details.tellingen ?? [])];
    const uniek = alle.filter((x, i) => alle.findIndex((y) => y.op === x.op && y.delta === x.delta) === i).sort((a, b) => a.op.localeCompare(b.op));
    w = { ...w, details: { ...w.details, tellingen: uniek } };
  }
  // Een ander aantal buiten de kassa: het verschil komt in de tellingen (voor de voorraad op 31 december).
  if (oud && w.aantal != null && w.aantal !== oud.aantal) {
    const t = metTelling({ ...oud, details: w.details ?? oud.details }, w.aantal, reden);
    w = { ...w, ...t };
  }
  zet({ artikelen: state.artikelen.map((x) => (x.id === id ? { ...x, ...w } : x)) });
  inRij({ soort: "artikelWijzig", id, wijziging: w });
  if (melding) meld(melding);
}

// ── Testset ──────────────────────────────────────────────────────────────────
export async function importeerTestset() {
  if (!state.backend) return;
  zet({ bezig: "Testset inladen…" });
  try {
    const { exemplaren, artikelen } = await laadTestset();
    const bestaand = new Set(state.exemplaren.map((e) => e.code));
    let nieuw = exemplaren.filter((e) => !bestaand.has(e.code));
    // In de demo: "in de catalogus sinds" = de datum van het hartje, zodat "Nieuw binnen" klopt.
    // (Niet naar de echte database: die zet dat zelf.)
    if (state.backend.soort === "demo") {
      nieuw = nieuw.map((e) => (e.opslag === "vitrine" && e.hartjesdatum ? { ...e, vitrine_sinds: `${e.hartjesdatum}T12:00:00.000Z` } : e));
    }
    const ex = nieuw.length ? voegToe(nieuw) : [];
    let art = 0;
    if (!state.artikelen.length) for (const a of artikelen) { voegArtikelToe(a); art++; }
    meld(`${ex.length} exemplaren en ${art} artikelen ingeladen`);
  } catch (e) { fout(e); } finally { zet({ bezig: null }); }
}

// ── Prijzen nakijken ─────────────────────────────────────────────────────────
export async function doePrijscheck(): Promise<TeWijzigen[]> {
  zet({ bezig: "Prijzen nakijken…" });
  try {
    const gids = (await laadPrijsgids(true)) || state.gids;
    if (!gids) {
      meld("Er is nog geen prijsgids beschikbaar. Die komt elke nacht binnen.", "fout");
      return [];
    }
    const lijst = prijscheck(state.exemplaren, gids, state.instellingen);
    // Het resultaat gaat naar de database: zo zien alle toestellen dezelfde lijst, en de
    // klantenpagina verbergt kaarten tot hun nieuwe hartje erop zit.
    const per = new Map(lijst.map((t) => [t.id, t.nieuw]));
    zet({
      gids, prijscheckOp: vandaag(),
      exemplaren: state.exemplaren.map((e) => {
        const n = per.get(e.id) ?? null;
        return (e.nieuw_hartje ?? null) === n ? e : { ...e, nieuw_hartje: n };
      }),
    });
    if (state.backend) schrijf(PRIJSCHECK + state.backend.soort, { datum: vandaag() });
    inRij({ soort: "prijzen", omgeving: state.omgeving, lijst: lijst.map((t) => ({ id: t.id, nieuw: t.nieuw })) });
    meld(lijst.length ? `${lijst.length} ${lijst.length === 1 ? "hartje moet" : "hartjes moeten"} wisselen` : kies(HARTJES_OK), lijst.length ? "info" : "ok");
    return lijst;
  } finally { zet({ bezig: null }); }
}

export async function vernieuwPrijsgids() {
  zet({ bezig: "Prijsgids laden…" });
  try {
    const gids = await laadPrijsgids(true);
    if (gids) { zet({ gids }); meld(`Prijsgids van ${gids.datum} geladen`); }
    else meld("Geen prijsgids gevonden. Die komt elke nacht binnen.", "fout");
  } finally { zet({ bezig: null }); }
}

/** Nieuw hartje geschreven: prijs en datum bewaren, de kaart stopt met oplichten. */
export function zetHartje(id: string, prijs: number, handmatig?: boolean) {
  const w: Partial<Exemplaar> = { hartjesprijs: prijs, hartjesdatum: vandaag(), verkoopprijs: prijs, nieuw_hartje: null };
  if (handmatig !== undefined) w.prijs_handmatig = handmatig;
  wijzig(id, w, `Hartje van ${prijs} euro bewaard`, true);
}

// ── Labels ───────────────────────────────────────────────────────────────────
export async function koppelPrinter() {
  try {
    const naam = await verbindPrinter();
    zet({ printer: naam });
    meld(`${naam} verbonden`);
  } catch (e) {
    if (e instanceof Error && /cancel|chooser/i.test(e.message)) return;
    fout(e);
  }
}

export async function loskoppelen() {
  await ontkoppelPrinter();
  zet({ printer: null });
}

/** Donkerte, verschuiving en "trager" van dit toestel (Labels › Proeflabel en afstellen). */
export function afstelling(i = state.instellingen): Afstelling {
  return { donkerte: i.labelDonkerte ?? 3, verschuiving: i.labelVerschuiving ?? 0, trager: !!i.labelTrager };
}
const voortgang = (s: string) => zet({ bezig: s === "ok" ? "Klaar" : `Printen: ${s}` });

export async function print(ids: string[]) {
  const ex = ids.map((id) => state.exemplaren.find((e) => e.id === id)).filter(Boolean) as Exemplaar[];
  if (!ex.length) return;
  zet({ bezig: ex.length === 1 ? "Label printen…" : `${ex.length} labels printen…` });
  try {
    await printLabels(ex, state.instellingen.labelMaat, voortgang, afstelling());
    zet({ printer: printerNaam() });
    wijzigVeel(ex.filter((e) => e.label_status === "te printen").map((e) => e.id), { label_status: "geprint" });
    meld(ex.length === 1 ? "Label geprint. Scan het na het plakken." : `${ex.length} labels geprint. Scan ze na het plakken.`);
  } catch (e) {
    fout(e);
  } finally {
    zet({ bezig: null });
  }
}

/** Print een proeflabel om de maat en de scherpte te controleren. */
export async function printTestlabel() {
  const proef = {
    id: "test", code: "7K2QX9", soort: "kaart", naam: "Charizard ex", set_code: "OBF", nummer: "125",
    conditie: "NM", taal: "EN", variant: "normaal",
  } as Exemplaar;
  zet({ bezig: "Proeflabel printen…" });
  try {
    await printLabels([proef], state.instellingen.labelMaat, voortgang, afstelling());
    zet({ printer: printerNaam() });
    meld("Proeflabel geprint. Scan het met Scan om de QR-code te testen.");
  } catch (e) {
    fout(e);
  } finally {
    zet({ bezig: null });
  }
}

/** Print een randtest: een kader met millimeterstreepjes om te zien of er iets wegvalt. */
export async function printRandtestNu() {
  zet({ bezig: "Randtest printen…" });
  try {
    await printRandtest(state.instellingen.labelMaat, voortgang, afstelling());
    zet({ printer: printerNaam() });
    meld("Randtest geprint. Zie je de vier randen met streepjes?");
  } catch (e) {
    fout(e);
  } finally {
    zet({ bezig: null });
  }
}

/** Een geprint label is gescand: het hangt op de kaart. */
export function bevestigLabel(ex: Exemplaar) {
  if (ex.label_status === "gestickerd") return;
  wijzig(ex.id, { label_status: "gestickerd" }, `Label ${toonCode(ex.code)} bevestigd`);
}

// ── Instellingen ─────────────────────────────────────────────────────────────
export function zetInstellingen(i: Partial<Instellingen>) {
  const nieuw = { ...state.instellingen, ...i };
  schrijf(INSTELLINGEN, nieuw);
  zet({ instellingen: nieuw });
  if ("drempels" in i || "conditiefactoren" in i || "nakijkenAfwijking" in i || "inkoopPct" in i || "ruilPct" in i) {
    const { drempels, conditiefactoren, nakijkenAfwijking, inkoopPct, ruilPct } = nieuw;
    inRij({ soort: "instelling", sleutel: "prijsregels", waarde: { drempels, conditiefactoren, nakijkenAfwijking, inkoopPct, ruilPct } });
  }
}

/** De sleutel van de actieve omgeving voor gedeelde instellingen (de demo zonder omgevingen: "standaard"). */
const gedeeldeSleutel = () => state.omgeving ?? "standaard";

export function bedrijfVan(s: State = state): Bedrijf {
  return s.boekhouding.bedrijven[s.omgeving ?? "standaard"] ?? {};
}

/** Werkt deze omgeving met boekhouding (als zaak), of als particulier? Standaard: met boekhouding. */
export const boekhoudingAan = (s: State = state) => bedrijfVan(s).boekhouding !== false;

export function zetBedrijf(b: Bedrijf) {
  const id = gedeeldeSleutel();
  zet({ boekhouding: { ...state.boekhouding, bedrijven: { ...state.boekhouding.bedrijven, [id]: b } } });
  inRij({ soort: "instelling", sleutel: `bedrijf:${id}`, waarde: b });
}

/** Een dag aanvinken als "ingegeven in Dexxter" (voor alle beheerders zichtbaar). */
export function zetIngegeven(datum: string, aan: boolean) {
  const id = gedeeldeSleutel();
  const nu = { ...(state.boekhouding.ingegeven[id] ?? {}) };
  if (aan) nu[datum] = true; else delete nu[datum];
  zet({ boekhouding: { ...state.boekhouding, ingegeven: { ...state.boekhouding.ingegeven, [id]: nu } } });
  inRij({ soort: "instelling", sleutel: `dexxter:${id}:${datum}`, waarde: aan });
}

export function zetInstagram(naam: string) {
  const schoon = naam.trim().replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//, "").replace(/\/.*$/, "");
  zet({ instagram: schoon });
  inRij({ soort: "instelling", sleutel: "instagram", waarde: schoon });
}

/** De link naar onze Facebook-pagina op de klantenpagina (enkel http(s); leeg = niet tonen). */
export function zetFacebook(link: string): boolean {
  const schoon = link.trim() ? veiligeLink(link) : "";
  if (schoon == null) { meld("Die link werkt niet: begin met https://", "fout"); return false; }
  zet({ facebook: schoon });
  inRij({ soort: "instelling", sleutel: "facebook", waarde: schoon });
  return true;
}

/** De wettelijke gegevens op de klantenpagina (naam, adres, ondernemingsnummer, contact). */
export function zetBedrijfPubliek(b: BedrijfPubliek) {
  const kort = (x: string | null | undefined, n: number) => (x ?? "").trim().slice(0, n) || null;
  const schoon: BedrijfPubliek = {
    handelsnaam: kort(b.handelsnaam, 80), naam: kort(b.naam, 120), adres: kort(b.adres, 200), kbo: kort(b.kbo, 20),
    email: kort(b.email, 200), telefoon: kort(b.telefoon, 40), vrijstelling: b.vrijstelling !== false,
  };
  zet({ bedrijfPubliek: schoon });
  inRij({ soort: "instelling", sleutel: "bedrijf_publiek", waarde: schoon });
}

/** De access key van Web3Forms (of null): nieuwe aanvragen van klanten komen dan ook per mail. */
export function zetAanvraagSleutel(sleutel: string | null) {
  zet({ aanvraagSleutel: sleutel || null });
  // Leeg = geen mail (de kolom waarde mag niet null zijn).
  inRij({ soort: "instelling", sleutel: "aanvraag_sleutel", waarde: sleutel || "" });
}

/** De JSON-feed van Behold met onze Instagram-berichten (of null = uit). Bij het publiceren haalt de site ze op. */
export function zetInstagramFeed(url: string | null) {
  zet({ instagramFeed: url || null });
  inRij({ soort: "instelling", sleutel: "instagram_feed", waarde: url || "" });
}

/** Kan de klantenpagina de feed al lezen (schema 0.15)? Bewaren kan altijd; de site haalt ze pas op na de update. */
export function kanFeed(s: State = state): boolean {
  const b = s.backend;
  if (!b || b.soort !== "supabase") return true;
  const v = (b as SupabaseBackend).versie;
  return v == null || v >= FEED_VANAF;
}
export const SCHEMA_015 = "Bewaard. De site haalt de berichten pas op na de update van de database naar 0.15: voer supabase/schema.sql opnieuw uit in Supabase (zie de README).";

// ── Offline klaarzetten ──────────────────────────────────────────────────────
/**
 * Alles op dit toestel zetten voor een beurs zonder internet: catalogus, prijsgids,
 * de foto's van alle exemplaren in voorraad en de tekstherkenning. De service worker bewaart ze.
 */
export async function offlineKlaarzetten(): Promise<{ fotos: number; mislukt: number; ocr: boolean }> {
  zet({ bezig: "Catalogus en prijzen laden…" });
  try {
    await Promise.all([laadCatalogus("en"), laadCatalogus("asia"), laadPrijsgids(true)]);
    const urls = [...new Set(state.exemplaren
      .filter((e) => inVoorraad(e) && e.afbeelding)
      .flatMap((e) => [e.afbeelding!, e.afbeelding!.replace("/low.webp", "/high.webp")]))];
    let klaar = 0;
    let mislukt = 0;
    const werk = urls.slice();
    const lus = async () => {
      for (let u = werk.shift(); u; u = werk.shift()) {
        try { await fetch(u, { mode: "no-cors" }); } catch { mislukt++; }
        klaar++;
        if (klaar % 5 === 0 || klaar === urls.length) zet({ bezig: `Foto's bewaren: ${klaar} van ${urls.length}` });
      }
    };
    await Promise.all(Array.from({ length: 6 }, lus));
    zet({ bezig: "Tekstherkenning laden…" });
    let ocr = true;
    try { await laadOcr(); } catch { ocr = false; }
    const uit = { fotos: urls.length - mislukt, mislukt, ocr };
    schrijf("bindr-offline-v1", { ...uit, op: new Date().toISOString(), aantal: state.exemplaren.length });
    meld(mislukt || !ocr ? "Offline klaar, maar niet alles kon geladen worden. Probeer opnieuw met goede wifi." : "Klaar voor offline", mislukt || !ocr ? "info" : "ok");
    return uit;
  } finally {
    zet({ bezig: null });
  }
}

export function zetBezig(b: string | null) { zet({ bezig: b }); }

// ── Beurs ────────────────────────────────────────────────────────────────────
export const actieveBeurs = (s: State = state) => s.beurzen.find((b) => b.status === "actief") ?? null;

export function startBeurs(gegevens: { naam: string; datum: string; startkas: number; locatie?: string | null; geplandId?: string | null }): Beurs {
  const al = actieveBeurs();
  if (al) throw new Error(`${al.naam} is nog bezig. Sluit die eerst af.`);
  const gepland = gegevens.geplandId ? state.beurzen.find((x) => x.id === gegevens.geplandId) : null;
  const b: Beurs = {
    ...(gepland ?? {}),
    id: gepland?.id ?? uuid(), naam: gegevens.naam.trim() || `Beurs ${gegevens.datum}`, datum: gegevens.datum, standgeld: null,
    startkas: gegevens.startkas, status: "actief", gestart_op: new Date().toISOString(), afgesloten_op: null,
    getelde_kas: null, sumup_bevestigd: false, stand_start: stand(state), stand_einde: null, opmerking: gepland?.opmerking ?? null,
    locatie: gegevens.locatie ?? gepland?.locatie ?? null, uren: gepland?.uren ?? null, link: gepland?.link ?? null, omgeving_id: state.omgeving,
  };
  zet({ beurzen: gepland ? state.beurzen.map((x) => (x.id === b.id ? b : x)) : [b, ...state.beurzen] });
  inRij({ soort: "beurs", beurs: b });
  meld(`${b.naam} gestart met ${gegevens.startkas} euro in de cashkoffer`);
  return b;
}

/** Een beurs alvast plannen: klanten zien ze bij "komende beurzen". */
export function planBeurs(gegevens: { naam: string; datum: string; locatie: string | null; uren?: string | null; link?: string | null }): Beurs {
  const b: Beurs = {
    id: uuid(), naam: gegevens.naam.trim() || `Beurs ${gegevens.datum}`, datum: gegevens.datum, standgeld: null, startkas: null,
    status: "gepland", gestart_op: null, afgesloten_op: null, getelde_kas: null, sumup_bevestigd: false, stand_start: null,
    stand_einde: null, opmerking: null, locatie: gegevens.locatie?.trim() || null, uren: gegevens.uren?.trim() || null,
    link: veiligeLink(gegevens.link), omgeving_id: state.omgeving,
  };
  zet({ beurzen: [b, ...state.beurzen] });
  inRij({ soort: "beurs", beurs: b });
  meld(`${b.naam} gepland`);
  return b;
}

/** Een link naar een beurs: enkel http(s), anders niets (komt op de klantenpagina). */
export function veiligeLink(l: string | null | undefined): string | null {
  const t = (l ?? "").trim();
  if (!t || t.length > 480) return null; // de database neemt hoogstens 500 tekens
  const metSchema = /^https?:\/\//i.test(t) ? t : `https://${t}`;
  try { const u = new URL(metSchema); return (u.protocol === "https:" || u.protocol === "http:") && u.href.length <= 500 ? u.href : null; } catch { return null; }
}

/** Een geplande beurs aanpassen (naam, datum, plaats, uren, link). */
export function wijzigBeurs(id: string, w: { naam: string; datum: string; locatie: string | null; uren?: string | null; link?: string | null }) {
  const b = state.beurzen.find((x) => x.id === id);
  if (!b || b.status !== "gepland") return;
  // Enkel deze velden, en op de server enkel zolang de beurs gepland is: startte een andere gsm ze intussen,
  // dan blijven de startkas en de stand van die beurs staan.
  const nieuw = { naam: w.naam.trim() || b.naam, datum: w.datum, locatie: w.locatie?.trim() || null, uren: w.uren?.trim() || null, link: veiligeLink(w.link) };
  zet({ beurzen: state.beurzen.map((x) => (x.id === id ? { ...x, ...nieuw } : x)) });
  inRij({ soort: "beursGepland", id, w: nieuw });
  meld(`${nieuw.naam} bewaard`);
}

/** Een geplande beurs schrappen (gaat ze toch niet door). */
export function schrapBeurs(id: string) {
  const b = state.beurzen.find((x) => x.id === id);
  if (!b || b.status !== "gepland") return;
  zet({ beurzen: state.beurzen.filter((x) => x.id !== id) });
  inRij({ soort: "beursWeg", id });
  meld(`${b.naam} geschrapt`);
}

export function sluitBeurs(b: Beurs, geteld: { getelde_kas: number | null; sumup_bevestigd: boolean }): Beurs {
  const nieuw: Beurs = { ...b, ...geteld, status: "afgesloten", afgesloten_op: new Date().toISOString(), stand_einde: stand(state) };
  bewaarBeurs(nieuw);
  return nieuw;
}

export function bewaarBeurs(b: Beurs) {
  zet({ beurzen: state.beurzen.map((x) => (x.id === b.id ? b : x)) });
  inRij({ soort: "beurs", beurs: b });
}

// ── Mandje en kassa ──────────────────────────────────────────────────────────
/** Het percentage dat geldt: zelf gekozen, of de standaard voor ruil (er gaat ook iets weg) of inkoop. */
export function bodPct(m: Mandje = state.mandje, i: Instellingen = state.instellingen): number {
  if (m.bod?.pct) return m.bod.pct;
  const ruil = m.regels.some((r) => r.richting === "uit");
  const std = ruil ? i.ruilPct : i.inkoopPct;
  return Math.min(PCT_MAX, Math.max(PCT_MIN, Math.round(std / 5) * 5));
}

/**
 * Het mandje bijwerken. Is er een bod op de kaarten van de klant, dan wordt het opnieuw
 * verdeeld (in verhouding tot de marktwaarde), zodat "wat we per kaart betalen" altijd klopt.
 */
function zetRegels(regels: Regel[], gekozen: BodInstelling | null | undefined = state.mandje.bod) {
  const metMarkt = regels.some((r) => r.richting === "in" && (r.referentie ?? 0) > 0);
  // Standaard: het exacte bedrag aan het standaardpercentage, tot de beheerder zelf kiest.
  let bod = gekozen ?? (metMarkt ? { afronding: "exact" as const } : null);
  // Een zelf getypt bedrag hoort bij die kaarten: komt er een kaart bij of gaat er een weg,
  // dan rekenen we opnieuw met het percentage (anders betaal je 70 euro voor één kaart van 40).
  if (bod?.afronding === "eigen" && gekozen === state.mandje.bod && marktwaarde(regels).totaal !== marktwaarde(state.mandje.regels).totaal) {
    bod = { ...bod, afronding: "exact", eigen: null };
    meld("Andere kaarten: het bod is opnieuw berekend met het percentage", "info");
  }
  const m: Mandje = { regels, bod };
  if (bod && metMarkt) {
    const pct = bodPct(m);
    m.regels = pasBodToe(regels, bodVanExact(exactBod(regels, pct), bod), pct);
  }
  if (!regels.some((r) => r.richting === "in")) m.bod = null;
  zet({ mandje: m });
}

/**
 * Per kaart een eigen percentage (bv. 70% voor een vintage kaart terwijl de rest op 80% staat).
 * Gelijk aan het algemene percentage = geen eigen percentage meer. Een zelf getypt bod vervalt:
 * het percentage moet effect hebben.
 */
export function zetRegelPct(i: number, pct: number | null) {
  const regels = state.mandje.regels.slice();
  const r = regels[i];
  if (!r || r.richting !== "in") return;
  const b: BodInstelling = { afronding: "exact", ...(state.mandje.bod ?? {}), perKaart: true };
  const alg = bodPct({ ...state.mandje, bod: b });
  const p = pct == null ? null : Math.min(PCT_MAX, Math.max(PCT_MIN, Math.round(pct / 5) * 5));
  regels[i] = { ...r, pct: p == null || p === alg ? null : p };
  zetRegels(regels, b.afronding === "eigen" ? { ...b, afronding: "exact", eigen: null } : b);
}

/**
 * Per kaart aan of uit. Aan = elke kaart begint op het standaardpercentage (inkoop 70%, ruil 80%) en de
 * beheerder past per kaart aan. Uit = alle kaarten weer op één percentage.
 */
export function zetPerKaart(aan: boolean) {
  const vorig: BodInstelling = { afronding: "exact", ...(state.mandje.bod ?? {}) };
  const b: BodInstelling = aan
    ? { ...vorig, perKaart: true, pct: null, afronding: vorig.afronding === "eigen" ? "exact" : vorig.afronding, eigen: null }
    : { ...vorig, perKaart: false };
  zetRegels(aan ? state.mandje.regels : state.mandje.regels.map((r) => (r.pct != null ? { ...r, pct: null } : r)), b);
}

/** Het bod kiezen: percentage (slider) en afronding. */
export function zetBod(b: Partial<BodInstelling>) {
  const nu: BodInstelling = { afronding: "exact", ...(state.mandje.bod ?? {}), ...b };
  zetRegels(state.mandje.regels, nu);
}

export function inMandje(r: Regel) {
  const dubbel = r.exemplaar_id && state.mandje.regels.some((x) => x.exemplaar_id === r.exemplaar_id && x.richting === r.richting);
  if (dubbel) { meld("Dat exemplaar zit al in het mandje", "info"); return; }
  if (r.artikel_id && r.richting === "uit") {
    const i = state.mandje.regels.findIndex((x) => x.artikel_id === r.artikel_id && x.richting === "uit");
    if (i >= 0) {
      const x = state.mandje.regels[i];
      const regels = state.mandje.regels.slice();
      regels[i] = artikelAantal(x, (x.aantal ?? 1) + (r.aantal ?? 1));
      return zetRegels(regels);
    }
  }
  zetRegels([...state.mandje.regels, r]);
}
/** Een artikel in het mandje: ander aantal, aan de prijs per stuk (en de aankoopprijs per stuk). */
function artikelAantal(x: Regel, aantal: number): Regel {
  const n = x.aantal ?? 1;
  const per = (x.hartjesprijs ?? 0) / n;
  return {
    ...x, aantal, hartjesprijs: per * aantal, prijs: Math.round(per * aantal * 100) / 100,
    aankoopprijs: x.aankoopprijs == null ? x.aankoopprijs : Math.round((x.aankoopprijs / n) * aantal * 100) / 100,
  };
}
export function zetArtikelAantal(i: number, aantal: number) {
  const regels = state.mandje.regels.slice();
  if (!regels[i]) return;
  regels[i] = artikelAantal(regels[i], Math.max(1, aantal));
  zetRegels(regels);
}

export function wijzigRegel(i: number, w: Partial<Regel>) {
  const regels = state.mandje.regels.slice();
  regels[i] = { ...regels[i], ...w };
  zetRegels(regels);
}
export function verwijderRegel(i: number) {
  zetRegels(state.mandje.regels.filter((_, j) => j !== i));
}
export function totaalAanpassen(richting: "uit" | "in", totaal: number) {
  zetRegels(pasTotaalAan(state.mandje.regels, richting, totaal));
}
/** Eén bod voor alle kaarten van de klant met een marktprijs (verdeeld volgens die prijs). */
export function bodToepassen(bod: number) {
  zetRegels(state.mandje.regels, { ...(state.mandje.bod ?? {}), afronding: "eigen", eigen: bod });
}
export function leegMandje() {
  zetRegels([]);
}
/** Het mandje leegmaken met een knop om het terug te zetten (in plaats van een vraag vooraf). */
export function mandjeLegen() {
  const vorige = state.mandje.regels;
  const vorigBod = state.mandje.bod;
  if (!vorige.length) return;
  zetRegels([]);
  meld("Mandje leeggemaakt", "info", { label: "Terugzetten", doe: () => zetRegels(vorige, vorigBod) }, 5000);
}

/** Boekt een transactie: meteen op dit toestel, daarna via de wachtrij naar de server. */
function boek(t: Transactie): Transactie {
  const r = pasToe(state, { ...t, beheerder: state.backend?.gebruikerId() ?? null, omgeving_id: state.omgeving ?? t.omgeving_id ?? null });
  zet({ exemplaren: r.voorraad.exemplaren, artikelen: r.voorraad.artikelen, transacties: [...state.transacties, r.transactie] });
  inRij({ soort: "transactie", t: r.transactie });
  return r.transactie;
}

/** Rekent het mandje af. Geeft de transactie terug; 5 seconden lang kan ze ongedaan. */
export function afrekenen(b: Betaling, opmerking: string | null = null, tegenpartij: Tegenpartij | null = null, tijd?: string, fotos: string[] = []): Transactie {
  const beurs = actieveBeurs();
  // Een aankoop van een andere dag (thuis ingegeven) hoort niet bij de beurs van vandaag.
  const opBeurs = beurs && (!tijd || tijd.slice(0, 10) === new Date().toISOString().slice(0, 10)) ? beurs : null;
  const t = boek(nieuweTransactie(state.mandje.regels, b, opBeurs?.id ?? null, opmerking, tijd, tegenpartij));
  for (const f of fotos) voegAankoopfotoToe(t.id, f);
  leegMandje();
  // Het scherm "Verkocht" toont zelf het bedrag en de knop Ongedaan maken; enkel een conflict krijgt een melding.
  if (t.status === "conflict") meld("Let op: niet alles kon afgeboekt worden. Bekijk de transactie.", "fout", { label: "Bekijk", doe: () => openTransactie(t.id) }, 8000);
  return t;
}

export function ongedaanMaken(id: string) {
  const t = state.transacties.find((x) => x.id === id);
  if (!t || t.status === "ongedaan") return;
  const r = maakOngedaan(state, t);
  zet({ exemplaren: r.voorraad.exemplaren, artikelen: r.voorraad.artikelen });
  vervangTransactie(r.transactie);
  inRij({ soort: "ongedaan", id });
  meld("Ongedaan gemaakt");
}

/** Mag deze transactie nog ongedaan gemaakt worden? Enkel dezelfde dag: een vorige dag staat misschien al in Dexxter. */
export function magOngedaan(t: Transactie, nu = new Date().toISOString()): boolean {
  return t.status !== "ongedaan" && dagVan(t.tijd) === dagVan(nu);
}

/** Retour of een deal terugdraaien: onze stukken komen terug (terugIn), hun stukken gaan terug (terugUit). */
export function retour(terugIn: Regel[], terug: number, terugUit: Regel[] = [], perBank = false) {
  const beurs = actieveBeurs();
  return boek(nieuweRetour(terugIn, terug, beurs?.id ?? null, undefined, terugUit, perBank));
}

/**
 * Kan wat nieuw is in 0.6 (kas, overschrijving, borderel, deal terugdraaien, eigen kaartfoto) al naar
 * de database? Bij een oude database niet: de knoppen zeggen dan dat het schema eerst bijgewerkt moet
 * worden, zodat er niets in de wachtrij blijft hangen. De demo kan alles.
 */
export function kanNieuweBoekhouding(s: State = state): boolean {
  const b = s.backend;
  if (!b || b.soort !== "supabase") return true;
  const v = (b as SupabaseBackend).versie;
  return v == null || v >= BOEKHOUDING_VANAF;
}
/** Draait de database een schema van vóór 0.9? (Uren en link van beurzen en artikels per stuk op de klantenpagina komen met 0.9.) */
export function schemaOud(s: State = state): boolean {
  const b = s.backend;
  if (!b || b.soort !== "supabase") return false;
  const v = (b as SupabaseBackend).versie;
  return v != null && v < 8;
}
/** Kan de database al meer foto's per artikel, de etalage en aanvragen aan (schema 0.10)? */
export function kanEtalage(s: State = state): boolean {
  const b = s.backend;
  if (!b || b.soort !== "supabase") return true;
  const v = (b as SupabaseBackend).versie;
  return v == null || v >= ETALAGE_VANAF;
}
export const SCHEMA_010 = "Dit kan pas na de update van de database naar 0.10: voer supabase/schema.sql opnieuw uit in Supabase (zie de README).";
/** Kan de database al binders vooraan, de Instagram-strook en thema's aan (schema 0.13)? */
export function kanThema(s: State = state): boolean {
  const b = s.backend;
  if (!b || b.soort !== "supabase") return true;
  const v = (b as SupabaseBackend).versie;
  return v == null || v >= THEMA_VANAF;
}
export const SCHEMA_013 = "Dit kan pas na de update van de database naar 0.13: voer supabase/schema.sql opnieuw uit in Supabase (zie de README).";
export const SCHEMA_09 = "Wordt pas bewaard na de update van de database: voer supabase/schema.sql opnieuw uit in Supabase (zie de README).";
export const OUD_SCHEMA = "Dit kan pas na de update van de database: voer supabase/schema.sql opnieuw uit in Supabase (zie de README).";

/** Geld in of uit de cashkoffer zonder verkoop (wisselgeld, bijleggen, afhalen). */
export function kasbeweging(b: { cash: number; sumup?: number }, omschrijving: string | null, tegenpartij: Tegenpartij | null = null) {
  // De kas is de cashkoffer van een beurs: zonder beurs is er geen koffer om te tellen.
  const beurs = actieveBeurs();
  if (!beurs) throw new Error("De kas kan enkel tijdens een beurs.");
  const t = boek(nieuweKasbeweging(b, beurs.id, omschrijving, tegenpartij));
  meld(t.sumup > 0 ? `SumUp ${euro(t.sumup)} ontvangen, ${euro(-t.cash)} cash gegeven` : t.cash > 0 ? `${euro(t.cash)} in de kas` : `${euro(-t.cash)} uit de kas`);
  return t;
}

/** Kaarten tussen privé en de zaak (Profiel › Privé). */
/**
 * Kaarten die al in de app staan (zelf toegevoegd, bv. de eigen verzameling bij de start) uit privé
 * inbrengen: één bewijs PB-…, en elke kaart krijgt haar inbrengwaarde als aankoopprijs.
 */
export function inbrengBestaand(regels: Regel[], fotos: string[] = []): Transactie {
  if (state.gedeeltelijk) throw new Error("Zonder internet kent de app enkel de laatste maanden: breng kaarten in als je weer online bent.");
  // Eén transactie: de app en de database zetten zelf de aankoopprijs op elke kaart (en nooit twee keer).
  const t = boek(nieuwePrive(regels, [], actieveBeurs()?.id ?? null));
  for (const f of fotos) voegAankoopfotoToe(t.id, f);
  if (t.status === "conflict") meld(`${t.conflicten.length === 1 ? "Eén kaart kon" : `${t.conflicten.length} kaarten konden`} niet: al gekocht, ingebracht of niet meer in voorraad.`, "fout", { label: "Bekijk", doe: () => openTransactie(t.id) }, 8000);
  return t;
}

export function prive(binnen: Regel[], weg: Regel[], fotos: string[] = []): Transactie {
  const beurs = actieveBeurs();
  const t = boek(nieuwePrive(binnen, weg, beurs?.id ?? null));
  for (const f of fotos) voegAankoopfotoToe(t.id, f);
  if (t.status === "conflict") meld("Niet alles kon naar privé: bekijk de transactie.", "fout", { label: "Bekijk", doe: () => openTransactie(t.id) }, 8000);
  return t;
}

// ── Foto's bij aankopen: apart geladen, enkel wanneer je ze bekijkt ─────────
const fotoCache = new Map<string, Aankoopfoto[]>(); // per transactie
const fotoLaden = new Set<string>();

/** De foto's van een transactie, met wat nog in de wachtrij staat (ook offline zichtbaar). */
export function fotosVan(transactieId: string): Aankoopfoto[] {
  const weg = new Set(rij.map((w) => w.op).filter((op) => op.soort === "aankoopfotoWeg").map((op) => (op as { id: string }).id));
  const wachtend = rij.map((w) => w.op).filter((op) => op.soort === "aankoopfoto" && op.f.transactie_id === transactieId).map((op) => (op as { f: Aankoopfoto }).f);
  const bekend = fotoCache.get(transactieId) ?? [];
  return [...bekend, ...wachtend.filter((f) => !bekend.some((x) => x.id === f.id))].filter((f) => !weg.has(f.id));
}

/** Laadt de foto's van deze transacties (één keer per sessie, tenzij `opnieuw`). */
export async function laadFotos(ids: string[], opnieuw = false): Promise<void> {
  const b = state.backend;
  const nodig = ids.filter((id) => (opnieuw || !fotoCache.has(id)) && !fotoLaden.has(id));
  if (!b || !nodig.length) return;
  nodig.forEach((id) => fotoLaden.add(id));
  try {
    const fotos = await b.laadAankoopfotos(nodig);
    for (const id of nodig) fotoCache.set(id, fotos.filter((f) => f.transactie_id === id));
    zet({ fotoVersie: state.fotoVersie + 1 });
  } catch {
    // Geen internet: later opnieuw (wat op deze gsm genomen werd, staat al in de wachtrij).
  } finally {
    nodig.forEach((id) => fotoLaden.delete(id));
  }
}

export function voegAankoopfotoToe(transactieId: string, foto: string) {
  const f: Aankoopfoto = { id: uuid(), transactie_id: transactieId, foto, omgeving_id: state.omgeving, aangemaakt_op: new Date().toISOString() };
  inRij({ soort: "aankoopfoto", f });
  fotoCache.set(transactieId, [...(fotoCache.get(transactieId) ?? []), f]);
  zet({ fotoVersie: state.fotoVersie + 1 });
}

export function verwijderAankoopfoto(f: Aankoopfoto) {
  // Nog niet doorgestuurd? Dan gewoon uit de wachtrij.
  const i = rij.findIndex((w) => w.op.soort === "aankoopfoto" && w.op.f.id === f.id && w !== rij[0]);
  if (i >= 0) { rij.splice(i, 1); bewaarRij(); } else inRij({ soort: "aankoopfotoWeg", id: f.id });
  fotoCache.set(f.transactie_id, (fotoCache.get(f.transactie_id) ?? []).filter((x) => x.id !== f.id));
  zet({ fotoVersie: state.fotoVersie + 1 });
}

// ── Meer foto's bij een artikel (schema 0.10): apart geladen, enkel wanneer je het artikel opent ──
const artikelfotoCache = new Map<string, Artikelfoto[]>(); // per artikel
const artikelfotoLaden = new Set<string>();

function wachtendeOps<T extends Op["soort"]>(soort: T): Extract<Op, { soort: T }>[] {
  return rij.map((w) => w.op).filter((op): op is Extract<Op, { soort: T }> => op.soort === soort);
}

/** De extra foto's van een artikel (zonder de hoofdfoto), met wat nog in de wachtrij staat. */
export function artikelfotosVan(artikelId: string): Artikelfoto[] {
  const weg = new Set(wachtendeOps("artikelfotoWeg").map((op) => op.id));
  const wachtend = wachtendeOps("artikelfoto").map((op) => op.f).filter((f) => f.artikel_id === artikelId);
  const lijst = new Map((artikelfotoCache.get(artikelId) ?? []).map((f) => [f.id, f]));
  for (const f of wachtend) lijst.set(f.id, f); // een wachtende wijziging (andere foto) wint
  return [...lijst.values()].filter((f) => !weg.has(f.id)).sort((a, b) => a.volgorde - b.volgorde);
}

export async function laadArtikelfotos(ids: string[], opnieuw = false): Promise<void> {
  const b = state.backend;
  const nodig = ids.filter((id) => (opnieuw || !artikelfotoCache.has(id)) && !artikelfotoLaden.has(id));
  if (!b || !nodig.length) return;
  nodig.forEach((id) => artikelfotoLaden.add(id));
  try {
    const fotos = await b.laadArtikelfotos(nodig);
    for (const id of nodig) artikelfotoCache.set(id, fotos.filter((f) => f.artikel_id === id));
    zet({ fotoVersie: state.fotoVersie + 1 });
  } catch {
    // Geen internet: later opnieuw.
  } finally {
    nodig.forEach((id) => artikelfotoLaden.delete(id));
  }
}

/** Een foto bij een artikel: de eerste wordt de hoofdfoto (`artikel.foto`), de rest komt erbij. */
export function voegArtikelfotoToe(artikel: Artikel, foto: string) {
  if (!artikel.foto) { wijzigArtikel(artikel.id, { foto }); return; }
  const extra = artikelfotosVan(artikel.id);
  const f: Artikelfoto = { id: uuid(), artikel_id: artikel.id, foto, volgorde: (extra[extra.length - 1]?.volgorde ?? 0) + 1 };
  inRij({ soort: "artikelfoto", f });
  artikelfotoCache.set(artikel.id, [...(artikelfotoCache.get(artikel.id) ?? []), f]);
  zet({ fotoVersie: state.fotoVersie + 1 });
}

export function verwijderArtikelfoto(f: Artikelfoto) {
  // Wat nog niet doorgestuurd is, gaat uit de wachtrij; daarna altijd wissen op de server (een foto die
  // er nooit kwam wissen, kan geen kwaad).
  rij = rij.filter((w, j) => j === 0 || !(w.op.soort === "artikelfoto" && w.op.f.id === f.id));
  inRij({ soort: "artikelfotoWeg", id: f.id });
  artikelfotoCache.set(f.artikel_id, (artikelfotoCache.get(f.artikel_id) ?? []).filter((x) => x.id !== f.id));
  zet({ fotoVersie: state.fotoVersie + 1 });
}

/** Een extra foto wordt de hoofdfoto (en de vorige hoofdfoto schuift naar haar plaats). */
export function maakHoofdfoto(artikel: Artikel, f: Artikelfoto) {
  const vorige = artikel.foto;
  wijzigArtikel(artikel.id, { foto: f.foto });
  if (!vorige) { verwijderArtikelfoto(f); return; }
  const nieuw = { ...f, foto: vorige };
  inRij({ soort: "artikelfoto", f: nieuw });
  artikelfotoCache.set(artikel.id, (artikelfotoCache.get(artikel.id) ?? []).map((x) => (x.id === f.id ? nieuw : x)));
  zet({ fotoVersie: state.fotoVersie + 1 });
}

/** De hoofdfoto weg: de volgende foto (als die er is) wordt de hoofdfoto. */
export function verwijderHoofdfoto(artikel: Artikel) {
  const volgende = artikelfotosVan(artikel.id)[0];
  wijzigArtikel(artikel.id, { foto: volgende?.foto ?? null });
  if (volgende) verwijderArtikelfoto(volgende);
}

// ── De etalage op de startpagina van de klanten (schema 0.10) ──
let etalageCache: Etalagefoto[] | null = null;
let etalageLaden = false;

type EtalageMeta = Partial<Pick<Etalagefoto, "titel" | "link" | "volgorde">>;

const plekVan = (f: Etalagefoto): EtalagePlek => f.plek ?? "instagram";

/** De foto's op een plek (vooraan of in de Instagram-strook), met wat nog in de wachtrij staat (null = nog niet geladen). */
export function etalageLijst(plek: EtalagePlek): Etalagefoto[] | null {
  const alles = etalageAlles();
  return alles && alles.filter((f) => plekVan(f) === plek);
}

function etalageAlles(): Etalagefoto[] | null {
  if (!etalageCache && !wachtendeOps("etalage").length) return etalageCache;
  const weg = new Set(wachtendeOps("etalageWeg").map((op) => op.id));
  const lijst = new Map((etalageCache ?? []).map((f) => [f.id, f]));
  for (const op of wachtendeOps("etalage")) lijst.set(op.f.id, op.f);
  for (const op of wachtendeOps("etalageWijzig")) { const f = lijst.get(op.id); if (f) lijst.set(op.id, { ...f, ...op.w }); }
  return [...lijst.values()].filter((f) => !weg.has(f.id)).sort((a, b) => a.volgorde - b.volgorde || (a.aangemaakt_op ?? "").localeCompare(b.aangemaakt_op ?? ""));
}

export async function laadEtalage(): Promise<void> {
  const b = state.backend;
  if (!b || etalageLaden) return;
  etalageLaden = true;
  try {
    etalageCache = await b.laadEtalage();
    zet({ fotoVersie: state.fotoVersie + 1 });
  } catch (e) {
    if (!isNetwerkFout(e)) fout(e);
  } finally {
    etalageLaden = false;
  }
}

/** Titel en link nakijken (enkel http(s)); null als de link niet deugt. */
function schoneMeta(w: EtalageMeta): EtalageMeta | null {
  const uit: EtalageMeta = { ...w };
  if ("titel" in w) uit.titel = w.titel?.trim().slice(0, 120) || null;
  if ("link" in w) {
    const link = w.link?.trim() ? veiligeLink(w.link) : null;
    if (w.link?.trim() && !link) { meld("Die link werkt niet: begin met https://", "fout"); return null; }
    uit.link = link;
  }
  return uit;
}

/** Een nieuwe foto in de etalage (de foto gaat één keer mee naar de server). */
export function voegEtalagefotoToe(f: Etalagefoto) {
  const schoon: Etalagefoto = { ...f, ...schoneMeta({ titel: f.titel, link: f.link }), omgeving_id: f.omgeving_id ?? state.omgeving };
  inRij({ soort: "etalage", f: schoon });
  etalageCache = [...(etalageCache ?? []).filter((x) => x.id !== f.id), schoon];
  zet({ fotoVersie: state.fotoVersie + 1 });
}

/** Titel, link of volgorde aanpassen: enkel die velden gaan naar de server, nooit opnieuw de foto. */
export function wijzigEtalagefoto(f: Etalagefoto, w: EtalageMeta): boolean {
  const meta = schoneMeta(w);
  if (!meta) return false;
  // Staat de foto zelf nog in de wachtrij (niet de eerste, die misschien al onderweg is)? Dan daar aanpassen.
  const i = rij.findIndex((x, j) => j > 0 && x.op.soort === "etalage" && x.op.f.id === f.id);
  if (i > 0) {
    const op = rij[i].op as Extract<Op, { soort: "etalage" }>;
    rij[i] = { ...rij[i], op: { ...op, f: { ...op.f, ...meta } } };
    bewaarRij();
  } else {
    inRij({ soort: "etalageWijzig", id: f.id, w: meta });
  }
  etalageCache = (etalageCache ?? []).map((x) => (x.id === f.id ? { ...x, ...meta } : x));
  zet({ fotoVersie: state.fotoVersie + 1 });
  return true;
}

/** Een nieuwe foto: vooraan achteraan de rij, in de Instagram-strook bovenaan (het nieuwste bericht eerst). */
export function nieuweEtalagefoto(foto: string, plek: EtalagePlek): Etalagefoto {
  const lijst = etalageLijst(plek) ?? [];
  const volgorde = plek === "instagram" ? (lijst[0]?.volgorde ?? 1) - 1 : (lijst[lijst.length - 1]?.volgorde ?? 0) + 1;
  return { id: uuid(), foto, titel: null, link: null, volgorde, plek, omgeving_id: state.omgeving, aangemaakt_op: new Date().toISOString() };
}

export function verwijderEtalagefoto(f: Etalagefoto) {
  rij = rij.filter((w, j) => j === 0 || !((w.op.soort === "etalage" && w.op.f.id === f.id) || (w.op.soort === "etalageWijzig" && w.op.id === f.id)));
  inRij({ soort: "etalageWeg", id: f.id });
  etalageCache = (etalageCache ?? []).filter((x) => x.id !== f.id);
  zet({ fotoVersie: state.fotoVersie + 1 });
}

/** Een foto een plaats naar voren (−1) of naar achteren (+1) schuiven. */
export function schuifEtalagefoto(f: Etalagefoto, richting: -1 | 1) {
  const lijst = etalageLijst(plekVan(f)) ?? [];
  const i = lijst.findIndex((x) => x.id === f.id);
  const j = i + richting;
  if (i < 0 || j < 0 || j >= lijst.length) return;
  const nieuw = [...lijst];
  [nieuw[i], nieuw[j]] = [nieuw[j], nieuw[i]];
  nieuw.forEach((x, k) => { if (x.volgorde !== k + 1) wijzigEtalagefoto(x, { volgorde: k + 1 }); });
}

// ── Thema's op de klantenpagina (schema 0.13) ──
let themaCache: Thema[] | null = null;
let themasLaden = false;

/** De thema's die al bewaard zijn, met wat nog in de wachtrij staat (null = nog niet geladen). */
export function themaLijst(): Thema[] | null {
  const wacht = wachtendeOps("thema");
  if (!themaCache && !wacht.length) return themaCache;
  const lijst = new Map((themaCache ?? []).map((t) => [t.id, t]));
  for (const op of wacht) lijst.set(op.t.id, metLogos(lijst.get(op.t.id), op.t));
  return [...lijst.values()];
}

/** Zijn alle thema's met hun logo's geladen (Profiel › Thema), of enkel de lijst en het thema van vandaag (het beheer)? */
let themasVolledig = false;
const themaLogosGeladen = new Set<string>();
export const themaLijstVolledig = () => themasVolledig;

export async function laadThemas(): Promise<void> {
  const b = state.backend;
  if (!b || themasLaden || !kanThema()) return;
  themasLaden = true;
  try {
    themaCache = await b.laadThemas();
    themasVolledig = true;
    for (const t of themaCache) themaLogosGeladen.add(t.id);
    zet({ fotoVersie: state.fotoVersie + 1 });
  } catch (e) {
    if (!isNetwerkFout(e)) fout(e);
  } finally {
    themasLaden = false;
  }
}

/**
 * Het beheer in het thema van de klantenpagina: eerst de lijst zonder logo's (klein), dan enkel de logo's van het thema
 * van vandaag. Niet erg als het niet lukt (offline): dan gewoon ons logo.
 */
let beheerThemaBezig = false;
let beheerThemaOpnieuw: ReturnType<typeof setTimeout> | null = null;
let beheerThemaPogingen = 0;
export async function laadBeheerThema(): Promise<void> {
  const b = state.backend;
  if (!b || beheerThemaBezig || themasLaden || !kanThema()) return;
  beheerThemaBezig = true;
  try {
    if (!themaCache) {
      const kort = await b.laadThemas({ zonderLogos: true });
      if (!themaCache) themaCache = kort;
    }
    const lijst = themaLijst();
    const t = lijst ? actiefThema(lijst, maandDag(vandaag())) : null;
    if (t && !themaLogosGeladen.has(t.id)) {
      const logos = await b.laadThemaLogos(t.id);
      if (!themasVolledig && themaCache) themaCache = themaCache.map((x) => (x.id === t.id ? { ...x, logo: logos?.logo ?? null, logo_groot: logos?.logo_groot ?? null, logo_eend: logos?.logo_eend ?? null } : x));
      themaLogosGeladen.add(t.id);
    }
    beheerThemaPogingen = 0;
    zet({ fotoVersie: state.fotoVersie + 1 });
  } catch {
    // Versiering: zonder thema werkt alles gewoon. Wat later nog eens (slecht bereik op een beurs), hoogstens vijf keer.
    if (!beheerThemaOpnieuw && beheerThemaPogingen < 5) {
      beheerThemaPogingen++;
      beheerThemaOpnieuw = setTimeout(() => { beheerThemaOpnieuw = null; void laadBeheerThema(); }, 30_000 * beheerThemaPogingen);
    }
  } finally {
    beheerThemaBezig = false;
  }
}

/** Het thema dat nu op de klantenpagina staat, met zijn logo's (eigen, anders meegeleverd; null = ons gewone logo). */
export function beheerThema(): { thema: Thema; soort: ThemaSoort; logo: string | null; eend: string | null } | null {
  const lijst = themaLijst();
  const t = lijst ? actiefThema(lijst, maandDag(vandaag())) : null;
  const soort = t ? soortVan(t.id) : undefined;
  if (!t || !soort) return null;
  // Zolang de eigen logo's van dit thema niet geladen zijn: ons gewone logo (niet eerst het meegeleverde en dan het eigen).
  const klaar = themaLogosGeladen.has(t.id);
  return {
    thema: t, soort,
    logo: klaar ? themaLogo(t, soort, "logo", veiligeFoto(t.logo)) : null,
    eend: klaar ? themaLogo(t, soort, "logo_eend", veiligeFoto(t.logo_eend)) : null,
  };
}

const LOGOS = ["logo", "logo_groot", "logo_eend"] as const;
/** Een thema bijwerken: een logo dat niet meekomt (undefined), blijft zoals het was. */
function metLogos(oud: Thema | undefined, t: Thema): Thema {
  const uit: Thema = { ...oud, ...t };
  for (const k of LOGOS) uit[k] = t[k] !== undefined ? t[k] : oud?.[k] ?? null;
  return uit;
}

/**
 * Een thema bewaren. Zonder een logo (undefined) blijft dat logo zoals het was, zodat een andere datum of kleur het
 * logo niet opnieuw verstuurt. Staat het thema nog in de wachtrij (niet vooraan), dan passen we dat aan.
 */
export function bewaarThema(t: Thema) {
  const schoon: Thema = {
    id: t.id, naam: t.naam.trim().slice(0, 40) || t.id, van: t.van, tot: t.tot, aan: t.aan,
    kleur: t.kleur ?? null, tekst: t.tekst?.trim().slice(0, 120) || null,
    ...Object.fromEntries(LOGOS.filter((k) => t[k] !== undefined).map((k) => [k, t[k]])),
  };
  const i = rij.findIndex((x, j) => j > 0 && x.op.soort === "thema" && x.op.t.id === t.id);
  if (i > 0) {
    const op = rij[i].op as Extract<Op, { soort: "thema" }>;
    rij[i] = { ...rij[i], op: { soort: "thema", t: { ...op.t, ...schoon } } };
    bewaarRij();
  } else {
    inRij({ soort: "thema", t: schoon });
  }
  themaCache = [...(themaCache ?? []).filter((x) => x.id !== t.id), metLogos(themaCache?.find((x) => x.id === t.id), schoon)];
  zet({ fotoVersie: state.fotoVersie + 1 });
}

// ── Aanvragen voor een eigen binder (van de klantenpagina) ──
let aanvragenLaden = false;
export async function laadAanvragen(): Promise<void> {
  const b = state.backend;
  if (!b || aanvragenLaden || !kanEtalage()) return;
  aanvragenLaden = true;
  try {
    const lijst = await b.laadAanvragen();
    // Wat hier al als bekeken/beantwoord gemarkeerd werd en nog wacht, blijft zo.
    const wacht = new Map(wachtendeOps("aanvraagStatus").map((op) => [op.id, op.status]));
    const weg = new Set(wachtendeOps("aanvraagWeg").map((op) => op.id));
    zet({ aanvragen: lijst.filter((a) => !weg.has(a.id)).map((a) => (wacht.has(a.id) ? { ...a, status: wacht.get(a.id)! } : a)) });
  } catch {
    // Geen internet of oud schema: de lijst blijft zoals ze was.
  } finally {
    aanvragenLaden = false;
  }
}

export function laadAanvraagBeelden(id: string) {
  return state.backend?.laadAanvraagBeelden(id) ?? Promise.resolve({ artwork: null, voorbeeld: null, beelden: null });
}

/** Een aanvraag wissen (spam, of afgewerkt): ze staat dan ook niet meer in de database. */
export function verwijderAanvraag(id: string) {
  rij = rij.filter((w, j) => j === 0 || !(w.op.soort === "aanvraagStatus" && w.op.id === id));
  inRij({ soort: "aanvraagWeg", id });
  zet({ aanvragen: (state.aanvragen ?? []).filter((x) => x.id !== id) });
}

export function zetAanvraagStatus(id: string, status: AanvraagStatus) {
  const a = state.aanvragen?.find((x) => x.id === id);
  if (!a || a.status === status) return;
  inRij({ soort: "aanvraagStatus", id, status });
  zet({ aanvragen: (state.aanvragen ?? []).map((x) => (x.id === id ? { ...x, status } : x)) });
}

/** Het borderel aanvullen: naam, adres, handtekeningen (na het afrekenen of later). */
export function zetTegenpartij(id: string, tegenpartij: Tegenpartij | null) {
  const t = state.transacties.find((x) => x.id === id) ?? buiten.transacties.find((x) => x.id === id);
  if (!t) return;
  inRij({ soort: "tegenpartij", id, tegenpartij }); // eerst in de wachtrij: dat is de nieuwste versie
  vervangTransactie({ ...t, tegenpartij });
}

export function conflictOplossen(id: string, oud: string, nieuw: string) {
  const t = state.transacties.find((x) => x.id === id);
  if (!t) return;
  try {
    const r = losConflictOp(state, t, oud, nieuw);
    zet({ exemplaren: r.voorraad.exemplaren });
    vervangTransactie(r.transactie);
    inRij({ soort: "conflictOplossen", id, oud, nieuw });
    meld("Conflict opgelost");
  } catch (e) { fout(e); }
}

export function conflictAanvaarden(id: string, item: string) {
  const t = state.transacties.find((x) => x.id === id);
  if (!t) return;
  vervangTransactie(aanvaardConflict(t, item));
  inRij({ soort: "conflictAanvaarden", id, item });
}

/** Enkel voor tests: start de app met een gegeven backend (zoals na het inloggen). */
export const __testGebruik = (b: Backend) => gebruik(b);
