// Haalt onze laatste Instagram-berichten op voor de strook op de klantenpagina, via een JSON-feed van Behold
// (behold.so: koppelt ons account via de officiële Instagram-API, geen scraping). Draait bij het publiceren
// (GitHub Actions), zodat klanten de feed nooit zelf opvragen: geen limiet op het aantal bezoekers en geen
// verzoeken naar derden vanuit hun browser. Schrijft public/data/instagram.json en de foto's in public/img/insta/.
//
//   node scripts/instagram.mjs                    de feed uit Profiel › Instagram (publieke_instellingen: instagram_feed)
//   INSTAGRAM_FEED=https://feeds.behold.so/… node scripts/instagram.mjs     een andere feed (testen)
//
// Zonder feed (of als het misloopt) een lege lijst: de strook toont dan enkel de foto's uit Profiel › Instagram.
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const UIT = path.join(root, "public/data/instagram.json");
const FOTOS = path.join(root, "public/img/insta");
const MAX = 16;
export const FEED = /^https:\/\/feeds\.behold\.so\/[A-Za-z0-9_-]{6,64}$/;
const FOTO_HOST = /^https:\/\/([a-z0-9-]+\.)*behold\.pictures\//;
const BERICHT = /^https:\/\/www\.instagram\.com\/(p|reel|reels|tv)\/[A-Za-z0-9_-]+\/?$/;

async function config() {
  const c = await readFile(path.join(root, "src/config.ts"), "utf8");
  const waarde = (naam) => c.match(new RegExp(`${naam} = "([^"]+)"`))?.[1];
  return { url: waarde("SUPABASE_URL"), sleutel: waarde("SUPABASE_KEY") };
}

/** De feed-URL uit Profiel › Instagram (of null). */
async function feedUrl() {
  if (process.env.INSTAGRAM_FEED) return process.env.INSTAGRAM_FEED.trim();
  const { url, sleutel } = await config();
  const r = await fetch(`${url}/rest/v1/publieke_instellingen?select=waarde&sleutel=eq.instagram_feed`, { headers: { apikey: sleutel } });
  if (!r.ok) throw new Error(`publieke_instellingen gaf HTTP ${r.status}`);
  const rij = (await r.json())[0];
  return typeof rij?.waarde === "string" && rij.waarde.trim() ? rij.waarde.trim() : null;
}

/** Een korte tekst bij het bericht (voor schermlezers): de eerste zin van het onderschrift, zonder hashtags. */
export function kortOnderschrift(post) {
  const t = String(post.altText || post.prunedCaption || post.caption || "").replace(/#[\p{L}\p{N}_]+/gu, "").replace(/\s+/g, " ").trim();
  if (!t) return null;
  return t.length > 100 ? `${t.slice(0, 99).replace(/\s+\S*$/, "")}…` : t;
}

/** De berichten uit een feed van Behold: enkel wat we kunnen tonen (een foto van behold.pictures, een link naar Instagram). */
export function berichten(feed) {
  const posts = Array.isArray(feed) ? feed : Array.isArray(feed?.posts) ? feed.posts : [];
  const uit = [];
  for (const p of posts) {
    const id = String(p?.id ?? "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40);
    const s = p?.sizes ?? {};
    const foto = [s.small?.mediaUrl, s.medium?.mediaUrl].find((u) => typeof u === "string" && FOTO_HOST.test(u));
    const link = typeof p?.permalink === "string" && BERICHT.test(p.permalink) ? p.permalink : null;
    if (!id || !foto || !link) continue;
    uit.push({ id, foto, link, alt: kortOnderschrift(p), datum: typeof p.timestamp === "string" ? p.timestamp : null });
    if (uit.length >= MAX) break;
  }
  return uit;
}

async function schrijf(posts, bron) {
  await mkdir(path.dirname(UIT), { recursive: true });
  await writeFile(UIT, JSON.stringify({ bijgewerkt: new Date().toISOString(), bron, posts }));
}

/**
 * Lukt de feed even niet, dan wat nu online staat opnieuw meenemen (de vorige keer opgehaald), zodat de strook niet
 * plots leeg is. Enkel in GitHub Actions (daar kennen we het adres van de site).
 */
async function vorige() {
  const [eigenaar, repo] = (process.env.GITHUB_REPOSITORY || "").split("/");
  if (!eigenaar || !repo) return false;
  const basis = `https://${eigenaar.toLowerCase()}.github.io/${repo}/`;
  const r = await fetch(`${basis}data/instagram.json`);
  if (!r.ok) return false;
  const oud = await r.json();
  if (!Array.isArray(oud?.posts) || !oud.posts.length) return false;
  await mkdir(FOTOS, { recursive: true });
  const posts = [];
  for (const p of oud.posts) {
    if (typeof p?.foto !== "string" || !/^img\/insta\/[A-Za-z0-9_-]+\.(webp|jpg|png)$/.test(p.foto)) continue;
    const f = await fetch(basis + p.foto);
    if (!f.ok) continue;
    await writeFile(path.join(root, "public", p.foto), Buffer.from(await f.arrayBuffer()));
    posts.push(p);
  }
  await writeFile(UIT, JSON.stringify({ ...oud, posts }));
  return posts.length > 0;
}

async function main() {
  await rm(FOTOS, { recursive: true, force: true });
  const url = await feedUrl().catch((e) => { console.log(`::warning::Feed-URL niet gelezen: ${e.message}`); return null; });
  if (!url) { await schrijf([], null); console.log("Geen Instagram-feed ingesteld: enkel de foto's uit Profiel › Instagram."); return; }
  if (!FEED.test(url)) { await schrijf([], null); console.log(`::warning::Onbekende feed (enkel https://feeds.behold.so/…): ${url}`); return; }
  // Zoals de site zelf (staan er domeinen ingevuld bij Behold, dan staat dat van onze site erbij).
  const [eigenaar = "BindrStudio", repo = "BindrWebApp"] = (process.env.GITHUB_REPOSITORY || "").split("/").filter(Boolean);
  const site = `https://${eigenaar.toLowerCase()}.github.io`;
  const r = await fetch(url, { headers: { accept: "application/json", origin: site, referer: `${site}/${repo}/` } });
  if (!r.ok) throw new Error(`De feed gaf HTTP ${r.status}`);
  const lijst = berichten(await r.json());
  await mkdir(FOTOS, { recursive: true });
  const posts = [];
  for (const b of lijst) {
    try {
      const f = await fetch(b.foto);
      const type = f.headers.get("content-type") || "";
      if (!f.ok || !/^image\/(webp|jpeg|png)/.test(type)) continue;
      const data = Buffer.from(await f.arrayBuffer());
      if (data.length > 1_500_000) continue;
      const naam = `${b.id}.${type.includes("png") ? "png" : type.includes("jpeg") ? "jpg" : "webp"}`;
      await writeFile(path.join(FOTOS, naam), data);
      posts.push({ id: b.id, foto: `img/insta/${naam}`, link: b.link, alt: b.alt, datum: b.datum });
    } catch { /* deze foto overslaan */ }
  }
  await schrijf(posts, "behold");
  console.log(`${posts.length} Instagram-berichten opgehaald.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(async (e) => {
    const oud = await vorige().catch(() => false);
    console.log(`::warning::Instagram niet opgehaald (${e.message}): ${oud ? "de berichten van de vorige keer blijven staan" : "de strook toont enkel de foto's uit Profiel › Instagram"}.`);
    if (!oud) await schrijf([], null).catch(() => undefined);
  });
}
