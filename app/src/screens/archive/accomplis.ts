// Sous-projets accomplis (onglet Accomplis de l'Archive), du plus récent au plus ancien, groupés par mois. Fonctions pures.
import type { Projet, Rubrique, SousProjetLigne } from '@core/lignes.ts';
import type { Jour, Mois } from '@core/types.ts';

export interface Accompli { sp: SousProjetLigne; projet: Projet | undefined; rubrique: Rubrique | undefined; jour: Jour }

/** Un sous-projet est accompli quand il est terminé (validé), y compris s'il a été archivé ensuite avec sa date de fin. */
export function accomplis(l: { sous_projets: SousProjetLigne[]; projets: Projet[]; rubriques: Rubrique[] }): Accompli[] {
  const projets = new Map(l.projets.map((p) => [p.id, p]));
  const rubriques = new Map(l.rubriques.map((r) => [r.id, r]));
  return l.sous_projets
    .filter((sp) => sp.statut === 'termine' || (sp.statut === 'archive' && sp.termine_le))
    .map((sp) => {
      const projet = projets.get(sp.projet_id);
      return { sp, projet, rubrique: projet ? rubriques.get(projet.rubrique_id) : undefined, jour: (sp.termine_le ?? sp.fin ?? sp.updated_at).slice(0, 10) };
    })
    .sort((a, b) => (a.jour < b.jour ? 1 : a.jour > b.jour ? -1 : 0));
}

export function groupesParMois(liste: Accompli[]): { mois: Mois; items: Accompli[] }[] {
  const res: { mois: Mois; items: Accompli[] }[] = [];
  for (const a of liste) {
    const m = a.jour.slice(0, 7);
    const dernier = res[res.length - 1];
    if (dernier?.mois === m) dernier.items.push(a); else res.push({ mois: m, items: [a] });
  }
  return res;
}
