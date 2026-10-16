// Inloggen met een pincode, tegen een nagebootste Supabase (geen echte server nodig):
// eerste keer met het wachtwoord, pincode kiezen, vergrendelen en ontgrendelen, en een sessie
// die op de server verviel zonder dat de wachtrij iets verliest.
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

// ── Nagebootste Supabase ─────────────────────────────────────────────────────
const server = {
  wachtwoord: "eerste-wachtwoord",
  modus: "normaal", // "normaal" | "offline" | "ingetrokken"
  tokens: new Set(),
  instellingen: {},
  aanwezig: 0,
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
      return body.email === EMAIL && body.password === server.wachtwoord
        ? json(route, 200, sessie()) : json(route, 400, { error_description: "Invalid login credentials" });
    }
    return server.modus === "ingetrokken" ? json(route, 400, { error_description: "Invalid Refresh Token: Refresh Token Not Found" }) : json(route, 200, sessie());
  }
  if (p === "/auth/v1/logout") return route.fulfill({ status: 204 });
  const token = (req.headers().authorization || "").replace("Bearer ", "");
  if (server.modus === "ingetrokken" || !server.tokens.has(token)) return json(route, 401, { message: "JWT expired" });
  if (p === "/auth/v1/user" && req.method() === "PUT") {
    const { password } = req.postDataJSON();
    if (password === server.wachtwoord) return json(route, 422, { error_code: "same_password", msg: "New password should be different from the old password." });
    server.wachtwoord = password;
    return json(route, 200, { id: GEBRUIKER, email: EMAIL });
  }
  const tabel = p.replace("/rest/v1/", "");
  if (tabel === "beheerders") return json(route, 200, [{ naam: "Jadon", user_id: GEBRUIKER }]);
  if (tabel === "rpc/schema_versie") return json(route, 200, 10); // schema 0.10: de app vraagt het in één keer
  if (tabel === "omgevingen") return json(route, 200, server.omgevingen);
  if (tabel === "instellingen" && req.method() === "POST") {
    for (const r of req.postDataJSON()) server.instellingen[r.sleutel] = r.waarde;
    return route.fulfill({ status: 201, body: "" }); // return=minimal: geen inhoud
  }
  if (tabel === "instellingen") return json(route, 200, Object.entries(server.instellingen).map(([sleutel, waarde]) => ({ sleutel, waarde })));
  if (tabel === "aanwezig" && req.method() === "POST") { server.aanwezig++; return route.fulfill({ status: 201, body: "" }); }
  if (tabel === "aanwezig") return json(route, 200, [{ user_id: GEBRUIKER, omgeving_id: "o-bindr", scherm: "catalogus", laatst: new Date().toISOString() }]);
  if (["exemplaren", "artikelen", "beurzen", "transacties", "aanvragen", "etalage"].includes(tabel)) return json(route, 200, []);
  return json(route, 404, { message: `onbekend: ${tabel}` });
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices["iPhone 13"], locale: "nl-BE" });
  await ctx.route(`${SUPABASE}/**`, nabootsen);
  const page = await ctx.newPage();
  const fouten = [];
  page.on("pageerror", (e) => fouten.push(e.message));
  page.on("dialog", (d) => d.accept());
  const stap = (t) => console.log("·", t);
  const foto = (n) => page.screenshot({ path: path.join(SHOTS, `${n}.png`) });
  const wachtrij = () => page.evaluate(() => Object.entries(localStorage).filter(([k]) => k.startsWith("bindr-wachtrij-v1-supabase")).reduce((n, [, v]) => n + JSON.parse(v).length, 0));

  stap("eerste keer: inloggen met het wachtwoord");
  await page.goto(BASIS + "beheer.html");
  await page.getByRole("button", { name: "Eerste keer? Log in met je wachtwoord" }).click();
  await page.getByPlaceholder("E-mailadres").fill(EMAIL);
  await page.getByPlaceholder("Wachtwoord").fill("eerste-wachtwoord");
  await page.getByRole("button", { name: "Inloggen", exact: true }).click();
  await page.getByRole("heading", { name: "Kies je pincode" }).waitFor();

  stap("pincode kiezen: een reeks mag niet, daarna twee keer dezelfde");
  await page.keyboard.type("123456");
  await page.getByText("Geen reeks zoals 123456.").waitFor();
  await page.keyboard.type("482915");
  await page.getByRole("heading", { name: "Nog een keer" }).waitFor();
  await foto("p1-pincode-kiezen");
  await page.keyboard.type("482915");
  await page.locator(".tabbalk").waitFor();
  assert.equal(server.wachtwoord, "482915", "de pincode is het nieuwe wachtwoord");

  stap("samen werken: aanwezig gemeld (antwoord zonder inhoud) en instelling bewaard");
  await page.waitForTimeout(500);
  assert.ok(server.aanwezig >= 1, "aanwezig gemeld");
  assert.equal(await page.evaluate(() => localStorage.getItem("bindr-schema-v1")), "9", "schema 0.10 herkend via schema_versie()");
  await page.getByRole("button", { name: "Instellingen" }).click();
  await page.locator(".instagram-veld input").fill("bindr.pin");
  await page.locator(".instagram-veld").getByRole("button", { name: "Bewaar" }).click();
  await page.waitForTimeout(600);
  await page.keyboard.press("Escape");
  assert.equal(server.instellingen.instagram, "bindr.pin");
  assert.equal(await page.getByText(/Niet bewaard/).count(), 0, "geen valse foutmelding bij een leeg antwoord");
  assert.equal(await wachtrij(), 0);

  stap("na 10 minuten: vergrendeld, enkel de pincode");
  await page.evaluate(() => localStorage.setItem("bindr-actief-v1", String(Date.now() - 11 * 60000)));
  await page.reload();
  await page.getByRole("heading", { name: "Hallo Jadon" }).waitFor();
  await page.keyboard.type("111222");
  await page.getByText("Die pincode klopt niet").waitFor();
  await foto("p2-slot");
  await page.keyboard.type("482915");
  await page.locator(".tabbalk").waitFor();

  stap("sessie ingetrokken op de server: opnieuw inloggen, de wachtrij blijft");
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
  await page.getByPlaceholder("E-mailadres").fill(EMAIL);
  await page.getByLabel("Pincode").fill("482915");
  await page.getByRole("button", { name: "Inloggen", exact: true }).click();
  await page.locator(".tabbalk").waitFor();
  await page.waitForTimeout(800);
  assert.equal(server.instellingen.instagram, "bindr.offline", "de wachtende wijziging ging alsnog door");
  assert.equal(await wachtrij(), 0);

  stap("tweede gsm: zelfde pincode kiezen mag");
  const p2 = await (await browser.newContext({ ...devices["iPhone 13"], locale: "nl-BE" })).newPage();
  await p2.context().route(`${SUPABASE}/**`, nabootsen);
  await p2.goto(BASIS + "beheer.html");
  await p2.getByRole("button", { name: "Eerste keer? Log in met je wachtwoord" }).click();
  await p2.getByPlaceholder("E-mailadres").fill(EMAIL);
  await p2.getByPlaceholder("Wachtwoord").fill("482915");
  await p2.getByRole("button", { name: "Inloggen", exact: true }).click();
  await p2.getByRole("heading", { name: "Kies je pincode" }).waitFor();
  await p2.keyboard.type("482915");
  await p2.getByRole("heading", { name: "Nog een keer" }).waitFor();
  await p2.keyboard.type("482915");
  await p2.locator(".tabbalk").waitFor();
  assert.ok(await p2.evaluate(() => !!localStorage.getItem("bindr-pin-v1")), "pincode bewaard op de tweede gsm");

  stap("pincode wijzigen vraagt eerst de huidige");
  await page.locator(".tabbalk button").filter({ hasText: "Profiel" }).click();
  await page.getByRole("button", { name: "Pincode wijzigen" }).click();
  await page.getByRole("heading", { name: "Huidige pincode" }).waitFor();
  await page.keyboard.type("111222");
  await page.getByText("Die pincode klopt niet").waitFor();
  await page.keyboard.type("482915");
  await page.getByRole("heading", { name: "Kies je pincode" }).waitFor();
  await page.keyboard.press("Escape");

  stap("\"Later\" laat de gsm niet open: na een herstart opnieuw inloggen");
  const p3 = await (await browser.newContext({ ...devices["iPhone 13"], locale: "nl-BE" })).newPage();
  await p3.context().route(`${SUPABASE}/**`, nabootsen);
  await p3.goto(BASIS + "beheer.html");
  await p3.getByRole("button", { name: "Eerste keer? Log in met je wachtwoord" }).click();
  await p3.getByPlaceholder("E-mailadres").fill(EMAIL);
  await p3.getByPlaceholder("Wachtwoord").fill("482915");
  await p3.getByRole("button", { name: "Inloggen", exact: true }).click();
  await p3.getByRole("button", { name: "Later" }).click();
  await p3.locator(".tabbalk").waitFor();
  await p3.reload();
  await p3.getByPlaceholder("E-mailadres").waitFor();
  assert.equal(await p3.locator(".tabbalk").count(), 0, "zonder pincode niet meer open na een herstart");

  stap("uitloggen vanop het slotscherm");
  await page.evaluate(() => localStorage.setItem("bindr-actief-v1", "1"));
  await page.reload();
  await page.getByRole("heading", { name: "Hallo Jadon" }).waitFor();
  await page.getByRole("button", { name: "Iemand anders, of pincode vergeten?" }).click();
  await page.getByPlaceholder("E-mailadres").waitFor();
  assert.ok(await page.evaluate(() => !localStorage.getItem("bindr-pin-v1")), "pincode van het toestel gewist");

  assert.deepEqual(fouten, [], "geen JavaScript-fouten");
  await browser.close();
  console.log("Pincode in orde. Screenshots in", SHOTS);
})().catch((e) => { console.error(e); process.exit(1); });
