import { describe, expect, it } from "vitest";
import { ACCUEIL_ESPACE } from "@/coquille/roles";
import { actionRetour, RACINES } from "./retour";

describe("actionRetour (bouton retour d'Android)", () => {
  it("quitte l'application sur l'accueil de chaque espace, même avec un historique", () => {
    for (const accueil of Object.values(ACCUEIL_ESPACE)) {
      expect(actionRetour(true, accueil)).toBe("quitter");
      expect(actionRetour(false, accueil)).toBe("quitter");
    }
  });

  it("quitte sur l'entrée de l'application et ignore la barre finale", () => {
    expect(actionRetour(true, "/")).toBe("quitter");
    expect(actionRetour(true, "/bienvenue")).toBe("quitter");
    expect(actionRetour(true, "/voyager/")).toBe("quitter");
  });

  it("recule d'un écran ailleurs, et quitte quand il n'y a plus d'écran précédent", () => {
    expect(actionRetour(true, "/depart/12")).toBe("reculer");
    expect(actionRetour(true, "/connexion")).toBe("reculer");
    expect(actionRetour(false, "/depart/12")).toBe("quitter");
  });

  it("une racine de plus déclarée est respectée", () => {
    expect(actionRetour(true, "/depart/12", [...RACINES, "/depart/12"])).toBe("quitter");
  });
});
