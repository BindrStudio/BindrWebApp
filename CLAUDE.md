# Bind'r Voorraad — notities voor wie aan de code werkt

- Alles is in het Nederlands (Vlaams): code-namen, UI-teksten, commits. Korte, duidelijke zinnen; geen jargon in de UI.
- Gebruikers: 3 beheerders van Bind'r, op iPhone (Safari, printen via Bluefy) en Android (Chrome). Ontwerp eerst voor gsm (375 px), duim-bereik onderaan.
- Stijl: kleuren uit het logo (perzik, zeeblauw met gestippeld "stiksel", boter, bruine inkt), titels in Fredoka. Tokens staan bovenaan `public/styles.css`.
- Geen runtime-afhankelijkheden buiten React. Bibliotheken die de browser nodig heeft staan ongewijzigd in `public/vendor` met hun licentie.
- Bouwen: `npm run build` schrijft `public/app.js` (beheer) en `public/catalogus/app.js` (klant) en zet een nieuwe versie in `public/sw.js`. Alle drie gaan mee in de commit.
- Testen: `npm test` (unit, via esbuild + `node --test`) en `npm run typecheck`. `tests/beursdag.test.ts` rekent de volledige testcase beursdag na (kas € 349, SumUp € 595, voorraad 105 → 98, catalogus 85 → 64 / € 6.479); `tests/wachtrij.test.ts` de offline wachtrij en conflicten; `tests/omgeving.test.ts` omgevingen, pincode, fotobronnen, marge, graded en grapjes; `tests/bod.test.ts` het bod (afronden, verdelen) en de cijfers per soort op een beurs. De e2e-doorloop (`npm run e2e`) doet dezelfde testcase in de echte app (start op de klantenpagina, via *Beheer* naar de demo), plus klantenpagina en QR-scan met nep-camera; `tests/e2e/pincode.cjs` test pincode, vergrendelen en een verlopen sessie tegen een nagebootste Supabase.
- In de UI heten de plaatsen **Catalogus** (database: `vitrine`) en **Vault** (database: `stockdoos`).
- `public/index.html` is de klantenpagina (wat de link opent); het beheer staat op `public/beheer.html` (`BEHEER_PAD`). `/catalogus/` stuurt door naar de root.
- **Omgevingen** (Bind'r, Brent): `omgeving_id` op exemplaren, artikelen, beurzen en transacties. De state houdt enkel de rijen van de actieve omgeving; de rest zit in `buiten` (state.ts). Codes zijn uniek over alle omgevingen (`alleCodes()`). De klantenpagina toont alle omgevingen met `zichtbaar_voor_klanten`.
- **Pincode** = het wachtwoord van het Supabase-account. Het toestel bewaart e-mail, naam en een PBKDF2-hash (`src/lib/pin.ts`) om offline te ontgrendelen; na 10 minuten niets doen vergrendelt de app.
- Werkt de app met een ouder schema (zonder tabel `omgevingen`), dan laat `SupabaseBackend` de nieuwe kolommen weg tot het schema opnieuw is uitgevoerd.
- Elke wijziging gaat via `state.ts`: meteen lokaal, daarna via de wachtrij naar de server. Transacties lopen via `src/lib/kassa.ts` (lokaal) en de databasefunctie `boek_transactie` (server); die twee volgen exact dezelfde regels. Pas je er één aan, pas dan ook de andere aan.
- De klantenpagina (`src/klant`) mag niets uit de beheer-app importeren behalve config, types en kleine hulpfuncties, en toont enkel de publieke weergaven.

## Vaste regels

- Elk fysiek exemplaar heeft een eigen code: 6 tekens Crockford (`0-9A-HJKMNP-TV-Z`), getoond als `XXX-XXX`, in de QR als `BR:XXXXXX`. Nooit een prijs op het QR-label.
- Het hartje (prijssticker vooraan) is de verkoopprijs in de vitrine; `hartjesdatum` wordt bij elke wijziging gezet. Stockdoos-items hebben enkel een `verkoopprijs`.
- Prijsvoorstel = trend (of gem30, anders laagste) × conditiefactor, afgerond op hele euro, minimum € 1. Enkel EN en JP krijgen een voorstel. De beheerder kiest altijd zelf; afwijken zet `prijs_handmatig` (slotje).
- Prijscheck enkel op vitrine-items in voorraad, zonder slotje, met drempels in euro per prijsklasse. Het resultaat staat in `exemplaren.nieuw_hartje` (gedeeld via `markeer_prijzen`); zolang dat gezet is, toont de klantenpagina de kaart niet.
- Een hartje onder (of gelijk aan) de aankoopprijs vraagt eerst bevestiging, met "Naar de vault" als uitweg (`OnderAankoop` in `ui/common.tsx`).
- Aankoopprijs en marge in de kassa enkel na het oogje *Inkoop* (per toestel, standaard uit). Nooit op de klantenpagina.
- Grapjes staan in `src/lib/grapjes.ts`, enkel in het beheer.
- Klanten zien een exemplaar pas als `label_status = 'gestickerd'` (view `publieke_vitrine`, en dezelfde regel in de demo van de klantenpagina).
- Artikels (Meer › Artikels, `ui/Artikelen.tsx`): type in `details.type` (binder, sealed, 3d-print, andere); binders altijd op de klantenpagina, ook in de vault (`uitgestald` = false). Eigen foto's als kleine data-URL (`lib/eigenfoto.ts`, toon ze enkel via `veiligeFoto`), apart geladen in `SupabaseBackend.vulFotos` en nooit in de offline kopie.
- Bod bij inkoop en ruil: per kaart een marktwaarde (`referentie`), dan voor alle kaarten samen een percentage (slider 65–95%, per 5%) en een afronding (`mandje.bod`, `lib/bod.ts`). `zetRegels` in `state.ts` verdeelt het bod altijd opnieuw; per kaart staat in `prijs` wat we echt betalen.
- Graded: grader, grade, `cert` en `verkopen` (zelf opgezochte eBay-verkopen) op het exemplaar; links via `lib/markt.ts` (eBay sold, 130point, certificaat). Nooit scrapen.
- Publieke weergaven: enkel lezen (revoke van public/anon/authenticated, dan grant select). Nooit aankoopprijzen, opmerkingen, cert of verkopen erin.
- Geen reserveren, geen bulk en geen standgeld: die zijn bewust geschrapt (de kolommen blijven in de database, de app gebruikt ze niet).
- Bod bij inkoop en ruil: een percentage van de marktwaarde (standaard inkoop 70%, ruil 80%, instelbaar per 5%), afronden via `src/lib/bod.ts`. De beheerder kiest altijd zelf.
- Cardmarket enkel via de publieke prijsgids en gewone links (geen scraping). `src/lib/markt.ts` maakt de link met filters (NM, taal, verkopers uit BE en NL).
- Dubbels in de catalogus: zelfde kaart, conditie, taal, variant en prijs = één tegel met een aantal (`src/lib/weergave.ts`, gedeeld met de klantenpagina).
- Combinatiekorting: `verdeelTotaal` verdeelt op de cent; het afrondingsverschil gaat naar de duurste kaart.
- Betalen: enkel cash en SumUp, ook samen. Terugbetalen enkel cash.
- Een transactie heeft een id van de gsm (offline veilig opnieuw te versturen) en past exemplaren en artikelen aan; een exemplaar dat al weg is, wordt een conflict, nooit stil overschreven.
- Supabase via REST zonder SDK; RLS via `is_beheerder()`. De publieke sleutel staat bewust in `src/config.ts`.
