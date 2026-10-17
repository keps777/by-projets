import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { LONGUEUR_CODE } from "./config";

/**
 * Règles pures de la connexion du voyageur : fabrication et hachage du code, texte du SMS (format
 * WebOTP), comptage des essais et durée des blocages. Aucune dépendance Nest : ce sont ces
 * fonctions que les adaptateurs de stockage doivent respecter (voir `testing/contrat-stockage.ts`).
 */

/* ------------------------------------------------------------------------------------ code */

/** Code à usage unique de `LONGUEUR_CODE` chiffres, tiré avec le générateur cryptographique. */
export function genererCode(longueur = LONGUEUR_CODE): string {
  return String(randomInt(0, 10 ** longueur)).padStart(longueur, "0");
}

/**
 * Empreinte d'un code : HMAC-SHA-256 lié à l'identifiant du code et au poivre du serveur. Un code de
 * 4 chiffres n'a que 10 000 valeurs : sans le poivre, une base volée se casserait en une seconde ;
 * avec lui, il faut aussi le secret du serveur. Le code lui-même n'est jamais rangé.
 */
export function hacherCode(poivre: Buffer, codeId: string, code: string): string {
  return createHmac("sha256", poivre)
    .update(`auth-voyageur.code\u0000${codeId}\u0000${code}`)
    .digest("hex");
}

/** Comparaison en temps constant. */
export function codeCorrespond(
  poivre: Buffer,
  hache: string,
  codeId: string,
  code: string,
): boolean {
  const attendu = Buffer.from(hacherCode(poivre, codeId, code), "hex");
  const recu = Buffer.from(hache, "hex");
  return attendu.length === recu.length && timingSafeEqual(attendu, recu);
}

/** Index aveugle d'un numéro : retrouver ses codes et ses essais sans ranger le numéro. */
export function indexTelephone(poivre: Buffer, telephone: string): string {
  return createHmac("sha256", poivre)
    .update(`auth-voyageur.telephone\u0000${telephone}`)
    .digest("hex");
}

/* ------------------------------------------------------------------------------------ SMS */

/**
 * Texte du SMS. Il se termine par `@<domaine> #<code>` sur une ligne à part : c'est ce que lit
 * WebOTP (Chrome Android) pour remplir le code sans que la personne tape rien, après avoir vérifié
 * que le domaine est bien celui de la page. Pas d'accent : l'alphabet GSM ne les a pas tous, un seul
 * « é » hors alphabet ferait passer le SMS en UCS-2 (70 caractères, trois fois plus cher).
 */
export function texteSms(code: string, ttlMinutes: number, domaine: string): string {
  return (
    `AfriMove : ton code est ${code}. Valable ${ttlMinutes} min. ` +
    `Personne d'AfriMove ne te le demandera jamais.\n\n@${domaine} #${code}`
  );
}

/** Vrai si la dernière ligne du texte est `@<domaine> #<code>` (le format que WebOTP attend). */
export function formatWebOtp(texte: string, domaine: string, code: string): boolean {
  const lignes = texte.split("\n");
  return lignes[lignes.length - 1] === `@${domaine} #${code}`;
}

/* ------------------------------------------------------------------------------------ essais */

/** Ce que le stockage retient des mauvais codes d'un numéro. */
export interface EtatLimite {
  /** Mauvais codes depuis le dernier blocage ou la dernière réussite. */
  echecs: number;
  /** Blocages successifs sans réussite entre deux : la durée double à chaque fois. */
  blocages: number;
  bloqueJusqua: Date | null;
  dernierEchecA: Date | null;
}

export const ETAT_VIERGE: Readonly<EtatLimite> = {
  echecs: 0,
  blocages: 0,
  bloqueJusqua: null,
  dernierEchecA: null,
};

export interface ReglesEssais {
  essaisMax: number;
  fenetreEchecsMs: number;
  blocageBaseMs: number;
  blocageMaxMs: number;
}

export function estBloque(etat: EtatLimite, at: Date): boolean {
  return etat.bloqueJusqua !== null && etat.bloqueJusqua.getTime() > at.getTime();
}

/** Durée du n-ième blocage : 15 min, 30 min, 1 h… jusqu'au plafond (24 h). */
export function dureeBlocageMs(blocages: number, base: number, max: number): number {
  return Math.min(base * 2 ** Math.max(0, blocages - 1), max);
}

/**
 * Compte un mauvais code. À la `essaisMax`-ième erreur le numéro est bloqué, quel que soit le code
 * (nouveau code demandé entre-temps ou non) : redemander un code ne remet jamais le compteur à
 * zéro, sinon il suffirait de redemander un code pour retenter 5 fois.
 *
 * Un calme de plus d'une heure efface les erreurs ; de plus de 24 h, les blocages aussi. Un numéro
 * déjà bloqué n'est pas modifié (la réponse « bloqué » ne dépend pas du code essayé).
 */
export function appliquerEchec(etat: EtatLimite, at: Date, regles: ReglesEssais): EtatLimite {
  if (estBloque(etat, at)) return etat;
  let { echecs, blocages } = etat;
  if (etat.dernierEchecA !== null) {
    const ecoule = at.getTime() - etat.dernierEchecA.getTime();
    if (ecoule > regles.blocageMaxMs) {
      echecs = 0;
      blocages = 0;
    } else if (ecoule > regles.fenetreEchecsMs) {
      echecs = 0;
    }
  }
  echecs += 1;
  if (echecs >= regles.essaisMax) {
    blocages += 1;
    return {
      echecs: 0,
      blocages,
      bloqueJusqua: new Date(
        at.getTime() + dureeBlocageMs(blocages, regles.blocageBaseMs, regles.blocageMaxMs),
      ),
      dernierEchecA: at,
    };
  }
  return { echecs, blocages, bloqueJusqua: null, dernierEchecA: at };
}

/* ------------------------------------------------------------------------------------ envois */

export interface ReglesEnvoi {
  intervalleMs: number;
  maxParFenetre: number;
  fenetreMs: number;
}

export type DecisionEnvoi =
  | { permis: true }
  | { permis: false; raison: "trop_tot" | "quota"; reessayerA: Date };

/**
 * Peut-on envoyer un nouveau code à ce numéro ? `envoisA` : les instants des codes déjà émis
 * (quel que soit leur sort). Un envoi toutes les 40 s au plus ; 5 par heure au plus.
 */
export function decider(envoisA: readonly Date[], at: Date, regles: ReglesEnvoi): DecisionEnvoi {
  const instants = envoisA.map((d) => d.getTime()).sort((a, b) => a - b);
  const dernier = instants[instants.length - 1];
  if (dernier !== undefined && at.getTime() - dernier < regles.intervalleMs) {
    return {
      permis: false,
      raison: "trop_tot",
      reessayerA: new Date(dernier + regles.intervalleMs),
    };
  }
  const dansFenetre = instants.filter((t) => t > at.getTime() - regles.fenetreMs);
  if (dansFenetre.length >= regles.maxParFenetre) {
    const premier = dansFenetre[dansFenetre.length - regles.maxParFenetre]!;
    return { permis: false, raison: "quota", reessayerA: new Date(premier + regles.fenetreMs) };
  }
  return { permis: true };
}
