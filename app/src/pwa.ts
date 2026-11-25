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
      // Mise à jour automatique : au retour au premier plan, une version déjà téléchargée prend la main et la page se recharge (sans attendre de fermer l'app).
      const activer = () => { if (reg.waiting && navigator.serviceWorker.controller) reg.waiting.postMessage({ type: 'SKIP_WAITING' }); };
      let recharge = false;
      const avait = !!navigator.serviceWorker.controller; // première installation : pas de rechargement
      navigator.serviceWorker.addEventListener('controllerchange', () => { if (avait && !recharge) { recharge = true; location.reload(); } });
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { activer(); void reg.update().then(activer); } });
      reg.addEventListener('updatefound', () => reg.installing?.addEventListener('statechange', () => { if (document.visibilityState === 'visible' && reg.installing?.state === 'installed') activer(); }));
      activer();
    }).catch(() => { /* hors ligne ou navigation privée : l'app fonctionne sans */ });
  });
}
