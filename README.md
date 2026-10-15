# Bind'r Voorraad

De voorraad-app van Bind'r: elk exemplaar in de vitrine en de stockdoos, met een eigen QR-label achteraan de toploader, Cardmarket-prijzen en een knop die zegt welke hartjes moeten wisselen. Werkt op iPhone en Android, gratis te hosten.

**App:** https://bindrstudio.github.io/BindrWebApp/

## Wat fase 1 kan

- **Voorraad** per exemplaar, gesplitst in vitrine (klanten zien die) en stockdoos. Duplicaten krijgen elk een eigen code.
- **Toevoegen** via zoeken (naam, `PFL 130`, `130/94`, ook Japans en Chinees), een foto van de kaart, of handmatig (slabs, eigen producten). Stapelmodus onthoudt taal, conditie en plaats.
- **Scannen**: QR-code achteraan de toploader, een foto van de voorkant, of de code typen (`7K2-QX9`).
- **Prijzen**: Cardmarket-prijsgids van de nacht ervoor. Voorstel = trend × conditiefactor, afgerond op hele euro. Je kiest altijd zelf; wijk je af, dan krijgt de kaart een slotje.
- **Prijzen nakijken**: één knop. Vitrinekaarten waarvan het hartje te ver afwijkt (drempel in euro, per prijsklasse) pulseren rood. De datum van elk hartje wordt bewaard.
- **Labels printen** op een Niimbot B1 / B1 Pro via Bluetooth, rechtstreeks vanuit de app. 50 × 15 mm, zonder prijs. Na het plakken scan je het label; dan staat het op "hangt erop".
- **Artikelen** (sealed, binders, 3D-prints, bulk) geteld per stuk.
- **Demomodus** met een testset van 100 kaarten, zonder account.

Verkopen, ruilen en inkopen aan de stand, de kassa (cash en SumUp), de klantencatalogus en rapportering komen in de volgende fases.

## Printen

| Toestel | Hoe |
|---|---|
| Android | Chrome. Tik *Labels › Verbinden* en kies de printer. |
| iPhone | Safari kan geen Bluetooth. Installeer de gratis app [Bluefy](https://apps.apple.com/app/bluefy-web-ble-browser/id1492822055), open daarin het adres van de app en log in. |

Labelrol: 50 × 15 mm (aanpasbaar in *Labels*). Met *Proeflabel printen* controleer je maat en scherpte; scan het proeflabel daarna met *Scan*.

## Eenmalig klaarzetten (Supabase)

1. Supabase › **SQL Editor** › New query › plak `supabase/schema.sql` › **Run**.
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
npm run e2e        # doorloopt de app in Chromium (Playwright en ffmpeg nodig)
```

`public/app.js` staat mee in git: **voer `npm run build` uit voor je commit**. De workflow *Controle* kijkt dat na.

### Mappen

```
src/
  lib/       prijsregels, codes, catalogus en herkenning, labels, printer, camera, OCR
  store/     Supabase (REST) en de demo (localStorage), met dezelfde interface
  ui/        schermen: Voorraad, Scan, Labels, Meer, Toevoegen, ExemplaarSheet
  state.ts   centrale toestand en acties
public/      wat online komt (index.html, styles.css, app.js, sw.js, data/, vendor/, img/)
scripts/     build, tests, catalogus (TCGdex) en prijsgids (Cardmarket)
supabase/    databaseschema
tests/       unit tests en de e2e-doorloop
```

### Automatisch

- **App publiceren**: bij elke push en elke nacht. Haalt de Cardmarket-prijsgids op, houdt Supabase wakker en zet `public/` op GitHub Pages.
- **Kaartencatalogus bijwerken**: elke maandag, uit [TCGdex](https://github.com/tcgdex/cards-database).

## Bronnen

Kaartgegevens en foto's: [TCGdex](https://tcgdex.dev). Prijzen: de publieke [Cardmarket-prijsgids](https://www.cardmarket.com). Bibliotheken: zie `public/vendor/README.md`.
