// Profiel › Binders vooraan en Profiel › Instagram: de foto's op de startpagina van de klanten.
// - Vooraan: foto's van onze binders; de app haalt de achtergrond weg, zet ze recht en knipt ze bij (waaier bovenaan).
// - Instagram: onze laatste berichten, in een strook die doorloopt net boven de beurzen. Automatisch via een feed van
//   Behold (bij het publiceren opgehaald: scripts/instagram.mjs), en/of zelf een foto met de link naar het bericht.
import { useEffect, useRef, useState } from "react";
import {
  etalageLijst, kanEtalage, kanFeed, kanThema, laadEtalage, meld, nieuweEtalagefoto, SCHEMA_010, SCHEMA_013, SCHEMA_015, schuifEtalagefoto, sluit, useApp, verwijderEtalagefoto,
  voegEtalagefotoToe, wijzigEtalagefoto, zetInstagramFeed,
} from "../state";
import type { Etalagefoto, EtalagePlek } from "../types";
import { veiligeFoto, verkleinFoto, verkleinUitgeknipt } from "../lib/eigenfoto";
import { feedSamenvatting, geldigeFeed, siteBerichten } from "../lib/instafeed";
import { dagVan, datumKort } from "../lib/format";
import { klantUrl } from "../config";
import { Icoon, Sheet, Veld } from "./common";

const TEKST: Record<EtalagePlek, { titel: string; max: number; uitleg: string; leeg: string; tip: string; link: string; titelVeld: string; toegevoegd: (n: number) => string }> = {
  voorpagina: {
    titel: "Binders vooraan",
    max: 12,
    uitleg: "De binders bovenaan de startpagina, in de waaier die om de paar seconden draait. Een gewone foto volstaat: de app haalt de achtergrond weg, zet de binder recht en knipt hem bij, zodat hij over de pagina zweeft.",
    leeg: "Nog geen binders. Zolang hier niets staat, tonen we vijf binders die we al maakten.",
    tip: "Zet de binder op een wit blad of een effen achtergrond, met wat ruimte errond, en fotografeer hem van voren. De app haalt de achtergrond weg, zet hem recht en knipt hem bij. Een foto die al uitgeknipt is (iPhone: hou de binder ingedrukt › Deel › Bewaar afbeelding) kan ook.",
    link: "Link (optioneel)",
    titelVeld: "Naam (niet zichtbaar)",
    toegevoegd: (n) => (n === 1 ? "Binder vooraan gezet" : `${n} binders vooraan gezet`),
  },
  instagram: {
    titel: "Instagram",
    max: 30,
    uitleg: "Onze laatste berichten lopen onderaan de startpagina voorbij, net boven de beurzen.",
    leeg: "Nog geen eigen foto's.",
    tip: "Eigen foto's: bewaar de foto van je bericht op je gsm, kies ze hier en plak de link naar het bericht erbij. Ze staan na de berichten die automatisch komen; de bovenste eerst, een nieuwe komt bovenaan. De strook toont er samen hoogstens 16.",
    link: "Link naar het bericht op Instagram",
    titelVeld: "Titel (optioneel)",
    toegevoegd: (n) => (n === 1 ? "Foto in de Instagram-strook" : `${n} foto's in de Instagram-strook`),
  },
};

