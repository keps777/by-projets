/**
 * Dernière lecture réussie de chaque écran du guichet, gardée sur l'appareil pour pouvoir l'afficher sans réseau
 * (accueil, contexte de vente, état de la cadence).
 *
 * C'est un confort, pas une source de vérité : le stockage peut être absent, plein ou bloqué (navigation privée),
 * chaque accès est donc protégé et l'application fonctionne sans lui (l'écran dit alors qu'il ne peut pas se charger).
 */

export const CLE_CACHE_LECTURES = "afrimove.hors-ligne.lectures";
/** Nombre de lectures gardées : les plus récentes. */
const LECTURES_GARDEES = 12;

export interface CacheLectures {
  lire<R>(nom: string, params: unknown): { valeur: R; a: string } | null;
  ecrire(nom: string, params: unknown, valeur: unknown, a: string): void;
}

type Stockage = Pick<Storage, "getItem" | "setItem">;
type Contenu = Record<string, { a: string; valeur: unknown }>;

const cle = (nom: string, params: unknown): string => `${nom}|${JSON.stringify(params ?? null)}`;

function stockageLocal(): Stockage | undefined {
  try {
    return (globalThis as { localStorage?: Stockage }).localStorage;
  } catch {
    return undefined;
  }
}

/** Le cache dans le stockage local de l'appareil. */
export function cacheStockageLocal(
  stockage: Stockage | undefined = stockageLocal(),
): CacheLectures {
  const lireTout = (): Contenu => {
    try {
      const brut = stockage?.getItem(CLE_CACHE_LECTURES);
      if (!brut) return {};
      const lu: unknown = JSON.parse(brut);
      return typeof lu === "object" && lu !== null ? (lu as Contenu) : {};
    } catch {
      return {};
    }
  };
  return {
    lire<R>(nom: string, params: unknown) {
      const trouve = lireTout()[cle(nom, params)];
      return trouve ? { valeur: trouve.valeur as R, a: trouve.a } : null;
    },
    ecrire(nom, params, valeur, a) {
      try {
        const tout = lireTout();
        tout[cle(nom, params)] = { a, valeur };
        const gardes = Object.entries(tout)
          .sort(([, x], [, y]) => y.a.localeCompare(x.a))
          .slice(0, LECTURES_GARDEES);
        stockage?.setItem(CLE_CACHE_LECTURES, JSON.stringify(Object.fromEntries(gardes)));
      } catch {
        // Stockage plein ou bloqué : l'écran se rechargera depuis le serveur, c'est tout.
      }
    },
  };
}

/** Un cache en mémoire (tests). */
export function cacheMemoire(): CacheLectures {
  const contenu: Contenu = {};
  return {
    lire<R>(nom: string, params: unknown) {
      const trouve = contenu[cle(nom, params)];
      return trouve ? { valeur: trouve.valeur as R, a: trouve.a } : null;
    },
    ecrire(nom, params, valeur, a) {
      contenu[cle(nom, params)] = { a, valeur };
    },
  };
}
