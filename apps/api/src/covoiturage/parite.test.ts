import * as domaine from "@afrimove/domain";
import { describe, expect, it } from "vitest";
import { chargerConfigCovoiturage } from "./config";
import { FRAIS_PAR_PLACE, devisReservation } from "./regles";

/**
 * L'API ne peut pas importer le domaine à l'exécution (paquet non compilé, API en CommonJS) : elle en
 * recopie les règles. Ces tests les comparent à la source, pour qu'une règle modifiée d'un seul côté
 * fasse échouer la CI.
 */
describe("parité avec @afrimove/domain", () => {
  it("250 F de frais par place", () => {
    expect(FRAIS_PAR_PLACE).toBe(domaine.TARIFS.covoitParPlace);
  });

  it("le devis d'une réservation = devisCovoit du domaine (montants et total)", () => {
    for (const prix of [0, 500, 3500, 4000, 12_345]) {
      for (const places of [1, 2, 3, 4]) {
        const nous = devisReservation(prix, places);
        const eux = domaine.devisCovoit(prix, places);
        expect(nous.total).toBe(eux.total);
        expect(nous.lignes.map((l) => l.montant)).toEqual(eux.lignes.map((l) => l.montant));
        // le libellé de la ligne des places est le même ; le code des frais est celui des paiements
        expect(nous.lignes[0]?.libelle).toBe(eux.lignes[0]?.libelle);
        expect(nous.lignes[0]?.code).toBe(eux.lignes[0]?.code);
      }
    }
  });

  it("la retenue des places dure autant que le blocage d'un siège (15 minutes)", () => {
    expect(chargerConfigCovoiturage({}).retenueMinutes).toBe(domaine.BLOCAGE_SIEGE_MINUTES);
  });
});
