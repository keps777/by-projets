import { Workbox } from "workbox-window";
import { signalerMiseAJourPrete } from "./mise-a-jour";

/**
 * Enregistre le service worker (src/sw.ts, construit par vite-plugin-pwa en /sw.js) et branche le bandeau
 * « nouvelle version prête » : quand une nouvelle version est installée et attend, l'appui sur « Mettre à jour »
 * lui dit de prendre la main (`SKIP_WAITING`) puis recharge la page. Sans service worker (développement, navigateur
 * trop ancien) il ne se passe rien.
 */
export function enregistrerServiceWorker(
  options: { url?: string; actif?: boolean; recharger?: () => void } = {},
): Workbox | null {
  const { url = "/sw.js", actif = import.meta.env.PROD, recharger } = options;
  if (!actif || typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;

  const workbox = new Workbox(url);
  const rechargerLaPage = recharger ?? (() => window.location.reload());

  workbox.addEventListener("waiting", () => {
    signalerMiseAJourPrete(() => {
      workbox.addEventListener("controlling", rechargerLaPage);
      workbox.messageSkipWaiting();
    });
  });

  void workbox.register().catch(() => {
    // Pas de service worker : l'application fonctionne, sans mode hors ligne.
  });
  return workbox;
}
