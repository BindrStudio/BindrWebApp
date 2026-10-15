# Bind'r Voorraad

De voorraad-app van Bind'r: elk exemplaar in de vitrine en de stockdoos, met een eigen QR-label achteraan de toploader, Cardmarket-prijzen en een knop die zegt welke hartjes moeten wisselen. Werkt op iPhone en Android, gratis te hosten.

**Klanten:** https://bindrstudio.github.io/BindrWebApp/ (rechtsboven *Beheer* voor jullie) · **Beheer:** https://bindrstudio.github.io/BindrWebApp/beheer.html

## Wat de app kan

**Inloggen met een pincode, en twee omgevingen**
- De link opent de klantenpagina. Rechtsboven staat *Beheer*: daar log je in met je e-mail en een pincode van 6 cijfers. Daarna onthoudt de gsm wie je bent; voortaan volstaat de pincode, ook zonder internet. Na 10 minuten niets doen vergrendelt de app.
- **Omgevingen** (Bind'r en Brent): elk een eigen catalogus, vault, kassa en beurzen. Bovenaan zie je in welke omgeving je werkt en wie er nog bezig is. In *Meer* kies je welke omgevingen op de klantenpagina staan; klanten zien alles samen onder het Bind'r-logo.
- Met drie tegelijk werken mag: elke verkoop wordt apart geboekt, een exemplaar kan maar één keer weg (anders een conflict om op te lossen), en de app haalt om de 30 seconden op wat de anderen deden.

**Voorraad: Catalogus en Vault**
- **Catalogus** is wat te koop ligt op de beurs (klanten zien dit). **Vault** is jullie eigen stock (klanten zien dit niet). Beide ingedeeld in Singles, Slabs, Sealed en Bind'r-producten.
- Elk exemplaar heeft een eigen code en QR-label (met het zwarte Bind'r-logo en de datum); sealed en 3D-prints gaan per aantal.
- Een hartje onder de aankoopprijs? De app vraagt eerst of dat klopt, met als uitweg: de kaart even in de vault leggen.
- Kaarten kantelen en glanzen mee met je muis of je vinger; de grote foto in een detail zweeft en draait mee.
- Dezelfde kaart in dezelfde conditie en voor dezelfde prijs staat als één tegel met een aantal rechtsboven. Filteren met schakelaars (nieuw binnen, taal, graded, prijs) en per set met het logo van de set, en sorteren (nieuw binnen, prijs, per set, naam).
- Toevoegen via zoeken (naam, naam + nummer zoals `charizard 153`, `PFL 130`, `130/94`, ook Japans en Chinees), een foto of handmatig. Meteen alle Cardmarket-info: trend, laagste, gemiddelde van 7 en 30 dagen, of de kaart en de set stijgen of dalen (met een knipoog), en een knop naar de goedkoopste aanbiedingen in België en Nederland (Near Mint, juiste taal).
- **Prijzen nakijken**: één knop; hartjes die te ver afwijken pulseren rood, voor alle beheerders tegelijk. Tot het nieuwe hartje geschreven is, staat die kaart niet op de klantenpagina. De vault toont welke kaarten in waarde stegen.
- Foto's van TCGdex; heeft een nieuwe kaart daar nog geen foto, dan probeert de app Limitless TCG en daarna pokemontcg.io.

**Scannen, drie in één**
- De camera blijft open en herkent zelf een QR-code of, als er geen QR in beeld is, de kaart via tekstherkenning. Een code typen kan ook.
- Alles komt in een lijstje; hetzelfde exemplaar komt er nooit twee keer in. Met één knop gaat de hele lijst in het mandje.

**Kassa (beurs)**
- Beurzen plannen (naam, datum, plaats): klanten zien ze bij *Bezoek onze stand*. Op de dag zelf start je de beurs met het startbedrag in de cashkoffer; de app noteert de stand van de catalogus.
- Mandje met twee kanten: *Uit onze voorraad* (wat de klant meeneemt: scannen, zoeken, artikelen) en *Van de klant* (kaarten die wij krijgen). Daaruit volgt vanzelf verkoop, ruil of inkoop.
- Het oogje *Inkoop* toont de aankoopprijs en de marge per kaart en op het totaal. Enkel op jouw gsm, standaard uit (de klant kijkt soms mee).
- **Bod op de kaarten van de klant**: de app toont de marktwaarde (Cardmarket, met conditie), rekent het percentage (inkoop 70%, ruil 80%, instelbaar) en stelt ronde bedragen voor (70% van € 183 = € 128,10 → € 125, € 128 of € 130). Een eigen bedrag kan ook; je ziet meteen welk percentage dat is.
- Onderhandelen per kaart of op het totaal (de app verdeelt op de cent). Betalen cash, SumUp of beide, met wisselgeld. 5 seconden "Ongedaan maken", retour, en een vraag bij kaarten uit de vault.
- Werkt zonder internet: wijzigingen wachten op het toestel en gaan door zodra er verbinding is. Verkochten twee toestellen offline hetzelfde exemplaar, dan toont de app een conflict om op te lossen.
- Afsluiten: kas tellen, SumUp nakijken, samenvatting met omzet, korting, marge en de stand van de voorraad.

**Klantencatalogus en overzicht**
- De startpagina, zonder login, in de stijl van een webshop: logo linksboven, Instagram en *Beheer* rechtsboven, een welkomstblok, filters (ook per set met het logo) en sorteren, kaarten die meekantelen en glanzen, de komende beurzen onderaan en de eend die even vraagt of je onze recente binders al zag. Bij een kaart: *Vraag ernaar aan onze stand* en de volgende beurs. Enkel de catalogus met foto, conditie en prijs: geen vault, aankoopprijzen of kassa. Het oude adres `/catalogus/` stuurt door.
- Overzicht van beurzen en voorraadwaarde, en export van alle transacties als CSV.

**Labels** op een Niimbot B1 / B1 Pro via Bluetooth, rechtstreeks vanuit de app (50 × 15 mm, zonder prijs, met het zwarte Bind'r-logo en de datum van het label).

## Printen

| Toestel | Hoe |
|---|---|
| Android | Chrome. Tik *Labels › Verbinden* en kies de printer. |
| iPhone | Geen enkele gewone browser op iPhone kan Bluetooth (ook Chrome niet). Installeer de gratis app [Bluefy](https://apps.apple.com/app/bluefy-web-ble-browser/id1492822055), open daarin het adres van de app en log in. Alles behalve printen werkt ook in Safari of Chrome. |

Labelrol: 50 × 15 mm (aanpasbaar in *Labels*). Met *Proeflabel printen* controleer je maat en scherpte; scan het proeflabel daarna met *Scan*.

## Eenmalig klaarzetten

### GitHub

1. Settings › General › Danger Zone › **Change visibility › Public**. GitHub Pages is gratis enkel voor openbare repo's. In de repo staat niets geheims: de voorraad, prijzen en aankopen zitten in Supabase achter de login.
2. Settings › Pages › Build and deployment › Source: **GitHub Actions**.
3. Actions › *App publiceren* › **Run workflow**.

### Supabase

1. Supabase › **SQL Editor** › New query › plak `supabase/schema.sql` › **Run**. Doe dit opnieuw na elke update van het schema (het script is veilig om te herhalen; gegevens blijven staan).
2. Authentication › Sign In / Providers › **Allow new users to sign up: uit**.
3. Authentication › Users › **Add user** voor elke beheerder (e-mail + wachtwoord).
4. Voer onderaan `schema.sql` het `insert into public.beheerders`-stuk uit met jullie e-mailadressen en namen.
5. Authentication › Providers › Email (of Auth › Policies, naargelang de versie): minimale wachtwoordlengte **6** en **geen** verplichte letters of tekens. De pincode is het wachtwoord van je account, dus enkel 6 cijfers moet kunnen.

**Pincode instellen.** Ga naar *Beheer*, tik *Eerste keer? Log in met je wachtwoord* en kies daarna je pincode van 6 cijfers. Op een nieuwe gsm geef je één keer je e-mail en pincode in. Pincode vergeten? Iemand met toegang tot Supabase zet bij Authentication › Users een nieuw wachtwoord, en je kiest daarna weer een pincode. Wat nog op internet wachtte, blijft op de gsm bewaard tot je weer inlogt.

De publieke sleutel in `src/config.ts` mag in de code: zonder login geeft hij enkel toegang tot de publieke vitrine. Deel nooit de `service_role`-sleutel.

## Ontwikkelen

```bash
npm install
npm run watch      # bouwt public/app.js bij elke wijziging
npm run serve      # http://localhost:8080
npm test           # unit tests
npm run typecheck
npm run e2e        # de volledige testcase beursdag in Chromium (Playwright en ffmpeg nodig)
```

`public/app.js` staat mee in git: **voer `npm run build` uit voor je commit**. De workflow *Controle* kijkt dat na.

### Mappen

```
src/
  lib/       prijsregels, kassa (rekenkern), codes, catalogus en herkenning, labels, printer, camera, OCR
  store/     Supabase (REST + RPC) en de demo (localStorage), met dezelfde interface
  ui/        Catalogus/Vault, Scan, Kassa, Beurs, Meer, Toevoegen, ExemplaarSheet, ArtikelSheet, Labels, Login, Bovenbalk
  klant/     de klantenpagina (eigen bundel, niets van het beheer)
  gedeeld/   wat beide pagina's gebruiken (de setkiezer)
  state.ts   centrale toestand, acties, omgevingen en de offline wachtrij
public/      wat online komt (index.html = klanten, beheer.html, app.js, catalogus/, sw.js, data/, vendor/, img/)
scripts/     build, tests, catalogus (TCGdex) en prijsgids (Cardmarket)
supabase/    databaseschema
tests/       unit tests en de e2e-doorloop
```

### Automatisch

- **App publiceren**: bij elke push en elke nacht. Haalt de Cardmarket-prijsgids op, houdt Supabase wakker en zet `public/` op GitHub Pages.
- **Kaartencatalogus bijwerken**: elke maandag, uit [TCGdex](https://github.com/tcgdex/cards-database), met een klein `sets.json` (naam, code, releasedatum, reeks en taal per set, voor de logo's) voor de klantenpagina.

## Bronnen

Kaartgegevens, foto's en set-logo's: [TCGdex](https://tcgdex.dev); reservefoto's: [Limitless TCG](https://limitlesstcg.com) en [pokemontcg.io](https://pokemontcg.io). Prijzen: de publieke [Cardmarket-prijsgids](https://www.cardmarket.com). Bibliotheken: zie `public/vendor/README.md`.
