# Bind'r Voorraad

De app van Bind'r voor de stand op beurzen: elke kaart met een eigen QR-label, onze binders en sealed per aantal, een kassa die cash en SumUp bijhoudt, inkopen en ruilen zoals we het aan de stand doen, en een klantenpagina met alles wat te koop is. Werkt op iPhone en Android, ook zonder internet, en is gratis te hosten.

- **Klantenpagina:** https://bindrstudio.github.io/BindrWebApp/ (rechtsboven *Beheer* voor ons)
- **Beheer:** https://bindrstudio.github.io/BindrWebApp/beheer.html

Versie 0.5 · oktober 2026

## Wat de app kan

### Inloggen en samenwerken
- Inloggen met je e-mail en een **pincode van 6 cijfers**. De gsm onthoudt wie je bent; daarna volstaat de pincode, ook zonder internet. Na 10 minuten niets doen vergrendelt de app.
- **Twee omgevingen, Bind'r en Brent:** elk een eigen catalogus, vault, kassa en beurzen, en apart afrekenen. Bovenaan zie je waar je werkt en wie er nog bezig is. Klanten zien alles samen onder het Bind'r-logo; in *Meer* kies je welke omgevingen op de klantenpagina staan.
- Met drie tegelijk werken mag. Elke verkoop wordt apart geboekt, een exemplaar kan maar één keer weg (anders een conflict om op te lossen), en de app haalt om de 30 seconden op wat de anderen deden.

### Kaarten: Catalogus en Vault
- **Catalogus** ligt te koop op de beurs (klanten zien dit), **Vault** is onze eigen stock. Beide ingedeeld in Singles, Slabs, Sealed en Bind'r.
- Elk exemplaar heeft een eigen code en QR-label (zonder prijs). Klanten zien een kaart pas als het label geplakt is en het hartje klopt.
- Toevoegen via zoeken (naam, nummer, setcode, ook Japans en Chinees), een foto of handmatig. Met de Cardmarket-info erbij: trend, laagste, gemiddeldes, of de kaart en de set stijgen of dalen (met een grapje), en een link naar de goedkoopste aanbiedingen in België en Nederland.
- **Graded (slabs):** kies bij een kaart "Graded", met grader, grade en certificaat. De prijs zoek je zoals verzamelaars: knoppen naar de verkochte advertenties op eBay (.com, .de, .be) en 130point, en een lijstje met de laatste verkopen die je vond. De app maakt er een schatting van. In de catalogus en op de klantenpagina staat een slab in een eigen hoes met het label.
- **Prijzen nakijken:** één knop; hartjes die te ver afwijken pulseren rood (voor iedereen tegelijk). Tot het nieuwe hartje erop staat, ziet de klant die kaart niet. Een hartje onder de aankoopprijs vraagt eerst of je de kaart niet beter in de vault legt.
- Kaarten kantelen en glanzen mee met je vinger; foto's komen van TCGdex, en anders van Limitless TCG of pokemontcg.io.

### Artikels: binders, sealed, 3D-prints
- In *Meer › Artikels*. Alles wat per aantal gaat en geen eigen label krijgt.
- **Binders:** artwork, techniek (lasergravure, UV-print, geschilderd), grootte, binder voor toploaders of niet, merk, verkoopprijs, kostprijs, voorraad en een eigen foto. Klanten zien al onze binders op de klantenpagina, ook die niet uitgestald liggen ("vraag ernaar").
- **Sealed:** zoek het product op in de productlijst van Cardmarket (trend, laagste, gemiddelde en een link), met inkoopprijs en aantal.

### Kassa en beurs
- Beurzen plannen (naam, datum, plaats); klanten zien ze bij *Bezoek onze stand*. Op de dag zelf start je de beurs met de cashkoffer.
- Tijdens een beurs zie je dat meteen (groene stip) en bekijk je de **cijfers van de beurs**: verkocht per soort (kaarten, slabs, binders, 3D-prints, sealed), ingekocht, ruil en de laatste transacties.
- Het mandje heeft twee kanten: **Uit onze voorraad** (scannen, zoeken, artikels) en **Van de klant**.
- **Inkopen en ruilen zoals aan de stand:** zoek elke kaart van de klant op, kijk naar de marktwaarde (of de eBay-verkopen bij graded) en vul ze in. Daarna kies je voor alle kaarten samen een percentage met de schuifknop (65 tot 95%, per 5%), rond je af naar boven of onder (of typ een eigen bedrag), en zie je per kaart wat we echt betalen. Zo komt het ook in de boekhouding.
- Het oogje *Inkoop* toont onze aankoopprijs en marge per kaart (enkel op jouw gsm, standaard uit).
- Betalen cash, SumUp of beide, met wisselgeld; 5 seconden "Ongedaan maken", retour, en conflicten oplossen.
- **Historiek:** alle vorige beurzen met hun cijfers, en alle transacties per dag met pijltjes (verkoop, inkoop, ruil, retour). Exporteren als CSV.

