// Labels printen van begin tot einde, met de ECHTE Niimbot-driver (public/vendor/niimbot.js, ongewijzigd)
// en onze Fichero-driver, tegen nagebootste printers via nagebootste Web Bluetooth: een Niimbot B1 Pro en
// een Fichero liggen samen "in de kamer". Het Bluetooth-venster toont, zoals echt, enkel printers waarvan de
// naam past. De nagebootste B1 Pro antwoordt zoals de echte (model 4097, donkerte, labeltype, start, pagina,
// status, einde) en zet de beeldrijen terug in elkaar, zodat we zien wat er op het label komt.
// Kijkt na: printen vanuit een kaart (met de printer en de afstelling erbij), wisselen naar de Fichero en terug,
// elke printer zijn eigen afstelling, en een duidelijke melding als deze gsm een printer zoekt die er niet is.
//   npm run serve            (in een ander venster: http://localhost:8080)
//   node tests/e2e/printen.cjs [map-voor-screenshots]
const { chromium, devices } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

const BASIS = process.env.BASIS || "http://localhost:8080/";
const SHOTS = path.resolve(process.argv[2] || ".tests/shots-printen");
fs.mkdirSync(SHOTS, { recursive: true });

// Draait in de pagina vóór de app: de kamer met twee printers en navigator.bluetooth.
function kamer() {
  const NIIM_SVC = "e7810a71-73ae-499d-8c15-faa9aef0c3f2";
  const NIIM_CHAR = "bef8d6c9-9c21-4c9e-b632-bd58c1009f9f";
  const lang = (k) => `0000${k}-0000-1000-8000-00805f9b34fb`;
  const melding = (kenmerk, bytes) => setTimeout(() => {
    kenmerk.value = new DataView(Uint8Array.from(bytes).buffer);
    kenmerk.dispatchEvent(new Event("characteristicvaluechanged"));
  }, 3);
  const frame = (cmd, data) => {
    let crc = cmd ^ data.length;
    for (const d of data) crc ^= d;
    return [0x55, 0x55, cmd, data.length, ...data, crc & 0xff, 0xaa, 0xaa];
  };
  const toestel = (naam, gatt) => Object.assign(new EventTarget(), { name: naam, gatt });

  // ── Niimbot B1 Pro (300 dpi, model 4097) ──
  const niim = { aan: true, verbindingen: 0, paginas: [], log: [], donkerte: null, labeltype: null, bezig: null, geprint: 0 };
  const niimLees = Object.assign(new EventTarget(), { properties: { write: true, writeWithoutResponse: true, notify: true }, value: null });
  const antwoord = (cmd, data) => melding(niimLees, frame(cmd, data));
  const ontvang = (bytes) => {
    for (let i = 0; i + 6 < bytes.length;) {
      if (bytes[i] !== 0x55 || bytes[i + 1] !== 0x55) { i++; continue; }
      const cmd = bytes[i + 2], len = bytes[i + 3], d = bytes.slice(i + 4, i + 4 + len);
      i += 7 + len;
      niim.log.push(cmd);
      if (cmd === 0xa5) antwoord(0xb5, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 2]);
      else if (cmd === 0x40) antwoord(0x48, d[0] === 0x08 ? [0x10, 0x01] : [0x50]);
      else if (cmd === 0x21) { niim.donkerte = d[0]; antwoord(0x31, [1]); }
      else if (cmd === 0x23) { niim.labeltype = d[0]; antwoord(0x33, [1]); }
      else if (cmd === 0x01) antwoord(0x02, [1]);
      else if (cmd === 0x03) antwoord(0x04, [1]);
      else if (cmd === 0x13) {
        const H = (d[0] << 8) | d[1], W = (d[2] << 8) | d[3];
        niim.bezig = { H, W, rijen: new Array(H).fill(null) };
        antwoord(0x14, [1]);
      } else if (cmd === 0x84 || cmd === 0x85) {
        const r = (d[0] << 8) | d[1];
        const run = cmd === 0x84 ? d[2] : d[5];
        const rij = cmd === 0x84 ? [] : d.slice(6);
        for (let k = 0; k < run && niim.bezig && r + k < niim.bezig.H; k++) niim.bezig.rijen[r + k] = rij;
      } else if (cmd === 0xe3) {
        if (niim.bezig) niim.paginas.push(niim.bezig);
        niim.bezig = null;
        niim.geprint++;
        antwoord(0xe4, [1]);
      } else if (cmd === 0xa3) antwoord(0xb3, [0, niim.geprint & 0xff, 100, 100]);
      else if (cmd === 0xf3) { niim.geprint = 0; antwoord(0xf4, [1]); }
    }
  };
  const niimSchrijf = { properties: { write: true, writeWithoutResponse: true, notify: true },
    writeValueWithoutResponse: async (v) => ontvang([...new Uint8Array(v.buffer || v, v.byteOffset || 0, v.byteLength)]),
    writeValueWithResponse: async (v) => ontvang([...new Uint8Array(v.buffer || v, v.byteOffset || 0, v.byteLength)]) };
  // De driver gebruikt één kenmerk om te schrijven en te luisteren.
  Object.assign(niimLees, niimSchrijf, { startNotifications: async () => niimLees });
  const niimGatt = {
    connected: false,
    connect: async () => { niim.verbindingen++; niimGatt.connected = true; return niimGatt; },
    disconnect: () => { niimGatt.connected = false; niimToestel.dispatchEvent(new Event("gattserverdisconnected")); },
    getPrimaryService: async (u) => {
      if (u !== NIIM_SVC) throw new DOMException("No Services matching UUID found in Device.", "NotFoundError");
      return { getCharacteristic: async (c) => { if (c !== NIIM_CHAR) throw new DOMException("No Characteristics matching UUID", "NotFoundError"); return niimLees; } };
    },
  };
  const niimToestel = toestel("B1-H117A2B3C4", niimGatt);

  // ── Fichero (Action, AiYin D11s) ──
  const fich = { aan: true, verbindingen: 0, writes: [] };
  const fLees = Object.assign(new EventTarget(), { properties: { notify: true }, value: null });
  fLees.startNotifications = async () => fLees;
  const eq = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
  const fSchrijf = {
    properties: { writeWithoutResponse: true },
    writeValueWithoutResponse: async (v) => {
      const b = [...new Uint8Array(v.buffer, v.byteOffset, v.byteLength)];
      fich.writes.push(b);
      if (eq(b, [0x10, 0xff, 0x40])) melding(fLees, [0x00]);
      else if (b.length === 5 && eq(b.slice(0, 4), [0x10, 0xff, 0x10, 0x00])) melding(fLees, [0x4f, 0x4b]);
      else if (eq(b, [0x10, 0xff, 0xfe, 0x45])) melding(fLees, [0x4f, 0x4b]);
    },
    writeValue: async () => { throw new Error("niet zonder antwoord geschreven"); },
  };
  const fGatt = {
    connected: false,
    connect: async () => { fich.verbindingen++; fGatt.connected = true; return fGatt; },
    disconnect: () => { fGatt.connected = false; },
    getPrimaryService: async (u) => {
      if (u !== lang("18f0")) throw new DOMException("No Services matching UUID found in Device.", "NotFoundError");
      return { getCharacteristic: async (c) => (c.includes("2af1") ? fSchrijf : fLees) };
    },
  };
  const fToestel = toestel("FICHERO_5836", fGatt);

  // ── Het Bluetooth-venster: de eerste printer die aanstaat en waarvan de naam past ──
  const kiezer = { vragen: [] };
  const past = (t, o) => o.acceptAllDevices || (o.filters || []).some((f) => f.namePrefix && t.name.startsWith(f.namePrefix));
  Object.defineProperty(Navigator.prototype, "bluetooth", {
    configurable: true,
    get: () => ({
      requestDevice: async (o) => {
        kiezer.vragen.push((o.filters || []).map((f) => f.namePrefix || "?"));
        const kandidaten = [[niim, niimToestel], [fich, fToestel]].filter(([p, t]) => p.aan && past(t, o));
        if (!kandidaten.length) throw new DOMException("User cancelled the requestDevice() chooser.", "NotFoundError");
        return kandidaten[0][1];
      },
    }),
  });
  window.__kamer = { niim, fich, kiezer, slaap: () => niimGatt.disconnect() };
  localStorage.setItem("bindr-modus", "demo");
}

