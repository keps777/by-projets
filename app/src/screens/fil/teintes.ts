// Teintes exactes des rubriques, reprises des maquettes (THEMES de Main.dc.html) : fond, encre, remplissage et « sur ».
// Clé = couleur de nuit de la rubrique. Une couleur inconnue (rubrique personnalisée) retombe sur des mélanges calculés.
import { couleurRubrique, styleCouleur } from '../../ui/couleurs.ts';

type Teinte = { c: string; bg: string; ink: string; fill: string; on: string };

const NUIT: Record<string, Teinte> = {
  '#9D8CFF': { c: '#9D8CFF', bg: '#262143', ink: '#DCD5FF', fill: 'rgba(157,140,255,0.36)', on: '#120E2E' },
  '#34D1B6': { c: '#34D1B6', bg: '#102D29', ink: '#B4F1E6', fill: 'rgba(52,209,182,0.30)', on: '#04241F' },
  '#5EA6FF': { c: '#5EA6FF', bg: '#14253D', ink: '#CFE3FF', fill: 'rgba(94,166,255,0.30)', on: '#06182E' },
  '#FF8F66': { c: '#FF8F66', bg: '#381F17', ink: '#FFD9CA', fill: 'rgba(255,143,102,0.30)', on: '#2E1006' },
  '#F5B843': { c: '#F5B843', bg: '#33280F', ink: '#FBE4B2', fill: 'rgba(245,184,67,0.28)', on: '#2A1C00' },
  '#A3A6B1': { c: '#A3A6B1', bg: '#2A2C35', ink: '#E3E4EA', fill: 'rgba(163,166,177,0.28)', on: '#16171D' }
};
const JOUR: Record<string, Teinte> = {
  '#9D8CFF': { c: '#5B4FE0', bg: '#E9E6FD', ink: '#2C2380', fill: 'rgba(91,79,224,0.24)', on: '#FFFFFF' },
  '#34D1B6': { c: '#0B7F72', bg: '#DCF0EC', ink: '#08524A', fill: 'rgba(11,127,114,0.22)', on: '#FFFFFF' },
  '#5EA6FF': { c: '#2B67A8', bg: '#DFEAF6', ink: '#183F6A', fill: 'rgba(43,103,168,0.22)', on: '#FFFFFF' },
  '#FF8F66': { c: '#B4542F', bg: '#F5E2D9', ink: '#6E2E14', fill: 'rgba(180,84,47,0.22)', on: '#FFFFFF' },
  '#F5B843': { c: '#A66D00', bg: '#F7ECD2', ink: '#5E3E00', fill: 'rgba(176,116,0,0.24)', on: '#FFFFFF' },
  '#A3A6B1': { c: '#6B6E76', bg: '#E7E5E0', ink: '#3A3B42', fill: 'rgba(107,110,118,0.22)', on: '#FFFFFF' }
};

/** Teinte exacte d'une rubrique par défaut, ou null pour une couleur personnalisée. */
export function teinte(couleur: string, mode: 'nuit' | 'jour'): Teinte | null {
  return (mode === 'jour' ? JOUR : NUIT)[couleur.toUpperCase()] ?? null;
}

/**
 * Variables CSS d'un élément coloré : --c, --c-fond, --c-encre, --c-sur, --c-rempli (remplissage du minuteur)
 * et --c-titre (texte coloré sur la feuille : la couleur la nuit, l'encre le jour).
 */
export function styleTeinte(couleur: string, mode: 'nuit' | 'jour'): string {
  const t = teinte(couleur, mode);
  if (t) return `--c:${t.c};--c-fond:${t.bg};--c-encre:${t.ink};--c-sur:${t.on};--c-rempli:${t.fill};--c-titre:${mode === 'nuit' ? t.c : t.ink}`;
  const c = couleurRubrique(couleur, mode);
  return `${styleCouleur(c)};--c-sur:${mode === 'nuit' ? 'var(--fond)' : '#FFFFFF'};--c-rempli:color-mix(in srgb, ${c} 32%, transparent);--c-titre:${mode === 'nuit' ? c : 'var(--c-encre)'}`;
}
