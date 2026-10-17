// Thema's op de klantenpagina: een feest of seizoen (Halloween, kerst …) met een eigen logo, kleur, versiering
// in de achtergrond en een korte zin. Gedeeld door het beheer (Profiel › Thema) en de klantenpagina: enkel
// gegevens en rekenwerk, geen React.
import type { Thema } from "../types";

/** Een vormpje voor de versiering, in een vak van 24 × 24 (lagen van boven naar onder getekend). */
export interface Laag { d: string; fill?: string; stroke?: string; sw?: number; opacity?: number }
export type Vorm = Laag[];

/** Een ellips als pad (zo blijft elke laag een pad). */
const ellips = (cx: number, cy: number, rx: number, ry = rx) => `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0Z`;
const INKT = "#3b2a12";

export const VORMEN = {
  ster: [{ d: "M12 1c.7 5.6 3.4 9.3 11 11-7.6 1.7-10.3 5.4-11 11-.7-5.6-3.4-9.3-11-11 7.6-1.7 10.3-5.4 11-11Z", fill: "#f2c662" }],
  pompoen: [
    { d: "M11.2 7.6c-.1-1.9.3-3.4 1.6-4.4l1.2 1c-.9.8-1.2 1.9-1.1 3.4Z", fill: "#5f7d3a" },
    { d: ellips(8.4, 14.4, 5.4, 6.4), fill: "#de6f24" },
    { d: ellips(15.6, 14.4, 5.4, 6.4), fill: "#de6f24" },
    { d: ellips(12, 14.4, 4.6, 6.9), fill: "#f08a35" },
    { d: "M8.4 12.6 10 10.4l1.4 2.2ZM12.6 12.6 14 10.4l1.6 2.2Z", fill: INKT },
    { d: "M8.6 15.4c1.6 1.9 5.2 1.9 6.8 0-.6 2.7-6.2 2.7-6.8 0Z", fill: INKT },
  ],
  spookje: [
    { d: "M12 3.2c-4.1 0-6.6 3.1-6.6 7.2v9.4l2.2-1.5 2.2 1.5 2.2-1.5 2.2 1.5 2.2-1.5 2.2 1.5v-9.4c0-4.1-2.5-7.2-6.6-7.2Z", fill: "#fffaf3", stroke: "#cdb9a2", sw: 0.8 },
    { d: `${ellips(9.7, 10.6, 1, 1.3)}${ellips(14.3, 10.6, 1, 1.3)}`, fill: INKT },
    { d: ellips(12, 14, 0.9, 1.1), fill: INKT },
  ],
  vleermuis: [
    { d: "M12 9.6 13.1 8.2l.5 2.1C15.4 9 18.2 8.2 22 9c-1.4 1-2 2.4-1.9 4.2-1.1-.8-2.5-.8-3.6.1-.9-.7-2-.6-2.7.5-.6.8-1.2 1.8-1.8 2.8-.6-1-1.2-2-1.8-2.8-.7-1.1-1.8-1.2-2.7-.5-1.1-.9-2.5-.9-3.6-.1.1-1.8-.5-3.2-1.9-4.2 3.8-.8 6.6 0 8.4 1.3l.5-2.1Z", fill: "#4a3a5c" },
    { d: `${ellips(11.3, 10.9, 0.35)}${ellips(12.7, 10.9, 0.35)}`, fill: "#f3c981" },
  ],
  sneeuwvlok: [
    { d: "M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9.8 4.6 12 6.6l2.2-2M9.8 19.4 12 17.4l2.2 2M4.9 10.3l2.9-.6-.9-2.8M19.1 13.7l-2.9.6.9 2.8M4.9 13.7l2.9.6-.9 2.8M19.1 10.3l-2.9-.6.9-2.8", stroke: "#8fbfcc", sw: 1.6 },
  ],
  kerstbal: [
    { d: "M12 6.2c-1.2-2.2.4-3.4 1.4-2.4", stroke: "#c9a24e", sw: 1 },
    { d: "M10 6.1h4v2.4h-4Z", fill: "#d9b25a" },
    { d: ellips(12, 14.6, 7, 7), fill: "#c8423b" },
    { d: "M5.4 15.6c4.2 1.6 9 1.6 13.2 0", stroke: "#f3c981", sw: 1.3 },
    { d: ellips(9.4, 11.8, 1.5, 2.1), fill: "#ffffff", opacity: 0.45 },
  ],
  hartje: [
    { d: "M12 20.5S3.5 15.2 3.5 9.3A4.4 4.4 0 0 1 12 7a4.4 4.4 0 0 1 8.5 2.3c0 5.9-8.5 11.2-8.5 11.2Z", fill: "#e0607e" },
    { d: "M6.6 8.8c.9-1.1 2.3-1.4 3.4-.7", stroke: "#ffffff", sw: 1.2, opacity: 0.7 },
  ],
  ei: [
    { d: "M12 3c3.8 0 6.6 6 6.6 10.4 0 4.4-2.9 7.6-6.6 7.6s-6.6-3.2-6.6-7.6C5.4 9 8.2 3 12 3Z", fill: "#f6d47a" },
    { d: "M5.9 12.2l2-1.6 2 1.6 2.1-1.6 2 1.6 2-1.6 2.1 1.6", stroke: "#e46a8a", sw: 1.3 },
    { d: `${ellips(9, 16, 1)}${ellips(12, 17.4, 1)}${ellips(15, 16, 1)}`, fill: "#4c9a78" },
  ],
  ei2: [
    { d: "M12 3c3.8 0 6.6 6 6.6 10.4 0 4.4-2.9 7.6-6.6 7.6s-6.6-3.2-6.6-7.6C5.4 9 8.2 3 12 3Z", fill: "#bfe3d0" },
    { d: "M5.7 13.4c2.2-1.4 4.4 1.4 6.3 0s4.1 1.4 6.3 0", stroke: "#4c7f87", sw: 1.3 },
    { d: `${ellips(10, 8.6, 0.9)}${ellips(14, 8.6, 0.9)}`, fill: "#f3c981" },
  ],
  zon: [
    { d: "M12 2.5v2.6M12 18.9v2.6M2.5 12h2.6M18.9 12h2.6M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8", stroke: "#f6b93b", sw: 1.8 },
    { d: ellips(12, 12, 4.6), fill: "#f6b93b" },
  ],
} satisfies Record<string, Vorm>;
export type VormNaam = keyof typeof VORMEN;

