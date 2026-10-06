// Catalogue des mesures qu'on peut donner à un sous-projet créé depuis « Nouvelle tâche » : celles déjà utilisées dans les projets,
// celles des modèles de l'app et les types de base (spec §4). Une mesure = une clé de saisie ; pas de doublon.
import { MODELES } from '@core/modeles.ts';
import { ORDRE_TYPES, TYPES, cleMetrique } from '@core/metriques.ts';
import type { MetriqueLigne } from '@core/lignes.ts';
import type { TypeMetrique } from '@core/types.ts';
import type { NouvelleMetrique } from '../../data/actions/projets.ts';

export interface ChoixMesure {
  cle: string;
  nom: string;
  /** Texte secondaire : type et unité. */
  detail: string;
  groupe: 'projets' | 'app';
  metrique: NouvelleMetrique;
}

/** Types dont la clé ne dépend pas du nom : on les présente sous leur nom générique (« Temps », « Note /10 »…). */
const TYPES_SANS_NOM: TypeMetrique[] = ['temps', 'fois', 'distance', 'poids', 'heure', 'pourcentage', 'oui_non', 'note'];

const detailDe = (type: TypeMetrique, unite: string) => `${TYPES[type].nom}${unite ? ` · ${unite}` : ''}`;

function choix(groupe: ChoixMesure['groupe'], m: Pick<NouvelleMetrique, 'type' | 'nom' | 'unite' | 'options'>): ChoixMesure {
  const generique = TYPES_SANS_NOM.includes(m.type);
  const nom = generique ? TYPES[m.type].nom.replace(/ \(\$\)| \/10/, '') : m.nom;
  const unite = generique ? TYPES[m.type].uniteAffichee : m.unite;
  const cle = cleMetrique(m.type, m.unite, m.nom);
  return {
    cle, nom, detail: detailDe(m.type, unite), groupe,
    metrique: { type: m.type, nom, unite, cible: null, periode_cible: 'jour', sens: 'plus', options: m.options ?? null, dans_rapport: true, cle }
  };
}

/** Toutes les mesures proposées : d'abord celles déjà présentes dans les projets, puis celles de l'app (modèles et types de base). */
export function cataloguerMesures(existantes: Pick<MetriqueLigne, 'type' | 'nom' | 'unite' | 'options'>[]): ChoixMesure[] {
  const vues = new Set<string>();
  const res: ChoixMesure[] = [];
  const ajouter = (c: ChoixMesure) => { if (!vues.has(c.cle)) { vues.add(c.cle); res.push(c); } };
  for (const m of existantes) ajouter(choix('projets', m));
  for (const t of ORDRE_TYPES) if (TYPES_SANS_NOM.includes(t)) ajouter(choix('app', { type: t, nom: '', unite: '', options: null }));
  for (const mod of MODELES) for (const m of mod.metriques) ajouter(choix('app', m));
  for (const t of ['nombre', 'montant', 'reference'] as TypeMetrique[]) ajouter(choix('app', { type: t, nom: '', unite: TYPES[t].uniteAffichee, options: null }));
  return res;
}
