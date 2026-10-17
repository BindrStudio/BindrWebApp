// De offline wachtrij: werken zonder internet, later doorsturen, en een conflict
// als twee toestellen hetzelfde exemplaar verkochten.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchUitPublic } from "./helpers";

// Een minimale browseromgeving voor state.ts.
const opslag = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = {
  getItem: (k: string) => opslag.get(k) ?? null,
  setItem: (k: string, v: string) => void opslag.set(k, String(v)),
  removeItem: (k: string) => void opslag.delete(k),
};
fetchUitPublic();

const { DemoBackend } = await import("../src/store/demo");
const { Fout } = await import("../src/store/backend");
const st = await import("../src/state");
const { regelUit } = await import("../src/lib/kassa");
const { laadTestset } = await import("../src/lib/testset");

/** Een "server" met de logica van de demo, die we offline kunnen zetten. */
function nepServer() {
  const server = new DemoBackend();
  const status = { offline: false };
  const proxy = new Proxy(server, {
    get(doel, sleutel) {
      if (sleutel === "soort") return "supabase";
      if (sleutel === "gebruikerId") return () => "beheerder-a";
      const v = (doel as unknown as Record<string | symbol, unknown>)[sleutel];
      if (typeof v !== "function") return v;
      return (...args: unknown[]) => {
        if (status.offline && sleutel !== "gebruiker") return Promise.reject(new Fout("Geen verbinding met de server."));
        return (v as (...a: unknown[]) => unknown).apply(doel, args);
      };
    },
  });
  return { server, proxy, status };
}

const wacht = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("offline verkopen en wijzigen, later doorsturen; conflict bij dubbele verkoop", async () => {
  const { server, proxy, status } = nepServer();
  const set = await laadTestset();
  await server.voegExemplarenToe(set.exemplaren);
  await server.voegArtikelenToe(set.artikelen);

  await st.__testGebruik(proxy);
  let s = st.huidig();
  assert.equal(s.fase, "klaar");
  assert.equal(s.exemplaren.length, 105);

  // Geen internet op de beurs
  status.offline = true;
  const psyduck = s.exemplaren.find((e) => e.code === "FYA-Y74".replace("-", ""))!;
  const darkrai = s.exemplaren.find((e) => e.code === "2Y9YS7")!;
  st.zetHartje(darkrai.id, 125);
  st.inMandje(regelUit(st.huidig().exemplaren.find((e) => e.id === psyduck.id)!));
  st.afrekenen({ cash: 50, sumup: 0 });
  await wacht(50);
  s = st.huidig();
  assert.equal(s.online, false);
  assert.equal(s.wachtrij, 2, "hartje en verkoop wachten");
  assert.equal(s.exemplaren.find((e) => e.id === psyduck.id)!.status, "verkocht", "lokaal meteen verkocht");
  assert.equal((await server.laadAlles()).exemplaren.find((e) => e.id === psyduck.id)!.status, "in voorraad", "server weet nog niets");

  // Een ander toestel verkoopt ondertussen Darkrai, en dit toestel (offline) ook
  await server.boekTransactie({ id: "ander-toestel", beurs_id: null, soort: "verkoop", tijd: new Date().toISOString(), regels: [regelUit(darkrai)], totaal: 130, cash: 130, sumup: 0, status: "ok", conflicten: [], opmerking: null });
  st.inMandje(regelUit(st.huidig().exemplaren.find((e) => e.id === darkrai.id)!));
  const dubbel = st.afrekenen({ cash: 125, sumup: 0 });
  assert.equal(st.huidig().wachtrij, 3);

  // De kopie op het toestel: de app start ook zonder internet
  await wacht(1000);
  await st.__testGebruik(proxy);
  s = st.huidig();
  assert.equal(s.fase, "klaar", "start offline met de kopie");
  assert.equal(s.wachtrij, 3, "wachtrij blijft bewaard");
  assert.equal(s.exemplaren.find((e) => e.id === psyduck.id)!.status, "verkocht");

  // Weer internet
  status.offline = false;
  assert.equal(await st.spoel(), true);
  await wacht(50);
  s = st.huidig();
  assert.equal(s.wachtrij, 0);
  const op = await server.laadAlles();
  assert.equal(op.exemplaren.find((e) => e.id === psyduck.id)!.status, "verkocht", "verkoop staat op de server");
  assert.equal(op.exemplaren.find((e) => e.id === darkrai.id)!.hartjesprijs, 125, "hartje staat op de server");
  assert.equal(op.transacties.find((t) => t.id === dubbel.id)!.status, "conflict", "dubbele verkoop is een conflict");
  assert.equal(s.transacties.find((t) => t.id === dubbel.id)!.status, "conflict", "en dat ziet de app ook");

  // Opnieuw versturen verandert niets (bv. na een time-out)
  await proxy.boekTransactie(op.transacties.find((t) => t.id === dubbel.id)!);
  assert.equal((await server.laadAlles()).transacties.length, op.transacties.length);
});

