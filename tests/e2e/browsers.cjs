// De belangrijkste schermen in Chromium (Chrome, Samsung Internet, Edge), WebKit (Safari op iPhone en iPad)
// en Firefox, op gsm, tablet (Galaxy Tab S8 rechtop en liggend) en computer:
// - de klantenpagina: start (met de etalage), de catalogi, een kaart openen, Ontwerp je binder (proef op de
//   binder tekenen en een aanvraag versturen), privacy en voorwaarden;
// - het beheer in de demo: de tabs en Instellingen vanuit Profiel;
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
    // Smalle Android-gsm's (Samsung): twee kaarten naast elkaar werden er ooit anderhalve, en de pagina zoomde uit.
    ["galaxy-s9", { ...pw.devices["Galaxy S9+"] }],
    // Chrome op Windows: de schuifbalk neemt plaats in (100vw telt hem mee; de strook stak 15 px uit).
    ["windows-laptop", { viewport: { width: 1366, height: 768 } }],
    ["macbook-air", { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }],
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
  try {
    await doorloop(ctx, page, motor, naam, opties);
  } catch (e) {
    await page.screenshot({ path: path.join(SHOTS, `${motor}-${naam}-FOUT.png`) }).catch(() => undefined);
    throw e;
  } finally {
    await ctx.close().catch(() => undefined);
  }
}

