// « Ces billets cherchent un voyageur » : les reventes de la semaine (droits en vente dont le vol part dans les 7 jours, échéance J-1 non passée).
import { ecart, type Ecart } from '../../core/argent.ts';
import { departDe, echeanceDe, joursAvant, peutEchanger } from '../../core/regles.ts';
import type { Monde } from '../../domain/types.ts';

export const SEMAINE_MS = 7 * 24 * 3_600_000;
export interface Revente {
  /** « revente:d-r830 » : identifiant de l'offre (route `/offre/:offreId`). */
  offreId: string; droitId: string; volId: string; code: string; ville: string; pays: string;
  /** « AE 830 » et « Aérolys 830 ». */ numero: string; compagnie: string; numeroAffiche: string;
  jour: string; heureDepart: string; heureArrivee: string; plusJours: number;
  departMs: number; echeanceMs: number; joursAvantDepart: number;
  prix: number; prixEquivalent: number; ecart: Ecart;
}
/** Reventes de la semaine, de la plus proche à la plus lointaine. `compteId` : ses propres annonces sont écartées (on n'achète pas son billet). */
export function reventesDeLaSemaine(monde: Monde, now: number, compteId?: string | null): Revente[] {
  const res: Revente[] = [];
  for (const d of monde.droits) {
    if (d.statut !== 'en_vente' || !d.annonce || d.detenteurId === compteId) continue;
    const v = monde.vols.find((x) => x.id === d.volId); if (!v) continue;
    const dep = departDe(v.jour, v.heureDepart);
    if (dep > now + SEMAINE_MS || !peutEchanger(dep, now)) continue;
    const a = monde.aeroports.find((x) => x.code === v.vers), cie = monde.compagnies.find((c) => c.id === v.compagnieId);
    res.push({ offreId: `revente:${d.id}`, droitId: d.id, volId: v.id, code: v.vers, ville: a?.ville ?? v.vers, pays: a?.pays ?? '', numero: v.numero, compagnie: cie?.nom ?? '', numeroAffiche: `${cie?.nom ?? ''} ${v.numero.split(' ')[1] ?? v.numero}`.trim(),
      jour: v.jour, heureDepart: v.heureDepart, heureArrivee: v.heureArrivee, plusJours: v.plusJours, departMs: dep, echeanceMs: echeanceDe(dep), joursAvantDepart: joursAvant(dep, now),
      prix: d.annonce.prix, prixEquivalent: v.prixNeuf, ecart: ecart(v.prixNeuf, d.annonce.prix) });
  }
  return res.sort((a, b) => a.departMs - b.departMs || a.prix - b.prix);
}
export type Tri = 'depart' | 'prix' | 'ecart';
export const TRIS: { id: Tri; libelle: string }[] = [{ id: 'depart', libelle: 'Départ le plus proche' }, { id: 'prix', libelle: 'Prix le plus bas' }, { id: 'ecart', libelle: 'Plus grand écart' }];
/** Copie triée : départ proche, prix croissant, ou plus forte baisse par rapport au prix équivalent. */
export function trier(liste: Revente[], tri: Tri): Revente[] {
  const c = [...liste];
  if (tri === 'prix') return c.sort((a, b) => a.prix - b.prix || a.departMs - b.departMs);
  if (tri === 'ecart') return c.sort((a, b) => a.ecart.pct - b.ecart.pct || a.departMs - b.departMs);
  return c.sort((a, b) => a.departMs - b.departMs || a.prix - b.prix);
}
/** Heure d'arrivée affichée : « 06:10 (+1) ». */
export const arrivee = (r: Pick<Revente, 'heureArrivee' | 'plusJours'>): string => `${r.heureArrivee}${r.plusJours > 0 ? ` (+${r.plusJours})` : ''}`;
/** Taille (px) du nom de la ville sur la carte : le plus grand possible sans déborder (92 px pour « Paris », moins pour « Punta Cana »). */
export const tailleVille = (nom: string): number => Math.max(52, Math.min(92, Math.floor(280 / (Math.max(nom.length, 1) * 0.44))));
/** Pose d'une carte de la pile selon son rang devant la pile : 0 = devant, 1 et 2 = visibles derrière, la dernière passée est revenue tout au fond (encore visible), les autres attendent cachées. `sortie` : la carte qu'on vient de passer quitte la pile par la gauche, avant de revenir au fond. */
export type Pose = 'devant' | 'derriere1' | 'derriere2' | 'dernier' | 'sortie' | 'cachee';
export function poseDe(rang: number, total: number): Pose {
  if (rang === 0) return 'devant';
  if (total > 3 && rang === total - 1) return 'dernier';
  return rang === 1 ? 'derriere1' : rang === 2 ? 'derriere2' : 'cachee';
}
