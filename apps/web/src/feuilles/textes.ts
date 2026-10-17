import type { i18n as I18n } from "i18next";
import { useTranslation } from "react-i18next";
import en from "./i18n.en.json";
import fr from "./i18n.fr.json";
import pcm from "./i18n.pcm.json";

/**
 * Espace de noms des feuilles. Les textes des écrans sont chargés par `src/i18n` depuis `src/ecrans/<Planche>/` ;
 * les feuilles n'appartiennent à aucune planche, elles déclarent donc leur espace elles-mêmes, une seule fois par
 * instance i18next, au premier rendu d'une feuille.
 */
export const ESPACE_FEUILLES = "Feuilles";

const BLOCS = { fr, en, pcm } as const;

/** Ajoute les textes des feuilles à l'instance (sans effet s'ils y sont déjà). */
export function enregistrerTextesFeuilles(instance: I18n): void {
  for (const [langue, contenu] of Object.entries(BLOCS)) {
    if (!instance.hasResourceBundle(langue, ESPACE_FEUILLES)) {
      instance.addResourceBundle(langue, ESPACE_FEUILLES, contenu, true, false);
    }
  }
}

/** `useTranslation("Feuilles")` avec les textes des feuilles garantis présents. */
export function useTextesFeuilles() {
  const { i18n } = useTranslation();
  enregistrerTextesFeuilles(i18n);
  return useTranslation(ESPACE_FEUILLES);
}
