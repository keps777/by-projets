// Enregistrement d'une session chronométrée d'un point du rapport : une nouvelle saisie du projet, qui s'ajoute au total du jour.
import { idSaisieValeur, nouvelId } from '@core/ids.ts';
import type { Jour, TypeMetrique } from '@core/types.ts';
import { magasin } from '../../data/magasin.svelte.ts';

export interface ValeurSession { cle: string; type: TypeMetrique; num?: number | null; txt?: string | null; detail?: unknown[] }

/** Un champ vide ou nul n'est pas enregistré ; un « oui/non » ou un compteur à zéro non plus. */
export function valeursARetenir(valeurs: ValeurSession[]): ValeurSession[] {
  return valeurs.filter((v) => (v.type === 'reference' ? !!v.txt?.trim() : v.num != null && v.num > 0));
}

/**
 * Écrit la session : temps passé (secondes, unité de base) + les autres mesures remplies. C'est une saisie à part
 * (source « minuteur ») : les sessions du jour s'additionnent, et la saisie manuelle du jour reste corrigeable.
 * Rend l'identifiant de la saisie, ou null si rien n'est à enregistrer.
 */
export function enregistrerSession(projetId: string, jour: Jour, secondes: number, autres: ValeurSession[] = [], cleTemps = 'temps'): string | null {
  const s = Math.max(0, Math.round(secondes));
  const reste = valeursARetenir(autres);
  if (!s && !reste.length) return null;
  const sid = nouvelId();
  const ops: Parameters<typeof magasin.ecrireLot>[0] = [['saisies', { id: sid, projet_id: projetId, occurrence_id: null, jour, source: 'minuteur', note: null, approx: false }]];
  if (s) ops.push(['saisie_valeurs', { id: idSaisieValeur(sid, cleTemps), saisie_id: sid, cle: cleTemps, valeur_num: s, valeur_txt: null, detail: null }]);
  for (const v of reste) {
    ops.push(['saisie_valeurs', { id: idSaisieValeur(sid, v.cle), saisie_id: sid, cle: v.cle, valeur_num: v.type === 'reference' ? null : v.num ?? null, valeur_txt: v.type === 'reference' ? v.txt!.trim() : null, detail: v.detail ?? null }]);
  }
  magasin.ecrireLot(ops);
  return sid;
}
