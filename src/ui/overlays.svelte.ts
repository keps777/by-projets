/** Fenêtres globales ouvertes depuis n'importe quelle page : elles s'affichent SUR la page courante (orbe du dock, notifications de la cloche). */
export const overlays = $state({ orbe: false, notifications: false });
export const ouvrirOrbe = () => (overlays.orbe = true);
export const fermerOrbe = () => (overlays.orbe = false);
export const ouvrirNotifications = () => (overlays.notifications = true);
export const fermerNotifications = () => (overlays.notifications = false);
