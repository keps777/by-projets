// Chronos des points du rapport (onglet Jour) : une session par point, démarrée puis arrêtée à la main (spec §9).
// L'état d'une session en cours vit sur l'appareil (il survit au rechargement) ; à la validation elle devient une saisie du projet.
import type { Jour } from '@core/types.ts';
import { aujourdhui, horloge } from './temps.svelte.ts';

export interface SessionChrono {
  /** Début, en millisecondes (horloge de l'appareil). */
  debut: number;
  /** Fin si la session est arrêtée mais pas encore validée (pop-up fermée sans valider). */
  fin: number | null;
  /** Jour local du début : c'est le jour de la saisie. */
  jour: Jour;
}

export type EtatChrono = 'repos' | 'cours' | 'arret';

const CLE = 'luther-life:chronos';

function lire(): Record<string, SessionChrono> {
  try {
    const v = JSON.parse(localStorage.getItem(CLE) ?? '{}') as Record<string, SessionChrono>;
    return Object.fromEntries(Object.entries(v).filter(([, s]) => s && typeof s.debut === 'number' && typeof s.jour === 'string'));
  } catch { return {}; }
}

class Chronos {
  sessions = $state<Record<string, SessionChrono>>(lire());

  #ecrire(): void { try { localStorage.setItem(CLE, JSON.stringify(this.sessions)); } catch { /* stockage indisponible */ } }

  etat(pointId: string): EtatChrono {
    const s = this.sessions[pointId];
    return !s ? 'repos' : s.fin == null ? 'cours' : 'arret';
  }

  /** Secondes écoulées (en direct tant que la session tourne). */
  secondes(pointId: string, maintenant = horloge.maintenant): number {
    const s = this.sessions[pointId];
    return s ? Math.max(0, Math.round(((s.fin ?? maintenant) - s.debut) / 1000)) : 0;
  }

  demarrer(pointId: string, maintenant = Date.now(), jour: Jour = aujourdhui()): void {
    if (this.sessions[pointId]) return;
    this.sessions = { ...this.sessions, [pointId]: { debut: maintenant, fin: null, jour } };
    this.#ecrire();
  }

  /** Arrête la session (le temps est figé) ; elle reste à valider. */
  arreter(pointId: string, maintenant = Date.now()): void {
    const s = this.sessions[pointId];
    if (!s || s.fin != null) return;
    this.sessions = { ...this.sessions, [pointId]: { ...s, fin: maintenant } };
    this.#ecrire();
  }

  /** Oublie la session (validée ou annulée). */
  oublier(pointId: string): void {
    if (!this.sessions[pointId]) return;
    const { [pointId]: _, ...reste } = this.sessions;
    this.sessions = reste;
    this.#ecrire();
  }

  /** Identifiants des points dont une session tourne ou attend sa validation. */
  get actifs(): string[] { return Object.keys(this.sessions); }
}

export const chronos = new Chronos();
