import { ecrire, lire } from "@/coquille/stockage";

/**
 * Mémoire du tutoriel : il n'est montré qu'une fois, après la première connexion. La clé est propre à l'écran
 * (la liste `CLES` de la coquille n'est pas modifiable depuis ce ticket).
 */
export const CLE_TUTORIEL_VU = "afrimove.tutoriel-vu";

/** Vrai quand le tutoriel a déjà été quitté (« Passer » ou « Suivant » sur le dernier écran). */
export function tutorielVu(): boolean {
  return lire(CLE_TUTORIEL_VU) === "1";
}

export function marquerTutorielVu(): void {
  ecrire(CLE_TUTORIEL_VU, "1");
}
