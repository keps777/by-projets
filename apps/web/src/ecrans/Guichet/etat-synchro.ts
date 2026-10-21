import { useEffect, useState } from "react";
import { useEtatMoteur } from "@/hors-ligne";

export type EtatPastille = "sync" | "horsLigne";

function enLigne(): boolean {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

/**
 * État de la pastille « SYNC » / « HORS LIGNE ».
 *
 * La source de vérité est l'état du moteur de synchronisation de l'appareil (`@afrimove/sync`, mode HTTP) : HORS
 * LIGNE dès que le réseau est coupé **ou** que le serveur ne répond plus, SYNC sinon, et l'indicateur suit le moteur
 * en direct (sans attendre qu'un écran se recharge). Sans moteur (maquettes en mode mock, appareil non installé), on
 * garde la règle d'avant : un navigateur qui se déclare hors ligne force HORS LIGNE, sinon on suit `synchro.etat` de
 * l'accueil.
 */
export function useEtatPastille(
  synchro: "sync" | "en_attente" | "hors_ligne" | undefined,
): EtatPastille {
  const reel = useEtatMoteur();
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
  if (reel) return reel.enLigne ? "sync" : "horsLigne";
  return !connecte || synchro === "hors_ligne" ? "horsLigne" : "sync";
}
