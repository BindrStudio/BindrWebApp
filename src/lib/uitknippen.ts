// Uitknippen en rechtzetten op pixels, zonder canvas (zodat het ook in de tests en de scripts werkt).
// - achtergrondWeg: een vlakke achtergrond of een zacht verloop (een wit blad, een fotobord) weg, vanaf de rand.
// - rechtzetten: een binder die wat scheef of schuin gefotografeerd is, recht van voren zetten.

export type Pixels = { data: Uint8ClampedArray<ArrayBuffer>; width: number; height: number };

/**
 * Haalt de achtergrond weg vanaf de rand (zoals een toverstaf): enkel wat met de rand verbonden is en geleidelijk
 * verloopt. Een effen achtergrond (een logo op crème) of een licht verloop met een zachte schaduw (een binder op een
 * fotobord) gaat weg; wat binnen een omlijning ligt (de crèmekleurige letters van ons logo) blijft, net als alles met
 * een duidelijke rand. De pixels op de rand worden half doorzichtig, met hun kleur zonder de achtergrond (geen lichte
 * rand op een andere achtergrond). Geeft false als de rand geen achtergrond is (een gewone foto): dan verandert er niets.
 */
export function achtergrondWeg(d: Pixels, hard = 40, zacht = 60): boolean {
  const { width: w, height: h, data: px } = d;
  const n = w * h;
  // De rand, rondom in volgorde (zodat we kunnen zien of hij ergens plots verandert).
  const rand: number[] = [];
  for (let x = 0; x < w; x++) rand.push(x);
  for (let y = 1; y < h; y++) rand.push(y * w + w - 1);
  for (let x = w - 2; x >= 0; x--) rand.push((h - 1) * w + x);
  for (let y = h - 2; y > 0; y--) rand.push(y * w);
  const mediaan = (k: number) => { const v = rand.map((i) => px[i * 4 + k]).sort((a, b) => a - b); return v[v.length >> 1]; };
  const bg = [mediaan(0), mediaan(1), mediaan(2)];
  const tot = (i: number, r: number, g: number, b: number) => Math.hypot(px[i * 4] - r, px[i * 4 + 1] - g, px[i * 4 + 2] - b);
  const vanBg = (i: number) => tot(i, bg[0], bg[1], bg[2]);
  // Een achtergrond: bijna overal dicht bij de mediaan, en rondom zonder plotse sprongen.
  if (rand.filter((i) => vanBg(i) < hard * 1.5).length < rand.length * 0.9) return false;
  let sprong = 0;
  for (let k = 0; k < rand.length; k++) {
    const i = rand[k], j = rand[(k + 1) % rand.length];
    if (tot(i, px[j * 4], px[j * 4 + 1], px[j * 4 + 2]) > 14) sprong++;
  }
  if (sprong > rand.length * 0.08) return false;

  // De toverstaf: elke pixel onthoudt de achtergrond vlak ernaast (`ref`), zodat een verloop of een zachte schaduw
  // gevolgd wordt, maar een echte rand (een sprong) niet. Nooit ver van de gewone achtergrond (een grijze binder op
  // een lichtgrijs blad blijft).
  const lokaal = hard * 0.55;
  const ver = hard * 2.25;
  const weg = new Uint8Array(n);
  const ref = new Uint8ClampedArray(n * 3);
  const rij = new Int32Array(n);
  let kop = 0, staart = 0;
  for (const i of rand) {
    if (weg[i] || vanBg(i) >= hard) continue;
    weg[i] = 1;
    ref[i * 3] = px[i * 4]; ref[i * 3 + 1] = px[i * 4 + 1]; ref[i * 3 + 2] = px[i * 4 + 2];
    rij[staart++] = i;
  }
  while (kop < staart) {
    const i = rij[kop++];
    const x = i % w;
    const r = ref[i * 3], g = ref[i * 3 + 1], b = ref[i * 3 + 2];
    for (const j of [i - w, i + w, x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1]) {
      if (j < 0 || j >= n || weg[j]) continue;
      if (tot(j, r, g, b) >= lokaal || vanBg(j) >= ver) continue;
      weg[j] = 1;
      ref[j * 3] = r + (px[j * 4] - r) * 0.3;
      ref[j * 3 + 1] = g + (px[j * 4 + 1] - g) * 0.3;
      ref[j * 3 + 2] = b + (px[j * 4 + 2] - b) * 0.3;
      rij[staart++] = j;
    }
  }
  for (let i = 0; i < n; i++) {
    if (weg[i]) { px[i * 4 + 3] = 0; continue; }
    const x = i % w;
    const buur = i >= w && weg[i - w] ? i - w : i < n - w && weg[i + w] ? i + w : x > 0 && weg[i - 1] ? i - 1 : x < w - 1 && weg[i + 1] ? i + 1 : -1;
    if (buur < 0) continue;
    const r = ref[buur * 3], g = ref[buur * 3 + 1], b = ref[buur * 3 + 2];
    const a = Math.min(1, Math.max(0, (tot(i, r, g, b) - 18) / zacht));
    if (a <= 0.02) { px[i * 4 + 3] = 0; continue; }
    px[i * 4] = Math.round((px[i * 4] - (1 - a) * r) / a);
    px[i * 4 + 1] = Math.round((px[i * 4 + 1] - (1 - a) * g) / a);
    px[i * 4 + 2] = Math.round((px[i * 4 + 2] - (1 - a) * b) / a);
    px[i * 4 + 3] = Math.round(a * px[i * 4 + 3]);
  }
  return true;
}

