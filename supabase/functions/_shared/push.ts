// Envoi Web Push (VAPID) avec la bibliothèque web-push, chargée par npm sous Deno.
// Tout le reste du code ne connaît que l'interface Envoyeur (envoi.ts) : on peut changer de bibliothèque ici seulement.
import webpush from 'npm:web-push@3.6.7';
import { estAbonnementMort, type CiblePush, type Envoyeur, type OptionsPush, type ResultatPush } from './envoi.ts';

export interface ClesVapid { publique: string; privee: string; sujet: string }

/** Lit VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY et VAPID_SUBJECT (« mailto:… » ou « https://… »). */
export function clesVapidDeLEnvironnement(): ClesVapid {
  const publique = Deno.env.get('VAPID_PUBLIC_KEY'), privee = Deno.env.get('VAPID_PRIVATE_KEY'), sujet = Deno.env.get('VAPID_SUBJECT');
  if (!publique || !privee || !sujet) throw new Error('Clés VAPID manquantes (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT).');
  return { publique, privee, sujet };
}

export function envoyeurWebPush(cles: ClesVapid): Envoyeur {
  webpush.setVapidDetails(cles.sujet, cles.publique, cles.privee);
  return {
    async envoyer(cible: CiblePush, charge: string, options: OptionsPush = {}): Promise<ResultatPush> {
      try {
        await webpush.sendNotification(
          { endpoint: cible.endpoint, keys: { p256dh: cible.cle_p256dh, auth: cible.cle_auth } },
          charge,
          { TTL: options.ttl ?? 3600, urgency: options.urgence ?? 'normal' }
        );
        return { ok: true };
      } catch (e) {
        const err = e as { statusCode?: number; body?: string; message?: string };
        const statut = typeof err.statusCode === 'number' ? err.statusCode : null;
        const message = `${statut ?? ''} ${err.body || err.message || 'erreur inconnue'}`.trim().slice(0, 300);
        return { ok: false, statut, message, mort: estAbonnementMort(statut) };
      }
    }
  };
}
