// « Remplis ma semaine » : repère les sous-projets dont l'objectif de temps de la semaine ne sera pas atteint
// avec ce qui est déjà fait et prévu, et propose un créneau libre pour chacun.
import { metriquePilote } from '@core/progression.ts';
import type { Creneau, Jour } from '@core/types.ts';
import { magasin } from '../../data/magasin.svelte.ts';
import { COULEUR_SANS_PROJET, blocsDuJour, enMetrique, metriquesDe, profil, valeursDuSousProjet, type BlocVue } from '../../data/requetes.ts';
import { ajouterTache } from '../../data/actions/taches.ts';
import { cibleHebdo, dureeProposee, trouverCreneau } from './semaine.ts';

export interface Proposition { spId: string; projetId: string; titre: string; couleur: string; jour: Jour; debut: number; duree: number }

export function propositionsDeLaSemaine(jours: Jour[], blocsParJour: Record<Jour, BlocVue[]>, aujourdhui: Jour, maintenantMin: number): Proposition[] {
  const dimanche = jours[6];
  if (dimanche < aujourdhui) return [];
  const restants = jours.filter((j) => j >= aujourdhui);
  const creneaux: Record<Jour, Creneau[]> = {};
  for (const j of jours) creneaux[j] = (blocsParJour[j] ?? []).map((b) => ({ debut: b.debutMin, fin: b.finMin, titre: b.titre, id: b.occ.id }));
  const servis = new Set<Jour>();
  const res: Proposition[] = [];
  const sps = magasin.lignes.sous_projets.filter((s) => s.statut === 'en_cours' && s.debut <= dimanche && (!s.fin || s.fin >= jours[0]));
  for (const sp of sps) {
    const pilote = metriquePilote(metriquesDe(sp.id).map(enMetrique), sp.metrique_pilote_id);
    if (!pilote || pilote.type !== 'temps') continue;
    const cible = cibleHebdo(pilote, sp, aujourdhui.slice(0, 7));
    if (cible == null) continue;
    const fait = valeursDuSousProjet(sp).filter((v) => v.cle === pilote.cle && v.jour >= jours[0] && v.jour <= dimanche).reduce((s, v) => s + v.valeur, 0);
    let prevu = 0;
    for (const j of restants) for (const b of blocsParJour[j] ?? []) {
      if (b.fait || !b.sousProjets.some((s) => s.id === sp.id)) continue;
      if (j === aujourdhui && b.finMin <= maintenantMin) continue;
      prevu += (b.finMin - b.debutMin) * 60;
    }
    const duree = dureeProposee(cible - fait - prevu);
    if (!duree) continue;
    const c = trouverCreneau(creneaux, restants, duree, { jour: aujourdhui, min: maintenantMin }, servis);
    if (!c) continue;
    servis.add(c.jour);
    creneaux[c.jour] = [...(creneaux[c.jour] ?? []), { debut: c.debut, fin: c.debut + duree, titre: sp.nom }];
    const projet = magasin.trouver('projets', sp.projet_id);
    const rubrique = projet ? magasin.trouver('rubriques', projet.rubrique_id) : undefined;
    res.push({ spId: sp.id, projetId: sp.projet_id, titre: projet?.nom ?? sp.nom, couleur: rubrique?.couleur ?? COULEUR_SANS_PROJET, jour: c.jour, debut: c.debut, duree });
  }
  return res.sort((a, b) => a.jour.localeCompare(b.jour) || a.debut - b.debut);
}

/** Place les créneaux proposés : une tâche « ce jour seulement » par proposition, liée à son sous-projet. */
export function placer(props: Proposition[]): void {
  const rappel = profil()?.rappel_defaut_min ?? 10;
  for (const p of props) {
    ajouterTache({ titre: p.titre, projetId: p.projetId, regle: { frequence: 'une_fois', debut: p.jour, fin: { type: 'aucune' } }, heureDebut: p.debut, dureeMin: p.duree, rappelMin: rappel, sousProjetIds: [p.spId], attendus: [{ cle: 'temps', valeur: p.duree * 60 }] });
  }
}

/** Blocs des 7 jours, par jour. */
export function blocsDeLaSemaine(jours: Jour[]): Record<Jour, BlocVue[]> {
  return Object.fromEntries(jours.map((j) => [j, blocsDuJour(j)]));
}
