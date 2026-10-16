// Profiel › Aanvragen: wat klanten insturen via "Ontwerp je binder" op de klantenpagina. Elke aanvraag
// staat hier (ook als de mail niet aankwam); met de sleutel van Web3Forms komt er ook een mail.
import { useEffect, useState } from "react";
import {
  kanEtalage, laadAanvraagBeelden, laadAanvragen, meld, openAanvragen, SCHEMA_010, sluit, useApp, verwijderAanvraag, zetAanvraagSleutel, zetAanvraagStatus,
} from "../state";
import type { Aanvraag, AanvraagStatus } from "../types";
import { veiligeFoto } from "../lib/eigenfoto";
import { Icoon, Sheet, Veld } from "./common";

const STATUS: Record<AanvraagStatus, string> = { nieuw: "Nieuw", bekeken: "Bekeken", beantwoord: "Beantwoord", gesloten: "Gesloten" };

function tijd(iso: string) {
  return new Date(iso).toLocaleString("nl-BE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function AanvragenSheet({ id }: { id?: string }) {
  const app = useApp();
  const kan = kanEtalage(app);
  const [alles, setAlles] = useState(false);
  useEffect(() => { if (kan) void laadAanvragen(); }, [kan]);
  const open = id ? app.aanvragen?.find((a) => a.id === id) : null;
  if (open) return <AanvraagDetail a={open} />;
  const lijst = (app.aanvragen ?? []).filter((a) => alles || a.status === "nieuw" || a.status === "bekeken");
  const dicht = (app.aanvragen ?? []).length - (app.aanvragen ?? []).filter((a) => a.status === "nieuw" || a.status === "bekeken").length;

  return (
    <Sheet titel="Aanvragen" onSluit={sluit} vol>
      <p className="zacht">Wat klanten insturen via <strong>Ontwerp je binder</strong> op de klantenpagina: hun idee, hun ontwerp en hoe het op een binder staat.</p>
      {!kan ? <p className="nakijken">{SCHEMA_010}</p> : (
        <>
          {app.aanvragen == null ? <p className="zacht">Laden…</p> : !lijst.length ? (
            <div className="etalage-leeg">
              <Icoon naam="brief" maat={40} />
              <p>{alles ? "Nog geen aanvragen." : "Geen open aanvragen."}</p>
            </div>
          ) : (
            <ul className="aanvraag-lijst">
              {lijst.map((a) => (
                <li key={a.id}>
                  <button className={`aanvraag-rij ${a.status}`} onClick={() => openAanvragen(a.id)}>
                    <span className="aanvraag-stip" aria-hidden="true" />
                    <span className="aanvraag-tekst">
                      <strong>{a.naam}</strong>
                      <span className="zacht klein">{tijd(a.aangemaakt_op)}{a.grootte ? ` · ${a.grootte}` : ""}{a.kleur ? ` · ${a.kleur}` : ""}</span>
                      <span className="aanvraag-idee">{a.idee}</span>
                    </span>
                    <span className={`aanvraag-status ${a.status}`}>{STATUS[a.status]}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {dicht > 0 && <button className="tekstknop klein" onClick={() => setAlles(!alles)}>{alles ? "Enkel open aanvragen" : `Ook de ${dicht} afgewerkte tonen`}</button>}
          <MailSleutel />
        </>
      )}
    </Sheet>
  );
}

function AanvraagDetail({ a }: { a: Aanvraag }) {
  const [beelden, setBeelden] = useState<Pick<Aanvraag, "artwork" | "voorbeeld" | "beelden"> | null>(null);
  const [wissen, setWissen] = useState(false);
  const [groot, setGroot] = useState<string | null>(null);
  useEffect(() => {
    let weg = false;
    if (a.status === "nieuw") zetAanvraagStatus(a.id, "bekeken");
    laadAanvraagBeelden(a.id).then((b) => { if (!weg) setBeelden(b); }, () => { if (!weg) setBeelden({ artwork: null, voorbeeld: null, beelden: null }); });
    return () => { weg = true; };
  }, [a.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const onderwerp = encodeURIComponent("Je binder bij Bind'r");
  // Enkel een gewoon adres wordt een mailto-link (geen ?bcc= of zo uit een formulier van buiten).
  const mailbaar = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(a.email);
  const tekst = encodeURIComponent(`Hallo ${a.naam.split(" ")[0]},\n\nBedankt voor je aanvraag voor een eigen binder!\n\n`);
  const fotos = [beelden?.voorbeeld, beelden?.artwork].map(veiligeFoto).filter((x): x is string => !!x);
  const ideeen = (beelden?.beelden ?? []).map(veiligeFoto).filter((x): x is string => !!x);

  return (
    <Sheet titel={a.naam} onSluit={() => openAanvragen()}>
      <div className="aanvraag-detail">
        <p className="zacht klein">{tijd(a.aangemaakt_op)} · <span className={`aanvraag-status ${a.status}`}>{STATUS[a.status]}</span></p>
        <dl className="gegevens">
          <dt>E-mail</dt><dd>{mailbaar ? <a href={`mailto:${a.email}?subject=${onderwerp}&body=${tekst}`}>{a.email}</a> : a.email}</dd>
          {a.telefoon && <><dt>Telefoon</dt><dd><a href={`tel:${a.telefoon.replace(/[^\d+]/g, "")}`}>{a.telefoon}</a></dd></>}
          {a.grootte && <><dt>Binder</dt><dd>{a.grootte}{a.toploader === true ? ", voor toploaders" : a.toploader === false ? ", geen toploaders" : ""}</dd></>}
          {a.kleur && <><dt>Kleur</dt><dd>{a.kleur}</dd></>}
        </dl>
        <section className="blok">
          <h3>Het idee</h3>
          <p className="aanvraag-volledig">{a.idee}</p>
        </section>
        {ideeen.length > 0 && (
          <section className="blok">
            <h3>Afbeeldingen bij het idee</h3>
            <div className="aanvraag-beelden">
              {ideeen.map((f, i) => (
                <button key={i} type="button" onClick={() => setGroot(f)} aria-label={`Afbeelding ${i + 1} groot bekijken`}><img src={f} alt="" /><span>Idee {i + 1}</span></button>
              ))}
            </div>
          </section>
        )}
        {beelden == null ? <p className="zacht klein">Afbeeldingen laden…</p> : fotos.length > 0 && (
          <section className="blok">
            <h3>Ontwerp</h3>
            <div className="aanvraag-beelden">
              {fotos.map((f, i) => (
                <button key={i} type="button" onClick={() => setGroot(f)} aria-label={i === 0 && beelden.voorbeeld ? "Voorbeeld op de binder groot bekijken" : "Ontwerp groot bekijken"}>
                  <img src={f} alt="" />
                  <span>{i === 0 && beelden.voorbeeld ? "Op de binder" : "Hun bestand"}</span>
                </button>
              ))}
            </div>
            <p className="zacht klein">Het voorbeeld is een indicatie die de klant zelf maakte: kijk het bestand na voor je graveert.</p>
          </section>
        )}
        <div className="knoppenrij">
          {mailbaar && <a className="knop" href={`mailto:${a.email}?subject=${onderwerp}&body=${tekst}`} onClick={() => zetAanvraagStatus(a.id, "beantwoord")}><Icoon naam="brief" maat={18} /> Antwoorden</a>}
          {a.status !== "beantwoord" && <button className="knop zacht" onClick={() => { zetAanvraagStatus(a.id, "beantwoord"); meld("Gemarkeerd als beantwoord"); }}>Beantwoord</button>}
          {a.status !== "gesloten"
            ? <button className="knop zacht" onClick={() => { zetAanvraagStatus(a.id, "gesloten"); meld("Aanvraag gesloten"); openAanvragen(); }}>Sluiten</button>
            : <button className="knop zacht" onClick={() => zetAanvraagStatus(a.id, "bekeken")}>Terug openen</button>}
        </div>
        <div className="verwijder-blok">
          {!wissen
            ? <button type="button" className="tekstknop klein rood" onClick={() => setWissen(true)}>Wissen (spam of afgewerkt)</button>
            : (
              <div className="verwijder-vraag">
                <p>Deze aanvraag en haar afbeeldingen voorgoed wissen? Bewaar wat je nodig hebt eerst in je mail.</p>
                <div className="knoppenrij">
                  <button type="button" className="knop zacht klein" onClick={() => setWissen(false)}>Toch niet</button>
                  <button type="button" className="knop klein rood" onClick={() => { verwijderAanvraag(a.id); meld("Aanvraag gewist"); openAanvragen(); }}>Wissen</button>
                </div>
              </div>
            )}
        </div>
      </div>
      {groot && (
        <button type="button" className="foto-groot" onClick={() => setGroot(null)} aria-label="Sluiten">
          <img src={groot} alt="Ontwerp van de klant" />
        </button>
      )}
    </Sheet>
  );
}

/** De sleutel van Web3Forms: zonder komen aanvragen enkel in de app, met ook per mail. */
function MailSleutel() {
  const { aanvraagSleutel } = useApp();
  const [v, setV] = useState(aanvraagSleutel ?? "");
  const [open, setOpen] = useState(false);
  useEffect(() => setV(aanvraagSleutel ?? ""), [aanvraagSleutel]);
  const geldig = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v.trim());
  return (
    <section className="groep">
      <h2 className="groep-titel">Ook per mail</h2>
      <div className="groep-inhoud">
        <p className="groep-uitleg">
          {aanvraagSleutel ? "Elke nieuwe aanvraag komt ook in jullie mailbox (zonder de afbeeldingen: die staan hier)." : "Nu komen aanvragen enkel hier binnen. Wil je ook een mail?"}
        </p>
        {!open && <button className="rij-knop" onClick={() => setOpen(true)}><Icoon naam="brief" maat={18} /> {aanvraagSleutel ? "Sleutel aanpassen" : "Mail instellen"}</button>}
        {open && (
          <>
            <ol className="stappen klein">
              <li>Ga naar <a href="https://web3forms.com" target="_blank" rel="noreferrer">web3forms.com</a> en vul het e-mailadres in waar de aanvragen naartoe moeten (gratis, geen account nodig).</li>
              <li>Je krijgt een <em>access key</em> per mail. Plak die hieronder.</li>
            </ol>
            <Veld label="Access key van Web3Forms" hint="Deze sleutel is bedoeld om openbaar te staan: hij kan enkel mails naar jullie adres sturen.">
              <input value={v} onChange={(e) => setV(e.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" autoCapitalize="off" autoCorrect="off" spellCheck={false} />
            </Veld>
            <div className="knoppenrij">
              <button className="knop" disabled={!geldig && v.trim() !== ""} onClick={() => { zetAanvraagSleutel(v.trim() || null); setOpen(false); meld(v.trim() ? "Aanvragen komen nu ook per mail" : "Mail uitgezet"); }}>Bewaren</button>
              <button className="knop zacht" onClick={() => { setV(aanvraagSleutel ?? ""); setOpen(false); }}>Annuleren</button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
