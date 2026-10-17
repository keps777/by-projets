import { colis as contrats } from "@afrimove/contrats";
import { describe, expect, it } from "vitest";
import { ErreurColis } from "../colis/erreurs";
import {
  lireAgrement,
  lireCommissions,
  lireIdentifiant,
  lireParamsDeparts,
  lireVente,
} from "./validation";

function echec(fn: () => unknown): ErreurColis {
  try {
    fn();
  } catch (e) {
    if (e instanceof ErreurColis) return e;
    throw e;
  }
  throw new Error("Aucune erreur levée");
}

const chemins = (e: ErreurColis) =>
  (e.getResponse() as { details: { chemin: string }[] }).details.map((d) => d.chemin).sort();

const vente = {
  departId: "d1",
  voisin: { nom: "Mme Ebogo", telephone: "+237670123456" },
  reglementAgence: "mtn_momo",
};

/**
 * Les lecteurs de l'API reprennent à la main les schémas zod de `@afrimove/contrats` (l'API ne peut
 * pas importer zod à l'exécution) : ces cas passent par les deux et doivent donner la même réponse.
 */
describe("la vente d'un billet : les lecteurs suivent le contrat", () => {
  const cas: [string, unknown][] = [
    ["une vente valide", vente],
    ["avec Orange Money", { ...vente, reglementAgence: "orange_money" }],
    [
      "avec la carte (lue, refusée plus tard par le service)",
      { ...vente, reglementAgence: "carte" },
    ],
    ["sans voisin", { ...vente, voisin: undefined }],
    ["nom vide", { ...vente, voisin: { nom: "", telephone: "+237670123456" } }],
    ["téléphone sans indicatif", { ...vente, voisin: { nom: "A", telephone: "670123456" } }],
    ["téléphone trop court", { ...vente, voisin: { nom: "A", telephone: "+2376" } }],
    ["moyen inconnu", { ...vente, reglementAgence: "wave" }],
    ["sans moyen", { ...vente, reglementAgence: undefined }],
    ["départ vide", { ...vente, departId: "" }],
    ["départ numérique", { ...vente, departId: 12 }],
    ["rien du tout", {}],
  ];

  it.each(cas)("%s", (_nom, corps) => {
    const attendu = contrats.SchemaVenteVendeur.safeParse(corps).success;
    let lu = true;
    try {
      lireVente(corps);
    } catch (e) {
      if (!(e instanceof ErreurColis)) throw e;
      lu = false;
    }
    expect(lu).toBe(attendu);
  });

  it("ne garde que ce que le contrat prévoit", () => {
    const lue = lireVente({ ...vente, vendeurId: "pirate", prix: 1 });
    expect(lue).toEqual(vente);
  });

  it("nomme tous les champs fautifs d'un coup, en 400", () => {
    const e = echec(() =>
      lireVente({ departId: "", voisin: { nom: "", telephone: "6" }, reglementAgence: "wave" }),
    );
    expect(e.getStatus()).toBe(400);
    expect(e.code).toBe("REQUETE_INVALIDE");
    expect(chemins(e)).toEqual(["departId", "reglementAgence", "voisin.nom", "voisin.telephone"]);
  });

  it("refuse un corps qui n'est pas un objet", () => {
    for (const brut of [null, undefined, "vente", 12, [], [{}]]) {
      expect(echec(() => lireVente(brut)).getStatus(), String(brut)).toBe(400);
    }
  });
});

describe("les départs à vendre : les paramètres suivent le contrat", () => {
  const cas: [string, Record<string, unknown>][] = [
    ["aucun paramètre", {}],
    ["un jour", { jour: "2026-11-06" }],
    ["un trajet", { origine: "Douala", destination: "Yaoundé" }],
    ["un jour mal écrit", { jour: "6 novembre" }],
    ["un jour sans zéros", { jour: "2026-1-6" }],
    ["un nombre à la place du jour", { jour: 12 }],
  ];

  it.each(cas)("%s", (_nom, params) => {
    const attendu = contrats.SchemaParamsDepartsVendeur.safeParse(params).success;
    let lu = true;
    try {
      lireParamsDeparts(params);
    } catch (e) {
      if (!(e instanceof ErreurColis)) throw e;
      lu = false;
    }
    expect(lu).toBe(attendu);
  });

  it("un paramètre vide vaut « absent » (« ?origine= »)", () => {
    expect(lireParamsDeparts({ jour: "", origine: "", destination: "Yaoundé" })).toEqual({
      destination: "Yaoundé",
    });
  });

  it("répond 400 pour un jour illisible", () => {
    const e = echec(() => lireParamsDeparts({ jour: "demain" }));
    expect(e.getStatus()).toBe(400);
    expect(chemins(e)).toEqual(["jour"]);
  });
});

describe("la fiche d'agrément (hors contrat)", () => {
  const fiche = { nom: "Nadège", telephone: "+237677000031", quartier: "Ndokoti", ville: "Douala" };

  it("lit une fiche minimale : numéro MoMo et commissions absents", () => {
    expect(lireAgrement(fiche)).toEqual({
      ...fiche,
      momo: null,
      commissionClassique: undefined,
      commissionVip: undefined,
    });
  });

  it("lit le numéro mobile money et les commissions", () => {
    const lue = lireAgrement({
      ...fiche,
      momo: { telephone: "+237691000032", operateur: "orange" },
      commissionClassique: 200,
      commissionVip: 0,
    });
    expect(lue.momo).toEqual({ telephone: "+237691000032", operateur: "orange" });
    expect(lue.commissionClassique).toBe(200);
    expect(lue.commissionVip).toBe(0);
  });

  it("borne la commission entre 0 et 2 000 F, en nombres entiers", () => {
    for (const montant of [-1, 2001, 99.5, "100"]) {
      expect(
        chemins(echec(() => lireAgrement({ ...fiche, commissionClassique: montant }))),
        String(montant),
      ).toEqual(["commissionClassique"]);
    }
    expect(lireAgrement({ ...fiche, commissionVip: 2000 }).commissionVip).toBe(2000);
  });

  it("refuse un opérateur inconnu et un numéro mal écrit", () => {
    const e = echec(() =>
      lireAgrement({
        ...fiche,
        telephone: "677",
        momo: { telephone: "+237691000032", operateur: "wave" },
      }),
    );
    expect(chemins(e)).toEqual(["momo.operateur", "telephone"]);
  });

  it("exige les deux commissions pour les fixer", () => {
    expect(lireCommissions({ commissionClassique: 250, commissionVip: 350 })).toEqual({
      commissionClassique: 250,
      commissionVip: 350,
    });
    expect(chemins(echec(() => lireCommissions({ commissionClassique: 250 })))).toEqual([
      "commissionVip",
    ]);
    expect(chemins(echec(() => lireCommissions({})))).toEqual([
      "commissionClassique",
      "commissionVip",
    ]);
  });

  it("lit un identifiant de chemin raisonnable", () => {
    expect(lireIdentifiant("abc-123", "vendeurId")).toBe("abc-123");
    expect(echec(() => lireIdentifiant("", "vendeurId")).getStatus()).toBe(400);
    expect(echec(() => lireIdentifiant("x".repeat(81), "vendeurId")).getStatus()).toBe(400);
  });
});
