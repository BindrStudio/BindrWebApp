import { useEffect, useRef, useState } from "react";
import { kiesPincode, logInMetPin, logInMetWachtwoord, logUit, ontgrendel, pinGebruiker, pincodeLater, startDemo } from "../state";
import { pinFout, wachtNog } from "../lib/pin";
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
    if (!ok) { setFout("Die pincode klopt niet"); setWacht(wachtNog()); }
  };
  return (
    <Kader>
      <PinPad titel={`Hallo${wie?.naam ? ` ${wie.naam}` : ""}`} sub={sub} onKlaar={(p) => void probeer(p)} bezig={bezig || wacht > 0}
        fout={wacht > 0 ? `Te veel pogingen: wacht nog ${wacht} s` : fout} />
      <button className="tekstknop" onClick={() => void logUit()}>Iemand anders, of pincode vergeten?</button>
    </Kader>
  );
}

/** Een pincode kiezen: na de eerste login met wachtwoord, of later via Meer. */
export function PinKiezen({ inSheet = false, onKlaar }: { inSheet?: boolean; onKlaar?: () => void }) {
  const [eerste, setEerste] = useState<string | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);
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
      await kiesPincode(pin);
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
        sub={eerste ? "Typ dezelfde 6 cijfers opnieuw" : "6 cijfers. Daarmee open je voortaan de app; de eerste keer op een nieuwe gsm vraagt hij ook je e-mail."}
        onKlaar={(p) => void klaar(p)} fout={fout} />
      {!inSheet && <button className="tekstknop" onClick={() => void pincodeLater()}>Later</button>}
    </>
  );
  return inSheet ? <div className="pin-in-sheet">{inhoud}</div> : <Kader>{inhoud}</Kader>;
}

/** Niet ingelogd: e-mail en pincode, of de eerste keer met het wachtwoord. */
export function Login() {
  const [email, setEmail] = useState(() => { try { return localStorage.getItem("bindr-laatste-email") ?? ""; } catch { return ""; } });
  const [code, setCode] = useState("");
  const [metWachtwoord, setMetWachtwoord] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);

  const verstuur = async (e: React.FormEvent) => {
    e.preventDefault();
    setFout(null);
    if (!metWachtwoord && !/^\d{6}$/.test(code)) return setFout("Een pincode heeft 6 cijfers.");
    setBezig(true);
    try {
      try { localStorage.setItem("bindr-laatste-email", email.trim()); } catch { /* */ }
      if (metWachtwoord) await logInMetWachtwoord(email.trim(), code);
      else await logInMetPin(email.trim(), code);
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err);
      setFout(/klopt niet/.test(m) && !metWachtwoord ? "E-mail of pincode klopt niet. Nog geen pincode? Log de eerste keer in met je wachtwoord." : m);
    } finally {
      setBezig(false);
    }
  };

  return (
    <Kader>
      <h1 className="login-titel">Beheer</h1>
      <p className="login-sub">Voor de beheerders van Bind'r</p>
      <form onSubmit={verstuur} className="login-form">
        <input type="email" autoComplete="username" placeholder="E-mailadres" value={email} onChange={(e) => setEmail(e.target.value)} required />
        {metWachtwoord ? (
          <input type="password" autoComplete="current-password" placeholder="Wachtwoord" value={code} onChange={(e) => setCode(e.target.value)} required />
        ) : (
          <input className="pin-veld" type="password" inputMode="numeric" autoComplete="current-password" placeholder="Pincode (6 cijfers)" maxLength={6}
            value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} required aria-label="Pincode" />
        )}
        {fout && <p className="fouttekst">{fout}</p>}
        <button className="knop groot" disabled={bezig}>{bezig ? "Inloggen…" : "Inloggen"}</button>
      </form>
      <button className="tekstknop" onClick={() => { setMetWachtwoord(!metWachtwoord); setCode(""); setFout(null); }}>
        {metWachtwoord ? "Inloggen met pincode" : "Eerste keer? Log in met je wachtwoord"}
      </button>
      <button className="tekstknop zacht" onClick={() => void startDemo()}>Uitproberen zonder account</button>
      <p className="login-voet">Daarna onthoudt deze gsm wie je bent: voortaan volstaat je pincode. De demo bewaart alles enkel op dit toestel.</p>
    </Kader>
  );
}
