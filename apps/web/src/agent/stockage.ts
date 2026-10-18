import { CLE_JETON, agence } from "@afrimove/api-client";
import { lire, ecrire, retirer } from "@/coquille/stockage";
import { CLE_APPAREIL_ID } from "@/kiosque/etat";
import type { Enrolement, Moi } from "./api";

/**
 * Ce que l'appareil garde de la connexion d'un agent (lot De).
 *
 * - `afrimove.jeton` : le jeton de la personne connectée, relu à chaque requête par le client d'API ;
 * - `afrimove.jeton.expire` : l'instant (ms) où il cesse de valoir, pour fermer la session à temps ;
 * - `afrimove.appareil.enrole` : l'identité du téléphone et son secret, reçus à l'enrôlement ;
 * - `afrimove.appareil` : l'identité que le moteur de vente lit (`agence.lireProvisionnement`), composée à chaque
 *   connexion avec la personne connectée ;
 * - `afrimove.kiosque.appareil` : l'identifiant seul, qui survit à l'effacement (voir `kiosque/etat.ts`).
 */
export const CLE_JETON_EXPIRE = "afrimove.jeton.expire";
export const CLE_APPAREIL_ENROLE = "afrimove.appareil.enrole";
/** Évènement lancé sur `window` quand l'appareil vient d'être enrôlé (le kiosque se met alors à l'écouter). */
export const EVENEMENT_APPAREIL = "afrimove:appareil";

/** Le téléphone tel que l'enrôlement l'a décrit, secret compris. */
export interface AppareilEnrole {
  appareilId: string;
  secret: string;
  agence: string | null;
  gare: string | null;
  genre: Enrolement["genre"];
  rang: number | null;
  plage: { debut: number; fin: number } | null;
  libelle: string | null;
}

function estEnrole(v: unknown): v is AppareilEnrole {
  if (typeof v !== "object" || v === null) return false;
  const p = v as Record<string, unknown>;
  return typeof p["appareilId"] === "string" && typeof p["secret"] === "string";
}

export function lireAppareilEnrole(): AppareilEnrole | null {
  const brut = lire(CLE_APPAREIL_ENROLE);
  if (!brut) return null;
  try {
    const valeur: unknown = JSON.parse(brut);
    return estEnrole(valeur) ? valeur : null;
  } catch {
    return null;
  }
}

/** Garde l'enrôlement (et l'identifiant qui survivra à un effacement), puis prévient le kiosque. */
export function memoriserEnrolement(e: Enrolement): AppareilEnrole {
  const appareil: AppareilEnrole = {
    appareilId: e.appareilId,
    secret: e.secret,
    agence: e.agence,
    gare: e.gare,
    genre: e.genre,
    rang: e.rang,
    plage: e.plage,
    libelle: e.libelle,
  };
  ecrire(CLE_APPAREIL_ENROLE, JSON.stringify(appareil));
  ecrire(CLE_APPAREIL_ID, e.appareilId);
  // Un autre téléphone, ou le même enrôlé de nouveau : l'ancien compteur de numéros n'a plus de sens.
  retirer(agence.CLE_APPAREIL);
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENEMENT_APPAREIL));
  return appareil;
}

/** En-têtes qui prouvent l'appareil auprès de l'API (lecture des ordres du serveur). Vide si pas enrôlé. */
export function entetesAppareil(): Record<string, string> {
  const appareil = lireAppareilEnrole();
  return appareil ? { Authorization: `Bearer ${appareil.secret}` } : {};
}

/** Jeton de la personne connectée et fin de sa validité. */
export function memoriserJeton(jeton: string, expiresInSecondes: number, maintenant: number): void {
  ecrire(CLE_JETON, jeton);
  ecrire(CLE_JETON_EXPIRE, String(maintenant + expiresInSecondes * 1000));
}

export function oublierJeton(): void {
  retirer(CLE_JETON);
  retirer(CLE_JETON_EXPIRE);
}

/** Vrai si un jeton est gardé et que sa durée de validité est passée. Sans date de fin connue : faux. */
export function jetonExpire(maintenant: number): boolean {
  if (!lire(CLE_JETON)) return false;
  const fin = Number(lire(CLE_JETON_EXPIRE));
  return Number.isFinite(fin) && fin > 0 && maintenant >= fin;
}

/**
 * Compose l'identité que le moteur de vente lit : le téléphone enrôlé et la personne qui s'y connecte (le serveur
 * refuse qu'un autre auteur signe les ventes). Ne fait rien si le téléphone n'a pas de plage de numéros (il ne vend
 * pas de billets numérotés) ou si le compte n'a pas d'agence ou de gare. Le compteur déjà avancé est conservé quand
 * le même téléphone reprend avec la même plage : un numéro imprimé ne se rejoue jamais.
 */
export function provisionnerVente(appareil: AppareilEnrole | null, moi: Moi): boolean {
  if (!appareil || !appareil.plage || !appareil.agence || !appareil.gare) return false;
  const actuel = agence.lireProvisionnement();
  const memePlage =
    actuel !== null &&
    actuel.appareilId === appareil.appareilId &&
    actuel.plage.debut === appareil.plage.debut &&
    actuel.plage.fin === appareil.plage.fin;
  const provisionnement: agence.ProvisionnementAppareil = {
    appareilId: appareil.appareilId,
    auteurId: moi.id,
    agence: appareil.agence,
    gare: appareil.gare,
    plage: appareil.plage,
    ...(memePlage && actuel?.etat ? { etat: actuel.etat } : {}),
  };
  ecrire(agence.CLE_APPAREIL, JSON.stringify(provisionnement));
  return true;
}
