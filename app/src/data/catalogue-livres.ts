// Catalogue des livres proposés quand on en ajoute un à un point du rapport (CL) : les livres de Zacharias Tanee Fomum (ZTF) connus
// d'avance, plus TOUS les livres déjà ajoutés par l'utilisateur, sur n'importe quel point (actifs ou retirés). Un livre ajouté une fois
// est donc proposé ensuite, avec le nombre de pages saisi : le catalogue se met à jour tout seul.
import type { LivreSuivi, PointRapportLigne } from '@core/lignes.ts';

export interface LivreCatalogue { titre: string; auteur: string; total: number | null }

export const AUTEUR_ZTF = 'ZTF';

/** Titres français de ZTF (sans les pages, que l'on saisit une fois). Liste de départ, non exhaustive : tout ajout s'y ajoute. */
const TITRES_ZTF = [
  // « Le Chemin Chrétien » (13 livres)
  'Le Chemin de la Vie', 'Le Chemin de l’Obéissance', 'Le Chemin d’Être Disciple', 'Le Chemin de la Sanctification', 'Le Chemin du Caractère Chrétien',
  'Le Chemin du Combat Spirituel', 'Le Chemin de la Souffrance pour Christ', 'Le Chemin de la Prière Victorieuse', 'Le Chemin des Vainqueurs',
  'Le Chemin de la Puissance Spirituelle', 'Le Chemin de l’Encouragement Spirituel', 'Le Chemin de l’Amour pour le Seigneur', 'Le Chemin du Service Chrétien',
  // Prière, jeûne, intercession
  'L’Art de l’Intercession', 'La Pratique de l’Intercession', 'Prier avec Puissance', 'Le Ministère de la Supplication', 'Le Ministère du Jeûne',
  // Vie spirituelle et sainteté
  'La Vraie Repentance', 'La Guérison Intérieure', 'Réveil Spirituel Personnel', 'Tu Peux Recevoir un Cœur Pur Aujourd’hui', 'Délivrance du Péché d’Adultère et de Fornication',
  'Délivrance du Péché de Paresse', 'Pour Devenir Disciple', 'Le Don à Dieu', 'L’École de la Vérité', 'Les Guerriers de la Nuit',
  // Jeunesse, mariage
  'Le Jeu de la Vie', 'Un Mot aux Étudiants', 'Préparation Pratique pour le Mariage', 'Jouir de la Vie Conjugale'
];

/** Minuscules, sans accents ni ponctuation : « L’École de la Vérité » et « ecole de la verite » se reconnaissent. */
export const normaliser = (t: string): string => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’'`]/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();

export const LIVRES_ZTF: LivreCatalogue[] = TITRES_ZTF.map((titre) => ({ titre, auteur: AUTEUR_ZTF, total: null }));

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
