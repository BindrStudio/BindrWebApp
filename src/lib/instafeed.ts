// Onze laatste Instagram-berichten, automatisch: een JSON-feed van Behold (behold.so, via de officiële Instagram-API).
// Bij het publiceren haalt scripts/instagram.mjs de feed op en zet de berichten op onze eigen site
// (data/instagram.json en img/insta/). De klantenpagina leest enkel dat bestand; klanten vragen de feed nooit zelf op.
// Dezelfde regels als in scripts/instagram.mjs: pas je er één aan, pas dan ook de andere aan.

/** Een feed van Behold: https://feeds.behold.so/<id>. */
export const FEED_URL = /^https:\/\/feeds\.behold\.so\/[A-Za-z0-9_-]{6,64}$/;
/** Een bericht op Instagram (foto, reel). */
export const IG_BERICHT = /^https:\/\/www\.instagram\.com\/(p|reel|reels|tv)\/[A-Za-z0-9_-]+\/?$/;
const FOTO = /^img\/insta\/[A-Za-z0-9_-]+\.(webp|jpg|png)$/;

/** De feed-URL zoals ingegeven (spaties weg), of null als het geen feed van Behold is. Leeg = "". */
export function geldigeFeed(url: string): string | null {
  const u = url.trim();
  if (!u) return "";
  return FEED_URL.test(u) ? u : null;
}

export interface InstaBericht { id: string; foto: string; link: string; alt: string | null; datum: string | null }

/** De berichten uit data/instagram.json van onze site: enkel een foto in img/insta/ en een link naar Instagram. */
export function siteBerichten(j: unknown): InstaBericht[] {
  const posts = (j as { posts?: unknown })?.posts;
  if (!Array.isArray(posts)) return [];
  const uit: InstaBericht[] = [];
  for (const p of posts as Record<string, unknown>[]) {
    const id = typeof p?.id === "string" ? p.id : "";
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(id) || typeof p.foto !== "string" || !FOTO.test(p.foto) || typeof p.link !== "string" || !IG_BERICHT.test(p.link)) continue;
    uit.push({
      id, foto: p.foto, link: p.link,
      alt: typeof p.alt === "string" && p.alt.trim() ? p.alt.trim().slice(0, 120) : null,
      datum: typeof p.datum === "string" ? p.datum : null,
    });
    if (uit.length >= 16) break;
  }
  return uit;
}

/** Hetzelfde bericht (met of zonder / op het einde)? */
export const zelfdeBericht = (a: string | null | undefined, b: string | null | undefined) =>
  !!a && !!b && a.replace(/\/+$/, "") === b.replace(/\/+$/, "");

/** Wat een feed van Behold teruggeeft, kort: hoeveel berichten en de datum van het nieuwste (voor de test in Profiel). */
export function feedSamenvatting(j: unknown): { aantal: number; nieuwste: string | null; naam: string | null } {
  const posts = Array.isArray(j) ? j : Array.isArray((j as { posts?: unknown })?.posts) ? (j as { posts: unknown[] }).posts : [];
  const goed = (posts as Record<string, unknown>[]).filter((p) => typeof p?.permalink === "string" && IG_BERICHT.test(p.permalink));
  const data = goed.map((p) => (typeof p.timestamp === "string" ? p.timestamp : "")).filter(Boolean).sort();
  const naam = (j as { username?: unknown })?.username;
  return { aantal: goed.length, nieuwste: data.length ? data[data.length - 1] : null, naam: typeof naam === "string" ? naam : null };
}
