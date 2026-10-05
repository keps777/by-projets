// Modifier une tâche existante (spec §7.2, US-13) : cette occurrence, celle-ci et les suivantes, ou toute la série.
import { ajouterJours, localVersUtc } from '@core/dates.ts';
import { nouvelId } from '@core/ids.ts';
import type { Jour } from '@core/types.ts';
import { magasin } from '../../data/magasin.svelte.ts';
import { fuseau } from '../../data/temps.svelte.ts';
import { ajouterTache, idsPrevus, materialiserTache, reporter, type NouvelleTache } from '../../data/actions/taches.ts';

/** Occurrences encore prévues d'une tâche à partir d'un jour (les faites, et par défaut les reportées, restent). */
function prevues(tacheId: string, depuis: Jour, garderExceptions = true): Set<string> {
  return new Set(magasin.lignes.occurrences.filter((o) => o.tache_id === tacheId && o.jour >= depuis && o.etat === 'prevue' && !(garderExceptions && o.exception)).map((o) => o.id));
}

/** Annule les rappels en attente de ces occurrences, puis supprime celles qui ne sont pas dans `garder`. */
function retirer(ids: Set<string>, garder: ReadonlySet<string> = new Set()): void {
  if (!ids.size) return;
  const rappels = magasin.lignes.rappels.filter((r) => r.occurrence_id && ids.has(r.occurrence_id) && r.etat === 'en_attente');
  if (rappels.length) magasin.ecrireLot(rappels.map((r) => ['rappels', { id: r.id, etat: 'annule' }] as ['rappels', { id: string; etat: 'annule' }]));
  magasin.supprimer('occurrences', [...ids].filter((id) => !garder.has(id)));
}

/** Remplace les sous-projets alimentés et les valeurs prévues d'une tâche. */
function remplacerLiens(tacheId: string, n: NouvelleTache): void {
  magasin.supprimer('tache_alimente', magasin.lignes.tache_alimente.filter((a) => a.tache_id === tacheId).map((a) => a.id));
  magasin.supprimer('tache_attendus', magasin.lignes.tache_attendus.filter((a) => a.tache_id === tacheId).map((a) => a.id));
  for (const sp of n.sousProjetIds ?? []) magasin.ecrire('tache_alimente', { id: nouvelId(), tache_id: tacheId, sous_projet_id: sp });
  for (const a of n.attendus ?? []) magasin.ecrire('tache_attendus', { id: nouvelId(), tache_id: tacheId, cle: a.cle, valeur_prevue: a.valeur });
}

/** Toute la série : la tâche change, ses occurrences à venir sont recréées avec les nouvelles heures (le passé ne bouge pas). */
export function modifierSerie(tacheId: string, n: NouvelleTache, aujourdhui: Jour): void {
  magasin.ecrire('taches', { id: tacheId, titre: n.titre.trim() || 'Sans titre', projet_id: n.projetId, regle: n.regle, heure_debut: n.heureDebut, duree_min: n.dureeMin, rappel_min: n.rappelMin, ...(n.rappelsAvantMin?.length || magasin.trouver('taches', tacheId)?.rappels_avant_min?.length ? { rappels_avant_min: n.rappelsAvantMin ?? [] } : {}), actif: true });
  remplacerLiens(tacheId, n);
  // Une tâche « ce jour seulement » n'a qu'une occurrence : on la recrée même si elle avait été reportée.
  const cibles = prevues(tacheId, aujourdhui, n.regle.frequence !== 'une_fois');
  const depuis = aujourdhui > n.regle.debut ? aujourdhui : n.regle.debut;
  // Toutes les occurrences à venir de la nouvelle règle sont (ré)écrites sur place, même identifiant, y compris celles
  // supprimées auparavant ; seules restent intactes les occurrences faites, en cours ou reportées. Les autres prévues sont supprimées.
  const intactes = new Set(magasin.lignes.occurrences.filter((o) => o.tache_id === tacheId && !cibles.has(o.id)).map((o) => o.id));
  const reecrites = new Set(idsPrevus({ id: tacheId, regle: n.regle }, depuis).filter((id) => !intactes.has(id)));
  retirer(cibles, reecrites);
  materialiserTache(tacheId, depuis, reecrites);
}

/** Celle-ci et les suivantes : l'ancienne série s'arrête la veille, une nouvelle tâche reprend à partir de ce jour. */
export function modifierSuivantes(tacheId: string, depuis: Jour, n: NouvelleTache): string {
  const t = magasin.trouver('taches', tacheId);
  if (t) magasin.ecrire('taches', { id: tacheId, regle: { ...t.regle, fin: { type: 'date', date: ajouterJours(depuis, -1) } } });
  retirer(prevues(tacheId, depuis, false));
  return ajouterTache({ ...n, regle: { ...n.regle, debut: n.regle.debut > depuis ? n.regle.debut : depuis } });
}

/** Cette occurrence seulement : jour, heure, durée et rappel ; elle devient une exception de la série. */
export function modifierOccurrence(occId: string, jour: Jour, heure: number, duree: number, rappel: number | null): void {
  reporter(occId, { jour, debutMin: heure, rappelMin: rappel });
  const debut = localVersUtc(jour, heure, fuseau());
  magasin.ecrire('occurrences', { id: occId, fin: new Date(debut + duree * 60000).toISOString() });
}
