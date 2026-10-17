// Uitknippen en rechtzetten (src/lib/uitknippen.ts): een binder op een fotobord met een verloop en een zachte schaduw,
// een scheve en schuin gefotografeerde binder, en wat niet rechtgezet mag worden (een rond ding, een rechte binder).
import { test } from "node:test";
import assert from "node:assert/strict";
import { achtergrondWeg, kader, rechtzetten, type Pixels } from "../src/lib/uitknippen";

/** Een beeld van w × h, met per pixel een kleur (of null = doorzichtig). */
function maak(w: number, h: number, kleur: (x: number, y: number) => [number, number, number] | null): Pixels {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const k = kleur(x + 0.5, y + 0.5);
    if (!k) continue;
    const i = (y * w + x) * 4;
    data[i] = k[0]; data[i + 1] = k[1]; data[i + 2] = k[2]; data[i + 3] = 255;
  }
  return { data, width: w, height: h };
}
const alfa = (d: Pixels, x: number, y: number) => d.data[(Math.round(y) * d.width + Math.round(x)) * 4 + 3];

/** Een binder van 160 × 220 met ronde hoeken (straal 14), grijs met een donkere rand en rechtsboven een rood vierkantje. */
function binder(u: number, v: number): [number, number, number] | null {
  if (u < 0 || v < 0 || u > 160 || v > 220) return null;
  const r = 14;
  const hx = u < r ? r : u > 160 - r ? 160 - r : u, hy = v < r ? r : v > 220 - r ? 220 - r : v;
  if (Math.hypot(u - hx, v - hy) > r) return null;
  if (u < 4 || v < 4 || u > 156 || v > 216) return [55, 55, 60]; // de rand (rits)
  if (u > 120 && u < 145 && v > 15 && v < 40) return [220, 30, 30];
  return [128, 128, 126];
}

test("achtergrond weg: een fotobord met een verloop en een zachte schaduw, de grijze binder blijft", () => {
  const w = 240, h = 300;
  const d = maak(w, h, (x, y) => {
    const b = binder(x - 40, y - 30);
    if (b) return b;
    // Lichtgrijs naar wit, met onder de binder een zachte schaduw.
    const grond = 214 + 38 * (x / w * 0.4 + y / h * 0.6);
    const schaduw = 26 * Math.exp(-(((x - 120) / 70) ** 2) - (((y - 252) / 9) ** 2));
    const g = grond - schaduw + ((x * 7 + y * 3) % 5) - 2; // wat ruis, zoals een JPEG
    return [g, g + 1, g - 4];
  });
  assert.equal(achtergrondWeg(d), true);
  assert.equal(alfa(d, 1, 1), 0, "de hoek is weg");
  assert.equal(alfa(d, w - 2, h - 2), 0, "het witte stuk ook");
  assert.equal(alfa(d, 120, 254), 0, "de schaduw onder de binder ook");
  assert.equal(alfa(d, 120, 140), 255, "de grijze binder blijft");
  assert.equal(alfa(d, 175, 60), 255, "het rode vierkantje blijft");
});

test("achtergrond weg: een gewone foto (de rand springt overal) blijft zoals ze is", () => {
  const d = maak(60, 60, (x, y) => [(x * 37 + y * 11) % 256, (x * 13 + y * 29) % 256, (x * 5 + y * 41) % 256]);
  assert.equal(achtergrondWeg(d), false);
  assert.ok(d.data.every((v, i) => i % 4 !== 3 || v === 255));
});

/** De binder 9° gedraaid en van onder gefotografeerd (boven smaller), op een doorzichtige achtergrond. */
function scheef(hoek: number, smaller: number): Pixels {
  const w = 300, h = 340, cx = 150, cy = 170, t = (hoek * Math.PI) / 180;
  return maak(w, h, (x, y) => {
    // Terugdraaien, dan de vertekening ongedaan maken (boven smaller: x schaalt mee met de hoogte).
    const X = (x - cx) * Math.cos(t) + (y - cy) * Math.sin(t), Y = -(x - cx) * Math.sin(t) + (y - cy) * Math.cos(t);
    const v = Y + 110;
    const k = 1 - smaller * (1 - v / 220);
    return binder(X / k + 80, v);
  });
}

test("rechtzetten: een scheve, schuin gefotografeerde binder staat daarna recht, met het rode vierkantje rechtsboven", () => {
  const r = rechtzetten(scheef(9, 0.1));
  assert.ok(r, "rechtgezet");
  const k = kader(r!, 128)!;
  assert.ok(Math.abs(k.w / k.h - 160 / 220) < 0.04, `verhouding ${k.w}×${k.h}`);
  // De linkerzijde is nu een verticale lijn, de bovenkant een horizontale.
  const eersteX = (y: number) => { let x = 0; while (x < r!.width && alfa(r!, x, y) <= 128) x++; return x; };
  const eersteY = (x: number) => { let y = 0; while (y < r!.height && alfa(r!, x, y) <= 128) y++; return y; };
  const xs = [0.3, 0.5, 0.7].map((f) => eersteX(k.y + f * k.h));
  const ys = [0.3, 0.5, 0.7].map((f) => eersteY(k.x + f * k.w));
  assert.ok(Math.max(...xs) - Math.min(...xs) <= 2, `links recht: ${xs}`);
  assert.ok(Math.max(...ys) - Math.min(...ys) <= 2, `boven recht: ${ys}`);
  // Het rode vierkantje: rechtsboven.
  let sx = 0, sy = 0, n = 0;
  for (let y = 0; y < r!.height; y++) for (let x = 0; x < r!.width; x++) {
    const i = (y * r!.width + x) * 4;
    if (r!.data[i + 3] > 200 && r!.data[i] > 180 && r!.data[i + 1] < 90) { sx += x; sy += y; n++; }
  }
  assert.ok(n > 300, "het vierkantje is er nog");
  assert.ok(sx / n > k.x + k.w * 0.65 && sy / n < k.y + k.h * 0.25, "rechtsboven");
});

test("rechtzetten: niets doen bij een binder die al recht staat, of iets dat geen rechthoek is", () => {
  assert.equal(rechtzetten(scheef(0, 0)), null, "staat al recht");
  const rond = maak(200, 200, (x, y) => (Math.hypot(x - 100, y - 100) < 80 ? [200, 120, 40] : null));
  assert.equal(rechtzetten(rond), null, "een rond ding");
  const ei = maak(200, 260, (x, y) => (((x - 100) / 70) ** 2 + ((y - 130) / 110) ** 2 < 1 ? [90, 160, 60] : null));
  assert.equal(rechtzetten(ei), null, "een ovaal");
  assert.equal(rechtzetten(maak(50, 50, () => null)), null, "leeg");
});
