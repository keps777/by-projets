import type { MoteurSync, ResultatSynchro } from "./moteur";

/**
 * Background Sync : quand le navigateur le permet, le service worker envoie la file même si
 * l'application est fermée, dès que le réseau revient.
 *
 * Côté page :
 *
 * ```ts
 * const moteur = await MoteurSync.ouvrir({ ... });
 * await demanderSynchroArrierePlan(await navigator.serviceWorker.ready);
 * ```
 *
 * Côté service worker (`sw.ts`) :
 *
 * ```ts
 * brancherSynchroServiceWorker(self, () => MoteurSync.ouvrir({ ...mêmes options... }));
 * ```
 *
 * Safari et Firefox n'ont pas Background Sync : le moteur se synchronise alors à l'ouverture de
 * l'application, au retour du réseau (événement `online`) et par relance minutée. Rien n'est perdu :
 * la file est dans IndexedDB.
 *
 * Le service worker n'a pas accès à la session de l'agent : l'application doit lui confier le jeton
 * d'accès (par exemple dans IndexedDB) pour que `obtenirJeton` du transport puisse le lire.
 */

export const BALISE_SYNCHRO = "afrimove-sync";

interface GestionnaireSynchro {
  register(balise: string): Promise<void>;
}

export interface EnregistrementServiceWorker {
  sync?: GestionnaireSynchro;
}

/** Demande au navigateur de réveiller le service worker au retour du réseau. `false` si impossible. */
export async function demanderSynchroArrierePlan(
  enregistrement: EnregistrementServiceWorker | null | undefined,
): Promise<boolean> {
  if (!enregistrement?.sync) return false;
  try {
    await enregistrement.sync.register(BALISE_SYNCHRO);
    return true;
  } catch {
    return false;
  }
}

export function synchroArrierePlanDisponible(
  enregistrement: EnregistrementServiceWorker | null | undefined,
): boolean {
  return Boolean(enregistrement?.sync);
}

/** L'événement `sync` du service worker, réduit au nécessaire. */
export interface EvenementSyncSW {
  tag: string;
  /** `true` quand le navigateur ne retentera plus. */
  lastChance?: boolean;
  waitUntil(promesse: Promise<unknown>): void;
}

export interface PorteeServiceWorker {
  addEventListener(type: "sync", rappel: (evenement: EvenementSyncSW) => void): void;
}

/**
 * Traite l'événement `sync`. La promesse échoue quand il reste des événements à envoyer, ce qui
 * dit au navigateur de réessayer plus tard (avec son propre délai).
 */
export async function traiterEvenementSync(
  evenement: EvenementSyncSW,
  ouvrirMoteur: () => Promise<MoteurSync>,
): Promise<ResultatSynchro | null> {
  if (evenement.tag !== BALISE_SYNCHRO) return null;
  const moteur = await ouvrirMoteur();
  try {
    const resultat = await moteur.synchroniser();
    if (resultat.restants > 0 && resultat.statut !== "ignore") {
      throw new Error(`Synchronisation incomplète : ${resultat.restants} événement(s) à envoyer`);
    }
    return resultat;
  } finally {
    await moteur.arreter();
  }
}

export function brancherSynchroServiceWorker(
  portee: PorteeServiceWorker,
  ouvrirMoteur: () => Promise<MoteurSync>,
): void {
  portee.addEventListener("sync", (evenement) => {
    if (evenement.tag !== BALISE_SYNCHRO) return;
    evenement.waitUntil(traiterEvenementSync(evenement, ouvrirMoteur));
  });
}
