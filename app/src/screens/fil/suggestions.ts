// Propositions pour le titre d'une nouvelle tâche : celles déjà créées (qui reprennent leurs réglages) et des titres génériques.
import type { Tache } from '@core/lignes.ts';

export interface Suggestion {
  texte: string;
  /** `deja` : une tâche déjà créée (ses réglages sont repris) ; `generique` : un modèle de titre. */
  origine: 'deja' | 'generique';
  tacheId?: string;
}

/** Titres génériques ; ceux qui finissent par une espace attendent la suite (« Rencontre avec … »). */
export const GENERIQUES = [
  'Rencontre avec ', 'Rendez-vous', 'Appel avec ', 'Réunion', 'Lecture', 'Prière', 'Étude', 'Sport', 'Courses', 'Repas en famille',
  'Préparer ', 'Rédiger ', 'Visite chez ', 'Marche', 'Planifier la semaine'
];

/** Minuscules sans accents, pour comparer « priere » et « Prière ». */
export const normaliser = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Propositions pour ce que l'utilisateur tape. Sans texte : les tâches les plus récentes, puis quelques titres génériques.
 * Avec du texte : celles qui commencent par ce texte, puis qui le contiennent, déjà créées d'abord, puis génériques.
 */
export function suggerer(requete: string, taches: readonly Pick<Tache, 'id' | 'titre' | 'created_at'>[], max = 7): Suggestion[] {
  const q = normaliser(requete);
  // Un titre une seule fois (le plus récent), sans doublon dû à la casse ou aux accents.
  const vus = new Set<string>();
  const deja: Suggestion[] = [];
  for (const t of [...taches].sort((a, b) => (a.created_at < b.created_at ? 1 : -1))) {
    const n = normaliser(t.titre);
    if (!n || vus.has(n)) continue;
    vus.add(n);
    deja.push({ texte: t.titre, origine: 'deja', tacheId: t.id });
  }
  const generiques: Suggestion[] = GENERIQUES.filter((g) => !vus.has(normaliser(g))).map((texte) => ({ texte, origine: 'generique' as const }));

  if (!q) return [...deja.slice(0, 5), ...generiques.slice(0, 4)].slice(0, max);

  const classer = (liste: Suggestion[]) => {
    const debut = liste.filter((s) => normaliser(s.texte).startsWith(q));
    const contient = liste.filter((s) => !normaliser(s.texte).startsWith(q) && normaliser(s.texte).includes(q));
    return [...debut, ...contient].filter((s) => normaliser(s.texte) !== q);
  };
  return [...classer(deja), ...classer(generiques)].slice(0, max);
}