(async () => {
  const browser = await chromium.launch();
  const fouten = [];
  for (const [naam, toestel] of [["iphone", devices["iPhone 13"]], ["android", devices["Pixel 7"]]]) {
    const ctx = await browser.newContext({ ...toestel, locale: "nl-BE" });
    await ctx.addInitScript(kamer);
    const page = await ctx.newPage();
    page.on("pageerror", (e) => fouten.push(`${naam}: ${e.message}`));
    const sheet = () => page.locator(".sheet").last();
    const wacht = (ms = 300) => page.waitForTimeout(ms);
    const foto = (n) => page.screenshot({ path: path.join(SHOTS, `${naam}-${n}.png`) });
    const stap = (t) => { globalThis.laatsteStap = `${naam}: ${t}`; console.log("·", naam, t); };
    const k = () => page.evaluate(() => {
      const { niim, fich, kiezer } = window.__kamer;
      const p = niim.paginas.map((x) => ({ H: x.H, W: x.W, gevuld: x.rijen.filter((r) => r !== null).length, eersteZwart: x.rijen.findIndex((r) => r && r.some((b) => b)) }));
      return { niimVerbindingen: niim.verbindingen, paginas: p, donkerte: niim.donkerte, labeltype: niim.labeltype, fichVerbindingen: fich.verbindingen, fichWrites: fich.writes.length, vragen: kiezer.vragen };
    });
    const melding = (re) => page.locator(".melding, .toast, [role=status]", { hasText: re }).first().waitFor({ timeout: 20000 }).catch(() => page.getByText(re).first().waitFor({ timeout: 20000 }));
    const kaart = async (code) => {
      await page.locator(".tabbalk button").filter({ hasText: "Scan" }).click();
      await page.getByLabel("Code typen").fill(code);
      await page.locator(".scan-item", { hasText: code }).first().locator(".scan-rij-knop").first().click();
      await sheet().locator(".sheet-titel", { hasText: code }).waitFor();
      await sheet().locator(".printer-details").scrollIntoViewIfNeeded();
    };
    const wachtPaginas = (n) => page.waitForFunction((n) => window.__kamer.niim.paginas.length === n, n, { timeout: 30000 });
    const sluitAlles = async () => { for (let i = 0; i < 3; i++) { await page.keyboard.press("Escape"); await wacht(120); } };
    // De beeldrijen die de B1 Pro kreeg, als afbeelding (om te bekijken).
    const labelPng = async (i, bestand) => {
      const url = await page.evaluate((i) => {
        const p = window.__kamer.niim.paginas[i];
        const c = document.createElement("canvas"); c.width = p.W; c.height = p.H;
        const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, p.W, p.H); x.fillStyle = "#000";
        p.rijen.forEach((r, y) => { if (r) r.forEach((b, j) => { for (let bit = 0; bit < 8; bit++) if (b & (0x80 >> bit)) x.fillRect(j * 8 + bit, y, 1, 1); }); });
        return c.toDataURL("image/png");
      }, i);
      fs.writeFileSync(path.join(SHOTS, `${naam}-${bestand}`), Buffer.from(url.split(",")[1], "base64"));
    };

    stap("demo met de testset");
    await page.goto(BASIS + "beheer.html");
    await page.locator(".tabbalk").waitFor();
    assert.ok(await page.evaluate(() => !!window.Niimbot && typeof window.Niimbot.printImage === "function"), "de echte Niimbot-driver is geladen");
    await page.getByRole("button", { name: "Instellingen" }).click();
    await sheet().getByText("Testset inladen").click();
    await page.getByText(/exemplaren en \d+ artikelen ingeladen/).waitFor();
    await sluitAlles();

    stap("printen vanuit een kaart: de kaart zegt met welke printer (standaard de Niimbot)");
    await kaart("FMX-FSF");
    const samen = sheet().locator(".printer-details > summary");
    assert.match(await samen.innerText(), /^Niimbot · 50 × 15 mm · donkerte 3/);
    await sheet().getByRole("button", { name: "Print label" }).click();
    await wachtPaginas(1);
    await melding(/Label geprint/);
    let s = await k();
    assert.deepEqual(s.vragen[0], ["B1"], "het venster zoekt enkel een Niimbot B1");
    assert.equal(s.niimVerbindingen, 1);
    assert.equal(s.paginas.length, 1);
    assert.deepEqual([s.paginas[0].W, s.paginas[0].H, s.paginas[0].gevuld], [576, 177, 177], "een volledig label van 50 × 15 mm op 300 dpi, elke rij ontvangen");
    assert.deepEqual([s.donkerte, s.labeltype], [3, 1]);
    assert.ok(s.paginas[0].eersteZwart >= 0, "er staat iets op het label");
    await labelPng(0, "niimbot-1.png");
    await sheet().locator(".printer-details > summary", { hasText: "Niimbot B1 Pro · verbonden" }).waitFor();
    await foto("1-kaart-niimbot");

    stap("in de kaart naar de Fichero wisselen en printen");
    await samen.click();
    await sheet().locator(".printer-details .printerkeuze .chip", { hasText: "Fichero" }).click();
    await melding(/Deze gsm print nu op de Fichero/);
    assert.match(await samen.innerText(), /^Fichero · 30 × 14 mm · normaal/);
    await sheet().locator(".printer-details .fichero-uitleg summary").click();
    assert.match(await sheet().locator(".printer-details .fichero-uitleg").innerText(), /Fichero Printer/);
    await sheet().locator(".printer-details .fichero-uitleg summary").click();
    await foto("2-kaart-fichero");
    await sheet().getByRole("button", { name: "Print label" }).click();
    await page.waitForFunction(() => window.__kamer.fich.writes.some((b) => b.length === 4 && b[0] === 0x10 && b[3] === 0x45), null, { timeout: 30000 });
    await melding(/Label geprint/);
    s = await k();
    assert.equal(s.vragen.length, 2);
    assert.ok(s.vragen[1].includes("FICHERO") && !s.vragen[1].includes("B1"), "het venster zoekt nu een Fichero");
    assert.equal(s.fichVerbindingen, 1);
    assert.ok(s.fichWrites > 20, "de Fichero kreeg het label");
    assert.equal(s.paginas.length, 1, "niets naar de Niimbot");

    stap("terug naar de Niimbot: printen gaat weer naar de Niimbot");
    await sheet().locator(".printer-details .printerkeuze .chip", { hasText: "Niimbot" }).click();
    await melding(/Deze gsm print nu op de Niimbot/);
    assert.match(await samen.innerText(), /^Niimbot · 50 × 15 mm · donkerte 3/);
    await sheet().getByRole("button", { name: "Print label" }).click();
    await wachtPaginas(2);
    await melding(/Label geprint/);
    s = await k();
    assert.equal(s.paginas.length, 2);
    assert.deepEqual([s.paginas[1].W, s.paginas[1].H, s.paginas[1].gevuld, s.donkerte], [576, 177, 177, 3]);
    const eersteZonder = s.paginas[1].eersteZwart;

    stap("elke printer zijn eigen afstelling: de Niimbot 0,5 mm lager, de Fichero licht");
    await sheet().locator(".printer-details .afstellen:not(.fichero-uitleg) > summary").click();
    await sheet().locator(".printer-details .afstellen").getByRole("button", { name: "Lager" }).click();
    await sheet().locator(".printer-details .afstel-schuif strong", { hasText: "0,5 mm lager" }).waitFor();
    await sheet().locator(".printer-details .printerkeuze .chip", { hasText: "Fichero" }).click();
    await sheet().locator(".printer-details .afstel-schuif strong", { hasText: /^0 mm$/ }).waitFor();
    await sheet().locator(".printer-details .afstellen .chip", { hasText: "Licht" }).click();
    await sheet().locator(".printer-details .printerkeuze .chip", { hasText: "Niimbot" }).click();
    await sheet().locator(".printer-details .afstel-schuif strong", { hasText: "0,5 mm lager" }).waitFor();
    assert.equal(await sheet().locator(".printer-details .afstellen .chip.aan").innerText(), "3 · standaard", "de Niimbot bleef op donkerte 3");
    await foto("3-kaart-afstellen");
    await sheet().getByRole("button", { name: "Print label" }).click();
    await wachtPaginas(3);
    await melding(/Label geprint/);
    s = await k();
    assert.equal(s.paginas.length, 3);
    assert.equal(s.donkerte, 3);
    assert.equal(s.paginas[2].eersteZwart - eersteZonder, 6, "0,5 mm lager = 6 rijen op 300 dpi");
    await labelPng(2, "niimbot-lager.png");

    stap("de Niimbot viel in slaap (de verbinding is weg): Print verbindt opnieuw en print");
    const verbindingenVoor = (await k()).niimVerbindingen;
    await page.evaluate(() => window.__kamer.slaap());
    await sheet().getByRole("button", { name: "Print label" }).click();
    await page.waitForFunction(() => window.__kamer.niim.paginas.length === 4, null, { timeout: 30000 });
    await melding(/Label geprint/);
    s = await k();
    assert.equal(s.niimVerbindingen, verbindingenVoor + 1, "opnieuw verbonden");
    assert.equal(s.paginas.length, 4);
    assert.deepEqual([s.paginas[3].gevuld, s.paginas[3].eersteZwart - eersteZonder], [177, 6], "met de afstelling van de Niimbot");

    stap("de Niimbot staat uit: een duidelijke melding, met de andere printer als knop");
    await page.evaluate(() => { window.__kamer.niim.aan = false; });
    await sheet().locator(".printer-details").getByRole("button", { name: "Loskoppelen" }).click();
    await sheet().getByRole("button", { name: "Print label" }).click();
    await melding(/Geen Niimbot gekozen\. Deze gsm zoekt een Niimbot/);
    await foto("4-geen-niimbot");
    await page.evaluate(() => { window.__kamer.niim.aan = true; });
    await sluitAlles();

    stap("Labels (vanuit Instellingen): hetzelfde blok; proeflabel en randtest op de Niimbot");
    await page.getByRole("button", { name: "Instellingen" }).click();
    await sheet().getByRole("button", { name: /Printer verbinden, proeflabel en afstellen/ }).click();
    await sheet().locator(".printerkeuze .chip.aan", { hasText: "Niimbot" }).waitFor();
    await sheet().getByRole("button", { name: "Verbinden" }).click();
    await melding(/Niimbot B1 Pro verbonden/);
    await sheet().locator(".afstellen:not(.fichero-uitleg) > summary").click();
    await sheet().getByRole("button", { name: "Proeflabel" }).click();
    await wachtPaginas(5);
    await melding(/Proeflabel geprint/);
    await sheet().getByRole("button", { name: "Randtest" }).click();
    await wachtPaginas(6);
    await melding(/Randtest geprint/);
    s = await k();
    assert.equal(s.paginas.length, 6);
    assert.ok(s.paginas.slice(4).every((p) => p.W === 576 && p.H === 177 && p.gevuld === 177));
    await labelPng(5, "niimbot-randtest.png");

    stap("Labels › Te printen: drie labels in één opdracht");
    const teVoor = Number((await sheet().locator(".segment button", { hasText: "Te printen" }).innerText()).match(/\d+/)[0]);
    assert.ok(teVoor >= 3, "de testset heeft labels te printen");
    await sheet().getByRole("button", { name: "Niets kiezen" }).click();
    for (let i = 0; i < 3; i++) await sheet().locator(".labelrij .vink").nth(i).click();
    await sheet().getByRole("button", { name: "Print 3 labels" }).click();
    await wachtPaginas(9);
    await melding(/3 labels geprint/);
    s = await k();
    assert.equal(s.paginas.length, 9, "drie pagina's erbij");
    assert.ok(s.paginas.slice(6).every((p) => p.W === 576 && p.H === 177 && p.gevuld === 177 && p.eersteZwart >= 0));
    await sheet().locator(".segment button", { hasText: `Te printen ${teVoor - 3}` }).waitFor();
    await labelPng(8, "niimbot-reeks-3.png");
    const breed = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(breed <= 0, "niets steekt uit");
    await foto("5-labels");

    stap("na herladen: de keuze en de afstelling blijven op deze gsm");
    await page.reload();
    await page.locator(".tabbalk").waitFor();
    await kaart("FMX-FSF");
    assert.match(await sheet().locator(".printer-details > summary").innerText(), /^Niimbot · 50 × 15 mm · donkerte 3 · 0,5 mm lager/);
    await sheet().getByRole("button", { name: "Print label" }).click();
    await wachtPaginas(1);
    await melding(/Label geprint/);
    s = await k();
    // Na herladen is de oude pagina weg (nieuwe kamer): de eerste pagina in deze sessie.
    assert.equal(s.paginas.length, 1);
    assert.deepEqual([s.paginas[0].W, s.paginas[0].H, s.paginas[0].gevuld], [576, 177, 177]);

    // ── Twee labels onder elkaar per strook (Niimbot T50*15/2R-460: een strook van 50 × 30 = 2 × 50 × 15) ──
    // Zwarte pixels in het bovenste en het onderste label van een strook, en in een rij.
    const helften = (i) => page.evaluate((i) => {
      const p = window.__kamer.niim.paginas[i];
      const tel = (a, b) => { let n = 0; p.rijen.slice(a, b).forEach((r) => { if (r) for (const byte of r) for (let v = byte; v; v >>= 1) n += v & 1; }); return n; };
      return [tel(0, 177), tel(177, 354)];
    }, i);
    const rij = (i, y) => page.evaluate(([i, y]) => { const r = window.__kamer.niim.paginas[i].rijen[y]; let n = 0; if (r) for (const byte of r) for (let v = byte; v; v >>= 1) n += v & 1; return n; }, [i, y]);
    const strook = async (i) => { const p = (await k()).paginas[i]; assert.deepEqual([p.W, p.H, p.gevuld], [576, 354, 354], "een strook van 50 × 30 mm"); };

    stap("twee onder elkaar: de rol kiezen in de kaart; één label komt bovenaan, het onderste blijft leeg");
    await sheet().locator(".printer-details > summary").click();
    await sheet().locator(".printer-details .maatkeuze:not(.printerkeuze) .chip", { hasText: "2 onder elkaar" }).click();
    await sheet().locator(".printer-details", { hasText: "Twee labels onder elkaar op één strook van 30 mm" }).waitFor();
    assert.match(await sheet().locator(".printer-details > summary").innerText(), /^Niimbot B1 Pro · verbonden · 2 onder elkaar · donkerte 3 · 0,5 mm lager/);
    const voorbeeld = await sheet().locator(".label-voorbeeld").evaluate((img) => [img.naturalWidth, img.naturalHeight]);
    assert.deepEqual(voorbeeld, [576, 177], "het voorbeeld is één gewoon label van 50 × 15 mm");
    const tip = sheet().locator(".strook-tip");
    assert.match(await tip.innerText(), /dit label komt bovenaan, het onderste blijft leeg/);
    await sheet().getByRole("button", { name: "Print label" }).click();
    await wachtPaginas(2);
    await melding(/bovenaan de strook \(het onderste blijft leeg\)/);
    await strook(1);
    let h = await helften(1);
    assert.ok(h[0] > 3000 && h[1] === 0, `bovenaan het label, onderaan leeg (${h})`);
    await labelPng(1, "duo-1-boven.png");

    stap("twee onder elkaar: in de kaart samen met een kaart die ook op een label wacht");
    const samenKnop = tip.getByRole("button", { name: /^Samen met .+ op één strook$/ });
    assert.match(await samenKnop.innerText(), /^Samen met .+ \([0-9A-Z]{3}-[0-9A-Z]{3}\) op één strook$/);
    await samenKnop.click();
    await wachtPaginas(3);
    await melding(/2 labels geprint op één strook/);
    h = await helften(2);
    assert.ok(h[0] > 3000 && h[1] > 3000, `twee labels op één strook (${h})`);
    await labelPng(2, "duo-2-samen.png");
    await foto("6-duo-kaart");

    stap("twee onder elkaar: proeflabel op allebei, randtest met een kader per label");
    await sheet().locator(".printer-details .afstellen:not(.fichero-uitleg) > summary").click();
    await sheet().locator(".printer-details").getByRole("button", { name: "Proeflabel" }).click();
    await wachtPaginas(4);
    h = await helften(3);
    assert.ok(h[0] > 3000 && h[0] === h[1], `het proeflabel twee keer, boven en onder gelijk (${h})`);
    await sheet().locator(".printer-details").getByRole("button", { name: "Randtest" }).click();
    await wachtPaginas(5);
    await strook(4);
    // Deze gsm staat 0,5 mm lager (6 rijen): de bovenrand van het eerste kader op rij 6, de snede tussen
    // de kaders (onderrand van het eerste, bovenrand van het tweede) op rij 179–186.
    assert.deepEqual([await rij(4, 2) < 100, await rij(4, 7) > 500, await rij(4, 180) > 500, await rij(4, 184) > 500], [true, true, true, true]);
    await labelPng(4, "duo-randtest.png");

    stap("twee onder elkaar: 0,5 mm hoger zet de kaders terug op de snede");
    await sheet().locator(".printer-details .afstellen:not(.fichero-uitleg)").getByRole("button", { name: "Hoger" }).click();
    await sheet().locator(".printer-details .afstel-schuif strong", { hasText: /^0 mm$/ }).waitFor();
    await sheet().locator(".printer-details").getByRole("button", { name: "Randtest" }).click();
    await wachtPaginas(6);
    assert.deepEqual([await rij(5, 1) > 500, await rij(5, 175) > 500, await rij(5, 178) > 500, await rij(5, 352) > 500], [true, true, true, true]);
    await labelPng(5, "duo-randtest-0.png");
    await sheet().locator(".printer-details .afstellen:not(.fichero-uitleg)").scrollIntoViewIfNeeded();
    await foto("7-duo-afstellen");
    await sluitAlles();

    stap("twee onder elkaar: in Labels drie labels = twee strookjes, het laatste onderste label leeg");
    await page.getByRole("button", { name: "Instellingen" }).click();
    await sheet().getByRole("button", { name: /Printer verbinden, proeflabel en afstellen/ }).click();
    await sheet().getByRole("button", { name: "Niets kiezen" }).click();
    for (let i = 0; i < 3; i++) await sheet().locator(".labelrij .vink").nth(i).click();
    await sheet().locator(".onderbalk .strook-tip", { hasText: /3 labels = 2 strookjes: het onderste label van de laatste strook blijft leeg\./ }).waitFor();
    await foto("8-duo-labels");
    await sheet().getByRole("button", { name: "Print 3 labels" }).click();
    await wachtPaginas(8);
    await melding(/3 labels geprint op 2 strookjes/);
    const [h7, h8] = [await helften(6), await helften(7)];
    assert.ok(h7[0] > 3000 && h7[1] > 3000 && h8[0] > 3000 && h8[1] === 0, `twee vol, dan één bovenaan (${h7} / ${h8})`);
    await labelPng(6, "duo-3-strook1.png");
    await labelPng(7, "duo-3-strook2.png");
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth) <= 0, "niets steekt uit");
    await ctx.close();
  }
  assert.deepEqual(fouten, [], "geen JavaScript-fouten");
  await browser.close();
  console.log("Printen in orde (echte Niimbot-driver, nagebootste B1 Pro en Fichero). Screenshots in", SHOTS);
})().catch((e) => {
  console.error(e);
  if (process.env.GITHUB_ACTIONS) console.log(`::error title=${require("node:path").basename(__filename)}::${globalThis.laatsteStap ? `[${globalThis.laatsteStap}] ` : ""}${String(e && e.message || e).split("\n").filter(Boolean).slice(0, 4).join(" | ").replace(/[\r%]/g, " ")}`);
  process.exit(1);
});
