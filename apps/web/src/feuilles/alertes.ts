import { useCallback, useState } from "react";
import { ecrire, lire } from "@/coquille/stockage";

/**
 * Les alertes que ce téléphone affiche. Aucun contrat d'API ne porte de réglage d'alerte : le choix est gardé sur
 * l'appareil (localStorage) en attendant. Les deux sont actives tant que la personne n'a rien changé.
 */
export interface Alertes {
  /** Départ et arrivée du bus de mon billet. */
  voyage: boolean;
  /** Avancement de mes colis. */
  colis: boolean;
}

export const CLE_ALERTES = "afrimove.reglages.alertes";
export const ALERTES_PAR_DEFAUT: Alertes = { voyage: true, colis: true };

export function lireAlertes(): Alertes {
  const brut = lire(CLE_ALERTES);
  if (brut === null) return ALERTES_PAR_DEFAUT;
  try {
    const valeur: unknown = JSON.parse(brut);
    const v = typeof valeur === "object" && valeur !== null ? (valeur as Partial<Alertes>) : {};
    return {
      voyage: typeof v.voyage === "boolean" ? v.voyage : ALERTES_PAR_DEFAUT.voyage,
      colis: typeof v.colis === "boolean" ? v.colis : ALERTES_PAR_DEFAUT.colis,
    };
  } catch {
    return ALERTES_PAR_DEFAUT;
  }
}

/** Les alertes de l'appareil et la façon d'en changer une (le choix est mémorisé aussitôt). */
export function useAlertes(): [Alertes, (alerte: keyof Alertes, active: boolean) => void] {
  const [alertes, setAlertes] = useState<Alertes>(lireAlertes);
  const definir = useCallback((alerte: keyof Alertes, active: boolean) => {
    setAlertes((courantes) => {
      const suivantes = { ...courantes, [alerte]: active };
      ecrire(CLE_ALERTES, JSON.stringify(suivantes));
      return suivantes;
    });
  }, []);
  return [alertes, definir];
}
