// Wat de wet vraagt op de website van een onderneming: wie we zijn (onderaan elke pagina), een
// privacyverklaring (ook over cookies) en verkoopvoorwaarden. De teksten volgen de Belgische regels
// (Wetboek van economisch recht, AVG, de cookieregels van de GBA). Laat ze nakijken door een jurist of
// boekhouder; de gegevens zelf vullen de beheerders in (Instellingen › Klantencatalogus › Wettelijke gegevens).
import type { ReactNode } from "react";
import type { BedrijfPubliek } from "../types";

/** "0123456789" of "BE 0123.456.789" → "0123.456.789". */
export function kboMooi(kbo: string | null | undefined): string | null {
  const d = (kbo ?? "").replace(/\D/g, "");
  if (d.length === 10) return `${d.slice(0, 4)}.${d.slice(4, 7)}.${d.slice(7)}`;
  if (d.length === 9) return `0${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return (kbo ?? "").trim() || null;
}

const BIJGEWERKT = "16 oktober 2026";

function Wie({ b }: { b: BedrijfPubliek | null }) {
  const kbo = kboMooi(b?.kbo);
  return (
    <p>
      <strong>{b?.handelsnaam || "Bind'r"}</strong>
      {b?.naam ? <> is een eenmanszaak van {b.naam}</> : null}
      {b?.adres ? <>, {b.adres}</> : null}
      {kbo ? <>, ondernemingsnummer {kbo}</> : null}.
      {b?.email ? <> Je bereikt ons via <a href={`mailto:${b.email}`}>{b.email}</a>{b.telefoon ? <> of {b.telefoon}</> : null}.</> : null}
    </p>
  );
}

function Pagina({ titel, children }: { titel: string; children: ReactNode }) {
  return (
    <article className="juridisch">
      <header className="sectie-kop">
        <h1>{titel}</h1>
        <p>Laatst bijgewerkt op {BIJGEWERKT}.</p>
      </header>
      {children}
      <p className="juridisch-terug"><a className="knop zacht" href="#">Naar de start</a></p>
    </article>
  );
}

export function Privacy({ b, mail }: { b: BedrijfPubliek | null; mail: boolean }) {
  const contact = b?.email ? <a href={`mailto:${b.email}`}>{b.email}</a> : "een bericht op Instagram of Facebook";
  return (
    <Pagina titel="Privacy en cookies">
      <section>
        <h2>Wie zijn we?</h2>
        <Wie b={b} />
        <p>Wij zijn verantwoordelijk voor de gegevens die je ons geeft. Vragen over je gegevens? Stuur {contact}.</p>
      </section>
      <section>
        <h2>Welke gegevens, en waarom?</h2>
        <ul>
          <li><strong>Als je deze site bekijkt:</strong> we houden geen bezoekersstatistieken bij en gebruiken geen trackers of advertenties. Om de pagina te tonen zien onze hosting (GitHub Pages) en onze databank (Supabase) technisch je IP-adres; wij gebruiken dat niet. De foto's van de kaarten komen van TCGdex, Limitless TCG en pokemontcg.io: ook die diensten zien daardoor je IP-adres.</li>
          <li><strong>Als je een binder aanvraagt</strong> (Ontwerp je binder): je naam, e-mail, eventueel je telefoonnummer, je idee, je afbeeldingen en je ontwerp. We gebruiken ze om je aanvraag te beantwoorden en, als je bestelt, je binder te maken (op jouw vraag, voor een overeenkomst: art. 6.1.b AVG). We bewaren je aanvraag tot ze afgewerkt is en hoogstens 12 maanden na ons laatste contact.{mail ? " Je aanvraag komt ook per mail bij ons binnen, via de dienst Web3Forms." : ""}</li>
          <li><strong>Als we kaarten van je kopen</strong> aan onze stand: wat we kochten, de prijs, de datum en, als je die geeft, je naam, gemeente, handtekening en een foto van de kaarten. Dat moet voor onze boekhouding (wettelijke verplichting: art. 6.1.c AVG) en we bewaren het 10 jaar. We vragen nooit je rijksregisternummer of een kopie van je identiteitskaart.</li>
          <li><strong>Als je ons een bericht stuurt</strong> via Instagram of Facebook: daarvoor gelden ook de privacyregels van Meta.</li>
        </ul>
      </section>
      <section>
        <h2>Met wie delen we je gegevens?</h2>
        <p>We verkopen of verhuren je gegevens nooit. Enkel diensten die ons helpen, verwerken ze voor ons: Supabase (databank), GitHub (hosting van deze site){mail ? " en Web3Forms (mail)" : ""}. Gebeurt dat buiten de Europese Unie, dan enkel met de waarborgen die de AVG vraagt (zoals de standaardcontractbepalingen van de EU).</p>
      </section>
      <section>
        <h2>Je rechten</h2>
        <p>Je mag je gegevens inkijken, laten verbeteren of wissen, de verwerking laten beperken, bezwaar maken en je gegevens opvragen om mee te nemen. Stuur daarvoor {contact}; we antwoorden binnen een maand. Ben je niet tevreden, dan kun je klacht indienen bij de <a href="https://www.gegevensbeschermingsautoriteit.be" target="_blank" rel="noreferrer">Gegevensbeschermingsautoriteit</a> (Drukpersstraat 35, 1000 Brussel).</p>
      </section>
      <section id="cookies">
        <h2>Cookies</h2>
        <p>Deze site plaatst <strong>geen cookies</strong> en volgt je niet. Ze bewaart enkel in je eigen browser:</p>
        <ul>
          <li>dat je de melding met de eend sloot (dan tonen we ze 3 dagen niet meer);</li>
          <li>een kopie van de pagina en de foto's, zodat de catalogus ook werkt als het internet aan onze stand even wegvalt.</li>
        </ul>
        <p>Dat is strikt nodig of door jou gevraagd, deelt niets met anderen en vraagt daarom geen toestemming. Wil je het weg, wis dan de websitegegevens in je browser. Onze lettertypes staan op onze eigen site (niet bij Google). Klik je op Instagram of Facebook, dan gelden daar hun eigen cookies.</p>
      </section>
    </Pagina>
  );
}

export function Voorwaarden({ b }: { b: BedrijfPubliek | null }) {
  const contact = b?.email ? <a href={`mailto:${b.email}`}>{b.email}</a> : "een bericht op Instagram of Facebook";
  const vrij = b?.vrijstelling !== false;
  return (
    <Pagina titel="Verkoopvoorwaarden">
      <section>
        <h2>1. Wie zijn we?</h2>
        <Wie b={b} />
      </section>
      <section>
        <h2>2. Wanneer gelden deze voorwaarden?</h2>
        <p>Voor alles wat je bij ons koopt of bestelt: aan onze stand op een beurs, via een bericht (Instagram, Facebook, e-mail) of na een aanvraag op deze site. Wat we anders afspreken, zetten we op papier of in een bericht.</p>
      </section>
      <section>
        <h2>3. Ons aanbod en de prijzen</h2>
        <p>Deze site is een catalogus, geen webshop: je koopt aan onze stand of na afspraak. We tonen wat we hebben, zolang de voorraad strekt; een duidelijke prijsfout mogen we rechtzetten.</p>
        <p>Alle prijzen zijn in euro en eindprijzen.{vrij ? " Als kleine onderneming vallen we onder de bijzondere vrijstellingsregeling kleine ondernemingen: we rekenen geen btw aan." : " Ze zijn inclusief btw."} Verzenden we iets, dan spreken we de kosten en de manier vooraf af.</p>
      </section>
      <section>
        <h2>4. Kaarten</h2>
        <p>We geven bij elke kaart de conditie (Near Mint, Excellent …) naar beste weten; bij een graded kaart staan de grader en de grade van het label. De foto op deze site kan een standaardfoto van die kaart zijn en niet jouw exemplaar: bekijk de kaart gerust aan onze stand of vraag ons een foto. De waarde van kaarten op de markt schommelt; een prijsdaling na je aankoop geeft geen recht op een terugbetaling.</p>
      </section>
      <section>
        <h2>5. Binders op maat</h2>
        <ul>
          <li><strong>Aanvraag en voorstel.</strong> Een aanvraag is vrijblijvend. We sturen je een voorstel met de binder, het ontwerp, de prijs, de betaling en wanneer hij klaar is. De bestelling staat pas vast als je dat voorstel goedkeurt.</li>
          <li><strong>Je ontwerp.</strong> Geef je ons een eigen ontwerp, dan bevestig je dat je het mag gebruiken. We mogen een ontwerp weigeren, bijvoorbeeld als het de rechten van iemand anders schendt of kwetsend is. Een foto van je binder delen we enkel op Instagram of Facebook als je dat goed vindt.</li>
          <li><strong>Lasergravure.</strong> Elke binder graveren we apart, op een materiaal met structuur. De kleur, de diepte, de scherpte en de plaats van de gravure kunnen per binder licht verschillen en wijken altijd wat af van het voorbeeld op het scherm (ook de voorbeelden op deze site zijn een indicatie, en elk scherm toont kleuren anders). Zulke kleine verschillen horen bij lasergravure en zijn geen gebrek.</li>
          <li><strong>Geen herroeping.</strong> Een binder die we volgens jouw wensen maken, kun je niet herroepen (artikel VI.53, 3° van het Wetboek van economisch recht).</li>
        </ul>
      </section>
      <section>
        <h2>6. Afzien van een aankoop op afstand (herroepingsrecht)</h2>
        <p>Koop je aan onze stand, dan is de koop definitief. Koop je iets dat niet op maat gemaakt is op afstand (via een bericht of e-mail) en sturen we het op, dan mag je binnen 14 dagen nadat je het ontvangen hebt zonder reden afzien van de koop. Laat het ons weten via {contact} (bijvoorbeeld met het formulier hieronder) en stuur het binnen 14 dagen terug, in de staat waarin je het kreeg; de kosten om terug te sturen zijn voor jou. We betalen je binnen 14 dagen terug, ten vroegste als we het product terug hebben. Je mag een product bekijken zoals in een winkel; ging het meer gebruikt terug (bijvoorbeeld een geopende booster), dan mogen we de waardevermindering aanrekenen.</p>
        <details className="modelformulier">
          <summary>Modelformulier voor herroeping</summary>
          <p>(Vul dit formulier enkel in als je de overeenkomst wilt herroepen.)</p>
          <p>Aan {b?.handelsnaam || "Bind'r"}{b?.naam ? `, ${b.naam}` : ""}{b?.adres ? `, ${b.adres}` : ""}{b?.email ? `, ${b.email}` : ""}:</p>
          <p>Ik/Wij (*) deel/delen (*) u hierbij mede dat ik/wij (*) onze overeenkomst betreffende de verkoop van de volgende goederen herroep/herroepen (*):</p>
          <p>Besteld op (*)/ontvangen op (*):<br />Naam/Namen consument(en):<br />Adres consument(en):<br />Handtekening van consument(en) (alleen wanneer dit formulier op papier wordt ingediend):<br />Datum:</p>
          <p>(*) Doorhalen wat niet van toepassing is.</p>
        </details>
      </section>
      <section>
        <h2>7. Garantie</h2>
        <p>Je hebt de wettelijke garantie: 2 jaar voor nieuwe producten (binders, 3D-prints, sealed) en 1 jaar voor tweedehands producten (losse en graded kaarten). Meld een gebrek zo snel mogelijk en uiterlijk 2 maanden nadat je het vaststelde. Normale slijtage, verkeerd gebruik en de kleine verschillen van een lasergravure (punt 5) vallen niet onder de garantie.</p>
      </section>
      <section>
        <h2>8. Betalen</h2>
        <p>Cash (hoogstens € 3.000 per aankoop, zo wil de wet), met de kaart via SumUp of per overschrijving. Bij een binder op maat staat de betaling in ons voorstel.</p>
      </section>
      <section>
        <h2>9. Aansprakelijkheid</h2>
        <p>Onze aansprakelijkheid is beperkt tot de prijs van het product, behalve bij opzet of een zware fout, en behalve waar de wet iets anders zegt.</p>
      </section>
      <section>
        <h2>10. Een klacht of een geschil</h2>
        <p>Is er iets niet in orde? Laat het ons weten via {contact}: we zoeken samen een oplossing. Lukt dat niet, dan kun je terecht bij de <a href="https://consumentenombudsdienst.be" target="_blank" rel="noreferrer">Consumentenombudsdienst</a>. Het Belgisch recht is van toepassing; als consument mag je ook naar de rechter van je woonplaats.</p>
      </section>
      <section>
        <h2>11. Wijzigingen</h2>
        <p>We kunnen deze voorwaarden aanpassen. Voor jouw aankoop gelden de voorwaarden van de dag waarop je kocht of bestelde.</p>
      </section>
    </Pagina>
  );
}
