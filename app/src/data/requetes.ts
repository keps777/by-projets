// Lectures : transforment les lignes du magasin en objets prêts pour les écrans, avec le noyau de calcul.
// À appeler dans $derived / $effect : elles lisent `magasin.lignes`, donc se recalculent quand les données changent.
import { moyennePct, metriquePilote, progressionDuMois, type Progression } from '@core/progression.ts';
import { utcVersLocal } from '@core/dates.ts';
import type { Creneau, Jour, Metrique, Mois, ValeurSaisie } from '@core/types.ts';
import type { MetriqueLigne, Occurrence, Profil, Projet, Rubrique, Saisie, SousProjetLigne, Tache } from '@core/lignes.ts';
import { magasin } from './magasin.svelte.ts';
import { fuseau } from './temps.svelte.ts';

export const profil = (): Profil | undefined => magasin.lignes.profils[0];

export function enMetrique(l: MetriqueLigne): Metrique {
  return { id: l.id, cle: l.cle, type: l.type, nom: l.nom, unite: l.unite, cible: l.cible, periode: l.periode_cible, sens: l.sens, options: l.options ?? undefined, dansRapport: l.dans_rapport };
}

const trier = <T extends { ordre: number }>(l: T[]) => [...l].sort((a, b) => a.ordre - b.ordre);

export const rubriques = (): Rubrique[] => trier(magasin.lignes.rubriques.filter((r) => !r.archivee));
export const projetsDe = (rubriqueId: string): Projet[] => trier(magasin.lignes.projets.filter((p) => p.rubrique_id === rubriqueId && p.statut !== 'archive'));
export const sousProjetsDe = (projetId: string): SousProjetLigne[] => magasin.lignes.sous_projets.filter((s) => s.projet_id === projetId && s.statut !== 'archive');
export const metriquesDe = (spId: string): MetriqueLigne[] => trier(magasin.lignes.metriques.filter((m) => m.sous_projet_id === spId));

// ------------------------------------------------------------------ valeurs saisies

let cacheDe: object | null = null;
let cacheValeurs = new Map<string, ValeurSaisie[]>();

/** Toutes les valeurs saisies pour un projet (une entrée par clé et par saisie). Mise en cache tant que les données ne changent pas. */
export function valeursDuProjet(projetId: string): ValeurSaisie[] {
  if (cacheDe !== magasin.lignes) { cacheDe = magasin.lignes; cacheValeurs = new Map(); }
  const deja = cacheValeurs.get(projetId);
  if (deja) return deja;
  const { saisies, saisie_valeurs } = magasin.lignes;
  const parSaisie = new Map<string, typeof saisie_valeurs>();
  for (const v of saisie_valeurs) { const l = parSaisie.get(v.saisie_id); if (l) l.push(v); else parSaisie.set(v.saisie_id, [v]); }
  const res: ValeurSaisie[] = [];
  for (const s of saisies) {
    if (s.projet_id !== projetId) continue;
    for (const v of parSaisie.get(s.id) ?? []) res.push({ cle: v.cle, jour: s.jour, valeur: v.valeur_num ?? 0, approx: s.approx || undefined, texte: v.valeur_txt ?? undefined });
  }
  cacheValeurs.set(projetId, res);
  return res;
}

/** Valeurs lues par un sous-projet : celles de son projet, sans le passé s'il n'a pas demandé la reprise (spec §6). */
export function valeursDuSousProjet(sp: SousProjetLigne): ValeurSaisie[] {
  const v = valeursDuProjet(sp.projet_id);
  if (sp.reprise_passe) return v;
  // Jour de création dans le fuseau de l'utilisateur (created_at est en UTC).
  const creation = utcVersLocal(Date.parse(sp.created_at), fuseau()).jour;
  return v.filter((x) => x.jour >= creation);
}

// ------------------------------------------------------------------ progression

export interface ProgressionSP { pilote?: Metrique; progression: Progression | null }

