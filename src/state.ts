// Eén centrale toestand voor de hele app, met acties. Componenten lezen via useApp().
import { useSyncExternalStore } from "react";
import type { Backend } from "./store/backend";
import { DemoBackend } from "./store/demo";
import { SupabaseBackend } from "./store/supabase";
import type { Artikel, Exemplaar, NieuwArtikel, NieuwExemplaar } from "./types";
import { laadPrijsgids, type Prijsgids } from "./lib/prices";
import { prijscheck, STANDAARD_INSTELLINGEN, type Instellingen, type TeWijzigen } from "./lib/pricing";
import { vandaag } from "./lib/format";
import { laadTestset } from "./lib/testset";
import { printLabels, printerNaam, verbindPrinter, ontkoppelPrinter } from "./lib/printer";
import { laadCatalogus } from "./lib/catalog";
import { laadOcr } from "./lib/ocr";

export interface Toast {
  id: number;
  tekst: string;
  soort: "ok" | "fout" | "info";
  actie?: { label: string; doe: () => void };
}

export interface State {
  fase: "start" | "login" | "laden" | "klaar";
  backend: Backend | null;
  exemplaren: Exemplaar[];
  artikelen: Artikel[];
  gids: Prijsgids | null;
  teWijzigen: Map<string, TeWijzigen>;
  prijscheckOp: string | null;
  instellingen: Instellingen;
  toasts: Toast[];
  online: boolean;
  printer: string | null;
  bezig: string | null;
  open: { soort: "exemplaar"; id: string } | { soort: "toevoegen"; kaartId?: string; catalogus?: "en" | "asia" } | null;
}

const MODUS = "bindr-modus";
const PRIJSCHECK = "bindr-prijscheck-v1";
const INSTELLINGEN = "bindr-instellingen-v1";

function leesJson<T>(sleutel: string, standaard: T): T {
  try {
    const v = localStorage.getItem(sleutel);
    return v ? { ...standaard, ...JSON.parse(v) } : standaard;
  } catch {
    return standaard;
  }
}

let state: State = {
  fase: "start",
  backend: null,
  exemplaren: [],
  artikelen: [],
  gids: null,
  teWijzigen: new Map(),
  prijscheckOp: null,
  instellingen: leesJson(INSTELLINGEN, STANDAARD_INSTELLINGEN),
  toasts: [],
  online: typeof navigator === "undefined" ? true : navigator.onLine,
  printer: null,
  bezig: null,
  open: null,
};