type Lijn = { a: number; b: number; recht: number };

/**
 * Een rechte lijn s = a·t + b door de punten, robuust: eerst de mediaan van de hellingen, dan enkel de punten die
 * kloppen. `recht` = het deel van de punten op hoogstens `tol` pixels van de lijn (een gebogen rand: weinig).
 */
function lijn(p: [number, number][], tol: number): Lijn | null {
  const m = p.length;
  if (m < 12) return null;
  const med = (v: number[]) => v.sort((x, y) => x - y)[v.length >> 1];
  const half = m >> 1;
  const hellingen: number[] = [];
  for (let k = 0; k + half < m; k++) { const [t1, s1] = p[k], [t2, s2] = p[k + half]; if (t2 !== t1) hellingen.push((s2 - s1) / (t2 - t1)); }
  if (!hellingen.length) return null;
  let a = med(hellingen);
  let b = med(p.map(([t, s]) => s - a * t));
  for (let ronde = 0; ronde < 3; ronde++) {
    const res = p.map(([t, s]) => Math.abs(s - (a * t + b)));
    const grens = Math.max(1.5, 2.5 * med([...res]));
    let n = 0, st = 0, ss = 0, stt = 0, sts = 0;
    p.forEach(([t, s], k) => { if (res[k] <= grens) { n++; st += t; ss += s; stt += t * t; sts += t * s; } });
    const noemer = n * stt - st * st;
    if (n < 8 || Math.abs(noemer) < 1e-9) return null;
    a = (n * sts - st * ss) / noemer;
    b = (ss - a * st) / n;
  }
  return { a, b, recht: p.filter(([t, s]) => Math.abs(s - (a * t + b)) <= tol).length / m };
}

/** De homografie die (x, y) van `van` naar `naar` brengt (vier punten). */
function homografie(van: [number, number][], naar: [number, number][]): number[] | null {
  const A: number[][] = [];
  for (let k = 0; k < 4; k++) {
    const [x, y] = van[k], [X, Y] = naar[k];
    A.push([x, y, 1, 0, 0, 0, -X * x, -X * y, X]);
    A.push([0, 0, 0, x, y, 1, -Y * x, -Y * y, Y]);
  }
  for (let k = 0; k < 8; k++) {
    let p = k;
    for (let r = k + 1; r < 8; r++) if (Math.abs(A[r][k]) > Math.abs(A[p][k])) p = r;
    if (Math.abs(A[p][k]) < 1e-12) return null;
    [A[k], A[p]] = [A[p], A[k]];
    for (let r = 0; r < 8; r++) {
      if (r === k) continue;
      const f = A[r][k] / A[k][k];
      for (let c = k; c < 9; c++) A[r][c] -= f * A[k][c];
    }
  }
  return [...A.map((r, k) => r[8] / r[k]), 1];
}

