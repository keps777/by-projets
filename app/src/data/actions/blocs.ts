// Vie d'un bloc : lancer, pause, terminer, saisie unique et correction (spec §8).
import { idSaisie, idSaisieValeur } from '@core/ids.ts';
import { ecouleS, initial, lancer, pause, reprendre, terminer, type Minuteur } from '@core/minuteur.ts';
import type { Occurrence, Saisie, SaisieValeur, SourceSaisie } from '@core/lignes.ts';
import { magasin } from '../magasin.svelte.ts';
import { horloge } from '../temps.svelte.ts';

export const minuteurDe = (o: Occurrence): Minuteur => ({
  etat: o.etat === 'ignoree' ? 'prevue' : o.etat,
  demarreeA: o.demarree_a ? Date.parse(o.demarree_a) : null,
  pauseDepuis: o.pause_depuis ? Date.parse(o.pause_depuis) : null,
  pauseCumuleeS: o.pause_cumulee_s,
  termineeA: o.terminee_a ? Date.parse(o.terminee_a) : null
});

const iso = (ms: number | null) => (ms == null ? null : new Date(ms).toISOString());

function appliquer(id: string, m: Minuteur): void {
  magasin.ecrire('occurrences', { id, etat: m.etat, demarree_a: iso(m.demarreeA), pause_depuis: iso(m.pauseDepuis), pause_cumulee_s: m.pauseCumuleeS, terminee_a: iso(m.termineeA) });
}

/** Secondes écoulées d'une occurrence : en direct si elle tourne, figées sinon. */
export function ecouleOccurrence(o: Occurrence, now = horloge.maintenant): number { return ecouleS(minuteurDe(o), now); }

export function lancerBloc(occId: string): void {
  const o = magasin.trouver('occurrences', occId);
  if (!o) return;
  // Relancer un bloc déjà fait ou corrigé : on repart du temps déjà enregistré.
  const acquis = magasin.lignes.saisies.find((s) => s.occurrence_id === occId) ? valeurSaisie(occId, 'temps') ?? 0 : 0;
  appliquer(occId, lancer(Date.now(), o.etat === 'faite' ? acquis : 0));
}

export function pauseBloc(occId: string): void { const o = magasin.trouver('occurrences', occId); if (o) appliquer(occId, pause(minuteurDe(o), Date.now())); }
export function reprendreBloc(occId: string): void { const o = magasin.trouver('occurrences', occId); if (o) appliquer(occId, reprendre(minuteurDe(o), Date.now())); }

export interface ValeurEntree { cle: string; num?: number | null; txt?: string | null; detail?: SaisieValeur['detail'] }

/** Écrit (ou corrige) la saisie d'une occurrence : un seul endroit, lu par tous les sous-projets du projet. */
export function saisirBloc(occId: string, valeurs: ValeurEntree[], opts: { source?: SourceSaisie; note?: string | null; approx?: boolean } = {}): Saisie | undefined {
  const o = magasin.trouver('occurrences', occId);
  const tache = o && magasin.trouver('taches', o.tache_id);
  if (!o || !tache) return undefined;
  const sid = idSaisie(occId);
  const ops: Parameters<typeof magasin.ecrireLot>[0] = [['saisies', { id: sid, projet_id: tache.projet_id, occurrence_id: occId, jour: o.jour, source: opts.source ?? 'bloc', note: opts.note ?? magasin.trouver('saisies', sid)?.note ?? null, approx: opts.approx ?? magasin.trouver('saisies', sid)?.approx ?? false }]];
  for (const v of valeurs) ops.push(['saisie_valeurs', { id: idSaisieValeur(sid, v.cle), saisie_id: sid, cle: v.cle, valeur_num: v.num ?? null, valeur_txt: v.txt ?? null, detail: v.detail ?? null }]);
  magasin.ecrireLot(ops);
  return magasin.trouver('saisies', sid);
}

export function valeurSaisie(occId: string, cle: string): number | null {
  const s = magasin.lignes.saisies.find((x) => x.occurrence_id === occId);
  return s ? magasin.lignes.saisie_valeurs.find((v) => v.saisie_id === s.id && v.cle === cle)?.valeur_num ?? null : null;
}

/** Valeurs prévues de la tâche (réglées à l'ajout), en unité de base. */
export const attendusDe = (tacheId: string) => magasin.lignes.tache_attendus.filter((a) => a.tache_id === tacheId);

/**
 * Termine un bloc (« Oui, c'est fait ») : fige le minuteur, enregistre le temps écoulé et, pour chaque autre métrique,
 * la valeur prévue — sauf celles déjà corrigées à la main. Un bloc jamais lancé prend sa durée prévue.
 */
export function terminerBloc(occId: string): void {
  const o = magasin.trouver('occurrences', occId);
  const tache = o && magasin.trouver('taches', o.tache_id);
  if (!o || !tache) return;
  const m = minuteurDe(o);
  const fini = m.demarreeA == null ? { ...initial(), etat: 'faite' as const, demarreeA: Date.parse(o.debut), termineeA: Date.parse(o.fin) } : terminer(m, Date.now());
  appliquer(occId, fini);
  // Bloc jamais lancé : durée de cette occurrence (elle peut différer de la tâche après un report).
  const sec = m.demarreeA == null ? Math.max(0, Math.round((Date.parse(o.fin) - Date.parse(o.debut)) / 1000)) : ecouleS(fini, Date.now());
  const existantes = new Set(magasin.lignes.saisie_valeurs.filter((v) => v.saisie_id === idSaisie(occId)).map((v) => v.cle));
  const valeurs: ValeurEntree[] = [{ cle: 'temps', num: sec }];
  for (const a of attendusDe(tache.id)) if (a.cle !== 'temps' && !existantes.has(a.cle)) valeurs.push({ cle: a.cle, num: a.valeur_prevue });
  saisirBloc(occId, valeurs, { source: m.demarreeA == null ? 'bloc' : 'minuteur' });
}

/** Coche ou décoche un bloc sans minuteur. */
export function basculerFait(occId: string): void {
  const o = magasin.trouver('occurrences', occId);
  if (!o) return;
  if (o.etat === 'faite') magasin.ecrire('occurrences', { id: occId, etat: 'prevue', terminee_a: null, demarree_a: null, pause_depuis: null, pause_cumulee_s: 0 });
  else terminerBloc(occId);
}

/** Correction manuelle d'une valeur (volet du bloc). */
export function corrigerValeur(occId: string, cle: string, num: number): void {
  saisirBloc(occId, [{ cle, num }], { source: 'bloc' });
  // Spec §8 : une saisie confirme le bloc. Un minuteur en cours reste maître de son état.
  const o = magasin.trouver('occurrences', occId);
  if (o && o.etat === 'prevue' && num > 0) magasin.ecrire('occurrences', { id: occId, etat: 'faite', terminee_a: new Date().toISOString() });
}
