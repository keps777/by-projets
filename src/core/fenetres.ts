// Logique pure des fenêtres globales (orbe, notifications) : qui y a droit, quand elles se ferment, comment les notifications se regroupent par jour.
import { ajouterJours, jourDe, type Jour } from './dates.ts';

/** Cadre de la page courante (`web` = application du siège, sans fenêtres globales). */
export type CadrePage = 'mobile' | 'plein' | 'web' | undefined;

/** L'orbe n'existe que pour la voyageuse, sur une page mobile, et pas sur sa propre page autonome `/orbe`. */
export function orbeAutorisee(role: string | null | undefined, cadre: CadrePage, chemin: string): boolean {
  return role === 'voyageur' && cadre !== 'web' && chemin.replace(/\/+$/, '') !== '/orbe';
}
/** Les notifications sont lisibles par toute personne connectée sur une page mobile (pas au siège, pas sur la page autonome `/notifications`). */
export function notificationsAutorisees(role: string | null | undefined, cadre: CadrePage, chemin: string): boolean {
  return !!role && cadre !== 'web' && chemin.replace(/\/+$/, '') !== '/notifications';
}
/** Clé d'une destination : toute modification (chemin ou requête) ferme les fenêtres globales. */
export const cleDePage = (chemin: string, recherche: string) => `${chemin}${recherche}`;

/** Raccourci d'ouverture de l'orbe : Ctrl + K (Windows, Linux) ou ⌘ + K (Mac). */
export const estRaccourciOrbe = (e: { key: string; ctrlKey: boolean; metaKey: boolean; altKey?: boolean; shiftKey?: boolean }) =>
  (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k';

export interface NotifMin { id: string; ts: number; lu: boolean }
export interface GroupeJour<T> { cle: 'auj' | 'hier' | 'avant'; items: T[] }
/** Regroupe (du plus récent au plus ancien) en « aujourd'hui », « hier » et « plus tôt » ; les groupes vides disparaissent. */
export function grouperParJour<T extends NotifMin>(liste: T[], auj: Jour): GroupeJour<T>[] {
  const hier = ajouterJours(auj, -1);
  const g: GroupeJour<T>[] = [{ cle: 'auj', items: [] }, { cle: 'hier', items: [] }, { cle: 'avant', items: [] }];
  for (const n of [...liste].sort((a, b) => b.ts - a.ts)) { const j = jourDe(new Date(n.ts)); g[j >= auj ? 0 : j === hier ? 1 : 2].items.push(n); }
  return g.filter((x) => x.items.length);
}
/** Compteur lisible de l'en-tête : « 3 non lues », « 1 non lue », « Tout est lu », « Aucune notification ». */
export const compteurNotifications = (total: number, nonLues: number) => (total === 0 ? 'Aucune notification' : nonLues === 0 ? 'Tout est lu' : `${nonLues} non lue${nonLues > 1 ? 's' : ''}`);
