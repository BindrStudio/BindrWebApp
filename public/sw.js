// Service worker: de app start ook zonder (goed) internet op de beurs.
// VERSIE wordt bij elke build aangepast door scripts/build.mjs.
const VERSIE = "950c76df69";
const APP = `bindr-app-${VERSIE}`;
const DATA = "bindr-data-v1";
const FOTOS = "bindr-fotos-v2"; // v1 kon ontbrekende foto's (404) bewaren
const EXTERN = "bindr-extern-v1";
const MAX_FOTOS = 1500;

const SCHIL = [
  "beheer.html", "app.js", "styles.css", "manifest.webmanifest",
  "vendor/qrcode.js", "vendor/jsQR.js", "vendor/niimbot.js", "vendor/fredoka/fredoka-latin.woff",
  "img/logo.png", "img/logo-woord.png", "img/logo-zwart.png", "img/eend.png", "img/favicon.png", "img/icon-192.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(APP).then((c) => c.addAll(SCHIL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const naam of await caches.keys()) {
      if ((naam.startsWith("bindr-app-") && naam !== APP) || naam === "bindr-fotos-v1") await caches.delete(naam);
    }
    await self.clients.claim();
  })());
});

async function eerstCache(req, cacheNaam, max) {
  const cache = await caches.open(cacheNaam);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === "opaque") {
    await cache.put(req, res.clone());
    if (max) snoei(cacheNaam, max);
  }
  return res;
}

// Foto's: enkel bewaren wat echt bestaat. Een opaque antwoord kan een 404 zijn; dat bewaren
// zou een foto die later toch verschijnt voor altijd verbergen. Daarom eerst met CORS.
async function foto(req) {
  const cache = await caches.open(FOTOS);
  const hit = await cache.match(req.url);
  if (hit) return hit;
  try {
    const res = await fetch(req.url, { mode: "cors", credentials: "omit" });
    if (res.ok) {
      await cache.put(req.url, res.clone());
      snoei(FOTOS, MAX_FOTOS);
    }
    return res;
  } catch {
    return fetch(req); // geen CORS bij deze bron: tonen, niet bewaren
  }
}

async function eerstNet(req, cacheNaam) {
  const cache = await caches.open(cacheNaam);
  try {
    const res = await fetch(req);
    if (res.ok) await cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    throw err;
  }
}

async function cacheDanNet(req, cacheNaam) {
  const cache = await caches.open(cacheNaam);
  const hit = await cache.match(req);
  const net = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; });
  return hit || net;
}

let snoeien = false;
async function snoei(cacheNaam, max) {
  if (snoeien) return;
  snoeien = true;
  try {
    const cache = await caches.open(cacheNaam);
    const sleutels = await cache.keys();
    for (let i = 0; i < sleutels.length - max; i++) await cache.delete(sleutels[i]);
  } finally { snoeien = false; }
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    if (url.pathname.endsWith("/data/prices.json") || url.pathname.endsWith("/data/testset.csv")) {
      e.respondWith(eerstNet(req, DATA));
    } else if (url.pathname.includes("/data/")) {
      e.respondWith(cacheDanNet(req, DATA));
    } else if (url.pathname.includes("/catalogus/")) {
      // De klantenpagina (script en stijl): altijd vers als het kan.
      e.respondWith(eerstNet(req, DATA));
    } else if (req.mode === "navigate" && url.pathname.endsWith("/beheer.html")) {
      // Het beheer start ook zonder internet.
      e.respondWith(caches.match("beheer.html").then((hit) => hit || fetch(req)).catch(() => fetch(req)));
    } else if (req.mode === "navigate") {
      // De hoofdlink is de klantenpagina: vers als het kan.
      e.respondWith(eerstNet(req, DATA));
    } else {
      e.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
    }
    return;
  }
  // Kaartfoto's en set-logo's: TCGdex en de reservebronnen (Limitless, pokemontcg.io).
  if (["assets.tcgdex.net", "limitlesstcg.nyc3.cdn.digitaloceanspaces.com", "images.pokemontcg.io"].includes(url.hostname)) {
    return e.respondWith(foto(req));
  }
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com" || url.hostname === "cdn.jsdelivr.net") {
    return e.respondWith(eerstCache(req, EXTERN));
  }
  // Supabase en de rest: altijd rechtstreeks.
});
