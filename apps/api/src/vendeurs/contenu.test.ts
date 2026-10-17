import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DETAIL_PAIEMENT,
  LIBELLE_COMMISSION_DEFAUT,
  REGLE_VENDEUR,
  TITRE_CLIENTS,
} from "./contenu";

/**
 * Les textes de l'écran viennent de la planche « Vendeur ». L'API n'a pas `@afrimove/fixtures` pour
 * dépendance : on lit le fichier du fixture et on vérifie que chaque texte y figure à l'identique.
 * Si la maquette change, ce test échoue et dit quel texte a bougé.
 */
const fixture = readFileSync(
  join(__dirname, "../../../../packages/fixtures/src/ecrans/Vendeur.ts"),
  "utf8",
);

describe("textes de la planche Vendeur", () => {
  it.each([
    ["la règle du vendeur", REGLE_VENDEUR],
    ["le détail du paiement", DETAIL_PAIEMENT],
    ["le titre de la liste de clients", TITRE_CLIENTS],
    ["le libellé de commission par défaut", LIBELLE_COMMISSION_DEFAUT],
  ])("%s est celui de la maquette", (_nom, texte) => {
    expect(texte.length).toBeGreaterThan(0);
    expect(fixture).toContain(`"${texte}"`);
  });

  it("dit que le vendeur ne garde jamais d'argent et que la commission arrive le lundi", () => {
    expect(REGLE_VENDEUR).toContain("Tu ne gardes jamais d'argent");
    expect(REGLE_VENDEUR).toContain("le lundi");
  });
});
