// Réglages : profil, points du rapport, préréglages d'export.
import { nouvelId } from '@core/ids.ts';
import type { MesurePoint, PointRapportLigne, Profil } from '@core/lignes.ts';
import { magasin } from '../magasin.svelte.ts';

export function majProfil(patch: Partial<Omit<Profil, 'id'>>): void {
  const p = magasin.lignes.profils[0];
  if (p) magasin.ecrire('profils', { id: p.id, ...patch });
}

export function ajouterPoint(code: string, libelle: string, projetId: string | null, mesures: MesurePoint[]): string {
  const id = nouvelId();
  magasin.ecrire('points_rapport', { id, ordre: magasin.lignes.points_rapport.length, code, libelle, projet_id: projetId, mesures, actif: true });
  return id;
}
export function modifierPoint(id: string, patch: Partial<PointRapportLigne>): void { magasin.ecrire('points_rapport', { id, ...patch }); }
export function retirerPoint(id: string): void { magasin.supprimer('points_rapport', id); }

export function enregistrerPreset(nom: string, points: string[]): string {
  const id = nouvelId();
  magasin.ecrire('presets_export', { id, nom, points, ordre: magasin.lignes.presets_export.length });
  return id;
}
export function retirerPreset(id: string): void { magasin.supprimer('presets_export', id); }
