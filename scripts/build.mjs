// Bouwt src/ naar public/app.js (één bestand, geen runtime-afhankelijkheden).
//   node scripts/build.mjs           eenmalig, verkleind
//   node scripts/build.mjs --watch   bij elke wijziging opnieuw
// Werkt met `npm install` (node_modules) of met een NODE_PATH die esbuild en react bevat.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const extraPaths = (process.env.NODE_PATH || "").split(path.delimiter).filter(Boolean);
const require = createRequire(import.meta.url);
let esbuild;
try {
  esbuild = require("esbuild");
} catch {
  for (const p of extraPaths) {
    try { esbuild = require(path.join(p, "esbuild")); break; } catch {}
  }
}
if (!esbuild) throw new Error("esbuild niet gevonden: voer `npm install` uit");

const watch = process.argv.includes("--watch");
const options = {
  entryPoints: [path.join(root, "src/main.tsx")],
  bundle: true,
  format: "esm",
  target: ["es2020", "safari15", "chrome100"],
  jsx: "automatic",
  minify: !watch,
  sourcemap: watch ? "inline" : false,
  outfile: path.join(root, "public/app.js"),
  nodePaths: extraPaths,
  define: { "process.env.NODE_ENV": watch ? '"development"' : '"production"' },
  legalComments: "none",
  logLevel: "info",
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
} else {
  await esbuild.build(options);
  // Nieuwe versie van de service worker, zodat telefoons de nieuwe app ophalen.
  const hash = createHash("sha256");
  for (const f of ["public/app.js", "public/styles.css", "public/index.html"]) hash.update(await readFile(path.join(root, f)));
  const versie = hash.digest("hex").slice(0, 10);
  const sw = path.join(root, "public/sw.js");
  const inhoud = await readFile(sw, "utf8");
  await writeFile(sw, inhoud.replace(/const VERSIE = "[^"]*";/, `const VERSIE = "${versie}";`));
  console.log(`service worker versie ${versie}`);
}
