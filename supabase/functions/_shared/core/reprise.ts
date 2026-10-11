// Repartir d'un sous-projet déjà fait : mêmes réglages, dates adaptées à aujourd'hui (spec §6). Fonctions pures.
import { ajouterJours, dernierDuMois, ecartJours, lundiDe, moisDe, premierDuMois } from './dates.ts';
import type { Regle } from './recurrence.ts';
import type { Jour } from './types.ts';

export interface PeriodeAdaptee { debut: Jour; fin: Jour | null; /** De combien de jours tout glisse (pour décaler les tâches). */ decalage: number }

/**
 * Période d'un sous-projet repris. Un mois entier devient le mois en cours, une semaine entière la semaine en cours,
 * « sans fin » reste sans fin ; toute autre période garde sa durée et commence aujourd'hui.
 */
export function periodeAdaptee(debut: Jour, fin: Jour | null, aujourdhui: Jour): PeriodeAdaptee {
  const sortie = (d: Jour, f: Jour | null): PeriodeAdaptee => ({ debut: d, fin: f, decalage: ecartJours(debut, d) });
  if (!fin) return sortie(aujourdhui, null);
  const m = moisDe(debut);
  if (debut === premierDuMois(m) && fin === dernierDuMois(m)) { const c = moisDe(aujourdhui); return sortie(premierDuMois(c), dernierDuMois(c)); }
  if (debut === lundiDe(debut) && ecartJours(debut, fin) === 6) { const l = lundiDe(aujourdhui); return sortie(l, ajouterJours(l, 6)); }
  return sortie(aujourdhui, ajouterJours(aujourdhui, ecartJours(debut, fin)));
}

/** Récurrence d'une tâche reprise : le début et la date de fin glissent du même nombre de jours. */
export function regleDecalee(r: Regle, decalage: number): Regle {
  return {
    ...r,
    debut: ajouterJours(r.debut, decalage),
    fin: r.fin.type === 'date' ? { type: 'date', date: ajouterJours(r.fin.date, decalage) } : r.fin
  };
}
