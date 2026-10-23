// Horloge de l'application : surchargeable par `?maintenant=2026-10-28T09:00` pour rejouer une paie (tests, démonstration).
// La valeur est gardée pour l'onglet (sessionStorage) : la navigation interne (`aller()`) efface la query, la date doit rester.
// `?maintenant=` (vide) ou `?maintenant=reel` revient à l'heure réelle. Module à part : le seed et le magasin l'utilisent sans cycle.
const CLE = 'assureme.maintenant';
function lireSurcharge(): number {
  if (typeof location === 'undefined') return NaN;
  try {
    const p = new URLSearchParams(location.search).get('maintenant');
    if (p !== null) {
      const t = Date.parse(p);
      if (Number.isNaN(t)) sessionStorage.removeItem(CLE); else sessionStorage.setItem(CLE, p);
      return t;
    }
    const gardee = sessionStorage.getItem(CLE);
    return gardee ? Date.parse(gardee) : NaN;
  } catch { return NaN; /* stockage indisponible : on retombe sur l'heure réelle */ }
}
export function maintenant(): number {
  const t = lireSurcharge();
  return Number.isNaN(t) ? Date.now() : t;
}
