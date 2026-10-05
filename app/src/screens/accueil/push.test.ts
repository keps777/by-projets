import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Faux magasin et fausse configuration : on teste la logique d'activation sans navigateur ni serveur.
const etat = vi.hoisted(() => ({
  vapid: undefined as string | undefined,
  lignes: { abonnements_push: [] as { id: string; endpoint: string; dernier_succes: string | null }[], profils: [{ id: 'u' }] },
  ecrits: [] as [string, Record<string, unknown>][]
}));
vi.mock('../../data/config.ts', () => ({ get VAPID_PUBLIQUE() { return etat.vapid; } }));
vi.mock('../../data/magasin.svelte.ts', () => ({
  magasin: {
    userId: 'u',
    get lignes() { return etat.lignes; },
    ecrire: (t: string, l: Record<string, unknown>) => { etat.ecrits.push([t, l]); return l; }
  }
}));

import { activerNotifications, base64UrlVersOctets, etatNotifications } from './push.ts';

const stockage = new Map<string, string>();
const sub = { endpoint: 'https://push.apple.com/abc', toJSON: () => ({ endpoint: 'https://push.apple.com/abc', keys: { p256dh: 'P', auth: 'A' } }) };

function navigateur(o: { permission: NotificationPermission; reponse?: NotificationPermission; sw?: boolean; existant?: boolean; echec?: boolean }) {
  const subscribe = vi.fn(async () => { if (o.echec) throw new Error('refusé par le service'); return sub; });
  const pushManager = { getSubscription: vi.fn(async () => (o.existant ? sub : null)), subscribe };
  const requestPermission = vi.fn(async () => o.reponse ?? o.permission);
  vi.stubGlobal('Notification', { permission: o.permission, requestPermission });
  vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (iPhone)', standalone: true, serviceWorker: o.sw === false ? undefined : { getRegistration: async () => ({ pushManager }), ready: new Promise(() => {}) } });
  vi.stubGlobal('localStorage', { getItem: (k: string) => stockage.get(k) ?? null, setItem: (k: string, v: string) => void stockage.set(k, v) });
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  return { subscribe, requestPermission, pushManager };
}

beforeEach(() => { etat.vapid = undefined; etat.lignes.abonnements_push = []; etat.ecrits = []; stockage.clear(); vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('activerNotifications', () => {
  it('sans API Notification : indisponible, mais le délai et les titres sont enregistrés', async () => {
    vi.stubGlobal('Notification', undefined);
    expect(await activerNotifications(5, false)).toBe('indisponible');
    expect(etat.ecrits).toEqual([['profils', { id: 'u', rappel_defaut_min: 5, titres_visibles: false }]]);
  });

  it('refus de l’utilisateur', async () => {
    const n = navigateur({ permission: 'default', reponse: 'denied' });
    expect(await activerNotifications(10, true)).toBe('refuse');
    expect(n.requestPermission).toHaveBeenCalledOnce();
    expect(n.subscribe).not.toHaveBeenCalled();
  });

  it('accordé sans clé VAPID (mode local) : pas d’abonnement, pas d’erreur', async () => {
    const n = navigateur({ permission: 'default', reponse: 'granted' });
    expect(await activerNotifications(10, true)).toBe('accorde');
    expect(n.subscribe).not.toHaveBeenCalled();
    expect(etat.ecrits.filter(([t]) => t === 'abonnements_push')).toHaveLength(0);
  });

  it('accordé avec clé VAPID : abonne l’appareil et écrit sa ligne abonnements_push', async () => {
    etat.vapid = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U';
    const n = navigateur({ permission: 'default', reponse: 'granted' });
    expect(await activerNotifications(15, true)).toBe('accorde');
    expect(n.subscribe).toHaveBeenCalledOnce();
    const opts = (n.subscribe.mock.calls[0] as unknown as [{ userVisibleOnly: boolean; applicationServerKey: Uint8Array }])[0];
    expect(opts.userVisibleOnly).toBe(true);
    expect(opts.applicationServerKey).toHaveLength(65);
    const [, ligne] = etat.ecrits.find(([t]) => t === 'abonnements_push')!;
    expect(ligne).toMatchObject({ endpoint: sub.endpoint, cle_p256dh: 'P', cle_auth: 'A', appareil: 'iPhone · app installée' });
    expect(stockage.get('luther-life:push-endpoint')).toBe(sub.endpoint);
  });

  it('réutilise l’abonnement existant et la ligne déjà connue', async () => {
    etat.vapid = 'AAAA';
    etat.lignes.abonnements_push = [{ id: 'ancien', endpoint: sub.endpoint, dernier_succes: '2026-10-01T00:00:00Z' }];
    const n = navigateur({ permission: 'granted', existant: true });
    expect(await activerNotifications(10, true)).toBe('accorde');
    expect(n.subscribe).not.toHaveBeenCalled();
    expect(etat.ecrits.find(([t]) => t === 'abonnements_push')![1]).toMatchObject({ id: 'ancien', dernier_succes: '2026-10-01T00:00:00Z' });
  });

  it('échec de l’abonnement : indisponible, sans planter', async () => {
    etat.vapid = 'AAAA';
    navigateur({ permission: 'granted', echec: true });
    expect(await activerNotifications(10, true)).toBe('indisponible');
  });
});

describe('état des notifications et clé VAPID', () => {
  it('décrit l’état de l’appareil', () => {
    navigateur({ permission: 'denied' });
    expect(etatNotifications([]).statut).toBe('bloque');
    navigateur({ permission: 'default' });
    expect(etatNotifications([]).statut).toBe('a_activer');
    navigateur({ permission: 'granted' });
    expect(etatNotifications([{ endpoint: sub.endpoint }]).statut).toBe('autorise');
    stockage.set('luther-life:push-endpoint', sub.endpoint);
    expect(etatNotifications([{ endpoint: sub.endpoint }])).toEqual({ statut: 'actif', detail: 'App installée sur l’écran d’accueil · autorisée' });
    navigateur({ permission: 'granted', sw: false });
    expect(etatNotifications([]).statut).toBe('indisponible');
  });
  it('décode le base64url', () => {
    expect([...base64UrlVersOctets('AQID_w')]).toEqual([1, 2, 3, 255]);
  });
});
