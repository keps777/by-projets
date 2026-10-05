// Recherche : filtres purs, insensibles aux accents et à la casse ; recherches récentes gardées sur l'appareil.

export type TypeResultat = 'projets' | 'sous' | 'taches' | 'notes' | 'rapports';
export type Filtre = 'tout' | TypeResultat;

export const FILTRES: { valeur: Filtre; label: string }[] = [
  { valeur: 'tout', label: 'Tout' }, { valeur: 'projets', label: 'Projets' }, { valeur: 'sous', label: 'Sous-projets' },
  { valeur: 'taches', label: 'Tâches' }, { valeur: 'notes', label: 'Notes' }, { valeur: 'rapports', label: 'Rapports' }
];
export const TITRES: Record<TypeResultat, string> = { projets: 'Projets', sous: 'Sous-projets', taches: 'Tâches', notes: 'Saisies et notes', rapports: 'Rapports' };
const ORDRE: TypeResultat[] = ['projets', 'sous', 'taches', 'notes', 'rapports'];

export interface Entree {
  type: TypeResultat;
  titre: string;
  sous: string;
  couleur: string;
  href: string;
  /** Texte où chercher, déjà normalisé (titre, sous-titre, mots associés). */
  botte: string;
}

/** Minuscules, sans accents, apostrophes unifiées : « Évangélisation » → « evangelisation ». */
export const normaliser = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’‘`]/g, "'");

export const jetons = (q: string) => normaliser(q).split(/\s+/).filter(Boolean);

/** Garde les entrées qui contiennent TOUS les mots cherchés, dans le filtre choisi. */
export function filtrer(entrees: Entree[], q: string, filtre: Filtre = 'tout'): Entree[] {
  const t = jetons(q);
  if (!t.length) return [];
  return entrees.filter((e) => (filtre === 'tout' || e.type === filtre) && t.every((x) => e.botte.includes(x)));
}

export function grouper(entrees: Entree[], max = 20): { type: TypeResultat; titre: string; total: number; items: Entree[] }[] {
  return ORDRE.map((type) => {
    const items = entrees.filter((e) => e.type === type);
    return { type, titre: TITRES[type], total: items.length, items: items.slice(0, max) };
  }).filter((g) => g.total > 0);
}

export const entree = (type: TypeResultat, titre: string, sous: string, couleur: string, href: string, mots: string[] = []): Entree =>
  ({ type, titre, sous, couleur, href, botte: normaliser([titre, sous, ...mots].join(' ')) });

// ------------------------------------------------------------------ recherches récentes (confort de l'appareil)

const CLE = 'luther-life:recherches-recentes';

export function lireRecents(): string[] {
  try { const v = JSON.parse(localStorage.getItem(CLE) ?? '[]'); return Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, 6) : []; } catch { return []; }
}

/** Ajoute une recherche en tête (sans doublon, accents compris), 6 au plus. */
export function ajouterRecent(liste: string[], q: string): string[] {
  const t = q.trim();
  if (!t) return liste;
  return [t, ...liste.filter((x) => normaliser(x) !== normaliser(t))].slice(0, 6);
}

export function memoriserRecent(q: string): string[] {
  const l = ajouterRecent(lireRecents(), q);
  try { localStorage.setItem(CLE, JSON.stringify(l)); } catch { /* stockage indisponible */ }
  return l;
}
