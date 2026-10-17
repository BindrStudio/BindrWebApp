// Onze Instagram-berichten automatisch: wat scripts/instagram.mjs uit een feed van Behold haalt, en wat de
// klantenpagina uit data/instagram.json aanvaardt (enkel onze eigen foto's en links naar Instagram).
import { test } from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error: een .mjs-script zonder types
import { berichten, kortOnderschrift } from "../scripts/instagram.mjs";
import { feedSamenvatting, geldigeFeed, siteBerichten, zelfdeBericht } from "../src/lib/instafeed";

const post = (id: string, extra: Record<string, unknown> = {}) => ({
  id, timestamp: "2026-10-15T18:02:11+0000", permalink: `https://www.instagram.com/p/${id}/`, mediaType: "IMAGE",
  sizes: { small: { mediaUrl: `https://behold.pictures/abc/${id}/small.webp`, width: 400, height: 400 }, medium: { mediaUrl: `https://behold.pictures/abc/${id}/medium.webp` } },
  caption: "Nieuwe binder! Dragonite op een lime Vault X 🐉 #pokemon #binder #tcg", prunedCaption: "Nieuwe binder! Dragonite op een lime Vault X 🐉",
  ...extra,
});

test("feed van Behold: enkel berichten met een foto van behold.pictures en een link naar Instagram", () => {
  const lijst = berichten({ username: "bindrstudio", posts: [
    post("C1a"),
    post("C2b", { permalink: "https://evil.example/p/x/" }),
    post("C3c", { sizes: { small: { mediaUrl: "https://evil.example/x.webp" } } }),
    post("C4d", { mediaType: "VIDEO", isReel: true, permalink: "https://www.instagram.com/reel/C4d/" }),
    post("../../etc", {}),
  ] });
  assert.deepEqual(lijst.map((b: { id: string }) => b.id), ["C1a", "C4d"], "de rest valt weg (ook een vreemde link)");
  assert.equal(lijst[0].foto, "https://behold.pictures/abc/C1a/small.webp", "de kleine versie (400 px)");
  assert.equal(lijst[0].alt, "Nieuwe binder! Dragonite op een lime Vault X 🐉");
  assert.equal(berichten([post("Oud1")]).length, 1, "een oude feed (enkel een lijst) kan ook");
  assert.equal(berichten(null).length, 0);
  assert.equal(berichten({ posts: Array.from({ length: 30 }, (_, i) => post(`P${i}`)) }).length, 16, "hoogstens 16");
  assert.equal(kortOnderschrift({ caption: "#enkel #hashtags" }), null);
  assert.ok(kortOnderschrift({ caption: "x ".repeat(200) }).length <= 100);
});

test("data/instagram.json op onze site: enkel img/insta/ en instagram.com", () => {
  const goed = { id: "C1a", foto: "img/insta/C1a.webp", link: "https://www.instagram.com/p/C1a/", alt: "Een binder", datum: "2026-10-15T18:02:11+0000" };
  const lijst = siteBerichten({ bijgewerkt: "2026-10-17T03:25:00Z", posts: [
    goed,
    { ...goed, id: "x1", foto: "https://evil.example/x.webp" },
    { ...goed, id: "x2", foto: "img/insta/../../beheer.html" },
    { ...goed, id: "x3", link: "javascript:alert(1)" },
    { ...goed, id: "x4", link: "https://www.instagram.com/p/C1a/?x=<script>" },
  ] });
  assert.deepEqual(lijst.map((b) => b.id), ["C1a"]);
  assert.deepEqual(siteBerichten({}), []);
  assert.deepEqual(siteBerichten(null), []);
  assert.equal(zelfdeBericht("https://www.instagram.com/p/C1a/", "https://www.instagram.com/p/C1a"), true);
  assert.equal(zelfdeBericht(null, "https://www.instagram.com/p/C1a"), false);
});

test("de link van de feed in Profiel en de test", () => {
  assert.equal(geldigeFeed("  https://feeds.behold.so/zFgp2Jbbk23Ovf1ZUOhq "), "https://feeds.behold.so/zFgp2Jbbk23Ovf1ZUOhq");
  assert.equal(geldigeFeed(""), "", "leeg = uit");
  assert.equal(geldigeFeed("https://feeds.behold.so/abc"), null, "te kort");
  assert.equal(geldigeFeed("http://feeds.behold.so/zFgp2Jbbk23Ovf1ZUOhq"), null, "enkel https");
  assert.equal(geldigeFeed("https://evil.example/zFgp2Jbbk23Ovf1ZUOhq"), null);
  const s = feedSamenvatting({ username: "bindrstudio", posts: [post("A"), post("B", { timestamp: "2026-10-16T09:00:00+0000" })] });
  assert.deepEqual(s, { aantal: 2, nieuwste: "2026-10-16T09:00:00+0000", naam: "bindrstudio" });
});
