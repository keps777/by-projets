// Largeur PC (≥ 900 px) du verso : un seul rendu dans le DOM (pas de doublons mobile / PC), mis à jour quand la fenêtre change.
const REQUETE = '(min-width: 900px)';
export const pc = $state({ large: typeof matchMedia === 'function' && matchMedia(REQUETE).matches });
if (typeof matchMedia === 'function') matchMedia(REQUETE).addEventListener('change', (e) => { pc.large = e.matches; });
