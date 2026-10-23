// Présentation du score : libellés des signaux, fourchettes de niveaux, paliers débloqués (les règles sont dans core/).
import { app, totalMensualites } from '../../data/store.svelte.ts';
import { NIVEAUX, PLAFONDS, SEUILS_NIVEAU, type Niveau, type Plafonds } from '../../core/credit.ts';
import { NOM_SIGNAL, POIDS, SCORE_MAX, SCORE_MIN, type Signaux } from '../../core/score.ts';
import { fcfa } from '../../core/money.ts';

export const ORDRE_SIGNAUX: (keyof Signaux)[] = ['ponctualite', 'anciennete', 'epargne', 'endettement', 'dossier'];
export const pctPoids = (k: keyof Signaux) => Math.round(POIDS[k] * 100);
export const signal = (k: keyof Signaux) => app.score.signaux[k] ?? 0;

export function fourchette(n: Niveau): string {
  const i = NIVEAUX.indexOf(n);
  const bas = i === 0 ? SCORE_MIN : SEUILS_NIVEAU[n];
  const haut = i === NIVEAUX.length - 1 ? SCORE_MAX : SEUILS_NIVEAU[NIVEAUX[i + 1]] - 1;
  return `${bas} – ${haut}`;
}
/** Valeur affichée à droite de chaque signal. */
export function valeurSignal(k: keyof Signaux): string {
  const v = signal(k);
  if (k === 'anciennete') return app.compte?.anciennete ?? `${v} / 100`;
  if (k === 'endettement') { const net = app.compte?.salaireNet ?? 0; return net > 0 ? `${Math.round((totalMensualites() / net) * 100)} % du salaire` : '0 %'; }
  if (k === 'dossier') return `${Math.round(v / 20)} / 5 pièces`;
  return `${v} / 100`;
}
export function texteSignal(k: keyof Signaux): string {
  const poids = `Poids : ${pctPoids(k)} % du score.`;
  switch (k) {
    case 'ponctualite': return `Part de vos mensualités et factures réglées à l'heure. ${poids} Chaque paiement à l'heure compte, un retard coûte 25 points.`;
    case 'anciennete': return `${app.compte ? `${app.compte.employeur} vous emploie depuis ${app.compte.anciennete}.` : 'Votre ancienneté chez votre employeur.'} ${poids} Elle monte avec les années.`;
    case 'epargne': return `Un versement dans un coffre chaque mois. ${poids} Gardez le versement automatique : même 5 000 comptent.`;
    case 'endettement': return `Part du salaire prélevée par tous vos crédits. Sous 25 % c'est confortable, 33 % est le maximum. ${poids}`;
    case 'dossier': return `Pièces vérifiées : identité, employeur, adresse, garant. ${poids} Chaque pièce ajoutée rapproche le 5 / 5.`;
  }
}
export const couleurSignal = (v: number) => (v < 60 ? 'var(--alerte)' : v >= 85 ? 'var(--bon)' : 'var(--primaire)');

export interface Palier { id: string; nom: string; valeur: string; href: string; min: Niveau }
const premier = (ok: (p: Plafonds) => boolean): Niveau => NIVEAUX.find((n) => ok(PLAFONDS[n])) ?? 'ELITE';
/** Ce que chaque niveau ouvre (voir PLAFONDS dans core/credit.ts) ; `valeur` est celle du niveau donné. */
export function paliers(niveau: Niveau): Palier[] {
  const p = PLAFONDS[niveau];
  return [
    { id: 'auto', nom: 'Crédit auto', valeur: p.auto ? fcfa(p.auto) : '', href: '/auto', min: premier((x) => x.auto > 0) },
    { id: 'loyer', nom: 'Avance de loyer', valeur: p.avanceLoyerMois ? `${p.avanceLoyerMois} mois` : '', href: '/logement', min: premier((x) => x.avanceLoyerMois > 0) },
    { id: 'immo', nom: 'Crédit immobilier', valeur: p.immobilier ? 'Disponible' : '', href: '/logement', min: premier((x) => x.immobilier) }
  ];
}
