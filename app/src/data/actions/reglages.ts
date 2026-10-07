// Réglages : profil, points du rapport, préréglages d'export.
import { nouvelId } from '@core/ids.ts';
import type { LivreSuivi, MesurePoint, PointRapportLigne, Profil } from '@core/lignes.ts';
import { magasin } from '../magasin.svelte.ts';
import { replanifierRappels } from './taches.ts';

export function majProfil(patch: Partial<Omit<Profil, 'id'>>): void {
  const p = magasin.lignes.profils[0];
  if (p) magasin.ecrire('profils', { id: p.id, ...patch });
}

/**
 * Change le délai de rappel par défaut (et d'autres champs du profil au passage). Les tâches actives qui suivaient
 * l'ancien défaut prennent le nouveau : leurs rappels à venir sont annulés et recréés au nouveau délai.
 */
export function changerDelaiDefaut(min: number, autres: Partial<Omit<Profil, 'id'>> = {}): void {
  const ancien = magasin.lignes.profils[0]?.rappel_defaut_min;
  majProfil({ rappel_defaut_min: min, ...autres });
  if (ancien == null || ancien === min) return;
  for (const t of magasin.lignes.taches.filter((x) => x.actif && x.rappel_min === ancien)) {
    magasin.ecrire('taches', { id: t.id, rappel_min: min });
    replanifierRappels(t.id);
  }
}

export function ajouterPoint(code: string, libelle: string, projetId: string | null, mesures: MesurePoint[]): string {
  const id = nouvelId();
  magasin.ecrire('points_rapport', { id, ordre: magasin.lignes.points_rapport.length, code, libelle, projet_id: projetId, mesures, actif: true });
  return id;
}
export function modifierPoint(id: string, patch: Partial<PointRapportLigne>): void { magasin.ecrire('points_rapport', { id, ...patch }); }
/** Un point accepte des livres s'il compte des pages (CL) ou en suit déjà. */
export const accepteLivres = (p: Pick<PointRapportLigne, 'mesures' | 'livres'>): boolean => !!p.livres?.length || (p.mesures ?? []).some((m) => m.cle === 'nombre:pages');

export interface NouveauLivre { titre: string; auteur?: string; total?: number | null; depart?: number }

/** Ajoute un livre à suivre sur un point (CL) : titre, auteur (initiales), pages au total, pages déjà lues. */
export function ajouterLivre(pointId: string, n: NouveauLivre): string | null {
  const p = magasin.trouver('points_rapport', pointId);
  const titre = n.titre.trim();
  if (!p || !titre) return null;
  const id = nouvelId();
  const total = n.total != null && n.total > 0 ? Math.round(n.total) : null;
  const livre: LivreSuivi = { id, titre, auteur: (n.auteur ?? '').trim(), total, depart: Math.max(0, Math.round(n.depart ?? 0)), actif: true };
  magasin.ecrire('points_rapport', { id: pointId, livres: [...(p.livres ?? []), livre] });
  return id;
}

/** Le livre quitte le rapport ; ses pages déjà saisies restent dans l'historique. */
export function retirerLivre(pointId: string, livreId: string): void {
  const p = magasin.trouver('points_rapport', pointId);
  if (p) magasin.ecrire('points_rapport', { id: pointId, livres: (p.livres ?? []).map((l) => (l.id === livreId ? { ...l, actif: false } : l)) });
}

export function retirerPoint(id: string): void { magasin.supprimer('points_rapport', id); }

export function enregistrerPreset(nom: string, points: string[]): string {
  const id = nouvelId();
  magasin.ecrire('presets_export', { id, nom, points, ordre: magasin.lignes.presets_export.length });
  return id;
}
export function retirerPreset(id: string): void { magasin.supprimer('presets_export', id); }
