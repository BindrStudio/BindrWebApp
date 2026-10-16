// "Ontwerp je binder": een klant probeert een eigen zwart-wit ontwerp (SVG of PNG) op een zip-binder en
// stuurt een aanvraag met zijn idee. De aanvraag komt in de app van Bind'r (Profiel › Aanvragen) en, als
// de beheerders een sleutel van Web3Forms invulden, ook per mail. Het voorbeeld is een indicatie.
import { useEffect, useRef, useState, type PointerEvent as WijsEvent, type ReactNode } from "react";
import { SUPABASE_KEY, SUPABASE_URL } from "../config";
import { uuid } from "../lib/uuid";
import {
  BINDER_H, BINDER_KLEUREN, BINDER_W, DRUKVLAK, INKTEN, leesOntwerp, lichtOpDonker, maakMasker, ontwerpAlsPng, tekenBinder, tekenOntwerp, vakVan, voorbeeldAlsJpeg,
  type Ontwerp, type Plaatsing,
} from "./binder";

const GROOTTES = ["4-pocket", "9-pocket", "12-pocket", "9-pocket toploader", "Weet ik nog niet"];
const WENSEN = ["Mijn eigen tekening", "Een naam of tekst", "Mijn favoriete Pokémon", "Voor- én achterkant", "Als cadeau"];
const STANDAARD: Plaatsing = { schaal: 0.62, x: 0.5, y: 0.46 };

interface Props { demo: boolean; sleutel: string | null; ig: string; igLink: string }