const luisteraars = new Set<() => void>();
function zet(deel: Partial<State>) {
  state = { ...state, ...deel };
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
export function openExemplaar(id: string) { zet({ open: { soort: "exemplaar", id } }); }
export function openToevoegen(kaartId?: string, catalogus?: "en" | "asia") { zet({ open: { soort: "toevoegen", kaartId, catalogus } }); }
export function sluit() { zet({ open: null }); }

// ── Start, login, demo ───────────────────────────────────────────────────────
export async function start() {
  if (typeof window !== "undefined") {
    window.addEventListener("online", () => zet({ online: true }));
    window.addEventListener("offline", () => zet({ online: false }));
  }
  const modus = localStorage.getItem(MODUS);
  const backend = modus === "demo" ? new DemoBackend() : SupabaseBackend.herstel();
  if (!backend) return zet({ fase: "login" });
  await gebruik(backend);
}

async function gebruik(backend: Backend) {
  zet({ backend, fase: "laden" });
  try {
    const [{ exemplaren, artikelen }, gids] = await Promise.all([backend.laadAlles(), laadPrijsgids()]);
    const pc = leesJson<{ datum: string | null; items: TeWijzigen[] }>(PRIJSCHECK + backend.soort, { datum: null, items: [] });
    zet({ exemplaren, artikelen, gids, fase: "klaar", teWijzigen: new Map(pc.items.map((t) => [t.id, t])), prijscheckOp: pc.datum });
    if ((backend as { uitKopie?: boolean }).uitKopie) {
      zet({ online: false });
      meld("Geen verbinding: je ziet de laatst geladen voorraad. Wijzigen kan pas weer met internet.", "info", undefined, 7000);
    }
  } catch (e) {
    fout(e);
    zet({ fase: backend.soort === "demo" ? "klaar" : "login", backend: backend.soort === "demo" ? backend : null });
  }
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
  await state.backend?.logUit();
  localStorage.removeItem(MODUS);
  zet({ backend: null, fase: "login", exemplaren: [], artikelen: [], teWijzigen: new Map(), prijscheckOp: null, open: null });
}

export async function herlaad() {
  if (!state.backend) return;
  try {
    const { exemplaren, artikelen } = await state.backend.laadAlles();
    zet({ exemplaren, artikelen });
  } catch (e) { fout(e); }
}

export async function wisDemo() {
  DemoBackend.wis();
  localStorage.removeItem(PRIJSCHECK + "demo");
  await gebruik(new DemoBackend());
}

// ── Exemplaren ───────────────────────────────────────────────────────────────
function vervang(nieuw: Exemplaar[]) {
  const per = new Map(nieuw.map((e) => [e.id, e]));
  zet({ exemplaren: state.exemplaren.map((e) => per.get(e.id) || e) });
}

export async function voegToe(rijen: NieuwExemplaar[]): Promise<Exemplaar[]> {
  if (!state.backend) throw new Error("Niet ingelogd");
  const nieuw = await state.backend.voegExemplarenToe(rijen);
  zet({ exemplaren: [...state.exemplaren, ...nieuw] });
  return nieuw;
}

/** Wijzigt één exemplaar; met `ongedaan` krijgt de melding een knop om terug te zetten. */
export async function wijzig(id: string, wijziging: Partial<Exemplaar>, melding?: string, ongedaan = false) {
  if (!state.backend) return;
  const oud = state.exemplaren.find((e) => e.id === id);
  try {
    const nieuw = await state.backend.wijzigExemplaar(id, wijziging);
    vervang([nieuw]);
    if (melding) {
      const terug = oud ? Object.fromEntries(Object.keys(wijziging).map((k) => [k, oud[k as keyof Exemplaar]])) : null;
      meld(melding, "ok", ongedaan && terug ? { label: "Ongedaan maken", doe: () => void wijzig(id, terug as Partial<Exemplaar>, "Teruggezet") } : undefined);
    }
    return nieuw;
  } catch (e) { fout(e); }
}

export async function wijzigVeel(ids: string[], wijziging: Partial<Exemplaar>) {
  if (!state.backend || !ids.length) return;
  try { vervang(await state.backend.wijzigExemplaren(ids, wijziging)); } catch (e) { fout(e); }
}

// ── Artikelen ────────────────────────────────────────────────────────────────
export async function voegArtikelToe(r: NieuwArtikel) {
  if (!state.backend) return;
  try {
    const [a] = await state.backend.voegArtikelenToe([r]);
    zet({ artikelen: [...state.artikelen, a] });
  } catch (e) { fout(e); }
}
export async function wijzigArtikel(id: string, w: Partial<Artikel>) {
  if (!state.backend) return;
  try {
    const a = await state.backend.wijzigArtikel(id, w);
    zet({ artikelen: state.artikelen.map((x) => (x.id === id ? a : x)) });
  } catch (e) { fout(e); }
}

// ── Testset ──────────────────────────────────────────────────────────────────
export async function importeerTestset() {
  if (!state.backend) return;
  zet({ bezig: "Testset inladen…" });
  try {
    const { exemplaren, artikelen } = await laadTestset();
    const bestaand = new Set(state.exemplaren.map((e) => e.code));
    const nieuw = exemplaren.filter((e) => !bestaand.has(e.code));
    const ex = nieuw.length ? await state.backend.voegExemplarenToe(nieuw) : [];
    const art = state.artikelen.length ? [] : await state.backend.voegArtikelenToe(artikelen);
    zet({ exemplaren: [...state.exemplaren, ...ex], artikelen: [...state.artikelen, ...art] });
    meld(`${ex.length} exemplaren en ${art.length} artikelen ingeladen`);
  } catch (e) { fout(e); } finally { zet({ bezig: null }); }
}

// ── Prijzen nakijken ─────────────────────────────────────────────────────────
function bewaarPrijscheck(m: Map<string, TeWijzigen>, datum: string | null) {
  if (!state.backend) return;
  localStorage.setItem(PRIJSCHECK + state.backend.soort, JSON.stringify({ datum, items: [...m.values()] }));
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
export async function zetHartje(id: string, prijs: number, handmatig?: boolean) {
  const w: Partial<Exemplaar> = { hartjesprijs: prijs, hartjesdatum: vandaag(), verkoopprijs: prijs };
  if (handmatig !== undefined) w.prijs_handmatig = handmatig;
  const ok = await wijzig(id, w, `Hartje van ${prijs} euro bewaard`, true);
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
    await wijzigVeel(ex.filter((e) => e.label_status === "te printen").map((e) => e.id), { label_status: "geprint" });
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
export async function bevestigLabel(ex: Exemplaar) {
  if (ex.label_status === "gestickerd") return;
  await wijzig(ex.id, { label_status: "gestickerd" }, `Label ${ex.code.slice(0, 3)}-${ex.code.slice(3)} bevestigd`);
}

export function zetInstellingen(i: Partial<Instellingen>) {
  const nieuw = { ...state.instellingen, ...i };
  localStorage.setItem(INSTELLINGEN, JSON.stringify(nieuw));
  zet({ instellingen: nieuw });
}

/**
 * Alles op dit toestel zetten voor een beurs zonder internet: catalogus, prijsgids,
 * de foto's van alle exemplaren in voorraad en de tekstherkenning. De service worker bewaart ze.
 */
export async function offlineKlaarzetten(): Promise<{ fotos: number; mislukt: number; ocr: boolean }> {
  zet({ bezig: "Catalogus en prijzen laden…" });
  try {
    await Promise.all([laadCatalogus("en"), laadCatalogus("asia"), laadPrijsgids(true)]);
    const urls = [...new Set(state.exemplaren
      .filter((e) => (e.status === "in voorraad" || e.status === "gereserveerd") && e.afbeelding)
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
    localStorage.setItem("bindr-offline-v1", JSON.stringify({ ...uit, op: new Date().toISOString(), aantal: state.exemplaren.length }));
    meld(mislukt || !ocr ? "Offline klaar, maar niet alles kon geladen worden. Probeer opnieuw met goede wifi." : "Klaar voor offline", mislukt || !ocr ? "info" : "ok");
    return uit;
  } finally {
    zet({ bezig: null });
  }
}

export function zetBezig(b: string | null) { zet({ bezig: b }); }
