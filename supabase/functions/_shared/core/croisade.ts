// Croisade (ex. 40 jours de recherche de Dieu seul) : bloc affiché en tête du rapport du jour (spec §9).
import { ecartJours } from './dates.ts';
import { formatTemps } from './units.ts';
import type { Jour } from './types.ts';

export interface Croisade {
  /** Titre complet, ex. « Croisade de 40jrs de Consolation « Bâtir la vie qui correspond à mon appel » ». */
  titre: string;
  /** Règle complémentaire de la parenthèse, ex. « un profil ZTF à écouter par jour ». */
  regle: string;
  /** Libellé du suivi quotidien oui / non, ex. « Un profil ZTF écouté ». */
  suivi: string;
  debut: Jour;
  jours: number;
  /** Objectif quotidien de recherche de Dieu seul, en heures. */
  heures: number;
  /** Codes des points du rapport dont le temps compte (par défaut RDQD = DDEWG, PA, BR, CL). */
  codes: string[];
}

/** Numéro du jour dans la croisade (1 à `jours`), ou null avant le début / après la fin. */
export const jourDeCroisade = (c: Pick<Croisade, 'debut' | 'jours'>, jour: Jour): number | null => {
  const n = ecartJours(c.debut, jour) + 1;
  return n >= 1 && n <= c.jours ? n : null;
};

const heuresAttendues = (h: number) => (Number.isInteger(h) ? `${h}h` : formatTemps(h * 3600));

/** Les lignes du bloc : titre et règles, jour, temps de recherche de Dieu seul, suivi quotidien. */
export function formaterCroisade(c: Croisade, o: { jour: number; secondes: number; approx: boolean; suiviAujourdhui: boolean; suiviTotal: number }): string {
  return [
    `*_${c.titre}_* (${c.jours}jrs, recherche de Dieu seul au moins pendant ${heuresAttendues(c.heures)} par jour${c.regle.trim() ? `, ${c.regle.trim()}` : ''}.)`,
    `* Day : ${o.jour}/${c.jours}`,
    `* Recherche de Dieu seul : ${formatTemps(o.secondes, o.approx)}/${heuresAttendues(c.heures)}`,
    ...(c.suivi.trim() ? [`* ${c.suivi.trim()} : ${o.suiviAujourdhui ? 'Oui' : 'Non'}, ${o.suiviTotal}/${c.jours}`] : [])
  ].join('\n');
}
