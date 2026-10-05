// Tâches et occurrences : ajout, matérialisation sur 90 jours, report, suppression (spec §7).
import { ajouterJours, localVersUtc } from '@core/dates.ts';
import { cleRappelBloc, idOccurrence, idRappel, nouvelId } from '@core/ids.ts';
import { occurrencesEntre, type Regle } from '@core/recurrence.ts';
import type { Jour } from '@core/types.ts';
import type { Occurrence, Rappel, Tache } from '@core/lignes.ts';
import { magasin } from '../magasin.svelte.ts';
import { aujourdhui, fuseau, horloge } from '../temps.svelte.ts';

export const HORIZON_JOURS = 90;

export interface NouvelleTache {
  titre: string;
  projetId: string | null;
  regle: Regle;
  heureDebut: number;
  dureeMin: number;
  rappelMin: number | null;
  sousProjetIds?: string[];
  /** Valeurs prévues par occurrence : { cle, valeur } en unité de base. */
  attendus?: { cle: string; valeur: number }[];
}

export function ajouterTache(n: NouvelleTache): string {
  const id = nouvelId();
  magasin.ecrire('taches', { id, titre: n.titre.trim() || 'Sans titre', projet_id: n.projetId, regle: n.regle, heure_debut: n.heureDebut, duree_min: n.dureeMin, rappel_min: n.rappelMin, actif: true });
  for (const sp of n.sousProjetIds ?? []) magasin.ecrire('tache_alimente', { id: nouvelId(), tache_id: id, sous_projet_id: sp });
  for (const a of n.attendus ?? []) magasin.ecrire('tache_attendus', { id: nouvelId(), tache_id: id, cle: a.cle, valeur_prevue: a.valeur });
  materialiserTache(id);
  return id;
}

/** Identifiants des occurrences que la règle de la tâche prévoit sur l'horizon. */
export function idsPrevus(tache: Pick<Tache, 'id' | 'regle'>, depuis: Jour): string[] {
  return occurrencesEntre(tache.regle, depuis, ajouterJours(depuis, HORIZON_JOURS)).map((j) => idOccurrence(tache.id, j));
}

/**
 * Crée les occurrences manquantes des HORIZON_JOURS prochains jours, et leurs rappels. N'écrase jamais une occurrence
 * existante et ne recrée jamais une occurrence supprimée (« cette occurrence »), sauf celles de `remplacer`.
 */
export function materialiserTache(tacheId: string, depuis: Jour = aujourdhui(), remplacer: ReadonlySet<string> = new Set()): number {
  const tache = magasin.trouver('taches', tacheId);
  if (!tache || !tache.actif) return 0;
  const tz = fuseau();
  const existantes = new Set(magasin.lignes.occurrences.filter((o) => o.tache_id === tacheId).map((o) => o.id));
  const ops: Parameters<typeof magasin.ecrireLot>[0] = [];
  for (const jour of occurrencesEntre(tache.regle, depuis, ajouterJours(depuis, HORIZON_JOURS))) {
    const id = idOccurrence(tacheId, jour);
    if (!remplacer.has(id) && (existantes.has(id) || magasin.estSupprime('occurrences', id))) continue;
    const debut = localVersUtc(jour, tache.heure_debut, tz);
    const fin = debut + tache.duree_min * 60000;
    ops.push(['occurrences', { id, tache_id: tacheId, jour, debut: new Date(debut).toISOString(), fin: new Date(fin).toISOString(), etat: 'prevue', demarree_a: null, pause_depuis: null, pause_cumulee_s: 0, terminee_a: null, exception: false }]);
    const rappel = rappelPour(tache, id, debut);
    if (rappel) ops.push(['rappels', rappel]);
  }
  if (ops.length) magasin.ecrireLot(ops, remplacer);
  return ops.filter((o) => o[0] === 'occurrences').length;
}

function rappelPour(tache: Tache, occId: string, debutMs: number): (Partial<Rappel> & { id: string }) | null {
  if (tache.rappel_min == null) return null;
  const envoyerA = debutMs - tache.rappel_min * 60000;
  if (envoyerA < horloge.maintenant) return null;
  const cle = cleRappelBloc(occId, tache.rappel_min);
  return { id: idRappel(cle), type: 'bloc', occurrence_id: occId, rapport_id: null, envoyer_a: new Date(envoyerA).toISOString(), etat: 'en_attente', cle_unique: cle, tentatives: 0, erreur: null };
}

/** Rematérialise toutes les tâches actives (au démarrage de l'app : prolonge l'horizon). */
export function prolongerHorizon(): void {
  for (const t of magasin.lignes.taches) if (t.actif) materialiserTache(t.id);
}

export interface Report { jour: Jour; debutMin: number; rappelMin: number | null }

