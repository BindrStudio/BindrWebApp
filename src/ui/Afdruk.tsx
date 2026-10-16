// Afdrukken (of bewaren als pdf) zonder nieuw venster: de inhoud komt in een laag die enkel
// bij het printen zichtbaar is. Werkt ook in de app op het beginscherm van een iPhone.
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

let zetInhoud: ((n: ReactNode) => void) | null = null;

export function AfdrukLaag() {
  const [inhoud, setInhoud] = useState<ReactNode>(null);
  useEffect(() => { zetInhoud = setInhoud; return () => { zetInhoud = null; }; }, []);
  return inhoud ? createPortal(<div id="afdruk">{inhoud}</div>, document.body) : null;
}

/** Toont het afdrukvenster met deze inhoud (kies daar "Bewaar als pdf" om het te bewaren). */
export function drukAf(inhoud: ReactNode, titel?: string) {
  if (!zetInhoud) return;
  const vorigeTitel = document.title;
  if (titel) document.title = titel; // de standaardnaam van het pdf-bestand
  zetInhoud(inhoud);
  const klaar = () => { zetInhoud?.(null); document.title = vorigeTitel; };
  window.addEventListener("afterprint", klaar, { once: true });
  // Eerst laten tekenen, dan printen.
  requestAnimationFrame(() => setTimeout(() => {
    window.print();
    // Sommige browsers sturen geen afterprint: na een tijdje toch opruimen.
    setTimeout(() => { if (document.title === titel) klaar(); }, 60000);
  }, 80));
}

/** Een CSV-bestand bewaren (met BOM, zodat Excel de accenten goed leest). */
/** Een bestand downloaden (bv. de back-up als JSON). */
export function bewaarBestand(naam: string, tekst: string, type = "application/json") {
  const url = URL.createObjectURL(new Blob([tekst], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = naam;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function bewaarCsv(naam: string, tekst: string) {
  const url = URL.createObjectURL(new Blob(["﻿" + tekst], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = naam;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
