// Vues calculées du portail employeur : lignes de salariés (avec la ligne vivante du membre connecté), statistiques, fichier de retenues.
import { niveauDuScore, type Niveau } from '../../core/credit.ts';
import { ecrireCsv } from '../../core/csv.ts';
import { calendrierPaie, coutMensuelEmployeur, normaliserId, retenueSalarie, type EcheancePaie, type Retenue } from '../../core/entreprise.ts';
import { app, maintenant } from '../../data/store.svelte.ts';
import { jourDe, type Jour } from '../../core/dates.ts';
import { lire, type Entreprise, type Salarie } from './etat.ts';

export type StatutAffiche = 'Invité' | 'Nouveau' | 'Validé' | 'Plafonné';
export interface LigneSalarie extends Salarie {
  /** Ligne reliée au compte membre de cet appareil (lecture seule de `app.compte`, `app.credits`, `app.score`). */
  membre: boolean;
  niveau: Niveau | null; retenue: Retenue; affiche: StatutAffiche;
  /** Inclus dans le fichier de retenues (retenue validée). */ inclus: boolean;
  services: string;
}

function surcharge(s: Salarie): { salarie: Salarie; membre: boolean } {
  const c = app.compte;
  if (!c || c.telephone !== s.telephone) return { salarie: s, membre: false };
  const credit = app.credits.filter((x) => x.statut === 'actif').reduce((t, x) => t + x.mensualite, 0);
  return { salarie: { ...s, nom: `${c.prenom} ${c.nom}`, salaire: c.salaireNet, pass: c.pass, score: app.score.valeur, credit, statut: s.statut === 'invite' ? 'nouveau' : s.statut }, membre: true };
}
/** Le compte membre est salarié de l'entreprise (même employeur) mais n'a pas encore de ligne : on l'affiche quand même. */
function ligneDuMembre(e: Entreprise, deja: Salarie[]): Salarie | null {
  const c = app.compte;
  if (!c || normaliserId(c.employeur) !== normaliserId(e.raisonSociale) || deja.some((x) => x.telephone === c.telephone)) return null;
  return { id: `m-${c.id}`, nom: `${c.prenom} ${c.nom}`, matricule: c.numeroMembre, telephone: c.telephone, service: '', salaire: c.salaireNet, pass: c.pass, score: app.score.valeur, credit: 0, coffre: 0, statut: 'nouveau', ajoute: c.cree, anciennete: c.anciennete };
}
const nomService = (s: Salarie, retenue: Retenue) => [s.pass ? 'Santé' : '', retenue.credit ? 'Crédit' : '', s.coffre ? 'Épargne' : ''].filter(Boolean).join(', ') || (s.statut === 'invite' ? 'Pas encore inscrit' : 'Aucun');

export function lignes(): LigneSalarie[] {
  const t = lire(), e = t.entreprise;
  if (!e) return [];
  const base = [...t.salaries];
  const m = ligneDuMembre(e, base); if (m) base.push(m);
  return base.map((brut) => {
    const { salarie, membre } = surcharge(brut);
    const retenue = retenueSalarie({ salaire: salarie.salaire, pass: salarie.pass, credit: salarie.credit, coffre: salarie.coffre }, e.part);
    const affiche: StatutAffiche = salarie.statut === 'invite' ? 'Invité' : salarie.statut === 'nouveau' ? 'Nouveau' : retenue.plafonne ? 'Plafonné' : 'Validé';
    return { ...salarie, membre, retenue, affiche, niveau: salarie.statut === 'invite' ? null : niveauDuScore(salarie.score), inclus: salarie.statut === 'valide', services: nomService(salarie, retenue) };
  });
}

export interface Statistiques {
  inscrits: number; invites: number; aValider: number; plafonnes: number; effectif: number;
  totalRetenues: number; coutEmployeur: number;
}
export function statistiques(ls = lignes()): Statistiques {
  const e = lire().entreprise;
  const inscrits = ls.filter((l) => l.statut !== 'invite');
  const inclus = ls.filter((l) => l.inclus);
  return {
    inscrits: inscrits.length, invites: ls.length - inscrits.length + lire().invitations.length, aValider: ls.filter((l) => l.statut === 'nouveau').length,
    plafonnes: inscrits.filter((l) => l.retenue.plafonne).length, effectif: e?.effectif ?? 0,
    totalRetenues: inclus.reduce((s, l) => s + l.retenue.total, 0), coutEmployeur: e ? coutMensuelEmployeur(inscrits.map((l) => l.pass), e.part) : 0
  };
}

/** Prochaines paies de l'entreprise (la première est celle dont le fichier de retenues est en cours). */
export const echeances = (n = 6): EcheancePaie[] => {
  const e = lire().entreprise;
  return e ? calendrierPaie(e.jourPaie, jourDe(new Date(maintenant())), n) : [];
};
export const prochainePaieEntreprise = (): Jour | null => echeances(1)[0]?.paie ?? null;

export const NOM_FICHIER = (paie: Jour) => `retenues-${paie}.csv`;
/** Fichier de retenues d'une paie, pour le logiciel de paie : une ligne par salarié dont la retenue est validée. */
export function csvRetenues(ls: LigneSalarie[], paie: Jour): string {
  const entete = ['matricule', 'nom', 'telephone', 'pass_part_salarie', 'credits', 'coffre', 'total_retenue', 'statut', 'paie'];
  const corps = ls.filter((l) => l.inclus).map((l) => [l.matricule, l.nom, l.telephone, l.retenue.pass, l.retenue.credit, l.retenue.coffre, l.retenue.total, l.affiche, paie]);
  return ecrireCsv([entete, ...corps]);
}
