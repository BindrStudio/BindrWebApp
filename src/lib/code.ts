// Codes van exemplaren: 6 tekens uit het Crockford-alfabet (zonder I, L, O en U,
// zodat niemand ze verwart). Op het label als 7K2-QX9, in de QR als BR:7K2QX9.
export const ALFABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const GELDIG = /^[0-9A-HJKMNP-TV-Z]{6}$/;

export function nieuweCode(bestaand: Set<string> = new Set()): string {
  const buf = new Uint8Array(6);
  for (let poging = 0; poging < 50; poging++) {
    crypto.getRandomValues(buf);
    let code = "";
    for (const b of buf) code += ALFABET[b % 32];
    if (!bestaand.has(code)) return code;
  }
  throw new Error("Geen vrije code gevonden");
}

/** Maakt van wat iemand typt of scant een geldige code, of null. */
export function normaliseerCode(invoer: string): string | null {
  let s = (invoer || "").trim().toUpperCase();
  if (s.startsWith("BR:")) s = s.slice(3);
  s = s.replace(/[\s-]/g, "");
  // Veelgemaakte verwisselingen bij het typen
  s = s.replace(/O/g, "0").replace(/[IL]/g, "1").replace(/U/g, "V");
  return GELDIG.test(s) ? s : null;
}

export function toonCode(code: string): string {
  return code.length === 6 ? `${code.slice(0, 3)}-${code.slice(3)}` : code;
}

export function qrInhoud(code: string): string {
  return `BR:${code}`;
}
