// Labels printen met een nagebootste Niimbot B1 Pro: verbinden, proeflabel, randtest en de
// afstelling (donkerte, hoger/lager, trager). Kijkt na wat de app aan de driver geeft.
// Daarna de Fichero (Action, 30 × 14 mm) met een nagebootste Bluetooth-printer: welke bytes
// er in welke volgorde naartoe gaan, het gedraaide beeld en de verschuiving naar rechts.
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
    // Nep-Bluetooth voor de Fichero: houdt elke write bij en antwoordt zoals de printer
    // (status 00, "OK" op de donkerte en na het stoppen). De Niimbot kijkt enkel of er Bluetooth is.
    const eq = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
    const bt = { writes: [], filters: null };
    const lees = Object.assign(new EventTarget(), { properties: { notify: true }, value: null });
    lees.startNotifications = async () => lees;
    const antwoord = (bytes) => setTimeout(() => { lees.value = new DataView(Uint8Array.from(bytes).buffer); lees.dispatchEvent(new Event("characteristicvaluechanged")); }, 5);
    const schrijf = {
      properties: { writeWithoutResponse: true },
      writeValueWithoutResponse: async (v) => {
        const b = [...new Uint8Array(v.buffer, v.byteOffset, v.byteLength)];
        bt.writes.push(b);
        if (eq(b, [0x10, 0xff, 0x40])) antwoord([0x00]);
        else if (b.length === 5 && eq(b.slice(0, 4), [0x10, 0xff, 0x10, 0x00])) antwoord([0x4f, 0x4b]);
        else if (eq(b, [0x10, 0xff, 0xfe, 0x45])) antwoord([0x4f, 0x4b]);
      },
      writeValue: async () => { throw new Error("niet zonder antwoord geschreven"); },
    };
    const dienst = { getCharacteristic: async (u) => (u.includes("2af1") ? schrijf : lees) };
    const gatt = {
      connected: false,
      connect: async () => { gatt.connected = true; return gatt; },
      disconnect: () => { gatt.connected = false; },
      getPrimaryService: async (u) => { if (!u.includes("18f0")) throw new Error("geen dienst"); return dienst; },
    };
    const toestel = Object.assign(new EventTarget(), { name: "FICHERO_5836", gatt });
    bt.requestDevice = async (o) => { bt.filters = o.filters; return toestel; };
    Object.defineProperty(Navigator.prototype, "bluetooth", { configurable: true, get: () => bt });
    window.__bt = bt;
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
  await sheet().locator(".afstellen:not(.fichero-uitleg) > summary").click();
  await sheet().getByRole("button", { name: "Proeflabel" }).click();
  await page.getByText(/Proeflabel geprint/).waitFor();
  let l = await log();
  assert.deepEqual(l[0], { density: 3, offsetY: 0, w: 576, h: 177, mode: null, pace: 10, n: 1 });
  assert.deepEqual(await beeld(0), [576, 177]);

  stap("donkerte 4, 0,5 mm lager, trager: randtest");
  await sheet().locator(".afstellen .chip", { hasText: /^4$/ }).click();
  await sheet().getByRole("button", { name: "Lager" }).click();
  await sheet().locator(".afstel-schuif strong", { hasText: "0,5 mm lager" }).waitFor();
  await sheet().locator(".afstellen:not(.fichero-uitleg) label.schakel").click();
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
  await sheet().locator(".afstellen:not(.fichero-uitleg) label.schakel").click();
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
  await sheet().locator(".afstellen:not(.fichero-uitleg) > summary").click();
  await sheet().locator(".afstel-schuif strong", { hasText: "1 mm hoger" }).waitFor();
  assert.equal(await sheet().locator(".afstellen .chip.aan").innerText(), "4");
  assert.equal(await sheet().locator(".maatkeuze:not(.printerkeuze) .chip.aan").innerText(), "50 × 30 mm");

  stap("Fichero (Action): kiezen en verbinden");
  await sheet().locator(".printerkeuze .chip", { hasText: "Fichero" }).click();
  await sheet().locator(".printerkeuze .chip.aan", { hasText: "Fichero" }).waitFor();
  assert.equal(await sheet().locator(".maatkeuze:not(.printerkeuze)").count(), 0, "geen keuze van de rol: altijd 30 × 14");
  await sheet().locator(".fichero-uitleg summary").click();
  assert.match(await sheet().locator(".fichero-uitleg ol").innerText(), /Rol erin[\s\S]*Niet koppelen[\s\S]*Verbinden[\s\S]*Proeflabel[\s\S]*Trager printen/);
  await sheet().locator(".fichero-uitleg").scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await foto("p3b-fichero-uitleg");
  await sheet().locator(".fichero-uitleg summary").click();
  await sheet().getByRole("button", { name: "Verbinden" }).click();
  await sheet().locator(".printerkaart.verbonden", { hasText: "Fichero 5836" }).waitFor();
  await sheet().locator(".printerkaart", { hasText: "Labels 30 × 14 mm" }).waitFor();
  const filters = await page.evaluate(() => window.__bt.filters);
  assert.ok(filters.some((f) => f.namePrefix === "FICHERO"), "enkel printers die Fichero heten");
  // Elke printer zijn eigen afstelling: de Fichero begint op Normaal en 0 mm (de Niimbot staat op 4 en 1 mm hoger).
  assert.equal(await sheet().locator(".afstellen .chip.aan").innerText(), "Normaal · standaard", "de Fichero heeft zijn eigen donkerte");
  assert.equal(await sheet().locator(".afstel-schuif strong").innerText(), "0 mm", "en zijn eigen verschuiving");

  stap("Fichero: proeflabel = status, donkerte, dan per label papier, wakker, aan, beeld, volgende, stop");
  await sheet().getByRole("button", { name: "Proeflabel" }).click();
  await page.getByText(/Proeflabel geprint/).waitFor();
  const raster = async (vanaf) => page.evaluate((vanaf) => {
    const w = window.__bt.writes.slice(vanaf);
    const i = w.findIndex((b) => b[0] === 0x1d && b[1] === 0x76 && b[2] === 0x30);
    const kop = w[i].slice(0, 8);
    const data = [];
    let j = i;
    for (; data.length < 8 + 2880; j++) data.push(...w[j]);
    return { kop, rest: data.length - 8 - 2880, data: data.slice(8), voor: w.slice(0, i).map((b) => b.length === 12 && b.every((x) => x === 0) ? "wakker" : b.map((x) => x.toString(16).padStart(2, "0")).join(" ")), na: w.slice(j).map((b) => b.map((x) => x.toString(16).padStart(2, "0")).join(" ")), groot: Math.max(...w.map((b) => b.length)) };
  }, vanaf);
  let r = await raster(0);
  assert.deepEqual(r.voor, ["10 ff 40", "10 ff 10 00 01", "10 ff 84 00", "wakker", "10 ff fe 01"]);
  assert.deepEqual(r.kop, [0x1d, 0x76, 0x30, 0x00, 0x0c, 0x00, 0xf0, 0x00]);
  assert.equal(r.rest, 0, "precies 240 rijen van 12 bytes");
  assert.deepEqual(r.na, ["1d 0c", "10 ff fe 45"]);
  assert.ok(r.groot <= 180, "hoogstens 180 bytes per keer");
  const zwart = r.data.reduce((n, b) => n + b.toString(2).split("1").length - 1, 0);
  assert.ok(zwart > 1500 && zwart < 12000, `een QR en tekst, geen leeg of zwart label (${zwart} zwarte pixels)`);
  // Het gedraaide beeld bewaren om te bekijken (zoals het uit de printer komt: 96 breed, 240 lang).
  const rasterPng = async (data, naam) => {
    const url = await page.evaluate((data) => {
      const c = document.createElement("canvas");
      c.width = 96; c.height = 240;
      const x = c.getContext("2d");
      x.fillStyle = "#fff"; x.fillRect(0, 0, 96, 240); x.fillStyle = "#000";
      for (let rij = 0; rij < 240; rij++) for (let k = 0; k < 96; k++) if ((data[rij * 12 + (k >> 3)] >> (7 - (k & 7))) & 1) x.fillRect(k, rij, 1, 1);
      return c.toDataURL("image/png");
    }, data);
    fs.writeFileSync(path.join(SHOTS, naam), Buffer.from(url.split(",")[1], "base64"));
  };
  await rasterPng(r.data, "p4-fichero-proeflabel.png");

  stap("Fichero: 0,5 mm naar rechts, randtest: de rand begint 4 rijen later");
  await sheet().getByRole("button", { name: "Naar rechts" }).click();
  await sheet().locator(".afstel-schuif strong", { hasText: "0,5 mm naar rechts" }).waitFor();
  const voor = await page.evaluate(() => window.__bt.writes.length);
  await sheet().getByRole("button", { name: "Randtest" }).click();
  await page.getByText(/Randtest geprint/).last().waitFor();
  await page.waitForFunction((n) => window.__bt.writes.length > n + 10, voor);
  r = await raster(voor);
  assert.ok(r.data.slice(0, 48).every((b) => b === 0), "de eerste 4 rijen zijn leeg");
  assert.ok(r.data.slice(48, 72).every((b) => b === 0xff), "rij 4 en 5: de linkerrand, over de hele kop");
  await rasterPng(r.data, "p5-fichero-randtest.png");

  await page.waitForTimeout(500);
  await foto("p3-fichero");
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth) <= 0, "niets steekt uit");

  stap("terug naar de Niimbot: de Fichero gaat los");
  await sheet().locator(".printerkeuze .chip", { hasText: "Niimbot" }).click();
  await sheet().locator(".printerkaart:not(.verbonden)").waitFor();
  await sheet().locator(".maatkeuze:not(.printerkeuze) .chip.aan", { hasText: "50 × 30 mm" }).waitFor();
  await sheet().locator(".afstel-schuif strong", { hasText: "1 mm hoger" }).waitFor();
  assert.equal(await sheet().locator(".afstellen .chip.aan").innerText(), "4", "de Niimbot hield zijn afstelling");

  assert.deepEqual(fouten, [], "geen JavaScript-fouten");
  await browser.close();
  console.log("Printer in orde. Screenshots in", SHOTS);
})().catch((e) => {
  console.error(e);
  // In GitHub Actions ook als melding bij de run (die zie je zonder het hele logboek te openen).
  if (process.env.GITHUB_ACTIONS) console.log(`::error title=${require("node:path").basename(__filename)}::${globalThis.laatsteStap ? `[${globalThis.laatsteStap}] ` : ""}${String(e && e.message || e).split("\n").filter(Boolean).slice(0, 4).join(" | ").replace(/[\r%]/g, " ")}`);
  process.exit(1);
});
