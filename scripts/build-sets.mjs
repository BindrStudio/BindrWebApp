// Schrijft public/data/sets.json: per set de naam, de afkorting, de releasedatum, de reeks
// en de taal (voor het logo op assets.tcgdex.net/<taal>/<reeks>/<set>/logo.png).
// Klein bestand voor de klantenpagina (sorteren per set, nieuwste sets eerst),
// zodat die de volledige kaartencatalogus niet hoeft te laden.
//
//   node scripts/build-sets.mjs
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const data = path.join(root, "public/data");
const sets = {};

const en = JSON.parse(await readFile(path.join(data, "catalog-en.json"), "utf8"));
for (const [id, naam, code, serie, release] of en.sets) sets[id] = [naam, code || id, release || "", serie || "", "en", "", ""];

// Japanse en Chinese sets: de Engelse vertaling van de eigen naam (bv. M6 "Storm Emeralda") en de
// internationale set met dezelfde kaarten ("Delta Reign"), uit scripts/data/setnamen-azie.json.
// TCGdex heeft voor sommige sets een Indonesische naam als "Engelse": die gebruiken we niet.
// Per set: [naam, code, release, reeks, taal, internationale naam, naam in de eigen taal].
const namen = JSON.parse(await readFile(path.join(root, "scripts/data/setnamen-azie.json"), "utf8"));
const asia = JSON.parse(await readFile(path.join(data, "catalog-asia.json"), "utf8"));
for (const [id, ja, zhTw, zhCn, enNaam, serie, release] of asia.sets) {
  if (sets[id]) continue;
  const taal = ja ? "ja" : zhTw ? "zh-tw" : "zh-cn";
  const n = namen[id] ?? {};
  const eigen = n.eigen || ja || zhTw || zhCn || ""; // "eigen" verbetert een fout in TCGdex (bv. SV4a)
  const naam = n.en || (taal === "ja" ? enNaam : "") || eigen || enNaam || id;
  sets[id] = [naam, id, release || "", serie || "", taal, n.intl || "", eigen !== naam ? eigen : ""];
}

const gesorteerd = Object.fromEntries(Object.entries(sets).sort(([a], [b]) => a.localeCompare(b)));
await writeFile(path.join(data, "sets.json"), JSON.stringify(gesorteerd));
console.log(`sets.json: ${Object.keys(sets).length} sets`);
