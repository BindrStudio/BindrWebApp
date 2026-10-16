// Kaarten met een bijzondere nummering, waar zoeken en foto's anders de verkeerde kaart geven.
//
// 30th Celebration (EN, september 2026, setcode 30C):
//   - De Classic Collection (TCGdex-set 30th-c, 001–030 op alfabet van het oude nummer) draagt het nummer
//     van de oude set (Charizard 4/102). Limitless nummert ze CC1–CC30, in de volgorde van Cardmarket.
//   - De 30 Pikachu's (023–052/128) dragen ook een eigen nummer 01/30 … 30/30.
// Bronnen: limitlesstcg.com/cards/30C, tcgcollector.com (30th Celebration Classic Collection),
// Bulbapedia (30th Celebration). De volgorde van CC1–CC30 = de Cardmarket-id's 907939–907968.

/** TCGdex 30th-c-<lokaal> → Limitless CC-nummer en het gedrukte nummer (oude set). */
const CC30: Record<string, { cc: number; nr: string; totaal: number }> = Object.fromEntries(([
  ["001", 2, "4", 102], ["002", 8, "5", 109], ["003", 11, "11", 113], ["004", 20, "11", 101], ["005", 3, "18", 132],
  ["006", 9, "19", 109], ["007", 5, "25", 111], ["008", 25, "33", 181], ["009", 22, "41", 122], ["010", 13, "43", 146],
  ["011", 14, "47", 127], ["012", 27, "50", 185], ["013", 24, "57", 111], ["014", 1, "58", 102], ["015", 4, "69", 132],
  ["016", 19, "85", 124], ["017", 23, "89", 149], ["018", 15, "94", 102], ["019", 16, "99", 102], ["020", 17, "100", 102],
  ["021", 18, "101", 101], ["022", 12, "106", 106], ["023", 21, "106", 160], ["024", 6, "106", 105], ["025", 10, "108", 115],
  ["026", 28, "114", 264], ["027", 29, "123", 172], ["028", 26, "138", 202], ["029", 7, "149", 147], ["030", 30, "203", 193],
] as const).map(([l, cc, nr, totaal]) => [l, { cc, nr, totaal }]));

/** Een kaart uit de Classic Collection van 30th Celebration (op TCGdex-id), of null. */
export function klassiek30(kaartId: string | null | undefined): { cc: number; nr: string; totaal: number } | null {
  const m = /^30th-c-(\d{3})$/.exec(kaartId ?? "");
  return m ? CC30[m[1]] ?? null : null;
}

/** De Pikachu's van 30th Celebration: 023/128 = 01/30 … 052/128 = 30/30. */
export function pikachu30(setId: string, lokaal: string): { nr: string; totaal: number } | null {
  if (setId !== "30th") return null;
  const n = Number(lokaal);
  return n >= 23 && n <= 52 ? { nr: String(n - 22).padStart(2, "0"), totaal: 30 } : null;
}

/**
 * Hoe een kaart in de catalogus genummerd wordt zoals ze gedrukt is: het nummer en het totaal om op te
 * zoeken en te tonen, en een tweede nummer om ook op te vinden (de Pikachu's: 01/30).
 */
export function gedrukt(setId: string, lokaal: string): { nummer: string; totaal: number; alias: { nr: string; totaal: number } | null } | null {
  const k = setId === "30th-c" ? klassiek30(`30th-c-${lokaal}`) : null;
  if (k) return { nummer: k.nr, totaal: k.totaal, alias: null };
  const p = pikachu30(setId, lokaal);
  return p ? { nummer: lokaal, totaal: 128, alias: p } : null;
}
