// Eén centrale toestand voor de hele app, met acties. Componenten lezen via useApp().
//
// Elke wijziging gebeurt meteen op het toestel (zodat de app ook zonder internet
// werkt) en gaat daarna via een wachtrij naar de server. Lukt dat niet door een
// netwerkfout, dan blijft ze in de wachtrij tot er weer verbinding is.
import { useSyncExternalStore } from "react";
import { isNetwerkFout, type Backend } from "./store/backend";
import { DemoBackend } from "./store/demo";
import { SupabaseBackend } from "./store/supabase";
import type { Artikel, Beurs, Exemplaar, NieuwArtikel, NieuwExemplaar, Regel, Transactie } from "./types";
import { laadPrijsgids, type Prijsgids } from "./lib/prices";
import { prijscheck, STANDAARD_INSTELLINGEN, type Instellingen, type TeWijzigen } from "./lib/pricing";
import { vandaag } from "./lib/format";
import { laadTestset } from "./lib/testset";
import { printLabels, printerNaam, verbindPrinter, ontkoppelPrinter } from "./lib/printer";
import { laadCatalogus } from "./lib/catalog";
import { laadOcr } from "./lib/ocr";
import { uuid } from "./lib/uuid";
import { inVoorraad, metVitrineSinds, schoonArtikel, schoonExemplaar, standaardArtikel, standaardExemplaar } from "./lib/exemplaar";
import {
  aanvaardConflict, losConflictOp, maakOngedaan, nieuweRetour, nieuweTransactie, pasToe, pasTotaalAan, stand,
  type Betaling,
} from "./lib/kassa";
import { toonCode } from "./lib/code";
import { pasBodToe } from "./lib/bod";
import { INSTAGRAM } from "./config";

export interface Toast {
  id: number;
  tekst: string;
  soort: "ok" | "fout" | "info";
  actie?: { label: string; doe: () => void };
}

export type Tab = "catalogus" | "vault" | "scan" | "kassa" | "meer";

export type Open =
  | { soort: "exemplaar"; id: string }
  | { soort: "toevoegen"; kaartId?: string; catalogus?: "en" | "asia"; opslag?: "vitrine" | "stockdoos" }
  | { soort: "artikel"; id: string | null }
  | { soort: "labels" }
  | { soort: "transactie"; id: string }
  | { soort: "beurs"; id: string }
  | { soort: "overzicht" }
  | null;

export interface Mandje {
  regels: Regel[];
}

export interface State {
  fase: "start" | "login" | "laden" | "klaar";
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
  toasts: Toast[];
  online: boolean;
  wachtrij: number;
  printer: string | null;
  bezig: string | null;
  open: Open;
  tab: Tab;
  mandje: Mandje;
}

const MODUS = "bindr-modus";
const PRIJSCHECK = "bindr-prijscheck-v1";
const INSTELLINGEN = "bindr-instellingen-v1";
const MANDJE = "bindr-mandje-v1";

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
  return ["catalogus", "vault", "scan", "kassa", "meer"].includes(h) ? h : "catalogus";
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
  toasts: [],
  online: typeof navigator === "undefined" ? true : navigator.onLine,
  wachtrij: 0,
  printer: null,
  bezig: null,
  open: null,
  tab: beginTab(),
  mandje: leesJson<Mandje>(MANDJE, { regels: [] }),
};

