// Le Carnet (spec §18) : calculs purs de l'écran (provenance d'une note, pages voisines).
import type { Jour } from '@core/types.ts';
import type { Note } from '@core/lignes.ts';
import { hm } from '../fil/format.ts';

/** D'où vient une note : « Note libre · 14:03 », « Focus · RDQD du matin · 05:12 »… */
export function provenance(n: Pick<Note, 'origine' | 'source_label' | 'heure'>): string {
  const h = n.heure != null ? hm(n.heure) : null;
  const lieu = n.origine === 'libre' ? 'Note libre'
    : n.origine === 'focus' ? `Focus${n.source_label ? ` · ${n.source_label}` : ''}`
    : n.origine === 'saisie' ? `Saisie${n.source_label ? ` · ${n.source_label}` : ''}`
    : n.source_label ?? 'Bloc';
  return h ? `${lieu} · ${h}` : lieu;
}

/** Jours qui ont une page : ceux qui portent des notes, plus aujourd'hui (toujours disponible pour écrire). Ordre croissant. */
export function joursDePages(notes: readonly Pick<Note, 'jour'>[], aujourdhui: Jour): Jour[] {
  return [...new Set([...notes.map((n) => n.jour), aujourdhui])].sort();
}

/** Page voisine : sens -1 = plus ancienne, +1 = plus récente ; null s'il n'y en a pas. */
export function pageVoisine(jours: readonly Jour[], jour: Jour, sens: 1 | -1): Jour | null {
  const i = jours.indexOf(jour);
  if (i >= 0) return jours[i + sens] ?? null;
  // Page demandée sans note (autre jour) : la plus proche dans le sens voulu.
  return (sens === 1 ? jours.find((j) => j > jour) : [...jours].reverse().find((j) => j < jour)) ?? null;
}

/** « n° 12 » ou « n° 12–18 » : les numéros d'une page. */
export const numerosDePage = (de: number, a: number) => (de === a ? `n° ${de}` : `n° ${de}–${a}`);
