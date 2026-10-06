// Rubriques, projets, sous-projets et métriques (spec §6).
import { nouvelId } from '@core/ids.ts';
import { cleMetrique } from '@core/metriques.ts';
import type { ModeleSousProjet } from '@core/modeles.ts';
import { metriquePilote } from '@core/progression.ts';
import type { Fiche, MetriqueLigne } from '@core/lignes.ts';
import type { Jour } from '@core/types.ts';
import { magasin } from '../magasin.svelte.ts';
import { metriquesDe } from '../requetes.ts';

export const FICHE_VIDE: Fiche = { quoi: '', pourquoi: '', qui: '', ou: '', quand: '', comment: '', combien: '' };

export function ajouterRubrique(nom: string, couleur = '#A3A6B1'): string {
  const id = nouvelId();
  magasin.ecrire('rubriques', { id, cle: null, nom: nom.trim() || 'Nouvelle rubrique', couleur, ordre: magasin.lignes.rubriques.length, archivee: false });
  return id;
}

export function ajouterProjet(rubriqueId: string, nom: string): string {
  const id = nouvelId();
  const numeros = magasin.lignes.projets.map((p) => p.numero ?? 0);
  magasin.ecrire('projets', { id, rubrique_id: rubriqueId, numero: Math.max(25, ...numeros) + 1, nom: nom.trim() || 'Nouveau projet', ordre: magasin.lignes.projets.filter((p) => p.rubrique_id === rubriqueId).length, statut: 'actif' });
  return id;
}

export function renommerProjet(projetId: string, nom: string): void { if (nom.trim()) magasin.ecrire('projets', { id: projetId, nom: nom.trim() }); }
export function renommerSousProjet(spId: string, nom: string): void { if (nom.trim()) magasin.ecrire('sous_projets', { id: spId, nom: nom.trim() }); }

/** Retire un projet de l'écran. Les saisies passées sont conservées (archivées), rien ne se perd. */
export function retirerProjet(projetId: string): void { magasin.ecrire('projets', { id: projetId, statut: 'archive' }); }
export function retirerRubrique(rubriqueId: string): void { magasin.ecrire('rubriques', { id: rubriqueId, archivee: true }); }

export interface NouvelleMetrique { type: MetriqueLigne['type']; nom: string; unite: string; cible: number | null; periode_cible: MetriqueLigne['periode_cible']; sens: MetriqueLigne['sens']; options?: MetriqueLigne['options']; dans_rapport: boolean; cle?: string }

export interface NouveauSousProjet {
  projetId: string;
  nom: string;
  debut: Jour;
  fin: Jour | null;
  metriques: NouvelleMetrique[];
  reprisePasse: boolean;
  fiche?: Partial<Fiche>;
  piloteIndex?: number;
}

export function creerSousProjet(n: NouveauSousProjet): string {
  const id = nouvelId();
  const ids = n.metriques.map(() => nouvelId());
  const pilote = metriquePilote(n.metriques.map((m, i) => ({ id: ids[i], cle: '', type: m.type, nom: m.nom, unite: m.unite, cible: m.cible, periode: m.periode_cible, sens: m.sens, dansRapport: m.dans_rapport })), n.piloteIndex != null ? ids[n.piloteIndex] : null);
  magasin.ecrire('sous_projets', { id, projet_id: n.projetId, nom: n.nom.trim() || 'Nouveau sous-projet', debut: n.debut, fin: n.fin, statut: 'en_cours', metrique_pilote_id: pilote?.id ?? null, reprise_passe: n.reprisePasse, fiche: { ...FICHE_VIDE, ...n.fiche }, bilan: null, termine_le: null });
  n.metriques.forEach((m, i) => magasin.ecrire('metriques', {
    id: ids[i], sous_projet_id: id, cle: m.cle ?? cleMetrique(m.type, m.unite, m.nom), type: m.type, nom: m.nom, unite: m.unite, cible: m.cible,
    periode_cible: m.periode_cible, sens: m.sens, options: m.options ?? null, dans_rapport: m.dans_rapport, ordre: i
  }));
  return id;
}

/** Sous-projet minimal (nom + mesures choisies, sans objectif), à affiner ensuite dans Projets. */
export function creerSousProjetRapide(projetId: string, nom: string, metriques: NouvelleMetrique[], debut: Jour): string {
  return creerSousProjet({ projetId, nom, debut, fin: null, reprisePasse: false, metriques });
}

export function creerDepuisModele(m: ModeleSousProjet, projetId: string, debut: Jour, fin: Jour | null, reprisePasse = true): string {
  return creerSousProjet({
    projetId, nom: m.sousProjet, debut, fin, reprisePasse,
    metriques: m.metriques.map((x) => ({ type: x.type, nom: x.nom, unite: x.unite, cible: x.cible, periode_cible: x.periode, sens: x.sens, options: x.options, dans_rapport: x.dansRapport, cle: x.cle }))
  });
}

export function modifierMetrique(id: string, patch: Partial<MetriqueLigne>): void { magasin.ecrire('metriques', { id, ...patch }); }
export function ajouterMetrique(spId: string, m: NouvelleMetrique): string {
  const id = nouvelId();
  magasin.ecrire('metriques', { id, sous_projet_id: spId, cle: m.cle ?? cleMetrique(m.type, m.unite, m.nom), type: m.type, nom: m.nom, unite: m.unite, cible: m.cible, periode_cible: m.periode_cible, sens: m.sens, options: m.options ?? null, dans_rapport: m.dans_rapport, ordre: metriquesDe(spId).length });
  return id;
}
export function retirerMetrique(id: string): void { magasin.supprimer('metriques', id); }

export function modifierFiche(spId: string, patch: Partial<Fiche>): void {
  const sp = magasin.trouver('sous_projets', spId);
  if (sp) magasin.ecrire('sous_projets', { id: spId, fiche: { ...sp.fiche, ...patch } });
}

/** Validation d'un sous-projet à la fin (spec §6) : il passe à « terminé » puis rejoint l'Archive. */
export function validerSousProjet(spId: string, bilan: string | null = null): void {
  magasin.ecrire('sous_projets', { id: spId, statut: 'termine', bilan, termine_le: new Date().toISOString() });
}
export function archiverSousProjet(spId: string): void { magasin.ecrire('sous_projets', { id: spId, statut: 'archive' }); }
export function mettreEnPause(spId: string): void { magasin.ecrire('sous_projets', { id: spId, statut: 'brouillon' }); }
export function rouvrirSousProjet(spId: string): void { magasin.ecrire('sous_projets', { id: spId, statut: 'en_cours', termine_le: null }); }
export function supprimerSousProjet(spId: string): void {
  magasin.supprimer('metriques', magasin.lignes.metriques.filter((m) => m.sous_projet_id === spId).map((m) => m.id));
  magasin.supprimer('sous_projets', spId);
}
