import { test } from "node:test";
import assert from "node:assert/strict";
import { nieuweCode, normaliseerCode, qrInhoud, toonCode } from "../src/lib/code";

test("codes lezen zoals mensen ze typen of scannen", () => {
  assert.equal(normaliseerCode("BR:7K2QX9"), "7K2QX9");
  assert.equal(normaliseerCode("br:7k2-qx9"), "7K2QX9");
  assert.equal(normaliseerCode(" 0j6 8vc "), "0J68VC");
  assert.equal(normaliseerCode("OJ6-8VC"), "0J68VC"); // O wordt 0
  assert.equal(normaliseerCode("1L1-111"), "111111"); // L wordt 1
  assert.equal(normaliseerCode("ABC"), null);
  assert.equal(normaliseerCode("https://example.com"), null);
});

test("nieuwe codes zijn geldig en uniek, ook voor duplicaten", () => {
  const set = new Set<string>();
  for (let i = 0; i < 3000; i++) {
    const c = nieuweCode(set);
    assert.match(c, /^[0-9A-HJKMNP-TV-Z]{6}$/);
    assert.ok(!set.has(c));
    set.add(c);
  }
  assert.equal(toonCode("7K2QX9"), "7K2-QX9");
  assert.equal(qrInhoud("7K2QX9"), "BR:7K2QX9");
});
