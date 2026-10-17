// "Ontwerp je binder": een klant vraagt een binder op maat aan (zijn idee, afbeeldingen, welke binder, kleur,
// toploader ja of nee). Heeft hij al een eigen zwart-wit ontwerp, dan kan hij het als extra proberen op een
// echte zip-binder (foto, omgekleurd). De aanvraag komt in de app van Bind'r (Profiel › Aanvragen) en, als
// de beheerders een sleutel van Web3Forms invulden, ook per mail. Het voorbeeld is een indicatie.
import { useEffect, useRef, useState, type PointerEvent as WijsEvent, type ReactNode } from "react";
import { SUPABASE_KEY, SUPABASE_URL } from "../config";
import { uuid } from "../lib/uuid";
import {
  BINDER_H, BINDER_KLEUREN, BINDER_W, binderIn, grenzen, houdBinnen, ideeAfbeelding, leesOntwerp, lichtOpDonker, maakMasker, midden, ontwerpAlsPng,
  teken, voorbeeldAlsJpeg, type BinderKleur, type Ontwerp, type Plaatsing,
} from "./binder";

const GROOTTES = ["4-pocket", "9-pocket", "12-pocket", "Weet ik nog niet"];
const WENSEN = ["Mijn eigen tekening", "Een naam of tekst", "Mijn favoriete TCG", "Voor- én achterkant", "Als cadeau"];
const MAX_BEELDEN = 3;

interface Props { demo: boolean; sleutel: string | null; ig: string; igLink: string; basis: string }

/** Wat de proef op de binder doorgeeft aan het formulier. */
interface Proefstand { ontwerp: Ontwerp | null; plaats: Plaatsing | null; binder: HTMLCanvasElement | null }

export function OntwerpPagina({ demo, sleutel, ig, igLink, basis }: Props) {
  const [kleur, setKleur] = useState<BinderKleur>(BINDER_KLEUREN[0]);
  const [proefAan, setProefAan] = useState(false);
  const proef = useRef<Proefstand>({ ontwerp: null, plaats: null, binder: null });
  const [heeftOntwerp, setHeeftOntwerp] = useState(false);
  return (
    <>
      <header className="sectie-kop">
        <h1>Ontwerp je binder</h1>
        <p>Heb je een idee, een tekening of een logo? Wij maken er een binder van. Vertel ons wat je wilt en we sturen je een vrijblijvend voorstel met prijs.</p>
      </header>
      <Aanvraag demo={demo} sleutel={sleutel} ig={ig} igLink={igLink} kleur={kleur} setKleur={setKleur}
        proefAan={proefAan} setProefAan={setProefAan} heeftOntwerp={heeftOntwerp} proef={proef}>
        {proefAan && (
          <Proef kleur={kleur} basis={basis} onStand={(st) => { proef.current = st; setHeeftOntwerp(!!st.ontwerp); }} />
        )}
      </Aanvraag>
    </>
  );
}

// ── Je eigen ontwerp proberen op een binder (een extra, enkel als je het aanzet) ──

