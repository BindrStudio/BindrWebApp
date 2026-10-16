// Inloggen: een sterk wachtwoord voor het account, een pincode van 6 cijfers per toestel.
//
// Het wachtwoord van je Supabase-account vraagt de app enkel op een nieuwe gsm of als je sessie
// verliep. De pincode opent de app op deze gsm (ook zonder internet op de beurs) en gaat nooit naar
// de server: dit toestel onthoudt wie je bent (e-mail en naam) en een gezouten hash van de pincode.
// Na 10 foute pincodes wist de gsm de sessie en moet je opnieuw inloggen met je wachtwoord.
//
// Tot 0.10 was de pincode ook het wachtwoord (een record zonder `v`). Zo'n toestel vraagt na het
// ontgrendelen eerst een sterk wachtwoord; de pincode blijft dezelfde.

const SLEUTEL = "bindr-pin-v1";
const ACTIEF = "bindr-actief-v1";
const POGINGEN = "bindr-pin-pogingen-v1";
export const VERGRENDEL_NA_MS = 10 * 60 * 1000; // 10 minuten niets gedaan of weg uit de app

export interface PinRecord {
  email: string;
  naam: string | null;
  user_id: string;
  zout: string;
  hash: string;
  /** 2 = enkel voor dit toestel. Ontbreekt = van vóór 0.11, toen de pincode ook het wachtwoord was. */
  v?: 2;
}

/** Na zoveel foute pincodes wist de gsm de sessie (opnieuw inloggen met het wachtwoord). */
export const MAX_POGINGEN = 10;

function lees<T>(sleutel: string): T | null {
  try { return JSON.parse(localStorage.getItem(sleutel) || "null") as T | null; } catch { return null; }
}
function schrijf(sleutel: string, w: unknown) {
  try { localStorage.setItem(sleutel, JSON.stringify(w)); } catch { /* privé-modus */ }
}

const hex = (b: ArrayBuffer | Uint8Array) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");

async function hashVan(pin: string, zout: string): Promise<string> {
  const sleutel = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: new TextEncoder().encode(zout), iterations: 150000 }, sleutel, 256);
  return hex(bits);
}

export function leesPin(): PinRecord | null {
  const r = lees<PinRecord>(SLEUTEL);
  return r && r.hash && r.email ? r : null;
}

/** Na een geslaagde login of een nieuwe pincode: onthoud wie dit toestel gebruikt. */
export async function bewaarPin(info: { email: string; naam?: string | null; user_id: string }, pin: string) {
  const zout = hex(crypto.getRandomValues(new Uint8Array(16)));
  schrijf(SLEUTEL, { email: info.email, naam: info.naam ?? null, user_id: info.user_id, zout, hash: await hashVan(pin, zout), v: 2 } satisfies PinRecord);
  wisPogingen();
}

/** Een pincode van vóór 0.11: toen was ze ook het wachtwoord van het account. */
export const isOudePin = (r: PinRecord | null) => !!r && r.v !== 2;

/** Na een nieuw wachtwoord: de oude pincode is niet langer het wachtwoord, enkel nog de pincode van dit toestel. */
export function maakPinVanToestel() {
  const r = leesPin();
  if (r && r.v !== 2) schrijf(SLEUTEL, { ...r, v: 2 } satisfies PinRecord);
}

export function wisPin() {
  try { localStorage.removeItem(SLEUTEL); } catch { /* */ }
  wisPogingen();
}

/** Controleert de pincode op dit toestel (werkt ook offline). */
export async function controleerPin(pin: string): Promise<boolean> {
  const r = leesPin();
  if (!r) return false;
  const ok = (await hashVan(pin, r.zout)) === r.hash;
  if (ok) wisPogingen(); else telPoging();
  return ok;
}

const VAAK = new Set(["147258", "258369", "159753", "357159", "147852", "789456", "456789", "102030", "010203", "142536", "131313", "202020", "696969", "112358", "314159", "271828", "100200", "200000", "123654"]);