test("startvoorraad: kaarten die al in de app staan uit privé inbrengen, ongedaan maken, en artikels met de hand bijtellen", async () => {
  const { regelInbreng } = await import("../src/lib/kassa");
  const { boeking, dagVan, voorraadOp } = await import("../src/lib/boekhouding");
  const { standaardExemplaar } = await import("../src/lib/exemplaar");
  const { server, proxy } = nepServer();
  const leeg = async () => { for (let i = 0; i < 200 && st.huidig().wachtrij; i++) await wacht(20); await wacht(30); assert.equal(st.huidig().wachtrij, 0, "alles doorgestuurd"); };
  const gisteren = new Date(Date.now() - 86400000).toISOString();
  await server.voegExemplarenToe(["AAAA01", "AAAA02", "AAAA03"].map((code) => standaardExemplaar({ code, naam: `Eigen ${code}`, aankoopbron: "eigen collectie", hartjesprijs: 10, opslag: "vitrine" }, gisteren)));
  await server.voegArtikelenToe([{ naam: "Binder", soort: "eigen product", aantal: 4, prijs: 45, aankoopprijs: 18 }]);
  await st.__testGebruik(proxy);
  assert.equal(st.huidig().wachtrij, 0);

  // Gisteren stonden ze al in de app, maar nog niet in de boeken: de voorraad van gisteren telt ze aan € 0.
  const regels = st.huidig().exemplaren.filter((e) => e.code.startsWith("AAAA")).map((e) => regelInbreng(e, 7, 10, "onze verkoopprijs", 70));
  const t = st.inbrengBestaand(regels);
  await leeg();
  let op = await server.laadAlles();
  assert.deepEqual(op.exemplaren.filter((e) => e.code.startsWith("AAAA")).map((e) => [e.aankoopprijs, e.aankoopbron]), [[7, "privé"], [7, "privé"], [7, "privé"]]);
  const geboekt = op.transacties.find((x) => x.id === t.id)!;
  assert.equal(boeking(geboekt).inbreng, 21);
  const vandaagStr = dagVan(new Date().toISOString());
  const gisterenStr = dagVan(gisteren);
  const eigen = op.exemplaren.filter((e) => e.code.startsWith("AAAA"));
  assert.equal(voorraadOp(gisterenStr, eigen, [], op.transacties).lijnen.length, 0, "vóór de inbreng nog niet in de zaak");
  assert.equal(voorraadOp(vandaagStr, eigen, [], op.transacties).totaal, 21);
  assert.equal(st.magOngedaan(geboekt), true, "vandaag mag het nog");
  // Nog eens inbrengen (bv. op een tweede gsm): een conflict, geen tweede kost.
  const nogEens = st.inbrengBestaand([regelInbreng(st.huidig().exemplaren.find((e) => e.code === "AAAA01")!, 9, 10, null, 90)]);
  assert.equal(nogEens.status, "conflict");
  await leeg();
  op = await server.laadAlles();
  assert.equal(op.transacties.find((x) => x.id === nogEens.id)!.status, "conflict", "ook op de server");
  assert.equal(op.exemplaren.find((e) => e.code === "AAAA01")!.aankoopprijs, 7);
  assert.equal(st.magOngedaan(geboekt, new Date(Date.now() + 2 * 86400000).toISOString()), false, "een andere dag niet meer");

  // Ongedaan: de vorige aankoopgegevens komen terug.
  st.ongedaanMaken(t.id);
  await leeg();
  op = await server.laadAlles();
  assert.deepEqual(op.exemplaren.filter((e) => e.code.startsWith("AAAA")).map((e) => [e.aankoopprijs, e.aankoopbron]), [[null, "eigen collectie"], [null, "eigen collectie"], [null, "eigen collectie"]]);
  assert.equal(op.transacties.find((x) => x.id === t.id)!.status, "ongedaan");

  // Artikels: met de hand bijtellen komt in de tellingen; een formulier dat al open stond wist ze niet.
  const binder = st.huidig().artikelen.find((a) => a.naam === "Binder")!;
  const oudFormulier = { ...(binder.details ?? {}), type: "binder" as const };
  st.wijzigArtikel(binder.id, { aantal: 9 }, undefined, "bijgekocht");
  st.wijzigArtikel(binder.id, { naam: "Binder Gengar", details: oudFormulier });
  await leeg();
  const a = (await server.laadAlles()).artikelen.find((x) => x.id === binder.id)!;
  assert.equal(a.aantal, 9);
  assert.deepEqual(a.details?.tellingen?.map((x) => [x.delta, x.reden]), [[5, "bijgekocht"]]);
  assert.equal(a.details?.type, "binder");
  // Op gisteren lagen er 4 (de 5 kwamen er vandaag bij).
  assert.equal(voorraadOp(gisterenStr, [], [{ ...a, aangemaakt_op: gisteren }], []).totaal, 72);

  // De kopie voor offline: de voorraad en wat recent gebeurde.
  const k = st.kopieVan({ exemplaren: op.exemplaren, artikelen: [a], beurzen: [], transacties: op.transacties });
  assert.equal(k.exemplaren.filter((e) => e.code.startsWith("AAAA")).length, 3);
  assert.equal(st.kopieVan({ exemplaren: [], artikelen: [], beurzen: [], transacties: op.transacties }, Date.now() + 200 * 86400000).transacties.length, 0, "na 120 dagen niet meer in de kopie");
});

