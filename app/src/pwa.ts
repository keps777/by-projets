// Enregistrement du service worker (production seulement) et navigation demandée par un clic sur une notification.
import { routeur } from './routeur.svelte.ts';

export function demarrerPwa(): void {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data?.type !== 'NAVIGUER' || typeof e.data.url !== 'string') return;
    const u = new URL(e.data.url, location.origin);
    if (u.origin === location.origin) routeur.aller(u.pathname + u.search + u.hash);
  });
  if (!import.meta.env.PROD) return;
  addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').then((reg) => {
      // Une nouvelle version prend la main au prochain lancement ; on vérifie les mises à jour à chaque retour au premier plan.
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void reg.update(); });
    }).catch(() => { /* hors ligne ou navigation privée : l'app fonctionne sans */ });
  });
}
