// Contrat d'envoi d'une notification push, indépendant de la bibliothèque (voir push.ts pour l'implémentation Web Push).

export interface CiblePush { endpoint: string; cle_p256dh: string; cle_auth: string }

export interface OptionsPush {
  /** Durée de vie chez le service de push, en secondes. */
  ttl?: number;
  urgence?: 'very-low' | 'low' | 'normal' | 'high';
}

export type ResultatPush =
  | { ok: true }
  /** `mort` : l'abonnement n'existe plus (404 ou 410), il faut le retirer. */
  | { ok: false; statut: number | null; message: string; mort: boolean };

export interface Envoyeur { envoyer(cible: CiblePush, charge: string, options?: OptionsPush): Promise<ResultatPush> }

/** Contenu de la notification lu par le service worker de l'app. */
export interface ChargePush { titre: string; corps: string; url: string; tag: string }

export const estAbonnementMort = (statut: number | null | undefined) => statut === 404 || statut === 410;