async function doorloop(ctx, page, motor, naam, opties) {
  const fouten = [];
  page.on("pageerror", (e) => {
    // WebKit meldt een fetch die afgebroken wordt omdat de test naar een andere pagina gaat als
    // "… due to access control checks". De app vangt die op; voor de test is het geen fout.
    if (/due to access control checks/.test(e.message) && e.message.includes(new URL(BASIS).host)) return;
    fouten.push(`${page.url().replace(BASIS, "/")}: ${e.message} ${String(e.stack || "").split("\n").slice(1, 3).join(" ").trim()}`);
  });
  page.on("dialog", (d) => d.accept());
  const breedte = opties.viewport.width;
  const foto = (n) => page.screenshot({ path: path.join(SHOTS, `${motor}-${naam}-${n}.png`) });
  const nooitTeBreed = async (waar, keer = 1) => {
    for (let i = 0; i < keer; i++) {
      if (i) await page.waitForTimeout(400);
      const r = await page.evaluate(() => {
        const w = document.documentElement.clientWidth;
        // Wat steekt uit, en zit niet in iets dat zelf scrolt of afknipt? (dat is de boosdoener)
        const geknipt = (el) => {
          for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
            if (/(auto|scroll|hidden|clip)/.test(getComputedStyle(a).overflowX)) return true;
          }
          return false;
        };
        const wie = [...document.querySelectorAll("body *")].filter((el) => el.getBoundingClientRect().right > w + 1 && getComputedStyle(el).position !== "fixed" && !geknipt(el))
          .slice(0, 4).map((el) => `${el.tagName.toLowerCase()}.${[...el.classList].join(".")} (${Math.round(el.getBoundingClientRect().right)})`);
        const teVeel = document.scrollingElement.scrollWidth - w;
        // Zoek het element dat de overloop veroorzaakt: verberg om beurten een kind en kijk of het weg is.
        const pad = [];
        if (teVeel > 1) {
          let el = document.body;
          for (let diepte = 0; diepte < 25 && el; diepte++) {
            let schuldig = null;
            for (const k of el.children) {
              const oud = k.style.display;
              k.style.display = "none";
              const weg = document.scrollingElement.scrollWidth - w <= 1;
              k.style.display = oud;
              if (weg) { schuldig = k; break; }
            }
            if (!schuldig) break;
            const cs = getComputedStyle(schuldig);
            pad.push(`${schuldig.tagName.toLowerCase()}${schuldig.className ? "." + String(schuldig.className).trim().split(/\s+/).join(".") : ""}[${Math.round(schuldig.getBoundingClientRect().width)}w ${cs.overflowX} ${cs.display}]`);
            el = schuldig;
          }
        }
        return { teVeel, wie, w, iw: innerWidth, pad: pad.slice(-4).join(" > ") };
      });
      assert.ok(r.teVeel <= 1, `${waar}: ${r.teVeel}px te breed bij ${r.w}px (innerWidth ${r.iw}): ${r.wie.join(", ") || "niets buiten een scrollvak"}; oorzaak: ${r.pad || "?"}`);
      // Op een gsm of tablet: de pagina is even breed als het scherm (anders laat Android ze uitzoomen).
      if (opties.isMobile) assert.ok(r.iw <= breedte + 1, `${waar}: de pagina is ${r.iw}px breed op een scherm van ${breedte}px (Android zoomt dan uit)`);
    }
  };
  const tabbalk = (tab) => page.locator(".tabbalk button").filter({ hasText: tab }).click();
  const groot = breedte >= 760;
  const nav = (naar) => page.locator(groot ? ".klant-nav.boven a" : ".klant-nav.onder a", { hasText: naar }).click();

  // Beheer in de demo, met de testset (zodat de klantenpagina iets toont).
  await page.goto(BASIS + "beheer.html");
  await page.getByRole("button", { name: "Uitproberen zonder account" }).click();
  await page.locator(".tabbalk").waitFor();
  // Het tandwiel nog eens als de demo bij de eerste klik nog aan het opstarten was (het scherm bleef dicht).
  for (let poging = 0; ; poging++) {
    await page.getByRole("button", { name: "Instellingen" }).click();
    try { await page.getByRole("button", { name: "Testset inladen" }).waitFor({ timeout: 5000 }); break; } catch (e) { if (poging) throw e; }
  }
  await page.getByRole("button", { name: "Testset inladen" }).click();
  await page.locator(".sheet").getByText(/Exemplaren/).waitFor();
  await page.waitForTimeout(1500);
  await page.keyboard.press("Escape");
  for (const tab of ["Catalogus", "Vault", "Kassa", "Profiel"]) {
    await tabbalk(tab);
    await page.waitForTimeout(650);
    await nooitTeBreed(`beheer ${tab}`);
    // Het lichtblauwe ovaaltje staat onder de actieve tab (op een Mac schoot het er ooit voorbij).
    // Wachten tot het stilstaat: in GitHub Actions kan het openen van de Kassa in WebKit lang duren, en dan
    // is het ovaaltje na een vaste wachttijd nog onderweg.
    let naast = Infinity;
    for (let i = 0; i < 40 && naast >= 3; i++) {
      if (i) await page.waitForTimeout(100);
      naast = await page.evaluate(() => {
        const d = document.querySelector(".tabbalk .tab-duim").getBoundingClientRect();
        const k = document.querySelector(".tabbalk button.aan").getBoundingClientRect();
        return Math.abs((d.left + d.width / 2) - (k.left + k.width / 2));
      });
    }
    assert.ok(naast < 3, `beheer ${tab}: het ovaaltje staat ${Math.round(naast)} px naast de tab`);
  }
  await foto("beheer-profiel");
  // Instellingen vanuit Profiel (dat gaf op een iPhone ooit een leeg scherm).
  await page.getByRole("button", { name: "Instellingen" }).click();
  await page.locator(".sheet").getByText("Testset inladen").waitFor();
  assert.equal(await page.getByText(/liep iets mis|Er ging iets mis/i).count(), 0, "Instellingen opent zonder fout");
  await page.keyboard.press("Escape");

  // De klantenpagina, met binders vooraan, de Instagram-strook en een thema (Halloween), zoals ze in de demo staan.
  await page.waitForLoadState("networkidle").catch(() => undefined);
  const beeld = (p) => `data:image/${p.endsWith(".png") ? "png" : "webp"};base64,${fs.readFileSync(path.resolve(__dirname, "../../public/img", p)).toString("base64")}`;
  const vooraan = ["dragonite", "espeon", "mew", "rayquaza"].map((k, i) => ({ id: `v${i}`, foto: beeld(`voorbeeld/${k}.webp`), titel: null, link: null, volgorde: i + 1, plek: "voorpagina" }));
  const insta = ["eend.png", "voorbeeld/gyarados.webp", "voorbeeld/mew.webp"].map((k, i) => ({ id: `i${i}`, foto: beeld(k), titel: null, link: `https://www.instagram.com/p/${i}/`, volgorde: i + 1, plek: "instagram" }));
  await page.evaluate(([etalage]) => {
    const d = JSON.parse(localStorage.getItem("bindr-demo-v1"));
    d.etalage = etalage;
    d.themas = [{ id: "halloween", naam: "Halloween", van: "10-15", tot: "11-01", aan: "aan", kleur: "#e8772e", tekst: "Fijne Halloween! Kom griezelen aan onze stand." }];
    // En we staan nu op een beurs (gestart in de kassa): "Nu live" bovenaan, het pilletje in de balk op de andere pagina's.
    const vandaag = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(new Date());
    d.beurzen = [...(d.beurzen || []), { id: "b-live", naam: "Pokémon & TCG-beurs Sint-Niklaas", datum: vandaag, locatie: "Stadsfeestzaal, Sint-Niklaas", uren: "00:00–23:59", status: "actief", omgeving_id: null }];
    localStorage.setItem("bindr-demo-v1", JSON.stringify(d));
  }, [[...vooraan, ...insta]]);
  await page.goto(BASIS + "?demo=1");
  await page.locator(".waaier").waitFor();
  await page.locator(".waaier-foto.o0").waitFor();
  // De waaier: met de bolletjes naar een andere binder.
  await page.locator(".waaier-bolletjes button").nth(2).click();
  assert.equal(await page.locator(".waaier-bolletjes button").nth(2).getAttribute("aria-current"), "true", "bolletje 3 zet binder 3 vooraan");
  await nooitTeBreed("start", 6); // de waaier en de achtergrond bewegen: een paar keer kijken
  assert.ok(await page.locator(".klant.thema-halloween .live").isVisible(), "nu live, in het thema");
  await foto("klant-start");
  // De Instagram-strook loopt over de hele breedte, maar de pagina mag nooit zijwaarts scrollen.
  await page.locator(".insta").scrollIntoViewIfNeeded();
  await page.locator(".insta-tegel img").first().waitFor();
  await nooitTeBreed("instagram", 4);
  await foto("klant-instagram");
  await page.evaluate(() => window.scrollTo(0, 0));
  await nav("Kaarten");
  await page.locator(".klant .tegel").first().waitFor();
  assert.ok(await page.locator(".live-pil").isVisible(), "nu live: het pilletje in de balk");
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

  assert.equal(fouten.length, 0, `JavaScript-fouten: ${fouten.slice(0, 3).join(" / ")}`);
}

