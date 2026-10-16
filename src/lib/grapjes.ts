// Grapjes: kleine zinnetjes die de app persoonlijk maken. Enkel in het beheer, nooit voor de klant.
//
// `kies` geeft voor dezelfde sleutel altijd hetzelfde grapje (zodat het niet verspringt als het
// scherm opnieuw tekent); zonder sleutel een willekeurig.

export function kies(lijst: readonly string[], sleutel?: string | number): string {
  if (!lijst.length) return "";
  if (sleutel == null) return lijst[Math.floor(Math.random() * lijst.length)];
  const s = String(sleutel);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return lijst[h % lijst.length];
}

/** Bij de marktprijs van één kaart, per richting van de trend. */
export const KAART: Record<"hard-op" | "op" | "stabiel" | "neer" | "hard-neer", readonly string[]> = {
  "hard-op": [
    "Deze kaart gebruikt Agility: de prijs schiet omhoog.",
    "Hou ze goed vast, deze vliegt.",
    "Stijgt sneller dan een Rayquaza naar de ozonlaag.",
    "Extreme Speed! Deze prijs wacht op niemand.",
    "Zelfs een Pidgeot haalt deze niet meer in.",
    "Iemand gaf haar een Rare Candy: level up!",
    "Gaat omhoog als Team Rocket, maar deze keer met opzet.",
    "Net geëvolueerd. In prijs, dan toch.",
    "Dragon Dance gedaan: snelheid én prijs omhoog.",
    "Hype-trein vertrekt. Instappen of nakijken?",
    "Misschien even niet in de ruilbak leggen.",
    "Shiny-gedrag: plots een stuk meer waard.",
  ],
  op: [
    "Klimt gestaag, zoals een Snorlax die eindelijk opstaat.",
    "Gaat rustig de goede kant op.",
    "Een beetje Growth gebruikt: de prijs groeit.",
    "Langzaam maar zeker, zoals een Slowpoke op een goede dag.",
    "Levelt rustig op, zonder Rare Candy.",
    "Swords Dance, maar in slow motion.",
    "Een Bulbasaur in de zon: het groeit vanzelf.",
    "Zachtjes omhoog, zoals een Hoothoot die opfladdert.",
    "De trend wijst naar boven: het hartje nakijken loont.",
    "Iets meer waard dan vorige maand. Goed bewaard dus!",
    "Stijgt als deeg in een warme keuken.",
    "Een trapje hoger. Nog geen lift, wel een trap.",
  ],
  stabiel: [
    "Stabiel als een Onix.",
    "Zo kalm als een slapende Snorlax.",
    "Niets nieuws: de prijs ligt stil.",
    "Gebruikt Protect: er beweegt niets.",
    "Zo standvastig als een Sudowoodo die doet alsof hij een boom is.",
    "Shuckle-energie: taai, rustig en niet van plan te bewegen.",
    "Het hartje mag blijven zitten.",
    "Deze prijs doet een dutje. Niet wakker maken.",
    "Even spannend als een Metapod die Harden gebruikt.",
    "Rotsvast, zoals een Geodude op zondag.",
    "Geen nieuws is goed nieuws.",
    "De markt knikt vriendelijk naar deze kaart en loopt verder.",
  ],
  neer: [
    "Zakt een beetje. Misschien nog even wachten met inkopen?",
    "Gaat licht omlaag, zoals een Psyduck met hoofdpijn.",
    "Een tikje lager dan vorige maand.",
    "Iemand gebruikte Growl: de prijs zakt een trapje.",
    "Glijdt zachtjes naar beneden, zoals een Slowbro van de glijbaan.",
    "Klein verlies, geen paniek. Eén Potion volstaat.",
    "Even een Magikarp-maandje. Ooit wordt het weer een Gyarados.",
    "Daalt rustig: ruilen is nu slimmer dan kopen.",
    "Kreeg een Charm: de prijs is wat zachter geworden.",
    "Wat lager, maar nog lang niet op de bodem.",
    "Zakt een beetje, net als de motivatie op maandagochtend.",
    "Even uitrusten in het Pokémon Center, dan zien we wel.",
  ],
  "hard-neer": [
    "Deze kaart gebruikte Splash... en zakt hard.",
    "Zakt als een Diglett onder de grond.",
    "Vrije val: goedkoop inkopen, voorzichtig verkopen.",
    "Dig! De prijs zit ondergronds.",
    "Self-Destruct op de markt. Stofwolk, verder niets.",
    "Een reprint op komst? Of verkoopt iedereen tegelijk?",
    "Plat als een Snorlax op een zonnige namiddag.",
    "Super effective... tegen de prijs.",
    "Hard omlaag: tijd voor de vault, niet voor de catalogus.",
    "De prijs is flauwgevallen. Heeft iemand een Revive?",
    "Gyarados werd weer Magikarp.",
    "Een waterval naar beneden, zonder Waterfall.",
  ],
};

