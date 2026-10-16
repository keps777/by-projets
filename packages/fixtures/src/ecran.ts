import type { IsoDouala } from "@afrimove/domain";
import { HORLOGE, heure } from "./horloge";
import { MONDE } from "./monde";
import { PLANCHES } from "./planches";
import type { NomPlanche } from "./planches";
import { problemes } from "./validation";
import type { Entites } from "./validation";

/**
 * Un scénario de planche : exactement les valeurs que la maquette affiche, au-dessus du monde commun.
 *
 * - `donnees` : ce que l'écran affiche, sous une forme exploitable (montants en nombres entiers de
 *   FCFA, heures et libellés en chaînes telles qu'écrites sur la planche). Chaque chaîne et chaque
 *   nombre doit se retrouver sur la planche (test), et chaque nombre de la planche doit se retrouver
 *   dans `donnees` ou `copie` (test), sauf ceux que `ignorer` écarte avec une raison.
 * - `copie` : textes fixes de la planche qui portent des chiffres ou des noms (phrases explicatives).
 * - `entites` : les objets du domaine derrière l'écran (billets, départs, colis…), validés contre le
 *   domaine au chargement du module.
 */
export interface Ecran<D> {
  readonly planche: NomPlanche;
  readonly titre: string;
  readonly route: string | null;
  readonly tickets: readonly string[];
  /** Horloge figée du monde : mardi 5 janvier 2027 07:38, Africa/Douala. */
  readonly horloge: IsoDouala;
  /** L'heure qu'affiche la planche (07:38 par défaut), le même jour. */
  readonly maintenant: IsoDouala;
  readonly donnees: D;
  readonly copie: Readonly<Record<string, string>>;
  readonly entites: Entites;
  /** Jetons numériques de la planche volontairement non modélisés (raison en commentaire). */
  readonly ignorer: readonly string[];
}

export interface DefinitionEcran<D> {
  planche: NomPlanche;
  /** « 14:05 » : heure affichée par la planche quand ce n'est pas 07:38. */
  maintenant?: string;
  donnees: D;
  copie?: Record<string, string>;
  entites?: Entites;
  ignorer?: readonly string[];
}

export class FixtureInvalide extends Error {
  constructor(
    readonly planche: string,
    readonly problemes: readonly string[],
  ) {
    super(`Fixture « ${planche} » invalide :\n- ${problemes.join("\n- ")}`);
    this.name = "FixtureInvalide";
  }
}

export function ecran<D>(def: DefinitionEcran<D>): Ecran<D> {
  const info = PLANCHES[def.planche];
  const entites = def.entites ?? {};
  const erreurs = problemes(entites, MONDE);
  if (erreurs.length > 0) throw new FixtureInvalide(def.planche, erreurs);
  return {
    planche: def.planche,
    titre: info.titre,
    route: info.route,
    tickets: info.tickets,
    horloge: HORLOGE,
    maintenant: def.maintenant ? heure(def.maintenant) : HORLOGE,
    donnees: def.donnees,
    copie: def.copie ?? {},
    entites,
    ignorer: def.ignorer ?? [],
  };
}
