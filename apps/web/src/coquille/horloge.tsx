import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

/**
 * Horloge injectable : aucun écran n'appelle `new Date()` directement, tous passent par `useHorloge()` /
 * `useMaintenant()`. Les tests et le banc de fidélité figent l'heure (`?horloge=2027-01-05T07:38:00+01:00`),
 * ce qui rend les écrans (« 07:38 », « dans 22 min ») reproductibles.
 */
export interface Horloge {
  maintenant(): Date;
}

export const horlogeSysteme: Horloge = { maintenant: () => new Date() };

/** Horloge arrêtée à un instant donné. */
export function horlogeFigee(instant: Date | string | number): Horloge {
  const fixe = new Date(instant).getTime();
  return { maintenant: () => new Date(fixe) };
}

/**
 * Horloge décrite par le paramètre `horloge` : une date ISO donne une horloge figée, absence ou valeur
 * illisible donne l'horloge du système.
 */
export function creerHorloge(valeur: string | null | undefined): Horloge {
  if (!valeur) return horlogeSysteme;
  const instant = new Date(valeur);
  return Number.isNaN(instant.getTime()) ? horlogeSysteme : horlogeFigee(instant);
}

const HorlogeContexte = createContext<Horloge>(horlogeSysteme);

export function HorlogeProvider({ horloge, children }: { horloge: Horloge; children: ReactNode }) {
  return <HorlogeContexte.Provider value={horloge}>{children}</HorlogeContexte.Provider>;
}

export function useHorloge(): Horloge {
  return useContext(HorlogeContexte);
}

/**
 * L'instant courant selon l'horloge injectée, rafraîchi toutes les `periodeMs` (30 s par défaut). Avec une
 * horloge figée la valeur ne change pas.
 */
export function useMaintenant(periodeMs = 30_000): Date {
  const horloge = useHorloge();
  const [instant, setInstant] = useState(() => horloge.maintenant());
  useEffect(() => {
    setInstant(horloge.maintenant());
    const minuterie = setInterval(() => setInstant(horloge.maintenant()), periodeMs);
    return () => clearInterval(minuterie);
  }, [horloge, periodeMs]);
  return instant;
}
