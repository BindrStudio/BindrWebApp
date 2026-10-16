// De belangrijkste schermen in Chromium (Chrome, Samsung Internet, Edge), WebKit (Safari op iPhone en iPad)
// en Firefox, op gsm, tablet (Galaxy Tab S8 rechtop en liggend) en computer:
// - de klantenpagina: start (met de etalage), de catalogi, een kaart openen, Ontwerp je binder (proef op de
//   binder tekenen en een aanvraag versturen), privacy en voorwaarden;
// - het beheer in de demo: de tabs, Instellingen vanuit Profiel, Profiel › Aanvragen;
// - inloggen tegen een nagebootste Supabase: wachtwoord kiezen, pincode (PBKDF2 in de browser), slot.
// Overal: geen JavaScript-fouten en nooit zijwaarts scrollen (dan zoomt een gsm of tablet de pagina uit).
//   npm run serve
//   BROWSERS=chromium,firefox,webkit node tests/e2e/browsers.cjs [map-voor-screenshots]
const pw = require("playwright");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

const BASIS = process.env.BASIS || "http://localhost:8080/";
const SHOTS = path.resolve(process.argv[2] || ".tests/browsers");
fs.mkdirSync(SHOTS, { recursive: true });
const MOTOREN = (process.env.BROWSERS || "chromium,firefox,webkit").split(",").map((x) => x.trim()).filter(Boolean);
const SUPABASE = "https://thnrmrvpkcrujxtwwqhy.supabase.co";
const TAB_UA = "Mozilla/5.0 (Linux; Android 14; SM-X700) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";
const SAMSUNG_UA = "Mozilla/5.0 (Linux; Android 14; SM-X700) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Safari/537.36";

const PROFIELEN = {
  chromium: [
    ["galaxy-tab-s8-rechtop", { viewport: { width: 800, height: 1280 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: TAB_UA }],
    ["galaxy-tab-s8-liggend", { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: SAMSUNG_UA }],
    ["pixel-7", { ...pw.devices["Pixel 7"] }],
  ],
  webkit: [
    ["iphone-13", { ...pw.devices["iPhone 13"] }],
    ["ipad", { ...pw.devices["iPad (gen 7)"] }],
    ["safari-computer", { viewport: { width: 1280, height: 800 } }],
  ],
  firefox: [
    ["firefox-computer", { viewport: { width: 1280, height: 800 } }],
    ["firefox-smal", { viewport: { width: 390, height: 844 }, hasTouch: true }],
  ],
};

// ── Een nagebootste Supabase voor het inloggen ───────────────────────────────
const EMAIL = "test@bindr.invalid";
const GEBRUIKER = "11111111-1111-4111-8111-111111111111";
function nieuweServer() {
  const server = { wachtwoord: "482915", tokens: new Set(), nr: 0 };
  const sessie = () => {
    const t = `token-${++server.nr}`;
    server.tokens.add(t);
    return { access_token: t, refresh_token: `ververs-${server.nr}`, expires_in: 3600, user: { id: GEBRUIKER, email: EMAIL } };
  };
  const json = (route, status, body) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  server.route = async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    if (p === "/auth/v1/token") {
      const body = req.postDataJSON();
      if (url.searchParams.get("grant_type") === "password") {
        return body.email === EMAIL && body.password === server.wachtwoord ? json(route, 200, sessie()) : json(route, 400, { msg: "Invalid login credentials" });
      }
      return json(route, 200, sessie());
    }
    if (p === "/auth/v1/logout") return route.fulfill({ status: 204 });
    const token = (req.headers().authorization || "").replace("Bearer ", "");
    if (!server.tokens.has(token)) return json(route, 401, { message: "JWT expired" });
    if (p === "/auth/v1/user" && req.method() === "PUT") { server.wachtwoord = req.postDataJSON().password; return json(route, 200, { id: GEBRUIKER, email: EMAIL }); }
    const tabel = p.replace("/rest/v1/", "");
    if (tabel === "beheerders") return json(route, 200, [{ naam: "Jadon", user_id: GEBRUIKER }]);
    if (tabel === "rpc/schema_versie") return json(route, 200, 11);
    if (tabel === "omgevingen") return json(route, 200, [{ id: "o-bindr", naam: "Bind'r", volgorde: 1, zichtbaar_voor_klanten: true }]);
    if (req.method() !== "GET") return route.fulfill({ status: 201, body: "" });
    return json(route, 200, []);
  };
  return server;
}

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="38" fill="none" stroke="#000" stroke-width="9"/><path d="M30 52 48 68 72 34" fill="none" stroke="#000" stroke-width="10"/></svg>';

