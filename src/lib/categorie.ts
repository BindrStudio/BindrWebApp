import type { Artikel, Exemplaar } from "../types";

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
