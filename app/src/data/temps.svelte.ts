// Horloge réactive : « maintenant » se met à jour chaque seconde tant que l'app est visible.
import { utcVersLocal } from '@core/dates.ts';
import { magasin } from './magasin.svelte.ts';

class Horloge {
  maintenant = $state(Date.now());
  #t: ReturnType<typeof setInterval> | null = null;

  demarrer(): void {
    if (this.#t || typeof document === 'undefined') return;
    const tic = () => { this.maintenant = Date.now(); };
    this.#t = setInterval(() => { if (document.visibilityState === 'visible') tic(); }, 1000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') tic(); });
  }
}
export const horloge = new Horloge();

export const fuseau = () => magasin.lignes.profils[0]?.fuseau ?? 'America/Toronto';

/** Jour et minutes locales de l'utilisateur, dans son fuseau. */
export function maintenantLocal(): { jour: string; minutes: number } { return utcVersLocal(horloge.maintenant, fuseau()); }
export const aujourdhui = () => maintenantLocal().jour;