const luisteraars = new Set<() => void>();
function zet(deel: Partial<State>) {
  state = { ...state, ...deel };
  if ("exemplaren" in deel || "artikelen" in deel || "beurzen" in deel || "transacties" in deel) bewaarKopieLater();
  if ("mandje" in deel) schrijf(MANDJE, state.mandje);
  luisteraars.forEach((l) => l());
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
export function meld(tekst: string, soort: Toast["soort"] = "ok", actie?: Toast["actie"], ms = 4200) {
  const t: Toast = { id: toastId++, tekst, soort, actie };
  zet({ toasts: [...state.toasts, t].slice(-3) });
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
export function openArtikel(id: string | null) { zet({ open: { soort: "artikel", id } }); }
export function openToevoegen(kaartId?: string, catalogus?: "en" | "asia", opslag?: "vitrine" | "stockdoos") {
  zet({ open: { soort: "toevoegen", kaartId, catalogus, opslag } });
}
export function openLabels() { zet({ open: { soort: "labels" } }); }
export function openTransactie(id: string) { zet({ open: { soort: "transactie", id } }); }
export function openBeurs(id: string) { zet({ open: { soort: "beurs", id } }); }
export function openOverzicht() { zet({ open: { soort: "overzicht" } }); }
export function sluit() { zet({ open: null }); }

// ── Kopie op het toestel (Supabase): om offline te kunnen starten ────────────
const kopieSleutel = (b: Backend) => `bindr-kopie-v2-${b.gebruikerId() ?? "?"}`;
let kopieTimer: ReturnType<typeof setTimeout> | null = null;
function bewaarKopieLater() {
  const b = state.backend;
  if (!b || b.soort !== "supabase" || state.fase !== "klaar") return;
  if (kopieTimer) clearTimeout(kopieTimer);
  kopieTimer = setTimeout(() => {
    schrijf(kopieSleutel(b), {
      op: new Date().toISOString(),
      exemplaren: state.exemplaren, artikelen: state.artikelen, beurzen: state.beurzen, transacties: state.transacties,
    });
  }, 800);
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
  | { soort: "transactie"; t: Transactie }
  | { soort: "ongedaan"; id: string }
  | { soort: "conflictOplossen"; id: string; oud: string; nieuw: string }
  | { soort: "conflictAanvaarden"; id: string; item: string }
  | { soort: "instelling"; sleutel: string; waarde: unknown };

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
  if (state.backend) schrijf(rijSleutel(state.backend), rij);
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
    case "instelling": await b.bewaarInstelling(op.sleutel, op.waarde); break;
    case "transactie": {
      const t = await b.boekTransactie(op.t);
      const lokaal = state.transacties.find((x) => x.id === t.id);
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

function vervangTransactie(t: Transactie) {
  const i = state.transacties.findIndex((x) => x.id === t.id);
  zet({ transacties: i < 0 ? [...state.transacties, t] : state.transacties.map((x) => (x.id === t.id ? t : x)) });
}

// ── Start, login, demo ───────────────────────────────────────────────────────
/** Wachtrij doorsturen en daarna de verse toestand ophalen. */
export async function synchroniseer() {
  if (await spoel()) await herlaad();
}

let gestart = false;
export async function start() {
  if (!gestart && typeof window !== "undefined") {
    gestart = true;
    window.addEventListener("online", () => { zet({ online: true }); void synchroniseer(); });
    window.addEventListener("offline", () => zet({ online: false }));
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && state.fase === "klaar") void synchroniseer();
    });
    setInterval(() => {
      if (document.visibilityState === "visible" && state.fase === "klaar" && state.backend?.soort === "supabase") {
        void synchroniseer();
      }
    }, 180000);
  }
  const modus = localStorage.getItem(MODUS);
  const backend = modus === "demo" ? new DemoBackend() : SupabaseBackend.herstel();
  if (!backend) return zet({ fase: "login" });
  await gebruik(backend);
}

async function gebruik(backend: Backend) {
  zet({ backend, fase: "laden" });
  laadRij(backend);
  const pc = leesJson<{ datum: string | null; items: TeWijzigen[] }>(PRIJSCHECK + backend.soort, { datum: null, items: [] });
  zet({ teWijzigen: new Map(pc.items.map((t) => [t.id, t])), prijscheckOp: pc.datum });
  try {
    await spoel();
    const [alles, gids, beheerders, gedeeld] = await Promise.all([
      backend.laadAlles(), laadPrijsgids(), backend.laadBeheerders().catch(() => []), backend.laadInstellingen().catch(() => ({})),
    ]);
    zet({ ...alles, gids, beheerders: Object.fromEntries(beheerders.map((b) => [b.user_id, b.naam])), fase: "klaar" });
    pasGedeeldToe(gedeeld);
    bewaarKopieLater();
    if ((backend as { schemaOud?: boolean }).schemaOud) {
      meld("De database is nog niet bijgewerkt voor de kassa. Voer supabase/schema.sql opnieuw uit in Supabase.", "fout", undefined, 15000);
    }
  } catch (e) {
    const kopie = backend.soort === "supabase" && isNetwerkFout(e) ? leesKopie(backend) : null;
    if (kopie) {
      const gids = await laadPrijsgids();
      zet({
        exemplaren: kopie.exemplaren.map(schoonExemplaar), artikelen: (kopie.artikelen ?? []).map(schoonArtikel), beurzen: kopie.beurzen ?? [], transacties: kopie.transacties ?? [],
        gids, fase: "klaar", online: false,
      });
      meld("Geen verbinding: je werkt met de voorraad op dit toestel. Wijzigingen gaan door zodra er internet is.", "info", undefined, 7000);
      return;
    }
    fout(e);
    zet({ fase: backend.soort === "demo" ? "klaar" : "login", backend: backend.soort === "demo" ? backend : null });
  }
}

function pasGedeeldToe(g: Record<string, unknown>) {
  const pr = g.prijsregels as Partial<Instellingen> | undefined;
  const deel: Partial<State> = { instagram: typeof g.instagram === "string" && g.instagram ? g.instagram : INSTAGRAM };
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
  if (rij.length && !confirm(`Er wachten nog ${rij.length} wijzigingen op internet. Toch uitloggen? Dan gaan ze verloren.`)) return;
  await state.backend?.logUit();
  if (state.backend) localStorage.removeItem(rijSleutel(state.backend));
  rij = [];
  localStorage.removeItem(MODUS);
  zet({ backend: null, fase: "login", exemplaren: [], artikelen: [], beurzen: [], transacties: [], teWijzigen: new Map(), prijscheckOp: null, open: null, wachtrij: 0, mandje: { regels: [] } });
}

/** Haalt de verse toestand van de server (bv. wat andere toestellen deden). Enkel als de wachtrij leeg is. */
export async function herlaad() {
  if (!state.backend || rij.length) return;
  try {
    const alles = await state.backend.laadAlles();
    if (rij.length) return; // ondertussen iets gewijzigd: volgende keer
    zet({ ...alles, online: true });
  } catch (e) {
    if (isNetwerkFout(e)) zet({ online: false }); else fout(e);
  }
}

export async function wisDemo() {
  DemoBackend.wis();
  localStorage.removeItem(PRIJSCHECK + "demo");
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
  const codes = new Set(state.exemplaren.map((e) => e.code));
  for (const r of rijen) {
    if (codes.has(r.code)) throw new Error(`Code ${toonCode(r.code)} bestaat al`);
    codes.add(r.code);
  }
  const nu = new Date().toISOString();
  const metId = rijen.map((r) => ({ ...r, id: r.id ?? uuid() }));
  const nieuw = metId.map((r) => standaardExemplaar(r, nu));
  zet({ exemplaren: [...state.exemplaren, ...nieuw] });
  inRij({ soort: "exemplarenNieuw", rijen: metId });
  return nieuw;
}

/** Wijzigt één exemplaar; met `ongedaan` krijgt de melding een knop om terug te zetten. */
export function wijzig(id: string, wijziging: Partial<Exemplaar>, melding?: string, ongedaan = false): Exemplaar | undefined {
  const oud = state.exemplaren.find((e) => e.id === id);
  if (!oud) return;
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
  const a = standaardArtikel({ ...r, id: r.id ?? uuid() });
  zet({ artikelen: [...state.artikelen, a] });
  inRij({ soort: "artikelenNieuw", rijen: [a] });
  return a;
}
export function wijzigArtikel(id: string, w: Partial<Artikel>, melding?: string) {
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
function bewaarPrijscheck(m: Map<string, TeWijzigen>, datum: string | null) {
  if (!state.backend) return;
  schrijf(PRIJSCHECK + state.backend.soort, { datum, items: [...m.values()] });
}

export async function doePrijscheck(): Promise<TeWijzigen[]> {
  zet({ bezig: "Prijzen nakijken…" });
  try {
    const gids = (await laadPrijsgids(true)) || state.gids;
    if (!gids) {
      meld("Er is nog geen prijsgids beschikbaar. Die komt elke nacht binnen.", "fout");
      return [];
    }
    const lijst = prijscheck(state.exemplaren, gids, state.instellingen);
    const m = new Map(lijst.map((t) => [t.id, t]));
    zet({ gids, teWijzigen: m, prijscheckOp: vandaag() });
    bewaarPrijscheck(m, vandaag());
    meld(lijst.length ? `${lijst.length} hartjes moeten wisselen` : "Alle hartjes zijn nog goed", lijst.length ? "info" : "ok");
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
  const w: Partial<Exemplaar> = { hartjesprijs: prijs, hartjesdatum: vandaag(), verkoopprijs: prijs };
  if (handmatig !== undefined) w.prijs_handmatig = handmatig;
  const ok = wijzig(id, w, `Hartje van ${prijs} euro bewaard`, true);
  if (ok && state.teWijzigen.has(id)) {
    const m = new Map(state.teWijzigen);
    m.delete(id);
    zet({ teWijzigen: m });
    bewaarPrijscheck(m, state.prijscheckOp);
  }
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

export async function print(ids: string[]) {
  const ex = ids.map((id) => state.exemplaren.find((e) => e.id === id)).filter(Boolean) as Exemplaar[];
  if (!ex.length) return;
  zet({ bezig: ex.length === 1 ? "Label printen…" : `${ex.length} labels printen…` });
  try {
    await printLabels(ex, state.instellingen.labelMaat, (s) => zet({ bezig: s === "ok" ? "Klaar" : `Printen: ${s}` }));
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
    await printLabels([proef], state.instellingen.labelMaat, (s) => zet({ bezig: s === "ok" ? "Klaar" : `Printen: ${s}` }));
    zet({ printer: printerNaam() });
    meld("Proeflabel geprint. Scan het met Scan om de QR-code te testen.");
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

export function zetInstagram(naam: string) {
  const schoon = naam.trim().replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//, "").replace(/\/.*$/, "");
  zet({ instagram: schoon });
  inRij({ soort: "instelling", sleutel: "instagram", waarde: schoon });
}

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

export function startBeurs(gegevens: { naam: string; datum: string; startkas: number }): Beurs {
  const al = actieveBeurs();
  if (al) throw new Error(`${al.naam} is nog bezig. Sluit die eerst af.`);
  const b: Beurs = {
    id: uuid(), naam: gegevens.naam.trim() || `Beurs ${gegevens.datum}`, datum: gegevens.datum, standgeld: null,
    startkas: gegevens.startkas, status: "actief", gestart_op: new Date().toISOString(), afgesloten_op: null,
    getelde_kas: null, sumup_bevestigd: false, stand_start: stand(state), stand_einde: null, opmerking: null,
  };
  zet({ beurzen: [b, ...state.beurzen] });
  inRij({ soort: "beurs", beurs: b });
  meld(`${b.naam} gestart met ${gegevens.startkas} euro in de cashkoffer`);
  return b;
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
const zetRegels = (regels: Regel[]) => zet({ mandje: { regels } });

export function inMandje(r: Regel) {
  const dubbel = r.exemplaar_id && state.mandje.regels.some((x) => x.exemplaar_id === r.exemplaar_id && x.richting === r.richting);
  if (dubbel) { meld("Dat exemplaar zit al in het mandje", "info"); return; }
  if (r.artikel_id && r.richting === "uit") {
    const i = state.mandje.regels.findIndex((x) => x.artikel_id === r.artikel_id && x.richting === "uit");
    if (i >= 0) {
      const x = state.mandje.regels[i];
      const per = (x.hartjesprijs ?? 0) / (x.aantal ?? 1);
      const aantal = (x.aantal ?? 1) + (r.aantal ?? 1);
      const regels = state.mandje.regels.slice();
      regels[i] = { ...x, aantal, hartjesprijs: per * aantal, prijs: Math.round(per * aantal * 100) / 100 };
      return zetRegels(regels);
    }
  }
  zetRegels([...state.mandje.regels, r]);
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
  zetRegels(pasBodToe(state.mandje.regels, bod));
}
export function leegMandje() {
  zetRegels([]);
}

/** Boekt een transactie: meteen op dit toestel, daarna via de wachtrij naar de server. */
function boek(t: Transactie): Transactie {
  const r = pasToe(state, { ...t, beheerder: state.backend?.gebruikerId() ?? null });
  zet({ exemplaren: r.voorraad.exemplaren, artikelen: r.voorraad.artikelen, transacties: [...state.transacties, r.transactie] });
  inRij({ soort: "transactie", t: r.transactie });
  return r.transactie;
}

/** Rekent het mandje af. Geeft de transactie terug; 5 seconden lang kan ze ongedaan. */
export function afrekenen(b: Betaling, opmerking: string | null = null): Transactie {
  const beurs = actieveBeurs();
  const t = boek(nieuweTransactie(state.mandje.regels, b, beurs?.id ?? null, opmerking));
  leegMandje();
  if (t.status === "conflict") meld("Let op: niet alles kon afgeboekt worden. Bekijk de transactie.", "fout", { label: "Bekijk", doe: () => openTransactie(t.id) }, 8000);
  else meld(woordVoor(t), "ok", { label: "Ongedaan maken", doe: () => ongedaanMaken(t.id) }, 5500);
  return t;
}

function woordVoor(t: Transactie) {
  const bedrag = Math.abs(t.totaal).toLocaleString("nl-BE", { style: "currency", currency: "EUR" });
  if (t.soort === "verkoop") return `Verkocht voor ${bedrag}`;
  if (t.soort === "inkoop") return `Ingekocht voor ${bedrag}`;
  if (t.soort === "retour") return `Retour: ${bedrag} terug`;
  return t.totaal > 0 ? `Ruil, klant betaalde ${bedrag}` : t.totaal < 0 ? `Ruil, wij betaalden ${bedrag}` : "Ruil zonder geld";
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

export function retour(regels: Regel[], terug: number) {
  const beurs = actieveBeurs();
  return boek(nieuweRetour(regels, terug, beurs?.id ?? null));
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
