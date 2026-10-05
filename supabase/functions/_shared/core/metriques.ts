// Catalogue des 12 types de métriques et agrégation (spec §4).
import type { Aggregation, Jour, Metrique, TypeMetrique, ValeurSaisie } from './types.ts';

export interface InfoType {
  nom: string;
  uniteBase: string;
  agregation: Aggregation;
  /** Pas des boutons − et + dans l'interface, en unité de base. */
  pas: number;
  /** Unité affichée par défaut. */
  uniteAffichee: string;
}

export const TYPES: Record<TypeMetrique, InfoType> = {
  temps: { nom: 'Temps', uniteBase: 'secondes', agregation: 'somme', pas: 300, uniteAffichee: 'min' },
  fois: { nom: 'Fois', uniteBase: 'entier', agregation: 'somme', pas: 1, uniteAffichee: '' },
  nombre: { nom: 'Nombre', uniteBase: 'décimal', agregation: 'somme', pas: 1, uniteAffichee: 'unités' },
  montant: { nom: 'Montant ($)', uniteBase: 'centimes', agregation: 'somme', pas: 5000, uniteAffichee: '$' },
  oui_non: { nom: 'Oui / Non', uniteBase: '0 ou 1', agregation: 'somme', pas: 1, uniteAffichee: '' },
  choix: { nom: 'Choix', uniteBase: 'valeur de l’option', agregation: 'somme', pas: 1, uniteAffichee: '' },
  distance: { nom: 'Distance', uniteBase: 'mètres', agregation: 'somme', pas: 500, uniteAffichee: 'km' },
  poids: { nom: 'Poids', uniteBase: 'grammes', agregation: 'dernier', pas: 500, uniteAffichee: 'kg' },
  note: { nom: 'Note /10', uniteBase: 'entier 0 à 10', agregation: 'moyenne', pas: 1, uniteAffichee: '/10' },
  pourcentage: { nom: 'Pourcentage', uniteBase: '0 à 100', agregation: 'dernier', pas: 5, uniteAffichee: '%' },
  heure: { nom: 'Heure', uniteBase: 'minutes depuis minuit', agregation: 'moyenne', pas: 5, uniteAffichee: '' },
  reference: { nom: 'Référence', uniteBase: 'texte', agregation: 'aucune', pas: 0, uniteAffichee: '' }
};

export const ORDRE_TYPES: TypeMetrique[] = ['temps', 'fois', 'nombre', 'montant', 'oui_non', 'choix', 'distance', 'poids', 'note', 'pourcentage', 'heure', 'reference'];

export const UNITES_RAPIDES = ['chapitres', 'pages', 'versets', 'personnes', 'âmes', 'séances', 'pièces', 'articles'] as const;

export const OPTIONS_JEUNE = [
  { label: 'Complet', valeur: 1 },
  { label: 'Partiel', valeur: 0.5 },
  { label: 'Aucun', valeur: 0 }
];

function enleverAccents(t: string): string { return t.normalize('NFD').replace(/[̀-ͯ]/g, ''); }

/** Clé de métrique : deux métriques de même clé lisent la même saisie (spec §2). Ex. « nombre:chapitres », « temps ». */
export function cleMetrique(type: TypeMetrique, unite: string, nom = ''): string {
  const base = enleverAccents(unite || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  switch (type) {
    case 'temps': case 'fois': case 'distance': case 'poids': case 'heure': case 'pourcentage': case 'oui_non': case 'note':
      return type;
    case 'nombre': return `nombre:${base || 'unites'}`;
    case 'montant': return `montant:${enleverAccents(nom).toLowerCase().replace(/[^a-z0-9]+/g, '') || 'total'}`;
    case 'choix': return `choix:${enleverAccents(nom).toLowerCase().replace(/[^a-z0-9]+/g, '') || 'choix'}`;
    case 'reference': return `reference:${enleverAccents(nom).toLowerCase().replace(/[^a-z0-9]+/g, '') || 'texte'}`;
  }
}

export function agregation(m: Pick<Metrique, 'type'>): Aggregation { return TYPES[m.type].agregation; }

/** Agrège des valeurs d'une même clé selon la règle du type. Retourne 0 s'il n'y a rien (sauf « dernier » : null). */
export function agreger(type: TypeMetrique, valeurs: ValeurSaisie[]): number | null {
  if (!valeurs.length) return TYPES[type].agregation === 'dernier' ? null : 0;
  switch (TYPES[type].agregation) {
    case 'somme': return valeurs.reduce((s, v) => s + v.valeur, 0);
    case 'moyenne': return valeurs.reduce((s, v) => s + v.valeur, 0) / valeurs.length;
    case 'dernier': return [...valeurs].sort((a, b) => (a.jour < b.jour ? -1 : a.jour > b.jour ? 1 : 0)).at(-1)!.valeur;
    case 'aucune': return null;
  }
}

export function valeursEntre(valeurs: ValeurSaisie[], cle: string, debut: Jour, fin: Jour): ValeurSaisie[] {
  return valeurs.filter((v) => v.cle === cle && v.jour >= debut && v.jour <= fin);
}

/** Libellé de l'option d'un type « choix » pour une valeur. */
export function libelleChoix(options: { label: string; valeur: number }[] | undefined, valeur: number): string {
  return (options ?? OPTIONS_JEUNE).find((o) => o.valeur === valeur)?.label ?? String(valeur);
}
