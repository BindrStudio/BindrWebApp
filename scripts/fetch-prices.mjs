// Haalt de publieke Cardmarket-prijsgids voor Pokémon op en schrijft een compacte
// versie naar public/data/prices.json, enkel voor kaarten uit onze catalogus.
//
//   node scripts/fetch-prices.mjs                 download van Cardmarket (GitHub Actions)
//   node scripts/fetch-prices.mjs --uit <bestand> gebruik een al gedownloade price_guide_6.json
//   … --lijst <bestand>                           en een al gedownloade products_nonsingles_6.json
//
// Formaat: { datum, velden, p: { idProduct: [trend, laagste, gem30, trendHolo, laagsteHolo, gem30Holo, gem1, gem7, gem1Holo, gem7Holo] },
//           gedeeld: [id…], nieuw: [id…], vintage: [id…] }
// (gem1 en gem7 staan achteraan, zodat oudere versies van de app het bestand nog kunnen lezen.)
// gedeeld = een Cardmarket-product dat bij meer dan één kaart uit de catalogus hoort (de prijs kan van
// een andere versie zijn); nieuw = een set van minder dan NIEUW_DAGEN dagen oud (de prijzen zakken nog);
// vintage = uitgebracht vóór VINTAGE (de gids telt ook mindere condities mee: NM ligt vaak hoger).
// Allemaal "nakijken" in de app (lib/pricing.ts), zie README › Prijzen.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const URL_GIDS = "https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_6.json";
const URL_LIJST = "https://downloads.s3.cardmarket.com/productCatalog/productList/products_nonsingles_6.json";
const UIT = path.join(root, "public/data/prices.json");

export const NIEUW_DAGEN = 60;
export const VINTAGE = "2004-01-01";

/** Alle Cardmarket-ids uit de catalogus, met de release van hun set en hoeveel kaarten ze delen. */
async function catalogus() {
  const ids = new Set();
  const release = new Map(); // id → de jongste release (een gedeeld id: die van de nieuwste kaart)
  const gedeeld = new Set();
  // [bestand, kolom van het id, kolom van de release in de set]
  for (const [bestand, kolom, rel] of [["catalog-en.json", 4, 4], ["catalog-asia.json", 7, 6]]) {
    const c = JSON.parse(await readFile(path.join(root, "public/data", bestand), "utf8"));
    const hier = new Set();
    for (const k of c.cards) {
      const id = Number(k[kolom]);
      if (!id) continue;
      if (hier.has(id)) gedeeld.add(id);
      hier.add(id);
      ids.add(id);
      const r = String(c.sets[k[0]]?.[rel] ?? "");
      if (r && !(release.get(id) > r)) release.set(id, r);
    }
  }
  return { ids, release, gedeeld };
}

/** Welke ids nakijken vragen omdat de set nieuw of heel oud is (op de datum van de gids). */
export function nieuwEnVintage(release, datum) {
  const grens = new Date(Date.parse(`${datum}T00:00:00Z`) - NIEUW_DAGEN * 86400000).toISOString().slice(0, 10);
  const nieuw = [], vintage = [];
  for (const [id, r] of release) {
    if (r > grens && r <= datum) nieuw.push(id);
    else if (r < VINTAGE) vintage.push(id);
  }
  return { nieuw: nieuw.sort((a, b) => a - b), vintage: vintage.sort((a, b) => a - b) };
}

async function leesGids() {
  const i = process.argv.indexOf("--uit");
  if (i > 0) return JSON.parse(await readFile(process.argv[i + 1], "utf8"));
  const r = await fetch(URL_GIDS);
  if (!r.ok) throw new Error(`${URL_GIDS} gaf HTTP ${r.status}`);
  return r.json();
}

const rond = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 100) / 100);

// Gewoon gestart (node scripts/fetch-prices.mjs): ophalen en schrijven. Een test importeert enkel de functies.
if (process.argv[1]?.endsWith("fetch-prices.mjs")) await hoofd();

async function hoofd() {
  const [{ ids, release, gedeeld }, gids] = await Promise.all([catalogus(), leesGids()]);
  const rijen = gids.priceGuides;
  if (!Array.isArray(rijen) || rijen.length < 1000) throw new Error("Onverwachte prijsgids: te weinig rijen");

  const p = {};
  for (const r of rijen) {
    if (!ids.has(r.idProduct)) continue;
    const regel = [r.trend, r.low, r.avg30, r["trend-holo"], r["low-holo"], r["avg30-holo"], r.avg1, r.avg7, r["avg1-holo"], r["avg7-holo"]].map(rond);
    while (regel.length && regel[regel.length - 1] == null) regel.pop();
    if (regel.length) p[r.idProduct] = regel;
  }

  const datum = String(gids.createdAt || new Date().toISOString()).slice(0, 10);
  const metPrijs = (lijst) => lijst.filter((id) => p[id]);
  const { nieuw, vintage } = nieuwEnVintage(release, datum);
  const uit = {
    datum, velden: ["trend", "laagste", "gem30", "trendHolo", "laagsteHolo", "gem30Holo", "gem1", "gem7", "gem1Holo", "gem7Holo"], p,
    gedeeld: metPrijs([...gedeeld].sort((a, b) => a - b)), nieuw: metPrijs(nieuw), vintage: metPrijs(vintage),
  };
  await writeFile(UIT, JSON.stringify(uit));
  console.log(`prices.json: ${Object.keys(p).length} kaarten van ${rijen.length} producten, gids van ${datum} (nakijken: ${uit.gedeeld.length} gedeeld, ${uit.nieuw.length} nieuw, ${uit.vintage.length} vintage)`);

  // ── Sealed: de publieke productlijst (geen kaarten) met de prijs uit dezelfde gids ──
  // public/data/sealed.json: { datum, velden, p: [[idProduct, naam, categorie, trend, laagste, gem30]] }
  // Mislukt dit, dan blijft de vorige sealed.json staan: de kaartprijzen hierboven gaan voor.
  try {
    const lijst = await leesLijst();
    const prijs = new Map(rijen.map((r) => [r.idProduct, r]));
    const sealed = [];
    for (const pr of lijst.products ?? []) {
      const r = prijs.get(pr.idProduct);
      if (!r || (r.trend == null && r.low == null)) continue;
      sealed.push([pr.idProduct, pr.name, String(pr.categoryName || "").replace(/^Pok[eé]mon\s+/i, ""), rond(r.trend), rond(r.low), rond(r.avg30)]);
    }
    if (sealed.length < 50) throw new Error(`maar ${sealed.length} sealed producten met een prijs`);
    sealed.sort((a, b) => String(a[1]).localeCompare(String(b[1])));
    await writeFile(path.join(root, "public/data/sealed.json"),
      JSON.stringify({ datum, velden: ["id", "naam", "categorie", "trend", "laagste", "gem30"], p: sealed }));
    console.log(`sealed.json: ${sealed.length} producten`);
  } catch (e) {
    console.warn(`sealed.json niet bijgewerkt: ${e instanceof Error ? e.message : e}`);
  }
}

async function leesLijst() {
  const i = process.argv.indexOf("--lijst");
  if (i > 0) return JSON.parse(await readFile(process.argv[i + 1], "utf8"));
  const r = await fetch(URL_LIJST);
  if (!r.ok) throw new Error(`${URL_LIJST} gaf HTTP ${r.status}`);
  return r.json();
}
