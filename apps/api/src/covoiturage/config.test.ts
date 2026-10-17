import { describe, expect, it } from "vitest";
import {
  COMPAGNIE_SEQUESTRE_DEFAUT,
  ConfigCovoiturageInvalide,
  chargerConfigCovoiturage,
} from "./config";

describe("configuration du covoiturage", () => {
  it("valeurs par défaut : paiement 2 h après l'arrivée, annulation gratuite 2 h avant", () => {
    const c = chargerConfigCovoiturage({});
    expect(c).toMatchObject({
      liberationApresArriveeMin: 120,
      annulationGratuiteAvantMin: 120,
      retenueTardivePct: 50,
      retenueMinutes: 15,
      compagnieSequestreId: COMPAGNIE_SEQUESTRE_DEFAUT,
      compteSequestre: null,
      abonnerPaiements: true,
      production: false,
    });
  });

  it("lit les variables COVOITURAGE_*", () => {
    const c = chargerConfigCovoiturage(
      {
        COVOITURAGE_LIBERATION_APRES_MIN: "60",
        COVOITURAGE_COMPTE_SEQUESTRE: "sequestre-covoit",
        COVOITURAGE_ABONNER_PAIEMENTS: "non",
        COVOITURAGE_BALAYAGE_MS: "0",
      },
      true,
    );
    expect(c).toMatchObject({
      liberationApresArriveeMin: 60,
      compteSequestre: "sequestre-covoit",
      abonnerPaiements: false,
      balayageMs: 0,
      production: true,
    });
  });

  it("signale toutes les erreurs d'un coup", () => {
    let erreur: unknown;
    try {
      chargerConfigCovoiturage({
        COVOITURAGE_RETENUE_TARDIVE_PCT: "150",
        COVOITURAGE_LIBERATION_APRES_MIN: "abc",
        COVOITURAGE_COMPAGNIE_ID: "pas-un-uuid",
        COVOITURAGE_ABONNER_PAIEMENTS: "peut-être",
        COVOITURAGE_COMPTE_SEQUESTRE: "compte avec des espaces",
      });
    } catch (e) {
      erreur = e;
    }
    expect(erreur).toBeInstanceOf(ConfigCovoiturageInvalide);
    expect((erreur as ConfigCovoiturageInvalide).erreurs).toHaveLength(5);
  });
});
