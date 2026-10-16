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
    const { breed, vw, wie } = await p.evaluate((max) => ({
      breed: document.documentElement.scrollWidth - window.innerWidth, vw: window.innerWidth,
      // Wat steekt uit? (om het snel te vinden als de test faalt)
      wie: [...document.querySelectorAll("body *")].filter((el) => el.getBoundingClientRect().right > max + 1 && getComputedStyle(el).position !== "fixed")
        .slice(0, 4).map((el) => `${el.tagName.toLowerCase()}.${[...el.classList].join(".")} (${Math.round(el.getBoundingClientRect().right)})`),
    }), toestel.viewport.width);
    assert.ok(breed <= 0 && vw === toestel.viewport.width, `${waar}: te breed (${vw}px, scrolt ${breed}px): ${wie.join(", ")}`);
    // Ook in een open sheet mag niets uitsteken.
    const inSheet = await p.evaluate(() => [...document.querySelectorAll(".sheet-inhoud")].map((el) => el.scrollWidth - el.clientWidth).filter((x) => x > 1));
    assert.deepEqual(inSheet, [], `${waar}: een sheet is te breed`);
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
      if (k.waarde != null) await sheet().getByLabel("Marktwaarde").fill(String(k.waarde));
      await sheet().getByRole("button", { name: /^Toevoegen/ }).click();
      await wacht(150);
    }
    await sheet().getByRole("button", { name: /^Klaar/ }).last().click();
  }
  // Het bod voor alle kaarten van de klant samen: een eigen bedrag (zoals de testcase het afspreekt).
  async function bied(bedrag) {
    const p = page.locator(".bod-paneel");
    await p.getByLabel("Eigen bod").fill(String(bedrag));
    await p.getByLabel("Eigen bod").press("Enter");
    await p.locator(".bod-stand", { hasText: String(bedrag) }).waitFor();
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
  // Hartje onder de aankoopprijs: de app vraagt het eerst. In de testcase kiezen we telkens "Toch".
  async function tochAlsGevraagd() {
    await wacht(150);
    const vraag = sheet().locator(".onder-aankoop");
    if (await vraag.count()) await vraag.getByRole("button", { name: /^Toch/ }).click();
  }
  const binnenDagen = (n) => { const d = new Date(Date.now() + n * 86400000); return d.toISOString().slice(0, 10); };
  async function kas() { return page.locator(".beurs-balk").innerText(); }

  // ── A. Voorbereiding ───────────────────────────────────────────────────────
  stap("klantenpagina eerst, onderaan Beheer, daar inloggen met e-mail en wachtwoord, of de demo");
  await page.goto(BASIS + "?demo=1");
  assert.equal(await page.locator(".klant-balk a[href$='beheer.html']").count(), 0, "Beheer staat niet meer bovenaan");
  await page.locator(".voet-beheer").click();
  await page.waitForURL(/beheer\.html/);
  await page.getByPlaceholder("Wachtwoord", { exact: true }).waitFor();
  assert.equal(await page.getByLabel("Pincode").count(), 0, "inloggen gaat met het wachtwoord, de pincode is enkel van de gsm");
  await page.getByRole("button", { name: "Wachtwoord vergeten?" }).click();
  await page.getByRole("button", { name: "Stuur de mail" }).waitFor();
  await page.getByRole("button", { name: "Terug naar inloggen" }).click();
  await foto("00-login");
  await geenHorizontaleScroll("login");
  await page.getByText("Uitproberen zonder account").click();
  await page.locator(".tabbalk").waitFor();
  await foto("00b-intro");
  await page.getByRole("button", { name: "Instellingen" }).click();
  await sheet().getByText("Testset inladen").click();
  await page.getByText(/exemplaren en \d+ artikelen ingeladen/).waitFor();
  await sheet().locator(".instagram-veld input").fill("bindr.test");
  await sheet().locator(".instagram-veld").getByRole("button", { name: "Bewaar" }).click();
  await sheet().getByLabel("Naam (zoals in de KBO)").fill("Bind'r Studio");
  await sheet().getByLabel("Adres").fill("Teststraat 1, 9000 Gent");
  await sheet().getByLabel("Ondernemingsnummer").fill("0123.456.789");
  await sheet().getByLabel("Begin van de activiteit").fill("2026-07-01");
  await sheet().locator(".formulier").getByRole("button", { name: "Bewaar" }).click();
  await geenHorizontaleScroll("instellingen");
  await foto("00c-instellingen");
  await page.keyboard.press("Escape"); await wacht(200);
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
    await tochAlsGevraagd();
    await page.keyboard.press("Escape");
    await wacht(200);
  }
  assert.equal(await page.locator(".tegel.wijzig").count(), 0);

  stap("hartje onder de aankoopprijs: eerst een vraag, met de vault als uitweg");
  await page.locator(".tegel").first().click();
  await sheet().locator(".detail-foto .kantel-vlak").waitFor();
  await sheet().getByRole("button", { name: "Nieuw hartje" }).click();
  await sheet().locator(".hartje-blok .euro-invoer input").fill("0");
  await sheet().getByRole("button", { name: "Bewaar hartje" }).click();
  await sheet().locator(".onder-aankoop").waitFor();
  assert.ok(await sheet().locator(".onder-aankoop").getByRole("button", { name: "Naar de vault" }).isVisible());
  await foto("02b-onder-aankoop");
  await sheet().getByRole("button", { name: "Andere prijs" }).click();
  await sheet().getByRole("button", { name: "Annuleer" }).click();
  await page.keyboard.press("Escape");
  await wacht(200);

  stap("vault en categorieën");
  await page.locator(".categorieen button", { hasText: "Sealed" }).click();
  await wacht(300);
  await foto("03-catalogus-sealed");
  await tab("Vault");
  await wacht(500);
  assert.match(await page.locator(".kop-sub").first().innerText(), /20 exemplaren/);
  await foto("04-vault");
  await geenHorizontaleScroll("vault");

  stap("omgevingen: Brent heeft een eigen (lege) catalogus");
  await page.locator(".omgeving-pil").click();
  await sheet().getByRole("button", { name: /Brent/ }).click();
  await page.getByText("Je werkt nu in Brent").waitFor();
  await tab("Catalogus");
  await wacht(400);
  assert.match(await page.locator(".kop-sub").first().innerText(), /^0 exemplaren|Nog niets|leeg/i);
  await foto("04b-omgeving-brent");
  stap("Brent werkt als particulier: boekhouding uit, enkel voor Brent");
  await page.getByRole("button", { name: "Instellingen" }).click();
  await sheet().getByLabel(/Boekhouding voor Brent/).uncheck();
  await page.getByText("Brent werkt nu als particulier").waitFor();
  await page.keyboard.press("Escape"); await wacht(200);
  await tab("Profiel"); await wacht(300);
  assert.equal(await page.locator(".profiel-tegel.boekhouding, .profiel-tegel.prive").count(), 0, "geen boekhouding of privé als particulier");
  assert.equal(await page.getByText("Waar werk je?").count(), 0, "de omgeving kies je bovenaan, niet in Profiel");
  await page.locator(".omgeving-pil").click();
  await sheet().getByRole("button", { name: /Bind'r/ }).click();
  await wacht(400);
  assert.equal(await page.locator(".profiel-tegel.boekhouding").count(), 1, "Bind'r werkt met boekhouding");
  await tab("Catalogus"); await wacht(300);
  assert.match(await page.locator(".kop-sub").first().innerText(), /85 exemplaren/);

  // ── B. Beurs starten ───────────────────────────────────────────────────────
  stap("beurs plannen in Profiel › Beurzen (niet in de kassa): klanten zien hem bij Kom langs op onze stand");
  await tab("Kassa");
  assert.equal(await page.getByRole("button", { name: "Beurs plannen" }).count(), 0, "plannen kan niet in de kassa");
  await tab("Profiel");
  await page.locator(".profiel-tegel.beurzen").click();
  await sheet().getByRole("button", { name: "Plannen" }).click();
  await sheet().getByLabel("Naam").fill("Beurs Antwerpen");
  await sheet().getByLabel("Datum").fill(binnenDagen(30));
  await sheet().getByLabel("Plaats").fill("Antwerp Expo");
  await sheet().getByRole("button", { name: "Beurs plannen" }).click();
  // Later aanvullen: de uren en de website.
  await page.locator(".sheet").last().locator(".komend-rij", { hasText: "Beurs Antwerpen" }).click();
  await sheet().getByLabel("Uren (optioneel)").fill("10:00–17:00");
  await sheet().getByLabel(/Website/).fill("javascript:alert(1)");
  assert.ok(await sheet().getByRole("button", { name: "Bewaren" }).isDisabled(), "enkel een gewoon webadres");
  await sheet().getByLabel(/Website/).fill("www.antwerpexpo.be");
  await sheet().getByRole("button", { name: "Bewaren" }).click();
  await page.locator(".sheet").last().locator(".komend-rij", { hasText: "10:00–17:00" }).waitFor();
  await foto("05a-beurzen");
  await page.keyboard.press("Escape"); await wacht(200);
  await tab("Kassa");
  await page.locator(".beurs-volgende", { hasText: "Beurs Antwerpen" }).waitFor();

  stap("B1/B4: beurs starten met startkas 150");
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
  stap("C1: Psyduck cash, klant geeft 60 (met inkoop en marge even zichtbaar)");
  await verkoop("FYA-Y74");
  await page.getByRole("button", { name: "Inkoop" }).click();
  await page.locator(".marge-rij").waitFor();
  await foto("06-mandje");
  await page.getByRole("button", { name: "Inkoop" }).click();
  assert.equal(await page.locator(".marge-rij").count(), 0);
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
  stap("beurs bezig: live cijfers per soort");
  assert.match(await page.locator(".beurs-live").innerText(), /Beurs bezig/);
  await page.locator(".beurs-meer").click();
  const dash = await page.locator(".beurs-dashboard").innerText();
  for (const w of ["kaarten", "3D-print", "sealed", "Ingekocht", "Ruil"]) assert.match(dash, new RegExp(w, "i"), `dashboard toont ${w}`);
  await foto("07b-beurs-cijfers");
  await page.locator(".beurs-meer").click();

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
  await verkoop("2QW-2C2"); await klantKaart([{ naam: "Ruilkaart E1", waarde: 15 }]); await bied(15);
  await foto("09-ruil");
  await afrekenen(); await volgende();
  stap("E2: klant betaalt 24 bij");
  await verkoop("GXJ-TGD"); await klantKaart([{ naam: "Ruilkaart E2a", waarde: 20 }, { naam: "Ruilkaart E2b", waarde: 10 }]); await bied(30);
  await afrekenen("cash"); await volgende();
  stap("E3: wij betalen 54");
  await verkoop("Z78-0R5"); await klantKaart([{ naam: "Ruilkaart E3", waarde: 70 }]); await bied(70);
  await afrekenen(); await volgende();
  stap("E4: drie kaarten tegen een binder, totaal 45");
  await verkoop("KAR-CW5"); await klantKaart([{ naam: "Ruilkaart E4a" }, { naam: "Ruilkaart E4b" }, { naam: "Ruilkaart E4c" }]);
  await totaal(wijKrijgen(), 45);
  await afrekenen(); await volgende();
  stap("E5: kaart tegen een 3D-print, wij geven 2 terug");
  await artikel("3D-print toploaderstandaard"); await klantKaart([{ naam: "Ruilkaart E5", waarde: 10 }]); await bied(10);
  await afrekenen(); await volgende();
  assert.match(await kas(), /€\s?(?:\d+\.)?\d+/);
  stap("historiek: alle transacties met pijltjes, filter op ruil");
  await page.getByRole("button", { name: "Historiek" }).click();
  await sheet().getByText("Testbeurs Gent").first().waitFor();
  await sheet().getByRole("button", { name: "Alle transacties" }).click();
  assert.ok(await sheet().locator(".tr-icoon.verkoop").count() > 5, "verkopen met pijl");
  await sheet().locator(".filterchips .chip", { hasText: "Ruil" }).click();
  const ruilen = await sheet().locator(".transactie-rij").count();
  assert.ok(ruilen >= 4 && ruilen === await sheet().locator(".tr-icoon.ruil").count(), `enkel ruilen (${ruilen})`);
  await foto("09c-historiek");
  await page.keyboard.press("Escape"); await wacht(200);

  // ── F. Inkopen ─────────────────────────────────────────────────────────────
  stap("F1: vijf kaarten voor 24");
  await klantKaart([6, 5, 5, 4, 4].map((w, i) => ({ naam: `Inkoop F1-${i + 1}`, waarde: w })));
  await bied(24);
  const f1 = await wijKrijgen().innerText();
  assert.match(f1, /markt €\s?6/); // per kaart: de marktwaarde en wat we echt betalen
  await afrekenen(); await volgende();
  stap("F2 LP, F4 Chinees (bulk bestaat niet meer)");
  await klantKaart([{ naam: "Inkoop LP", conditie: "LP", waarde: 30 }]); await bied(30);
  // Gekocht van een andere stand (enkel ter info, komt mee in de transactie).
  await page.getByRole("button", { name: "Afrekenen" }).click();
  await sheet().getByLabel(/Van een andere vendor/).check();
  await sheet().getByRole("button", { name: "Uitbetaald" }).click();
  await page.locator(".gelukt").waitFor(); await volgende();
  await klantKaart([{ naam: "Pikachu", taal: "CN-T", waarde: 8 }]); await bied(8); await afrekenen(); await volgende();

  stap("inkoop zoals aan de stand: kaart zoeken, marktwaarde, slider en afronden");
  await wijKrijgen().getByRole("button", { name: "Kaart van klant" }).click();
  for (const q of ["togekiss swsh4 178", "charizard ex obf 125"]) {
    await sheet().locator(".zoekbalk input").fill(q);
    await sheet().locator(".resultaten li button").first().click();
    await sheet().locator(".markt-idee").waitFor();
    const cm = await sheet().locator(".markt-idee a").first().getAttribute("href");
    assert.match(cm, /idProduct=\d+&language=1&minCondition=2&sellerCountry=2,23/, "Cardmarket-link met NM, Engels, BE en NL");
    assert.ok(Number((await sheet().getByLabel("Marktwaarde").inputValue()).replace(",", ".")) > 0, "marktwaarde voorgesteld");
    await sheet().getByRole("button", { name: /^Toevoegen/ }).click();
    await wacht(200);
  }
  await sheet().getByRole("button", { name: /^Klaar/ }).last().click();
  const paneel = page.locator(".bod-paneel");
  await paneel.waitFor();
  assert.match(await paneel.innerText(), /70% van/);
  await paneel.locator(".bod-slider input").fill("85");
  await paneel.locator(".bod-som", { hasText: "85% van" }).waitFor();
  await paneel.locator(".bod-keuze", { hasText: "↑" }).first().click();
  await paneel.locator(".bod-stand").waitFor();
  assert.match(await paneel.locator(".bod-stand").innerText(), /\d+% van de marktwaarde/);
  const kaarten = await wijKrijgen().locator(".regel .prijs-knop strong").allInnerTexts();
  const betaald = kaarten.reduce((x, t) => x + Number(t.replace(/[^\d,]/g, "").replace(",", ".")), 0);
  const stand = Number((await paneel.locator(".bod-stand strong").innerText()).replace(/[^\d,]/g, "").replace(",", "."));
  assert.ok(Math.abs(betaald - stand) < 0.005 && Number.isInteger(stand), `afgerond bod ${stand} verdeeld over de kaarten (${betaald})`);
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
  await page.getByRole("button", { name: "Historiek" }).click();
  await sheet().getByRole("button", { name: "Alle transacties" }).click();
  await sheet().locator(".transactie-rij", { hasText: "3D-print deckbox" }).first().click();
  await sheet().getByRole("button", { name: "Retour of terugdraaien" }).click();
  await sheet().locator(".regel", { hasText: "Booster" }).locator("input[type=checkbox]").uncheck();
  await sheet().getByRole("button", { name: /^€\s?12(,\d\d)? cash terug/ }).click();
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
  await sheet().locator(".hartje-blok .euro-invoer input").fill("1150");
  await sheet().getByRole("button", { name: "Bewaar hartje" }).click();
  await tochAlsGevraagd();
  await sheet().getByText("eigen prijs").waitFor();
  await foto("11-eigen-prijs");
  await page.keyboard.press("Escape");
  stap("G8: kaart uit de vault, hartje 60");
  await tab("Kassa");
  await scan("6RX-Y19");
  await sheet().getByText("Deze kaart ligt in de vault.").waitFor();
  await sheet().locator(".mandje-actie input").fill("60");
  await sheet().getByRole("button", { name: "Naar catalogus en in het mandje" }).click();
  await tochAlsGevraagd();
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

  stap("binder toevoegen bij Profiel › Artikels, met twee foto's, in de vault");
  await tab("Profiel");
  await page.locator(".profiel-tegel", { hasText: "Artikels" }).click();
  await sheet().getByRole("button", { name: "Nieuwe binder" }).click();
  await sheet().locator('.artikel-fotos input[type="file"]').setInputFiles([path.resolve(__dirname, "../../public/img/eend.png"), path.resolve(__dirname, "../../public/img/logo.png")]);
  await sheet().locator(".artikel-duim.hoofd img").waitFor();
  await sheet().locator(".artikel-duim:not(.hoofd):not(.nieuw) img").waitFor();
  await sheet().getByLabel("Artwork (welk ontwerp staat erop?)").fill("Gengar");
  await sheet().getByRole("button", { name: "Lasergravure" }).click();
  await sheet().getByRole("button", { name: "9-pocket" }).click();
  await sheet().getByLabel("Binder voor toploaders").check();
  await sheet().getByLabel("Verkoopprijs per stuk (€)").fill("45");
  await sheet().getByLabel("Kostprijs per stuk (€)").fill("18");
  await sheet().getByRole("button", { name: "Vault", exact: true }).click();
  await sheet().locator(".stapper button").last().click();
  await sheet().locator(".stapper button").last().click();
  await foto("17-binder-nieuw");
  await sheet().getByRole("button", { name: "Toevoegen", exact: true }).click();
  await sheet().locator(".artikel-rij", { hasText: "Gengar" }).waitFor();
  assert.match(await sheet().locator(".artikel-rij", { hasText: "Gengar" }).innerText(), /3\s*stuks/);
  await foto("18-artikels");
  await sheet().locator(".artikel-rij", { hasText: "Gengar" }).click();
  await sheet().locator(".artikel-duim img").nth(1).waitFor();
  assert.equal(await sheet().locator(".artikel-duim img").count(), 2, "hoofdfoto en een extra foto");
  await sheet().locator(".sheet-kop").getByRole("button", { name: "Sluiten" }).click(); await wacht(200);
  stap("een artikel verwijderen (en terugzetten)");
  await sheet().locator(".chip", { hasText: "3D-prints" }).click();
  await sheet().getByRole("button", { name: "Nieuwe 3D-print" }).click();
  await sheet().getByLabel("Naam").fill("Proefprint weg");
  await sheet().getByRole("button", { name: "Toevoegen", exact: true }).click();
  await sheet().locator(".artikel-rij", { hasText: "Proefprint weg" }).click();
  await sheet().getByRole("button", { name: "Artikel verwijderen" }).click();
  await sheet().getByRole("button", { name: "Verwijderen", exact: true }).click();
  await page.locator(".toast", { hasText: "Proefprint weg verwijderd" }).waitFor();
  assert.equal(await sheet().locator(".artikel-rij", { hasText: "Proefprint weg" }).count(), 0, "verwijderd artikel staat niet meer in de lijst");
  await page.locator(".toast", { hasText: "Proefprint weg verwijderd" }).getByRole("button", { name: "Ongedaan" }).click();
  await sheet().locator(".artikel-rij", { hasText: "Proefprint weg" }).waitFor();
  await sheet().locator(".artikel-rij", { hasText: "Proefprint weg" }).click();
  await sheet().getByRole("button", { name: "Artikel verwijderen" }).click();
  await sheet().getByRole("button", { name: "Verwijderen", exact: true }).click();
  await wacht(200);
  await page.keyboard.press("Escape"); await wacht(200);

  stap("een kaart zonder foto krijgt een eigen foto");
  await tab("Vault");
  await page.locator(".tegel", { hasText: "Inkoop LP" }).first().click();
  await sheet().locator(".eigen-foto.geen").waitFor();
  await sheet().locator('.eigen-foto input[type="file"]').setInputFiles(path.resolve(__dirname, "../../public/img/eend.png"));
  await sheet().locator('.detail-foto img[src^="data:image/jpeg"]').waitFor();
  await page.getByText("Foto bewaard").waitFor();
  await foto("19a-eigen-foto");
  await page.keyboard.press("Escape"); await wacht(200);

  stap("graded kaart toevoegen: slab, laatste verkopen en schatting");
  await tab("Catalogus");
  await page.getByRole("button", { name: "Toevoegen" }).click();
  await sheet().locator(".zoekbalk input").fill("charizard ex obf 125");
  await sheet().locator(".resultaten li button").first().click();
  await sheet().getByRole("button", { name: "Graded (slab)" }).click();
  await sheet().getByRole("button", { name: "PSA", exact: true }).click();
  await sheet().getByLabel("Certificaat (optioneel)").fill("12345678");
  assert.match(await sheet().locator(".sold-links a").first().getAttribute("href"), /ebay\.com\/sch\/i\.html\?_nkw=Charizard.*PSA.*10.*LH_Sold=1&LH_Complete=1/);
  for (const [d, p] of [["2026-10-01", "180"], ["2026-09-20", "170"], ["2026-10-10", "195"]]) {
    await sheet().getByLabel("Datum van de verkoop").fill(d);
    await sheet().getByLabel("Prijs", { exact: true }).fill(p);
    await sheet().getByRole("button", { name: "Voeg toe" }).click();
  }
  await sheet().locator(".schatting").waitFor();
  await sheet().locator(".schatting").getByRole("button", { name: "Gebruik" }).click();
  await foto("19-graded");
  await sheet().getByRole("button", { name: "Catalogus (met hartje)" }).click();
  await sheet().locator(".sheet-actie .knop").click();
  await sheet().getByText(/Exemplaar toegevoegd/).waitFor();
  await page.keyboard.press("Escape"); await wacht(300);
  assert.ok(await page.locator(".tegel.slab .slab-label", { hasText: "PSA" }).count() >= 1, "slab-kader in de catalogus");
  await foto("20-catalogus-slab");

  // ── Versie 0.6 ─────────────────────────────────────────────────────────────
  stap("kassa: zoeken toont meteen de voorraad, nieuwste eerst");
  await tab("Kassa");
  await wijGeven().getByRole("button", { name: "Zoek" }).click();
  await sheet().locator(".resultaten li").first().waitFor();
  assert.ok(await sheet().locator(".resultaten li").count() >= 20, "voorraad zonder te typen");
  assert.match(await sheet().locator(".zoeker-telling").innerText(), /nieuwste eerst/);
  await sheet().getByRole("button", { name: "Vault", exact: true }).click();
  assert.ok(await sheet().locator(".resultaten li").count() > 0, "enkel de vault");
  await foto("21-zoek-voorraad");
  await page.keyboard.press("Escape"); await wacht(200);

  stap("inkoop met een eigen % per kaart, aankoopbewijs met foto en handtekening (boven € 250)");
  await klantKaart([{ naam: "Vintage Base", waarde: 400 }, { naam: "Modern A", waarde: 160 }, { naam: "Modern B", waarde: 160 }]);
  const pk = page.locator(".bod-paneel");
  await pk.getByRole("button", { name: "Per kaart" }).click();
  assert.equal(await pk.locator(".bod-slider").count(), 0, "per kaart: geen grote schuifknop");
  for (let i = 0; i < 2; i++) { await pk.getByRole("button", { name: "Algemeen 5% meer" }).click(); await wacht(80); }
  assert.match(await pk.locator(".bod-algemeen").innerText(), /80%/);
  const vintage = page.locator(".regel", { hasText: "Vintage Base" });
  await vintage.evaluate((el) => el.scrollIntoView({ block: "center" }));
  for (let i = 0; i < 3; i++) { await vintage.getByRole("button", { name: /5% minder/ }).dispatchEvent("click"); await wacht(120); }
  await pk.locator(".bod-samen-label").waitFor();
  assert.match(await pk.locator(".bod-samen-label").innerText(), /samen\s*72%/, "het algemene percentage toont het nieuwe totaal");
  assert.match(await pk.locator(".bod-som").innerText(), /Samen 72% van €\s?720(,00)? = €\s?516(,00)?/);
  assert.match(await vintage.innerText(), /65%/);
  await foto("22-per-kaart");
  await geenHorizontaleScroll("per kaart");
  await page.getByRole("button", { name: "Afrekenen" }).click();
  await sheet().locator('.afreken-fotos input[type="file"]').setInputFiles(path.resolve(__dirname, "../../public/img/eend.png"));
  await sheet().locator(".afreken-fotos .foto-duim").waitFor();
  await sheet().getByLabel("Naam", { exact: true }).fill("Jan Peeters");
  await sheet().getByLabel(/Gemeente/).fill("Antwerpen");
  assert.equal(await sheet().getByText(/Identiteitskaart/).count(), 0, "geen vinkje voor de identiteitskaart");
  await sheet().getByRole("button", { name: "Laten tekenen" }).click();
  const vlak = sheet().locator(".handtekening-vlak");
  await vlak.waitFor(); await wacht(600); // de sheet schuift eerst omhoog
  const box = await vlak.boundingBox();
  await page.mouse.move(box.x + 30, box.y + box.height * 0.6);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(box.x + 30 + i * 22, box.y + box.height * (0.6 + Math.sin(i) * 0.25));
  await page.mouse.up();
  await foto("23-handtekening");
  await sheet().getByRole("button", { name: "Klaar" }).click();
  await sheet().locator(".handtekening-mini svg").waitFor();
  await foto("24-afrekenen-borderel");
  await sheet().getByRole("button", { name: "Uitbetaald" }).click();
  await page.locator(".gelukt").waitFor();
  assert.match(await page.locator(".gelukt .borderel-knop").innerText(), /AB-\d{4}-[0-9A-F]{6}[\s\S]*in orde/);
  await volgende();

  stap("kas: enkel tijdens een beurs; een andere stand betaalt 50 met SumUp en krijgt cash");
  assert.equal(await page.getByRole("button", { name: "Kas", exact: true }).count(), 0, "zonder beurs geen kas");
  await page.getByRole("button", { name: "Beurs starten" }).click();
  await sheet().getByLabel("Naam").fill("Avondmarkt");
  await sheet().getByLabel(/Startbedrag in de cashkoffer/).fill("100");
  await sheet().getByRole("button", { name: "Beurs starten" }).click();
  await wacht(200);
  await page.getByRole("button", { name: "Kas", exact: true }).click();
  await sheet().getByRole("button", { name: "Wissel via SumUp" }).click();
  await sheet().getByLabel("Bedrag").fill("50");
  await sheet().getByLabel("Welke stand (optioneel)").fill("Kaartenkelder");
  await sheet().getByRole("button", { name: /SumUp €\s?50(,00)? in/ }).click();
  await page.getByText(/SumUp €\s?50(,00)? ontvangen/).waitFor();
  // Tijdens een beurs kan je niet "buiten een beurs" inkopen (dat zou de kas verstoren).
  await tab("Profiel");
  const thuis = page.locator(".profiel-tegel", { hasText: "Ingekocht buiten een beurs" });
  assert.match(await thuis.innerText(), /Kan niet zolang Avondmarkt loopt/);
  await thuis.dispatchEvent("click");
  await page.getByText(/Avondmarkt loopt nog/).waitFor();
  await tab("Kassa");
  await page.getByRole("button", { name: "Afsluiten" }).click();
  await sheet().getByLabel("Geteld in de cashkoffer (€)").fill("50");
  await sheet().getByText("De kas klopt.").waitFor();
  await sheet().getByLabel("Klopt met het totaal in de SumUp-app").check();
  await sheet().getByRole("button", { name: "Beurs stoppen" }).click();
  await wacht(200);
  await page.keyboard.press("Escape"); await wacht(200);

  stap("boekhouding: dagontvangsten, borderel, voorraad op een datum");
  await tab("Profiel");
  await wacht(600);
  await geenHorizontaleScroll("profiel");
  await foto("25-profiel");
  await page.locator(".profiel-tegel", { hasText: "Boekhouding" }).click();
  await sheet().locator(".jaar-teller").waitFor(); await wacht(500);
  assert.match(await sheet().locator(".jaar-teller").innerText(), /€\s?12\.603/, "grens pro rata vanaf 1 juli");
  await foto("26-boekhouding");
  await geenHorizontaleScroll("boekhouding");
  await sheet().locator(".boek-dag").first().click();
  await sheet().locator(".dexxter-lijnen li").first().waitFor();
  const dexxter = await sheet().locator(".dexxter-lijnen li strong").allInnerTexts();
  const somDexxter = dexxter.reduce((x, t) => x + Number(t.replace(/[^\d,]/g, "").replace(",", ".")) * (/[−-]/.test(t) ? -1 : 1), 0);
  const ontvangen = await sheet().locator(".afsluit-rij.totaal", { hasText: "Ontvangsten" }).locator("strong").innerText();
  assert.ok(Math.abs(somDexxter - Number(ontvangen.replace(/[^\d,]/g, "").replace(",", "."))) < 0.01, `Dexxter-lijnen (${somDexxter}) = ontvangsten (${ontvangen})`);
  assert.match(await sheet().innerText(), /Kasbewegingen \(geen omzet\)/);
  await sheet().getByLabel("Ingegeven in Dexxter").check();
  await foto("27-dag");
  await page.keyboard.press("Escape"); await wacht(200);
  assert.equal(await sheet().locator(".boek-dag .boek-vink.aan").count(), 1, "dag aangevinkt");
  await sheet().getByRole("button", { name: "Aankoop", exact: true }).click();
  await sheet().locator(".boek-dag").first().click();
  await sheet().locator(".dexxter-lijnen li", { hasText: "Aankoop kaarten" }).waitFor();
  await wacht(500);
  await foto("27b-aankoopdag");
  await geenHorizontaleScroll("aankopen van een dag");
  await sheet().locator(".lijst-knop", { hasText: "Jan Peeters" }).click();
  await sheet().locator(".borderel-stand.ok").waitFor();
  assert.match(await sheet().locator(".borderel-lijnen").first().innerText(), /markt €\s?400(,00)? · 65%/);
  assert.equal(await sheet().locator(".transactie-fotos .foto-duim").count(), 1, "de foto van de aankoop");
  await sheet().getByRole("button", { name: "Afdrukken of pdf" }).click();
  await page.locator("#afdruk .doc h1", { hasText: "Aankoopbewijs" }).waitFor({ state: "attached" });
  assert.match(await page.locator("#afdruk").innerText(), /Bind'r Studio[\s\S]*0123\.456\.789[\s\S]*Jan Peeters, Antwerpen/);
  assert.equal(await page.locator("#afdruk .doc-fotos img").count(), 1, "foto op het bewijs");
  await foto("28-bewijs");
  await page.keyboard.press("Escape"); await wacht(200);
  await sheet().getByRole("button", { name: "Dagstaat aankopen (pdf)" }).click();
  await page.locator("#afdruk .doc h1", { hasText: "Dagstaat aankopen" }).waitFor({ state: "attached" });
  await page.keyboard.press("Escape"); await wacht(200);
  await sheet().getByRole("button", { name: "Voorraad" }).click();
  await sheet().locator(".voorraad-totaal").waitFor();
  await geenHorizontaleScroll("voorraad op datum");
  assert.match(await sheet().locator(".voorraad-totaal strong").innerText(), /€\s?[\d.]+,\d\d/);
  await foto("29-voorraad-datum");
  await page.keyboard.press("Escape"); await wacht(200);

  stap("inzichten");
  await page.locator(".profiel-tegel", { hasText: "Inzichten" }).click();
  await sheet().locator(".inzicht-kern").waitFor(); await wacht(700);
  assert.ok(await sheet().locator(".podium-plek").count() >= 1, "populairste Pokémon");
  assert.ok(await sheet().locator(".balken li").count() >= 3, "balken");
  await geenHorizontaleScroll("inzichten");
  await foto("30-inzichten");
  await sheet().locator(".inzicht-kolommen, .kolommen").first().scrollIntoViewIfNeeded();
  await foto("31-inzichten-2");
  await page.keyboard.press("Escape"); await wacht(200);

  stap("deal terugdraaien: de verkoper wil zijn kaarten terug en betaalt ons terug");
  await page.locator(".profiel-tegel", { hasText: "Historiek" }).click();
  await sheet().getByRole("button", { name: "Alle transacties" }).click();
  assert.ok(await sheet().locator(".tr-waar.beurs", { hasText: "Testbeurs Gent" }).count() > 5, "bij elke transactie staat waar ze gebeurde");
  assert.equal(await sheet().locator(".tr-waar.vendor").count(), 1, "de aankoop bij een andere vendor");
  await foto("31b-historiek-waar");
  await sheet().locator(".transactie-rij", { hasText: "Vintage Base" }).first().click();
  await sheet().getByRole("button", { name: "Retour of terugdraaien" }).click();
  for (const n of ["Vintage Base", "Modern A", "Modern B"]) await sheet().locator(".regel", { hasText: n }).locator("input[type=checkbox]").check();
  await sheet().getByRole("button", { name: /^Klant betaalt €\s?516(,00)?/ }).click();
  await page.getByText(/Teruggedraaid: klant betaalt/).waitFor();
  await page.keyboard.press("Escape"); await wacht(150);
  await page.keyboard.press("Escape"); await wacht(150);

  stap("setkiezer: per taal en per jaar");
  await tab("Catalogus");
  await page.locator(".setkeuze-knop").click();
  await sheet().locator(".set-jaar-kop").first().waitFor();
  if (await sheet().locator(".set-talen").count()) {
    await sheet().locator(".set-talen .chip", { hasText: "Japans" }).click();
    assert.ok(await sheet().locator(".set-tegel:not(.alle)").count() >= 1, "Japanse sets");
  }
  await foto("32-sets");
  await page.keyboard.press("Escape"); await wacht(200);

  stap("ingekocht buiten een beurs: via Facebook, gisteren, met een screenshot");
  await tab("Profiel");
  await page.locator(".profiel-tegel", { hasText: "Ingekocht buiten een beurs" }).click();
  await sheet().getByRole("button", { name: "Handmatig", exact: true }).click();
  await sheet().getByRole("button", { name: "Handmatig invullen" }).click();
  await sheet().getByLabel("Naam (Engels)").fill("Facebook Gengar");
  await sheet().getByLabel("Marktwaarde").fill("30");
  await sheet().getByRole("button", { name: /^Toevoegen/ }).click();
  await wacht(150);
  await sheet().getByRole("button", { name: /^Klaar/ }).last().click();
  await page.getByRole("button", { name: "Afrekenen" }).click();
  assert.ok(await sheet().getByRole("button", { name: /Online/ }).count(), "waar gekocht");
  await sheet().getByLabel("Wanneer gekocht?").fill(binnenDagen(-1));
  await sheet().locator('.afreken-fotos input[type="file"]').setInputFiles(path.resolve(__dirname, "../../public/img/eend.png"));
  await sheet().locator(".afreken-fotos .foto-duim").waitFor();
  await sheet().getByLabel(/Naam/).first().fill("Sofie (Facebook)");
  await wacht(500);
  await foto("33-inkoop-thuis");
  await sheet().getByRole("button", { name: "Uitbetaald" }).click();
  await page.locator(".gelukt").waitFor();
  await volgende();

  stap("herkomst: vanuit de kaart naar de aankoop en de foto");
  await tab("Vault");
  await page.locator(".tegel", { hasText: "Facebook Gengar" }).first().click();
  await sheet().locator(".herkomst", { hasText: "Ingekocht" }).waitFor();
  assert.match(await sheet().locator(".herkomst").innerText(), /Online[\s\S]*Sofie[\s\S]*70% van €\s?30/);
  await sheet().locator(".herkomst").getByRole("button", { name: /Bewijs en foto's/ }).click();
  await sheet().locator(".transactie-fotos .foto-duim").waitFor();
  await wacht(500);
  await foto("34-herkomst");
  await page.keyboard.press("Escape"); await wacht(150);
  await page.keyboard.press("Escape"); await wacht(150);

  stap("privé ⇄ Bind'r: een kaart uit de eigen verzameling inbrengen en een kaart meenemen");
  await tab("Profiel");
  await page.locator(".profiel-tegel", { hasText: "Privé" }).click();
  // Startvoorraad: kaarten die al in de app staan (de testset werd zelf toegevoegd) in één keer inbrengen.
  await sheet().getByRole("button", { name: /^Al in de app/ }).waitFor();
  await sheet().getByRole("button", { name: "Niets kiezen" }).click();
  await sheet().locator(".inbreng-lijst li > button").nth(0).click();
  await sheet().locator(".inbreng-lijst li > button").nth(1).click();
  await sheet().getByRole("button", { name: /^2 inbrengen in Bind'r/ }).waitFor();
  assert.match(await sheet().locator(".inbreng-lijst").innerText(), /markt €\s?\d/);
  await wacht(300);
  await foto("35a-startvoorraad");
  await geenHorizontaleScroll("startvoorraad");
  await sheet().getByRole("button", { name: /^2 inbrengen in Bind'r/ }).click();
  await sheet().getByRole("heading", { name: "Ingebracht uit privé" }).waitFor();
  assert.match(await sheet().locator(".gelukt .borderel-knop").innerText(), /PB-\d{4}-/);
  await sheet().getByRole("button", { name: "Nog iets" }).click();
  // Wat met een factuur gekocht werd, gaat uit de lijst (die kost staat al in Dexxter).
  const voorFactuur = Number((await sheet().getByRole("button", { name: /^Al in de app/ }).innerText()).match(/\d+/)[0]);
  await sheet().getByRole("button", { name: "Niets kiezen" }).click();
  await sheet().locator(".inbreng-lijst li > button").nth(0).click();
  await sheet().getByRole("button", { name: "Gekocht met factuur" }).click();
  await sheet().getByRole("button", { name: "Ja, deze kaart" }).click();
  await page.getByText(/aangeduid als gekocht met factuur/).waitFor();
  assert.match(await sheet().getByRole("button", { name: /^Al in de app/ }).innerText(), new RegExp(`\\(${voorFactuur - 1}\\)`));
  await sheet().getByRole("button", { name: "Nieuwe kaart" }).click();
  await sheet().getByRole("button", { name: "Kaart toevoegen" }).click();
  await sheet().getByRole("button", { name: "Handmatig", exact: true }).click();
  await sheet().getByRole("button", { name: "Handmatig invullen" }).click();
  await sheet().getByLabel("Naam (Engels)").fill("Eigen Mew");
  await sheet().getByLabel("Marktwaarde").fill("100");
  await sheet().getByRole("button", { name: /^Toevoegen/ }).click();
  await wacht(150);
  await sheet().getByRole("button", { name: /^Klaar/ }).last().click();
  // Inbreng aan 100% van de marktwaarde, per kaart zelf aan te passen.
  await sheet().locator(".afreken-netto", { hasText: /€\s?100/ }).waitFor();
  await sheet().getByLabel("Waarde van Eigen Mew").fill("90");
  await sheet().locator(".afreken-netto", { hasText: /€\s?90/ }).waitFor();
  assert.match(await sheet().locator(".inbreng-waarde").innerText(), /eigen schatting/);
  await foto("35-prive");
  await geenHorizontaleScroll("privé");
  await sheet().getByRole("button", { name: "Inbrengen in Bind'r" }).click();
  await sheet().getByRole("heading", { name: "Ingebracht uit privé" }).waitFor();
  await sheet().getByRole("button", { name: "Nog iets" }).click();
  await sheet().getByRole("button", { name: "Naar privé" }).click();
  await sheet().locator(".resultaten li button").first().click();
  await sheet().getByRole("button", { name: /^1 naar privé/ }).click();
  await sheet().getByRole("heading", { name: "Naar privé" }).waitFor();
  await page.keyboard.press("Escape"); await wacht(200);
  await page.locator(".profiel-tegel", { hasText: "Boekhouding" }).click();
  await sheet().getByRole("button", { name: "Aankoop", exact: true }).click();
  assert.ok(await sheet().locator(".boek-dag").count() >= 2, "aankopen van vandaag en gisteren");
  assert.match(await sheet().locator(".boek-dag").first().innerText(), /uit privé/);
  // Voorraad: wat zelf werd toegevoegd zonder aankoop in de app, staat apart met een knop om in te brengen.
  await sheet().getByRole("button", { name: "Voorraad", exact: true }).click();
  await sheet().getByText(/zelf toegevoegd, zonder aankoop in de app/).waitFor();
  await wacht(300);
  await foto("35b-zonder-aankoop");
  await page.keyboard.press("Escape"); await wacht(200);

  // ── Klantenpagina ──────────────────────────────────────────────────────────
  stap("klantencatalogus (demo)");
  const klant = await ctx.newPage();
  const fk = fouten(klant);
  await klant.goto(BASIS + "catalogus/?demo=1");
  await klant.waitForURL((u) => !u.pathname.includes("/catalogus/"));
  // De start: wie we zijn, wat we aanbieden (een binderpagina met vier vakken), onze komende beurzen.
  await klant.getByRole("heading", { name: "Binders die even uniek zijn als je collectie" }).waitFor();
  assert.ok(await klant.locator(".klant-merk img").isVisible(), "logo linksboven");
  assert.match(await klant.locator(".klant-balk .klant-ig-knop").first().getAttribute("href"), /instagram\.com\/bindr\.test\//);
  assert.equal(await klant.locator(".binderpagina .pocket").count(), 4, "kaarten, binders, 3D-prints en sealed");
  assert.equal(await klant.locator(".zipbinder .zip-rits").count(), 1, "de kaft is een zip-binder");
  assert.match(await klant.locator(".beurzen").innerText(), /Beurs Antwerpen[\s\S]*Antwerp Expo[\s\S]*10:00–17:00/, "geplande beurs op de klantenpagina, met de uren");
  assert.equal(await klant.locator(".ticket a", { hasText: "Website van de beurs" }).getAttribute("href"), "https://www.antwerpexpo.be/");
  assert.match(await klant.locator(".ticket .ticket-nog").innerText(), /Over \d+ (dagen|weken)/);
  await klant.waitForTimeout(2400); // de titel wordt gegraveerd
  await klant.screenshot({ path: path.join(SHOTS, "14a-klant-start.png") });
  await geenHorizontaleScroll("klantenpagina start", klant);
  assert.equal(await klant.locator(".tabbalk, .kop-knoppen, .beurs-balk").count(), 0, "geen beheer op de klantenpagina");
  // Naar de kaarten via het vak op de binderpagina; de rest via de balk onderaan.
  await klant.locator(".pocket.kaarten").click();
  await klant.waitForURL(/#kaarten$/);
  await klant.locator(".tegel").first().waitFor();
  const verwacht = await klant.evaluate(() => {
    const d = JSON.parse(localStorage.getItem("bindr-demo-v1"));
    return d.exemplaren.filter((e) => e.soort !== "eigen product" && e.opslag === "vitrine" && e.status === "in voorraad" && e.hartjesprijs != null && e.nieuw_hartje == null && e.label_status === "gestickerd").length;
  });
  const getoond = await klant.locator(".klant .tegel").evaluateAll((ts) => ts.reduce((s, t) => {
    const m = t.querySelector(".aantal-merk");
    return s + (m ? Number(m.textContent.replace("×", "")) : 1);
  }, 0));
  assert.equal(getoond, verwacht, "klant ziet precies de kaarten in de catalogus (dubbels als één tegel met een aantal)");
  const alle = await klant.locator(".klant .tegel").count();
  await klant.locator(".schakelchip", { hasText: "Andere talen" }).click();
  await klant.waitForTimeout(300);
  const anders = await klant.locator(".klant .tegel").count();
  assert.ok(anders > 0 && anders < alle, `filter andere talen (${anders} van ${alle})`);
  await klant.locator(".schakelchip", { hasText: "Andere talen" }).click();
  await klant.locator(".setkeuze-knop").click();
  await klant.locator(".set-sheet .set-tegel").nth(1).click();
  await klant.waitForTimeout(300);
  const inSet = await klant.locator(".klant .tegel").count();
  assert.ok(inSet > 0 && inSet < alle, `filter op set via het logo (${inSet} van ${alle})`);
  await klant.locator(".setkeuze-knop").click();
  await klant.locator(".set-sheet").screenshot({ path: path.join(SHOTS, "14b-sets.png") }).catch(() => {});
  await klant.locator(".set-sheet .set-tegel.alle").click();
  await klant.locator(".sorteer select").selectOption("set");
  await klant.locator(".set-kop").first().waitFor();
  await klant.locator(".sorteer select").selectOption("nieuw");
  await klant.screenshot({ path: path.join(SHOTS, "14-klant.png") });
  await geenHorizontaleScroll("klantenpagina kaarten", klant);
  await klant.locator(".tegel").first().click();
  await klant.locator(".detail-stand").waitFor();
  assert.match(await klant.locator(".detail-stand").innerText(), /stand/i);
  await klant.waitForTimeout(500);
  await geenHorizontaleScroll("klantendetail", klant);
  await klant.screenshot({ path: path.join(SHOTS, "15-klant-detail.png") });
  // Tik op de foto: de kaart in het groot; Escape sluit eerst dat, daarna het detail.
  await klant.locator(".klant-detail-foto").click({ force: true });
  await klant.locator(".kaart-groot").waitFor();
  await klant.waitForTimeout(400);
  await klant.screenshot({ path: path.join(SHOTS, "15b-klant-groot.png") });
  await klant.keyboard.press("Escape");
  await klant.locator(".kaart-groot").waitFor({ state: "detached" });
  assert.equal(await klant.locator(".klant-sheet").count(), 1, "het detail blijft open");
  await klant.keyboard.press("Escape");
  // Binders: ook die in de vault liggen ("vraag ernaar"); filters van de kaarten blijven staan.
  await klant.locator(".klant-nav.onder a", { hasText: "Binders" }).click();
  await klant.waitForURL(/#binders$/);
  await klant.locator(".binder-kaart").first().waitFor();
  assert.match(await klant.locator(".binders-rij").innerText(), /Gengar[\s\S]*vraag ernaar/i, "binders, ook die in de vault liggen");
  await klant.screenshot({ path: path.join(SHOTS, "14c-klant-binders.png") });
  // Een binder met meer foto's: duimpjes in het detail.
  await klant.locator(".binder-kaart:has(.met-foto)", { hasText: "Gengar" }).first().click();
  await klant.locator(".detail-duimen button").nth(1).waitFor();
  assert.equal(await klant.locator(".detail-duimen button").count(), 2, "hoofdfoto en extra foto van de binder");
  await klant.locator(".detail-duimen button").nth(1).click();
  await klant.screenshot({ path: path.join(SHOTS, "14d-klant-binder-fotos.png") });
  await klant.keyboard.press("Escape");
  await geenHorizontaleScroll("klantenpagina binders", klant);
  for (const [naam, hash] of [["3D-prints", "3d"], ["Sealed", "sealed"]]) {
    await klant.locator(".klant-nav.onder a", { hasText: naam }).click();
    await klant.waitForURL(new RegExp(`#${hash}$`));
    await klant.locator(".sectie-kop h1", { hasText: naam }).waitFor();
    assert.ok(await klant.locator(".klant .tegel").count() > 0, `${naam} op de klantenpagina`);
  }
  // Wettelijk: onderaan wie we zijn, de vrijstelling van btw, privacy en verkoopvoorwaarden; Facebook naast Instagram.
  assert.match(await klant.locator(".voet-wettelijk").innerText(), /vrijstellingsregeling kleine ondernemingen/);
  assert.match(await klant.locator(".klant-balk a[aria-label='Facebook']").getAttribute("href"), /facebook\.com/);
  await klant.locator(".voet-links a", { hasText: "Privacy en cookies" }).click();
  await klant.locator(".juridisch h1", { hasText: "Privacy en cookies" }).waitFor();
  assert.match(await klant.locator(".juridisch").innerText(), /geen cookies/);
  await geenHorizontaleScroll("privacy", klant);
  await klant.locator(".voet-links a", { hasText: "Verkoopvoorwaarden" }).click();
  await klant.locator(".juridisch h1", { hasText: "Verkoopvoorwaarden" }).waitFor();
  assert.match(await klant.locator(".juridisch").innerText(), /Lasergravure[\s\S]*licht verschillen/);
  await geenHorizontaleScroll("verkoopvoorwaarden", klant);
  // Ontwerp je binder: de aanvraag (met toploader, kleur en een afbeelding van het idee), en als extra een eigen
  // zwart-wit SVG proberen op een echte zip-binder.
  await klant.locator(".klant-nav.onder a", { hasText: "Ontwerp" }).click();
  await klant.waitForURL(/#ontwerp$/);
  await klant.locator(".aanvraag-form").waitFor();
  assert.equal(await klant.locator(".ontwerp-canvas").count(), 0, "de proef op de binder is een extra (standaard uit)");
  await klant.getByRole("button", { name: "Koningsblauw" }).click();
  await klant.locator(".keuze-groep", { hasText: "Voor toploaders?" }).getByRole("button", { name: "Ja" }).click();
  await klant.locator(".idee-beelden").locator("..").locator("input[type=file]").setInputFiles(path.resolve(__dirname, "../../public/img/eend.png"));
  await klant.locator(".idee-beeld img").waitFor();
  await klant.locator(".proef-schakel input[type=checkbox]").check();
  await klant.locator(".ontwerp-canvas:not(.laden)").waitFor();
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="38" fill="none" stroke="#000" stroke-width="9"/><path d="M30 52 48 68 72 34" fill="none" stroke="#000" stroke-width="10"/></svg>';
  await klant.locator(".ontwerp-bestand input[type=file]").setInputFiles({ name: "logo.svg", mimeType: "image/svg+xml", buffer: Buffer.from(svg) });
  await klant.getByRole("button", { name: "Wit en zwart omkeren" }).waitFor();
  await klant.getByRole("button", { name: "Tot aan het stiksel" }).click();
  await klant.getByRole("button", { name: "Verstuur mijn aanvraag" }).isDisabled().then((x) => assert.ok(x, "eerst naam, e-mail en idee"));
  await klant.locator(".wens-chips .chip", { hasText: "Een naam of tekst" }).click();
  await klant.getByLabel("Je idee").fill("Mijn logo met mijn naam eronder");
  await klant.getByLabel("Naam", { exact: true }).fill("Lotte Test");
  await klant.getByLabel("E-mail", { exact: true }).fill("lotte@voorbeeld.be");
  await klant.screenshot({ path: path.join(SHOTS, "14e-klant-ontwerp.png"), fullPage: true });
  await geenHorizontaleScroll("ontwerp je binder", klant);
  await klant.getByRole("button", { name: "Verstuur mijn aanvraag" }).click();
  await klant.getByText("Bedankt, Lotte!").waitFor();
  const aanvraag = await klant.evaluate(() => JSON.parse(localStorage.getItem("bindr-demo-v1")).aanvragen?.[0]);
  assert.equal(aanvraag?.kleur, "Koningsblauw");
  assert.equal(aanvraag?.toploader, true);
  assert.equal(aanvraag?.beelden?.length, 1, "de afbeelding bij het idee gaat mee");
  assert.match(aanvraag?.idee ?? "", /Wensen: Een naam of tekst[\s\S]*Mijn logo/);
  assert.match(aanvraag?.artwork ?? "", /^data:image\/png;base64,/, "het ontwerp gaat mee");
  assert.match(aanvraag?.voorbeeld ?? "", /^data:image\/jpeg;base64,/, "het voorbeeld op de binder gaat mee");
  await klant.locator(".klant-nav.onder a", { hasText: "Start" }).click();
  await klant.locator(".binderpagina").waitFor();
  assert.deepEqual(fk, [], "geen fouten op de klantenpagina");
  await klant.close();

  stap("de aanvraag komt binnen in Profiel › Aanvragen; etalage op de klantenpagina");
  await tab("Profiel"); await wacht(200);
  await page.locator(".profiel-tegel", { hasText: "Aanvragen" }).click();
  await sheet().locator(".aanvraag-rij", { hasText: "Lotte Test" }).click();
  await sheet().locator(".aanvraag-beelden img").nth(1).waitFor();
  assert.match(await sheet().innerText(), /lotte@voorbeeld\.be[\s\S]*9-pocket, voor toploaders[\s\S]*Koningsblauw/);
  await sheet().locator(".aanvraag-beelden img").nth(2).waitFor();
  await foto("14f-aanvraag");
  await sheet().getByRole("button", { name: "Sluiten", exact: true }).last().click();
  await page.keyboard.press("Escape"); await wacht(200);
  await page.locator(".profiel-tegel", { hasText: "Etalage" }).click();
  await sheet().locator('input[type="file"]').setInputFiles([path.resolve(__dirname, "../../public/img/logo.png"), path.resolve(__dirname, "../../public/img/eend.png")]);
  await sheet().locator(".etalage-rij").nth(1).waitFor();
  await sheet().getByLabel("Titel").first().fill("Ons logo");
  await sheet().getByLabel("Link").first().fill("https://www.instagram.com/p/test/");
  await sheet().getByLabel("Titel").nth(1).click();
  await page.keyboard.press("Escape"); await wacht(200);
  const klant2 = await ctx.newPage();
  const fk2 = fouten(klant2);
  await klant2.goto(BASIS + "?demo=1");
  await klant2.locator(".etalage-foto").first().waitFor();
  assert.ok(await klant2.locator(".etalage-foto").count() >= 2, "de etalage zweeft op de start");
  assert.equal(await klant2.locator(".etalage-foto").first().getAttribute("href"), "https://www.instagram.com/p/test/");
  await klant2.waitForTimeout(2400);
  await klant2.screenshot({ path: path.join(SHOTS, "14g-klant-etalage.png") });
  assert.deepEqual(fk2, [], "geen fouten op de klantenpagina (etalage)");
  await klant2.close();

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
  await p2.goto(BASIS + "beheer.html#scan");
  await p2.locator(".scan-item", { hasText: "0J6-8VC" }).waitFor({ timeout: 15000 });
  await p2.waitForTimeout(3000); // de camera blijft het label zien: het mag er niet nog eens bijkomen
  assert.equal(await p2.locator(".scan-item").count(), 1, "QR blijft in beeld, toch maar één keer in de lijst");
  await p2.waitForTimeout(400);
  await p2.screenshot({ path: path.join(SHOTS, "16-qr-gescand.png") });
  assert.deepEqual(f2, [], "geen JavaScript-fouten bij scannen");
  await b2.close();
  console.log("Alles in orde: de testcase beursdag klopt. Screenshots in", SHOTS);
})().catch((e) => { console.error(e); process.exit(1); });
