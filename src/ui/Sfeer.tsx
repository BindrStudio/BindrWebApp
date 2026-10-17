// Het thema van de klantenpagina ook in het beheer, maar rustig: een paar vormpjes (pompoen, spookje, sneeuwvlok …) die
// zachtjes zweven achter alles, langs de randen. Niets bij prefers-reduced-motion behalve een stil vormpje.
import { VORMEN, type ThemaSoort } from "../lib/thema";
import { VormSvg } from "../gedeeld/Vorm";

export function BeheerSfeer({ soort, kleur }: { soort: ThemaSoort; kleur: string }) {
  const zweef = soort.zweef.length ? soort.zweef : soort.fonkel;
  return (
    <div className="beheer-sfeer" aria-hidden="true" style={{ ["--thema" as string]: kleur }}>
      {[0, 1, 2, 3, 4].map((i) => <VormSvg key={`z${i}`} vorm={VORMEN[zweef[i % zweef.length]]} className={`bz bz${i}`} />)}
      {[0, 1, 2, 3].map((i) => <VormSvg key={`f${i}`} vorm={VORMEN[soort.fonkel[i % soort.fonkel.length]]} className={`bf bf${i}`} />)}
    </div>
  );
}
