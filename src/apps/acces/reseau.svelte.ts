// État réseau réactif partagé par les écrans d'accès (navigator.onLine + évènements online/offline).
export const reseau = $state({ enLigne: typeof navigator === 'undefined' ? true : navigator.onLine });
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => (reseau.enLigne = true));
  window.addEventListener('offline', () => (reseau.enLigne = false));
}
