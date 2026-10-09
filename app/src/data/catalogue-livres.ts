// Catalogue des livres proposés quand on en ajoute un à un point du rapport (CL) : les livres de Zacharias Tanee Fomum (ZTF) connus
// d'avance, plus TOUS les livres déjà ajoutés par l'utilisateur, sur n'importe quel point (actifs ou retirés). Un livre ajouté une fois
// est donc proposé ensuite, avec le nombre de pages saisi : le catalogue se met à jour tout seul.
import type { LivreSuivi, PointRapportLigne } from '@core/lignes.ts';

export interface LivreCatalogue { titre: string; auteur: string; total: number | null }

export const AUTEUR_ZTF = 'ZTF';

/**
 * Livres connus d'avance : auteur, titre (écrit comme dans les rapports) et pages quand elles sont connues (rapports d'août à octobre 2026).
 * Les autres livres de ZTF sont proposés sans pages : on les saisit une fois, l'app s'en souvient.
 */
const ZTF = 'ZTF';
const LIVRES_CONNUS: LivreCatalogue[] = [
  // Livres déjà lus ou en cours, pages connues
  { titre: 'L’agressivité spirituelle', auteur: ZTF, total: 417 },
  { titre: 'Jouir du choix de ton conjoint', auteur: ZTF, total: 213 },
  { titre: 'Le chemin de la vie', auteur: ZTF, total: 124 },
  { titre: 'Le chemin du caractère chrétien', auteur: ZTF, total: 171 },
  { titre: 'Sois rempli du Saint-Esprit', auteur: ZTF, total: 20 },
  { titre: 'Réveil spirituel personnel', auteur: ZTF, total: 80 },
  { titre: 'La Repentance, clé d’une réelle conversion biblique', auteur: 'Samuel & Dorothée Hatzakortzian', total: 95 }
];

/** Autres titres français de ZTF (pages inconnues). */
const TITRES_ZTF = [
  // « Le Chemin Chrétien » (13 livres)
  'Le chemin de l’obéissance', 'Le chemin d’être disciple', 'Le chemin de la sanctification', 'Le chemin du combat spirituel',
  'Le chemin de la souffrance pour Christ', 'Le chemin de la prière victorieuse', 'Le chemin des vainqueurs',
  'Le chemin de la puissance spirituelle', 'Le chemin de l’encouragement spirituel', 'Le chemin de l’amour pour le Seigneur', 'Le chemin du service chrétien',
  // Prière, jeûne, intercession
  'L’art de l’intercession', 'La pratique de l’intercession', 'Prier avec puissance', 'Le ministère de la supplication', 'Le ministère du jeûne',
  // Vie spirituelle et sainteté
  'La vraie repentance', 'La guérison intérieure', 'Tu peux recevoir un cœur pur aujourd’hui', 'Délivrance du péché d’adultère et de fornication',
  'Délivrance du péché de paresse', 'Pour devenir disciple', 'Le don à Dieu', 'L’école de la vérité', 'Les guerriers de la nuit',
  // Jeunesse, mariage
  'Le jeu de la vie', 'Un mot aux étudiants', 'Préparation pratique pour le mariage', 'Jouir de la vie conjugale'
];

/** Minuscules, sans accents ni ponctuation : « L’École de la Vérité » et « ecole de la verite » se reconnaissent. */
export const normaliser = (t: string): string => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’'`]/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();

/** Le catalogue de départ : livres connus (avec pages), puis les autres titres de ZTF. */
export const LIVRES_ZTF: LivreCatalogue[] = [...LIVRES_CONNUS, ...TITRES_ZTF.map((titre) => ({ titre, auteur: AUTEUR_ZTF, total: null }))];

/** Catalogue complet : ZTF d'abord, puis les livres de l'utilisateur ; un livre déjà saisi (pages, auteur) remplace la fiche de départ. */
export function catalogueDeLivres(points: Pick<PointRapportLigne, 'livres'>[]): LivreCatalogue[] {
  const parTitre = new Map<string, LivreCatalogue>(LIVRES_ZTF.map((l) => [normaliser(l.titre), { ...l }]));
  const saisis: LivreSuivi[] = points.flatMap((p) => p.livres ?? []);
  for (const l of saisis) {
    const cle = normaliser(l.titre);
    if (!cle) continue;
    const connu = parTitre.get(cle);
    parTitre.set(cle, { titre: connu?.titre ?? l.titre, auteur: l.auteur || connu?.auteur || '', total: l.total ?? connu?.total ?? null });
  }
  return [...parTitre.values()];
}

/** Propositions pour ce qu'on tape : titres qui contiennent tous les mots, hors livres déjà suivis. Sans saisie, les premiers du catalogue. */
export function proposerLivres(saisie: string, catalogue: LivreCatalogue[], dejaSuivis: LivreSuivi[], max = 8): LivreCatalogue[] {
  const suivis = new Set(dejaSuivis.filter((l) => l.actif).map((l) => normaliser(l.titre)));
  const mots = normaliser(saisie).split(' ').filter(Boolean);
  return catalogue
    .filter((l) => !suivis.has(normaliser(l.titre)) && mots.every((m) => normaliser(l.titre).includes(m)))
    .slice(0, max);
}
