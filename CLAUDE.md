# Bind'r Voorraad — notities voor wie aan de code werkt

- Alles is in het Nederlands (Vlaams): code-namen, UI-teksten, commits. Korte, duidelijke zinnen; geen jargon in de UI.
- Gebruikers: 3 beheerders van Bind'r, op iPhone (Safari, printen via Bluefy) en Android (Chrome). Ontwerp eerst voor gsm (375 px), duim-bereik onderaan.
- Stijl: kleuren uit het logo (perzik, zeeblauw met gestippeld "stiksel", boter, bruine inkt), titels in Fredoka. Tokens staan bovenaan `public/styles.css`.
- Geen runtime-afhankelijkheden buiten React. Bibliotheken die de browser nodig heeft staan ongewijzigd in `public/vendor` met hun licentie.
- Bouwen: `npm run build` schrijft `public/app.js` en zet een nieuwe versie in `public/sw.js`. Beide gaan mee in de commit.
- Testen: `npm test` (unit, via esbuild + `node --test`) en `npm run typecheck`. De e2e-doorloop (`npm run e2e`) controleert de testcase-getallen: vitrine 85 / € 7.719, prijscheck precies 6 kaarten, label-QR leesbaar, QR-scan met nep-camera.

## Vaste regels

- Elk fysiek exemplaar heeft een eigen code: 6 tekens Crockford (`0-9A-HJKMNP-TV-Z`), getoond als `XXX-XXX`, in de QR als `BR:XXXXXX`. Nooit een prijs op het QR-label.
- Het hartje (prijssticker vooraan) is de verkoopprijs in de vitrine; `hartjesdatum` wordt bij elke wijziging gezet. Stockdoos-items hebben enkel een `verkoopprijs`.
- Prijsvoorstel = trend (of gem30, anders laagste) × conditiefactor, afgerond op hele euro, minimum € 1. Enkel EN en JP krijgen een voorstel. De beheerder kiest altijd zelf; afwijken zet `prijs_handmatig` (slotje).
- Prijscheck enkel op vitrine-items in voorraad/gereserveerd, zonder slotje, met drempels in euro per prijsklasse.
- Combinatiekorting: `verdeelTotaal` verdeelt op de cent; het afrondingsverschil gaat naar de duurste kaart.
- Betalen: enkel cash en SumUp (fase 2).
- Supabase via REST zonder SDK; RLS via `is_beheerder()`. De publieke sleutel staat bewust in `src/config.ts`.
