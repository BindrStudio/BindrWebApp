// Publieke instellingen van de app. De publieke Supabase-sleutel mag in de code:
// zonder login geeft hij enkel toegang tot de publieke vitrine (zie supabase/schema.sql).
export const SUPABASE_URL = "https://thnrmrvpkcrujxtwwqhy.supabase.co";
export const SUPABASE_KEY = "sb_publishable_rFo0QZlgdsQTMOU7buKHJg_hMBrCSPV";

export const APP_VERSIE = "0.16.0";

// Ons Instagram-account en onze Facebook-pagina (de beheerders kunnen ze wijzigen in Instellingen).
export const INSTAGRAM = "bindrstudio";
export const FACEBOOK = "https://www.facebook.com/profile.php?id=61592725296751";

// Bestanden die met de app meekomen (public/data).
export const DATA = {
  catalogusEn: "data/catalog-en.json",
  catalogusAsia: "data/catalog-asia.json",
  prijzen: "data/prices.json",
  testset: "data/testset.csv",
};

// Kaartfoto's van TCGdex (gratis CDN).
export const TCGDEX_ASSETS = "https://assets.tcgdex.net";

// De klantenpagina staat op de hoofdlink (index.html); het beheer op beheer.html.
export const BEHEER_PAD = "beheer.html";
export const klantUrl = (demo = false) => new URL("./" + (demo ? "?demo=1" : ""), location.href.split("#")[0]).href;
