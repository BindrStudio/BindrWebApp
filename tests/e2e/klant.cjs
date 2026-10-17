// De klantenpagina tegen een nagebootste Supabase (zoals online, niet de demo): de binders vooraan laden los van de
// catalogus en eerst de eerste alleen; een foto die eens mislukt komt er toch; komt ze nooit, dan de voorbeeldbinders
// (nooit een lege waaier); een ouder schema (zonder plek, zonder thema's); en het thema met zijn eigen logo.
//   npm run serve
//   node tests/e2e/klant.cjs [map-voor-screenshots]
const { chromium, devices } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

const BASIS = process.env.BASIS || "http://localhost:8080/";
const SHOTS = path.resolve(process.argv[2] || ".tests/shots");
fs.mkdirSync(SHOTS, { recursive: true });
const SUPABASE = "https://thnrmrvpkcrujxtwwqhy.supabase.co";
const beeld = (p) => `data:image/${p.endsWith(".png") ? "png" : "webp"};base64,${fs.readFileSync(path.resolve(__dirname, "../../public/img", p)).toString("base64")}`;
const LOGO = beeld("logo-zwart.png");

const ETALAGE = [
  ...["dragonite", "espeon", "rayquaza"].map((k, i) => ({ id: `aaaaaaaa-0000-4000-8000-00000000000${i}`, titel: null, link: null, volgorde: i + 1, plek: "voorpagina", foto: beeld(`voorbeeld/${k}.webp`) })),
  ...["eend.png", "voorbeeld/mew.webp"].map((k, i) => ({ id: `bbbbbbbb-0000-4000-8000-00000000000${i}`, titel: null, link: `https://www.instagram.com/p/${i}/`, volgorde: -i, plek: "instagram", foto: beeld(k) })),
];

/** Vandaag en het uur in Brussel. */
const brussel = () => {
  const d = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(new Date());
  const u = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Brussels", hour: "2-digit", hour12: false }).format(new Date())) % 24;
  return { vandaag: d, uur: u };
};

/** Een nagebootste Supabase: `oud` = schema vóór 0.13; `fotoFout` = zoveel keer faalt een foto-aanvraag eerst (Infinity = altijd); `beurzen` = publieke_beurzen. */
function server({ oud = false, schema013 = false, fotoFout = 0, beurzen = [] } = {}) {
  const log = [];
  let fouten = fotoFout;
  const json = (route, status, body) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  const route = async (r) => {
    const url = new URL(r.request().url());
    const tabel = url.pathname.replace("/rest/v1/", "");
    const select = url.searchParams.get("select") || "";
    log.push(`${tabel}?${url.search.slice(1)}`);
    if (tabel === "publieke_etalage") {
      if (oud && select.includes("plek")) return json(r, 400, { code: "42703", message: "column publieke_etalage.plek does not exist" });
      if (select === "id,foto") {
        if (fouten > 0) { fouten--; return json(r, 503, { message: "even niet" }); }
        const ids = (url.searchParams.get("id") || "").replace(/^in\.\(|\)$/g, "").split(",");
        return json(r, 200, ETALAGE.filter((e) => ids.includes(e.id)).map(({ id, foto }) => ({ id, foto })));
      }
      return json(r, 200, ETALAGE.map(({ foto, plek, ...rest }) => (oud ? rest : { ...rest, plek })));
    }
    if (tabel === "publieke_themas") {
      if (oud) return json(r, 404, { message: "relation does not exist" });
      const thema = { id: "halloween", naam: "Halloween", van: "10-15", tot: "11-01", aan: "aan", kleur: "#e8772e", tekst: "Fijne Halloween!" };
      if (select === "logo,logo_groot,logo_eend") {
        if (schema013) return json(r, 400, { code: "42703", message: "column publieke_themas.logo_groot does not exist" });
        return json(r, 200, [{ logo: LOGO, logo_groot: null, logo_eend: null }]);
      }
      if (select === "logo") return json(r, 200, [{ logo: LOGO }]);
      assert.ok(!select.includes("logo"), "de lijst van de thema's zonder logo's");
      return json(r, 200, [thema]);
    }
    if (tabel === "publieke_instellingen") return json(r, 200, [{ sleutel: "instagram", waarde: "bindr.test" }]);
    if (tabel === "publieke_beurzen") return json(r, 200, beurzen);
    return json(r, 200, []); // vitrine, artikelen, beurzen: leeg
  };
  return { log, route };
}

