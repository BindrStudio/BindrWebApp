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
