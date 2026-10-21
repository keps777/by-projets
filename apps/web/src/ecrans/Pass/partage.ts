/**
 * Partage du billet par WhatsApp : l'adresse `wa.me` ouvre WhatsApp (application ou web) sur le choix du
 * destinataire, avec le message déjà écrit. Le message ne contient jamais le QR ni le code à 4 chiffres : celui
 * qui le reçoit voit le trajet et un lien vers le billet, pas de quoi embarquer à la place du voyageur.
 */
export function adresseWhatsApp(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

/** Ouvre WhatsApp dans un nouvel onglet, sans donner la main à la page ouverte (`noopener`). */
export function ouvrirWhatsApp(message: string): void {
  globalThis.open(adresseWhatsApp(message), "_blank", "noopener,noreferrer");
}
