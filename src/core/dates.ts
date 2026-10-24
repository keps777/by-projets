// Dates : on travaille en « jours civils » locaux (AAAA-MM-JJ) pour ne jamais dépendre du fuseau.
export type Jour = string;
const pad = (n: number) => String(n).padStart(2, '0');
export const jourDe = (d: Date): Jour => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const enDate = (j: Jour): Date => { const [a, m, d] = j.split('-').map(Number); return new Date(a, m - 1, d, 12); };
export const joursDuMois = (annee: number, mois0: number) => new Date(annee, mois0 + 1, 0).getDate();
/** Ajoute des mois en gardant le quantième (ramené au dernier jour du mois s'il n'existe pas). */
export function ajouterMois(j: Jour, n: number, quantieme?: number): Jour {
  const d = enDate(j);
  const total = d.getFullYear() * 12 + d.getMonth() + n;
  const a = Math.floor(total / 12), m = total % 12;
  return `${a}-${pad(m + 1)}-${pad(Math.min(quantieme ?? d.getDate(), joursDuMois(a, m)))}`;
}
export const ajouterJours = (j: Jour, n: number): Jour => { const d = enDate(j); d.setDate(d.getDate() + n); return jourDe(d); };
export const ecartJours = (a: Jour, b: Jour) => Math.round((enDate(b).getTime() - enDate(a).getTime()) / 86_400_000);
/** Prochain jour de paie (quantième `jour`) à partir de `depuis`, aujourd'hui compris. */
export function prochainePaie(depuis: Jour, jour: number): Jour {
  const d = enDate(depuis);
  const ce = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(Math.min(jour, joursDuMois(d.getFullYear(), d.getMonth())))}`;
  return ce >= depuis ? ce : ajouterMois(ce, 1, jour);
}
/** Tous les jours de paie dans ]apres, jusqua]. */
export function paiesEntre(apres: Jour, jusqua: Jour, jour: number): Jour[] {
  const res: Jour[] = [];
  let p = prochainePaie(ajouterJours(apres, 1), jour);
  while (p <= jusqua && res.length < 600) { res.push(p); p = ajouterMois(p, 1, jour); }
  return res;
}
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
export const nomMois = (j: Jour) => MOIS[enDate(j).getMonth()];
/** « 28 oct. » */
export const jourCourt = (j: Jour) => { const d = enDate(j); return `${d.getDate()} ${MOIS_COURTS[d.getMonth()]}`; };
/** « 28 octobre 2026 » */
export const jourLong = (j: Jour) => { const d = enDate(j); return `${d.getDate() === 1 ? '1er' : d.getDate()} ${MOIS[d.getMonth()]} ${d.getFullYear()}`; };
/** « octobre 2026 » */
export const moisAnnee = (j: Jour) => { const d = enDate(j); return `${MOIS[d.getMonth()]} ${d.getFullYear()}`; };
/** « sam. 25 oct. » */
export const jourSemaineCourt = (j: Jour) => { const d = enDate(j); return `${JOURS[d.getDay()].slice(0, 3)}. ${d.getDate()} ${MOIS_COURTS[d.getMonth()]}`; };
export const jourSemaineLong = (j: Jour) => { const d = enDate(j); return `${JOURS[d.getDay()]} ${d.getDate()} ${MOIS[d.getMonth()]}`; };
export const heure = (ts: number) => { const d = new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
/** « Hier · 18:40 », « 24 sept. », « À l'instant » : l'âge d'un événement, en clair. */
export function quand(ts: number, now: number): string {
  const auj = jourDe(new Date(now)), j = jourDe(new Date(ts));
  if (now - ts < 60_000) return "À l'instant";
  if (j === auj) return `Aujourd'hui · ${heure(ts)}`;
  if (j === ajouterJours(auj, -1)) return `Hier · ${heure(ts)}`;
  return jourCourt(j);
}