async function profiel(browser, motor, naam, opties) {
  const ctx = await browser.newContext({ ...opties, locale: "nl-BE" });
  const page = await ctx.newPage();
  const fouten = [];
  page.on("pageerror", (e) => fouten.push(`${e.message}`));
  page.on("dialog", (d) => d.accept());
  const breedte = opties.viewport.width;
  const foto = (n) => page.screenshot({ path: path.join(SHOTS, `${motor}-${naam}-${n}.png`) });
  const nooitTeBreed = async (waar, keer = 1) => {
    for (let i = 0; i < keer; i++) {
      if (i) await page.waitForTimeout(400);
      const r = await page.evaluate(() => ({
        teVeel: document.scrollingElement.scrollWidth - document.documentElement.clientWidth,
        wie: [...document.querySelectorAll("body *")].filter((el) => el.getBoundingClientRect().right > document.documentElement.clientWidth + 1 && getComputedStyle(el).position !== "fixed")
          .slice(0, 4).map((el) => `${el.tagName.toLowerCase()}.${[...el.classList].join(".")}`),
      }));
      assert.ok(r.teVeel <= 1, `${waar}: ${r.teVeel}px te breed (${r.wie.join(", ")})`);
    }
  };
  const tabbalk = (tab) => page.locator(".tabbalk button").filter({ hasText: tab }).click();
  const groot = breedte >= 760;
  const nav = (naar) => page.locator(groot ? ".klant-nav.boven a" : ".klant-nav.onder a", { hasText: naar }).click();

  // Beheer in de demo, met de testset (zodat de klantenpagina iets toont).
  await page.goto(BASIS + "beheer.html");
  await page.getByRole("button", { name: "Uitproberen zonder account" }).click();
  await page.locator(".tabbalk").waitFor();
  await page.getByRole("button", { name: "Instellingen" }).click();
  await page.getByRole("button", { name: "Testset inladen" }).click();
  await page.locator(".sheet").getByText(/Exemplaren/).waitFor();
  await page.waitForTimeout(1500);
  await page.keyboard.press("Escape");
  for (const tab of ["Catalogus", "Vault", "Kassa", "Profiel"]) {
    await tabbalk(tab);
    await page.waitForTimeout(450);
    await nooitTeBreed(`beheer ${tab}`);
  }
  await foto("beheer-profiel");
  // Instellingen vanuit Profiel (dat gaf op een iPhone ooit een leeg scherm).
  await page.getByRole("button", { name: "Instellingen" }).click();
  await page.locator(".sheet").getByText("Testset inladen").waitFor();
  assert.equal(await page.getByText(/liep iets mis|Er ging iets mis/i).count(), 0, "Instellingen opent zonder fout");
  await page.keyboard.press("Escape");

  // De klantenpagina.
  await page.goto(BASIS + "?demo=1");
  await page.locator(".zipbinder").waitFor();
  await page.locator(".etalage-foto").first().waitFor();
  await nooitTeBreed("start", 6); // de etalage zweeft: een paar keer kijken
  await foto("klant-start");
  await nav("Kaarten");
  await page.locator(".klant .tegel").first().waitFor();
  await nooitTeBreed("kaarten");
  await page.locator(".klant .tegel").first().click();
  await page.locator(".sheet").waitFor();
  await nooitTeBreed("kaart open");
  await foto("klant-kaart");
  await page.keyboard.press("Escape");
  await page.locator(".sheet").waitFor({ state: "detached" }).catch(() => undefined);
  await nav("Binders");
  await page.waitForTimeout(500);
  await nooitTeBreed("binders");

  // Ontwerp je binder: de proef tekenen (canvas met schaduw en mengmodi) en een aanvraag versturen.
  await nav("Ontwerp");
  await page.locator(".aanvraag-form").waitFor();
  await page.getByRole("button", { name: "Koningsblauw" }).click();
  await page.locator(".keuze-groep", { hasText: "Voor toploaders?" }).getByRole("button", { name: "Ja" }).click();
  await page.locator(".proef-schakel input[type=checkbox]").check();
  await page.locator(".ontwerp-canvas:not(.laden)").waitFor();
  await page.locator(".ontwerp-bestand input[type=file]").setInputFiles({ name: "logo.svg", mimeType: "image/svg+xml", buffer: Buffer.from(SVG) });
  await page.getByRole("button", { name: "Wit en zwart omkeren" }).waitFor();
  await page.getByRole("button", { name: "Tot aan het stiksel" }).click();
  await page.waitForTimeout(400);
  // Is er echt getekend: de binder (blauw) en de gravure (licht) in het midden?
  const kleuren = await page.locator(".ontwerp-canvas").evaluate((c) => {
    const ctx = c.getContext("2d");
    const px = (x, y) => [...ctx.getImageData(Math.round(c.width * x), Math.round(c.height * y), 1, 1).data];
    return { rand: px(0.5, 0.06), midden: px(0.5, 0.5), lijn: px(0.5, 0.1) };
  });
  assert.ok(kleuren.rand[3] > 200 && kleuren.rand[2] > kleuren.rand[0], `de binder is getekend (${kleuren.rand})`);
  await page.locator(".proef").screenshot({ path: path.join(SHOTS, `${motor}-${naam}-proef.png`) });
  await page.locator(".wens-chips .chip", { hasText: "Een naam of tekst" }).click();
  await page.getByLabel("Je idee").fill("Mijn naam in sierletters");
  await page.getByLabel("Naam", { exact: true }).fill("Test Klant");
  await page.getByLabel("E-mail", { exact: true }).fill("klant@voorbeeld.be");
  await nooitTeBreed("ontwerp");
  await page.getByRole("button", { name: "Verstuur mijn aanvraag" }).click();
  await page.getByText("Bedankt, Test!").waitFor();
  const aanvraag = await page.evaluate(() => JSON.parse(localStorage.getItem("bindr-demo-v1")).aanvragen?.[0]);
  assert.equal(aanvraag?.kleur, "Koningsblauw");
  assert.match(aanvraag?.voorbeeld ?? "", /^data:image\/jpeg;base64,/, "het voorbeeld op de binder is gemaakt");

  for (const [hash, tekst] of [["#privacy", /geen cookies/i], ["#voorwaarden", /Lasergravure/]]) {
    await page.goto(BASIS + "?demo=1" + hash);
    await page.locator(".juridisch").getByText(tekst).first().waitFor();
    await nooitTeBreed(hash);
  }

  // Inloggen: wachtwoord kiezen, pincode, slot en ontgrendelen (crypto.subtle in deze browser).
  const server = nieuweServer();
  await ctx.route(`${SUPABASE}/**`, server.route);
  await page.goto(BASIS + "beheer.html");
  await page.evaluate(() => localStorage.removeItem("bindr-modus")); // weg uit de demo
  await page.reload();
  await page.getByPlaceholder("E-mailadres").fill(EMAIL);
  await page.getByPlaceholder("Wachtwoord", { exact: true }).fill("482915");
  await page.getByRole("button", { name: "Inloggen", exact: true }).click();
  await page.getByRole("heading", { name: "Kies een wachtwoord" }).waitFor();
  await page.getByLabel("Nieuw wachtwoord", { exact: true }).fill("Glurak regent op dinsdag");
  await page.getByLabel("Nieuw wachtwoord, nog een keer").fill("Glurak regent op dinsdag");
  await page.getByRole("button", { name: "Bewaar wachtwoord" }).click();
  await page.locator(".tabbalk").waitFor();
  assert.equal(server.wachtwoord, "Glurak regent op dinsdag");
  await page.evaluate(() => localStorage.setItem("bindr-actief-v1", "1"));
  await page.reload();
  await page.getByRole("heading", { name: "Hallo Jadon" }).waitFor();
  await page.keyboard.type("111222");
  await page.getByText(/Die pincode klopt niet/).waitFor();
  await page.keyboard.type("482915");
  await page.locator(".tabbalk").waitFor();
  await nooitTeBreed("beheer na inloggen");

  assert.deepEqual(fouten, [], "geen JavaScript-fouten");
  await ctx.close();
}

