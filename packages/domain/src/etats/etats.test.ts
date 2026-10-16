import { describe, expect, it } from "vitest";
import type { DefinitionMachine, Historise } from "../machine";
import {
  actionsPossibles,
  appliquerAction,
  estTerminal,
  etatSuivant,
  peutAppliquer,
  TransitionInterdite,
} from "../machine";
import { ACTIONS_BILLET, ETATS_BILLET, MACHINE_BILLET } from "./billet";
import { ACTIONS_COLIS, ETATS_COLIS, MACHINE_COLIS } from "./colis";
import { ACTIONS_DEPART, ETATS_DEPART, MACHINE_DEPART } from "./depart";
import { ACTIONS_SESSION, ETATS_SESSION, MACHINE_SESSION } from "./session";

/**
 * Pour chaque machine : la liste des transitions autorisées est réécrite ici à la main, à partir du
 * document projet, puis on vérifie CHAQUE couple (état, action) du produit cartésien : autorisé s'il
 * est dans la liste, sinon `TransitionInterdite`.
 */
type Triplet<E extends string, A extends string> = readonly [E, A, E];

function verifierExhaustivement<E extends string, A extends string>(
  machine: DefinitionMachine<E, A>,
  autorisees: readonly Triplet<E, A>[],
): void {
  const attendu = new Map(autorisees.map(([de, action, vers]) => [`${de}|${action}`, vers]));
  let interdites = 0;
  for (const etat of machine.etats) {
    for (const action of machine.actions) {
      const vers = attendu.get(`${etat}|${action}`);
      if (vers === undefined) {
        interdites++;
        expect(peutAppliquer(machine, etat, action), `${etat} / ${action}`).toBe(false);
        expect(() => etatSuivant(machine, etat, action), `${etat} / ${action}`).toThrow(
          TransitionInterdite,
        );
      } else {
        expect(etatSuivant(machine, etat, action), `${etat} / ${action}`).toBe(vers);
      }
    }
  }
  expect(interdites).toBe(machine.etats.length * machine.actions.length - autorisees.length);
}

describe("machine d'états du billet", () => {
  it("autorise exactement les transitions du document projet et refuse toutes les autres", () => {
    verifierExhaustivement(MACHINE_BILLET, [
      ["reserve", "payer", "paye"],
      ["reserve", "annuler", "annule"],
      ["paye", "embarquer", "embarque"],
      ["paye", "annuler", "annule"],
      ["paye", "marquer_non_presente", "non_presente"],
      ["paye", "reporter", "reporte"],
      ["embarque", "terminer", "voyage"],
      ["non_presente", "reporter", "reporte"],
      ["reporte", "reprogrammer", "paye"],
      ["reporte", "annuler", "annule"],
    ]);
  });

  it("ne revient jamais en arrière après « embarqué »", () => {
    for (const action of ACTIONS_BILLET) {
      if (action === "terminer") continue;
      expect(peutAppliquer(MACHINE_BILLET, "embarque", action)).toBe(false);
    }
    expect(() => etatSuivant(MACHINE_BILLET, "embarque", "annuler")).toThrow(TransitionInterdite);
    expect(() => etatSuivant(MACHINE_BILLET, "embarque", "reporter")).toThrow(TransitionInterdite);
    expect(() => etatSuivant(MACHINE_BILLET, "embarque", "payer")).toThrow(TransitionInterdite);
  });

  it("ne rembarque pas un billet voyagé ou annulé", () => {
    expect(estTerminal(MACHINE_BILLET, "voyage")).toBe(true);
    expect(estTerminal(MACHINE_BILLET, "annule")).toBe(true);
    expect(() => etatSuivant(MACHINE_BILLET, "annule", "payer")).toThrow(TransitionInterdite);
    expect(() => etatSuivant(MACHINE_BILLET, "voyage", "embarquer")).toThrow(TransitionInterdite);
  });

  it("n'embarque pas un billet seulement réservé (non payé)", () => {
    expect(() => etatSuivant(MACHINE_BILLET, "reserve", "embarquer")).toThrow(TransitionInterdite);
  });

  it("couvre tous les états du document : réservé, payé, embarqué, voyagé, annulé, non présenté, reporté", () => {
    expect([...ETATS_BILLET].sort()).toEqual(
      ["annule", "embarque", "non_presente", "paye", "reporte", "reserve", "voyage"].sort(),
    );
  });
});

