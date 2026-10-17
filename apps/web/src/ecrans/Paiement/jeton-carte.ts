import { useCallback } from "react";
import { useParametres } from "@/coquille/parametres";

/** Le jeton de la carte ne peut pas être produit ici (pas de champ de saisie hébergé par le prestataire). */
export class JetonCarteIndisponible extends Error {
  constructor() {
    super("Le champ de saisie hébergé du prestataire de paiement n'est pas branché");
    this.name = "JetonCarteIndisponible";
  }
}

/** Jeton de démonstration : même forme qu'un vrai jeton, jamais un numéro de carte. */
export const JETON_CARTE_DEMO = "jeton-carte-demo";

/**
 * Obtient le jeton de la carte. Le numéro de carte ne passe jamais par AfriMove : il est saisi dans un champ
 * hébergé par le prestataire de paiement, qui rend un jeton (`jetonCarte`). Ce prestataire n'est pas encore choisi,
 * donc seul le mode démonstration (mock) fournit un jeton ; ailleurs la fonction refuse, et l'écran le dit au
 * voyageur au lieu de fabriquer un faux jeton. Le jour où le prestataire est branché, seule cette fonction change.
 */
export function useObtenirJetonCarte(): () => Promise<string> {
  const { demo } = useParametres();
  return useCallback(async () => {
    if (demo) return JETON_CARTE_DEMO;
    throw new JetonCarteIndisponible();
  }, [demo]);
}