(async () => {
  const uitslag = [];
  for (const motor of MOTOREN) {
    let browser;
    try {
      // Chromium met echte schuifbalken (zoals Windows), niet verborgen zoals Playwright standaard doet.
      browser = await pw[motor].launch(motor === "chromium" ? { ignoreDefaultArgs: ["--hide-scrollbars"] } : {});
    } catch (e) {
      uitslag.push([motor, "-", `niet beschikbaar: ${String(e.message).split("\n")[0]}`]);
      if (process.env.GITHUB_ACTIONS) console.log(`::error title=${motor}::niet beschikbaar: ${String(e.message).split("\n")[0]}`);
      continue;
    }
    for (const [naam, opties] of PROFIELEN[motor]) {
      const t = Date.now();
      try {
        await profiel(browser, motor, naam, opties);
        uitslag.push([motor, naam, `in orde (${Math.round((Date.now() - t) / 1000)} s)`]);
      } catch (e) {
        const m = String(e.message).split("\n").filter(Boolean).slice(0, 3).join(" | ");
        uitslag.push([motor, naam, `FOUT: ${m}`]);
        // In GitHub Actions als melding bij de run (die zie je zonder het hele logboek te openen).
        if (process.env.GITHUB_ACTIONS) console.log(`::error title=${motor} ${naam}::${m.replace(/[\r\n%]/g, " ")}`);
      }
    }
    await browser.close();
  }
  for (const [m, n, u] of uitslag) console.log(`${m.padEnd(9)} ${n.padEnd(24)} ${u}`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `| Browser | Toestel | Uitslag |\n|---|---|---|\n${uitslag.map((r) => `| ${r.join(" | ")} |`).join("\n")}\n`);
  }
  // In GitHub Actions moeten alle drie de browsers er zijn; lokaal mag het bij Chromium blijven.
  const fout = uitslag.some(([, , u]) => u.startsWith("FOUT") || (process.env.CI && u.startsWith("niet beschikbaar")));
  const geen = uitslag.every(([, , u]) => !u.startsWith("in orde"));
  if (fout || geen) process.exit(1);
  console.log("Alle browsers in orde. Screenshots in", SHOTS);
})().catch((e) => {
  console.error(e);
  // In GitHub Actions ook als melding bij de run (die zie je zonder het hele logboek te openen).
  if (process.env.GITHUB_ACTIONS) console.log(`::error title=${require("node:path").basename(__filename)}::${globalThis.laatsteStap ? `[${globalThis.laatsteStap}] ` : ""}${String(e && e.message || e).split("\n").filter(Boolean).slice(0, 4).join(" | ").replace(/[\r%]/g, " ")}`);
  process.exit(1);
});
