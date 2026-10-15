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
for (const [id, naam, code, serie, release] of en.sets) sets[id] = [naam, code || id, release || "", serie || "", "en"];

const asia = JSON.parse(await readFile(path.join(data, "catalog-asia.json"), "utf8"));
for (const [id, ja, zhTw, zhCn, enNaam, serie, release] of asia.sets) {
  const taal = ja ? "ja" : zhTw ? "zh-tw" : "zh-cn";
  if (!sets[id]) sets[id] = [enNaam || ja || zhTw || zhCn || id, id, release || "", serie || "", taal];
}

const gesorteerd = Object.fromEntries(Object.entries(sets).sort(([a], [b]) => a.localeCompare(b)));
await writeFile(path.join(data, "sets.json"), JSON.stringify(gesorteerd));
console.log(`sets.json: ${Object.keys(sets).length} sets`);
