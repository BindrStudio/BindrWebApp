# Bind'r Voorraad

De voorraad-app van Bind'r: elk exemplaar in de vitrine en de stockdoos, met een eigen QR-label achteraan de toploader, Cardmarket-prijzen en een knop die zegt welke hartjes moeten wisselen. Werkt op iPhone en Android, gratis te hosten.

**App:** https://bindrstudio.github.io/BindrWebApp/

## Wat de app kan

**Voorraad: Catalogus en Vault**
- **Catalogus** is wat te koop ligt op de beurs (klanten zien dit). **Vault** is jullie eigen stock (klanten zien dit niet). Beide ingedeeld in Singles, Slabs, Sealed en Bind'r-producten.
- Elk exemplaar heeft een eigen code en QR-label; sealed, 3D-prints en bulk gaan per aantal.
- Toevoegen via zoeken (naam, naam + nummer zoals `charizard 153`, `PFL 130`, `130/94`, ook Japans en Chinees), een foto of handmatig.
- **Prijzen nakijken**: één knop; hartjes die te ver afwijken pulseren rood. De vault toont welke kaarten in waarde stegen.

**Kassa (beurs)**
- Beurs starten met het startbedrag in de cashkoffer; de app noteert de stand van de catalogus.
- Mandje met twee kanten: *wij geven* (scannen, zoeken, artikelen) en *wij krijgen* (kaarten of bulk van de klant). Daaruit volgt vanzelf verkoop, ruil of inkoop.
- Onderhandelen per kaart of op het totaal (de app verdeelt op de cent). Betalen cash, SumUp of beide, met wisselgeld. 5 seconden "Ongedaan maken", retour, waarschuwing voor gereserveerde kaarten en kaarten uit de vault.
- Werkt zonder internet: wijzigingen wachten op het toestel en gaan door zodra er verbinding is. Verkochten twee toestellen offline hetzelfde exemplaar, dan toont de app een conflict om op te lossen.
- Afsluiten: kas tellen, SumUp nakijken, samenvatting met omzet, korting, marge en de stand van de voorraad.

**Klantencatalogus en overzicht**
- Een aparte pagina zonder login (`/catalogus/`): enkel de catalogus met foto, conditie en prijs, en reserveren via Instagram. Geen vault, aankoopprijzen, reservaties of kassa.
- Overzicht van beurzen en voorraadwaarde, en export van alle transacties als CSV.

**Labels** op een Niimbot B1 / B1 Pro via Bluetooth, rechtstreeks vanuit de app (50 × 15 mm, zonder prijs).

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
  ui/        Catalogus/Vault, Scan, Kassa, Beurs, Meer, Toevoegen, ExemplaarSheet, ArtikelSheet, Labels
  klant/     de aparte klantenpagina (eigen bundel, niets van het beheer)
  state.ts   centrale toestand, acties en de offline wachtrij
public/      wat online komt (index.html, app.js, catalogus/, sw.js, data/, vendor/, img/)
scripts/     build, tests, catalogus (TCGdex) en prijsgids (Cardmarket)
supabase/    databaseschema
tests/       unit tests en de e2e-doorloop
```

### Automatisch

- **App publiceren**: bij elke push en elke nacht. Haalt de Cardmarket-prijsgids op, houdt Supabase wakker en zet `public/` op GitHub Pages.
- **Kaartencatalogus bijwerken**: elke maandag, uit [TCGdex](https://github.com/tcgdex/cards-database).

## Bronnen

Kaartgegevens en foto's: [TCGdex](https://tcgdex.dev). Prijzen: de publieke [Cardmarket-prijsgids](https://www.cardmarket.com). Bibliotheken: zie `public/vendor/README.md`.
