// Inloggen tegen een nagebootste Supabase (geen echte server nodig): een sterk wachtwoord voor het account
// en een pincode per toestel. De overstap van 0.10 (pincode = wachtwoord) naar een eigen wachtwoord, vergrendelen
// en ontgrendelen zonder server, 10 foute pincodes, een sessie die op de server verviel zonder dat de wachtrij
// iets verliest, wachtwoord en pincode wijzigen in Profiel en een herstelmail.
//   npm run serve
//   node tests/e2e/pincode.cjs [map-voor-screenshots]
const { chromium, devices } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

const BASIS = process.env.BASIS || "http://localhost:8080/";
const SHOTS = path.resolve(process.argv[2] || ".tests/shots");
fs.mkdirSync(SHOTS, { recursive: true });
const SUPABASE = "https://thnrmrvpkcrujxtwwqhy.supabase.co";
const EMAIL = "test@bindr.invalid";
const GEBRUIKER = "11111111-1111-4111-8111-111111111111";
const STERK = "Glurak regent op dinsdag";
const STERK2 = "Een heel ander zinnetje 7";

// ── Nagebootste Supabase ─────────────────────────────────────────────────────
const server = {
  wachtwoord: "482915", // tot 0.10 was de pincode het wachtwoord
  modus: "normaal", // "normaal" | "offline" | "ingetrokken"
  tokens: new Set(),
  instellingen: {},
  aanwezig: 0,
  logins: [], // elk wachtwoord waarmee iemand een token vroeg
  herstel: null,
  omgevingen: [
    { id: "o-bindr", naam: "Bind'r", volgorde: 1, zichtbaar_voor_klanten: true },
    { id: "o-brent", naam: "Brent", volgorde: 2, zichtbaar_voor_klanten: true },
  ],
};
let nr = 0;
function sessie() {
  const t = `token-${++nr}`;
  server.tokens.add(t);
  return { access_token: t, refresh_token: `ververs-${nr}`, expires_in: 3600, user: { id: GEBRUIKER, email: EMAIL } };
}
const json = (route, status, body) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

async function nabootsen(route) {
  const req = route.request();
  const url = new URL(req.url());
  const p = url.pathname;
  if (server.modus === "offline") return route.abort("internetdisconnected");
  if (p === "/auth/v1/token") {
    const body = req.postDataJSON();
    if (url.searchParams.get("grant_type") === "password") {
      server.logins.push(body.password);
      return body.email === EMAIL && body.password === server.wachtwoord
        ? json(route, 200, sessie()) : json(route, 400, { error_code: "invalid_credentials", msg: "Invalid login credentials" });
    }
    return server.modus === "ingetrokken" ? json(route, 400, { error_description: "Invalid Refresh Token: Refresh Token Not Found" }) : json(route, 200, sessie());
  }
  if (p === "/auth/v1/logout") return route.fulfill({ status: 204 });
  if (p === "/auth/v1/recover") {
    server.herstel = { ...req.postDataJSON(), redirect: url.searchParams.get("redirect_to") };
    return json(route, 200, {});
  }
  const token = (req.headers().authorization || "").replace("Bearer ", "");
  if (server.modus === "ingetrokken" || !server.tokens.has(token)) return json(route, 401, { message: "JWT expired" });
  if (p === "/auth/v1/user" && req.method() === "GET") return json(route, 200, { id: GEBRUIKER, email: EMAIL });
  if (p === "/auth/v1/user" && req.method() === "PUT") {
    const { password } = req.postDataJSON();
    if (password === server.wachtwoord) return json(route, 422, { error_code: "same_password", msg: "New password should be different from the old password." });
    if (password.length < 12) return json(route, 422, { error_code: "weak_password", msg: "Password should be at least 12 characters." });
    server.wachtwoord = password;
    return json(route, 200, { id: GEBRUIKER, email: EMAIL });
  }
  const tabel = p.replace("/rest/v1/", "");
  if (tabel === "beheerders") return json(route, 200, [{ naam: "Jadon", user_id: GEBRUIKER }]);
  if (tabel === "rpc/schema_versie") return json(route, 200, 13); // schema 0.13: de app vraagt het in één keer
  if (tabel === "omgevingen") return json(route, 200, server.omgevingen);
  if (tabel === "instellingen" && req.method() === "POST") {
    for (const r of req.postDataJSON()) server.instellingen[r.sleutel] = r.waarde;
    return route.fulfill({ status: 201, body: "" }); // return=minimal: geen inhoud
  }
  if (tabel === "instellingen") return json(route, 200, Object.entries(server.instellingen).map(([sleutel, waarde]) => ({ sleutel, waarde })));
  if (tabel === "aanwezig" && req.method() === "POST") { server.aanwezig++; return route.fulfill({ status: 201, body: "" }); }
  if (tabel === "aanwezig") return json(route, 200, [{ user_id: GEBRUIKER, omgeving_id: "o-bindr", scherm: "catalogus", laatst: new Date().toISOString() }]);
  if (["exemplaren", "artikelen", "beurzen", "transacties", "aanvragen", "etalage", "themas"].includes(tabel)) return json(route, 200, []);
  return json(route, 404, { message: `onbekend: ${tabel}` });
}

