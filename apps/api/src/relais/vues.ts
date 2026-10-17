import type { ColisStocke } from "../colis/modele";
import { limiteRetraitColis } from "../colis/regles";
import { vuePartenaire } from "../colis/vues";
import type { PointRelaisStocke } from "./modele";
import { lireTailleMaxKg } from "./regles";

/**
 * Les vues partagées des points relais. Règle de sécurité : tout colis montré à un relais, à un
 * livreur ou au guichet passe par `vueColisPartenaire`, qui ne lit que des champs choisis un par un
 * (jamais le code de retrait, son haché ni son sel).
 */

/** `SchemaColisPartenaire` : ce que voit un partenaire d'un colis. */
export function vueColisPartenaire(colis: ColisStocke) {
  return vuePartenaire(
    colis,
    colis.disponibleDepuis ? limiteRetraitColis(colis.disponibleDepuis) : null,
  );
}

/** « petit colis seulement » quand le relais ne prend que des petits colis et ne dit rien d'autre. */
export function particulariteRelais(relais: PointRelaisStocke): string | null {
  if (relais.particularite !== null) return relais.particularite;
  const kg = lireTailleMaxKg(relais.tailleMax);
  return kg !== null && kg <= 3 ? "petit colis seulement" : null;
}
