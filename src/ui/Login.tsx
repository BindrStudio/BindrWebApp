import { useState } from "react";
import { logIn, startDemo } from "../state";

export function Login() {
  const [email, setEmail] = useState("");
  const [wachtwoord, setWachtwoord] = useState("");
  const [fout, setFout] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);

  const verstuur = async (e: React.FormEvent) => {
    e.preventDefault();
    setFout(null);
    setBezig(true);
    try {
      await logIn(email.trim(), wachtwoord);
    } catch (err) {
      setFout(err instanceof Error ? err.message : String(err));
    } finally {
      setBezig(false);
    }
  };

  return (
    <div className="login">
      <div className="login-logo">
        <img src="img/logo.png" alt="Bind'r" width={200} />
      </div>
      <h1 className="login-titel">Voorraad</h1>
      <p className="login-sub">Voor de beheerders van Bind'r</p>
      <form onSubmit={verstuur} className="login-form">
        <input type="email" autoComplete="username" placeholder="E-mailadres" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input type="password" autoComplete="current-password" placeholder="Wachtwoord" value={wachtwoord} onChange={(e) => setWachtwoord(e.target.value)} required />
        {fout && <p className="fouttekst">{fout}</p>}
        <button className="knop groot" disabled={bezig}>{bezig ? "Inloggen…" : "Inloggen"}</button>
      </form>
      <button className="tekstknop" onClick={() => void startDemo()}>Uitproberen zonder account</button>
      <p className="login-voet">De demo bewaart alles enkel op dit toestel.</p>
    </div>
  );
}
