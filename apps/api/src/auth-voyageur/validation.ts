import { BadRequestException } from "@nestjs/common";
import { LONGUEUR_CODE } from "./config";

/**
 * Corps reçus : miroir de `SchemaDemandeCode` et `SchemaVerificationCode` de `@afrimove/contrats`
 * (le paquet est une dépendance de développement de l'API, pas du programme livré).
 * `validation.test.ts` vérifie que les deux acceptent et refusent les mêmes valeurs.
 */

export type CanalDemande = "sms" | "whatsapp" | "ussd";

export interface DemandeCodeRecue {
  telephone: string;
  canal?: CanalDemande;
}

export interface VerificationRecue {
  telephone: string;
  code: string;
}

const CANAUX: readonly string[] = ["sms", "whatsapp", "ussd"];
const TELEPHONE = /^\+\d{8,15}$/;
const CODE = new RegExp(`^\\d{${LONGUEUR_CODE}}$`);

export class DonneesInvalides extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DonneesInvalides";
  }
}

function objet(brut: unknown): Record<string, unknown> {
  if (typeof brut !== "object" || brut === null || Array.isArray(brut)) {
    throw new DonneesInvalides("Un objet JSON est attendu");
  }
  return brut as Record<string, unknown>;
}

function telephone(o: Record<string, unknown>): string {
  const t = o["telephone"];
  if (typeof t !== "string" || !TELEPHONE.test(t)) {
    throw new DonneesInvalides("telephone : numéro international attendu (+237691221008)");
  }
  return t;
}

export function lireDemandeCode(brut: unknown): DemandeCodeRecue {
  const o = objet(brut);
  const tel = telephone(o);
  const canal = o["canal"];
  if (canal === undefined) return { telephone: tel };
  if (typeof canal !== "string" || !CANAUX.includes(canal)) {
    throw new DonneesInvalides("canal : « sms », « whatsapp » ou « ussd » attendu");
  }
  return { telephone: tel, canal: canal as CanalDemande };
}

export function lireVerification(brut: unknown): VerificationRecue {
  const o = objet(brut);
  const tel = telephone(o);
  const code = o["code"];
  if (typeof code !== "string" || !CODE.test(code)) {
    throw new DonneesInvalides(`code : ${LONGUEUR_CODE} chiffres attendus`);
  }
  return { telephone: tel, code };
}

/** Lit un corps ; une donnée invalide devient une réponse 400 `{ code: "REQUETE_INVALIDE", message }`. */
export function ou400<T>(lecture: () => T): T {
  try {
    return lecture();
  } catch (e) {
    if (e instanceof DonneesInvalides) {
      throw new BadRequestException({ code: "REQUETE_INVALIDE", message: e.message });
    }
    throw e;
  }
}
