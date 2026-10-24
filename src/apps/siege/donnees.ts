// Passerelle monde → analyses : convertit le monde simulé vers les entrées pures de `core/analyses.ts`.
import { ventes, type DepartA, type LigneA, type VenteDepart } from '../../core/analyses.ts';
import { app, aujourdhui } from '../../data/store.svelte.ts';

export function ventesDu(debut: string, fin: string): VenteDepart[] {
  const lignes: LigneA[] = app.monde.lignes;
  const departs: DepartA[] = app.monde.departs.map((d) => ({ id: d.id, ligneId: d.ligneId, jour: d.jour, heure: d.heure, busId: d.busId, capacite: d.capacite, prix: d.prix, statut: d.statut, retardMin: d.retardMin, prisAilleurs: d.prisAilleurs.length }));
  return ventes({ lignes, departs, billets: app.monde.billets, aujourdhui: aujourdhui(), debut, fin });
}

import { hash01 } from '../../core/analyses.ts';
import { personne } from '../../domain/actions.ts';
/** Chauffeur d'un départ : celui qui est affecté ; à défaut, le chauffeur habituel de la compagnie (choisi de façon stable d'après le bus). */
export function chauffeurDe(departId: string, compagnieId: string, busId: string) {
  const affecte = personne(app.monde.departs.find((d) => d.id === departId)?.chauffeurId);
  if (affecte) return affecte;
  const equipe = app.monde.personnes.filter((p) => p.role === 'chauffeur' && p.compagnieId === compagnieId && p.actif);
  return equipe.length ? equipe[Math.floor(hash01(busId) * equipe.length)] : undefined;
}
export const nomCourt = (p: { prenom: string; nom: string } | undefined) => (p ? `${p.prenom} ${p.nom[0]}.` : '—');