test("meer foto's per artikel, de etalage en aanvragen: meteen op de gsm, later (ook na offline) op de server", async () => {
  const { server, proxy, status } = nepServer();
  const leeg = async () => { for (let i = 0; i < 200 && st.huidig().wachtrij; i++) await wacht(20); await wacht(30); assert.equal(st.huidig().wachtrij, 0, "alles doorgestuurd"); };
  const [F1, F2, F3] = ["AAAA", "BBBB", "CCCC"].map((x) => `data:image/jpeg;base64,${x}`);
  await server.voegArtikelenToe([{ naam: "Binder Fototest", soort: "eigen product", aantal: 2, prijs: 45, details: { type: "binder" } }]);
  await st.__testGebruik(proxy);
  const id = st.huidig().artikelen.find((x) => x.naam === "Binder Fototest")!.id;
  const nu = () => st.huidig().artikelen.find((x) => x.id === id)!;
  assert.equal(st.kanEtalage(), true);

  status.offline = true;
  st.voegArtikelfotoToe(nu(), F1); // de eerste wordt de hoofdfoto
  assert.equal(nu().foto, F1);
  st.voegArtikelfotoToe(nu(), F2);
  st.voegArtikelfotoToe(nu(), F3);
  assert.deepEqual(st.artikelfotosVan(id).map((f) => f.foto), [F2, F3]);
  st.maakHoofdfoto(nu(), st.artikelfotosVan(id)[1]); // F3 wordt de hoofdfoto, F1 komt op haar plaats
  assert.equal(nu().foto, F3);
  assert.deepEqual(st.artikelfotosVan(id).map((f) => f.foto), [F2, F1]);
  st.verwijderArtikelfoto(st.artikelfotosVan(id)[0]);
  assert.deepEqual(st.artikelfotosVan(id).map((f) => f.foto), [F1]);

  // Vooraan (de waaier): achteraan de rij erbij.
  st.voegEtalagefotoToe(st.nieuweEtalagefoto(F2, "voorpagina"));
  st.voegEtalagefotoToe(st.nieuweEtalagefoto(F3, "voorpagina"));
  const e = st.etalageLijst("voorpagina")![0];
  assert.equal(st.wijzigEtalagefoto(e, { link: "javascript:alert(1)" }), false, "enkel gewone links");
  assert.equal(st.wijzigEtalagefoto(e, { titel: "  Gengar op zwart ", link: "www.instagram.com/p/abc" }), true);
  st.schuifEtalagefoto(e, 1);
  assert.deepEqual(st.etalageLijst("voorpagina")!.map((x) => x.foto), [F3, F2]);
  // De Instagram-strook: apart, en het nieuwste bericht bovenaan.
  st.voegEtalagefotoToe(st.nieuweEtalagefoto(F1, "instagram"));
  st.voegEtalagefotoToe(st.nieuweEtalagefoto(F2, "instagram"));
  assert.deepEqual(st.etalageLijst("instagram")!.map((x) => x.foto), [F2, F1]);
  assert.equal(st.etalageLijst("voorpagina")!.length, 2, "niet door elkaar");
  st.schuifEtalagefoto(st.etalageLijst("instagram")![1], -1);
  assert.deepEqual(st.etalageLijst("instagram")!.map((x) => x.foto), [F1, F2]);
  assert.deepEqual(st.etalageLijst("voorpagina")!.map((x) => x.foto), [F3, F2], "schuiven blijft binnen de strook");

  await wacht(50);
  assert.ok(st.huidig().wachtrij >= 7, "alles wacht op internet");
  status.offline = false;
  assert.equal(await st.spoel(), true);
  await leeg();
  assert.equal((await server.laadAlles()).artikelen.find((x) => x.id === id)!.foto, F3);
  assert.deepEqual((await server.laadArtikelfotos([id])).map((f) => f.foto), [F1], "de server heeft dezelfde extra foto's");
  const etalage = (await server.laadEtalage()).filter((x) => x.plek === "voorpagina");
  assert.deepEqual(etalage.map((x) => [x.foto, x.titel, x.link]), [[F3, null, null], [F2, "Gengar op zwart", "https://www.instagram.com/p/abc"]]);
  assert.deepEqual((await server.laadEtalage()).filter((x) => x.plek === "instagram").map((x) => x.foto), [F1, F2]);
  // Online: een titel aanpassen stuurt de foto niet opnieuw mee.
  st.wijzigEtalagefoto(st.etalageLijst("voorpagina")![0], { titel: "Pikachu" });
  await leeg();
  assert.equal((await server.laadEtalage()).find((x) => x.plek === "voorpagina")!.titel, "Pikachu");

  // Een aanvraag van de klantenpagina (in de demo: dezelfde opslag)
  const d = JSON.parse(localStorage.getItem("bindr-demo-v1") || "{}");
  d.aanvragen = [{ id: "aanvraag-1", naam: "Lotte", email: "lotte@voorbeeld.be", idee: "Mijn logo", status: "nieuw", aangemaakt_op: new Date().toISOString(), artwork: F1 }];
  localStorage.setItem("bindr-demo-v1", JSON.stringify(d));
  await st.laadAanvragen();
  assert.equal(st.huidig().aanvragen?.length, 1);
  assert.equal(st.huidig().aanvragen![0].artwork, undefined, "de lijst zonder afbeeldingen");
  assert.equal((await st.laadAanvraagBeelden("aanvraag-1")).artwork, F1);
  st.zetAanvraagStatus("aanvraag-1", "beantwoord");
  await leeg();
  assert.equal((await server.laadAanvragen())[0].status, "beantwoord");
  st.verwijderAanvraag("aanvraag-1");
  assert.equal(st.huidig().aanvragen?.length, 0);
  await leeg();
  assert.equal((await server.laadAanvragen()).length, 0, "ook weg op de server");
});