### Klantenpagina
- In de stijl van een webshop: logo, Instagram en *Beheer* bovenaan, een welkomstblok, onze binders groot in beeld, zoeken, filters (ook per set met het logo) en sorteren.
- Bij een kaart: *Vraag ernaar aan onze stand* en de volgende beurs. Nooit aankoopprijzen, de vault of de kassa.

### Labels
QR-labels op een Niimbot B1 / B1 Pro via Bluetooth (50 × 15 mm, zonder prijs, met het Bind'r-logo en de datum).

| Toestel | Printen |
|---|---|
| Android | Chrome. *Labels › Verbinden* en kies de printer. |
| iPhone | Enkel in de gratis app [Bluefy](https://apps.apple.com/app/bluefy-web-ble-browser/id1492822055) (Safari en Chrome kunnen geen Bluetooth). Al de rest werkt ook in Safari. |

## Eenmalig klaarzetten

### Supabase
1. **SQL Editor › New query** › plak `supabase/schema.sql` › **Run**. Doe dit opnieuw na elke update (veilig om te herhalen; gegevens blijven staan).
2. Authentication › Sign In / Providers: **Allow new users to sign up: uit**.
3. Authentication › Users › **Add user** voor elke beheerder, en voer onderaan `schema.sql` het `insert into public.beheerders`-stuk uit.
4. Wachtwoorden: minimale lengte **6** en geen verplichte letters of tekens (de pincode is het wachtwoord van je account).
5. Aangeraden: Authentication › Rate Limits › aanmeldingen per 5 minuten zo laag mogelijk (bv. 10), en de e-mailadressen van de beheerders niet publiek maken.

**Pincode instellen:** ga naar *Beheer*, tik *Eerste keer? Log in met je wachtwoord* en kies je pincode. Op een nieuwe gsm geef je één keer je e-mail en pincode in. Pincode vergeten? Iemand met toegang tot Supabase zet een nieuw wachtwoord; wat nog op internet wachtte, blijft op de gsm tot je weer inlogt.

### GitHub
1. Repo openbaar (GitHub Pages is gratis voor openbare repo's; er staat niets geheims in).
2. Settings › Pages › Source: **GitHub Actions**, en Actions › *App publiceren* › **Run workflow**.

De publieke sleutel in `src/config.ts` mag in de code: zonder login geeft hij enkel leestoegang tot de klantenpagina. Deel nooit de `service_role`-sleutel.

## Ontwikkelen

```bash
npm install
npm run watch      # bouwt bij elke wijziging
npm run serve      # http://localhost:8080 (klanten) en /beheer.html
npm test           # unit tests, o.a. de volledige testcase beursdag
npm run typecheck
npm run e2e        # de testcase beursdag in de echte app, plus pincode tegen een nagebootste Supabase
```

`public/app.js`, `public/catalogus/app.js` en `public/sw.js` staan mee in git: **voer `npm run build` uit voor je commit**. De workflow *Controle* kijkt dat na.

```
src/
  lib/       rekenkern (kassa, bod, prijzen), codes, catalogus, foto's, labels, printer, camera, OCR, grapjes
  store/     Supabase (REST + RPC) en de demo (localStorage), met dezelfde interface
  ui/        Catalogus/Vault, Scan, Kassa, Historiek, Artikelen, Graded, Beurs, Meer, Toevoegen, Login …
  klant/     de klantenpagina (eigen bundel)
  gedeeld/   wat beide pagina's gebruiken (de setkiezer)
  state.ts   centrale toestand, acties, omgevingen en de offline wachtrij
public/      wat online komt (index.html = klanten, beheer.html, bundels, sw.js, data/, vendor/, img/)
scripts/     build, tests, catalogus (TCGdex), prijsgids en sealed (Cardmarket)
supabase/    databaseschema
tests/       unit tests en de e2e-doorlopen
```

**Automatisch:** *App publiceren* (bij elke push en elke nacht: prijsgids en sealed-lijst van Cardmarket ophalen en `public/` online zetten) en *Kaartencatalogus bijwerken* (elke maandag uit TCGdex, in een job zonder schrijfrechten).

## Bronnen

Kaartgegevens, foto's en set-logo's: [TCGdex](https://tcgdex.dev); reservefoto's: [Limitless TCG](https://limitlesstcg.com) en [pokemontcg.io](https://pokemontcg.io). Prijzen en sealed: de publieke [Cardmarket](https://www.cardmarket.com)-prijsgids en productlijst. Graded: gewone links naar verkochte advertenties op eBay en [130point](https://130point.com) (geen scraping). Bibliotheken: zie `public/vendor/README.md`.
