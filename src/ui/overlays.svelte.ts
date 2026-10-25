/** Fenêtres globales ouvertes depuis n'importe quelle page (le bouton central du dock ouvre l'orbe SUR la page courante). */
export const overlays = $state({ orbe: false });
export const ouvrirOrbe = () => (overlays.orbe = true);
export const fermerOrbe = () => (overlays.orbe = false);
