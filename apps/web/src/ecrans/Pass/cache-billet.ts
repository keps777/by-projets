import { voyageur } from "@afrimove/contrats";
import { createContext, useContext } from "react";
import {
  lire as lireStockage,
  ecrire as ecrireStockage,
  retirer as retirerStockage,
} from "@/coquille/stockage";

/**
 * Cache local chiffré du billet : le voyageur montre son QR au quai, souvent sans réseau. Le billet reçu du
 * serveur est chiffré (AES-GCM 256 bits) avant d'être posé dans le stockage du navigateur ; la clé est créée sur
 * l'appareil, non exportable, et reste dans IndexedDB. Le stockage ne contient donc jamais le nom, la pièce, le
 * QR ni le code à 4 chiffres en clair. Chaque entrée est liée à son identifiant de billet (donnée authentifiée) :
 * un contenu recopié sous un autre billet ne se déchiffre pas.
 *
 * Une entrée expire 24 h après l'heure de départ. Tout échec (stockage plein ou bloqué, IndexedDB absent,
 * contenu altéré) revient à « pas de cache » : l'écran retombe alors sur le serveur, jamais sur une erreur.
 */

export const PREFIXE_CACHE_BILLET = "afrimove.billet.";
const VERSION = 1;
/** Durée de garde après l'heure de départ. */
export const GARDE_APRES_DEPART_MS = 24 * 60 * 60 * 1000;

/** Stockage du texte chiffré (`localStorage` par défaut ; un faux en mémoire dans les tests). */
export interface PortStockage {
  lire(cle: string): string | null;
  ecrire(cle: string, valeur: string): void;
  retirer(cle: string): void;
  /** Toutes les clés du stockage. */
  cles(): string[];
}

export const stockageNavigateur: PortStockage = {
  lire: lireStockage,
  ecrire: ecrireStockage,
  retirer: retirerStockage,
  cles() {
    try {
      const storage = globalThis.localStorage;
      return Array.from({ length: storage.length }, (_, i) => storage.key(i)).filter(
        (cle): cle is string => cle !== null,
      );
    } catch {
      return [];
    }
  },
};

/* ------------------------------------------------------------------ clé de l'appareil */

const BASE_CLES = "afrimove-billets";
const MAGASIN_CLES = "cles";
const ID_CLE = "aes-gcm-v1";

function attendre<T>(demande: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    demande.onsuccess = () => resolve(demande.result);
    demande.onerror = () => reject(demande.error ?? new Error("IndexedDB"));
  });
}

function ouvrirBase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const ouverture = globalThis.indexedDB.open(BASE_CLES, 1);
    ouverture.onupgradeneeded = () => ouverture.result.createObjectStore(MAGASIN_CLES);
    ouverture.onsuccess = () => resolve(ouverture.result);
    ouverture.onerror = () => reject(ouverture.error ?? new Error("IndexedDB"));
  });
}

/**
 * Clé AES-GCM de l'appareil. Elle est créée une fois, non exportable (le JavaScript ne peut pas la lire, seulement
 * s'en servir), et stockée telle quelle dans IndexedDB. Lecture et écriture dans une même transaction : deux
 * onglets qui démarrent ensemble gardent la même clé.
 */
export async function cleDeLAppareil(): Promise<CryptoKey> {
  if (!globalThis.indexedDB || !globalThis.crypto?.subtle) {
    throw new Error("Chiffrement local indisponible");
  }
  const candidate = await globalThis.crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
  const base = await ouvrirBase();
  try {
    const transaction = base.transaction(MAGASIN_CLES, "readwrite");
    const magasin = transaction.objectStore(MAGASIN_CLES);
    const existante = (await attendre(magasin.get(ID_CLE))) as CryptoKey | undefined;
    if (existante) return existante;
    await attendre(magasin.put(candidate, ID_CLE));
    return candidate;
  } finally {
    base.close();
  }
}

/* ------------------------------------------------------------------ chiffrement */

const encodeur = new TextEncoder();
const decodeur = new TextDecoder();

function versBase64(octets: Uint8Array): string {
  let texte = "";
  for (const octet of octets) texte += String.fromCharCode(octet);
  return btoa(texte);
}

function depuisBase64(texte: string): Uint8Array<ArrayBuffer> {
  const binaire = atob(texte);
  const octets = new Uint8Array(binaire.length);
  for (let i = 0; i < binaire.length; i++) octets[i] = binaire.charCodeAt(i);
  return octets;
}

const LONGUEUR_IV = 12;

/** Chiffre `texte` : `base64(iv ‖ chiffré)`. `lie` est authentifié avec le texte (ici l'identifiant du billet). */
export async function chiffrer(cle: CryptoKey, texte: string, lie: string): Promise<string> {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(LONGUEUR_IV));
  const chiffre = new Uint8Array(
    await globalThis.crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: encodeur.encode(lie) },
      cle,
      encodeur.encode(texte),
    ),
  );
  const tout = new Uint8Array(iv.length + chiffre.length);
  tout.set(iv, 0);
  tout.set(chiffre, iv.length);
  return versBase64(tout);
}

