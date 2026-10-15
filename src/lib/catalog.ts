import { DATA, TCGDEX_ASSETS } from "../config";
import type { Catalogus, CatalogusKaart } from "../types";
import { zonderAccenten } from "./format";

interface Bestand {
  version: string;
  sets: (string | number)[][];
  cards: (string | number)[][];
}

export interface Index {
  kaarten: CatalogusKaart[];
  perId: Map<string, CatalogusKaart>;
  perCardmarket: Map<number, CatalogusKaart>;
  perNummer: Map<string, CatalogusKaart[]>;
  zoektekst: string[];
}

const cache: Partial<Record<Catalogus, Promise<Index>>> = {};

export function normNummer(n: string): string {
  const m = /^([A-Za-z]*)0*(\d+)([A-Za-z]*)$/.exec(n.trim());
  return m ? `${m[1].toUpperCase()}${m[2]}${m[3].toLowerCase()}` : n.trim().toUpperCase();
}

function bouwIndex(cat: Catalogus, b: Bestand): Index {
  const kaarten: CatalogusKaart[] = [];
  for (const c of b.cards) {
    if (cat === "en") {
      const [si, nummer, naam, zeldzaamheid, cm] = c as [number, string, string, string, number];
      const s = b.sets[si] as [string, string, string, string, string, number];
      kaarten.push({
        id: `${s[0]}-${nummer}`, catalogus: "en", setId: s[0], setNaam: s[1], setCode: s[2], serie: s[3],
        release: s[4], setTotaal: s[5], nummer, naam, zeldzaamheid, cardmarket: cm || null,
      });
    } else {
      const [si, nummer, ja, zhTw, zhCn, en, zeldzaamheid, cm] = c as [number, string, string, string, string, string, string, number];
      const s = b.sets[si] as [string, string, string, string, string, string, string, number];
      kaarten.push({
        id: `${s[0]}-${nummer}`, catalogus: "asia", setId: s[0], setNaam: s[1] || s[2] || s[4], setCode: s[0], serie: s[5],
        release: s[6], setTotaal: s[7], nummer, naam: en || ja || zhTw || zhCn, naamJa: ja, naamZhTw: zhTw, naamZhCn: zhCn,
        zeldzaamheid, cardmarket: cm || null,
      });
    }
  }
  const perId = new Map<string, CatalogusKaart>();
  const perCardmarket = new Map<number, CatalogusKaart>();
  const perNummer = new Map<string, CatalogusKaart[]>();
  const zoektekst: string[] = [];
  for (const k of kaarten) {
    perId.set(k.id, k);
    if (k.cardmarket && !perCardmarket.has(k.cardmarket)) perCardmarket.set(k.cardmarket, k);
    const nn = normNummer(k.nummer);
    const lijst = perNummer.get(nn);
    if (lijst) lijst.push(k); else perNummer.set(nn, [k]);
    zoektekst.push(zonderAccenten([k.naam, k.naamJa, k.naamZhTw, k.naamZhCn, k.setNaam, k.setCode, k.setId].filter(Boolean).join(" ")));
  }
  return { kaarten, perId, perCardmarket, perNummer, zoektekst };
}

export function laadCatalogus(cat: Catalogus): Promise<Index> {
  if (!cache[cat]) {
    cache[cat] = fetch(cat === "en" ? DATA.catalogusEn : DATA.catalogusAsia)
      .then((r) => {
        if (!r.ok) throw new Error("Kaartencatalogus kon niet geladen worden");
        return r.json() as Promise<Bestand>;
      })
      .then((b) => bouwIndex(cat, b));
    cache[cat]!.catch(() => { delete cache[cat]; });
  }
  return cache[cat]!;
}

export function afbeelding(k: { catalogus: Catalogus | null; serie?: string; setId?: string; nummer?: string | null; kaart_id?: string | null }, kwaliteit: "low" | "high" = "low"): string | null {
  if (!k.serie || !k.setId || !k.nummer) return null;
  const taal = k.catalogus === "asia" ? "ja" : "en";
  return `${TCGDEX_ASSETS}/${taal}/${k.serie}/${k.setId}/${k.nummer}/${kwaliteit}.webp`;
}

