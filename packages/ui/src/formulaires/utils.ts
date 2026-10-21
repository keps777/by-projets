import { useState } from "react";

/** Assemble des noms de classes en ignorant les valeurs vides. */
export function classes(...noms: Array<string | false | null | undefined>): string {
  return noms.filter(Boolean).join(" ");
}

/**
 * Valeur pilotée par l'appelant (`value`) ou gardée en interne (`defaultValue`).
 * Le setter ne modifie l'état interne que si le composant n'est pas piloté.
 */
export function useControlled<T>(
  value: T | undefined,
  defaultValue: T,
): readonly [T, (suivante: T) => void] {
  const [interne, setInterne] = useState<T>(defaultValue);
  const pilote = value !== undefined;
  return [
    pilote ? value : interne,
    (suivante: T) => {
      if (!pilote) setInterne(suivante);
    },
  ] as const;
}

/** « 694500 » devient « 694 500 » (espace simple, comme dans les planches). */
export function formaterMontant(montant: number): string {
  const signe = montant < 0 ? "− " : "";
  const chiffres = String(Math.abs(Math.trunc(montant)));
  return signe + chiffres.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** Extrait un entier positif d'une saisie libre (espaces, lettres ignorés). */
export function lireEntier(saisie: string): number {
  const chiffres = saisie.replace(/\D/g, "");
  return chiffres === "" ? 0 : Number.parseInt(chiffres, 10);
}