/** Déchiffre ce que `chiffrer` a produit ; `null` si la clé, la donnée liée ou le contenu ne correspondent pas. */
export async function dechiffrer(
  cle: CryptoKey,
  charge: string,
  lie: string,
): Promise<string | null> {
  try {
    const tout = depuisBase64(charge);
    if (tout.length <= LONGUEUR_IV) return null;
    const clair = await globalThis.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: tout.slice(0, LONGUEUR_IV), additionalData: encodeur.encode(lie) },
      cle,
      tout.slice(LONGUEUR_IV),
    );
    return decodeur.decode(clair);
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ cache */

export interface CacheBillet {
  /** Le billet gardé sur l'appareil, ou `null` (absent, expiré, altéré, chiffrement indisponible). Ne rejette jamais. */
  lire(billetId: string, maintenant?: number): Promise<voyageur.BilletVoyageur | null>;
  /** Garde le billet chiffré ; `false` si rien n'a pu être écrit. Ne rejette jamais. */
  ecrire(billetId: string, billet: voyageur.BilletVoyageur, maintenant?: number): Promise<boolean>;
  /** Oublie le billet (annulation, billet introuvable). */
  retirer(billetId: string): void;
}

export interface OptionsCacheBillet {
  cle?: () => Promise<CryptoKey>;
  stockage?: PortStockage;
}

interface Enveloppe {
  v: number;
  /** Instant d'expiration (ms) : en clair pour pouvoir purger sans déchiffrer. */
  x: number;
  d: string;
}

function lireEnveloppe(brut: string): Enveloppe | null {
  try {
    const valeur: unknown = JSON.parse(brut);
    if (typeof valeur !== "object" || valeur === null) return null;
    const { v, x, d } = valeur as Record<string, unknown>;
    return v === VERSION && typeof x === "number" && typeof d === "string" ? { v, x, d } : null;
  } catch {
    return null;
  }
}

export function creerCacheBillet(options: OptionsCacheBillet = {}): CacheBillet {
  const stockage = options.stockage ?? stockageNavigateur;
  const fournirCle = options.cle ?? cleDeLAppareil;
  let cle: Promise<CryptoKey> | undefined;
  const cleMemoisee = () => {
    cle ??= fournirCle().catch((erreur: unknown) => {
      cle = undefined; // le prochain appel retente
      throw erreur;
    });
    return cle;
  };
  const nomStockage = (billetId: string) => `${PREFIXE_CACHE_BILLET}${billetId}`;

  function purgerExpires(maintenant: number): void {
    for (const nom of stockage.cles()) {
      if (!nom.startsWith(PREFIXE_CACHE_BILLET)) continue;
      const enveloppe = lireEnveloppe(stockage.lire(nom) ?? "");
      if (enveloppe === null || enveloppe.x <= maintenant) stockage.retirer(nom);
    }
  }

  return {
    async lire(billetId, maintenant = Date.now()) {
      try {
        const nom = nomStockage(billetId);
        const brut = stockage.lire(nom);
        if (brut === null) return null;
        const enveloppe = lireEnveloppe(brut);
        if (enveloppe === null || enveloppe.x <= maintenant) {
          stockage.retirer(nom);
          return null;
        }
        const clair = await dechiffrer(await cleMemoisee(), enveloppe.d, billetId);
        const lu = clair === null ? null : analyser(clair);
        if (lu === null) {
          stockage.retirer(nom);
          return null;
        }
        return lu;
      } catch {
        // Pas de clé (IndexedDB bloqué) : on laisse l'entrée, elle servira quand la clé reviendra.
        return null;
      }
    },

    async ecrire(billetId, billet, maintenant = Date.now()) {
      try {
        const expiration = Date.parse(billet.heureDepart) + GARDE_APRES_DEPART_MS;
        if (!(expiration > maintenant)) {
          stockage.retirer(nomStockage(billetId));
          return false;
        }
        const d = await chiffrer(await cleMemoisee(), JSON.stringify(billet), billetId);
        const enveloppe: Enveloppe = { v: VERSION, x: expiration, d };
        stockage.ecrire(nomStockage(billetId), JSON.stringify(enveloppe));
        purgerExpires(maintenant);
        return stockage.lire(nomStockage(billetId)) !== null;
      } catch {
        return false;
      }
    },

    retirer(billetId) {
      stockage.retirer(nomStockage(billetId));
    },
  };
}

function analyser(clair: string): voyageur.BilletVoyageur | null {
  try {
    const resultat = voyageur.SchemaBilletVoyageur.safeParse(JSON.parse(clair));
    return resultat.success ? resultat.data : null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ injection */

const cacheParDefaut = creerCacheBillet();

const ContexteCacheBillet = createContext<CacheBillet>(cacheParDefaut);

/** Remplace le cache de l'écran (tests : clé en mémoire et faux stockage). */
export const FournisseurCacheBillet = ContexteCacheBillet.Provider;

export function useCacheBillet(): CacheBillet {
  return useContext(ContexteCacheBillet);
}
