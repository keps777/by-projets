// État de la connexion et vue forcée (`?etat=chargement|erreur|horsligne`, outil de démonstration et de test) pour les écrans « Drops et agences » et « Journal d'audit ».
const force = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('etat') : null;
export const reseau = $state({ enLigne: force !== 'horsligne' && (typeof navigator === 'undefined' ? true : navigator.onLine) });
if (typeof window !== 'undefined' && force !== 'horsligne') {
  window.addEventListener('online', () => (reseau.enLigne = true));
  window.addEventListener('offline', () => (reseau.enLigne = false));
}
export const etatForce = (): string | null => force;