export function OntwerpPagina({ demo, sleutel, ig, igLink }: Props) {
  const [kleur, setKleur] = useState(BINDER_KLEUREN[0]);
  const [inkt, setInkt] = useState(INKTEN[0]);
  const [bron, setBron] = useState<HTMLCanvasElement | null>(null);
  const [ontwerp, setOntwerp] = useState<Ontwerp | null>(null);
  const [plaats, setPlaats] = useState<Plaatsing>(STANDAARD);
  const [bestandFout, setBestandFout] = useState<string | null>(null);
  const [bestandNaam, setBestandNaam] = useState<string | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const invoer = useRef<HTMLInputElement>(null);
  const sleep = useRef<{ id: number; x: number; y: number; p: Plaatsing } | null>(null);

  // Lichte binder: standaard zwarte inkt, donkere binder: witte.
  useEffect(() => { setInkt(kleur.id === "wit" || kleur.id === "geel" || kleur.id === "roze" ? INKTEN[2] : INKTEN[0]); }, [kleur]);

  // Tekenen (scherp op elk scherm)
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = BINDER_W * dpr;
    c.height = BINDER_H * dpr;
    const ctx = c.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, BINDER_W, BINDER_H);
    tekenBinder(ctx, kleur.kleur);
    if (ontwerp) tekenOntwerp(ctx, ontwerp, plaats, inkt.kleur);
    else {
      // Waar het ontwerp kan komen
      ctx.save();
      ctx.setLineDash([12, 10]);
      ctx.lineWidth = 3;
      ctx.strokeStyle = kleur.id === "wit" || kleur.id === "geel" ? "rgba(0,0,0,.25)" : "rgba(255,255,255,.35)";
      ctx.strokeRect(DRUKVLAK.x + 40, DRUKVLAK.y + 60, DRUKVLAK.w - 80, DRUKVLAK.h - 120);
      ctx.restore();
    }
  }, [kleur, inkt, ontwerp, plaats]);

  const kies = async (f: File | undefined) => {
    if (!f) return;
    setBestandFout(null);
    try {
      const c = await leesOntwerp(f);
      const om = lichtOpDonker(c);
      setBron(c);
      setOntwerp(maakMasker(c, om));
      setPlaats(STANDAARD);
      setBestandNaam(f.name);
    } catch (e) {
      setBestandFout(e instanceof Error ? e.message : String(e));
    }
  };
  const keerOm = () => { if (bron && ontwerp) setOntwerp(maakMasker(bron, !ontwerp.omgekeerd)); };

  // Verslepen op de binder
  const naarTekening = (e: WijsEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * BINDER_W, y: ((e.clientY - r.top) / r.height) * BINDER_H };
  };
  const neer = (e: WijsEvent<HTMLCanvasElement>) => {
    if (!ontwerp) return; // zonder ontwerp: een gewone tik (onClick) opent de bestandskeuze
    const p = naarTekening(e);
    e.currentTarget.setPointerCapture(e.pointerId);
    sleep.current = { id: e.pointerId, x: p.x, y: p.y, p: plaats };
  };
  const beweeg = (e: WijsEvent<HTMLCanvasElement>) => {
    const s = sleep.current;
    if (!s || s.id !== e.pointerId || !ontwerp) return;
    const p = naarTekening(e);
    const x = Math.min(1, Math.max(0, s.p.x + (p.x - s.x) / DRUKVLAK.w));
    const y = Math.min(1, Math.max(0, s.p.y + (p.y - s.y) / DRUKVLAK.h));
    setPlaats({ ...s.p, x, y });
  };
  const los = () => { sleep.current = null; };
  const vak = ontwerp ? vakVan(ontwerp, plaats) : null;

  return (
    <>
      <header className="sectie-kop">
        <h1>Ontwerp je binder</h1>
        <p>Heb je een eigen tekening, een logo of een idee? Wij maken er een binder van. Probeer hieronder hoe je ontwerp op een zip-binder staat en stuur ons je aanvraag.</p>
      </header>

      <section className="ontwerp" aria-labelledby="probeer-titel">
        <div className="ontwerp-binder">
          <canvas ref={canvas} className={`ontwerp-canvas${ontwerp ? " sleepbaar" : ""}`} role="img"
            aria-label={ontwerp ? `Voorbeeld: jouw ontwerp op een ${kleur.naam.toLowerCase()}e binder` : `Een ${kleur.naam.toLowerCase()}e zip-binder`}
            onClick={() => { if (!ontwerp) invoer.current?.click(); }}
            onPointerDown={neer} onPointerMove={beweeg} onPointerUp={los} onPointerCancel={los} />
          {!ontwerp && (
            <button type="button" className="ontwerp-leeg" onClick={() => invoer.current?.click()}>
              <UploadIcoon />
              <strong>Kies je ontwerp</strong>
              <span>SVG of PNG, zwart-wit</span>
            </button>
          )}
          {vak && <span className="verborgen" aria-live="polite">Ontwerp op {Math.round(plaats.schaal * 100)}% van de breedte</span>}
          <p className="ontwerp-noot">Een indicatie: kleur en structuur van de echte binder kunnen wat verschillen.</p>
        </div>

        <div className="ontwerp-keuzes">
          <h2 id="probeer-titel">Probeer je ontwerp</h2>
          <div className="ontwerp-bestand">
            <button type="button" className="knop" onClick={() => invoer.current?.click()}><UploadIcoon /> {ontwerp ? "Ander bestand" : "Kies een bestand"}</button>
            {bestandNaam && <span className="ontwerp-naam">{bestandNaam}</span>}
            <input ref={invoer} type="file" accept="image/svg+xml,image/png,image/jpeg,image/webp,.svg" hidden onChange={(e) => { void kies(e.target.files?.[0]); e.target.value = ""; }} />
          </div>
          {bestandFout && <p className="ontwerp-fout" role="alert">{bestandFout}</p>}
          <p className="ontwerp-tip">Best: een zwart-wit tekening of logo op een witte of doorzichtige achtergrond. Wat zwart is, komt op de binder.</p>

          <fieldset className="keuze-groep">
            <legend>Kleur van de binder</legend>
            <div className="stalen">
              {BINDER_KLEUREN.map((k) => (
                <button key={k.id} type="button" className={`staal${k.id === kleur.id ? " aan" : ""}`} style={{ ["--staal" as string]: k.kleur }}
                  aria-pressed={k.id === kleur.id} aria-label={k.naam} title={k.naam} onClick={() => setKleur(k)} />
              ))}
            </div>
          </fieldset>

          {ontwerp && (
            <>
              <fieldset className="keuze-groep">
                <legend>Kleur van het ontwerp</legend>
                <div className="segmentje">
                  {INKTEN.map((i) => (
                    <button key={i.id} type="button" className={i.id === inkt.id ? "aan" : ""} aria-pressed={i.id === inkt.id} onClick={() => setInkt(i)}>
                      <span className="inkt-bol" style={{ background: i.kleur }} />{i.naam}
                    </button>
                  ))}
                </div>
              </fieldset>
              <label className="keuze-groep schuif">
                <span>Grootte</span>
                <input type="range" min={15} max={100} step={1} value={Math.round(plaats.schaal * 100)} onChange={(e) => setPlaats({ ...plaats, schaal: Number(e.target.value) / 100 })} />
              </label>
              <div className="ontwerp-knoppen">
                <button type="button" className="tekstknop" onClick={keerOm}>Wit en zwart omkeren</button>
                <button type="button" className="tekstknop" onClick={() => setPlaats({ ...STANDAARD, schaal: plaats.schaal })}>Centreren</button>
              </div>
              <p className="ontwerp-tip">Versleep je ontwerp op de binder om het te verplaatsen.</p>
            </>
          )}
        </div>
      </section>

      <Aanvraag demo={demo} sleutel={sleutel} kleur={kleur.naam} ontwerp={ontwerp} maakVoorbeeld={() => voorbeeldAlsJpeg(kleur.kleur, ontwerp, plaats, inkt.kleur)} ig={ig} igLink={igLink} />
    </>
  );
}

