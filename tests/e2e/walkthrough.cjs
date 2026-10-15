// Doorloopt de volledige "Testcase beursdag" in de echte app (demomodus, gsm-formaat),
// met Playwright en Chromium. Op het einde moeten kassa en voorraad exact kloppen.
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

function fouten(page) {
  const lijst = [];
  page.on("pageerror", (e) => lijst.push(e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|ERR_|tcgdex|fonts/.test(m.text())) lijst.push(m.text()); });
  return lijst;
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext(toestel);
  const page = await ctx.newPage();
  const f = fouten(page);
  page.on("dialog", (d) => d.accept());
  const foto = (naam) => page.screenshot({ path: path.join(SHOTS, `${naam}.png`) });
  const wacht = (ms = 300) => page.waitForTimeout(ms);
  const tab = (naam) => page.locator(".tabbalk button").filter({ hasText: naam }).click();
  const sheet = () => page.locator(".sheet").last();
  const geenHorizontaleScroll = async (waar, p = page) => {
    // Op een gsm zoomt de browser uit als iets te breed is: dan wordt innerWidth groter dan het scherm.
    const { breed, vw } = await p.evaluate(() => ({ breed: document.documentElement.scrollWidth - window.innerWidth, vw: window.innerWidth }));
    assert.ok(breed <= 0 && vw === toestel.viewport.width, `${waar}: te breed (${vw}px, scrolt ${breed}px)`);
  };
  const stap = (t) => console.log("·", t);

  // ── Kassa-hulpjes ──────────────────────────────────────────────────────────
  const wijGeven = () => page.locator(".mandje-kant").nth(0);
  const wijKrijgen = () => page.locator(".mandje-kant").nth(1);
  async function scan(...codes) {
    await wijGeven().getByRole("button", { name: "Scan" }).click();
    for (const c of codes) { await sheet().getByLabel("Code typen").fill(c); await wacht(200); }
  }
  async function scanKlaar() { await sheet().getByRole("button", { name: "Klaar" }).last().click(); await wacht(200); }
  async function verkoop(...codes) { await scan(...codes); await scanKlaar(); }
  async function artikel(naam) {
    await wijGeven().getByRole("button", { name: "Artikel" }).click();
    await sheet().locator(".lijst-knop", { hasText: naam }).click();
    await sheet().getByRole("button", { name: "Klaar" }).click();
  }
  async function klantKaart(kaarten) {
    await wijKrijgen().getByRole("button", { name: "Kaart van klant" }).click();
    for (const k of kaarten) {
      await sheet().getByRole("button", { name: "Handmatig", exact: true }).click();
      await sheet().getByRole("button", { name: "Handmatig invullen" }).click();
      await sheet().getByLabel("Naam (Engels)").fill(k.naam);
      if (k.taal) await sheet().locator("select").first().selectOption(k.taal);
      if (k.conditie) await sheet().getByRole("button", { name: k.conditie, exact: true }).click();
      if (k.waarde != null) await sheet().getByLabel("Ruilwaarde of inkoopprijs (€)").fill(String(k.waarde));
      await sheet().getByRole("button", { name: "In het mandje" }).click();
      await wacht(150);
    }
    await sheet().getByRole("button", { name: "Klaar", exact: true }).click();
  }
  async function prijs(naam, bedrag) {
    const r = page.locator(".regel", { hasText: naam });
    await r.locator(".prijs-knop").click();
    await r.locator("input").fill(String(bedrag));
    await r.locator("input").press("Enter");
  }
  async function totaal(kant, bedrag) {
    await kant.locator(".totaal-rij .prijs-knop").click();
    await kant.locator(".totaal-rij input").fill(String(bedrag));
    await kant.locator(".totaal-rij input").press("Enter");
    await wacht(150);
  }
  async function afrekenen(wijze = "cash", { cashDeel, klantGeeft } = {}) {
    await page.getByRole("button", { name: "Afrekenen" }).click();
    if (wijze === "sumup") await sheet().getByRole("button", { name: "SumUp", exact: true }).click();
    if (wijze === "beide") { await sheet().getByRole("button", { name: "Beide" }).click(); await sheet().getByLabel("Deel in cash (€)").fill(String(cashDeel)); }
    if (klantGeeft) {
      await sheet().locator(".wisselgeld .chip", { hasText: String(klantGeeft) }).click();
      await sheet().locator(".wisselgeld-bedrag").waitFor();
    }
    const tekst = klantGeeft ? await sheet().locator(".wisselgeld-bedrag").innerText() : null;
    await sheet().getByRole("button", { name: /^(Betaald|Betaald met SumUp|Uitbetaald|Bevestigen)$/ }).click();
    await page.locator(".gelukt").waitFor();
    return tekst;
  }
  async function volgende() { await page.getByRole("button", { name: "Volgende klant" }).click(); await wacht(150); }
  async function kas() { return page.locator(".beurs-balk").innerText(); }

  // ── A. Voorbereiding ───────────────────────────────────────────────────────
  stap("demo en testset");
  await page.goto(BASIS);
  await page.getByText("Uitproberen zonder account").click();
  await tab("Meer");
  await geenHorizontaleScroll("meer");
  await page.getByText("Testset inladen").click();
  await page.getByText(/exemplaren en \d+ artikelen ingeladen/).waitFor();
  await page.locator(".instagram-veld input").fill("bindr.test");
  await page.locator(".instagram-veld").getByRole("button", { name: "Bewaar" }).click();
  await tab("Catalogus");
  await wacht(800);
  assert.match(await page.locator(".kop-sub").first().innerText(), /85 exemplaren/);
  await foto("01-catalogus");
  await geenHorizontaleScroll("catalogus");

  stap("A4/A5: prijzen nakijken en zes nieuwe hartjes");
  await page.getByRole("button", { name: /Prijzen nakijken/ }).click();
  await page.getByText("6 hartjes moeten wisselen").waitFor();
  assert.equal(await page.locator(".tegel.wijzig").count(), 6);
  await wacht(500);
  await foto("02-prijscheck");
  for (let i = 0; i < 6; i++) {
    await page.locator(".tegel.wijzig").first().click();
    await sheet().getByRole("button", { name: "Nieuw hartje" }).click();
    await sheet().getByRole("button", { name: "Bewaar hartje" }).click();
    await page.keyboard.press("Escape");
    await wacht(200);
  }
  assert.equal(await page.locator(".tegel.wijzig").count(), 0);

  stap("vault en categorieën");
  await page.locator(".categorieen button", { hasText: "Sealed" }).click();
  await wacht(300);
  await foto("03-catalogus-sealed");
  await tab("Vault");
  await wacht(500);
  assert.match(await page.locator(".kop-sub").first().innerText(), /20 exemplaren/);
  await foto("04-vault");
  await geenHorizontaleScroll("vault");

  // ── B. Beurs starten ───────────────────────────────────────────────────────
  stap("B1/B4: beurs starten met startkas 150");
  await tab("Kassa");
  await page.getByRole("button", { name: "Beurs starten" }).click();
  await sheet().getByLabel("Naam").fill("Testbeurs Gent");
  await sheet().getByLabel(/Startbedrag in de cashkoffer/).fill("150");
  const startStand = await sheet().locator(".stand-rij").innerText();
  assert.match(startStand, /85 stuks/);
  assert.match(startStand, /7\.400/);
  await foto("05-beurs-starten");
  await geenHorizontaleScroll("beurs starten");
  await sheet().getByRole("button", { name: "Beurs starten" }).click();
  await wacht(200);

  // ── C. Verkopen ────────────────────────────────────────────────────────────
  stap("C1: Psyduck cash, klant geeft 60");
  await verkoop("FYA-Y74");
  await foto("06-mandje");
  await geenHorizontaleScroll("kassa");
  const wissel = await afrekenen("cash", { klantGeeft: 60 });
  assert.match(wissel, /10/);
  await foto("07-verkocht");
  await volgende();
  stap("C2 SumUp, C3 cash, C4 beide");
  await verkoop("EGH-0JA"); await afrekenen("sumup"); await volgende();
  await verkoop("7FV-EDH"); await afrekenen("cash"); await volgende();
  await verkoop("2Y9-YS7"); await afrekenen("beide", { cashDeel: 50 }); await volgende();
  stap("C5–C8");
  await verkoop("EPX-R3M"); await afrekenen("cash"); await volgende();
  await verkoop("AS3-4XT"); await afrekenen("sumup"); await volgende();
  await artikel("Booster pack Pitch Black"); await artikel("3D-print deckbox"); await afrekenen("cash"); await volgende();
  await verkoop("KRG-PWF"); await afrekenen("cash"); await volgende();
  assert.match(await kas(), /€\s?350/, "cashkoffer na C");
  assert.match(await kas(), /€\s?131/, "SumUp na C");

  // ── D. Onderhandelen ───────────────────────────────────────────────────────
  stap("D1: 12 → 10");
  await verkoop("YG4-AFZ"); await prijs("Pikachu", 10); await afrekenen("cash"); await volgende();
  stap("D2: 25 → 24 over twee kaarten");
  await verkoop("AK5-T86", "TBV-4GF"); await totaal(wijGeven(), 24);
  const d2 = await wijGeven().innerText();
  assert.match(d2, /11,52/); assert.match(d2, /12,48/);
  await foto("08-combo-korting");
  await afrekenen("sumup"); await volgende();
  stap("D3: 11 → 10 over drie kaarten");
  await verkoop("N02-E7H", "7W2-PX2", "TQW-C3T"); await totaal(wijGeven(), 10);
  assert.match(await wijGeven().innerText(), /4,54/);
  await afrekenen("cash"); await volgende();
  stap("D4: tegenbod 440");
  await verkoop("EAM-VNM"); await prijs("Team Rocket", 440); await afrekenen("sumup"); await volgende();

  // ── E. Ruilen ──────────────────────────────────────────────────────────────
  stap("E1: gelijke ruil");
  await verkoop("2QW-2C2"); await klantKaart([{ naam: "Ruilkaart E1", waarde: 15 }]);
  await foto("09-ruil");
  await afrekenen(); await volgende();
  stap("E2: klant betaalt 24 bij");
  await verkoop("GXJ-TGD"); await klantKaart([{ naam: "Ruilkaart E2a", waarde: 20 }, { naam: "Ruilkaart E2b", waarde: 10 }]);
  await afrekenen("cash"); await volgende();
  stap("E3: wij betalen 54");
  await verkoop("Z78-0R5"); await klantKaart([{ naam: "Ruilkaart E3", waarde: 70 }]);
  await afrekenen(); await volgende();
  stap("E4: drie kaarten tegen een binder, totaal 45");
  await verkoop("KAR-CW5"); await klantKaart([{ naam: "Ruilkaart E4a" }, { naam: "Ruilkaart E4b" }, { naam: "Ruilkaart E4c" }]);
  await totaal(wijKrijgen(), 45);
  await afrekenen(); await volgende();
  stap("E5: kaart tegen een 3D-print, wij geven 2 terug");
  await artikel("3D-print toploaderstandaard"); await klantKaart([{ naam: "Ruilkaart E5", waarde: 10 }]);
  await afrekenen(); await volgende();
  assert.match(await kas(), /€\s?(?:\d+\.)?\d+/);

  // ── F. Inkopen ─────────────────────────────────────────────────────────────
  stap("F1: vijf kaarten voor 24");
  await klantKaart([6, 5, 5, 4, 4].map((w, i) => ({ naam: `Inkoop F1-${i + 1}`, waarde: w })));
  await afrekenen(); await volgende();
  stap("F2 LP, F4 Chinees (bulk bestaat niet meer)");
  await klantKaart([{ naam: "Inkoop LP", conditie: "LP", waarde: 30 }]); await afrekenen(); await volgende();
  await klantKaart([{ naam: "Pikachu", taal: "CN-T", waarde: 8 }]); await afrekenen(); await volgende();

  stap("bod: twee kaarten uit de catalogus, marktwaarde en 70%");
  await wijKrijgen().getByRole("button", { name: "Kaart van klant" }).click();
  for (const q of ["togekiss swsh4 178", "charizard ex obf 125"]) {
    await sheet().locator(".zoekbalk input").fill(q);
    await sheet().locator(".resultaten li button").first().click();
    await sheet().locator(".markt").waitFor();
    const cm = await sheet().locator(".cm-knop").getAttribute("href");
    assert.match(cm, /idProduct=\d+&language=1&minCondition=2&sellerCountry=2,23/, "Cardmarket-link met NM, Engels, BE en NL");
    await sheet().getByRole("button", { name: "In het mandje" }).click();
    await wacht(200);
  }
  await sheet().getByRole("button", { name: "Klaar", exact: true }).click();
  const paneel = page.locator(".bod-paneel");
  await paneel.waitFor();
  assert.match(await paneel.innerText(), /70% van/);
  await paneel.locator(".bod-keuze").nth(1).click();
  await paneel.locator(".bod-stand").waitFor();
  assert.match(await paneel.locator(".bod-stand").innerText(), /\d+% van de marktwaarde/);
  await paneel.getByLabel("Eigen bod").fill("12");
  assert.match(await paneel.locator(".bod-pct").innerText(), /\d+%/);
  await foto("09b-bod");
  await geenHorizontaleScroll("bod");
  await page.getByRole("button", { name: "Leegmaken" }).click();
  await wacht(200);

  // ── G. Uitzonderingen ──────────────────────────────────────────────────────
  stap("G2: gewone verkoop (reserveren bestaat niet meer)");
  await verkoop("XS7-6TS"); await afrekenen("cash"); await volgende();
  stap("G3: verkeerd gescand, ongedaan maken");
  await verkoop("C99-983"); await afrekenen("cash");
  await page.getByRole("button", { name: "Ongedaan maken" }).last().click();
  await page.getByRole("heading", { name: "Ongedaan gemaakt" }).waitFor();
  await volgende();
  stap("G4: retour deckbox");
  await page.getByRole("button", { name: "Transacties" }).click();
  await sheet().locator(".transactie-rij", { hasText: "3D-print deckbox" }).click();
  await sheet().getByRole("button", { name: "Retour" }).click();
  await sheet().locator(".regel", { hasText: "Booster" }).locator("input[type=checkbox]").uncheck();
  await sheet().getByRole("button", { name: /^Retour: € ?12/ }).click();
  await page.keyboard.press("Escape"); await wacht(150);
  await page.keyboard.press("Escape"); await wacht(150);
  stap("G5: twee Mega Starmie ex (zonder offline conflict in de demo)");
  await verkoop("BWC-7YR"); await afrekenen("cash"); await volgende();
  await verkoop("XT6-6CZ"); await afrekenen("cash"); await volgende();
  stap("G6/G7: code typen, eigen prijs 1150 met slotje");
  await tab("Scan");
  await page.getByLabel("Code typen").fill("0j6 8vc");
  await page.locator(".scan-item", { hasText: "0J6-8VC" }).waitFor();
  await page.getByLabel("Code typen").fill("0J6-8VC");
  await wacht(300);
  assert.equal(await page.locator(".scan-item").count(), 1, "hetzelfde exemplaar komt maar één keer in de lijst");
  await foto("10-scanlijst");
  await page.locator(".scan-item .scan-rij-knop").first().click();
  await sheet().locator(".sheet-titel", { hasText: "0J6-8VC" }).waitFor();
  const label = await sheet().locator(".label-voorbeeld").getAttribute("src");
  fs.writeFileSync(path.join(SHOTS, "label-0J6-8VC.png"), Buffer.from(label.split(",")[1], "base64"));
  await sheet().getByRole("button", { name: "Nieuw hartje" }).click();
  await sheet().locator(".euro-invoer input").fill("1150");
  await sheet().getByRole("button", { name: "Bewaar hartje" }).click();
  await sheet().getByText("eigen prijs").waitFor();
  await foto("11-eigen-prijs");
  await page.keyboard.press("Escape");
  stap("G8: kaart uit de vault, hartje 60");
  await tab("Kassa");
  await scan("6RX-Y19");
  await sheet().getByText("Deze kaart ligt in de vault.").waitFor();
  await sheet().locator(".mandje-actie input").fill("60");
  await sheet().getByRole("button", { name: "Naar catalogus en in het mandje" }).click();
  await scanKlaar();
  await afrekenen("cash"); await volgende();

  // ── H. Afsluiting ──────────────────────────────────────────────────────────
  stap("H1–H4: kas tellen en afsluiten");
  const balk = await kas();
  assert.match(balk, /€\s?349/, `cashkoffer: ${balk}`);
  assert.match(balk, /€\s?595/, `SumUp: ${balk}`);
  await page.getByRole("button", { name: "Afsluiten" }).click();
  await sheet().getByLabel("Geteld in de cashkoffer (€)").fill("349");
  await sheet().getByText("De kas klopt.").waitFor();
  await sheet().getByLabel("Klopt met het totaal in de SumUp-app").check();
  await foto("12-afsluiten");
  await sheet().getByRole("button", { name: "Beurs stoppen" }).click();
  const rapport = await sheet().innerText();
  await foto("13-rapport");
  for (const [w, re] of [
    ["verkocht 18", /Verkocht\s*18/], ["weggeruild 4", /Weggeruild\s*4/], ["nieuw 15", /15 \(8 via ruil, 7 via inkoop\)/],
    ["voorraad", /105 → 98/], ["catalogus", /85 → 64 stuks/], ["waarde", /7\.400\s*→\s*€\s?6\.479/],
  ]) assert.match(rapport, re, w);
  await page.keyboard.press("Escape");

  // ── Klantenpagina ──────────────────────────────────────────────────────────
  stap("klantencatalogus (demo)");
  const klant = await ctx.newPage();
  const fk = fouten(klant);
  await klant.goto(BASIS + "catalogus/?demo=1");
  await klant.locator(".tegel").first().waitFor();
  const verwacht = await klant.evaluate(() => {
    const d = JSON.parse(localStorage.getItem("bindr-demo-v1"));
    return d.exemplaren.filter((e) => e.opslag === "vitrine" && e.status === "in voorraad" && e.hartjesprijs != null).length
      + d.artikelen.filter((a) => a.opslag === "vitrine" && a.aantal > 0 && a.prijs != null).reduce((s, a) => s + a.aantal, 0);
  });
  const getoond = await klant.locator(".klant .tegel").evaluateAll((ts) => ts.reduce((s, t) => {
    const m = t.querySelector(".aantal-merk");
    return s + (m ? Number(m.textContent.replace("×", "")) : 1);
  }, 0));
  assert.equal(getoond, verwacht, "klant ziet precies de catalogus (dubbels als één tegel met een aantal)");
  assert.ok(await klant.locator(".klant-merk img").isVisible(), "logo linksboven");
  await klant.getByRole("heading", { name: "Hier vind je onze volledige catalogus" }).waitFor();
  assert.match(await klant.locator(".klant-ig-knop").getAttribute("href"), /instagram\.com\/bindr\.test\//);
  const alle = await klant.locator(".klant .tegel").count();
  await klant.locator(".schakelchip", { hasText: "Andere talen" }).click();
  await klant.waitForTimeout(300);
  const anders = await klant.locator(".klant .tegel").count();
  assert.ok(anders > 0 && anders < alle, `filter andere talen (${anders} van ${alle})`);
  await klant.locator(".schakelchip", { hasText: "Andere talen" }).click();
  await klant.locator(".sorteer select").selectOption("set");
  await klant.locator(".set-kop").first().waitFor();
  await klant.locator(".sorteer select").selectOption("nieuw");
  assert.equal(await klant.locator(".tabbalk, .kop-knoppen, .beurs-balk").count(), 0, "geen beheer op de klantenpagina");
  await klant.screenshot({ path: path.join(SHOTS, "14-klant.png") });
  await geenHorizontaleScroll("klantenpagina", klant);
  await klant.locator(".tegel").first().click();
  await klant.getByRole("link", { name: /Bericht op Instagram/ }).waitFor();
  await klant.waitForTimeout(500);
  await geenHorizontaleScroll("klantendetail", klant);
  await klant.screenshot({ path: path.join(SHOTS, "15-klant-detail.png") });
  assert.deepEqual(fk, [], "geen fouten op de klantenpagina");
  await klant.close();

  assert.deepEqual(f, [], "geen JavaScript-fouten");
  const demo = await page.evaluate(() => localStorage.getItem("bindr-demo-v1"));
  await browser.close();

  // ── QR scannen met een nep-camera die het label van 0J6-8VC toont ─────────
  stap("QR-scan met nep-camera");
  const y4m = path.join(SHOTS, "label.y4m");
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-loop", "1", "-i", path.join(SHOTS, "label-0J6-8VC.png"),
    "-vf", "scale=576:-2,pad=640:480:(ow-iw)/2:(oh-ih)/2:white,format=yuv420p", "-t", "2", "-r", "15", y4m]);
  const b2 = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-video-capture=${y4m}`] });
  const ctx2 = await b2.newContext({ ...toestel, permissions: ["camera"] });
  await ctx2.addInitScript((d) => { localStorage.setItem("bindr-demo-v1", d); localStorage.setItem("bindr-modus", "demo"); }, demo);
  const p2 = await ctx2.newPage();
  const f2 = fouten(p2);
  await p2.goto(BASIS + "#scan");
  await p2.locator(".scan-item", { hasText: "0J6-8VC" }).waitFor({ timeout: 15000 });
  await p2.waitForTimeout(3000); // de camera blijft het label zien: het mag er niet nog eens bijkomen
  assert.equal(await p2.locator(".scan-item").count(), 1, "QR blijft in beeld, toch maar één keer in de lijst");
  await p2.waitForTimeout(400);
  await p2.screenshot({ path: path.join(SHOTS, "16-qr-gescand.png") });
  assert.deepEqual(f2, [], "geen JavaScript-fouten bij scannen");
  await b2.close();
  console.log("Alles in orde: de testcase beursdag klopt. Screenshots in", SHOTS);
})().catch((e) => { console.error(e); process.exit(1); });