function Proef({ kleur, basis, onStand }: { kleur: BinderKleur; basis: string; onStand: (s: Proefstand) => void }) {
  const [binder, setBinder] = useState<HTMLCanvasElement | null>(null);
  const [laadFout, setLaadFout] = useState(false);
  const [bron, setBron] = useState<HTMLCanvasElement | null>(null);
  const [ontwerp, setOntwerp] = useState<Ontwerp | null>(null);
  const [plaats, setPlaats] = useState<Plaatsing | null>(null);
  const [bestandFout, setBestandFout] = useState<string | null>(null);
  const [bestandNaam, setBestandNaam] = useState<string | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  // Na draaien of een ander venster (tablet, gesplitst scherm): opnieuw tekenen op de nieuwe breedte, anders wordt het wazig.
  const [breedte, setBreedte] = useState(0);
  useEffect(() => {
    const c = canvas.current;
    if (!c || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setBreedte(Math.round(c.clientWidth)));
    ro.observe(c);
    return () => ro.disconnect();
  }, [binder]);
  const invoer = useRef<HTMLInputElement>(null);
  const sleep = useRef<{ id: number; x: number; y: number; p: Plaatsing } | null>(null);

  // De binder in de gekozen kleur (de foto wordt één keer geladen, omkleuren gebeurt hier).
  useEffect(() => {
    let weg = false;
    setLaadFout(false);
    binderIn(kleur, `${basis}img/binder-zip.webp`).then((b) => { if (!weg) setBinder(b); }, () => { if (!weg) setLaadFout(true); });
    return () => { weg = true; };
  }, [kleur, basis]);
  useEffect(() => { onStand({ ontwerp, plaats, binder }); }, [ontwerp, plaats, binder]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tekenen, scherp op elk scherm.
  useEffect(() => {
    const c = canvas.current;
    if (!c || !binder) return;
    const breed = c.clientWidth || 360;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.round(breed * dpr);
    c.height = Math.round((breed * BINDER_H / BINDER_W) * dpr);
    const ctx = c.getContext("2d")!;
    ctx.setTransform(c.width / BINDER_W, 0, 0, c.width / BINDER_W, 0, 0);
    ctx.clearRect(0, 0, BINDER_W, BINDER_H);
    teken(ctx, binder, ontwerp, plaats);
  }, [binder, ontwerp, plaats, breedte]);

  const kies = async (f: File | undefined) => {
    if (!f) return;
    setBestandFout(null);
    try {
      const c = await leesOntwerp(f);
      const o = maakMasker(c, lichtOpDonker(c));
      setBron(c);
      setOntwerp(o);
      setPlaats(midden(o, grenzen(o).vullend)); // standaard tot aan het stiksel
      setBestandNaam(f.name);
    } catch (e) {
      setBestandFout(e instanceof Error ? e.message : String(e));
    }
  };
  const keerOm = () => {
    if (!bron || !ontwerp) return;
    const o = maakMasker(bron, !ontwerp.omgekeerd);
    setOntwerp(o);
    if (plaats) setPlaats(houdBinnen(o, plaats));
  };
  const naarFoto = (e: WijsEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * BINDER_W, y: ((e.clientY - r.top) / r.height) * BINDER_H };
  };
  const neer = (e: WijsEvent<HTMLCanvasElement>) => {
    if (!ontwerp || !plaats) return;
    const p = naarFoto(e);
    e.currentTarget.setPointerCapture(e.pointerId);
    sleep.current = { id: e.pointerId, x: p.x, y: p.y, p: plaats };
  };
  const beweeg = (e: WijsEvent<HTMLCanvasElement>) => {
    const s = sleep.current;
    if (!s || s.id !== e.pointerId || !ontwerp) return;
    const p = naarFoto(e);
    setPlaats(houdBinnen(ontwerp, { ...s.p, x: s.p.x + p.x - s.x, y: s.p.y + p.y - s.y }));
  };
  const los = () => { sleep.current = null; };
  const g = ontwerp ? grenzen(ontwerp) : null;

  return (
    <div className="proef">
      <div className="proef-binder">
        {laadFout ? <p className="ontwerp-fout">De foto van de binder kon niet laden. Probeer het later opnieuw.</p> : (
          <canvas ref={canvas} className={`ontwerp-canvas${ontwerp ? " sleepbaar" : ""}${binder ? "" : " laden"}`} role="img"
            aria-label={ontwerp ? `Voorbeeld: jouw ontwerp op een ${kleur.naam.toLowerCase()}e binder` : `Een ${kleur.naam.toLowerCase()}e zip-binder`}
            onClick={() => { if (!ontwerp) invoer.current?.click(); }}
            onPointerDown={neer} onPointerMove={beweeg} onPointerUp={los} onPointerCancel={los} />
        )}
        {!ontwerp && binder && (
          <button type="button" className="ontwerp-leeg" onClick={() => invoer.current?.click()}>
            <UploadIcoon />
            <strong>Kies je ontwerp</strong>
            <span>SVG of PNG, zwart-wit</span>
          </button>
        )}
        <p className="ontwerp-noot">Een indicatie: de kleur van de binder is benaderd, en een gravure valt nooit exact hetzelfde uit als op het scherm.</p>
      </div>
      <div className="ontwerp-keuzes">
        <div className="ontwerp-bestand">
          <button type="button" className="knop" onClick={() => invoer.current?.click()}><UploadIcoon /> {ontwerp ? "Ander bestand" : "Kies een bestand"}</button>
          {bestandNaam && <span className="ontwerp-naam">{bestandNaam}</span>}
          <input ref={invoer} type="file" accept="image/svg+xml,image/png,image/jpeg,image/webp,.svg" hidden onChange={(e) => { void kies(e.target.files?.[0]); e.target.value = ""; }} />
        </div>
        {bestandFout && <p className="ontwerp-fout" role="alert">{bestandFout}</p>}
        <p className="ontwerp-tip">Best: een zwart-wit tekening of logo op een witte of doorzichtige achtergrond. Wat zwart is, wordt gegraveerd (een gravure is altijd zwart); grijs wordt een lichtere gravure.</p>
        {ontwerp && plaats && g && (
          <>
            <label className="keuze-groep schuif">
              <span>Grootte</span>
              <input type="range" min={8} max={Math.max(9, Math.round(g.vullend * 100))} step={1} value={Math.round(plaats.schaal * 100)}
                onChange={(e) => setPlaats(houdBinnen(ontwerp, { ...plaats, schaal: Number(e.target.value) / 100 }))} />
            </label>
            <div className="ontwerp-knoppen">
              <button type="button" className="tekstknop" onClick={() => setPlaats(midden(ontwerp, g.vullend))}>Tot aan het stiksel</button>
              <button type="button" className="tekstknop" onClick={() => setPlaats(midden(ontwerp, g.passend))}>Passend</button>
              <button type="button" className="tekstknop" onClick={() => setPlaats(midden(ontwerp, plaats.schaal))}>Centreren</button>
              <button type="button" className="tekstknop" onClick={keerOm}>Wit en zwart omkeren</button>
            </div>
            <p className="ontwerp-tip">Versleep je ontwerp op de binder. Wat buiten het stiksel valt, wordt niet gegraveerd.</p>
          </>
        )}
      </div>
    </div>
  );
}

