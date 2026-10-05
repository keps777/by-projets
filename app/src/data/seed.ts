// Données de départ du MODE LOCAL (même contenu que la fonction SQL initialiser_compte, spec §3 et docs/04).
import { POINTS_DEFAUT, PRESETS_DEFAUT, RUBRIQUES_DEFAUT } from '@core/defauts.ts';
import { nouvelId } from '@core/ids.ts';
import type { PointRapportLigne, PresetExport, Profil, Projet, Rubrique } from '@core/lignes.ts';

const MESURES: Record<string, string[]> = {
  BR: ['nombre:chapitres', 'reference:passages', 'temps'], DDEWG: ['fois', 'temps'], PA: ['temps'], PWO: ['temps'],
  CL: ['nombre:pages', 'temps'], 'JEÛNE': ['choix:typedejeune'], 'DON-DIEU': ['oui_non', 'montant:montantdonne'],
  'DON-HOMME': ['oui_non', 'montant:montantdonne'], EVANG: ['temps', 'nombre:personnes'], 'ÂMES': ['nombre:ames'],
  DISCIPLES: ['fois', 'temps'], 'FRÈRES': ['fois', 'montant:montantdonne']
};

export interface Depart {
  profil: Omit<Profil, 'user_id' | 'created_at' | 'updated_at' | 'supprime_le'>;
  rubriques: Omit<Rubrique, 'user_id' | 'created_at' | 'updated_at' | 'supprime_le'>[];
  projets: Omit<Projet, 'user_id' | 'created_at' | 'updated_at' | 'supprime_le'>[];
  points: Omit<PointRapportLigne, 'user_id' | 'created_at' | 'updated_at' | 'supprime_le'>[];
  presets: Omit<PresetExport, 'user_id' | 'created_at' | 'updated_at' | 'supprime_le'>[];
}

export function donneesDeDepart(userId: string, prenom: string): Depart {
  const rubriques: Depart['rubriques'] = [];
  const projets: Depart['projets'] = [];
  RUBRIQUES_DEFAUT.forEach((r, i) => {
    const rid = nouvelId();
    rubriques.push({ id: rid, cle: r.cle, nom: r.nom, couleur: r.couleur, ordre: i, archivee: false });
    r.projets.forEach((p, j) => projets.push({ id: nouvelId(), rubrique_id: rid, numero: p.numero, nom: p.nom, ordre: j, statut: 'actif' }));
  });
  const parNumero = new Map(projets.map((p) => [p.numero, p.id]));
  const points = POINTS_DEFAUT.map((p, i) => ({
    id: nouvelId(), ordre: i, code: p.code, libelle: p.nom, projet_id: parNumero.get(p.projet) ?? null, actif: true,
    mesures: (MESURES[p.code] ?? ['temps']).map((cle) => ({ cle, sous_projet_id: null }))
  }));
  const idPoint = new Map(points.map((p) => [p.code, p.id]));
  const presets = PRESETS_DEFAUT.map((p, i) => ({ id: nouvelId(), nom: p.nom, ordre: i, points: p.points.map((c) => idPoint.get(c)!).filter(Boolean) }));
  const profil = { id: userId, prenom, nom_rapport: prenom, langue_rapport: 'fr' as const, fuseau: 'America/Toronto', apparence: 'nuit' as const, heure_rapport: '21:15', rappel_defaut_min: 10, titres_visibles: true, devise: 'CAD', initialise: true };
  return { profil, rubriques, projets, points, presets };
}
