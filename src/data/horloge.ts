// Horloge de l'application. Par défaut : le « lundi 12 octobre 2026, 09:00 » des maquettes, qui s'écoule ensuite en temps réel (les comptes à rebours des drops tournent).
// `?maintenant=2026-12-13T10:00` rejoue une autre date (tests, démonstration) ; elle est gardée pour l'onglet (sessionStorage). `?maintenant=reel` : l'heure réelle.
// Module à part : le seed et le magasin l'utilisent sans cycle.
import { MAINTENANT_DEMO } from './constantes.ts';
const CLE = 'nexgtt.maintenant';
const DEPART = typeof performance !== 'undefined' ? Date.now() : 0;
function base(): number {
  if (typeof location === 'undefined') return Date.parse(MAINTENANT_DEMO);
  try {
    const p = new URLSearchParams(location.search).get('maintenant');
    if (p !== null) { if (p === '' || p === 'reel') { sessionStorage.setItem(CLE, 'reel'); return NaN; } sessionStorage.setItem(CLE, p); return Date.parse(p); }
    const gardee = sessionStorage.getItem(CLE);
    if (gardee === 'reel') return NaN;
    if (gardee) return Date.parse(gardee);
  } catch { /* stockage indisponible */ }
  return Date.parse(MAINTENANT_DEMO);
}
/** Instant courant (ms). La base démo est figée au chargement de la page, puis avance au rythme réel. */
let figee: number | undefined;
export function maintenant(): number {
  if (figee === undefined) figee = base();
  if (Number.isNaN(figee)) return Date.now();
  return figee + (Date.now() - DEPART);
}
const p2 = (n: number) => String(n).padStart(2, '0');
export const jourDe = (ms: number): string => { const d = new Date(ms); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; };
export const aujourdhui = (): string => jourDe(maintenant());
/** Instant (ms) d'un jour `YYYY-MM-DD` et d'une heure `HH:mm`, en heure locale. */
export const instant = (jour: string, heure = '00:00'): number => Date.parse(`${jour}T${heure}`);
