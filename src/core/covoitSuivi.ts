// Covoiturage : où en est le trajet ? (suivi simulé à partir de l'horloge). Pur, testé.
import type { OffreCovoit } from '../domain/types.ts';
import { departOffreMs } from './covoit.ts';

export type EtapeSuivi = 'avant' | 'bientot' | 'attente' | 'en_route' | 'arrive' | 'annule';
export interface Suivi { etape: EtapeSuivi; progres: number; titre: string; detail: string; minutesAvantDepart: number }
/** Étape du voyage : plus d'une heure avant, bientôt, heure passée sans départ, en route (progression selon la durée), arrivé. */
export function suiviTrajet(o: Pick<OffreCovoit, 'jour' | 'heure' | 'statut'>, nowMs: number, dureeMinutes: number): Suivi {
  const depart = departOffreMs(o), min = Math.round((depart - nowMs) / 60_000);
  if (o.statut === 'annulee') return { etape: 'annule', progres: 0, titre: 'Trajet annulé', detail: 'Le conducteur a annulé ce trajet.', minutesAvantDepart: min };
  if (o.statut === 'terminee') return { etape: 'arrive', progres: 1, titre: 'Arrivé à destination', detail: 'Merci d’avoir voyagé ensemble.', minutesAvantDepart: min };
  if (o.statut === 'en_route') {
    const fait = Math.max(0, (nowMs - depart) / 60_000), p = Math.max(0.05, Math.min(0.95, fait / Math.max(1, dureeMinutes)));
    return { etape: 'en_route', progres: p, titre: 'En route', detail: `${Math.round(p * 100)} % du trajet · arrivée dans environ ${Math.max(1, Math.round(dureeMinutes * (1 - p)))} min`, minutesAvantDepart: min };
  }
  if (min > 60) return { etape: 'avant', progres: 0, titre: 'Départ prévu', detail: min >= 1440 ? `dans ${Math.round(min / 1440)} jour${min >= 2880 ? 's' : ''}` : `dans ${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`, minutesAvantDepart: min };
  if (min >= 0) return { etape: 'bientot', progres: 0, titre: 'Départ imminent', detail: `dans ${min} min · sois au point de rencontre`, minutesAvantDepart: min };
  return { etape: 'attente', progres: 0, titre: 'En attente du départ', detail: `${-min} min après l’heure prévue · appelle ton conducteur`, minutesAvantDepart: min };
}
