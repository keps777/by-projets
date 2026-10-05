/// <reference lib="webworker" />
// Service worker : pré-cache de l'app (hors ligne), réception des notifications push, ouverture directe depuis une notification.
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope;

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
// Toute navigation (SPA) retombe sur index.html, y compris hors ligne.
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html'), { denylist: [/^\/api\//] }));

self.addEventListener('message', (e) => { if (e.data?.type === 'SKIP_WAITING') void self.skipWaiting(); });
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

interface ChargePush { titre: string; corps?: string; url?: string; tag?: string }

self.addEventListener('push', (e) => {
  let c: ChargePush = { titre: 'Luther Life' };
  try { if (e.data) c = { ...c, ...(e.data.json() as Partial<ChargePush>) }; } catch { if (e.data) c.corps = e.data.text(); }
  e.waitUntil(self.registration.showNotification(c.titre, {
    body: c.corps,
    tag: c.tag,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: c.url ?? '/' }
  }));
});

// Sur iPhone, une notification d'app web n'a pas de boutons : un appui ouvre directement le bloc (/action-rapide?occ=…).
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  // Seule une adresse de l'app est ouverte, quelle que soit la charge reçue.
  const cible = new URL((e.notification.data?.url as string | undefined) ?? '/', self.location.origin);
  const url = (cible.origin === self.location.origin ? cible : new URL('/', self.location.origin)).href;
  e.waitUntil((async () => {
    const fenetres = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const f of fenetres) {
      if (new URL(f.url).origin === self.location.origin) {
        await f.focus();
        f.postMessage({ type: 'NAVIGUER', url });
        return;
      }
    }
    await self.clients.openWindow(url);
  })());
});