/** Een geldige pincode: 6 cijfers, en niet te makkelijk te raden. */
export function pinFout(pin: string): string | null {
  if (!/^\d{6}$/.test(pin)) return "Een pincode heeft 6 cijfers.";
  if (/^(\d)\1{5}$/.test(pin)) return "Niet zes keer hetzelfde cijfer.";
  if ("01234567890123456".includes(pin) || "98765432109876543".includes(pin)) return "Geen reeks zoals 123456.";
  // Patronen die mensen vaak kiezen (en die je dus snel raadt): 121212, 123123, 112233, 123321.
  if (/^(\d\d)\1\1$/.test(pin) || /^(\d{3})\1$/.test(pin) || /^(\d)\1(\d)\2(\d)\3$/.test(pin) || pin === [...pin].reverse().join("")) {
    return "Te makkelijk te raden. Kies 6 cijfers zonder patroon.";
  }
  if (VAAK.has(pin)) return "Die pincode kiezen veel mensen. Kies een andere.";
  return null;
}

/** Het minimum voor een wachtwoord (zet in Supabase dezelfde minimale lengte, zie de README). */
export const WACHTWOORD_MIN = 12;
const ZWAK = ["wachtwoord", "paswoord", "password", "bindr", "pokemon", "azerty", "qwerty", "welkom", "123456"];

/** Een sterk wachtwoord: minstens 12 tekens, niet enkel cijfers en geen voor de hand liggend woord. */
export function wachtwoordFout(w: string, email?: string): string | null {
  if (w.length < WACHTWOORD_MIN) return `Minstens ${WACHTWOORD_MIN} tekens (nu ${w.length}).`;
  if (/^\d+$/.test(w)) return "Niet enkel cijfers: dat is een pincode, geen wachtwoord.";
  if (/^(.)\1+$/.test(w) || new Set(w.toLowerCase()).size < 5) return "Te weinig verschillende tekens.";
  const klein = w.toLowerCase().replace(/[^a-z0-9]/g, "");
  const naam = email?.split("@")[0]?.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (naam && naam.length >= 4 && klein.includes(naam)) return "Niet je e-mailadres in je wachtwoord.";
  // Een bekend woord met wat cijfers of tekens errond (Wachtwoord2026!, Bindr123456) is snel geraden.
  for (const z of ZWAK) if (klein.includes(z) && klein.replace(z, "").replace(/\d/g, "").length < 4) return "Te makkelijk te raden. Kies een zin van een paar woorden.";
  return null;
}

// ── Vergrendelen na een tijd niets doen ─────────────────────────────────────

export function markeerActief() {
  try { localStorage.setItem(ACTIEF, String(Date.now())); } catch { /* */ }
}

export function isVergrendeld(nu = Date.now()): boolean {
  const t = Number((() => { try { return localStorage.getItem(ACTIEF); } catch { return null; } })() || 0);
  return !t || nu - t > VERGRENDEL_NA_MS;
}

// ── Te veel foute pogingen: even wachten ────────────────────────────────────

interface Pogingen { aantal: number; tot: number }

function telPoging() {
  const p = lees<Pogingen>(POGINGEN) ?? { aantal: 0, tot: 0 };
  const aantal = p.aantal + 1;
  // Na 5 foute pogingen 30 seconden wachten, daarna telkens langer; na 10 wist de app de sessie.
  const tot = aantal >= 5 ? Date.now() + Math.min(15 * 60, 30 * 2 ** (aantal - 5)) * 1000 : 0;
  schrijf(POGINGEN, { aantal, tot });
}

/** Te veel foute pincodes op dit toestel: de sessie moet weg. */
export function teVeelPogingen(): boolean {
  return (lees<Pogingen>(POGINGEN)?.aantal ?? 0) >= MAX_POGINGEN;
}

/** Hoeveel pogingen er nog zijn voor de gsm de sessie wist. */
export function pogingenOver(): number {
  return Math.max(0, MAX_POGINGEN - (lees<Pogingen>(POGINGEN)?.aantal ?? 0));
}

export function wisPogingen() {
  try { localStorage.removeItem(POGINGEN); } catch { /* */ }
}

/** Seconden die je nog moet wachten (0 = je mag proberen). */
export function wachtNog(nu = Date.now()): number {
  const p = lees<Pogingen>(POGINGEN);
  return p && p.tot > nu ? Math.ceil((p.tot - nu) / 1000) : 0;
}
