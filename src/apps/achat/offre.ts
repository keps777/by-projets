// Résolution d'un identifiant d'offre (« revente:d-r816 », « neuf:v-ae816 », « agence:oa-1 », « drop:drop-127 ») vers l'offre du marché.
import { app } from '../../data/store.svelte.ts';
import { compteDe } from '../../domain/compte.ts';
import { offresDuVol, type Offre, type TypeOffre } from '../../domain/marche.ts';
import type { Monde } from '../../domain/types.ts';

const TYPES: TypeOffre[] = ['neuf', 'revente', 'agence', 'drop'];
/** Découpe « type:référence » au premier deux-points (la référence peut elle-même en contenir). `null` si le type est inconnu ou la référence vide. */
export function decouperOffreId(offreId: string | undefined): { type: TypeOffre; ref: string } | null {
  if (!offreId) return null; const i = offreId.indexOf(':'); if (i < 1) return null;
  const type = offreId.slice(0, i) as TypeOffre, ref = offreId.slice(i + 1).trim();
  return TYPES.includes(type) && ref ? { type, ref } : null;
}
/** Le vol d'une offre, retrouvé dans le monde : le vol lui-même (neuf), l'annonce du droit (revente), l'offre d'agence ou le drop. `undefined` si la référence n'existe pas. */
export function volIdDeOffre(monde: Pick<Monde, 'droits' | 'offresAgence' | 'drops' | 'vols'>, offreId: string): string | undefined {
  const o = decouperOffreId(offreId); if (!o) return undefined;
  if (o.type === 'neuf') return monde.vols.find((v) => v.id === o.ref)?.id;
  if (o.type === 'revente') return monde.droits.find((d) => d.id === o.ref)?.volId;
  if (o.type === 'agence') return monde.offresAgence.find((a) => a.id === o.ref)?.volId;
  return monde.drops.find((d) => d.id === o.ref)?.volId;
}
/** L'offre à payer, telle que le marché la propose aujourd'hui ; `undefined` si elle n'existe plus (billet vendu ou retiré). */
export function trouverOffre(offreId: string, pass = false): Offre | undefined {
  const volId = volIdDeOffre(app.monde, offreId); if (!volId) return undefined;
  return offresDuVol(volId, pass).find((x) => x.id === offreId);
}
/** Un drop ou une offre masquée ne se paie pas depuis cet écran. */
export const payableIci = (o: Offre): boolean => !o.masquee && o.type !== 'drop';
/** Pourquoi on ne peut pas payer cette offre (message clair), ou `null` si c'est possible. */
export function obstacleAchat(o: Offre, compteId: string): string | null {
  if (o.type === 'drop' || o.masquee) return 'Les drops s’achètent depuis l’écran du drop.';
  if (o.type === 'revente') { const d = app.monde.droits.find((x) => x.id === o.droitId); if (d?.detenteurId === compteId) return 'Vous ne pouvez pas acheter votre propre annonce.'; }
  return null;
}
export const libelleTypeOffre = (t: TypeOffre): string => (t === 'neuf' ? 'Neuf' : t === 'revente' ? 'Revente' : t === 'agence' ? 'Agence' : 'Drop');
/** Nom du détenteur d'un droit pour l'affichage (« Alex T. »). */
export function detenteurCourt(compteId: string): string { const c = compteDe(compteId); return c ? `${c.prenom} ${c.nom ? c.nom[0].toUpperCase() + '.' : ''}`.trim() : 'Un détenteur'; }
