// Inloggen met een pincode van 6 cijfers.
//
// De pincode is het wachtwoord van je Supabase-account. Dit toestel onthoudt wie je bent
// (e-mail en naam) en een gezouten hash van de pincode, zodat je de app ook zonder
// internet kunt ontgrendelen op de beurs. De pincode zelf wordt nergens bewaard.

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
}

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
  schrijf(SLEUTEL, { email: info.email, naam: info.naam ?? null, user_id: info.user_id, zout, hash: await hashVan(pin, zout) } satisfies PinRecord);
  wisPogingen();
}

export function wisPin() {
  try { localStorage.removeItem(SLEUTEL); } catch { /* */ }
}

/** Controleert de pincode op dit toestel (werkt ook offline). */
export async function controleerPin(pin: string): Promise<boolean> {
  const r = leesPin();
  if (!r) return false;
  const ok = (await hashVan(pin, r.zout)) === r.hash;
  if (ok) wisPogingen(); else telPoging();
  return ok;
}

/** Een geldige pincode: 6 cijfers, en niet te makkelijk te raden. */
export function pinFout(pin: string): string | null {
  if (!/^\d{6}$/.test(pin)) return "Een pincode heeft 6 cijfers.";
  if (/^(\d)\1{5}$/.test(pin)) return "Niet zes keer hetzelfde cijfer.";
  if ("01234567890123456".includes(pin) || "98765432109876543".includes(pin)) return "Geen reeks zoals 123456.";
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
  // Na 5 foute pogingen 30 seconden wachten, daarna telkens langer.
  const tot = aantal >= 5 ? Date.now() + Math.min(15 * 60, 30 * 2 ** (aantal - 5)) * 1000 : 0;
  schrijf(POGINGEN, { aantal, tot });
}

function wisPogingen() {
  try { localStorage.removeItem(POGINGEN); } catch { /* */ }
}

/** Seconden die je nog moet wachten (0 = je mag proberen). */
export function wachtNog(nu = Date.now()): number {
  const p = lees<Pogingen>(POGINGEN);
  return p && p.tot > nu ? Math.ceil((p.tot - nu) / 1000) : 0;
}
