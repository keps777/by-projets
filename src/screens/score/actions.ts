import { app, maintenant, nouvelId, notifier } from '../../data/store.svelte.ts';
import { DESCRIPTION_NIVEAU } from '../../core/credit.ts';
import { CONSEILS, POIDS, type Signaux } from '../../core/score.ts';
import { appliquerPoints, libelleMois, pousserSignal, synchroniserHistorique, type ResultatPoints } from '../../core/scoreHistorique.ts';
import { etatScore, MAX_EVENEMENTS } from './etat.ts';

const moisCourant = (now = maintenant()) => libelleMois(new Date(now));

/**
 * Ajoute (ou retire) des points au score : borné à 400–900, courbe du mois mise à jour, journal tenu,
 * notification en cas de changement de niveau (le niveau n'est jamais stocké : il vient de `niveauDuScore`).
 * `signal` : signal de la fiche (ponctualité, épargne…) à faire bouger dans le même sens.
 */
export function ajouterPoints(motif: string, delta: number, signal?: keyof Signaux, now = maintenant()): ResultatPoints {
  const r = appliquerPoints(app.score.valeur, delta, app.score.historique, moisCourant(now));
  app.score.valeur = r.apres;
  app.score.historique = r.historique;
  if (signal && signal in POIDS) app.score.signaux[signal] = pousserSignal(app.score.signaux[signal] ?? 0, delta);
  if (r.reel !== 0) {
    const e = etatScore();
    e.evenements.unshift({ id: nouvelId('s'), ts: now, motif, delta: r.reel });
    if (e.evenements.length > MAX_EVENEMENTS) e.evenements.length = MAX_EVENEMENTS;
  }
  if (r.niveauApres !== r.niveauAvant) {
    const monte = r.apres > r.avant;
    notifier({ titre: monte ? `Niveau ${r.niveauApres} atteint` : `Niveau repassé à ${r.niveauApres}`, sous: monte ? DESCRIPTION_NIVEAU[r.niveauApres] : `Votre score est repassé sous le seuil ${r.niveauAvant}.`, lien: '/score', ts: now });
  }
  return r;
}

/** Aligne l'historique sur le mois en cours (si d'autres fonctionnalités ont modifié `app.score.valeur` directement). */
export function synchroniserScore() {
  app.score.historique = synchroniserHistorique(app.score.historique, app.score.valeur, moisCourant());
}

export const conseilFait = (id: string) => app.score.conseilsFaits.includes(id);
/** Marque un conseil comme fait (+ses points) ou le retire (−ses points). Idempotent. Renvoie la variation appliquée. */
export function basculerConseil(id: string): number {
  const c = CONSEILS.find((x) => x.id === id); if (!c) return 0;
  const signal: keyof Signaux = id === 'facture' ? 'ponctualite' : id === 'epargne' ? 'epargne' : 'dossier';
  if (conseilFait(id)) {
    app.score.conseilsFaits = app.score.conseilsFaits.filter((x) => x !== id);
    return ajouterPoints(`Conseil retiré : ${c.titre}`, -c.points, signal).reel;
  }
  app.score.conseilsFaits = [...app.score.conseilsFaits, id];
  return ajouterPoints(`Conseil : ${c.titre}`, c.points, signal).reel;
}
