import { app } from '../../data/store.svelte.ts';
import { deconnecter } from '../../domain/actions.ts';
/** Marque une notification comme lue. */
export function marquerLue(id: string) { const n = app.monde.notifications.find((x) => x.id === id); if (n) n.lu = true; }
export function toutMarquerLu(personneId: string) { for (const n of app.monde.notifications) if (n.destId === personneId) n.lu = true; }
export { deconnecter };
