// Minuteur par horodatage (spec §8) : l'état tient en quelques dates, donc le temps reste exact app fermée.

export type EtatBloc = 'prevue' | 'en_cours' | 'pause' | 'faite' | 'ignoree';

export interface Minuteur {
  etat: EtatBloc;
  /** Instant (ms) où le minuteur a démarré, ramené en arrière s'il reprend avec du temps déjà acquis. */
  demarreeA: number | null;
  /** Instant (ms) du début de la pause en cours. */
  pauseDepuis: number | null;
  pauseCumuleeS: number;
  termineeA: number | null;
}

export const initial = (): Minuteur => ({ etat: 'prevue', demarreeA: null, pauseDepuis: null, pauseCumuleeS: 0, termineeA: null });

/** `acquisS` : secondes déjà enregistrées (relancer un bloc corrigé). */
export function lancer(now: number, acquisS = 0): Minuteur {
  return { etat: 'en_cours', demarreeA: now - acquisS * 1000, pauseDepuis: null, pauseCumuleeS: 0, termineeA: null };
}

export function pause(m: Minuteur, now: number): Minuteur {
  return m.etat === 'en_cours' ? { ...m, etat: 'pause', pauseDepuis: now } : m;
}

export function reprendre(m: Minuteur, now: number): Minuteur {
  if (m.etat !== 'pause' || m.pauseDepuis == null) return m;
  return { ...m, etat: 'en_cours', pauseDepuis: null, pauseCumuleeS: m.pauseCumuleeS + (now - m.pauseDepuis) / 1000 };
}

export function terminer(m: Minuteur, now: number): Minuteur {
  const fige = m.etat === 'pause' ? reprendre(m, now) : m;
  return { ...fige, etat: 'faite', termineeA: now };
}

/** Secondes écoulées, pauses déduites. */
export function ecouleS(m: Minuteur, now: number): number {
  if (m.demarreeA == null) return 0;
  const fin = m.termineeA ?? (m.etat === 'pause' && m.pauseDepuis != null ? m.pauseDepuis : now);
  return Math.max(0, Math.floor((fin - m.demarreeA) / 1000 - m.pauseCumuleeS));
}

/**
 * Corrige à la main le temps écoulé d'un minuteur qui tourne ou qui est en pause : le départ recule ou avance pour que `ecouleS` vaille
 * `secondes` à cet instant (en pause, il reste figé à cette valeur ; en cours, il repart de là). Sans effet sur un bloc non lancé ou fait.
 */
export function fixerEcoule(m: Minuteur, secondes: number, now: number): Minuteur {
  if ((m.etat !== 'en_cours' && m.etat !== 'pause') || m.demarreeA == null) return m;
  const fin = m.etat === 'pause' && m.pauseDepuis != null ? m.pauseDepuis : now;
  return { ...m, demarreeA: fin - (Math.max(0, secondes) + m.pauseCumuleeS) * 1000 };
}

/** Remplissage du bloc, de 0 à 1. */
export function remplissage(m: Minuteur, now: number, dureePrevueS: number): number {
  if (m.etat === 'faite') return 1;
  return dureePrevueS > 0 ? Math.min(1, ecouleS(m, now) / dureePrevueS) : 0;
}

/** Vrai quand le temps prévu est écoulé : l'app demande « As-tu terminé ? ». */
export const estArrive = (m: Minuteur, now: number, dureePrevueS: number) => m.etat === 'en_cours' && ecouleS(m, now) >= dureePrevueS;