test("thema's: meteen op de gsm, later op de server, en het logo maar één keer", async () => {
  const { server, proxy, status } = nepServer();
  const leeg = async () => { for (let i = 0; i < 200 && st.huidig().wachtrij; i++) await wacht(20); await wacht(30); assert.equal(st.huidig().wachtrij, 0, "alles doorgestuurd"); };
  const verstuurd: { logo?: string | null }[] = [];
  const echt = server.bewaarThema.bind(server);
  server.bewaarThema = async (t) => { verstuurd.push(t); return echt(t); };
  await st.__testGebruik(proxy);
  assert.equal(st.kanThema(), true);
  await st.laadThemas();
  assert.deepEqual(st.themaLijst(), []);

  const LOGO = "data:image/png;base64,AAAA";
  status.offline = true;
  st.bewaarThema({ id: "halloween", naam: "Halloween", van: "10-15", tot: "11-01", aan: "periode", kleur: "#e8772e", tekst: "  Boe!  ", logo: LOGO });
  st.bewaarThema({ id: "halloween", naam: "Halloween", van: "10-20", tot: "11-01", aan: "aan", kleur: "#e8772e", tekst: "Boe!" }); // zonder logo
  const lokaal = st.themaLijst()!.find((t) => t.id === "halloween")!;
  assert.deepEqual([lokaal.van, lokaal.aan, lokaal.tekst, lokaal.logo], ["10-20", "aan", "Boe!", LOGO], "meteen op de gsm, het logo blijft");

  await wacht(50);
  assert.ok(st.huidig().wachtrij >= 1, "wacht op internet");
  status.offline = false;
  assert.equal(await st.spoel(), true);
  await leeg();
  const t = (await server.laadThemas()).find((x) => x.id === "halloween")!;
  assert.deepEqual([t.van, t.aan, t.tekst, t.logo], ["10-20", "aan", "Boe!", LOGO]);

  // Online enkel de datum: het logo gaat niet opnieuw mee, maar blijft op de server.
  const voor = verstuurd.length;
  st.bewaarThema({ ...t, van: "10-25", logo: undefined });
  await leeg();
  assert.equal(verstuurd.length, voor + 1);
  assert.equal(verstuurd.at(-1)!.logo, undefined);
  assert.equal((await server.laadThemas())[0].logo, LOGO);
  assert.equal((await server.laadThemas())[0].van, "10-25");
  // Het gewone logo terug.
  st.bewaarThema({ ...t, logo: null });
  await leeg();
  assert.equal((await server.laadThemas())[0].logo, null);
});