// ── Het formulier ──────────────────────────────────────────────────────────────

type Stand = { soort: "invullen" } | { soort: "bezig" } | { soort: "klaar"; mail: boolean } | { soort: "fout"; tekst: string };

function Aanvraag({ demo, sleutel, kleur, ontwerp, maakVoorbeeld, ig, igLink }: {
  demo: boolean; sleutel: string | null; kleur: string; ontwerp: Ontwerp | null; maakVoorbeeld: () => string; ig: string; igLink: string;
}) {
  const [v, setV] = useState({ naam: "", email: "", telefoon: "", grootte: "9-pocket", idee: "", honing: "" });
  const [wensen, setWensen] = useState<Set<string>>(new Set());
  const [metOntwerp, setMetOntwerp] = useState(true);
  const [stand, setStand] = useState<Stand>({ soort: "invullen" });
  const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email.trim());
  const ok = v.naam.trim().length > 0 && emailOk && (v.idee.trim().length > 0 || wensen.size > 0);

  const verstuur = async () => {
    if (!ok || stand.soort === "bezig") return;
    // Een robot vult het verborgen veld in: doe alsof het lukte.
    if (v.honing) { setStand({ soort: "klaar", mail: false }); return; }
    setStand({ soort: "bezig" });
    const idee = [wensen.size ? `Wensen: ${[...wensen].join(", ")}` : "", v.idee.trim()].filter(Boolean).join("\n\n").slice(0, 4000);
    const rij = {
      naam: v.naam.trim().slice(0, 120), email: v.email.trim().slice(0, 200), telefoon: v.telefoon.trim().slice(0, 40) || null,
      grootte: v.grootte, kleur, idee,
      artwork: metOntwerp && ontwerp ? ontwerpAlsPng(ontwerp) : null,
      voorbeeld: metOntwerp && ontwerp ? maakVoorbeeld() : null,
    };
    if (demo) {
      try {
        const d = JSON.parse(localStorage.getItem("bindr-demo-v1") || "{}");
        d.aanvragen = [...(d.aanvragen ?? []), { ...rij, id: uuid(), status: "nieuw", aangemaakt_op: new Date().toISOString() }];
        localStorage.setItem("bindr-demo-v1", JSON.stringify(d));
        setStand({ soort: "klaar", mail: false });
      } catch {
        setStand({ soort: "fout", tekst: "Bewaren in de demo lukte niet (het geheugen van de browser is vol)." });
      }
      return;
    }
    let bewaard = false;
    let fout: string | null = null;
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/aanvragen`, {
        method: "POST",
        headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify(rij),
      });
      if (r.ok) bewaard = true;
      else if (r.status !== 404) {
        const j = await r.json().catch(() => null) as { message?: string; code?: string } | null;
        fout = j?.code === "P0001" && j.message ? j.message : "Controleer je naam en e-mailadres en probeer opnieuw.";
      }
    } catch {
      fout = "Geen verbinding. Controleer je internet en probeer opnieuw.";
    }
    let gemaild = false;
    if (sleutel && !fout) {
      try {
        const r = await fetch("https://api.web3forms.com/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            access_key: sleutel,
            subject: `Nieuwe binderaanvraag van ${rij.naam}`,
            from_name: "Bind'r klantenpagina",
            replyto: rij.email,
            Naam: rij.naam, "E-mail": rij.email, Telefoon: rij.telefoon ?? "", Binder: `${rij.grootte}, ${rij.kleur}`, Idee: rij.idee,
            Ontwerp: rij.artwork ? (bewaard ? "Bijgevoegd in de app: Profiel › Aanvragen" : "De klant had een ontwerp, maar het kon niet bewaard worden: vraag het per mail.") : "Geen bestand",
          }),
        });
        gemaild = r.ok;
      } catch { /* de mail is een extra: de aanvraag staat in de app */ }
    }
    if (bewaard || gemaild) setStand({ soort: "klaar", mail: gemaild });
    else setStand({ soort: "fout", tekst: fout ?? "Aanvragen kan hier nog niet. Stuur ons een bericht op Instagram." });
  };

  if (stand.soort === "klaar") {
    return (
      <section className="aanvraag klaar" aria-live="polite">
        <span className="aanvraag-vink" aria-hidden="true"><VinkIcoon /></span>
        <h2>Bedankt, {v.naam.trim().split(" ")[0] || "we hebben je aanvraag"}!</h2>
        <p>{demo ? "In de demo staat je aanvraag nu in het beheer (Profiel › Aanvragen) op dit toestel." : "We bekijken je idee en antwoorden zo snel mogelijk per mail."} Ondertussen kun je onze binders bekijken.</p>
        <div className="held-knoppen">
          <a className="knop" href="#binders">Bekijk de binders</a>
          <a className="knop zacht" href={igLink} target="_blank" rel="noreferrer">@{ig}</a>
        </div>
      </section>
    );
  }

  const zet = (w: Partial<typeof v>) => setV({ ...v, ...w });
  return (
    <section className="aanvraag" aria-labelledby="aanvraag-titel">
      <h2 id="aanvraag-titel">Vraag je binder aan</h2>
      <p className="aanvraag-uitleg">Vertel ons wat je wilt. We sturen je een voorstel met prijs; je zit nergens aan vast.</p>
      <form className="aanvraag-form" onSubmit={(e) => { e.preventDefault(); void verstuur(); }} noValidate>
        <fieldset className="keuze-groep">
          <legend>Wat wil je?</legend>
          <div className="wens-chips">
            {WENSEN.map((w) => (
              <button key={w} type="button" className={`chip${wensen.has(w) ? " aan" : ""}`} aria-pressed={wensen.has(w)}
                onClick={() => { const n = new Set(wensen); if (n.has(w)) n.delete(w); else n.add(w); setWensen(n); }}>{w}</button>
            ))}
          </div>
        </fieldset>
        <label className="veld">
          <span>Je idee</span>
          <textarea value={v.idee} onChange={(e) => zet({ idee: e.target.value })} rows={4} maxLength={3800}
            placeholder="Bv. Gengar in de stijl van de oude kaarten, met mijn naam onderaan. Of: een binder voor mijn Eeveelutions." />
        </label>
        <fieldset className="keuze-groep">
          <legend>Welke binder?</legend>
          <div className="wens-chips">
            {GROOTTES.map((g) => (
              <button key={g} type="button" className={`chip${v.grootte === g ? " aan" : ""}`} aria-pressed={v.grootte === g} onClick={() => zet({ grootte: g })}>{g}</button>
            ))}
          </div>
          <span className="veld-hint">Kleur: {kleur.toLowerCase()} (kies hierboven)</span>
        </fieldset>
        <div className="twee-velden">
          <label className="veld">
            <span>Naam</span>
            <input value={v.naam} onChange={(e) => zet({ naam: e.target.value })} autoComplete="name" maxLength={120} required />
          </label>
          <label className="veld">
            <span>E-mail</span>
            <input type="email" value={v.email} onChange={(e) => zet({ email: e.target.value })} autoComplete="email" inputMode="email" maxLength={200} required
              aria-invalid={v.email.trim() !== "" && !emailOk} />
          </label>
        </div>
        <label className="veld">
          <span>Telefoon <em>(optioneel)</em></span>
          <input type="tel" value={v.telefoon} onChange={(e) => zet({ telefoon: e.target.value })} autoComplete="tel" maxLength={40} />
        </label>
        <label className="honing" aria-hidden="true">Laat leeg<input tabIndex={-1} autoComplete="off" value={v.honing} onChange={(e) => zet({ honing: e.target.value })} /></label>
        {ontwerp && (
          <label className="meesturen">
            <input type="checkbox" checked={metOntwerp} onChange={(e) => setMetOntwerp(e.target.checked)} />
            <span>Stuur mijn ontwerp en het voorbeeld op de binder mee</span>
          </label>
        )}
        <p className="privacy">We gebruiken je gegevens enkel om je aanvraag te beantwoorden en bewaren ze niet langer dan nodig. Ze gaan naar Bind'r{sleutel ? " (in onze beveiligde database en per mail)" : " (in onze beveiligde database)"}, nergens anders heen.</p>
        {stand.soort === "fout" && <p className="ontwerp-fout" role="alert">{stand.tekst}</p>}
        <button className="knop groot" type="submit" disabled={!ok || stand.soort === "bezig"}>
          {stand.soort === "bezig" ? "Versturen…" : "Verstuur mijn aanvraag"}
        </button>
        {!ok && <p className="veld-hint">{!v.naam.trim() ? "Vul je naam in" : !emailOk ? "Vul een geldig e-mailadres in" : "Vertel ons kort je idee"} om te versturen.</p>}
      </form>
    </section>
  );
}

function Svg({ maat = 20, children }: { maat?: number; children: ReactNode }) {
  return <svg width={maat} height={maat} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>;
}
const UploadIcoon = () => <Svg><path d="M12 16V4M7 8.5 12 3.5l5 5" /><path d="M4.5 15v3.5a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V15" /></Svg>;
const VinkIcoon = () => <Svg maat={34}><path d="m5 12.5 4.5 4.5L19 7.5" /></Svg>;
