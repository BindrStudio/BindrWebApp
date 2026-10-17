// De voorbeeldbinders op de startpagina (public/img/voorbeeld): binders die we echt gemaakt hebben. De foto's staan in
// scripts/data/binders (op een wit blad of fotobord, gewoon met de gsm). Ze gaan door exact dezelfde verwerking als een
// foto in Profiel › Binders vooraan (verkleinUitgeknipt met rechtzetten: achtergrond weg, rechtzetten, bijknippen), in
// een echte browser, en komen er als kleine webp uit. Ze staan op de site zolang er nog niets bij Binders vooraan staat.
//   node scripts/voorbeeldbinders.cjs     (nodig: playwright, zoals voor de e2e-tests)
// Een nieuwe binder: zet de foto in scripts/data/binders, draai dit script en zet de naam in VOORBEELDEN (src/klant/main.tsx).
const { chromium } = require("playwright");
const esbuild = require("esbuild");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const BRON = path.join(ROOT, "scripts/data/binders");
const UIT = path.join(ROOT, "public/img/voorbeeld");
const HOOGTE = 640; // de waaier toont ze hoogstens ~300 px hoog; scherp genoeg op een gsm met een scherm van 3×

(async () => {
  const code = esbuild.buildSync({
    stdin: {
      contents: `import { verkleinUitgeknipt } from "./src/lib/eigenfoto";
        window.maak = async (b64, type, hoogte) => {
          const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
          const r = await verkleinUitgeknipt(new File([bytes], "binder", { type }), 1200, 4_000_000, { rechtzetten: true });
          const img = new Image(); img.src = r.url; await img.decode();
          const s = Math.min(1, hoogte / img.naturalHeight);
          const c = document.createElement("canvas"); c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
          const x = c.getContext("2d"); x.imageSmoothingQuality = "high"; x.drawImage(img, 0, 0, c.width, c.height);
          return { url: c.toDataURL("image/webp", 0.84), weggehaald: r.weggehaald, rechtgezet: r.rechtgezet, w: c.width, h: c.height };
        };`,
      resolveDir: ROOT, loader: "ts",
    },
    bundle: true, write: false, format: "iife", target: "es2020",
  }).outputFiles[0].text;
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent("<!doctype html><title>binders</title>");
  await page.addScriptTag({ content: code });
  for (const f of fs.readdirSync(BRON).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).sort()) {
    const type = f.endsWith(".png") ? "image/png" : f.endsWith(".webp") ? "image/webp" : "image/jpeg";
    const r = await page.evaluate(([b, t, h]) => window.maak(b, t, h), [fs.readFileSync(path.join(BRON, f)).toString("base64"), type, HOOGTE]);
    const naam = f.replace(/\.\w+$/, "");
    const doel = path.join(UIT, `${naam}.webp`);
    fs.writeFileSync(doel, Buffer.from(r.url.split(",")[1], "base64"));
    console.log(`${path.relative(ROOT, doel)}  ${r.w}×${r.h}  ${Math.round(fs.statSync(doel).size / 1024)} kB${r.weggehaald ? "  achtergrond weg" : ""}${r.rechtgezet ? "  rechtgezet" : ""}`);
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
