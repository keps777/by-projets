// État de connexion de la console (navigator.onLine + évènements online/offline). `?etat=horsligne` le force pour les tests et la démonstration.
export const reseau = $state({ enLigne: typeof navigator === 'undefined' ? true : navigator.onLine });
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => (reseau.enLigne = true));
  window.addEventListener('offline', () => (reseau.enLigne = false));
}