export function progressionSousProjet(sp: SousProjetLigne, mois: Mois, aujourdhui: Jour): ProgressionSP {
  const metriques = metriquesDe(sp.id).map(enMetrique);
  const pilote = metriquePilote(metriques, sp.metrique_pilote_id);
  if (!pilote) return { progression: null };
  return { pilote, progression: progressionDuMois(pilote, { debut: sp.debut, fin: sp.fin }, valeursDuSousProjet(sp), mois, aujourdhui) };
}

export function progressionProjet(projetId: string, mois: Mois, aujourdhui: Jour): number | null {
  return moyennePct(sousProjetsDe(projetId).filter((s) => s.statut === 'en_cours' || s.statut === 'a_valider').map((s) => progressionSousProjet(s, mois, aujourdhui).progression?.pct));
}

export function progressionRubrique(rubriqueId: string, mois: Mois, aujourdhui: Jour): number | null {
  return moyennePct(projetsDe(rubriqueId).map((p) => progressionProjet(p.id, mois, aujourdhui)));
}

// ------------------------------------------------------------------ blocs du Fil

export interface BlocVue {
  occ: Occurrence;
  tache: Tache;
  projet: Projet | null;
  rubrique: Rubrique | null;
  titre: string;
  debutMin: number;
  finMin: number;
  sousProjets: SousProjetLigne[];
  saisie: Saisie | undefined;
  fait: boolean;
  enCours: boolean;
  enPause: boolean;
  /** Couleur de la rubrique (gris pour un rendez-vous sans projet). */
  couleur: string;
}

export const COULEUR_SANS_PROJET = '#A3A6B1';

export function blocsDuJour(jour: Jour): BlocVue[] {
  return blocsDe((occ) => occ.jour === jour).sort((a, b) => a.debutMin - b.debutMin);
}

/** Blocs de tous les jours qui ne sont pas faits ni ignorés, du plus ancien au plus lointain (carte « Ensuite » du Fil). */
export function blocsNonFaits(): BlocVue[] {
  return blocsDe((occ) => occ.etat !== 'faite').sort((a, b) => a.occ.debut.localeCompare(b.occ.debut));
}

function blocsDe(garder: (occ: Occurrence) => boolean): BlocVue[] {
  const tz = fuseau();
  const { occurrences, taches, projets, rubriques: rubs, tache_alimente, sous_projets, saisies } = magasin.lignes;
  const tachesParId = new Map(taches.map((t) => [t.id, t]));
  const res: BlocVue[] = [];
  for (const occ of occurrences) {
    if (!garder(occ) || occ.etat === 'ignoree') continue;
    const tache = tachesParId.get(occ.tache_id);
    if (!tache || !tache.actif) continue;
    const projet = tache.projet_id ? projets.find((p) => p.id === tache.projet_id) ?? null : null;
    const rubrique = projet ? rubs.find((r) => r.id === projet.rubrique_id) ?? null : null;
    const debutMin = utcVersLocal(Date.parse(occ.debut), tz).minutes;
    const duree = Math.max(5, Math.round((Date.parse(occ.fin) - Date.parse(occ.debut)) / 60000));
    const alimentes = new Set(tache_alimente.filter((a) => a.tache_id === tache.id).map((a) => a.sous_projet_id));
    res.push({
      occ, tache, projet, rubrique, titre: tache.titre, debutMin, finMin: debutMin + duree,
      sousProjets: sous_projets.filter((s) => alimentes.has(s.id)),
      saisie: saisies.find((s) => s.occurrence_id === occ.id),
      fait: occ.etat === 'faite', enCours: occ.etat === 'en_cours', enPause: occ.etat === 'pause',
      couleur: rubrique?.couleur ?? COULEUR_SANS_PROJET
    });
  }
  return res;
}

export function creneauxDuJour(jour: Jour, sauf?: string): Creneau[] {
  return blocsDuJour(jour).filter((b) => b.occ.id !== sauf).map((b) => ({ id: b.occ.id, debut: b.debutMin, fin: b.finMin, titre: b.titre }));
}
