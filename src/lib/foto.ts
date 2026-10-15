// Kaartfoto's en set-logo's, met reservebronnen.
//
// TCGdex heeft niet altijd meteen foto's van de nieuwste kaarten. Dan proberen we
// Limitless TCG (heeft nieuwe sets snel, op de officiële setcode) en daarna
// pokemontcg.io. Lukt geen enkele, dan toont de app de eerste letter van de naam.
const TCGDEX = "https://assets.tcgdex.net";
const LIMITLESS = "https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com";
const PTCGIO = "https://images.pokemontcg.io";

/** De hosts van alle fotobronnen (de service worker bewaart ze voor offline). */
export const FOTO_HOSTS = ["assets.tcgdex.net", "limitlesstcg.nyc3.cdn.digitaloceanspaces.com", "images.pokemontcg.io"];

export interface FotoKaart {
  afbeelding?: string | null;   // meestal TCGdex (bewaard bij het toevoegen)
  set_code?: string | null;     // officiële afkorting (PFL) of, bij Japans, de set-id (SV2a)
  nummer?: string | null;
  kaart_id?: string | null;     // TCGdex-id, bv. sv03-125
  catalogus?: "en" | "asia" | null;
  taal?: string | null;
}

/** Een kaart uit de catalogus (TCGdex) als fotokaart. */
export function uitCatalogus(k: { id: string; setCode: string; setId: string; nummer: string; catalogus: "en" | "asia" }): FotoKaart {
  return { set_code: k.setCode || k.setId, nummer: k.nummer, kaart_id: k.id, catalogus: k.catalogus };
}

const groot = (u: string) => u.replace("/low.webp", "/high.webp");

/** TCGdex-set-id naar die van pokemontcg.io: sv03 → sv3, sv03.5 → sv3pt5, swsh12.5 → swsh12pt5. */
export function ptcgioSet(tcgdexSet: string): string {
  return tcgdexSet.replace(/^([a-z]+)0*(\d+)\.5$/i, "$1$2pt5").replace(/^([a-z]+)0*(\d+)$/i, "$1$2").toLowerCase();
}

/** Alle bronnen voor één kaart, de beste eerst. */
export function fotoBronnen(k: FotoKaart, kwaliteit: "klein" | "groot" = "klein"): string[] {
  const uit: string[] = [];
  if (k.afbeelding) uit.push(kwaliteit === "groot" ? groot(k.afbeelding) : k.afbeelding);
  const nr = (k.nummer ?? "").trim();
  const code = (k.set_code ?? "").trim();
  const asia = k.catalogus === "asia" || ["JP", "CN-T", "CN-S", "KR"].includes(k.taal ?? "");
  if (code && /^\d+$/.test(nr)) {
    const n = nr.padStart(3, "0");
    const maat = kwaliteit === "groot" ? "LG" : "SM";
    if (asia) uit.push(`${LIMITLESS}/tpc/${code}/${code}_${n}_R_JP_${maat}.png`);
    else uit.push(`${LIMITLESS}/tpci/${code.toUpperCase()}/${code.toUpperCase()}_${n}_R_EN_${maat}.png`);
  }
  if (!asia && k.kaart_id && nr) {
    const set = k.kaart_id.endsWith("-" + nr) ? k.kaart_id.slice(0, -(nr.length + 1)) : null;
    if (set) uit.push(`${PTCGIO}/${ptcgioSet(set)}/${nr.replace(/^0+(?=\d)/, "")}${kwaliteit === "groot" ? "_hires" : ""}.png`);
  }
  return [...new Set(uit)];
}

/** Het logo van een set op TCGdex (taal en reeks uit sets.json). */
export function setLogo(setId: string, info?: readonly [string, string, string, string?, string?] | null): string | null {
  if (!info || !info[3]) return null;
  return `${TCGDEX}/${info[4] || "en"}/${info[3]}/${setId}/logo.png`;
}
