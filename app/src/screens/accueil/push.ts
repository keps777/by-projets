// Notifications push : demande d'autorisation (toujours après un appui), abonnement Web Push (VAPID) et ligne
// `abonnements_push` pour que le serveur sache où envoyer. Sans serveur ni clé VAPID, on rend le statut sans planter.
import { uuidDeterministe } from '@core/ids.ts';
import type { AbonnementPush } from '@core/lignes.ts';
import { VAPID_PUBLIQUE } from '../../data/config.ts';
import { magasin } from '../../data/magasin.svelte.ts';
import { majProfil } from '../../data/actions/reglages.ts';

export type ResultatActivation = 'accorde' | 'refuse' | 'indisponible';
const CLE_ENDPOINT = 'luther-life:push-endpoint';

function lireLocal(cle: string): string | null { try { return localStorage.getItem(cle); } catch { return null; } }
function ecrireLocal(cle: string, v: string): void { try { localStorage.setItem(cle, v); } catch { /* stockage indisponible */ } }

/** Vrai si l'app est ouverte depuis son icône d'écran d'accueil (seul cas où l'iPhone livre les notifications). */
export function estInstallee(): boolean {
  if (typeof navigator !== 'undefined' && (navigator as Navigator & { standalone?: boolean }).standalone === true) return true;
  try { return typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches; } catch { return false; }
}
const estIos = () => typeof navigator !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent ?? '');

export function nomAppareil(): string {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent ?? '' : '';
  const type = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'Appareil';
  return `${type} · ${estInstallee() ? 'app installée' : 'navigateur'}`;
}

/** Clé publique VAPID (base64url) → octets attendus par PushManager.subscribe. */
export function base64UrlVersOctets(b64: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const brut = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const res = new Uint8Array(new ArrayBuffer(brut.length));
  for (let i = 0; i < brut.length; i++) res[i] = brut.charCodeAt(i);
  return res;
}

async function enregistrementSw(): Promise<ServiceWorkerRegistration | undefined> {
  const sw = navigator.serviceWorker;
  const reg = await sw.getRegistration?.();
  if (reg) return reg;
  // En développement, aucun service worker n'est enregistré : on n'attend pas indéfiniment.
  return Promise.race([sw.ready, new Promise<undefined>((r) => setTimeout(() => r(undefined), 4000))]);
}

/** Écrit (ou met à jour) la ligne de cet appareil dans `abonnements_push`. */
export function enregistrerAbonnement(sub: PushSubscription): AbonnementPush | null {
  const json = sub.toJSON();
  const endpoint = json.endpoint ?? sub.endpoint;
  const p256dh = json.keys?.p256dh, auth = json.keys?.auth;
  if (!endpoint || !p256dh || !auth || !magasin.userId) return null;
  const existant = magasin.lignes.abonnements_push.find((a) => a.endpoint === endpoint);
  const ligne = magasin.ecrire('abonnements_push', {
    id: existant?.id ?? uuidDeterministe(`push:${magasin.userId}:${endpoint}`),
    endpoint, cle_p256dh: p256dh, cle_auth: auth, appareil: nomAppareil(), dernier_succes: existant?.dernier_succes ?? null
  });
  ecrireLocal(CLE_ENDPOINT, endpoint);
  return ligne;
}

/**
 * Demande l'autorisation (à appeler depuis un appui), enregistre le délai et la visibilité des titres, puis abonne
 * l'appareil au Web Push quand une clé VAPID est configurée.
 */
export async function activerNotifications(delaiMin: number, titresVisibles: boolean): Promise<ResultatActivation> {
  try { if (magasin.userId) majProfil({ rappel_defaut_min: delaiMin, titres_visibles: titresVisibles }); } catch { /* profil indisponible */ }
  if (typeof Notification === 'undefined' || typeof Notification.requestPermission !== 'function') return 'indisponible';
  let permission: NotificationPermission;
  try { permission = await Notification.requestPermission(); } catch { return 'indisponible'; }
  if (permission !== 'granted') return 'refuse';
  if (!VAPID_PUBLIQUE || typeof navigator === 'undefined' || !navigator.serviceWorker) return 'accorde';
  try {
    const reg = await enregistrementSw();
    if (!reg?.pushManager) return 'accorde';
    const sub = (await reg.pushManager.getSubscription())
      ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlVersOctets(VAPID_PUBLIQUE) }));
    enregistrerAbonnement(sub);
    return 'accorde';
  } catch (e) {
    console.error('Abonnement push impossible', e);
    return 'indisponible';
  }
}

export interface EtatNotifications { statut: 'actif' | 'autorise' | 'a_activer' | 'bloque' | 'indisponible'; detail: string }

/** État des notifications sur cet appareil, pour les Réglages. */
export function etatNotifications(abonnements: Pick<AbonnementPush, 'endpoint'>[]): EtatNotifications {
  const installee = estInstallee();
  if (typeof Notification === 'undefined' || typeof navigator === 'undefined' || !navigator.serviceWorker) {
    return { statut: 'indisponible', detail: estIos() && !installee ? 'Ouvre l’app depuis son icône d’écran d’accueil (iOS 16.4 ou plus)' : 'Ce navigateur ne gère pas les notifications' };
  }
  const lieu = installee ? 'App installée sur l’écran d’accueil' : 'Dans le navigateur';
  if (Notification.permission === 'denied') return { statut: 'bloque', detail: `${lieu} · refusées dans les réglages du téléphone` };
  if (Notification.permission !== 'granted') return { statut: 'a_activer', detail: `${lieu} · pas encore autorisées` };
  const endpoint = lireLocal(CLE_ENDPOINT);
  if (endpoint && abonnements.some((a) => a.endpoint === endpoint)) return { statut: 'actif', detail: `${lieu} · autorisée` };
  return { statut: 'autorise', detail: VAPID_PUBLIQUE ? `${lieu} · autorisée, abonnement à finaliser` : `${lieu} · autorisée (envoi indisponible en mode local)` };
}
