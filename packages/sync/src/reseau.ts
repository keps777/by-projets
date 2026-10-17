/** La connectivité, vue du moteur. Remplaçable : navigateur, test, ou « partage de connexion ». */
export interface ReseauSync {
  enLigne(): boolean;
  /** Écoute les changements ; renvoie la fonction de désabonnement. */
  ecouter(rappel: (enLigne: boolean) => void): () => void;
}

/** `navigator.onLine` + événements `online` / `offline` de la fenêtre. */
export function reseauNavigateur(): ReseauSync {
  const nav = (globalThis as { navigator?: { onLine?: boolean } }).navigator;
  const cible = globalThis as unknown as {
    addEventListener?: (type: string, fn: () => void) => void;
    removeEventListener?: (type: string, fn: () => void) => void;
  };
  return {
    enLigne: () => nav?.onLine !== false,
    ecouter(rappel) {
      if (!cible.addEventListener) return () => undefined;
      const enLigne = (): void => rappel(true);
      const horsLigne = (): void => rappel(false);
      cible.addEventListener("online", enLigne);
      cible.addEventListener("offline", horsLigne);
      return () => {
        cible.removeEventListener?.("online", enLigne);
        cible.removeEventListener?.("offline", horsLigne);
      };
    },
  };
}

export interface ReseauManuel extends ReseauSync {
  definir(enLigne: boolean): void;
}

/** Réseau piloté à la main (tests, démonstration, bascule forcée). */
export function reseauManuel(enLigneInitial = true): ReseauManuel {
  let courant = enLigneInitial;
  const ecouteurs = new Set<(enLigne: boolean) => void>();
  return {
    enLigne: () => courant,
    ecouter(rappel) {
      ecouteurs.add(rappel);
      return () => ecouteurs.delete(rappel);
    },
    definir(enLigne) {
      if (enLigne === courant) return;
      courant = enLigne;
      for (const rappel of [...ecouteurs]) rappel(enLigne);
    },
  };
}

/** Horloge minimale du moteur. Compatible avec l'`Horloge` de `@afrimove/api-client`. */
export interface HorlogeSync {
  /** Millisecondes depuis l'époque. */
  maintenant(): number;
  /** Exécute `fn` dans `ms` ms ; renvoie l'annulation. */
  planifier(ms: number, fn: () => void): () => void;
}

export function horlogeSysteme(): HorlogeSync {
  return {
    maintenant: () => Date.now(),
    planifier(ms, fn) {
      const id = setTimeout(fn, Math.max(0, Math.min(ms, 2_147_000_000)));
      return () => clearTimeout(id);
    },
  };
}

/**
 * Un seul envoi à la fois par appareil, même avec plusieurs onglets ou le service worker : Web
 * Locks quand le navigateur l'offre. Sans lui, deux envois simultanés restent sans danger (le
 * serveur répond `deja_recu`) mais gaspillent la connexion.
 */
export async function sansConcurrence<T>(
  nom: string,
  fn: () => Promise<T>,
): Promise<{ obtenu: true; valeur: T } | { obtenu: false }> {
  const verrous = (
    globalThis as {
      navigator?: {
        locks?: {
          request<R>(
            nom: string,
            options: { ifAvailable: boolean },
            fn: (verrou: unknown) => Promise<R>,
          ): Promise<R>;
        };
      };
    }
  ).navigator?.locks;
  if (!verrous) return { obtenu: true, valeur: await fn() };
  return verrous.request(nom, { ifAvailable: true }, async (verrou) =>
    verrou ? { obtenu: true as const, valeur: await fn() } : { obtenu: false as const },
  );
}