describe("machine d'états du colis", () => {
  it("autorise exactement les transitions du document projet et refuse toutes les autres", () => {
    verifierExhaustivement(MACHINE_COLIS, [
      ["enregistre", "charger", "charge"],
      ["enregistre", "ouvrir_litige", "litige"],
      ["charge", "expedier", "en_route"],
      ["charge", "declarer_perdu", "perdu"],
      ["charge", "ouvrir_litige", "litige"],
      ["en_route", "decharger", "decharge"],
      ["en_route", "declarer_perdu", "perdu"],
      ["en_route", "ouvrir_litige", "litige"],
      ["decharge", "rendre_disponible", "disponible"],
      ["decharge", "declarer_perdu", "perdu"],
      ["decharge", "ouvrir_litige", "litige"],
      ["disponible", "remettre", "remis"],
      ["disponible", "envoyer_en_relais", "en_relais"],
      ["disponible", "mettre_en_livraison", "en_livraison"],
      ["disponible", "marquer_non_retire", "non_retire"],
      ["disponible", "declarer_perdu", "perdu"],
      ["disponible", "ouvrir_litige", "litige"],
      ["en_relais", "remettre", "remis"],
      ["en_relais", "marquer_non_retire", "non_retire"],
      ["en_relais", "declarer_perdu", "perdu"],
      ["en_relais", "ouvrir_litige", "litige"],
      ["en_livraison", "livrer", "livre"],
      ["en_livraison", "envoyer_en_relais", "en_relais"],
      ["en_livraison", "rendre_disponible", "disponible"],
      ["en_livraison", "declarer_perdu", "perdu"],
      ["en_livraison", "ouvrir_litige", "litige"],
      ["non_retire", "retourner", "retourne"],
      ["non_retire", "remettre", "remis"],
      ["non_retire", "ouvrir_litige", "litige"],
      ["perdu", "rendre_disponible", "disponible"],
      ["perdu", "ouvrir_litige", "litige"],
      ["litige", "rendre_disponible", "disponible"],
      ["litige", "remettre", "remis"],
      ["litige", "retourner", "retourne"],
      ["litige", "declarer_perdu", "perdu"],
    ]);
  });

  it("suit le chemin nominal enregistré → chargé → en route → déchargé → disponible → remis", () => {
    let etat = MACHINE_COLIS.initial;
    for (const action of [
      "charger",
      "expedier",
      "decharger",
      "rendre_disponible",
      "remettre",
    ] as const) {
      etat = etatSuivant(MACHINE_COLIS, etat, action);
    }
    expect(etat).toBe("remis");
  });

  it("ne remet pas un colis qui n'est pas arrivé, ni ne le charge deux fois", () => {
    expect(() => etatSuivant(MACHINE_COLIS, "enregistre", "remettre")).toThrow(TransitionInterdite);
    expect(() => etatSuivant(MACHINE_COLIS, "charge", "remettre")).toThrow(TransitionInterdite);
    expect(() => etatSuivant(MACHINE_COLIS, "en_route", "remettre")).toThrow(TransitionInterdite);
    expect(() => etatSuivant(MACHINE_COLIS, "charge", "charger")).toThrow(TransitionInterdite);
  });

  it("n'a aucune sortie depuis remis, livré et retourné", () => {
    for (const etat of ["remis", "livre", "retourne"] as const) {
      expect(actionsPossibles(MACHINE_COLIS, etat)).toEqual([]);
    }
    expect(() => etatSuivant(MACHINE_COLIS, "remis", "ouvrir_litige")).toThrow(TransitionInterdite);
  });

  it("ne livre pas un colis qui n'est pas en livraison", () => {
    expect(() => etatSuivant(MACHINE_COLIS, "disponible", "livrer")).toThrow(TransitionInterdite);
    expect(() => etatSuivant(MACHINE_COLIS, "en_relais", "livrer")).toThrow(TransitionInterdite);
  });

  it("déclare les 13 états du document", () => {
    expect(ETATS_COLIS).toHaveLength(13);
    expect(ACTIONS_COLIS.length).toBeGreaterThan(0);
  });
});

