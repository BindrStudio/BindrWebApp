import { DATA } from "../config";
import type { NieuwArtikel, NieuwExemplaar, Opslag, Soort } from "../types";
import { afbeelding, laadCatalogus, type Index } from "./catalog";
import { normaliseerCode } from "./code";

/** Eenvoudige CSV-lezer (komma's, aanhalingstekens, regeleindes binnen velden). */
export function leesCsv(tekst: string): Record<string, string>[] {
  const t = tekst.replace(/^﻿/, "");
  const rijen: string[][] = [];
  let rij: string[] = [];
  let veld = "";
  let inQuote = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (inQuote) {
      if (c === '"' && t[i + 1] === '"') { veld += '"'; i++; }
      else if (c === '"') inQuote = false;
      else veld += c;
    } else if (c === '"') inQuote = true;
    else if (c === ",") { rij.push(veld); veld = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && t[i + 1] === "\n") i++;
      rij.push(veld); veld = "";
      if (rij.some((v) => v !== "")) rijen.push(rij);
      rij = [];
    } else veld += c;
  }
  if (veld !== "" || rij.length) { rij.push(veld); rijen.push(rij); }
  const [kop, ...rest] = rijen;
  return rest.map((r) => Object.fromEntries(kop.map((k, i) => [k, r[i] ?? ""])));
}

const num = (s: string) => (s && s.trim() !== "" ? Number(s) : null);
const tekst = (s: string) => (s && s.trim() !== "" ? s.trim() : null);

function taalCode(t: string): string {
  if (t === "CN") return "CN-T";
  return t || "EN";
}

/** Zet de testset om naar exemplaren en artikelen, met kaartgegevens uit de catalogus. */
export async function laadTestset(): Promise<{ exemplaren: NieuwExemplaar[]; artikelen: NieuwArtikel[] }> {
  const r = await fetch(DATA.testset);
  if (!r.ok) throw new Error("Testset niet gevonden");
  const rijen = leesCsv(await r.text());
  const [en, asia] = await Promise.all([laadCatalogus("en"), laadCatalogus("asia")]);
  const exemplaren: NieuwExemplaar[] = [];
  const artikelen: NieuwArtikel[] = [];
  for (const r of rijen) {
    const opslag = (r.opslag || "").toLowerCase() === "vitrine" ? "vitrine" : ("stockdoos" as Opslag);
    if (!r.code) {
      artikelen.push({
        naam: r.naam, soort: r.type === "eigen product" ? "eigen product" : r.type === "sealed" || !r.type ? "sealed" : "andere",
        aantal: Number(r.aantal || 0), prijs: num(r.verkoopprijs), opslag, opmerking: tekst(r.opmerking),
      });
      continue;
    }
    const code = normaliseerCode(r.code);
    if (!code) continue;
    const cm = num(r.cardmarket_id);
    const taal = taalCode(r.taal);
    const kaart = zoekKaart([en, asia], cm, r.setcode, r.nummer, taal);
    const soort: Soort = r.type === "slab" ? "slab" : r.type === "eigen product" ? "eigen product" : "kaart";
    exemplaren.push({
      code,
      soort,
      kaart_id: kaart ? kaart.id : null,
      catalogus: kaart ? kaart.catalogus : null,
      afbeelding: kaart ? afbeelding(kaart) : null,
      naam: r.naam,
      naam_origineel: kaart && kaart.catalogus === "asia" ? (taal.startsWith("CN") ? kaart.naamZhTw || kaart.naamZhCn || null : kaart.naamJa || null) : null,
      set_naam: kaart ? kaart.setNaam : tekst(r.set),
      set_code: kaart ? kaart.setCode || kaart.setId : tekst(r.setcode),
      nummer: kaart ? kaart.nummer : tekst(r.nummer),
      taal: soort === "eigen product" ? "EN" : taal,
      conditie: tekst(r.conditie),
      variant: tekst(r.variant) || "normaal",
      grader: tekst(r.grader),
      grade: tekst(r.grade),
      cardmarket_id: cm,
      opslag,
      status: "in voorraad",
      verkoopprijs: num(r.verkoopprijs),
      prijs_handmatig: r.prijs_handmatig === "ja",
      hartjesprijs: opslag === "vitrine" ? num(r.stickerprijs) : null,
      hartjesdatum: opslag === "vitrine" ? tekst(r.stickerdatum) : null,
      aankoopprijs: num(r.aankoopprijs),
      aankoopdatum: tekst(r.aankoopdatum),
      aankoopbron: tekst(r.aankoopbron),
      label_status: r.qr_geprint === "nee" ? "te printen" : "gestickerd",
      opmerking: tekst(r.opmerking),
    });
  }
  return { exemplaren, artikelen };
}

function zoekKaart(indexen: Index[], cm: number | null, setcode: string, nummer: string, taal: string) {
  const asiaEerst = taal === "JP" || taal.startsWith("CN") || taal === "KR";
  const volgorde = asiaEerst ? [indexen[1], indexen[0]] : indexen;
  if (cm) for (const idx of volgorde) { const k = idx.perCardmarket.get(cm); if (k) return k; }
  if (setcode && nummer) {
    for (const idx of volgorde) {
      const k = idx.perId.get(`${setcode}-${nummer}`);
      if (k) return k;
    }
  }
  return null;
}
