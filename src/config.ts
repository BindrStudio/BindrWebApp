// Publieke instellingen van de app. De publieke Supabase-sleutel mag in de code:
// zonder login geeft hij enkel toegang tot de publieke vitrine (zie supabase/schema.sql).
export const SUPABASE_URL = "https://thnrmrvpkcrujxtwwqhy.supabase.co";
export const SUPABASE_KEY = "sb_publishable_rFo0QZlgdsQTMOU7buKHJg_hMBrCSPV";

export const APP_VERSIE = "0.1.0";
export const INSTAGRAM_URL = "https://www.instagram.com/";

// Bestanden die met de app meekomen (public/data).
export const DATA = {
  catalogusEn: "data/catalog-en.json",
  catalogusAsia: "data/catalog-asia.json",
  prijzen: "data/prices.json",
  testset: "data/testset.csv",
};

// Kaartfoto's van TCGdex (gratis CDN).
export const TCGDEX_ASSETS = "https://assets.tcgdex.net";
