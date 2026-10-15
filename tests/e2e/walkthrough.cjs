// Doorloopt de app in demomodus op gsm-formaat, met Playwright en Chromium.
//   npm run serve            (in een ander venster: http://localhost:8080)
//   node tests/e2e/walkthrough.cjs [map-voor-screenshots]
// De QR-scan gebruikt een nep-camera die een label toont (vereist ffmpeg).
const { chromium, devices } = require("playwright");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

const BASIS = process.env.BASIS || "http://localhost:8080/";
const SHOTS = path.resolve(process.argv[2] || ".tests/shots");
fs.mkdirSync(SHOTS, { recursive: true });
const toestel = { ...devices["iPhone 13"], locale: "nl-BE" };
const foto = (page, naam) => page.screenshot({ path: path.join(SHOTS, `${naam}.png`) });
const wacht = (page, ms = 400) => page.waitForTimeout(ms);

function fouten(page) {
  const lijst = [];
  page.on("pageerror", (e) => lijst.push(e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|ERR_|tcgdex|fonts/.test(m.text())) lijst.push(m.text()); });
  return lijst;
}

async function geenHorizontaleScroll(page, waar) {
  const breed = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(breed <= 0, `${waar}: pagina scrolt ${breed}px horizontaal`);
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext(toestel);
  const page = await ctx.newPage();
  const f = fouten(page);

  // 1. Demo starten en testset inladen
  await page.goto(BASIS);
  await page.getByText("Uitproberen zonder account").click();
  await page.getByRole("button", { name: "Meer" }).click();
  await page.getByText("Testset inladen").click();
  await page.getByText(/exemplaren en \d+ artikelen ingeladen/).waitFor();
  await page.getByRole("button", { name: "Voorraad" }).click();
  await wacht(page, 900);
  const kop = await page.locator(".kop-sub").first().innerText();
  assert.match(kop, /85 exemplaren/);
  assert.match(kop, /7\.719/);
  await foto(page, "01-voorraad");
  await geenHorizontaleScroll(page, "voorraad");

  // 2. Prijzen nakijken: 6 kaarten lichten op
  await page.getByText("Prijzen nakijken").click();
  await page.getByText("6 hartjes moeten wisselen").waitFor();
  assert.equal(await page.locator(".tegel.wijzig").count(), 6);
  await wacht(page, 600);
  await foto(page, "02-prijscheck");

  // 3. Nieuw hartje voor Gengar VMAX (A5)
  await page.locator(".tegel.wijzig", { hasText: "Gengar VMAX" }).click();
  await page.getByText("Nieuw hartje nodig").waitFor();
  await wacht(page, 500);
  await foto(page, "03-exemplaar");
  await page.getByRole("button", { name: "Nieuw hartje" }).click();
  assert.equal(await page.locator(".euro-invoer input").inputValue(), "1080");
  await page.getByRole("button", { name: "Bewaar hartje" }).click();
  await page.getByText("Hartje van 1080 euro bewaard").waitFor();
  await page.keyboard.press("Escape");
  await wacht(page);
  assert.equal(await page.locator(".tegel.wijzig").count(), 5);
  assert.match(await page.locator(".kop-sub").first().innerText(), /7\.441/);

  // 4. Labels: 8 te printen, het label bevat een leesbare QR-code
  await page.getByRole("button", { name: "Labels" }).click();
  await wacht(page, 600);
  assert.equal(await page.locator(".labelrij").count(), 8);
  await foto(page, "04-labels");
  const gelezen = await page.evaluate(async () => {
    const img = document.querySelector(".labelrij img");
    const c = document.createElement("canvas");
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height);
    return window.jsQR(d.data, c.width, c.height)?.data ?? null;
  });
  assert.match(gelezen || "", /^BR:[0-9A-HJKMNP-TV-Z]{6}$/);

  // 5. Code typen opent het exemplaar (G6)
  await page.getByRole("button", { name: "Scan" }).click();
  await page.getByRole("button", { name: "Code typen" }).click();
  await page.locator(".code-veld").fill("0j6 8vc");
  await page.locator(".sheet-titel", { hasText: "0J6-8VC" }).waitFor();
  const label = await page.locator(".label-voorbeeld").getAttribute("src");
  fs.writeFileSync(path.join(SHOTS, "label-0J6-8VC.png"), Buffer.from(label.split(",")[1], "base64"));
  await page.keyboard.press("Escape");

  // 6. Toevoegen: Charizard V BRS 153, twee exemplaren met elk een eigen code
  await page.getByRole("button", { name: "Voorraad" }).click();
  await page.getByRole("button", { name: "Kaart toevoegen" }).first().click();
  await page.locator(".sheet .zoekbalk input").fill("BRS 153");
  await page.locator(".resultaten button", { hasText: "Charizard V" }).first().click();
  await page.locator(".stapper button", { hasText: "+" }).click();
  await wacht(page);
  await foto(page, "05-toevoegen");
  await page.getByRole("button", { name: "2 exemplaren toevoegen" }).click();
  await page.getByText("2 exemplaren toegevoegd").waitFor();
  const codes = await page.locator(".klaar .code").allInnerTexts();
  assert.equal(codes.length, 2);
  assert.notEqual(codes[0], codes[1]);
  await wacht(page, 500);
  await foto(page, "06-toegevoegd");
  await page.getByRole("button", { name: "Klaar" }).click();
  await page.getByRole("button", { name: /^Stockdoos/ }).click();
  assert.match(await page.getByRole("button", { name: /^Stockdoos/ }).innerText(), /22/);

  // 7. Meer
  await page.getByRole("button", { name: "Meer" }).click();
  await wacht(page);
  await foto(page, "07-meer");
  await geenHorizontaleScroll(page, "meer");

  assert.deepEqual(f, [], "geen JavaScript-fouten");
  const demo = await page.evaluate(() => localStorage.getItem("bindr-demo-v1"));
  await browser.close();

  // 8. QR scannen met een nep-camera die het label van 0J6-8VC toont
  const y4m = path.join(SHOTS, "label.y4m");
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-loop", "1", "-i", path.join(SHOTS, "label-0J6-8VC.png"),
    "-vf", "scale=576:-2,pad=640:480:(ow-iw)/2:(oh-ih)/2:white,format=yuv420p", "-t", "2", "-r", "15", y4m]);
  const b2 = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-video-capture=${y4m}`] });
  const ctx2 = await b2.newContext({ ...toestel, permissions: ["camera"] });
  await ctx2.addInitScript((d) => { localStorage.setItem("bindr-demo-v1", d); localStorage.setItem("bindr-modus", "demo"); }, demo);
  const p2 = await ctx2.newPage();
  const f2 = fouten(p2);
  await p2.goto(BASIS + "#scan");
  await p2.locator(".sheet-titel", { hasText: "0J6-8VC" }).waitFor({ timeout: 15000 });
  await wacht(p2, 500);
  await foto(p2, "08-qr-gescand");
  assert.deepEqual(f2, [], "geen JavaScript-fouten bij scannen");
  await b2.close();
  console.log("Alles in orde. Screenshots in", SHOTS);
})().catch((e) => { console.error(e); process.exit(1); });
