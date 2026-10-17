// Thema's op de klantenpagina: welk thema geldt op welke dag (ook over nieuwjaar heen).
import { test } from "node:test";
import assert from "node:assert/strict";
import { actiefThema, geldigeMaandDag, inPeriode, maandDagMooi, nieuwThema, THEMA_SOORTEN, themaActief, veiligeKleur, VORMEN } from "../src/lib/thema";
import type { Thema } from "../src/types";

const t = (id: string, van: string, tot: string, aan: Thema["aan"] = "periode"): Thema => ({ id, naam: id, van, tot, aan });

test("periode: gewoon en over nieuwjaar heen", () => {
  assert.equal(inPeriode("10-15", "11-01", "10-15"), true, "de eerste dag telt mee");
  assert.equal(inPeriode("10-15", "11-01", "11-01"), true, "de laatste dag telt mee");
  assert.equal(inPeriode("10-15", "11-01", "11-02"), false);
  assert.equal(inPeriode("10-15", "11-01", "10-14"), false);
  assert.equal(inPeriode("12-01", "01-06", "12-24"), true);
  assert.equal(inPeriode("12-01", "01-06", "01-03"), true);
  assert.equal(inPeriode("12-01", "01-06", "01-07"), false);
  assert.equal(inPeriode("12-01", "01-06", "11-30"), false);
  assert.equal(inPeriode(null, "01-06", "01-01"), false);
  assert.equal(inPeriode("13-01", "01-06", "01-01"), false, "een onmogelijke datum telt niet");
});

test("welk thema geldt: met de hand aan gaat voor, uit telt nooit", () => {
  const lijst = [t("kerst", "12-01", "01-06"), t("halloween", "10-15", "11-01")];
  assert.equal(actiefThema(lijst, "10-31")?.id, "halloween");
  assert.equal(actiefThema(lijst, "12-31")?.id, "kerst");
  assert.equal(actiefThema(lijst, "06-01"), null);
  assert.equal(actiefThema([t("halloween", "10-15", "11-01", "uit")], "10-31"), null);
  assert.equal(actiefThema([t("halloween", "10-15", "11-01"), t("zomer", "07-01", "08-31", "aan")], "10-31")?.id, "zomer", "met de hand aan wint");
  // Overlappende periodes: de volgorde van de soorten beslist (Halloween vóór kerst).
  assert.equal(actiefThema([t("kerst", "10-01", "01-06"), t("halloween", "10-15", "11-01")], "10-20")?.id, "halloween");
  assert.equal(themaActief(t("pasen", "03-20", "04-06", "aan"), "09-09"), true);
});

test("soorten, datums en kleuren", () => {
  for (const s of THEMA_SOORTEN) {
    assert.ok(geldigeMaandDag(s.van) && geldigeMaandDag(s.tot), s.id);
    assert.ok(veiligeKleur(s.kleur), s.id);
    for (const v of [...s.zweef, ...s.fonkel]) assert.ok(VORMEN[v], `${s.id}: ${v}`);
    assert.equal(nieuwThema(s).aan, "periode");
  }
  assert.equal(maandDagMooi("10-15"), "15 okt");
  assert.equal(maandDagMooi("01-06"), "6 jan");
  assert.equal(veiligeKleur("#E8772E"), "#e8772e");
  assert.equal(veiligeKleur("red"), null);
  assert.equal(veiligeKleur("#e8772e;background:url(x)"), null);
  assert.equal(geldigeMaandDag("02-29"), true);
  assert.equal(geldigeMaandDag("2-9"), false);
});

test("achtergrond weg: enkel wat met de rand verbonden is, de crème binnen een omlijning blijft", async () => {
  const { achtergrondWeg } = await import("../src/lib/eigenfoto");
  // 40 × 40 crème, met een donkere ring (dikte 3) rond een crème binnenkant (zoals de letters van ons logo).
  const w = 40, h = 40;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const r = Math.hypot(x - 20, y - 20);
    const ring = r >= 9 && r <= 12;
    const i = (y * w + x) * 4;
    const [cr, cg, cb] = ring ? [59, 42, 18] : [253, 244, 230 + ((x * 7 + y * 3) % 5)]; // een beetje ruis, zoals een JPEG
    data[i] = cr; data[i + 1] = cg; data[i + 2] = cb; data[i + 3] = 255;
  }
  const beeld = { width: w, height: h, data } as unknown as ImageData;
  assert.equal(achtergrondWeg(beeld), true);
  const alfa = (x: number, y: number) => data[(y * w + x) * 4 + 3];
  assert.equal(alfa(0, 0), 0, "de hoek is weg");
  assert.equal(alfa(3, 20), 0, "de achtergrond naast de ring is weg");
  assert.equal(alfa(20, 20), 255, "de crème binnen de ring blijft");
  assert.equal(alfa(20, 10), 255, "de ring blijft");
  // Een gewone foto (de rand is niet vlak): niets doen.
  const foto = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < foto.length; i += 4) { foto[i] = (i * 13) % 255; foto[i + 1] = (i * 7) % 255; foto[i + 2] = (i * 3) % 255; foto[i + 3] = 255; }
  assert.equal(achtergrondWeg({ width: w, height: h, data: foto } as unknown as ImageData), false);
  assert.ok(foto.every((v, i) => i % 4 !== 3 || v === 255), "niets doorzichtig gemaakt");
});
