import { useEffect, useState } from "react";

export type EtatPastille = "sync" | "horsLigne";

function enLigne(): boolean {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

/**
 * État de la pastille « SYNC » / « HORS LIGNE ».
 *
 * La source de vérité est l'état du moteur de synchronisation (AM-160, `synchro.etat` de l'accueil). Ce moteur
 * n'est pas encore livré : en attendant, un navigateur qui se déclare hors ligne force HORS LIGNE, sinon on suit
 * `synchro.etat`. Quand AM-160 existera, ce hook est le seul point de branchement à remplacer.
 */
export function useEtatPastille(
  synchro: "sync" | "en_attente" | "hors_ligne" | undefined,
): EtatPastille {
  const [connecte, setConnecte] = useState(enLigne);
  useEffect(() => {
    const maj = () => setConnecte(enLigne());
    window.addEventListener("online", maj);
    window.addEventListener("offline", maj);
    maj();
    return () => {
      window.removeEventListener("online", maj);
      window.removeEventListener("offline", maj);
    };
  }, []);
  return !connecte || synchro === "hors_ligne" ? "horsLigne" : "sync";
}
