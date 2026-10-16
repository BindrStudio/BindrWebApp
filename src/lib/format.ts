const euroFmt = new Intl.NumberFormat("nl-BE", { style: "currency", currency: "EUR" });
const euroHeel = new Intl.NumberFormat("nl-BE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

export function euro(n: number | null | undefined, heel = false): string {
  if (n == null || Number.isNaN(n)) return "–";
  return (heel || Number.isInteger(n) ? euroHeel : euroFmt).format(n);
}

/** De dag (in België) van een tijdstip: JJJJ-MM-DD. Zo ligt een verkoop om 00:30 op de juiste dag. */
export function dagVan(iso: string): string {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(iso));
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${v("year")}-${v("month")}-${v("day")}`;
}

export function vandaag(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const maanden = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
export function datumKort(iso: string | null | undefined): string {
  if (!iso) return "–";
  const [j, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!j || !m || !d) return iso;
  const ditJaar = new Date().getFullYear() === j;
  return `${d} ${maanden[m - 1]}${ditJaar ? "" : " " + j}`;
}

export function dagenGeleden(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso.slice(0, 10) + "T00:00:00");
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 86400000));
}

export function getal(s: string): number | null {
  const t = s.trim().replace(/[€\s]/g, "").replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function zonderAccenten(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}
