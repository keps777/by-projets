// Poser ou retirer l'horaire type : une tâche récurrente par bloc de `HORAIRE_TYPE`, sans projet et sans rappel.
import type { Jour } from '@core/types.ts';
import { magasin } from '../magasin.svelte.ts';
import { HORAIRE_TYPE } from '../horaire-type.ts';
import { aujourdhui } from '../temps.svelte.ts';
import { ajouterTache, supprimerOccurrences } from './taches.ts';

const titres = new Set(HORAIRE_TYPE.map((b) => b.titre));
/** Tâches actives de l'horaire type déjà présentes (même titre, sans projet). */
const presentes = () => magasin.lignes.taches.filter((t) => t.actif && !t.projet_id && titres.has(t.titre));

export const horaireTypePose = (): number => new Set(presentes().map((t) => t.titre)).size;

/** Crée les blocs qui manquent, à partir de `depuis` (aujourd'hui par défaut). Rend le nombre de tâches créées. */
export function poserHoraireType(depuis: Jour = aujourdhui()): number {
  const deja = new Set(presentes().map((t) => t.titre));
  let n = 0;
  for (const b of HORAIRE_TYPE) {
    if (deja.has(b.titre)) continue;
    const quotidien = b.jours.length === 7;
    ajouterTache({
      titre: b.titre, projetId: null, heureDebut: b.debut, dureeMin: b.fin - b.debut, rappelMin: null,
      regle: quotidien ? { frequence: 'quotidien', debut: depuis, fin: { type: 'aucune' } } : { frequence: 'hebdo', debut: depuis, jours: b.jours, fin: { type: 'aucune' } }
    });
    n++;
  }
  return n;
}

/** Supprime les séries de l'horaire type (les blocs déjà faits sont gardés). Rend le nombre de tâches retirées. */
export function retirerHoraireType(): number {
  const t = presentes();
  for (const x of t) supprimerOccurrences(x.id, 'toute');
  return t.length;
}
