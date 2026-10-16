import { useEffect, useRef, useState } from "react";
import {
  controleerEigenPin, heeftEigenPin, ingelogdEmail, kiesPincode, kiesWachtwoord, logInMetWachtwoord, logUit, ontgrendel, pinGebruiker, pincodeLater,
  redenNieuwWachtwoord, startDemo, stuurHerstelmail, vraagHuidigWachtwoord, wachtwoordLater, wijzigWachtwoord,
} from "../state";
import { pinFout, pogingenOver, wachtNog, wachtwoordFout, WACHTWOORD_MIN } from "../lib/pin";
import { kies, SLOT } from "../lib/grapjes";
import { Icoon } from "./common";

/** De pincode: zes bolletjes en grote toetsen, ook te typen op een toetsenbord. */
function PinPad({ onKlaar, fout, bezig, titel, sub }: { onKlaar: (pin: string) => void; fout: string | null; bezig?: boolean; titel: string; sub?: string }) {
  const [pin, setPin] = useState("");
  const [schud, setSchud] = useState(0);
  const cb = useRef(onKlaar);
  cb.current = onKlaar;
  useEffect(() => { if (fout) { setPin(""); setSchud((x) => x + 1); } }, [fout]);
  const typ = (c: string) => {
    if (bezig) return;
    setPin((p) => {
      const n = c === "weg" ? p.slice(0, -1) : (p + c).slice(0, 6);
      if (n.length === 6 && p.length < 6) setTimeout(() => cb.current(n), 120);
      return n;
    });
  };
  useEffect(() => {
    const toets = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) typ(e.key);
      else if (e.key === "Backspace") typ("weg");
    };
    window.addEventListener("keydown", toets);
    return () => window.removeEventListener("keydown", toets);
  });
  return (
    <div className="pinpad">
      <h1 className="login-titel">{titel}</h1>
      {sub && <p className="login-sub">{sub}</p>}
      <div key={schud} className={`pin-bollen${schud ? " schud" : ""}`} aria-label={`${pin.length} van 6 cijfers`}>
        {Array.from({ length: 6 }, (_, i) => <span key={i} className={i < pin.length ? "vol" : ""} />)}
      </div>
      <p className="fouttekst pin-fout" role="alert">{fout ?? " "}</p>
      <div className="pin-toetsen">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((c) => <button key={c} type="button" onClick={() => typ(c)} disabled={bezig}>{c}</button>)}
        <span />
        <button type="button" onClick={() => typ("0")} disabled={bezig}>0</button>
        <button type="button" className="pin-weg" onClick={() => typ("weg")} aria-label="Wis een cijfer"><Icoon naam="terug" maat={22} /></button>
      </div>
    </div>
  );
}

function Kader({ children }: { children: React.ReactNode }) {
  return (
    <div className="login">
      <a className="login-terug" href="./"><Icoon naam="terug" maat={16} /> Naar de catalogus</a>
      <div className="login-logo"><img src="img/logo.png" alt="Bind'r" width={180} /></div>
      {children}
    </div>
  );
}

/** De laatste pogingen: zeg dat de gsm daarna de sessie vergeet. */
const laatste = (over: number) => (over > 0 && over <= 3 ? ` Daarna nog ${over} ${over === 1 ? "poging" : "pogingen"}, dan moet je opnieuw inloggen met je wachtwoord.` : "");

/** Vergrendeld: enkel de pincode van wie dit toestel gebruikt. */
export function Slot() {
  const wie = pinGebruiker();
  const [fout, setFout] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);
  const [wacht, setWacht] = useState(wachtNog());
  const [sub] = useState(() => kies(SLOT));
  useEffect(() => {
    if (!wacht) return;
    const t = setInterval(() => setWacht(wachtNog()), 1000);
    return () => clearInterval(t);
  }, [wacht]);
  const probeer = async (pin: string) => {
    if (wachtNog()) { setWacht(wachtNog()); return; }
    setBezig(true);
    const ok = await ontgrendel(pin);
    setBezig(false);
    if (!ok) {
      setFout(`Die pincode klopt niet.${laatste(pogingenOver())}`);
      setWacht(wachtNog());
    }
  };
  return (
    <Kader>
      <PinPad titel={`Hallo${wie?.naam ? ` ${wie.naam}` : ""}`} sub={sub} onKlaar={(p) => void probeer(p)} bezig={bezig || wacht > 0}
        fout={wacht > 0 ? `Te veel pogingen: wacht nog ${wacht} s.${laatste(pogingenOver())}` : fout} />
      <button className="tekstknop" onClick={() => void logUit()}>Iemand anders, of pincode vergeten?</button>
    </Kader>
  );
}

