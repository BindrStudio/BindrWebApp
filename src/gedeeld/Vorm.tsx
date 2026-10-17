// Een vormpje van de versiering van een thema (pompoen, sneeuwvlok …), gedeeld door de klantenpagina en het beheer.
import type { Vorm } from "../lib/thema";

export function VormSvg({ vorm, className, style }: { vorm: Vorm; className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" aria-hidden="true">
      {vorm.map((l, i) => (
        <path key={i} d={l.d} fill={l.fill ?? "none"} stroke={l.stroke} strokeWidth={l.sw} opacity={l.opacity} strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </svg>
  );
}