(async () => {
  const uitslag = [];
  for (const motor of MOTOREN) {
    let browser;
    try {
      browser = await pw[motor].launch();
    } catch (e) {
      uitslag.push([motor, "-", `niet beschikbaar: ${String(e.message).split("\n")[0]}`]);
      continue;
    }
    for (const [naam, opties] of PROFIELEN[motor]) {
      const t = Date.now();
      try {
        await profiel(browser, motor, naam, opties);
        uitslag.push([motor, naam, `in orde (${Math.round((Date.now() - t) / 1000)} s)`]);
      } catch (e) {
        uitslag.push([motor, naam, `FOUT: ${String(e.message).split("\n")[0]}`]);
      }
    }
    await browser.close();
  }
  for (const [m, n, u] of uitslag) console.log(`${m.padEnd(9)} ${n.padEnd(24)} ${u}`);
  // In GitHub Actions moeten alle drie de browsers er zijn; lokaal mag het bij Chromium blijven.
  const fout = uitslag.some(([, , u]) => u.startsWith("FOUT") || (process.env.CI && u.startsWith("niet beschikbaar")));
  const geen = uitslag.every(([, , u]) => !u.startsWith("in orde"));
  if (fout || geen) process.exit(1);
  console.log("Alle browsers in orde. Screenshots in", SHOTS);
})().catch((e) => { console.error(e); process.exit(1); });