(async () => {
  const browser = await chromium.launch();
  const fouten = [];
  const nieuweGsm = async () => {
    const ctx = await browser.newContext({ ...devices["iPhone 13"], locale: "nl-BE" });
    await ctx.route(`${SUPABASE}/**`, nabootsen);
    const pg = await ctx.newPage();
    pg.on("pageerror", (e) => fouten.push(e.message));
    pg.on("dialog", (d) => d.accept());
    return pg;
  };
  const page = await nieuweGsm();
  const stap = (t) => { globalThis.laatsteStap = t; console.log("·", t); };
  const foto = (n, pg = page) => pg.screenshot({ path: path.join(SHOTS, `${n}.png`) });
  const wachtrij = () => page.evaluate(() => Object.entries(localStorage).filter(([k]) => k.startsWith("bindr-wachtrij-v1-supabase")).reduce((n, [, v]) => n + JSON.parse(v).length, 0));
  const pinRecord = (pg = page) => pg.evaluate(() => JSON.parse(localStorage.getItem("bindr-pin-v1") || "null"));
  const login = async (pg, wachtwoord) => {
    await pg.getByPlaceholder("E-mailadres").fill(EMAIL);
    await pg.getByPlaceholder("Wachtwoord", { exact: true }).fill(wachtwoord);
    await pg.getByRole("button", { name: "Inloggen", exact: true }).click();
  };
  const nieuwWachtwoord = async (pg, a, b = a) => {
    await pg.getByLabel("Nieuw wachtwoord", { exact: true }).fill(a);
    await pg.getByLabel("Nieuw wachtwoord, nog een keer").fill(b);
    await pg.getByRole("button", { name: "Bewaar wachtwoord" }).click();
  };
  const pincode = async (pg, pin) => {
    await pg.getByRole("heading", { name: "Kies je pincode" }).waitFor();
    await pg.keyboard.type(pin);
    await pg.getByRole("heading", { name: "Nog een keer" }).waitFor();
    await pg.keyboard.type(pin);
  };

  stap("na de update: inloggen met de oude pincode als wachtwoord, dan een sterk wachtwoord kiezen");
  await page.goto(BASIS + "beheer.html");
  assert.equal(await page.getByLabel("Pincode").count(), 0, "geen inloggen met een pincode meer");
  await login(page, "482915");
  await page.getByRole("heading", { name: "Kies een wachtwoord" }).waitFor();
  await nieuwWachtwoord(page, "kort");
  await page.getByText("Minstens 12 tekens").first().waitFor();
  await nieuwWachtwoord(page, "123456789012");
  await page.getByRole("alert").getByText(/Niet enkel cijfers/).waitFor();
  await nieuwWachtwoord(page, "Wachtwoord2026!");
  await page.getByRole("alert").getByText(/Te makkelijk te raden/).waitFor();
  await nieuwWachtwoord(page, STERK, STERK + "x");
  await page.getByText("De twee wachtwoorden zijn niet gelijk.").waitFor();
  await page.getByLabel("Nieuw wachtwoord", { exact: true }).fill(STERK);
  await page.getByText("Sterk genoeg.").waitFor();
  await foto("p1-wachtwoord-kiezen");
  const voor = server.logins.length;
  await nieuwWachtwoord(page, STERK);
  await page.locator(".tabbalk").waitFor(); // de oude pincode blijft de pincode van deze gsm
  assert.equal(server.wachtwoord, STERK, "het nieuwe wachtwoord staat op de server");
  assert.deepEqual(server.logins.slice(voor), ["482915"], "eerst het huidige wachtwoord nagekeken");
  assert.equal((await pinRecord()).v, 2, "de pincode is nu enkel van deze gsm");

  stap("samen werken: aanwezig gemeld (antwoord zonder inhoud) en instelling bewaard");
  await page.waitForTimeout(500);
  assert.ok(server.aanwezig >= 1, "aanwezig gemeld");
  assert.equal(await page.evaluate(() => localStorage.getItem("bindr-schema-v1")), "12", "schema 0.13 herkend via schema_versie()");
  await page.getByRole("button", { name: "Instellingen" }).click();
  await page.locator(".instagram-veld input").fill("bindr.pin");
  await page.locator(".instagram-veld").getByRole("button", { name: "Bewaar" }).click();
  await page.waitForTimeout(600);
  await page.keyboard.press("Escape");
  assert.equal(server.instellingen.instagram, "bindr.pin");
  assert.equal(await page.getByText(/Niet bewaard/).count(), 0, "geen valse foutmelding bij een leeg antwoord");
  assert.equal(await wachtrij(), 0);

  stap("na 10 minuten: vergrendeld; de pincode opent de app zonder de server");
  await page.evaluate(() => localStorage.setItem("bindr-actief-v1", String(Date.now() - 11 * 60000)));
  await page.reload();
  await page.getByRole("heading", { name: "Hallo Jadon" }).waitFor();
  const loginsVoorSlot = server.logins.length;
  await page.keyboard.type("111222");
  await page.getByText("Die pincode klopt niet").waitFor();
  await foto("p2-slot");
  await page.keyboard.type("482915");
  await page.locator(".tabbalk").waitFor();
  assert.equal(server.logins.length, loginsVoorSlot, "de pincode gaat nooit naar de server");

  stap("sessie ingetrokken op de server: opnieuw inloggen met het wachtwoord, de wachtrij en de pincode blijven");
  server.modus = "offline";
  await page.getByRole("button", { name: "Instellingen" }).click();
  await page.locator(".instagram-veld input").fill("bindr.offline");
  await page.locator(".instagram-veld").getByRole("button", { name: "Bewaar" }).click();
  await page.waitForTimeout(400);
  await page.keyboard.press("Escape");
  assert.equal(await wachtrij(), 1, "offline: de wijziging wacht");
  server.modus = "ingetrokken";
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await page.getByPlaceholder("E-mailadres").waitFor();
  await page.getByText(/sessie is verlopen/).waitFor();
  assert.equal(await wachtrij(), 1, "de wachtrij is niet weggegooid");
  await foto("p3-sessie-verlopen");
  server.modus = "normaal";
  await login(page, STERK);
  await page.locator(".tabbalk").waitFor(); // de pincode van deze gsm bleef: geen nieuwe kiezen
  await page.waitForTimeout(800);
  assert.equal(server.instellingen.instagram, "bindr.offline", "de wachtende wijziging ging alsnog door");
  assert.equal(await wachtrij(), 0);

  stap("tweede gsm van vóór 0.11: na de pincode eerst een wachtwoord, de pincode blijft");
  const p2 = await nieuweGsm();
  await p2.goto(BASIS + "beheer.html");
  await login(p2, STERK);
  await pincode(p2, "736194");
  await p2.locator(".tabbalk").waitFor();
  assert.equal((await pinRecord(p2)).v, 2);
  // Zo zag een gsm er vóór 0.11 uit: de pincode was ook het wachtwoord, zonder `v`.
  server.wachtwoord = "736194";
  await p2.evaluate(() => {
    const r = JSON.parse(localStorage.getItem("bindr-pin-v1"));
    delete r.v;
    localStorage.setItem("bindr-pin-v1", JSON.stringify(r));
    localStorage.setItem("bindr-actief-v1", "1");
  });
  await p2.reload();
  await p2.getByRole("heading", { name: "Hallo Jadon" }).waitFor();
  await p2.keyboard.type("736194");
  await p2.getByRole("heading", { name: "Kies een wachtwoord" }).waitFor();
  assert.equal(await p2.getByLabel("Huidig wachtwoord").count(), 0, "de oude pincode is het huidige wachtwoord");
  // Herladen slaat de stap niet over: dan vraagt het scherm het huidige wachtwoord.
  await p2.reload();
  await p2.getByRole("heading", { name: "Kies een wachtwoord" }).waitFor();
  await p2.getByLabel("Huidig wachtwoord").fill("736194");
  await nieuwWachtwoord(p2, STERK);
  await p2.locator(".tabbalk").waitFor();
  assert.equal(server.wachtwoord, STERK);
  assert.equal((await pinRecord(p2)).v, 2, "dezelfde pincode, nu enkel van deze gsm");
  await p2.reload();
  await p2.locator(".tabbalk").waitFor(); // niets meer te vragen

  stap("derde gsm van vóór 0.11, maar het wachtwoord werd al aangepast: opnieuw inloggen");
  const p3 = await nieuweGsm();
  await p3.goto(BASIS + "beheer.html");
  await login(p3, STERK);
  await pincode(p3, "736194");
  await p3.locator(".tabbalk").waitFor();
  await p3.evaluate(() => {
    const r = JSON.parse(localStorage.getItem("bindr-pin-v1"));
    delete r.v;
    localStorage.setItem("bindr-pin-v1", JSON.stringify(r));
    localStorage.setItem("bindr-actief-v1", "1");
  });
  await p3.reload();
  await p3.keyboard.type("736194");
  await p3.getByRole("heading", { name: "Kies een wachtwoord" }).waitFor();
  await nieuwWachtwoord(p3, "Nog een ander lang zinnetje");
  await p3.getByText(/werd al aangepast/).waitFor();
  await p3.getByPlaceholder("E-mailadres").waitFor();
  assert.equal(server.wachtwoord, STERK, "niets veranderd");
  assert.equal(await pinRecord(p3), null, "de oude pincode is weg");

  stap("pincode wijzigen in Profiel: eerst de huidige, enkel op deze gsm");
  await page.locator(".tabbalk button").filter({ hasText: "Profiel" }).click();
  await page.getByRole("button", { name: "Pincode wijzigen" }).click();
  await page.getByRole("heading", { name: "Huidige pincode" }).waitFor();
  await page.keyboard.type("111222");
  await page.getByText("Die pincode klopt niet").waitFor();
  await page.keyboard.type("482915");
  const loginsVoorPin = server.logins.length;
  const wachtwoordVoorPin = server.wachtwoord;
  await pincode(page, "572913");
  await page.getByText("Nieuwe pincode bewaard").waitFor();
  assert.equal(server.wachtwoord, wachtwoordVoorPin, "de pincode verandert het wachtwoord niet");
  assert.equal(server.logins.length, loginsVoorPin);

  stap("wachtwoord wijzigen in Profiel: eerst het huidige");
  await page.getByRole("button", { name: "Wachtwoord wijzigen" }).click();
  await page.getByLabel("Huidig wachtwoord").fill("fout fout fout fout");
  await nieuwWachtwoord(page, STERK2);
  await page.getByRole("alert").getByText("Je huidige wachtwoord klopt niet.").waitFor();
  assert.equal(server.wachtwoord, STERK);
  await page.getByLabel("Huidig wachtwoord").fill(STERK);
  await foto("p4-wachtwoord-wijzigen");
  await page.getByRole("button", { name: "Bewaar wachtwoord" }).click();
  await page.getByText(/Nieuw wachtwoord bewaard/).waitFor();
  assert.equal(server.wachtwoord, STERK2);

  stap("10 foute pincodes: de gsm vergeet de sessie, de wachtrij blijft");
  await page.evaluate(() => {
    localStorage.setItem("bindr-actief-v1", "1");
    localStorage.setItem("bindr-pin-pogingen-v1", JSON.stringify({ aantal: 8, tot: 0 }));
  });
  await page.reload();
  await page.getByRole("heading", { name: "Hallo Jadon" }).waitFor();
  await page.keyboard.type("111222");
  await page.getByText(/nog 1 poging, dan moet je opnieuw inloggen/).waitFor();
  await page.evaluate(() => localStorage.setItem("bindr-pin-pogingen-v1", JSON.stringify({ aantal: 9, tot: 0 }))); // niet 8 minuten wachten
  await page.waitForTimeout(1300);
  await page.keyboard.type("111222");
  await page.getByText(/Te veel foute pincodes/).waitFor();
  await page.getByPlaceholder("E-mailadres").waitFor();
  assert.equal(await page.evaluate(() => localStorage.getItem("bindr-sessie-v1")), null, "sessie gewist");
  assert.equal(await pinRecord(), null, "pincode gewist");
  await foto("p5-te-veel-pogingen");
  await login(page, STERK2);
  await pincode(page, "572913");
  await page.locator(".tabbalk").waitFor();
  // Afgesloten voor de sessie weg was: bij de volgende start alsnog weg.
  await page.evaluate(() => localStorage.setItem("bindr-pin-pogingen-v1", JSON.stringify({ aantal: 10, tot: 0 })));
  await page.reload();
  await page.getByText(/Te veel foute pincodes/).waitFor();
  assert.equal(await page.evaluate(() => localStorage.getItem("bindr-sessie-v1")), null, "sessie gewist bij het opstarten");
  await login(page, STERK2);
  await pincode(page, "572913");
  await page.locator(".tabbalk").waitFor();

  stap("het scherm voor een nieuw wachtwoord blijft niet open liggen");
  const p6 = await nieuweGsm();
  await p6.clock.install();
  server.wachtwoord = "591374";
  await p6.goto(BASIS + "beheer.html");
  await login(p6, "591374");
  await p6.getByRole("heading", { name: "Kies een wachtwoord" }).waitFor();
  await p6.clock.fastForward("11:00");
  // Nog geen pincode op deze gsm: dan opnieuw inloggen (het huidige wachtwoord is vergeten).
  await p6.getByText("Te lang gewacht. Log opnieuw in.").waitFor();
  assert.equal(await p6.evaluate(() => localStorage.getItem("bindr-sessie-v1")), null);
  await login(p6, "591374");
  await p6.getByRole("heading", { name: "Kies een wachtwoord" }).waitFor();
  await nieuwWachtwoord(p6, STERK2);
  await p6.locator(".tabbalk").waitFor();
  assert.equal(server.wachtwoord, STERK2);

  stap("\"Later\" laat de gsm niet open: na een herstart opnieuw inloggen");
  const p4 = await nieuweGsm();
  await p4.goto(BASIS + "beheer.html");
  await login(p4, STERK2);
  await p4.getByRole("button", { name: "Later" }).click();
  await p4.locator(".tabbalk").waitFor();
  await p4.reload();
  await p4.getByPlaceholder("E-mailadres").waitFor();
  assert.equal(await p4.locator(".tabbalk").count(), 0, "zonder pincode niet meer open na een herstart");

  stap("een verlopen herstellink: uitleg op het inlogscherm");
  const p7 = await nieuweGsm();
  await p7.goto(`${BASIS}#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired`);
  await p7.getByText(/Deze link is verlopen of al gebruikt/).waitFor();
  assert.ok(/beheer\.html$/.test(p7.url()), "zonder de fout in de adresbalk");

  stap("wachtwoord vergeten: een herstelmail, de link opent het beheer");
  const p5 = await nieuweGsm();
  await p5.goto(BASIS + "beheer.html");
  await p5.getByRole("button", { name: "Wachtwoord vergeten?" }).click();
  await p5.getByPlaceholder("E-mailadres").fill(EMAIL);
  await p5.getByRole("button", { name: "Stuur de mail" }).click();
  await p5.getByText(/krijg je zo een mail/).waitFor();
  assert.equal(server.herstel.email, EMAIL);
  assert.match(server.herstel.redirect, /\/beheer\.html$/, "de link gaat naar het beheer");
  // De link uit de mail (Supabase stuurt naar de Site URL, hier de klantenpagina, met de sessie in de hash).
  const s = sessie();
  await p5.goto(`${BASIS}#access_token=${s.access_token}&expires_in=3600&refresh_token=${s.refresh_token}&token_type=bearer&type=recovery`);
  await p5.getByRole("heading", { name: "Nieuw wachtwoord" }).waitFor();
  assert.ok(/beheer\.html$/.test(p5.url()), "doorgestuurd naar het beheer, zonder de tokens in de adresbalk");
  await nieuwWachtwoord(p5, "Vergeten maar teruggevonden");
  await pincode(p5, "395172");
  await p5.locator(".tabbalk").waitFor();
  assert.equal(server.wachtwoord, "Vergeten maar teruggevonden");

  stap("uitloggen vanop het slotscherm");
  await page.evaluate(() => localStorage.setItem("bindr-actief-v1", "1"));
  await page.reload();
  await page.getByRole("heading", { name: "Hallo Jadon" }).waitFor();
  await page.getByRole("button", { name: "Iemand anders, of pincode vergeten?" }).click();
  await page.getByPlaceholder("E-mailadres").waitFor();
  assert.ok(await page.evaluate(() => !localStorage.getItem("bindr-pin-v1")), "pincode van het toestel gewist");

  assert.deepEqual(fouten, [], "geen JavaScript-fouten");
  await browser.close();
  console.log("Inloggen in orde. Screenshots in", SHOTS);
})().catch((e) => {
  console.error(e);
  // In GitHub Actions ook als melding bij de run (die zie je zonder het hele logboek te openen).
  if (process.env.GITHUB_ACTIONS) console.log(`::error title=${require("node:path").basename(__filename)}::${globalThis.laatsteStap ? `[${globalThis.laatsteStap}] ` : ""}${String(e && e.message || e).split("\n").filter(Boolean).slice(0, 4).join(" | ").replace(/[\r%]/g, " ")}`);
  process.exit(1);
});
