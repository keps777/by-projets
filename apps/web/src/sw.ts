/**
 * Service worker Workbox d'AfriMove (construit par vite-plugin-pwa, stratégie injectManifest).
 * - coquille (HTML, JS, CSS), polices et icônes : préchargées à l'installation, donc l'app s'ouvre sans réseau ;
 * - toute navigation retombe sur `index.html` (application à page unique), sauf les appels d'API ;
 * - polices et images hors liste : cache d'abord ;
 * - une nouvelle version attend (bandeau « nouvelle version prête ») jusqu'au message SKIP_WAITING.
 */
import { clientsClaim } from "workbox-core";
import { ExpirationPlugin } from "workbox-expiration";
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { CacheFirst } from "workbox-strategies";

declare let self: ServiceWorkerGlobalScope & {
  // Liste des fichiers à précharger : vite-plugin-pwa remplace `self.__WB_MANIFEST` au build.
  __WB_MANIFEST: Array<string | { url: string; revision: string | null }>;
};

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

registerRoute(
  new NavigationRoute(createHandlerBoundToURL("/index.html"), {
    denylist: [/^\/api\//, /^\/healthz$/, /\.[a-z0-9]+$/i],
  }),
);

registerRoute(
  ({ request }) => request.destination === "font" || request.destination === "image",
  new CacheFirst({
    cacheName: "afrimove-polices-icones",
    plugins: [new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 365 })],
  }),
);

self.addEventListener("message", (evenement) => {
  if ((evenement.data as { type?: string } | undefined)?.type === "SKIP_WAITING") {
    void self.skipWaiting();
  }
});

clientsClaim();
