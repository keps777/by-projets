// Retraite de 24 h : rassemble les retards du mois (par thème), les confie au planificateur du noyau, et pose les blocs au Fil.
import { ajouterJours, jourSemaine } from '@core/dates.ts';
import { metriquesPilotes, progressionDuMois } from '@core/progression.ts';
import { planifierRetraite, minutesDeRetard, type BesoinRetraite, type PlanRetraite } from '@core/retraite.ts';
import type { Jour, Mois } from '@core/types.ts';
import { metriquesDe, enMetrique, profil, projetsDe, rubriques, sousProjetsDe, valeursDuSousProjet } from '../../data/requetes.ts';
import { ajouterTache } from '../../data/actions/taches.ts';
import { valeurTexte } from './vues.ts';

/** Ce qui est en retard ce mois-ci, thème par thème (rubrique, projet, sous-projet), dans l'ordre de l'écran Projets. */
export function besoinsDeRetraite(mois: Mois, jour: Jour): BesoinRetraite[] {
  const res = new Map<string, BesoinRetraite>();
  for (const r of rubriques()) for (const p of projetsDe(r.id)) for (const sp of sousProjetsDe(p.id)) {
    if (sp.statut !== 'en_cours') continue;
    const ms = metriquesDe(sp.id).map(enMetrique);
    const valeurs = valeursDuSousProjet(sp);
    for (const m of metriquesPilotes(ms, sp.metriques_pilotes, sp.metrique_pilote_id)) {
      if (m.sens === 'moins') continue;
      const prog = progressionDuMois(m, sp, valeurs, mois, jour);
      if (prog.etat === 'a_venir' || !(prog.retard > 0)) continue;
      const minutes = minutesDeRetard(m, prog.retard);
      if (!minutes) continue;
      const cle = `${p.id}|${m.cle}`;
      // Plusieurs sous-projets qui comptent la même saisie : on ne rattrape qu'une fois, le plus gros retard.
      if ((res.get(cle)?.minutes ?? 0) >= minutes) continue;
      const nombreUnites = m.type === 'nombre' || m.type === 'fois' || m.type === 'oui_non' ? Math.ceil(prog.retard - 1e-9) : prog.retard;
      res.set(cle, {
        cle, projetId: p.id, projetNom: p.nom, rubriqueId: r.id, rubriqueNom: r.nom, spId: sp.id, spNom: sp.nom, type: m.type, cleMetrique: m.cle,
        unites: nombreUnites, minutes, detail: `${valeurTexte(m, nombreUnites, true)} de retard`
      });
    }
  }
  return [...res.values()];
}

export const planDeRetraite = (mois: Mois, jour: Jour): PlanRetraite => planifierRetraite(besoinsDeRetraite(mois, jour));

/** Prochain samedi (strictement après aujourd'hui) : le jour proposé par défaut. */
export function prochainSamedi(jour: Jour): Jour { return ajouterJours(jour, ((5 - jourSemaine(jour) + 7) % 7) || 7); }

/** Pose la retraite au Fil le jour choisi : une tâche « ce jour seulement » par bloc de rattrapage, plus l'ouverture et le bilan. */
export function planifierAuFil(plan: PlanRetraite, jour: Jour): number {
  const rappel = profil()?.rappel_defaut_min ?? 10;
  let n = 0;
  for (const b of plan.blocs) {
    if (b.type !== 'activite' && b.type !== 'ouverture' && b.type !== 'bilan') continue;
    const regle = { frequence: 'une_fois' as const, debut: jour, fin: { type: 'aucune' as const } };
    if (b.type !== 'activite' || !b.besoin) {
      ajouterTache({ titre: `Retraite · ${b.titre}`, projetId: null, regle, heureDebut: b.debut, dureeMin: b.duree, rappelMin: rappel });
    } else {
      const be = b.besoin;
      const attendus = [{ cle: 'temps', valeur: b.duree * 60 }];
      const couvert = b.unitesCouvertes ?? 0;
      if (be.cleMetrique !== 'temps') {
        const v = be.type === 'montant' || be.type === 'distance' ? Math.round(couvert) : be.type === 'fois' || be.type === 'oui_non' ? Math.max(1, Math.round(couvert)) : Math.round(couvert);
        if (v > 0) attendus.push({ cle: be.cleMetrique, valeur: v });
      }
      ajouterTache({ titre: `Retraite · ${be.projetNom}`, projetId: be.projetId, regle, heureDebut: b.debut, dureeMin: b.duree, rappelMin: rappel, sousProjetIds: [be.spId], attendus });
    }
    n++;
  }
  return n;
}