export function EtalageSheet({ plek }: { plek: EtalagePlek }) {
  const app = useApp();
  const t = TEKST[plek];
  const kan = kanEtalage(app) && (plek === "instagram" || kanThema(app));
  const invoer = useRef<HTMLInputElement>(null);
  const [bezig, setBezig] = useState(false);
  useEffect(() => { if (kan) void laadEtalage(); }, [kan]);
  const lijst = etalageLijst(plek);

  const voegToe = async (bestanden: FileList | null) => {
    if (!bestanden?.length) return;
    setBezig(true);
    try {
      let n = 0, metAchtergrond = 0, weggehaald = 0, rechtgezet = 0;
      for (const f of Array.from(bestanden).slice(0, t.max - (lijst?.length ?? 0))) {
        if (plek === "voorpagina") {
          // Achtergrond weg, rechtzetten en bijknippen: alles zelf (een binder die al recht staat, blijft zoals hij is).
          const r = await verkleinUitgeknipt(f, 900, 450_000, { rechtzetten: true });
          if (!r.doorzichtig) metAchtergrond++;
          if (r.weggehaald) weggehaald++;
          if (r.rechtgezet) rechtgezet++;
          voegEtalagefotoToe(nieuweEtalagefoto(r.url, plek));
        } else {
          voegEtalagefotoToe(nieuweEtalagefoto(await verkleinFoto(f, 480), plek)); // de tegels zijn hoogstens 188 px breed
        }
        n++;
      }
      const gedaan = [weggehaald && "achtergrond weggehaald", rechtgezet && "rechtgezet"].filter(Boolean).join(" en ");
      if (metAchtergrond) meld(`${metAchtergrond === 1 ? "Die foto heeft" : `${metAchtergrond} foto's hebben`} nog een achtergrond die de app niet kon weghalen. Ze staan vooraan, maar op een wit blad of effen achtergrond is het mooier.`, "info", undefined, 8000);
      else if (gedaan) meld(`${t.toegevoegd(n)}: ${gedaan}.`, "info", undefined, 5000);
      else if (n) meld(t.toegevoegd(n));
    } catch (e) {
      meld(e instanceof Error ? e.message : String(e), "fout");
    } finally {
      setBezig(false);
    }
  };

  const demo = app.backend?.soort === "demo";
  return (
    <Sheet titel={t.titel} onSluit={sluit} vol>
      <p className="zacht">{t.uitleg}</p>
      {plek === "instagram" && <InstaAutomatisch />}
      {plek === "instagram" && <h3 className="etalage-kop">Eigen foto's</h3>}
      {!kan ? <p className="nakijken">{plek === "voorpagina" ? SCHEMA_013 : SCHEMA_010}</p> : (
        <>
          <div className="knoppenrij">
            <button className="knop" disabled={bezig || (lijst?.length ?? 0) >= t.max} onClick={() => invoer.current?.click()}>
              <Icoon naam={plek === "voorpagina" ? "uitgeknipt" : "camera"} maat={18} /> {bezig ? "Bezig…" : "Foto's toevoegen"}
            </button>
            <a className="knop zacht" href={klantUrl(demo)} target="_blank" rel="noreferrer"><Icoon naam="oog" maat={18} /> Bekijk als klant</a>
          </div>
          <input ref={invoer} type="file" accept={plek === "voorpagina" ? "image/png,image/webp,image/*" : "image/*"} multiple hidden
            onChange={(e) => { void voegToe(e.target.files); e.target.value = ""; }} />
          {lijst == null ? <p className="zacht">Laden…</p> : !lijst.length ? (
            <div className="etalage-leeg">
              <Icoon naam={plek === "voorpagina" ? "binder" : "instagram"} maat={40} />
              <p>{t.leeg}</p>
            </div>
          ) : (
            <ul className={`etalage-lijst ${plek}`}>
              {lijst.map((f, i) => <EtalageRij key={f.id} f={f} plek={plek} eerste={i === 0} laatste={i === lijst.length - 1} />)}
            </ul>
          )}
          <p className="zacht klein">{t.tip} Klanten zien enkel de foto's{plek === "instagram" ? ", de titel" : ""} en de link.</p>
        </>
      )}
    </Sheet>
  );
}

function EtalageRij({ f, plek, eerste, laatste }: { f: Etalagefoto; plek: EtalagePlek; eerste: boolean; laatste: boolean }) {
  const t = TEKST[plek];
  const [titel, setTitel] = useState(f.titel ?? "");
  const [link, setLink] = useState(f.link ?? "");
  const [zeker, setZeker] = useState(false);
  useEffect(() => { setTitel(f.titel ?? ""); setLink(f.link ?? ""); }, [f.titel, f.link]);
  const bewaar = () => {
    if ((titel.trim() || null) === (f.titel ?? null) && (link.trim() || null) === (f.link ?? null)) return;
    if (!wijzigEtalagefoto(f, { titel, link })) setLink(f.link ?? "");
  };
  const beeld = veiligeFoto(f.foto);
  return (
    <li className="etalage-rij">
      <span className={`etalage-beeld${plek === "voorpagina" ? " uitgeknipt" : ""}`}>{beeld ? <img src={beeld} alt="" /> : <Icoon naam="foto" />}</span>
      <div className="etalage-velden">
        <input value={titel} onChange={(e) => setTitel(e.target.value)} onBlur={bewaar} placeholder={t.titelVeld} maxLength={120} aria-label="Titel" />
        <input value={link} onChange={(e) => setLink(e.target.value)} onBlur={bewaar} placeholder={t.link} inputMode="url" aria-label="Link" />
        <div className="etalage-knoppen">
          <button className="rond-knop" disabled={eerste} onClick={() => schuifEtalagefoto(f, -1)} aria-label="Naar voren"><Icoon naam="op" maat={16} /></button>
          <button className="rond-knop" disabled={laatste} onClick={() => schuifEtalagefoto(f, 1)} aria-label="Naar achteren"><Icoon naam="neer" maat={16} /></button>
          {zeker
            ? <button className="knop klein rood" onClick={() => verwijderEtalagefoto(f)}>Weghalen</button>
            : <button className="tekstknop klein rood" onClick={() => setZeker(true)}>Weg</button>}
        </div>
      </div>
    </li>
  );
}

/**
 * Onze Instagram-berichten automatisch op de site: een gratis JSON-feed van Behold (behold.so) koppelt ons account via
 * de officiële Instagram-API. Bij het publiceren (twee keer per dag) zet de site de laatste berichten in de strook;
 * klanten vragen de feed nooit zelf op. Geen scraping: dat verbiedt Instagram.
 */
function InstaAutomatisch() {
  const app = useApp();
  const feed = app.instagramFeed;
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(feed ?? "");
  const [test, setTest] = useState<{ ok: boolean; tekst: string } | null>(null);
  const [bezig, setBezig] = useState(false);
  const [site, setSite] = useState<{ op: string | null; aantal: number } | null>(null);
  useEffect(() => setV(feed ?? ""), [feed]);
  // Wat staat er nu op de site (bij het laatste publiceren opgehaald)?
  useEffect(() => {
    let weg = false;
    fetch("data/instagram.json", { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!weg && j) setSite({ op: typeof j.bijgewerkt === "string" ? j.bijgewerkt : null, aantal: siteBerichten(j).length }); })
      .catch(() => undefined);
    return () => { weg = true; };
  }, []);
  const geldig = geldigeFeed(v);
  const probeer = async () => {
    if (!geldig) return;
    setBezig(true);
    setTest(null);
    try {
      const r = await fetch(geldig, { cache: "no-store" });
      if (!r.ok) throw new Error(String(r.status));
      const s = feedSamenvatting(await r.json());
      // Behold schrijft +0000 (zonder dubbelpunt): dat leest Safari niet. Een vreemde datum laten we weg.
      const d = s.nieuwste ? new Date(s.nieuwste.replace(/([+-]\d{2})(\d{2})$/, "$1:$2")) : null;
      s.nieuwste = d && !Number.isNaN(d.getTime()) ? d.toISOString() : null;
      setTest(s.aantal
        ? { ok: true, tekst: `In orde: ${s.aantal} ${s.aantal === 1 ? "bericht" : "berichten"}${s.naam ? ` van @${s.naam}` : ""}${s.nieuwste ? `, het nieuwste van ${datumKort(dagVan(s.nieuwste))}` : ""}.` }
        : { ok: true, tekst: "De feed werkt, maar er staan nog geen berichten in." });
    } catch {
      setTest({ ok: false, tekst: "De feed antwoordt niet. Kijk de link na (https://feeds.behold.so/…). Vulde je bij Behold domeinen in, zet er dan ook bindrstudio.github.io bij." });
    } finally {
      setBezig(false);
    }
  };
  const bewaar = () => {
    if (geldig == null) return;
    zetInstagramFeed(geldig || null);
    setOpen(false);
    if (geldig && !kanFeed()) meld(SCHEMA_015, "info", undefined, 9000);
    else meld(geldig ? "Bewaard. De volgende keer dat de site bijwerkt (twee keer per dag) staan de berichten erop." : "Automatisch van Instagram staat uit");
  };
  const stand = site?.op && site.aantal
    ? `Nu op de site: ${site.aantal} ${site.aantal === 1 ? "bericht" : "berichten"}, opgehaald op ${datumKort(dagVan(site.op))} om ${new Date(site.op).toLocaleTimeString("nl-BE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Brussels" })}.`
    : null;
  return (
    <section className="groep insta-auto">
      <h2 className="groep-titel">Automatisch van Instagram</h2>
      <div className="groep-inhoud">
        <p className="groep-uitleg">
          {feed
            ? <>Aan. Zet je iets op Instagram, dan komt het vanzelf in de strook (de site werkt twee keer per dag bij). {stand}</>
            : "Zet je iets op Instagram, dan komt het vanzelf op de site. Eén keer instellen, gratis."}
        </p>
        {!open && <button className="rij-knop" onClick={() => setOpen(true)}><Icoon naam="instagram" maat={18} /> {feed ? "Feed aanpassen" : "Instellen"}</button>}
        {open && (
          <>
            <ol className="stappen klein">
              <li>Ons Instagram-account moet een professioneel account zijn (bedrijf of maker; in Instagram: Instellingen › Accounttype). Dat is gratis.</li>
              <li>Maak een gratis account op <a href="https://behold.so" target="_blank" rel="noreferrer">behold.so</a> en koppel ons Instagram-account (<em>basic source</em>: rechtstreeks via Instagram, geen Facebook-pagina nodig). Behold gebruikt de officiële koppeling van Instagram en ziet ons wachtwoord nooit.</li>
              <li>Kies <em>New feed</em> › <em>JSON feed</em>. Wil je domeinen invullen, zet er dan bindrstudio.github.io bij.</li>
              <li>Kopieer de link van de feed (https://feeds.behold.so/…) en plak ze hieronder.</li>
            </ol>
            <Veld label="Link van de feed" hint="Gratis: de 6 laatste berichten, één keer per dag bijgewerkt. Leeg = uit. De link is openbaar bedoeld, zoals een feed op een website.">
              <input value={v} onChange={(e) => { setV(e.target.value); setTest(null); }} placeholder="https://feeds.behold.so/…" inputMode="url" autoCapitalize="off" autoCorrect="off" spellCheck={false} />
            </Veld>
            {geldig == null && <p className="nakijken klein">Dat is geen feed van Behold: de link begint met https://feeds.behold.so/</p>}
            {test && <p className={test.ok ? "zacht klein" : "nakijken klein"} role="status">{test.tekst}</p>}
            <div className="knoppenrij">
              <button className="knop" disabled={geldig == null} onClick={bewaar}>Bewaren</button>
              <button className="knop zacht" disabled={!geldig || bezig} onClick={() => void probeer()}>{bezig ? "Bezig…" : "Test de feed"}</button>
              <button className="tekstknop" onClick={() => { setV(feed ?? ""); setTest(null); setOpen(false); }}>Annuleren</button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
