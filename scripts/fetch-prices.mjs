// Haalt de publieke Cardmarket-prijsgids voor Pokémon op en schrijft een compacte
// versie naar public/data/prices.json, enkel voor kaarten uit onze catalogus.
//
//   node scripts/fetch-prices.mjs                 download van Cardmarket (GitHub Actions)
//   node scripts/fetch-prices.mjs --uit <bestand> gebruik een al gedownloade price_guide_6.json
//
// Formaat: { datum, velden, p: { idProduct: [trend, laagste, gem30, trendHolo, laagsteHolo, gem30Holo, gem1, gem7, gem1Holo, gem7Holo] } }
// (gem1 en gem7 staan achteraan, zodat oudere versies van de app het bestand nog kunnen lezen.)
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const URL_GIDS = "https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_6.json";
const UIT = path.join(root, "public/data/prices.json");

async function catalogusIds() {
  const ids = new Set();
  for (const [bestand, kolom] of [["catalog-en.json", 4], ["catalog-asia.json", 7]]) {
    const c = JSON.parse(await readFile(path.join(root, "public/data", bestand), "utf8"));
    for (const k of c.cards) if (k[kolom]) ids.add(Number(k[kolom]));
  }
  return ids;
}

async function leesGids() {
  const i = process.argv.indexOf("--uit");
  if (i > 0) return JSON.parse(await readFile(process.argv[i + 1], "utf8"));
  const r = await fetch(URL_GIDS);
  if (!r.ok) throw new Error(`${URL_GIDS} gaf HTTP ${r.status}`);
  return r.json();
}

const rond = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 100) / 100);

const [ids, gids] = await Promise.all([catalogusIds(), leesGids()]);
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
const uit = { datum, velden: ["trend", "laagste", "gem30", "trendHolo", "laagsteHolo", "gem30Holo", "gem1", "gem7", "gem1Holo", "gem7Holo"], p };
await writeFile(UIT, JSON.stringify(uit));
console.log(`prices.json: ${Object.keys(p).length} kaarten van ${rijen.length} producten, gids van ${datum}`);
