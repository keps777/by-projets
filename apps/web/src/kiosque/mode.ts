import { ecrire, lire, retirer } from "@/coquille/stockage";
import { CLE_KIOSQUE } from "./etat";

export type SourceModeKiosque = "parametre" | "memorise" | "plein-ecran";

export interface ModeKiosque {
  actif: boolean;
  source: SourceModeKiosque | null;
}

interface FenetreMinimale {
  location: { search: string };
  matchMedia?: (requete: string) => { matches: boolean };
}

/**
 * Cet appareil est-il un kiosque ? Trois signaux, dans cet ordre :
 *  - `?kiosque=1` dans l'adresse de démarrage (écrite dans la politique Android Enterprise, voir README) :
 *    le drapeau est mémorisé, `?kiosque=0` l'enlève (maintenance) ;
 *  - le drapeau mémorisé lors d'un lancement précédent ;
 *  - l'affichage en plein écran (`display-mode: fullscreen`), tel que Chrome le donne en kiosque.
 * Le navigateur ne peut pas savoir si l'appareil est géré par Android Enterprise : ce n'est qu'un indice
 * d'affichage. La contrainte réelle (impossible de sortir de l'application) vient de la politique de l'appareil.
 */
export function detecterModeKiosque(fenetre: FenetreMinimale = window): ModeKiosque {
  const parametre = new URLSearchParams(fenetre.location.search).get("kiosque");
  if (parametre === "1") {
    ecrire(CLE_KIOSQUE, "1");
    return { actif: true, source: "parametre" };
  }
  if (parametre === "0") {
    retirer(CLE_KIOSQUE);
    return { actif: false, source: null };
  }
  if (lire(CLE_KIOSQUE) === "1") return { actif: true, source: "memorise" };
  try {
    if (fenetre.matchMedia?.("(display-mode: fullscreen)").matches) {
      return { actif: true, source: "plein-ecran" };
    }
  } catch {
    // matchMedia indisponible : pas de signal.
  }
  return { actif: false, source: null };
}
