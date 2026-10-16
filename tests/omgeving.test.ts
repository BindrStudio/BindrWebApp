// Versie 0.4: omgevingen, pincode, fotobronnen, marge en grapjes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { standaardExemplaar } from "../src/lib/exemplaar";
import { losConflictOp, marge, nieuweTransactie, pasToe, regelUit, type Voorraad } from "../src/lib/kassa";
import { fotoBronnen, ptcgioSet, setLogo, uitCatalogus } from "../src/lib/foto";
import { isOudePin, pinFout, wachtwoordFout } from "../src/lib/pin";
import { GELUKT, KAART, kies } from "../src/lib/grapjes";
import { grapje } from "../src/lib/markt";
import type { Exemplaar } from "../src/types";

const kaart = (code: string, w: Partial<Exemplaar> = {}): Exemplaar => standaardExemplaar({
  code, soort: "kaart", naam: `Kaart ${code}`, opslag: "vitrine", status: "in voorraad", hartjesprijs: 10, verkoopprijs: 10, aankoopprijs: 4, ...w,
} as Parameters<typeof standaardExemplaar>[0], "2026-10-01T10:00:00Z");

test("omgevingen: een exemplaar van een andere omgeving wordt een conflict, nooit stil verkocht", () => {
  const bindr = kaart("AAAAAA", { omgeving_id: "bindr" });
  const brent = kaart("BBBBBB", { omgeving_id: "brent" });
  const v: Voorraad = { exemplaren: [bindr, brent], artikelen: [] };
  const t = { ...nieuweTransactie([regelUit(bindr), regelUit(brent)], { cash: 20, sumup: 0 }, null), omgeving_id: "bindr" };
  const { voorraad, transactie } = pasToe(v, t);
  assert.equal(transactie.status, "conflict");
  assert.deepEqual(transactie.conflicten.map((c) => c.exemplaar_id), [brent.id]);
  assert.match(transactie.conflicten[0].reden, /andere omgeving/);
  assert.equal(voorraad.exemplaren.find((e) => e.id === bindr.id)!.status, "verkocht");
  assert.equal(voorraad.exemplaren.find((e) => e.id === brent.id)!.status, "in voorraad");
  // Oplossen met een exemplaar van de andere omgeving mag ook niet.
  const nogEen = kaart("CCCCCC", { omgeving_id: "brent" });
  assert.throws(() => losConflictOp({ ...voorraad, exemplaren: [...voorraad.exemplaren, nogEen] }, transactie, brent.id, nogEen.id), /andere omgeving/);
});

test("omgevingen: nieuwe kaarten van de klant krijgen de omgeving van de transactie", () => {
  const v: Voorraad = { exemplaren: [], artikelen: [] };
  const nieuw = { ...kaart("DDDDDD"), id: "nieuw-1" };
  const t = {
    ...nieuweTransactie([{ richting: "in" as const, nieuw, naam: nieuw.naam, code: nieuw.code, prijs: 5 }], { cash: -5, sumup: 0 }, null),
    omgeving_id: "brent",
  };
  const { voorraad } = pasToe(v, t);
  assert.equal(voorraad.exemplaren[0].omgeving_id, "brent");
});

test("marge: enkel regels met een gekende aankoopprijs, artikelen tellen niet mee", () => {
  const a = regelUit(kaart("EEEEEE", { aankoopprijs: 4 }), 10);
  const b = regelUit(kaart("FFFFFF", { aankoopprijs: 12 }), 8);
  const c = regelUit(kaart("GGGGGG", { aankoopprijs: null }), 6);
  const m = marge([a, b, c, { richting: "uit", artikel_id: "x", naam: "Booster", prijs: 5 }]);
  assert.equal(m.verkoop, 18);
  assert.equal(m.aankoop, 16);
  assert.equal(m.winst, 2);
  assert.equal(m.pct, 13);
  assert.equal(m.gekend, 2);
  assert.equal(m.onbekend, 1, "artikels tellen niet: hun kosten zitten apart in de boekhouding");
  assert.equal(marge([b]).winst, -4);
});