/** Déplace une seule occurrence (la série reste intacte) et recalcule son rappel. */
export function reporter(occId: string, r: Report): void {
  const occ = magasin.trouver('occurrences', occId);
  const tache = occ && magasin.trouver('taches', occ.tache_id);
  if (!occ || !tache) return;
  const duree = Date.parse(occ.fin) - Date.parse(occ.debut);
  const debut = localVersUtc(r.jour, r.debutMin, fuseau());
  const ops: Parameters<typeof magasin.ecrireLot>[0] = [['occurrences', { id: occId, jour: r.jour, debut: new Date(debut).toISOString(), fin: new Date(debut + duree).toISOString(), etat: 'prevue', exception: true, demarree_a: null, pause_depuis: null, pause_cumulee_s: 0, terminee_a: null }]];
  for (const rp of magasin.lignes.rappels.filter((x) => x.occurrence_id === occId && x.etat === 'en_attente')) ops.push(['rappels', { id: rp.id, etat: 'annule' }]);
  if (r.rappelMin != null) {
    const cle = cleRappelBloc(occId, r.rappelMin);
    if (debut - r.rappelMin * 60000 >= horloge.maintenant) ops.push(['rappels', { id: idRappel(cle), type: 'bloc', occurrence_id: occId, rapport_id: null, envoyer_a: new Date(debut - r.rappelMin * 60000).toISOString(), etat: 'en_attente', cle_unique: cle, tentatives: 0, erreur: null }]);
  }
  magasin.ecrireLot(ops);
}

export type Portee = 'cette' | 'suivantes' | 'toute';

/** Supprime une occurrence, ou la série à partir d'un jour, ou toute la série. */
export function supprimerOccurrences(tacheId: string, portee: Portee, occId?: string): void {
  const occs = magasin.lignes.occurrences.filter((o) => o.tache_id === tacheId);
  const ref = occId ? occs.find((o) => o.id === occId) : undefined;
  const cibles: Occurrence[] = portee === 'cette' ? (ref ? [ref] : []) : portee === 'suivantes' ? occs.filter((o) => ref && o.jour >= ref.jour) : occs.filter((o) => o.etat !== 'faite');
  const ids = new Set(cibles.map((o) => o.id));
  const ops: Parameters<typeof magasin.ecrireLot>[0] = [];
  for (const rp of magasin.lignes.rappels) if (rp.occurrence_id && ids.has(rp.occurrence_id) && rp.etat === 'en_attente') ops.push(['rappels', { id: rp.id, etat: 'annule' }]);
  if (ops.length) magasin.ecrireLot(ops);
  magasin.supprimer('occurrences', [...ids]);
  const tache = magasin.trouver('taches', tacheId);
  if (portee === 'toute' || (portee === 'suivantes' && ref && ref.jour <= (tache?.regle.debut ?? ''))) magasin.ecrire('taches', { id: tacheId, actif: false });
  // « Celle-ci et les suivantes » : la série s'arrête la veille, sinon elle reviendrait au-delà de l'horizon.
  else if (portee === 'suivantes' && ref && tache) magasin.ecrire('taches', { id: tacheId, regle: { ...tache.regle, fin: { type: 'date', date: ajouterJours(ref.jour, -1) } } });
}

/**
 * Remet les rappels des occurrences à venir d'une tâche en accord avec son délai : annule ceux qui ne correspondent
 * plus et crée les nouveaux. Rend le nombre de rappels créés.
 */
export function replanifierRappels(tacheId: string): number {
  const tache = magasin.trouver('taches', tacheId);
  if (!tache) return 0;
  const occs = magasin.lignes.occurrences.filter((o) => o.tache_id === tacheId && o.etat === 'prevue' && Date.parse(o.debut) > horloge.maintenant);
  const ids = new Set(occs.map((o) => o.id));
  const voulus = new Map<string, Partial<Rappel> & { id: string }>();
  if (tache.actif) for (const o of occs) { const r = rappelPour(tache, o.id, Date.parse(o.debut)); if (r) voulus.set(r.id, r); }
  const ops: Parameters<typeof magasin.ecrireLot>[0] = [];
  for (const r of magasin.lignes.rappels) {
    if (r.type === 'bloc' && r.occurrence_id && ids.has(r.occurrence_id) && r.etat === 'en_attente' && !voulus.has(r.id)) ops.push(['rappels', { id: r.id, etat: 'annule' }]);
  }
  let crees = 0;
  for (const r of voulus.values()) {
    const ex = magasin.trouver('rappels', r.id);
    if (ex && ex.etat === 'en_attente' && ex.envoyer_a === r.envoyer_a) continue;
    ops.push(['rappels', r]);
    crees++;
  }
  if (ops.length) magasin.ecrireLot(ops);
  return crees;
}
