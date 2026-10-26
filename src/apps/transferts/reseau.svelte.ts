// État de connexion réactif (évènements `online` / `offline`) : un transfert exige une connexion, rien n'est modifié hors ligne.
export const reseau = $state({ enLigne: typeof navigator === 'undefined' ? true : navigator.onLine });
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => (reseau.enLigne = true));
  window.addEventListener('offline', () => (reseau.enLigne = false));
}