test("pincode: 6 cijfers, geen reeks en niet zes keer hetzelfde", () => {
  assert.equal(pinFout("482915"), null);
  assert.match(pinFout("12345")!, /6 cijfers/);
  assert.match(pinFout("12a456")!, /6 cijfers/);
  assert.match(pinFout("111111")!, /hetzelfde/);
  assert.match(pinFout("123456")!, /reeks/);
  assert.match(pinFout("654321")!, /reeks/);
  assert.match(pinFout("567890")!, /reeks/);
});

test("wachtwoord (0.11): lang, niet enkel cijfers, niet te raden; de pincode blijft op de gsm", () => {
  assert.equal(wachtwoordFout("Glurak regent op dinsdag"), null);
  assert.equal(wachtwoordFout("mijn-binder-is-blauw-42"), null);
  assert.match(wachtwoordFout("482915")!, /Minstens 12 tekens/);
  assert.match(wachtwoordFout("123456789012")!, /enkel cijfers/);
  assert.match(wachtwoordFout("aaaaaaaaaaaaaa")!, /verschillende/);
  assert.match(wachtwoordFout("Wachtwoord2026!")!, /raden/);
  assert.match(wachtwoordFout("Bindr12345678")!, /raden/);
  assert.match(wachtwoordFout("lotte.peeters-1990", "lotte.peeters@voorbeeld.be")!, /e-mailadres/);
  // Een pincode van vóór 0.11 (zonder v) was ook het wachtwoord.
  const r = { email: "a@b.be", naam: null, user_id: "x", zout: "z", hash: "h" };
  assert.equal(isOudePin(r), true);
  assert.equal(isOudePin({ ...r, v: 2 }), false);
  assert.equal(isOudePin(null), false);
});

test("fotobronnen: TCGdex eerst, dan Limitless, dan pokemontcg.io", () => {
  assert.equal(ptcgioSet("sv03"), "sv3");
  assert.equal(ptcgioSet("sv03.5"), "sv3pt5");
  assert.equal(ptcgioSet("swsh12.5"), "swsh12pt5");
  assert.equal(ptcgioSet("me02"), "me2");
  const en = fotoBronnen({ afbeelding: "https://assets.tcgdex.net/en/sv/sv03/125/low.webp", set_code: "obf", nummer: "125", kaart_id: "sv03-125", taal: "EN" }, "groot");
  assert.deepEqual(en, [
    "https://assets.tcgdex.net/en/sv/sv03/125/high.webp",
    "https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpci/OBF/OBF_125_R_EN_LG.png",
    "https://images.pokemontcg.io/sv3/125_hires.png",
  ]);
  // Japans: geen pokemontcg.io (enkel Engels), Limitless met de Japanse set-id.
  const jp = fotoBronnen({ set_code: "SV2a", nummer: "6", kaart_id: "SV2a-006", catalogus: "asia" });
  assert.deepEqual(jp, ["https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/SV2a/SV2a_6_R_JP_SM.png"]);
  // Japanse promo's: zonder streepje in de setcode (M-P 133 → MP_133).
  const promo = fotoBronnen({ set_code: "M-P", nummer: "133", taal: "JP" }, "groot");
  assert.deepEqual(promo, ["https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/MP/MP_133_R_JP_LG.png"]);
  // Een eigen foto gaat voor alles.
  assert.equal(fotoBronnen({ foto: "data:image/jpeg;base64,AAAA", set_code: "OBF", nummer: "125" })[0], "data:image/jpeg;base64,AAAA");
  // Zonder setcode of met een nummer als "TG05": enkel wat kan.
  assert.deepEqual(fotoBronnen({ nummer: "TG05" }), []);
  assert.deepEqual(uitCatalogus({ id: "sv03-125", setCode: "OBF", setId: "sv03", nummer: "125", catalogus: "en" }).set_code, "OBF");
});