/**
 * Zoeken in de catalogus. Werkt met:
 *   - naam (Engels, Japans of Chinees), ook gedeeltelijk: "chariz"
 *   - naam + (deel van) het nummer: "charizard 153", "pikachu 17", "umbreon 215/203"
 *   - set + nummer: "PFL 130", "sv2a 173"
 *   - nummer/totaal: "130/94"
 */
export function zoek(idx: Index, vraag: string, limiet = 40): CatalogusKaart[] {
  const ruw = vraag.trim();
  const q = zonderAccenten(ruw);
  if (!q) return [];
  const setNr = /^([a-z0-9.]{2,7})\s+#?([a-z]*\d+[a-z]?)$/i.exec(ruw);
  if (setNr) {
    const code = setNr[1].toUpperCase();
    const nr = normNummer(setNr[2]);
    const hits = (idx.perNummer.get(nr) || []).filter((k) => k.setCode.toUpperCase() === code || k.setId.toUpperCase() === code);
    if (hits.length) return hits;
  }
  const nrTot = /^#?([a-z]*\d+[a-z]?)\s*\/\s*([a-z]*\d+)$/i.exec(ruw);
  if (nrTot) {
    const tot = Number(nrTot[2].replace(/\D/g, ""));
    const hits = (idx.perNummer.get(normNummer(nrTot[1])) || []).filter((k) => k.setTotaal === tot);
    if (hits.length) return sorteerNieuw(hits).slice(0, limiet);
  }

  // Woorden met een cijfer kunnen een (deel van een) kaartnummer zijn, of een set ("151", "sv2a").
  const tekst: string[] = [];
  const nummers: { nr: string; cijfers: string; totaal: number | null; ruw: string }[] = [];
  for (const w of q.split(/\s+/)) {
    const m = /^#?([a-z]{0,4}\d+[a-z]?)(?:\/([a-z]*\d+))?$/.exec(w);
    if (m) nummers.push({ nr: normNummer(m[1]), cijfers: String(Number(m[1].replace(/\D/g, ""))), totaal: m[2] ? Number(m[2].replace(/\D/g, "")) : null, ruw: m[1] });
    else tekst.push(w);
  }

  const scores: { k: CatalogusKaart; s: number }[] = [];
  for (let i = 0; i < idx.kaarten.length; i++) {
    const t = idx.zoektekst[i];
    if (!tekst.every((w) => t.includes(w))) continue;
    const k = idx.kaarten[i];
    let s = 0;
    let ok = true;
    for (const n of nummers) {
      const kn = normNummer(k.nummer);
      const kCijfers = String(Number(k.nummer.replace(/\D/g, "") || "0"));
      if (n.totaal != null && k.setTotaal !== n.totaal) { ok = false; break; }
      if (kn === n.nr.toUpperCase() || kn === n.nr) s += 100;
      else if (kCijfers === n.cijfers) s += 80;          // "tg5" of "05" tegen TG05
      else if (kCijfers.startsWith(n.cijfers)) s += 40;  // deel van het nummer: 15 → 153
      else if (t.includes(n.ruw)) s += 20;               // set zoals "151" of "sv2a"
      else { ok = false; break; }
    }
    if (!ok) continue;
    if (tekst.length) {
      // Voorrang voor treffers in de naam boven treffers in de setnaam ("Detective Pikachu").
      const naam = zonderAccenten([k.naam, k.naamJa, k.naamZhTw, k.naamZhCn].filter(Boolean).join(" "));
      if (tekst.every((w) => naam.includes(w))) s += 200;
      if (zonderAccenten(k.naam) === tekst.join(" ")) s += 10;
    }
    scores.push({ k, s });
  }
  scores.sort((a, b) => b.s - a.s || (b.k.release || "").localeCompare(a.k.release || "") ||
    Number(a.k.nummer.replace(/\D/g, "")) - Number(b.k.nummer.replace(/\D/g, "")));
  return scores.slice(0, limiet).map((x) => x.k);
}

