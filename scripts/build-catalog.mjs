// Bouwt de kaartencatalogus voor de app uit de open TCGdex-kaartendatabase
// (https://github.com/tcgdex/cards-database). Geen afhankelijkheden: draait met gewone Node.
//
//   node scripts/build-catalog.mjs <pad-naar-cards-database> <uitvoermap>
//
// Schrijft catalog-en.json (Engelse sets) en catalog-asia.json (Japanse/Chinese sets).
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const [, , src, outDir] = process.argv;
if (!src || !outDir) {
  console.error("gebruik: node scripts/build-catalog.mjs <cards-database> <uitvoermap>");
  process.exit(1);
}

// Een TCGdex-bestand is een TypeScript-objectliteraal. We halen imports en
// type-annotaties weg en evalueren het als gewoon JavaScript.
function evalTs(file, scope) {
  let code = fs.readFileSync(file, "utf8");
  code = code.replace(/^\s*import[^\n]*\n/gm, "");
  code = code.replace(/const\s+(\w+)\s*:\s*[\w.<>[\]| ]+\s*=/g, "const $1 =");
  code = code.replace(/\bas const\b/g, "");
  code = code.replace(/export\s+default\s+(\w+)\s*;?/g, "return $1;");
  const names = Object.keys(scope);
  return new Function(...names, code)(...names.map((n) => scope[n]));
}

const isTs = (f) => f.endsWith(".ts");
const firstCm = (card) => {
  if (card.thirdParty && card.thirdParty.cardmarket) return card.thirdParty.cardmarket;
  // Oudere kaarten gebruiken een object { normal: true, ... } in plaats van een lijst.
  const variants = Array.isArray(card.variants) ? card.variants : [];
  for (const v of variants) if (v && v.thirdParty && v.thirdParty.cardmarket) return v.thirdParty.cardmarket;
  return null;
};
const pick = (obj, ...keys) => {
  if (!obj) return "";
  if (typeof obj === "string") return obj;
  for (const k of keys) if (obj[k]) return obj[k];
  return "";
};

function build(root, kind) {
  const sets = [];
  const cards = [];
  let fouten = 0;
  const series = fs.readdirSync(root).filter(isTs);
  for (const serieFile of series) {
    let serie;
    try { serie = evalTs(path.join(root, serieFile), {}); } catch (e) { fouten++; continue; }
    const serieDir = path.join(root, serieFile.slice(0, -3));
    if (!fs.existsSync(serieDir)) continue;
    for (const setFile of fs.readdirSync(serieDir).filter(isTs)) {
      let set;
      try { set = evalTs(path.join(serieDir, setFile), { serie }); } catch (e) { fouten++; continue; }
      const setDir = path.join(serieDir, setFile.slice(0, -3));
      if (!fs.existsSync(setDir)) continue;
      const idx = sets.length;
      const rel = typeof set.releaseDate === "string" ? set.releaseDate : pick(set.releaseDate, "ja", "en", "zh-tw", "zh-cn");
      if (kind === "en") {
        sets.push([set.id, pick(set.name, "en"), (set.abbreviations && set.abbreviations.official) || "", serie.id, rel || "", (set.cardCount && set.cardCount.official) || 0]);
      } else {
        sets.push([set.id, pick(set.name, "ja"), pick(set.name, "zh-tw"), pick(set.name, "zh-cn"), pick(set.name, "en", "id"), serie.id, rel || "", (set.cardCount && set.cardCount.official) || 0]);
      }
      for (const cardFile of fs.readdirSync(setDir).filter(isTs)) {
        let card;
        try { card = evalTs(path.join(setDir, cardFile), { Set: set, set, serie }); } catch (e) { fouten++; continue; }
        if (!card || !card.name) continue;
        const localId = cardFile.slice(0, -3);
        const dex = Array.isArray(card.dexId) && card.dexId.length ? card.dexId[0] : 0;
        const rarity = card.rarity || "";
        if (kind === "en") {
          const naam = pick(card.name, "en");
          if (!naam) continue;
          cards.push([idx, localId, naam, rarity, firstCm(card) || 0, dex]);
        } else {
          const ja = pick(card.name, "ja");
          if (!ja && !card.name["zh-tw"] && !card.name["zh-cn"]) continue;
          cards.push([idx, localId, ja, pick(card.name, "zh-tw"), pick(card.name, "zh-cn"), pick(card.name, "en", "id"), rarity, firstCm(card) || 0, dex]);
        }
      }
    }
  }
  return { sets, cards, fouten };
}

fs.mkdirSync(outDir, { recursive: true });
// De versie volgt de inhoud: zonder nieuwe kaarten verandert het bestand niet.
const stamp = (d) => createHash("sha1").update(JSON.stringify(d)).digest("hex").slice(0, 10);
const en = build(path.join(src, "data"), "en");
fs.writeFileSync(path.join(outDir, "catalog-en.json"), JSON.stringify({
  version: stamp(en),
  setFields: ["id", "name", "code", "serie", "release", "total"],
  cardFields: ["set", "number", "name", "rarity", "cardmarket", "dex"],
  sets: en.sets, cards: en.cards,
}));
const asia = build(path.join(src, "data-asia"), "asia");
fs.writeFileSync(path.join(outDir, "catalog-asia.json"), JSON.stringify({
  version: stamp(asia),
  setFields: ["id", "nameJa", "nameZhTw", "nameZhCn", "nameEn", "serie", "release", "total"],
  cardFields: ["set", "number", "nameJa", "nameZhTw", "nameZhCn", "nameEn", "rarity", "cardmarket", "dex"],
  sets: asia.sets, cards: asia.cards,
}));
console.log(`en: ${en.sets.length} sets, ${en.cards.length} kaarten (${en.fouten} fouten) · asia: ${asia.sets.length} sets, ${asia.cards.length} kaarten (${asia.fouten} fouten)`);
