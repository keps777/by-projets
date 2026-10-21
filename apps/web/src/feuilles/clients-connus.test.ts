import { describe, expect, it } from "vitest";
import {
  CLE_CLIENTS_CONNUS,
  CLIENTS_MAX,
  filtrerClients,
  fusionner,
  initiales,
  lireClientsConnus,
  memoriserClient,
  normaliser,
  telephoneNational,
  type ClientConnu,
} from "./clients-connus";

function client(surcharge: Partial<ClientConnu> = {}): ClientConnu {
  return {
    nom: "Tchoumi Paul",
    telephone: "+237677301145",
    pieceQuatreDerniers: "8820",
    dernierBilletA: "2027-01-05T07:38:00+01:00",
    ...surcharge,
  };
}

describe("clients connus · recherche", () => {
  const carnet = [
    client(),
    client({ nom: "Aïcha Ngo", telephone: "+237691221008", pieceQuatreDerniers: null }),
    client({ nom: "Marie Essono", telephone: null, pieceQuatreDerniers: null }),
  ];

  it("normalise les accents, la casse et les espaces", () => {
    expect(normaliser("  Aïcha   NGO ")).toBe("aicha ngo");
  });

  it("rend tout le carnet pour une saisie vide", () => {
    expect(filtrerClients(carnet, "   ")).toHaveLength(3);
  });

  it("cherche dans le nom sans tenir compte des accents ni de l'ordre des mots", () => {
    expect(filtrerClients(carnet, "aicha").map((c) => c.nom)).toEqual(["Aïcha Ngo"]);
    expect(filtrerClients(carnet, "ngo AICHA").map((c) => c.nom)).toEqual(["Aïcha Ngo"]);
    expect(filtrerClients(carnet, "essono").map((c) => c.nom)).toEqual(["Marie Essono"]);
  });

  it("cherche les chiffres dans le numéro, avec ou sans espaces", () => {
    expect(filtrerClients(carnet, "677 30").map((c) => c.nom)).toEqual(["Tchoumi Paul"]);
    expect(filtrerClients(carnet, "6912").map((c) => c.nom)).toEqual(["Aïcha Ngo"]);
  });

  it("ne trouve pas, par un numéro, un client qui n'en a pas", () => {
    expect(filtrerClients(carnet, "6")).toHaveLength(2);
    expect(filtrerClients(carnet, "marie 6")).toEqual([]);
  });

  it("exige que tous les mots conviennent", () => {
    expect(filtrerClients(carnet, "paul ngo")).toEqual([]);
  });
});

describe("clients connus · carnet", () => {
  it("met le dernier client en tête", () => {
    const suivant = fusionner([client()], client({ nom: "Ngo Marie", telephone: "+237699001122" }));
    expect(suivant.map((c) => c.nom)).toEqual(["Ngo Marie", "Tchoumi Paul"]);
  });

  it("remplace une fiche au même numéro, la fait remonter et garde l'ancienne pièce si la nouvelle manque", () => {
    const carnet = [
      client({ nom: "Ngo Marie", telephone: "+237699001122", pieceQuatreDerniers: null }),
      client(),
    ];
    const suivant = fusionner(
      carnet,
      client({
        nom: "Tchoumi P.",
        pieceQuatreDerniers: null,
        dernierBilletA: "2027-01-06T08:00:00+01:00",
      }),
    );
    expect(suivant).toHaveLength(2);
    expect(suivant[0]).toMatchObject({
      nom: "Tchoumi P.",
      telephone: "+237677301145",
      pieceQuatreDerniers: "8820",
      dernierBilletA: "2027-01-06T08:00:00+01:00",
    });
  });

  it("reconnaît un client sans numéro à son nom, mais ne confond pas deux numéros différents", () => {
    const sansNumero = client({ nom: "Marie Essono", telephone: null });
    expect(fusionner([sansNumero], client({ nom: "marie  ESSONO", telephone: null }))).toHaveLength(
      1,
    );
    expect(
      fusionner(
        [client({ nom: "Paul", telephone: "+237677301145" })],
        client({ nom: "Paul", telephone: "+237699001122" }),
      ),
    ).toHaveLength(2);
  });

  it("ne garde que les CLIENTS_MAX plus récents", () => {
    let carnet: ClientConnu[] = [];
    for (let i = 0; i < CLIENTS_MAX + 5; i += 1) {
      carnet = fusionner(
        carnet,
        client({ nom: `Client ${i}`, telephone: `+2376${String(10000000 + i)}` }),
      );
    }
    expect(carnet).toHaveLength(CLIENTS_MAX);
    expect(carnet[0]?.nom).toBe(`Client ${CLIENTS_MAX + 4}`);
  });

  it("mémorise sur l'appareil et relit le même carnet", () => {
    expect(lireClientsConnus()).toEqual([]);
    memoriserClient(client({ nom: "  Tchoumi Paul " }));
    memoriserClient(client({ nom: "Ngo Marie", telephone: "+237699001122" }));
    expect(lireClientsConnus().map((c) => c.nom)).toEqual(["Ngo Marie", "Tchoumi Paul"]);
  });

  it("ne mémorise pas un client sans nom", () => {
    memoriserClient(client({ nom: "   " }));
    expect(lireClientsConnus()).toEqual([]);
    expect(localStorage.getItem(CLE_CLIENTS_CONNUS)).toBeNull();
  });

  it("repart d'un carnet vide quand le contenu est illisible ou abîmé", () => {
    localStorage.setItem(CLE_CLIENTS_CONNUS, "{pas du json");
    expect(lireClientsConnus()).toEqual([]);
    localStorage.setItem(CLE_CLIENTS_CONNUS, JSON.stringify({ nom: "x" }));
    expect(lireClientsConnus()).toEqual([]);
    localStorage.setItem(CLE_CLIENTS_CONNUS, JSON.stringify([client(), { nom: 12 }, null]));
    expect(lireClientsConnus()).toEqual([client()]);
  });
});

describe("clients connus · affichage", () => {
  it("tire des initiales", () => {
    expect(initiales("Aïcha Ngo")).toBe("AN");
    expect(initiales("Tchoumi Paul Junior")).toBe("TJ");
    expect(initiales("Marie")).toBe("MA");
    expect(initiales("  ")).toBe("");
  });

  it("écrit le numéro comme la vente : un chiffre, puis des paires", () => {
    expect(telephoneNational("+237677301145")).toBe("6 77 30 11 45");
    expect(telephoneNational("677301145")).toBe("6 77 30 11 45");
  });
});