(async () => {
  const browser = await chromium.launch();
  const fouten = [];
  const open = async (opties, pad = "") => {
    const ctx = await browser.newContext({ ...devices["Pixel 7"] });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => fouten.push(String(e)));
    const s = server(opties);
    await page.route(`${SUPABASE}/rest/v1/**`, s.route);
    // Onze laatste Instagram-berichten, zoals scripts/instagram.mjs ze bij het publiceren op de site zet.
    if (opties.feed) {
      await page.route("**/data/instagram.json", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ bijgewerkt: new Date().toISOString(), bron: "behold", posts: opties.feed }) }));
      await page.route("**/img/insta/*", (r) => r.fulfill({ status: 200, contentType: "image/webp", body: fs.readFileSync(path.resolve(__dirname, "../../public/img/voorbeeld/mew.webp")) }));
    }
    await page.goto(BASIS + pad);
    return { ctx, page, log: s.log };
  };

  // 1. Zoals het hoort, met één mislukte foto-aanvraag: de eerste binder komt er toch, alleen; dan de rest.
  globalThis.laatsteStap = "binders vooraan en het thema";
  console.log("· binders vooraan, één fout onderweg, en het thema met zijn logo");
  {
    const feed = [
      { id: "Nieuw1", foto: "img/insta/Nieuw1.webp", link: "https://www.instagram.com/p/Nieuw1/", alt: "Mew in een bubbel", datum: "2026-10-16T10:00:00+0000" },
      { id: "Oud0", foto: "img/insta/Oud0.webp", link: "https://www.instagram.com/p/0/", alt: null, datum: "2026-10-01T10:00:00+0000" }, // staat ook bij de eigen foto's
      { id: "Slecht", foto: "https://evil.example/x.webp", link: "https://www.instagram.com/p/x/", alt: null, datum: null },
    ];
    const { ctx, page, log } = await open({ fotoFout: 1, feed });
    await page.locator(".waaier-foto.kaal").nth(2).waitFor({ timeout: 15000 });
    assert.equal(await page.locator('.waaier-foto img[src*="voorbeeld/"]').count(), 0, "geen voorbeeldbinders: de echte");
    const fotoAanvragen = log.filter((l) => l.startsWith("publieke_etalage?select=id%2Cfoto") || l.startsWith("publieke_etalage?select=id,foto"));
    assert.equal(decodeURIComponent(fotoAanvragen[0]).match(/in\.\(([^)]*)\)/)[1].split(",").length, 1, "eerst de eerste binder alleen");
    assert.ok(fotoAanvragen.length >= 3, "na de fout opnieuw, dan de rest");
    assert.match(await page.locator(".thema-eend .thema-ballon").innerText(), /Fijne Halloween/, "de eend zegt de zin van het thema");
    await page.waitForFunction(() => document.querySelector(".klant-merk img")?.getAttribute("src")?.startsWith("data:image/png"));
    assert.ok(log.some((l) => /publieke_themas\?select=logo,logo_groot,logo_eend&id=eq\.halloween/.test(decodeURIComponent(l))), "de logo's apart, enkel van het thema van vandaag");
    assert.match(await page.locator(".over-logo").getAttribute("src"), /img\/thema\/halloween-groot\.webp$/, "geen eigen 'tekst en logo': het meegeleverde");
    // De Instagram-strook: de foto's pas als ze in de buurt komt.
    assert.ok(!log.some((l) => decodeURIComponent(l).includes("bbbbbbbb")), "nog geen Instagram-foto's");
    await page.locator(".insta").scrollIntoViewIfNeeded();
    await page.locator(".insta-tegel img").first().waitFor();
    // Eerst wat automatisch van Instagram komt, dan de eigen foto's (zonder het bericht dat er al bij stond).
    const links = await page.locator(".insta-tegel:not(.extra) a").evaluateAll((l) => l.map((a) => a.getAttribute("href")));
    assert.deepEqual(links, ["https://www.instagram.com/p/Nieuw1/", "https://www.instagram.com/p/0/", "https://www.instagram.com/p/1/"], "feed eerst, geen dubbel, geen vreemde foto");
    assert.equal(await page.locator(".insta-tegel:not(.extra) a").first().getAttribute("aria-label"), "Mew in een bubbel, op Instagram");
    assert.match(await page.locator(".insta-tegel:not(.extra) img").first().getAttribute("src"), /\/img\/insta\/Nieuw1\.webp$/);
    await page.waitForFunction(() => document.querySelectorAll(".insta-tegel:not(.extra) img").length === 3, null, { timeout: 15000 });
    await page.screenshot({ path: path.join(SHOTS, "k1-online.png") });
    await ctx.close();
  }

  // 2. De foto's komen nooit: na drie pogingen de voorbeeldbinders, geen lege waaier.
  globalThis.laatsteStap = "foto's komen niet";
  console.log("· de foto's komen niet: de voorbeeldbinders");
  {
    const { ctx, page } = await open({ fotoFout: Infinity });
    await page.locator('.waaier-foto img[src*="voorbeeld/"]').first().waitFor({ timeout: 20000 });
    assert.equal(await page.locator(".waaier.laden").count(), 0);
    await ctx.close();
  }

  // 3. Een ouder schema: geen plek (alles in de Instagram-strook), geen thema's.
  globalThis.laatsteStap = "ouder schema";
  console.log("· een ouder schema: alles in de strook, voorbeeldbinders, geen thema");
  {
    const { ctx, page, log } = await open({ oud: true });
    await page.locator(".waaier-foto").first().waitFor();
    assert.ok(await page.locator('.waaier-foto img[src*="voorbeeld/"]').count() >= 3, "de voorbeeldbinders");
    assert.equal(await page.locator(".klant.thema, .thema-eend").count(), 0);
    await page.locator(".insta").scrollIntoViewIfNeeded();
    await page.locator(".insta-tegel img").first().waitFor();
    assert.equal(await page.locator(".insta-tegel:not(.extra)").count(), 5, "alle foto's van de oude etalage in de strook");
    assert.ok(log.some((l) => decodeURIComponent(l).includes("select=id,titel,link,volgorde&")), "opnieuw zonder plek");
    await ctx.close();
  }

  // 4. Nu live op een beurs (gestart in de kassa): bovenaan de start, met de route; na het einduur niet meer.
  globalThis.laatsteStap = "nu live";
  console.log("· nu live op een beurs");
  {
    const { vandaag, uur } = brussel();
    const { ctx, page } = await open({ beurzen: [{ naam: "Beurs Gent", datum: vandaag, locatie: "ICC Gent", uren: "00:00–23:59", link: null, bezig: true }] });
    await page.locator(".live").waitFor();
    assert.match(await page.locator(".live").innerText(), /Nu live op Beurs Gent[\s\S]*ICC Gent · tot 23:59[\s\S]*Kom griezelen/);
    assert.match(await page.locator(".live a.live-route").getAttribute("href"), /google\.com\/maps.*ICC/);
    assert.ok(await page.locator(".live-beeld.eend img").isVisible(), "de eend van het thema");
    assert.match(await page.locator(".ticket-nog").innerText(), /Nu live/);
    await page.screenshot({ path: path.join(SHOTS, "k4-live.png") });
    await ctx.close();
    if (uur >= 1) {
      const voorbij = await open({ beurzen: [{ naam: "Beurs Gent", datum: vandaag, locatie: "ICC Gent", uren: "00:00–00:01", link: null, bezig: true }] });
      await voorbij.page.locator(".ticket").waitFor();
      assert.equal(await voorbij.page.locator(".live").count(), 0, "na het einduur (en een half uur) niet meer live");
      await voorbij.ctx.close();
    }
    const gepland = await open({ beurzen: [{ naam: "Beurs Gent", datum: vandaag, locatie: "ICC Gent", uren: null, link: null, bezig: false }] });
    await gepland.page.locator(".ticket").waitFor();
    assert.equal(await gepland.page.locator(".live").count(), 0, "gepland maar nog niet gestart: niet live");
    await gepland.ctx.close();
  }

  // 5. Schema 0.13 (nog geen drie logo's): opnieuw met enkel het logo.
  globalThis.laatsteStap = "schema 0.13";
  {
    const { ctx, page } = await open({ schema013: true });
    await page.waitForFunction(() => document.querySelector(".klant-merk img")?.getAttribute("src")?.startsWith("data:image/png"));
    await ctx.close();
  }

  // 6. Een thema vooraf bekijken dat niet bestaat: gewoon de site.
  globalThis.laatsteStap = "onbekend thema";
  {
    const { ctx, page } = await open({}, "?thema=bestaatniet");
    await page.locator(".waaier-foto").first().waitFor();
    await page.waitForTimeout(500);
    assert.equal(await page.locator(".klant.thema").count(), 0);
    await ctx.close();
    // Een thema dat nog niet bewaard is (kerst): vooraf bekijken zoals de soort het voorstelt, met de standaardzin.
    const kerst = await open({}, "?thema=kerst");
    await kerst.page.locator(".klant.thema-kerst").waitFor();
    assert.match(await kerst.page.locator(".thema-ballon").innerText(), /Voorbeeld van het thema Kerst en winter:\s+Een binder als cadeau\?/);
    await kerst.ctx.close();
  }

  assert.deepEqual(fouten, [], "geen JavaScript-fouten");
  await browser.close();
  console.log(`Klantenpagina (online) in orde. Screenshots in ${SHOTS}`);
})().catch((e) => {
  if (process.env.GITHUB_ACTIONS) console.log(`::error title=klant.cjs::${globalThis.laatsteStap ? `[${globalThis.laatsteStap}] ` : ""}${String(e && e.message || e).split("\n").filter(Boolean).slice(0, 4).join(" | ").replace(/[\r%]/g, " ")}`);
  console.error(e);
  process.exit(1);
});