function sorteerNieuw(l: CatalogusKaart[]) {
  return [...l].sort((a, b) => (b.release || "").localeCompare(a.release || ""));
}

// ── Herkenning op basis van tekst van een foto (OCR) ─────────────────────────

export interface OcrKenmerken {
  nummers: { nummer: string; totaal: number | null }[];
  codes: string[];
  woorden: string[];
}

/** Haalt kaartnummer(s), setcodes en woorden uit de tekst die de OCR las. */
export function leesKenmerken(tekst: string): OcrKenmerken {
  const t = tekst.replace(/[|\\]/g, "/").replace(/[Oo](?=\d)/g, "0");
  const nummers: { nummer: string; totaal: number | null }[] = [];
  const re = /\b([A-Z]{0,3})\s?(\d{1,3}[a-z]?)\s*\/\s*([A-Z]{0,3})\s?(\d{2,3})\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) nummers.push({ nummer: normNummer(m[1] + m[2]), totaal: Number(m[4]) });
  // Soms leest de OCR de schuine streep als een 7 of 1 (bv. 1307094): enkel als er niets anders is.
  if (!nummers.length) {
    const re2 = /\b(\d{1,3})[71]\s?(\d{2,3})\b/g;
    while ((m = re2.exec(t))) nummers.push({ nummer: normNummer(m[1]), totaal: Number(m[2]) });
  }
  // Promo's en kaarten zonder totaal: SVP 123, SWSH123
  const promo = /\b(SVP|SWSH|SM|XY|BW|MEP|SVPEN)\s?(\d{1,3})\b/g;
  while ((m = promo.exec(t))) nummers.push({ nummer: normNummer(m[2]), totaal: null });
  const codes = Array.from(new Set((t.match(/\b[A-Za-z]{1,4}\d{0,2}[a-zA-Z]?\b/g) || [])
    .filter((c) => c.length >= 2 && /[A-Z]/.test(c[0]))
    .map((c) => c.toUpperCase())));
  const woorden = Array.from(new Set(zonderAccenten(tekst).split(/[^a-z]+/).filter((w) => w.length >= 4)));
  return { nummers, codes, woorden };
}

export interface Kandidaat {
  kaart: CatalogusKaart;
  score: number;
}

/** Zoekt de kaarten die het best passen bij wat de OCR las. */
export function herken(indexen: Index[], tekst: string): { kandidaten: Kandidaat[]; zeker: boolean } {
  const k = leesKenmerken(tekst);
  const scores = new Map<CatalogusKaart, number>();
  for (const idx of indexen) {
    for (const n of k.nummers) {
      for (const kaart of idx.perNummer.get(n.nummer) || []) {
        let s = 30;
        if (n.totaal != null && kaart.setTotaal === n.totaal) s += 30;
        const code = kaart.setCode.toUpperCase();
        if (code && k.codes.includes(code)) s += 40;
        else if (k.codes.includes(kaart.setId.toUpperCase())) s += 40;
        const naam = zonderAccenten(kaart.naam).split(/[^a-z]+/).filter((w) => w.length >= 4);
        if (naam.some((w) => k.woorden.includes(w))) s += 15;
        scores.set(kaart, Math.max(scores.get(kaart) || 0, s));
      }
    }
  }
  const kandidaten = [...scores.entries()]
    .map(([kaart, score]) => ({ kaart, score }))
    .sort((a, b) => b.score - a.score || (b.kaart.release || "").localeCompare(a.kaart.release || ""))
    .slice(0, 8);
  const zeker = kandidaten.length > 0 && kandidaten[0].score >= 85 && (kandidaten.length === 1 || kandidaten[0].score - kandidaten[1].score >= 20);
  return { kandidaten, zeker };
}
