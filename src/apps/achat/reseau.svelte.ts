// État de connexion réactif (évènements `online` / `offline`) : un paiement ou une transmission au voyageur demande le réseau.
export const reseau = $state({ enLigne: typeof navigator === 'undefined' ? true : navigator.onLine });
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => (reseau.enLigne = true));
  window.addEventListener('offline', () => (reseau.enLigne = false));
}
