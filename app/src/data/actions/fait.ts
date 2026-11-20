// « Ce que j'ai fait » : un bloc créé après coup, déjà fait. Il n'était pas prévu : sa saisie porte la source « rattrapage »,
// ce qui le range dans la seule colonne « Fait » du Fil (spec §7, nov. 2026). Il alimente les sous-projets comme n'importe quelle saisie.
import { idOccurrence } from '@core/ids.ts';
import type { Jour } from '@core/types.ts';
import { magasin } from '../magasin.svelte.ts';
import { sousProjetsDe } from '../requetes.ts';
import { saisirBloc, terminerBloc } from './blocs.ts';
import { ajouterTache, materialiserTache } from './taches.ts';

export interface FaitNouveau { titre: string; projetId: string | null; jour: Jour; debutMin: number; dureeMin: number }

/** Crée la tâche (une seule fois, sans rappel), son bloc, et le termine tout de suite. Rend l'identifiant du bloc. */
export function ajouterFait(n: FaitNouveau): string | undefined {
  const duree = Math.max(5, Math.min(1440, Math.round(n.dureeMin)));
  const debut = Math.max(0, Math.min(1440 - duree, Math.round(n.debutMin)));
  const sps = n.projetId ? sousProjetsDe(n.projetId).filter((s) => s.statut !== 'termine') : [];
  const tacheId = ajouterTache({
    titre: n.titre, projetId: n.projetId, regle: { frequence: 'une_fois', debut: n.jour, fin: { type: 'aucune' } }, heureDebut: debut, dureeMin: duree,
    rappelMin: null, sousProjetIds: sps.map((s) => s.id), attendus: n.projetId ? [{ cle: 'temps', valeur: duree * 60 }] : []
  });
  materialiserTache(tacheId, n.jour); // un jour passé n'est pas dans l'horizon d'ajouterTache
  const occId = idOccurrence(tacheId, n.jour);
  if (!magasin.trouver('occurrences', occId)) return undefined;
  terminerBloc(occId);
  saisirBloc(occId, [{ cle: 'temps', num: duree * 60 }], { source: 'rattrapage' });
  return occId;
}