/** Bij de trend van een hele set. */
export const SET: Record<"hard-op" | "op" | "stabiel" | "neer" | "hard-neer", readonly string[]> = {
  "hard-op": ["De hele set staat in brand. In de goede zin.", "Iedereen wil deze set. Boosters bewaren!", "Volle zalen voor deze set."],
  op: ["De set doet het goed.", "Rustig in de lift, de hele set.", "Fijne set om mee te nemen naar de beurs."],
  stabiel: ["De set ligt rustig.", "Geen verrassingen in deze set.", "Een set als een kopje thee: rustig."],
  neer: ["De set zakt een beetje.", "Wat minder vraag naar deze set.", "Deze set neemt even pauze."],
  "hard-neer": ["De hele set zakt. Reprint in aantocht?", "Set in vrije val: inkopen kan goedkoop.", "Deze set is even uit de mode."],
};

/** Na een geslaagde verkoop, ruil of inkoop. */
export const GELUKT = {
  verkoop: [
    "Weer een kaart naar een goede thuis.",
    "Kassa! Ka-ching zoals een Meowth met Pay Day.",
    "Die klant gaat vannacht goed slapen.",
    "Gotta sell 'em all.",
    "Nog eentje en we trakteren onszelf op een wafel.",
    "De binder van iemand anders is net mooier geworden.",
    "Verkocht! Het hartje heeft zijn werk gedaan.",
    "Vlot verkocht. Een Jolteon zou jaloers zijn.",
  ],
  ruil: [
    "Ruil geboekt. Iedereen blij, zoals op de speelplaats.",
    "Een eerlijke ruil, zoals het hoort.",
    "Trade evolution! Of gewoon een goede ruil.",
    "Kaart weg, kaart terug. Het cirkeltje is rond.",
    "Ruilen is delen, maar dan slimmer.",
  ],
  inkoop: [
    "Nieuwe kaarten in huis. Vergeet het label niet.",
    "Gevangen! De Poké Ball heeft drie keer geschud.",
    "Welkom in de collectie, kleintje.",
    "Ingekocht. De vault knort tevreden.",
    "Nieuwe voorraad: de catalogus zegt dankjewel.",
  ],
  retour: ["Retour geboekt. Het gebeurt de besten.", "Terug in de voorraad, alsof er niets gebeurd is."],
  kas: ["Kas bijgewerkt. Geen munt die ontsnapt.", "Genoteerd: de cashkoffer klopt weer."],
  prive: ["Van de ene binder naar de andere.", "Geboekt: privé en zaak netjes gescheiden."],
} as const;

/** Na het toevoegen van een of meer exemplaren. */
export const TOEGEVOEGD = [
  "Gevangen! Klaar voor een label.",
  "Nieuw in de collectie.",
  "De Pokédex is weer wat voller.",
  "Toegevoegd. De binder knikt goedkeurend.",
  "Ingeschreven en wel.",
  "Welkom in de voorraad!",
];

/** Als de prijscheck niets vindt. */
export const HARTJES_OK = [
  "Alle hartjes kloppen nog. Tijd voor een wafel.",
  "Alle hartjes zijn nog goed. Niets te doen!",
  "Geen enkel hartje te wisselen. Mooi zo.",
  "Alles klopt. Zelfs een Alakazam vindt niets.",
];

/** Bij de pincode, na "Hallo {naam}". */
export const SLOT = [
  "Welkom terug, trainer.",
  "De kaarten hebben je gemist.",
  "Klaar voor een nieuwe ronde?",
  "Wie is die trainer? Geef je pincode in.",
  "Even je pincode en we zijn vertrokken.",
];

/** Leeg mandje in de kassa. */
export const MANDJE_LEEG = [
  "Scan een kaart om te verkopen, of voeg kaarten van de klant toe voor een ruil of inkoop.",
  "Een leeg mandje is een Ditto: het kan nog alles worden. Scan een kaart of voeg kaarten van de klant toe.",
  "Hier komt de volgende deal. Scan een kaart, of voeg kaarten van de klant toe.",
];
