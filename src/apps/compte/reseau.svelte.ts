// État de connexion réactif (évènements `online` / `offline`) pour les écrans du compte. `?etat=horsligne` force l'état pour les tests et la démonstration.
const force = typeof location !== 'undefined' && new URLSearchParams(location.search).get('etat') === 'horsligne';
export const reseau = $state({ enLigne: !force && (typeof navigator === 'undefined' ? true : navigator.onLine) });
if (typeof window !== 'undefined' && !force) {
  window.addEventListener('online', () => (reseau.enLigne = true));
  window.addEventListener('offline', () => (reseau.enLigne = false));
}
/** Vue forcée par `?etat=` (chargement, erreur, horsligne, echec) : outil de démonstration et de test, jamais affiché. */
export const etatForce = (): string | null => (typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('etat'));