/** Een pincode kiezen: na het inloggen met je wachtwoord, of later via Profiel. */
export function PinKiezen({ inSheet = false, onKlaar }: { inSheet?: boolean; onKlaar?: () => void }) {
  // Een bestaande pincode wijzigen: eerst de huidige, zodat niemand anders ze kan veranderen.
  const [huidige, setHuidige] = useState<string | null>(() => (heeftEigenPin() ? null : ""));
  const [eerste, setEerste] = useState<string | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);
  const controleer = async (pin: string) => {
    // Zelfde regels als het slot: wachten na 5 foute, na 10 weg met de sessie.
    const wacht = wachtNog();
    if (wacht) return setFout(`Te veel pogingen: wacht nog ${wacht} s.`);
    setBezig(true);
    const ok = await controleerEigenPin(pin);
    setBezig(false);
    if (ok) { setFout(null); setHuidige(pin); } else setFout(`Die pincode klopt niet.${laatste(pogingenOver())}`);
  };
  if (huidige === null) {
    const inhoud = <PinPad key="huidig" titel="Huidige pincode" sub="Geef eerst je huidige pincode in" onKlaar={(p) => void controleer(p)} fout={fout} bezig={bezig} />;
    return inSheet ? <div className="pin-in-sheet">{inhoud}</div> : <Kader>{inhoud}</Kader>;
  }
  const klaar = async (pin: string) => {
    if (!eerste) {
      const f = pinFout(pin);
      if (f) return setFout(f);
      setFout(null);
      setEerste(pin);
      return;
    }
    if (pin !== eerste) { setEerste(null); return setFout("De twee pincodes zijn niet gelijk. Begin opnieuw."); }
    setBezig(true);
    try {
      await kiesPincode(pin, huidige || undefined);
      onKlaar?.();
    } catch (e) {
      setEerste(null);
      setFout(e instanceof Error ? e.message : String(e));
    } finally {
      setBezig(false);
    }
  };
  const inhoud = (
    <>
      <PinPad key={eerste ? "2" : "1"} titel={eerste ? "Nog een keer" : "Kies je pincode"} bezig={bezig}
        sub={eerste ? "Typ dezelfde 6 cijfers opnieuw" : "6 cijfers om de app op deze gsm te openen. Ze blijft op deze gsm; je wachtwoord heb je enkel nodig op een nieuwe gsm."}
        onKlaar={(p) => void klaar(p)} fout={fout} />
      {!inSheet && <button className="tekstknop" onClick={() => void pincodeLater()}>Later</button>}
    </>
  );
  return inSheet ? <div className="pin-in-sheet">{inhoud}</div> : <Kader>{inhoud}</Kader>;
}

/** Een nieuw wachtwoord, twee keer, met uitleg wat sterk genoeg is. Een wachtwoordmanager kan het bewaren. */
function NieuwWachtwoord({ email, waarde, herhaal, onWaarde, onHerhaal }: {
  email: string; waarde: string; herhaal: string; onWaarde: (w: string) => void; onHerhaal: (w: string) => void;
}) {
  const [toon, setToon] = useState(false);
  const fout = waarde ? wachtwoordFout(waarde, email) : null;
  return (
    <>
      {/* Zo weet de wachtwoordmanager van iCloud of Google voor welk account dit wachtwoord is. */}
      <input type="email" autoComplete="username" value={email} readOnly hidden />
      <input type={toon ? "text" : "password"} autoComplete="new-password" placeholder="Nieuw wachtwoord" value={waarde}
        onChange={(e) => onWaarde(e.target.value)} required aria-label="Nieuw wachtwoord" aria-describedby="wachtwoord-uitleg" />
      <input type={toon ? "text" : "password"} autoComplete="new-password" placeholder="Nog een keer" value={herhaal}
        onChange={(e) => onHerhaal(e.target.value)} required aria-label="Nieuw wachtwoord, nog een keer" />
      <label className="toon-wachtwoord"><input type="checkbox" checked={toon} onChange={(e) => setToon(e.target.checked)} /> Toon wat ik typ</label>
      <p id="wachtwoord-uitleg" className={`wachtwoord-uitleg${fout ? " fout" : waarde ? " goed" : ""}`}>
        {fout ?? (waarde ? "Sterk genoeg." : `Minstens ${WACHTWOORD_MIN} tekens. Een zin van een paar woorden is lang en makkelijk te onthouden. Laat je gsm het bewaren (iCloud-sleutelhanger of Google).`)}
      </p>
    </>
  );
}

