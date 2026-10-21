/** Ce qui s'est passé quand on a voulu partager le lien de paiement. */
export type IssuePartage = "partage" | "copie" | "annule" | "aucun";

export interface LienAPartager {
  titre: string;
  texte: string;
  url: string;
}

/**
 * Partage le lien de paiement : la feuille de partage du téléphone (WhatsApp, SMS…) si elle existe, sinon la
 * copie dans le presse-papiers. « annule » : le voyageur a fermé la feuille de partage, on ne fait rien de plus.
 */
export async function partagerLien(
  { titre, texte, url }: LienAPartager,
  nav: Partial<Pick<Navigator, "share" | "clipboard">> | undefined = globalThis.navigator,
): Promise<IssuePartage> {
  if (nav && typeof nav.share === "function") {
    try {
      await nav.share({ title: titre, text: texte, url });
      return "partage";
    } catch (erreur) {
      if (erreur instanceof DOMException && erreur.name === "AbortError") return "annule";
      // Partage impossible (autre erreur) : on retombe sur la copie.
    }
  }
  if (nav?.clipboard && typeof nav.clipboard.writeText === "function") {
    try {
      await nav.clipboard.writeText(`${texte} ${url}`);
      return "copie";
    } catch {
      return "aucun";
    }
  }
  return "aucun";
}
