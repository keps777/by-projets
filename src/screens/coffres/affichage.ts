// Présentation des coffres : couleurs, libellés, dates (rien de calculé ici : les règles sont dans core/).
import { app, maintenant } from '../../data/store.svelte.ts';
import { jourDe, prochainePaie, moisAnnee, quand, jourCourt, type Jour } from '../../core/dates.ts';
import { ACCENTS_COFFRE } from '../../core/epargne.ts';
import { echeance, estAtteint, partDuMembre } from '../../core/coffres.ts';
import type { Coffre } from './etat.ts';

export const accentDe = (genre: string) => ACCENTS_COFFRE[genre] ?? ACCENTS_COFFRE.Libre;
const THEME: Record<string, string> = { Rentrée: 'SCOLARITÉ', Voiture: 'MOBILITÉ', Maison: 'HABITAT', Mariage: 'ÉVÉNEMENT', Libre: 'ÉPARGNE LIBRE', Urgences: 'RÉSERVE' };
export const sousTitre = (c: Coffre) => (c.partage ? `PARTAGÉ · ${c.membres} MEMBRES` : (THEME[c.genre] ?? 'ÉPARGNE').toUpperCase());
export const jourPaieMembre = () => app.compte?.jourPaie ?? 28;
export const prochaineDatePaie = (): Jour => prochainePaie(jourDe(new Date(maintenant())), jourPaieMembre());
/** « août 2027 », « Atteint », ou « — » si le versement est nul. */
export function etaObjectif(c: Coffre): string {
  if (estAtteint(c.epargne, c.objectif)) return 'Atteint';
  const e = echeance(c.epargne, c.objectif, c.mensuel, prochaineDatePaie());
  return e.date ? moisAnnee(e.date) : '—';
}
export const partMembre = (c: Coffre) => partDuMembre(c.mensuel, c.partage, c.membres);
export const LIBELLE_OP: Record<string, string> = { ouverture: 'Épargne reprise', versement: 'Versement', auto: 'Versement automatique', interet: 'Intérêts crédités', retrait: 'Retrait' };
/** Date d'une opération : « Hier · 18:40 », « 24 sept. », avec l'année si elle est ancienne. */
export function dateOp(ts: number): string {
  const now = maintenant();
  return now - ts > 200 * 86_400_000 ? `${jourCourt(jourDe(new Date(ts)))} ${new Date(ts).getFullYear()}` : quand(ts, now);
}