const UITLEG: Record<"oud" | "zwak" | "herstel", { titel: string; sub: string }> = {
  oud: {
    titel: "Kies een wachtwoord",
    sub: "Tot nu was je pincode ook het wachtwoord van je account. Zes cijfers raadt iemand op afstand te snel. Je pincode blijft dezelfde, maar opent voortaan enkel de app op deze gsm.",
  },
  zwak: {
    titel: "Kies een sterker wachtwoord",
    sub: "Dit wachtwoord is te kort of te makkelijk te raden. Je hebt het enkel nodig op een nieuwe gsm; daarna volstaat je pincode.",
  },
  herstel: {
    titel: "Nieuw wachtwoord",
    sub: "Kies een nieuw wachtwoord voor je account. Heb je op deze gsm nog geen pincode, dan kies je er daarna een.",
  },
};

/** Een sterk wachtwoord kiezen: verplicht na een oude pincode of een zwak wachtwoord, en na een herstelmail. */
export function WachtwoordKiezen() {
  const reden = redenNieuwWachtwoord() ?? "zwak";
  const email = ingelogdEmail();
  const vraagHuidig = vraagHuidigWachtwoord();
  const [huidig, setHuidig] = useState("");
  const [w, setW] = useState("");
  const [h, setH] = useState("");
  const [fout, setFout] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [bezig, setBezig] = useState(false);
  const verstuur = async (e: React.FormEvent) => {
    e.preventDefault();
    const f = wachtwoordFout(w, email);
    if (f) return setFout(f);
    if (w !== h) return setFout("De twee wachtwoorden zijn niet gelijk.");
    setFout(null);
    setBezig(true);
    try {
      await kiesWachtwoord(w, vraagHuidig ? huidig : undefined);
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err);
      setFout(m);
      setOffline(/verbinding|internet/i.test(m));
    } finally {
      setBezig(false);
    }
  };
  return (
    <Kader>
      <h1 className="login-titel">{UITLEG[reden].titel}</h1>
      <p className="login-sub">{UITLEG[reden].sub}</p>
      <form onSubmit={verstuur} className="login-form">
        {vraagHuidig && (
          <input type="password" autoComplete="current-password" placeholder="Huidig wachtwoord (bij de meesten de oude pincode)" value={huidig}
            onChange={(e) => setHuidig(e.target.value)} required aria-label="Huidig wachtwoord" />
        )}
        <NieuwWachtwoord email={email} waarde={w} herhaal={h} onWaarde={setW} onHerhaal={setH} />
        {fout && <p className="fouttekst" role="alert">{fout}</p>}
        <button className="knop groot" disabled={bezig}>{bezig ? "Bewaren…" : "Bewaar wachtwoord"}</button>
      </form>
      {reden !== "herstel" && offline && <button className="tekstknop" onClick={() => void wachtwoordLater()}>Geen internet: later</button>}
      <button className="tekstknop zacht" onClick={() => void logUit()}>Uitloggen</button>
    </Kader>
  );
}

