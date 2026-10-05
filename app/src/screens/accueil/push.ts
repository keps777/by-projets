// Notifications push : demande d'autorisation (toujours après un appui), abonnement Web Push (VAPID) et ligne
// `abonnements_push` pour que le serveur sache où envoyer. Sans serveur ni clé VAPID, on rend le statut sans planter.
import { uuidDeterministe } from '@core/ids.ts';
import type { AbonnementPush } from '@core/lignes.ts';
import { VAPID_PUBLIQUE } from '../../data/config.ts';
import { magasin } from '../../data/magasin.svelte.ts';
import { changerDelaiDefaut } from '../../data/actions/reglages.ts';
import { supabase } from '../../data/supabase.ts';
import { synchro } from '../../data/sync.svelte.ts';

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

/** Lignes `abonnements_push` de l'appareil, y compris celles retirées (abonnement déclaré mort par le serveur). */
async function toutesLesLignes(): Promise<AbonnementPush[]> {
  try { return (await magasin.db?.lignes('abonnements_push').toArray()) ?? []; } catch { return []; }
}

/**
 * Écrit (ou met à jour) la ligne de cet appareil dans `abonnements_push`. Se réabonner sur le même appareil réutilise
 * sa ligne, même retirée par le serveur, et la réactive (supprime_le remis à null) : jamais de doublon d'adresse.
 */
export async function enregistrerAbonnement(sub: PushSubscription): Promise<AbonnementPush | null> {
  const json = sub.toJSON();
  const endpoint = json.endpoint ?? sub.endpoint;
  const p256dh = json.keys?.p256dh, auth = json.keys?.auth;
  if (!endpoint || !p256dh || !auth || !magasin.userId) return null;
  const existant = magasin.lignes.abonnements_push.find((a) => a.endpoint === endpoint)
    ?? (await toutesLesLignes()).find((a) => a.endpoint === endpoint);
  const ligne = magasin.ecrire('abonnements_push', {
    id: existant?.id ?? uuidDeterministe(`push:${magasin.userId}:${endpoint}`),
    endpoint, cle_p256dh: p256dh, cle_auth: auth, appareil: nomAppareil(), dernier_succes: existant?.dernier_succes ?? null, supprime_le: null
  });
  ecrireLocal(CLE_ENDPOINT, endpoint);
  return ligne;
}

export interface ResultatAbonnement { ok: boolean; detail: string }

/**
 * Abonne l'appareil au Web Push (permission déjà accordée) et enregistre sa ligne `abonnements_push`. Ne demande rien à
 * l'utilisateur. Dit précisément pourquoi cela n'a pas marché, au lieu d'échouer en silence.
 */
export async function finaliserAbonnement(): Promise<ResultatAbonnement> {
  if (typeof Notification === 'undefined') return { ok: false, detail: estIos() && !estInstallee() ? 'Ouvre l’app depuis son icône d’écran d’accueil : dans Safari, l’iPhone ne permet pas les notifications.' : 'Ce navigateur ne gère pas les notifications.' };
  if (Notification.permission !== 'granted') return { ok: false, detail: Notification.permission === 'denied' ? 'Les notifications sont refusées : autorise-les dans Réglages de l’iPhone → Notifications → Luther Life.' : 'Les notifications ne sont pas encore autorisées.' };
  if (!VAPID_PUBLIQUE) return { ok: false, detail: 'La clé d’envoi des notifications est absente de cette version de l’app.' };
  if (typeof navigator === 'undefined' || !navigator.serviceWorker) return { ok: false, detail: 'Le service worker n’est pas disponible : ouvre l’app depuis son icône d’écran d’accueil.' };
  if (!magasin.userId) return { ok: false, detail: 'Connecte-toi d’abord.' };
  try {
    const reg = await enregistrementSw();
    if (!reg) return { ok: false, detail: 'Le service worker n’est pas encore prêt : ferme puis rouvre l’app, et réessaie.' };
    if (!reg.pushManager) return { ok: false, detail: estIos() && !estInstallee() ? 'Ouvre l’app depuis son icône d’écran d’accueil (pas depuis Safari).' : 'Ce navigateur ne permet pas les notifications push.' };
    const cle = base64UrlVersOctets(VAPID_PUBLIQUE);
    let sub = await reg.pushManager.getSubscription();
    // Un abonnement fait avec une autre clé ne fonctionnerait pas : on le refait.
    const memeCle = (a: ArrayBuffer | null | undefined) => !!a && a.byteLength === cle.byteLength && new Uint8Array(a).every((v, i) => v === cle[i]);
    const ancienne = sub?.options?.applicationServerKey;
    if (sub && ancienne && !memeCle(ancienne)) { await sub.unsubscribe(); sub = null; }
    sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: cle });
    const ligne = await enregistrerAbonnement(sub);
    return ligne ? { ok: true, detail: 'Cet appareil est enregistré pour recevoir les notifications.' } : { ok: false, detail: 'L’abonnement n’a pas pu être enregistré.' };
  } catch (e) {
    console.error('Abonnement push impossible', e);
    return { ok: false, detail: `L’iPhone a refusé l’abonnement (${e instanceof Error ? e.message : String(e)}).` };
  }
}