// ── Het formulier ──────────────────────────────────────────────────────────────

type Stand = { soort: "invullen" } | { soort: "bezig" } | { soort: "klaar"; mail: boolean } | { soort: "fout"; tekst: string };

function Aanvraag({ demo, sleutel, ig, igLink, kleur, setKleur, proefAan, setProefAan, heeftOntwerp, proef, children }: {
  demo: boolean; sleutel: string | null; ig: string; igLink: string; kleur: BinderKleur; setKleur: (k: BinderKleur) => void;
  proefAan: boolean; setProefAan: (x: boolean) => void; heeftOntwerp: boolean; proef: { current: Proefstand }; children: ReactNode;
}) {
  const [v, setV] = useState({ naam: "", email: "", telefoon: "", grootte: "9-pocket", idee: "", honing: "" });
  const [toploader, setToploader] = useState<boolean>(false);
  const [wensen, setWensen] = useState<Set<string>>(new Set());
  const [beelden, setBeelden] = useState<string[]>([]);
  const [beeldFout, setBeeldFout] = useState<string | null>(null);
  const [beeldBezig, setBeeldBezig] = useState(false);
  const [metOntwerp, setMetOntwerp] = useState(true);
  const [stand, setStand] = useState<Stand>({ soort: "invullen" });
  const beeldInvoer = useRef<HTMLInputElement>(null);
  const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email.trim());
  const ok = v.naam.trim().length > 0 && emailOk && (v.idee.trim().length > 0 || wensen.size > 0 || beelden.length > 0);

  const voegBeeldenToe = async (lijst: FileList | null) => {
    if (!lijst?.length) return;
    setBeeldFout(null);
    setBeeldBezig(true);
    try {
      const nieuw: string[] = [];
      for (const f of Array.from(lijst).slice(0, MAX_BEELDEN - beelden.length)) nieuw.push(await ideeAfbeelding(f));
      setBeelden((b) => [...b, ...nieuw].slice(0, MAX_BEELDEN));
    } catch (e) {
      setBeeldFout(e instanceof Error ? e.message : String(e));
    } finally {
      setBeeldBezig(false);
    }
  };

  const verstuur = async () => {
    if (!ok || stand.soort === "bezig") return;
    // Een robot vult het verborgen veld in: doe alsof het lukte.
    if (v.honing) { setStand({ soort: "klaar", mail: false }); return; }
    setStand({ soort: "bezig" });
    const idee = [wensen.size ? `Wensen: ${[...wensen].join(", ")}` : "", v.idee.trim()].filter(Boolean).join("\n\n").slice(0, 4000) || "(zie de afbeeldingen)";
    const p = proef.current;
    const ontwerpMee = proefAan && metOntwerp && !!p.ontwerp;
    const rij = {
      naam: v.naam.trim().slice(0, 120), email: v.email.trim().slice(0, 200), telefoon: v.telefoon.trim().slice(0, 40) || null,
      grootte: v.grootte, kleur: kleur.naam, idee, toploader,
      beelden: beelden.length ? beelden : null,
      artwork: ontwerpMee && p.ontwerp ? ontwerpAlsPng(p.ontwerp) : null,
      voorbeeld: ontwerpMee && p.binder ? voorbeeldAlsJpeg(p.binder, p.ontwerp, p.plaats) : null,
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
    const stuur = (body: unknown) => fetch(`${SUPABASE_URL}/rest/v1/aanvragen`, {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify(body),
    });
    try {
      let r = await stuur(rij);
      if (r.status === 400) {
        const j = await r.clone().json().catch(() => null) as { code?: string } | null;
        // Een database van vóór 0.11 kent toploader en de afbeeldingen nog niet: dan zonder.
        if (j?.code === "PGRST204") {
          const { toploader: _t, beelden: _b, ...oud } = rij;
          r = await stuur({ ...oud, idee: `${idee}\n\nToploaders: ${toploader ? "ja" : "nee"}`.slice(0, 4000) });
        }
      }
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
            Naam: rij.naam, "E-mail": rij.email, Telefoon: rij.telefoon ?? "", Binder: `${rij.grootte}, ${rij.kleur}, toploaders: ${toploader ? "ja" : "nee"}`, Idee: rij.idee,
            Afbeeldingen: beelden.length || rij.artwork ? (bewaard ? "In de app: Profiel › Aanvragen" : "De klant had afbeeldingen, maar ze konden niet bewaard worden: vraag ze per mail.") : "Geen",
          }),
        });
        gemaild = r.ok;
      } catch { /* de mail is een extra: de aanvraag staat in de app */ }
    }
    if (bewaard || gemaild) setStand({ soort: "klaar", mail: gemaild });
    else setStand({ soort: "fout", tekst: fout ?? "Aanvragen kan hier nog niet. Stuur ons een bericht op Instagram of Facebook." });
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
      <p className="aanvraag-uitleg">Je aanvraag is vrijblijvend: we sturen je een voorstel met prijs, en pas als je dat goedkeurt, gaan we aan de slag.</p>
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
          <legend>Afbeeldingen bij je idee <em>(optioneel, tot {MAX_BEELDEN})</em></legend>
          <div className="idee-beelden">
            {beelden.map((b, i) => (
              <span key={i} className="idee-beeld">
                <img src={b} alt={`Afbeelding ${i + 1}`} />
                <button type="button" className="idee-weg" onClick={() => setBeelden(beelden.filter((_, j) => j !== i))} aria-label={`Afbeelding ${i + 1} weghalen`}>✕</button>
              </span>
            ))}
            {beelden.length < MAX_BEELDEN && (
              <button type="button" className="idee-nieuw" disabled={beeldBezig} onClick={() => beeldInvoer.current?.click()}>
                <PlusIcoon /><span>{beeldBezig ? "Bezig…" : "Foto, schets of screenshot"}</span>
              </button>
            )}
          </div>
          <input ref={beeldInvoer} type="file" accept="image/*" multiple hidden onChange={(e) => { void voegBeeldenToe(e.target.files); e.target.value = ""; }} />
          {beeldFout && <p className="ontwerp-fout" role="alert">{beeldFout}</p>}
        </fieldset>
        <fieldset className="keuze-groep">
          <legend>Welke binder?</legend>
          <div className="wens-chips">
            {GROOTTES.map((g) => (
              <button key={g} type="button" className={`chip${v.grootte === g ? " aan" : ""}`} aria-pressed={v.grootte === g} onClick={() => zet({ grootte: g })}>{g}</button>
            ))}
          </div>
        </fieldset>
        <fieldset className="keuze-groep">
          <legend>Voor toploaders?</legend>
          <div className="segmentje">
            <button type="button" className={toploader ? "aan" : ""} aria-pressed={toploader} onClick={() => setToploader(true)}>Ja</button>
            <button type="button" className={!toploader ? "aan" : ""} aria-pressed={!toploader} onClick={() => setToploader(false)}>Nee</button>
          </div>
          <span className="veld-hint">Een binder voor toploaders heeft grotere vakken, voor kaarten in een harde hoes.</span>
        </fieldset>
        <fieldset className="keuze-groep">
          <legend>Kleur van de binder: <strong className="kleur-naam">{kleur.naam}</strong></legend>
          <div className="stalen">
            {BINDER_KLEUREN.map((k) => (
              <button key={k.id} type="button" className={`staal${k.id === kleur.id ? " aan" : ""}`} style={{ ["--staal" as string]: k.kleur }}
                aria-pressed={k.id === kleur.id} aria-label={k.naam} title={k.naam} onClick={() => setKleur(k)} />
            ))}
          </div>
        </fieldset>

        <div className={`proef-schakel${proefAan ? " aan" : ""}`}>
          <label className="schakel-rij">
            <span>
              <strong>Heb je al een eigen ontwerp?</strong>
              <span className="veld-hint">Probeer je zwart-wit tekening of logo op de binder (SVG of PNG).</span>
            </span>
            <input type="checkbox" role="switch" checked={proefAan} onChange={(e) => setProefAan(e.target.checked)} />
          </label>
          {children}
          {proefAan && heeftOntwerp && (
            <label className="meesturen">
              <input type="checkbox" checked={metOntwerp} onChange={(e) => setMetOntwerp(e.target.checked)} />
              <span>Stuur mijn ontwerp en het voorbeeld op de binder mee</span>
            </label>
          )}
        </div>

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
        <p className="privacy">We gebruiken je gegevens enkel om je aanvraag te beantwoorden en bewaren ze niet langer dan nodig (zie <a href="#privacy">privacy</a>). Een lasergravure is handwerk: kleur en diepte kunnen per binder licht verschillen (zie <a href="#voorwaarden">verkoopvoorwaarden</a>).</p>
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
const PlusIcoon = () => <Svg maat={22}><path d="M12 5v14M5 12h14" /></Svg>;
const VinkIcoon = () => <Svg maat={34}><path d="m5 12.5 4.5 4.5L19 7.5" /></Svg>;
