// Alarmes affichées dans l'app (plein écran) : un bloc dont la tâche a l'option « Alarme » sonne dès son rappel le plus proche du
// début, jusqu'à 10 min après le début, tant qu'il est « prévu » et qu'on ne l'a pas fait taire. Les notifications push insistantes
// (serveur) couvrent le cas où l'app est fermée ; faire taire l'alarme ici annule aussi les insistances à venir.
import { delaiAlarme } from '@core/rappels.ts';
import type { Occurrence, Tache } from '@core/lignes.ts';
import { magasin } from '../data/magasin.svelte.ts';
import { horloge } from '../data/temps.svelte.ts';
import { silencerAlarme } from '../data/actions/taches.ts';
import { sonnerie } from './son.ts';

const CLE = 'luther-life:alarmes-vues';
/** Une alarme non traitée reste affichée jusqu'à 10 min après le début du bloc. */
const TOLERANCE_MS = 10 * 60_000;
export const ID_ESSAI = 'essai';

export interface AlarmeActive { occ: Occurrence; tache: Tache; essai: false }
export interface AlarmeEssai { occ: null; tache: null; essai: true }

function lireVues(): string[] {
  try { return JSON.parse(localStorage.getItem(CLE) ?? '[]') as string[]; } catch { return []; }
}

class Alarmes {
  #vues = $state<string[]>(lireVues());
  essai = $state(false);

  /** Alarme à afficher maintenant (la plus ancienne), ou null. */
  courante = $derived.by((): AlarmeActive | AlarmeEssai | null => {
    if (this.essai) return { occ: null, tache: null, essai: true };
    const maintenant = horloge.maintenant;
    let meilleure: AlarmeActive | null = null;
    for (const occ of magasin.lignes.occurrences) {
      if (occ.etat !== 'prevue' || this.#vues.includes(occ.id)) continue;
      const tache = magasin.trouver('taches', occ.tache_id);
      if (!tache?.actif || !tache.alarme) continue;
      const debut = Date.parse(occ.debut);
      const delai = delaiAlarme(tache);
      if (delai == null || maintenant < debut - delai * 60_000 || maintenant > debut + TOLERANCE_MS) continue;
      if (!meilleure || debut < Date.parse(meilleure.occ.debut)) meilleure = { occ, tache, essai: false };
    }
    return meilleure;
  });

  /** Nombre d'autres alarmes en attente derrière la courante. */
  autres = $derived.by(() => {
    if (this.essai) return 0;
    const maintenant = horloge.maintenant;
    return magasin.lignes.occurrences.filter((occ) => {
      if (occ.etat !== 'prevue' || this.#vues.includes(occ.id)) return false;
      const tache = magasin.trouver('taches', occ.tache_id);
      const delai = tache?.actif ? delaiAlarme(tache) : null;
      const debut = Date.parse(occ.debut);
      return delai != null && maintenant >= debut - delai * 60_000 && maintenant <= debut + TOLERANCE_MS;
    }).length - (this.courante ? 1 : 0);
  });

  /** Le bloc est traité (lancé, reporté, ignoré) : plus d'alarme, ni ici ni par notification. */
  faireTaire(occId: string): void {
    if (!this.#vues.includes(occId)) {
      this.#vues = [...this.#vues.slice(-200), occId];
      try { localStorage.setItem(CLE, JSON.stringify(this.#vues)); } catch { /* stockage indisponible : l'alarme se taira jusqu'au rechargement */ }
    }
    silencerAlarme(occId);
  }

  lancerEssai(): void { sonnerie.debloquer(); this.essai = true; }
  finEssai(): void { this.essai = false; }

  /** Premier toucher dans l'app : le son de l'alarme sera ensuite autorisé par iOS. */
  demarrer(): void {
    if (typeof document === 'undefined') return;
    const debloquer = () => sonnerie.debloquer();
    document.addEventListener('pointerdown', debloquer, { once: false, passive: true });
  }
}

export const alarmes = new Alarmes();
