import type { Artikel, ArtikelType, Exemplaar } from "../types";

export type Categorie = "singles" | "slabs" | "sealed" | "bindr" | "overig";

export const CATEGORIEEN: { id: Categorie; label: string }[] = [
  { id: "singles", label: "Singles" },
  { id: "slabs", label: "Slabs" },
  { id: "sealed", label: "Sealed" },
  { id: "bindr", label: "Bind'r" },
  { id: "overig", label: "Overig" },
];

export function categorieExemplaar(e: Pick<Exemplaar, "soort">): Categorie {
  return e.soort === "slab" ? "slabs" : e.soort === "eigen product" ? "bindr" : "singles";
}

export function categorieArtikel(a: Pick<Artikel, "soort">): Categorie {
  return a.soort === "sealed" ? "sealed" : a.soort === "eigen product" ? "bindr" : "overig";
}

// In de app heten de twee plaatsen anders dan in de database (vitrine / stockdoos).
export const PLAATS = {
  vitrine: { naam: "Catalogus", lang: "In de catalogus", uitleg: "Te koop op de beurs; klanten zien dit" },
  stockdoos: { naam: "Vault", lang: "In de vault", uitleg: "Onze eigen stock; klanten zien dit niet" },
} as const;

/** Het type van een artikel; oudere artikelen (zonder details) raden we uit de naam. */
export function artikelType(a: Pick<Artikel, "soort" | "naam" | "details">): ArtikelType {
  const t = a.details?.type;
  if (t) return t;
  if (a.soort === "sealed") return "sealed";
  if (a.soort === "eigen product") return /binder|map\b/i.test(a.naam) ? "binder" : /3d|print/i.test(a.naam) ? "3d-print" : "andere";
  return "andere";
}

export const ARTIKEL_TYPES: { id: ArtikelType; label: string; meervoud: string }[] = [
  { id: "binder", label: "Binder", meervoud: "Binders" },
  { id: "sealed", label: "Sealed", meervoud: "Sealed" },
  { id: "3d-print", label: "3D-print", meervoud: "3D-prints" },
  { id: "andere", label: "Ander artikel", meervoud: "Andere" },
];

/** De soort in de database bij een type. */
export const soortVoorType = (t: ArtikelType): Artikel["soort"] => (t === "sealed" ? "sealed" : t === "andere" ? "andere" : "eigen product");

export const TECHNIEKEN = [
  { id: "laser", label: "Lasergravure" },
  { id: "uv", label: "UV-print" },
  { id: "geschilderd", label: "Geschilderd" },
] as const;

/** Korte omschrijving: "Vault X · 9-pocket · toploader · lasergravure · Gengar". */
export function artikelOmschrijving(a: Pick<Artikel, "details" | "soort" | "naam">): string {
  const d = a.details ?? {};
  const t = artikelType(a);
  if (t === "binder") {
    return [d.merk, d.grootte, d.toploader ? "toploader" : null, TECHNIEKEN.find((x) => x.id === d.techniek)?.label.toLowerCase(), d.artwork].filter(Boolean).join(" · ");
  }
  if (t === "sealed") return [d.product, d.set, d.taal].filter(Boolean).join(" · ");
  return "";
}