/** Wat elk thema meebrengt: de standaardperiode en -kleur, en de versiering (wat zweeft, wat oplicht, belletjes of niet). */
export interface ThemaSoort {
  id: string;
  naam: string;
  van: string;
  tot: string;
  kleur: string;
  zweef: VormNaam[];
  fonkel: VormNaam[];
  bellen: boolean;
  /** Een voorbeeld voor de zin bovenaan (enkel als hint in het beheer). */
  hint: string;
  uitleg?: string;
}

export const THEMA_SOORTEN: ThemaSoort[] = [
  { id: "halloween", naam: "Halloween", van: "10-15", tot: "11-01", kleur: "#e8772e", zweef: ["pompoen", "spookje", "vleermuis"], fonkel: ["ster", "vleermuis"], bellen: false, hint: "Fijne Halloween! Kom griezelen aan onze stand." },
  { id: "kerst", naam: "Kerst en winter", van: "12-01", tot: "01-06", kleur: "#c8423b", zweef: ["sneeuwvlok", "kerstbal", "sneeuwvlok"], fonkel: ["ster", "sneeuwvlok"], bellen: false, hint: "Een binder als cadeau? Bestel op tijd voor kerst." },
  { id: "valentijn", naam: "Valentijn", van: "02-07", tot: "02-14", kleur: "#e0607e", zweef: ["hartje"], fonkel: ["ster", "hartje"], bellen: true, hint: "Een binder met jullie naam, voor je lief." },
  { id: "pasen", naam: "Pasen", van: "03-20", tot: "04-06", kleur: "#6fb08c", zweef: ["ei", "ei2"], fonkel: ["ster"], bellen: true, hint: "Vrolijk Pasen!", uitleg: "Pasen valt elk jaar anders: kijk de data na." },
  { id: "zomer", naam: "Zomer", van: "07-01", tot: "08-31", kleur: "#f2a33a", zweef: ["zon"], fonkel: ["ster"], bellen: true, hint: "Zomerbeurzen: kom langs!" },
];

/** Zonder thema: belletjes en sterretjes zoals in ons logo. */
export const GEWOON: Pick<ThemaSoort, "zweef" | "fonkel" | "bellen"> = { zweef: [], fonkel: ["ster"], bellen: true };

export const soortVan = (id: string): ThemaSoort | undefined => THEMA_SOORTEN.find((s) => s.id === id);

/** Een nieuw thema zoals de soort het voorstelt (nog uit tot je het bewaart). */
export function nieuwThema(s: ThemaSoort): Thema {
  return { id: s.id, naam: s.naam, van: s.van, tot: s.tot, aan: "periode", kleur: s.kleur, tekst: null, logo: null };
}

/** 'MM-DD' van een datum (JJJJ-MM-DD). */
export const maandDag = (datum: string) => datum.slice(5, 10);

const MAANDDAG = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
export const geldigeMaandDag = (x: string | null | undefined): x is string => typeof x === "string" && MAANDDAG.test(x);

/** Valt `md` (MM-DD) in de periode? Ligt tot vóór van, dan loopt de periode over nieuwjaar (1 dec – 6 jan). */
export function inPeriode(van: string | null, tot: string | null, md: string): boolean {
  if (!geldigeMaandDag(van) || !geldigeMaandDag(tot)) return false;
  return van <= tot ? md >= van && md <= tot : md >= van || md <= tot;
}

export function themaActief(t: Thema, md: string): boolean {
  if (t.aan === "uit") return false;
  if (t.aan === "aan") return true;
  return inPeriode(t.van, t.tot, md);
}

/** Het thema van vandaag: wat met de hand aan staat gaat voor, daarna de eerste periode (in de volgorde van de soorten). */
export function actiefThema(lijst: Thema[], md: string): Thema | null {
  const volgorde = (t: Thema) => { const i = THEMA_SOORTEN.findIndex((s) => s.id === t.id); return i < 0 ? 99 : i; };
  const gesorteerd = [...lijst].sort((a, b) => volgorde(a) - volgorde(b));
  return gesorteerd.find((t) => t.aan === "aan") ?? gesorteerd.find((t) => themaActief(t, md)) ?? null;
}

const MAANDEN = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
/** '10-15' → '15 okt' */
export function maandDagMooi(md: string | null): string {
  if (!geldigeMaandDag(md)) return "?";
  return `${Number(md.slice(3))} ${MAANDEN[Number(md.slice(0, 2)) - 1]}`;
}

/** Een kleur '#rrggbb', of null. */
export function veiligeKleur(k: string | null | undefined): string | null {
  return typeof k === "string" && /^#[0-9a-f]{6}$/i.test(k) ? k.toLowerCase() : null;
}