test("set-logo: taal en reeks uit sets.json", () => {
  assert.equal(setLogo("sv03", ["Obsidian Flames", "OBF", "2023-08-11", "sv", "en"]), "https://assets.tcgdex.net/en/sv/sv03/logo.png");
  assert.equal(setLogo("SV2a", ["Pokémon Card 151", "", "2023-06-16", "SV", "ja"]), "https://assets.tcgdex.net/ja/SV/SV2a/logo.png");
  assert.equal(setLogo("x", ["X", "", ""]), null);
  assert.equal(setLogo("x", null), null);
});

test("grapjes: genoeg keuze, en dezelfde kaart krijgt altijd hetzelfde", () => {
  for (const lijst of Object.values(KAART)) assert.ok(lijst.length >= 10);
  for (const lijst of Object.values(GELUKT)) assert.ok(lijst.length >= 2);
  assert.equal(grapje("op", 12345), grapje("op", 12345));
  const verschillend = new Set(Array.from({ length: 60 }, (_, i) => grapje("stabiel", i)));
  assert.ok(verschillend.size >= 8, "verschillende kaarten krijgen verschillende grapjes");
  assert.ok(KAART.op.includes(kies(KAART.op)));
});

test("OCR: Otsu kiest een drempel tussen tekst en achtergrond", async () => {
  const { otsu } = await import("../src/lib/ocr");
  const pixels = [...Array(300).fill(40), ...Array(700).fill(210)];
  const t = otsu(pixels);
  assert.ok(t >= 40 && t < 210, `drempel ${t}`);
});

test("eigen foto's: enkel echte afbeeldingen als data-URL", async () => {
  const { veiligeFoto } = await import("../src/lib/eigenfoto");
  assert.equal(veiligeFoto("data:image/jpeg;base64,/9j/4AAQSkZJRg=="), "data:image/jpeg;base64,/9j/4AAQSkZJRg==");
  assert.equal(veiligeFoto("javascript:alert(1)"), null);
  assert.equal(veiligeFoto("https://example.com/x.jpg"), null);
  assert.equal(veiligeFoto("data:image/svg+xml;base64,PHN2Zz4="), null, "geen SVG (kan scripts bevatten)");
  assert.equal(veiligeFoto(null), null);
});

test("graded: eBay-link, certificaat en schatting uit verkopen", async () => {
  const { ebaySoldLink, certLink, gradedZoektekst, schattingUitVerkopen, cardmarketSealedLink } = await import("../src/lib/markt");
  const zoek = gradedZoektekst({ naam: "Charizard ex", nummer: "199", setTotaal: 165, grader: "PSA", grade: "10" });
  assert.equal(zoek, "Charizard ex 199/165 PSA 10");
  assert.equal(ebaySoldLink(zoek), "https://www.ebay.com/sch/i.html?_nkw=Charizard+ex+199%2F165+PSA+10&LH_Sold=1&LH_Complete=1&_sop=13");
  assert.equal(certLink("PSA", "12 345 678"), "https://www.psacard.com/cert/12345678");
  assert.equal(certLink("PSA", "abc"), null);
  const nu = Date.parse("2026-10-15T12:00:00Z");
  assert.equal(schattingUitVerkopen([{ datum: "2026-10-01", prijs: 180 }, { datum: "2026-09-20", prijs: 170 }, { datum: "2026-10-10", prijs: 195 }], nu), 180);
  assert.equal(schattingUitVerkopen([], nu), null);
  assert.match(cardmarketSealedLink(123, "Booster"), /idProduct=123&sellerCountry=2,23/);
  // Nederlandse kaarten: Cardmarket kent die taal niet, dus zonder taalfilter (alle talen).
  const { cardmarketLink, cardmarketKentTaal } = await import("../src/lib/markt");
  assert.equal(cardmarketKentTaal("NL"), false);
  assert.doesNotMatch(cardmarketLink(42, "NL"), /language=/);
  assert.match(cardmarketLink(42, "JP"), /language=7/);
  assert.match(cardmarketSealedLink(null, "Ascended Heroes booster"), /Products\/Search\?searchString=Ascended\+Heroes\+booster/);
});
