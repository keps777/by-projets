// État de connexion réactif (évènements `online` / `offline`) : les écrans de la recherche préviennent quand les prix peuvent être périmés.
export const reseau = $state({ enLigne: typeof navigator === 'undefined' ? true : navigator.onLine });
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => (reseau.enLigne = true));
  window.addEventListener('offline', () => (reseau.enLigne = false));
}
