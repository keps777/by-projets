// Vérification de disponibilité d'un créneau (spec §7.3). Les heures sont en minutes depuis minuit.
import type { Creneau } from './types.ts';

export const PAS = 5;
export const JOURNEE = 1440;

export function conflit(creneaux: Creneau[], debut: number, fin: number): Creneau | undefined {
  return [...creneaux].sort((a, b) => a.debut - b.debut).find((c) => c.debut < fin && debut < c.fin);
}

export const estLibre = (creneaux: Creneau[], debut: number, fin: number) => !conflit(creneaux, debut, fin);

/** Premier début ≥ `debut` pour lequel `duree` minutes sont libres dans la journée. */
export function prochainLibreApres(creneaux: Creneau[], debut: number, duree: number): number | null {
  for (let t = Math.ceil(debut / PAS) * PAS; t + duree <= JOURNEE; t += PAS) if (estLibre(creneaux, t, t + duree)) return t;
  return null;
}

/** Dernier début ≤ `debut` pour lequel `duree` minutes sont libres. */
export function prochainLibreAvant(creneaux: Creneau[], debut: number, duree: number): number | null {
  for (let t = Math.floor(debut / PAS) * PAS; t >= 0; t -= PAS) if (t + duree <= JOURNEE && estLibre(creneaux, t, t + duree)) return t;
  return null;
}

export interface Disponibilite {
  libre: boolean;
  /** Tâche en conflit, ou null. */
  occupePar: Creneau | null;
  apres: number | null;
  avant: number | null;
  /** Jusqu'à quelle heure le créneau reste libre (prochain créneau occupé), ou null s'il reste libre jusqu'au soir. */
  libreJusqua: number | null;
}

export function disponibilite(creneaux: Creneau[], debut: number, duree: number): Disponibilite {
  const fin = debut + duree;
  const c = conflit(creneaux, debut, fin) ?? null;
  const suivant = [...creneaux].filter((x) => x.debut >= fin).sort((a, b) => a.debut - b.debut)[0];
  return {
    libre: !c,
    occupePar: c,
    apres: c ? prochainLibreApres(creneaux, debut, duree) : null,
    avant: c ? prochainLibreAvant(creneaux, debut, duree) : null,
    libreJusqua: !c && suivant ? suivant.debut : null
  };
}

/** Alerte douce quand plus de 12 h sont planifiées (spec §7.3). */
export function journeeTresChargee(creneaux: Creneau[]): boolean {
  return creneaux.reduce((s, c) => s + (c.fin - c.debut), 0) > 12 * 60;
}
