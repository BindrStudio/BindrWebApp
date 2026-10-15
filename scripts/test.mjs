// Bundelt tests/*.test.ts met esbuild en draait ze met de ingebouwde testrunner van Node.
import { readdir, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const extra = (process.env.NODE_PATH || "").split(path.delimiter).filter(Boolean);
let esbuild;
try { esbuild = require("esbuild"); } catch { for (const p of extra) { try { esbuild = require(path.join(p, "esbuild")); break; } catch {} } }
if (!esbuild) throw new Error("esbuild niet gevonden: voer `npm install` uit");

const uit = path.join(root, ".tests");
await rm(uit, { recursive: true, force: true });
await mkdir(uit, { recursive: true });
const tests = (await readdir(path.join(root, "tests"))).filter((f) => f.endsWith(".test.ts"));
await esbuild.build({
  entryPoints: tests.map((f) => path.join(root, "tests", f)),
  bundle: true, platform: "node", format: "esm", target: "node20", outdir: uit, outExtension: { ".js": ".mjs" },
  nodePaths: extra, logLevel: "warning",
});
const r = spawnSync(process.execPath, ["--test", ...tests.map((f) => path.join(uit, f.replace(/\.ts$/, ".mjs")))], { stdio: "inherit", cwd: root });
process.exit(r.status ?? 1);
