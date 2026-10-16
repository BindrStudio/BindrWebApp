// De voorbeeldbinders op de startpagina (public/img/voorbeeld): de zip-binder in een kleur met een eigen
// voorbeeldgravure (scripts/data/voorbeeldgravure.svg: sterretjes en belletjes, geen naam). Ze tonen wat we
// maken zolang er nog geen foto's van ons werk in de etalage staan. Rekent met dezelfde code als de proef op
// de klantenpagina (src/klant/binder.ts) in een echte browser.
//   npm run serve
//   node scripts/voorbeeldbinders.cjs     (nodig: playwright, zoals voor de e2e-tests; daarna naar webp, zie onderaan)
const { chromium } = require("playwright");
const esbuild = require("esbuild");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const BASIS = process.env.BASIS || "http://localhost:8080/";
const KLEUREN = ["oceaanblauw", "geel", "rood", "roze", "paars"];
const UIT = path.join(ROOT, ".tests/voorbeeld");

(async () => {
  fs.mkdirSync(UIT, { recursive: true });
  const code = esbuild.buildSync({
    stdin: {
      contents: `import { BINDER_KLEUREN, BINDER_H, BINDER_W, binderIn, grenzen, leesOntwerp, lichtOpDonker, maakMasker, midden, teken } from "./src/klant/binder";
        window.maak = async (id, svg, breed) => {
          const b = await binderIn(BINDER_KLEUREN.find((x) => x.id === id), "img/binder-zip.webp");
          const o = await leesOntwerp(new File([svg], "gravure.svg", { type: "image/svg+xml" })).then((c) => maakMasker(c, lichtOpDonker(c)));
          const groot = document.createElement("canvas"); groot.width = BINDER_W; groot.height = BINDER_H;
          teken(groot.getContext("2d"), b, o, midden(o, grenzen(o).vullend));
          const uit = document.createElement("canvas"); uit.width = breed; uit.height = Math.round(breed * BINDER_H / BINDER_W);
          uit.getContext("2d").drawImage(groot, 0, 0, uit.width, uit.height);
          return uit.toDataURL("image/png");
        };`,
      resolveDir: ROOT, loader: "ts",
    },
    bundle: true, write: false, format: "iife", target: "es2020",
  }).outputFiles[0].text;
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(BASIS);
  await page.addScriptTag({ content: code });
  const svg = fs.readFileSync(path.join(ROOT, "scripts/data/voorbeeldgravure.svg"), "utf8");
  for (const id of KLEUREN) {
    const url = await page.evaluate(([i, s]) => window.maak(i, s, 480), [id, svg]);
    fs.writeFileSync(path.join(UIT, `${id}.png`), Buffer.from(url.split(",")[1], "base64"));
    console.log(path.join(".tests/voorbeeld", `${id}.png`));
  }
  await browser.close();
  console.log('Naar webp: python3 -c "from PIL import Image; [Image.open(f\'.tests/voorbeeld/{k}.png\').save(f\'public/img/voorbeeld/{k}.webp\', quality=82, method=6) for k in ' + JSON.stringify(KLEUREN) + ']"');
})().catch((e) => { console.error(e); process.exit(1); });
