/**
 * Durcissement léger de la page en mode kiosque : pas de menu contextuel (appui long), retour en plein
 * écran au premier toucher si Chrome en est sorti. Ce n'est qu'un confort : empêcher réellement de quitter
 * l'application est le travail de la politique de l'appareil (mode kiosque Android Enterprise, README).
 * Renvoie la fonction qui défait tout.
 */
export function appliquerVerrouKiosque(doc: Document = document): () => void {
  const bloquer = (e: Event) => e.preventDefault();
  const pleinEcran = () => {
    if (doc.fullscreenElement || typeof doc.documentElement.requestFullscreen !== "function")
      return;
    // Exige un geste de l'utilisateur, d'où l'appel depuis un toucher ; un refus n'a aucune conséquence.
    void doc.documentElement.requestFullscreen().catch(() => undefined);
  };
  doc.addEventListener("contextmenu", bloquer);
  doc.addEventListener("pointerdown", pleinEcran);
  return () => {
    doc.removeEventListener("contextmenu", bloquer);
    doc.removeEventListener("pointerdown", pleinEcran);
  };
}
