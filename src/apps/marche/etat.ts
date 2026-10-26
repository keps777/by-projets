// Petit état propre au marché (tranche « marche ») : alertes de prix par vol, préférence « accepter une offre de rachat » par droit.
import { app, tranche } from '../../data/store.svelte.ts';

interface TrancheMarche { alertes: string[]; rachat: string[] }
const vide = (): TrancheMarche => ({ alertes: [], rachat: [] });
const cle = (compteId: string, id: string): string => `${compteId}:${id}`;
/** Lecture seule, sans créer la tranche (sûre dans un `$derived`). */
const lire = (): TrancheMarche => (app.tranches.marche as TrancheMarche | undefined) ?? vide();
const ecrire = (): TrancheMarche => tranche<TrancheMarche>('marche', vide);
export const alerteActive = (compteId: string, volId: string): boolean => lire().alertes.includes(cle(compteId, volId));
/** Active ou coupe l'alerte « la meilleure offre change » sur un vol ; renvoie le nouvel état. */
export function basculerAlerte(compteId: string, volId: string): boolean {
  const t = ecrire(), k = cle(compteId, volId), i = t.alertes.indexOf(k);
  if (i >= 0) { t.alertes.splice(i, 1); return false; } t.alertes.push(k); return true;
}
export const rachatAccepte = (compteId: string, droitId: string): boolean => lire().rachat.includes(cle(compteId, droitId));
export function memoriserRachat(compteId: string, droitId: string, oui: boolean): void {
  const t = ecrire(), k = cle(compteId, droitId), i = t.rachat.indexOf(k);
  if (oui && i < 0) t.rachat.push(k); if (!oui && i >= 0) t.rachat.splice(i, 1);
}