/**
 * Zet een uitgeknipte binder recht: zoekt de vier zijden (enkel het middelste stuk, de hoeken zijn rond), snijdt ze
 * met elkaar en trekt die vierhoek tot een rechthoek (scheef en schuin gefotografeerd). Wat buiten de binder valt (een
 * restje schaduw) gaat weg. Geeft null als het geen rechthoek is (dan blijft de foto zoals ze is) of als hij al recht staat.
 */
export function rechtzetten(d: Pixels): Pixels | null {
  const { width: w, height: h, data: px } = d;
  const n = w * h;
  // Het grootste stuk dat niet doorzichtig is.
  const stuk = new Int32Array(n);
  const rij = new Int32Array(n);
  let nr = 0, beste = 0, grootte = 0;
  for (let s = 0; s < n; s++) {
    if (stuk[s] || px[s * 4 + 3] <= 128) continue;
    nr++;
    let kop = 0, staart = 0;
    rij[staart++] = s; stuk[s] = nr;
    while (kop < staart) {
      const i = rij[kop++];
      const x = i % w;
      for (const j of [i - w, i + w, x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1]) {
        if (j >= 0 && j < n && !stuk[j] && px[j * 4 + 3] > 128) { stuk[j] = nr; rij[staart++] = j; }
      }
    }
    if (staart > grootte) { grootte = staart; beste = nr; }
  }
  if (grootte < n * 0.05) return null;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let i = 0; i < n; i++) if (stuk[i] === beste) { const x = i % w, y = (i - x) / w; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const B = x1 - x0 + 1, H = y1 - y0 + 1;
  const binnen = (x: number, y: number) => stuk[y * w + x] === beste;
  // De zijden: per rij de eerste en de laatste pixel, per kolom de bovenste en de onderste.
  const links: [number, number][] = [], rechts: [number, number][] = [], boven: [number, number][] = [], onder: [number, number][] = [];
  for (let y = Math.ceil(y0 + 0.2 * H); y <= y1 - 0.2 * H; y++) {
    let x = x0; while (x <= x1 && !binnen(x, y)) x++;
    if (x > x1) continue;
    links.push([y + 0.5, x]);
    x = x1; while (!binnen(x, y)) x--;
    rechts.push([y + 0.5, x + 1]);
  }
  for (let x = Math.ceil(x0 + 0.2 * B); x <= x1 - 0.2 * B; x++) {
    let y = y0; while (y <= y1 && !binnen(x, y)) y++;
    if (y > y1) continue;
    boven.push([x + 0.5, y]);
    y = y1; while (!binnen(x, y)) y--;
    onder.push([x + 0.5, y + 1]);
  }
  // Een binder heeft rechte zijden: bijna elk punt ligt op de lijn (een eend of een 3D-print niet).
  const tol = Math.max(1.5, 0.01 * Math.max(B, H));
  const L = lijn(links, tol), R = lijn(rechts, tol), T = lijn(boven, tol), O = lijn(onder, tol);
  if (!L || !R || !T || !O) return null;
  const maxHelling = Math.tan((20 * Math.PI) / 180);
  for (const z of [L, R, T, O]) if (z.recht < 0.8 || Math.abs(z.a) > maxHelling) return null;
  // Hoeken: x = a·y + b (links, rechts) snijdt y = a·x + b (boven, onder).
  const hoek = (v: Lijn, hz: Lijn): [number, number] => { const x = (v.a * hz.b + v.b) / (1 - v.a * hz.a); return [x, hz.a * x + hz.b]; };
  const lb = hoek(L, T), rb = hoek(R, T), ro = hoek(R, O), lo = hoek(L, O);
  const afstand = (p: [number, number], q: [number, number]) => Math.hypot(p[0] - q[0], p[1] - q[1]);
  // Haaks genoeg (tussen 70° en 110°)?
  const haaks = (v: Lijn, hz: Lijn) => Math.abs(v.a + hz.a) / (Math.hypot(v.a, 1) * Math.hypot(1, hz.a)) < Math.cos((70 * Math.PI) / 180);
  if (!haaks(L, T) || !haaks(R, T) || !haaks(R, O) || !haaks(L, O)) return null;
  const opp = Math.abs((lb[0] * rb[1] - rb[0] * lb[1]) + (rb[0] * ro[1] - ro[0] * rb[1]) + (ro[0] * lo[1] - lo[0] * ro[1]) + (lo[0] * lb[1] - lb[0] * lo[1])) / 2;
  if (grootte / opp < 0.82 || grootte / opp > 1.06) return null; // geen rechthoek (ronde hoeken mogen)
  const breed = (afstand(lb, rb) + afstand(lo, ro)) / 2, hoog = (afstand(lb, lo) + afstand(rb, ro)) / 2;
  const scheef = Math.max(...[L, R, T, O].map((z) => Math.abs(z.a)));
  const schuin = Math.max(Math.abs(afstand(lb, rb) - afstand(lo, ro)), Math.abs(afstand(lb, lo) - afstand(rb, ro))) / Math.max(breed, hoog);
  if (scheef < 0.004 && schuin < 0.006) return null; // staat al recht
  const rand = Math.round(0.03 * Math.max(breed, hoog));
  const W = Math.round(breed) + 2 * rand, Hh = Math.round(hoog) + 2 * rand;
  const doel: [number, number][] = [[rand, rand], [rand + breed, rand], [rand + breed, rand + hoog], [rand, rand + hoog]];
  const M = homografie(doel, [lb, rb, ro, lo]);
  if (!M) return null;
  const uit = new Uint8ClampedArray(W * Hh * 4);
  const marge = Math.max(2, 0.008 * Math.max(breed, hoog)); // een uitsteeksel van een paar pixels mag
  for (let v = 0; v < Hh; v++) {
    for (let u = 0; u < W; u++) {
      const cu = u + 0.5, cv = v + 0.5;
      if (cu < rand - marge || cu > rand + breed + marge || cv < rand - marge || cv > rand + hoog + marge) continue; // buiten de binder
      const z = M[6] * cu + M[7] * cv + 1;
      const sx = (M[0] * cu + M[1] * cv + M[2]) / z - 0.5, sy = (M[3] * cu + M[4] * cv + M[5]) / z - 0.5;
      const fx0 = Math.floor(sx), fy0 = Math.floor(sy), fx = sx - fx0, fy = sy - fy0;
      let r = 0, g = 0, b = 0, a = 0;
      for (const [xi, yi, gw] of [[fx0, fy0, (1 - fx) * (1 - fy)], [fx0 + 1, fy0, fx * (1 - fy)], [fx0, fy0 + 1, (1 - fx) * fy], [fx0 + 1, fy0 + 1, fx * fy]]) {
        if (xi < 0 || yi < 0 || xi >= w || yi >= h || gw <= 0) continue;
        const k = (yi * w + xi) * 4;
        const al = px[k + 3] * gw;
        r += px[k] * al; g += px[k + 1] * al; b += px[k + 2] * al; a += al;
      }
      if (a <= 0) continue;
      const k = (v * W + u) * 4;
      uit[k] = r / a; uit[k + 1] = g / a; uit[k + 2] = b / a; uit[k + 3] = a;
    }
  }
  return { data: uit, width: W, height: Hh };
}

/** Het kader rond wat niet doorzichtig is (alfa > `drempel`), of null als alles doorzichtig is. */
export function kader(d: Pixels, drempel = 16): { x: number; y: number; w: number; h: number } | null {
  const { width: w, height: h, data: px } = d;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (px[(y * w + x) * 4 + 3] > drempel) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  return x1 < x0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