describe("machine d'états du départ", () => {
  it("autorise exactement les transitions du document projet et refuse toutes les autres", () => {
    verifierExhaustivement(MACHINE_DEPART, [
      ["programme", "ouvrir_vente", "en_vente"],
      ["programme", "annuler", "annule"],
      ["programme", "retarder", "retarde"],
      ["programme", "fusionner", "fusionne"],
      ["en_vente", "ouvrir_embarquement", "embarquement"],
      ["en_vente", "annuler", "annule"],
      ["en_vente", "retarder", "retarde"],
      ["en_vente", "fusionner", "fusionne"],
      ["embarquement", "partir", "parti"],
      ["embarquement", "retarder", "retarde"],
      ["parti", "arriver", "arrive"],
      ["retarde", "reprendre_vente", "en_vente"],
      ["retarde", "ouvrir_embarquement", "embarquement"],
      ["retarde", "annuler", "annule"],
      ["retarde", "fusionner", "fusionne"],
    ]);
  });

  it("ne fait ni partir un départ non embarqué ni arriver un départ non parti", () => {
    expect(() => etatSuivant(MACHINE_DEPART, "en_vente", "partir")).toThrow(TransitionInterdite);
    expect(() => etatSuivant(MACHINE_DEPART, "embarquement", "arriver")).toThrow(
      TransitionInterdite,
    );
  });

  it("ne permet ni d'annuler ni de fusionner un bus déjà parti", () => {
    expect(() => etatSuivant(MACHINE_DEPART, "parti", "annuler")).toThrow(TransitionInterdite);
    expect(() => etatSuivant(MACHINE_DEPART, "parti", "fusionner")).toThrow(TransitionInterdite);
    expect(() => etatSuivant(MACHINE_DEPART, "embarquement", "annuler")).toThrow(
      TransitionInterdite,
    );
  });

  it("garde annulé, fusionné et arrivé comme états finaux", () => {
    for (const etat of ["annule", "fusionne", "arrive"] as const) {
      expect(estTerminal(MACHINE_DEPART, etat)).toBe(true);
    }
    expect(ETATS_DEPART).toContain("retarde");
    expect(ACTIONS_DEPART).toContain("fusionner");
  });
});

describe("machine d'états de la session de caisse", () => {
  it("autorise exactement ouverte → clôturée → validée et le refus du superviseur", () => {
    verifierExhaustivement(MACHINE_SESSION, [
      ["ouverte", "cloturer", "cloturee"],
      ["cloturee", "refuser", "ouverte"],
      ["cloturee", "valider", "validee"],
    ]);
  });

  it("ne valide pas une session encore ouverte et ne rouvre pas une session validée", () => {
    expect(() => etatSuivant(MACHINE_SESSION, "ouverte", "valider")).toThrow(TransitionInterdite);
    expect(() => etatSuivant(MACHINE_SESSION, "validee", "refuser")).toThrow(TransitionInterdite);
    expect(() => etatSuivant(MACHINE_SESSION, "validee", "cloturer")).toThrow(TransitionInterdite);
    expect(ETATS_SESSION).toEqual(["ouverte", "cloturee", "validee"]);
    expect(ACTIONS_SESSION).toHaveLength(3);
  });
});

describe("appliquerAction", () => {
  const depart: Historise<(typeof ETATS_SESSION)[number], (typeof ACTIONS_SESSION)[number]> = {
    etat: "ouverte",
    historique: [],
  };

  it("renvoie une nouvelle entité et ajoute une entrée d'historique horodatée à Douala", () => {
    const apres = appliquerAction(MACHINE_SESSION, depart, "cloturer", {
      at: "2027-01-05T12:00:00Z",
      par: "agent-1",
      motif: "fin de service",
    });
    expect(depart.etat).toBe("ouverte");
    expect(depart.historique).toHaveLength(0);
    expect(apres.etat).toBe("cloturee");
    expect(apres.historique).toEqual([
      {
        action: "cloturer",
        de: "ouverte",
        vers: "cloturee",
        at: "2027-01-05T13:00:00.000+01:00",
        par: "agent-1",
        motif: "fin de service",
      },
    ]);
  });

  it("refuse une action interdite sans rien modifier", () => {
    expect(() => appliquerAction(MACHINE_SESSION, depart, "valider", { at: 0 })).toThrow(
      TransitionInterdite,
    );
    expect(depart.historique).toHaveLength(0);
  });
});