/** Profiel › Wachtwoord wijzigen: eerst het huidige, dan twee keer het nieuwe. */
export function WachtwoordWijzigen({ onKlaar }: { onKlaar: () => void }) {
  const email = ingelogdEmail();
  const [huidig, setHuidig] = useState("");
  const [w, setW] = useState("");
  const [h, setH] = useState("");
  const [fout, setFout] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);
  const verstuur = async (e: React.FormEvent) => {
    e.preventDefault();
    const f = wachtwoordFout(w, email);
    if (f) return setFout(f);
    if (w !== h) return setFout("De twee wachtwoorden zijn niet gelijk.");
    setFout(null);
    setBezig(true);
    try {
      await wijzigWachtwoord(huidig, w);
      onKlaar();
    } catch (err) {
      setFout(err instanceof Error ? err.message : String(err));
    } finally {
      setBezig(false);
    }
  };
  return (
    <form onSubmit={verstuur} className="login-form wachtwoord-sheet">
      <input type="password" autoComplete="current-password" placeholder="Huidig wachtwoord" value={huidig} onChange={(e) => setHuidig(e.target.value)} required aria-label="Huidig wachtwoord" />
      <NieuwWachtwoord email={email} waarde={w} herhaal={h} onWaarde={setW} onHerhaal={setH} />
      {fout && <p className="fouttekst" role="alert">{fout}</p>}
      <button className="knop groot" disabled={bezig}>{bezig ? "Bewaren…" : "Bewaar wachtwoord"}</button>
      <p className="zacht klein">Je andere gsm's vragen daarna één keer het nieuwe wachtwoord. Je pincode blijft dezelfde.</p>
    </form>
  );
}

/** Niet ingelogd: e-mail en wachtwoord. Daarna opent de pincode de app op deze gsm. */
export function Login() {
  const [email, setEmail] = useState(() => { try { return localStorage.getItem("bindr-laatste-email") ?? ""; } catch { return ""; } });
  const [wachtwoord, setWachtwoord] = useState("");
  const [vergeten, setVergeten] = useState(false);
  const [verstuurd, setVerstuurd] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);

  const verstuur = async (e: React.FormEvent) => {
    e.preventDefault();
    setFout(null);
    setBezig(true);
    try {
      try { localStorage.setItem("bindr-laatste-email", email.trim()); } catch { /* */ }
      if (vergeten) {
        await stuurHerstelmail(email.trim());
        setVerstuurd(true);
      } else {
        await logInMetWachtwoord(email.trim(), wachtwoord);
      }
    } catch (err) {
      setFout(err instanceof Error ? err.message : String(err));
    } finally {
      setBezig(false);
    }
  };

  if (vergeten) {
    return (
      <Kader>
        <h1 className="login-titel">Wachtwoord vergeten</h1>
        {verstuurd ? (
          <p className="login-sub">Is <strong>{email.trim()}</strong> een beheerder, dan krijg je zo een mail met een link. Open de link en kies een nieuw wachtwoord. Gebruik je de app vanop je beginscherm of in Bluefy, log daar daarna in met dat nieuwe wachtwoord.</p>
        ) : (
          <>
            <p className="login-sub">Je krijgt een mail met een link om een nieuw wachtwoord te kiezen.</p>
            <form onSubmit={verstuur} className="login-form">
              <input type="email" autoComplete="username" placeholder="E-mailadres" value={email} onChange={(e) => setEmail(e.target.value)} required />
              {fout && <p className="fouttekst" role="alert">{fout}</p>}
              <button className="knop groot" disabled={bezig}>{bezig ? "Versturen…" : "Stuur de mail"}</button>
            </form>
          </>
        )}
        <button className="tekstknop" onClick={() => { setVergeten(false); setVerstuurd(false); setFout(null); }}>Terug naar inloggen</button>
      </Kader>
    );
  }

  return (
    <Kader>
      <h1 className="login-titel">Beheer</h1>
      <p className="login-sub">Voor de beheerders van Bind'r</p>
      <form onSubmit={verstuur} className="login-form">
        <input type="email" autoComplete="username" placeholder="E-mailadres" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input type="password" autoComplete="current-password" placeholder="Wachtwoord" value={wachtwoord} onChange={(e) => setWachtwoord(e.target.value)} required aria-label="Wachtwoord" />
        {fout && <p className="fouttekst" role="alert">{fout}</p>}
        <button className="knop groot" disabled={bezig}>{bezig ? "Inloggen…" : "Inloggen"}</button>
      </form>
      <button className="tekstknop" onClick={() => { setVergeten(true); setFout(null); }}>Wachtwoord vergeten?</button>
      <button className="tekstknop zacht" onClick={() => void startDemo()}>Uitproberen zonder account</button>
      <p className="login-voet">Je wachtwoord vraagt de app enkel op een nieuwe gsm. Daarna open je de app met een pincode van 6 cijfers, ook zonder internet. De demo bewaart alles enkel op dit toestel.</p>
    </Kader>
  );
}
