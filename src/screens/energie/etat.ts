// Tranche « énergie » : choix en cours (kit, durée, facture ENEO) et plans solaires commandés.
import { app, tranche } from '../../data/store.svelte.ts';
import type { Kit } from '../../core/energie.ts';
import type { Jour } from '../../core/dates.ts';

export interface Plan {
  id: string; kit: Kit['id']; nom: string; prix: number; duree: number; mensualite: number; ts: number;
  /** Jour de pose et créneau choisi. */ installation: Jour; creneau: string; creditId: string;
  /** Date de la première mensualité. */ premier: Jour; /** Kit en veille après un report, il repart au prochain paiement. */ veille: boolean; termine: boolean;
}
export interface EtatEnergie { kit: Kit['id']; duree: number; facture: string; plans: Plan[] }
const defaut = (): EtatEnergie => ({ kit: 'maison', duree: 24, facture: app.mode === 'demo' ? '18000' : '', plans: [] });
/** À relire à chaque usage : la tranche est remplacée quand on bascule démo / vierge. */
export const etat = () => tranche<EtatEnergie>('energie', defaut);