/**
 * Demande l'autorisation (à appeler depuis un appui), enregistre le délai et la visibilité des titres, puis abonne
 * l'appareil au Web Push quand une clé VAPID est configurée. `detail` dit pourquoi si l'abonnement n'a pas abouti.
 */
export async function activerNotifications(delaiMin: number, titresVisibles: boolean): Promise<ResultatActivation> {
  derniereRaison = '';
  try { if (magasin.userId) changerDelaiDefaut(delaiMin, { titres_visibles: titresVisibles }); } catch { /* profil indisponible */ }
  if (typeof Notification === 'undefined' || typeof Notification.requestPermission !== 'function') {
    derniereRaison = (await finaliserAbonnement()).detail;
    return 'indisponible';
  }
  let permission: NotificationPermission;
  try { permission = await Notification.requestPermission(); } catch { derniereRaison = 'L’iPhone n’a pas affiché la demande d’autorisation.'; return 'indisponible'; }
  if (permission !== 'granted') return 'refuse';
  if (!VAPID_PUBLIQUE) return 'accorde'; // mode local : rien à envoyer
  const r = await finaliserAbonnement();
  derniereRaison = r.ok ? '' : r.detail;
  return r.ok ? 'accorde' : 'indisponible';
}

let derniereRaison = '';
/** Pourquoi la dernière activation n'a pas abouti (vide si elle a réussi). */
export const raisonEchecActivation = () => derniereRaison;

let dernierEssai = 0;
/** À chaque ouverture de l'app : si les notifications sont autorisées mais que l'appareil n'est pas (bien) enregistré, on le répare seul. */
export async function reparerAbonnementSiBesoin(abonnements: Pick<AbonnementPush, 'endpoint'>[], maintenant = Date.now()): Promise<void> {
  if (!VAPID_PUBLIQUE || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  const endpoint = lireLocal(CLE_ENDPOINT);
  if (endpoint && abonnements.some((a) => a.endpoint === endpoint) && maintenant - dernierEssai < 6 * 3600_000) return;
  if (maintenant - dernierEssai < 60_000) return;
  dernierEssai = maintenant;
  await finaliserAbonnement();
}

export interface Verification { ok: boolean; libelle: string }

/** Les points à vérifier pour recevoir des notifications sur cet appareil. */
export function verifications(abonnements: Pick<AbonnementPush, 'endpoint'>[]): Verification[] {
  const installee = estInstallee();
  const permission = typeof Notification === 'undefined' ? null : Notification.permission;
  const endpoint = lireLocal(CLE_ENDPOINT);
  return [
    { ok: installee || !estIos(), libelle: installee ? 'App ouverte depuis l’icône de l’écran d’accueil' : estIos() ? 'App ouverte depuis l’icône de l’écran d’accueil (là, tu es dans Safari)' : 'Navigateur compatible' },
    { ok: permission === 'granted', libelle: permission === 'granted' ? 'Notifications autorisées' : permission === 'denied' ? 'Notifications refusées dans les réglages de l’iPhone' : 'Notifications pas encore autorisées' },
    { ok: !!VAPID_PUBLIQUE, libelle: VAPID_PUBLIQUE ? 'Clé d’envoi présente' : 'Clé d’envoi absente' },
    { ok: typeof navigator !== 'undefined' && !!navigator.serviceWorker?.controller, libelle: 'Service worker actif' },
    { ok: !!endpoint && abonnements.some((a) => a.endpoint === endpoint), libelle: 'Appareil enregistré sur le serveur' }
  ];
}

export interface ResultatTest { ok: boolean; message: string }

/** Envoie tout de suite une notification de test à cet utilisateur (fonction serveur « tester-notification »). */
export async function envoyerNotificationTest(): Promise<ResultatTest> {
  const sb = supabase();
  if (!sb) return { ok: false, message: 'Le test demande le serveur : il n’est pas disponible en mode local.' };
  const abonne = await finaliserAbonnement();
  if (!abonne.ok) return { ok: false, message: abonne.detail };
  await synchro.synchroniser(); // le serveur doit connaître l'appareil avant l'envoi
  const { data, error } = await sb.functions.invoke('tester-notification', { method: 'POST' });
  if (error || !data?.ok) return { ok: false, message: `Le serveur n’a pas pu envoyer le test (${error?.message ?? data?.erreur ?? 'erreur inconnue'}).` };
  if (!data.abonnes) return { ok: false, message: 'Le serveur ne connaît encore aucun appareil. Réessaie dans quelques secondes.' };
  if (data.envoyes > 0) return { ok: true, message: 'Notification envoyée : elle doit apparaître dans quelques secondes. Si elle n’apparaît pas, vérifie le mode Concentration de l’iPhone.' };
  const e = data.echecs?.[0];
  return { ok: false, message: `Le service de notifications d’Apple a refusé l’envoi (${e?.statut ?? '?'} ${String(e?.message ?? '').slice(0, 120)}).` };
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
