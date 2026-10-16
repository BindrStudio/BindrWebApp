// Labels printen met een nagebootste Niimbot B1 Pro: verbinden, proeflabel, randtest en de
// afstelling (donkerte, hoger/lager, trager). Kijkt na wat de app aan de driver geeft.
//   npm run serve            (in een ander venster: http://localhost:8080)
//   node tests/e2e/printer.cjs [map-voor-screenshots]
const { chromium, devices } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

const BASIS = process.env.BASIS || "http://localhost:8080/";
const SHOTS = path.resolve(process.argv[2] || ".tests/shots");
fs.mkdirSync(SHOTS, { recursive: true });
const toestel = { ...devices["iPhone 13"], locale: "nl-BE" };

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext(toestel);
  // Demo, Bluetooth "aanwezig" en een nep-driver die bijhoudt wat hij krijgt. De echte driver
  // (public/vendor/niimbot.js) zet window.Niimbot ook: die toewijzing wordt genegeerd.
  await ctx.addInitScript(() => {
    localStorage.setItem("bindr-modus", "demo");
    if (!navigator.bluetooth) Object.defineProperty(Navigator.prototype, "bluetooth", { configurable: true, get: () => ({}) });
    const log = [];
    const nep = {
      WRITE_MODE: null, PACE_MS: 10, verbonden: 0,
      isSupported: () => true,
      identify: async () => { nep.verbonden++; return { modelId: 4097, label: "Niimbot B1 Pro", task: "v4", dpi: 300 }; },
      printImage: async (url, o) => { log.push({ urls: [url], density: o.density, offsetY: o.offsetY, w: o.size.w_px, h: o.size.h_px, mode: nep.WRITE_MODE, pace: nep.PACE_MS }); o.onProgress && o.onProgress("ok"); },
      printBatch: async (urls, o) => { log.push({ urls, density: o.density, offsetY: o.offsetY, w: o.size.w_px, h: o.size.h_px, mode: nep.WRITE_MODE, pace: nep.PACE_MS }); o.onProgress && o.onProgress("ok"); },
      disconnect: async () => {},
    };
    window.__printLog = log;
    Object.defineProperty(window, "Niimbot", { configurable: true, get: () => nep, set: () => {} });
  });
  const page = await ctx.newPage();
  const fouten = [];
  page.on("pageerror", (e) => fouten.push(e.message));
  const sheet = () => page.locator(".sheet").last();
  const foto = (naam) => page.screenshot({ path: path.join(SHOTS, `${naam}.png`) });
  const log = () => page.evaluate(() => window.__printLog.map(({ urls, ...r }) => ({ ...r, n: urls.length })));
  const beeld = (i) => page.evaluate(async (i) => {
    const img = new Image();
    img.src = window.__printLog[i].urls[0];
    await img.decode();
    return [img.naturalWidth, img.naturalHeight];
  }, i);
  const stap = (t) => console.log("·", t);

  stap("Labels openen vanuit Instellingen en verbinden");
  await page.goto(BASIS + "beheer.html");
  await page.locator(".tabbalk").waitFor();
  await page.getByRole("button", { name: "Instellingen" }).click();
  await sheet().getByRole("button", { name: /Printer verbinden, proeflabel en afstellen/ }).click();
  await sheet().getByRole("button", { name: "Verbinden" }).click();
  await sheet().locator(".printerkaart.verbonden", { hasText: "Niimbot B1 Pro" }).waitFor();

  stap("proeflabel met de standaardafstelling");
  await sheet().locator(".afstellen summary").click();
  await sheet().getByRole("button", { name: "Proeflabel" }).click();
  await page.getByText(/Proeflabel geprint/).waitFor();
  let l = await log();
  assert.deepEqual(l[0], { density: 3, offsetY: 0, w: 576, h: 177, mode: null, pace: 10, n: 1 });
  assert.deepEqual(await beeld(0), [576, 177]);

  stap("donkerte 4, 0,5 mm lager, trager: randtest");
  await sheet().locator(".afstellen .chip", { hasText: /^4$/ }).click();
  await sheet().getByRole("button", { name: "Lager" }).click();
  await sheet().locator(".afstel-schuif strong", { hasText: "0,5 mm lager" }).waitFor();
  await sheet().getByText("Trager printen").click();
  await sheet().getByRole("button", { name: "Randtest" }).click();
  await page.getByText(/Randtest geprint/).waitFor();
  l = await log();
  assert.deepEqual(l[1], { density: 4, offsetY: 6, w: 576, h: 177, mode: "paced", pace: 20, n: 1 });
  assert.deepEqual(await beeld(1), [576, 177]);
  await page.waitForTimeout(500);
  await foto("p1-afstellen");
  const breed = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(breed <= 0, "niets steekt uit");
  // Het randtestbeeld zelf, om te bekijken.
  const png = await page.evaluate(() => window.__printLog[1].urls[0]);
  fs.writeFileSync(path.join(SHOTS, "p2-randtest-beeld.png"), Buffer.from(png.split(",")[1], "base64"));

  stap("andere rol (50 × 30) en hoger: de maat en de verschuiving volgen");
  await sheet().locator(".maatkeuze .chip", { hasText: "50 × 30 mm" }).click();
  await sheet().getByRole("button", { name: "Hoger" }).click();
  await sheet().getByRole("button", { name: "Hoger" }).click();
  await sheet().getByRole("button", { name: "Hoger" }).click();
  await sheet().locator(".afstel-schuif strong", { hasText: "1 mm hoger" }).waitFor();
  await sheet().getByText("Trager printen").click();
  await sheet().getByRole("button", { name: "Randtest" }).click();
  await page.getByText(/Randtest geprint/).last().waitFor();
  await page.waitForFunction(() => window.__printLog.length === 3);
  l = await log();
  assert.deepEqual(l[2], { density: 4, offsetY: -12, w: 576, h: 354, mode: null, pace: 10, n: 1 });
  assert.deepEqual(await beeld(2), [576, 354]);

  stap("na herladen: de afstelling blijft op dit toestel");
  await page.reload();
  await page.locator(".tabbalk").waitFor();
  await page.getByRole("button", { name: "Instellingen" }).click();
  await sheet().getByRole("button", { name: /Printer verbinden, proeflabel en afstellen/ }).click();
  await sheet().locator(".afstellen summary").click();
  await sheet().locator(".afstel-schuif strong", { hasText: "1 mm hoger" }).waitFor();
  assert.equal(await sheet().locator(".afstellen .chip.aan").innerText(), "4");
  assert.equal(await sheet().locator(".maatkeuze .chip.aan").innerText(), "50 × 30 mm");

  assert.deepEqual(fouten, [], "geen JavaScript-fouten");
  await browser.close();
  console.log("Printer in orde. Screenshots in", SHOTS);
})().catch((e) => {
  console.error(e);
  // In GitHub Actions ook als melding bij de run (die zie je zonder het hele logboek te openen).
  if (process.env.GITHUB_ACTIONS) console.log(`::error title=${require("node:path").basename(__filename)}::${globalThis.laatsteStap ? `[${globalThis.laatsteStap}] ` : ""}${String(e && e.message || e).split("\n").filter(Boolean).slice(0, 4).join(" | ").replace(/[\r%]/g, " ")}`);
  process.exit(1);
});
