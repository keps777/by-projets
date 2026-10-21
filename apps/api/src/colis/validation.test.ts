import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ErreurColis } from "./erreurs";
import {
  entierDeTexte,
  lireColisDecharges,
  lireDecision,
  lireDemandeCreation,
  lireDemandeDevis,
  lireScan,
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

const creation = {
  departId: "d1",
  photoRef: "p1",
  destinataire: { nom: "Thérèse", telephone: "+237699401822" },
  contenu: "Vêtements",
  poidsKg: 2,
  valeurDeclaree: 0,
  assurer: false,
  mode: "gare",
  paiement: { moyen: "mtn_momo" },
};

describe("lecture des corps de requête", () => {
  it("renvoie toutes les erreurs d'un coup, avec le chemin du champ, en 400 REQUETE_INVALIDE", () => {
    const e = echec(() =>
      lireDemandeCreation({
        ...creation,
        destinataire: { nom: "", telephone: "699" },
        poidsKg: 0,
        mode: "avion",
      }),
    );
    expect(e.getStatus()).toBe(400);
    expect(e.code).toBe("REQUETE_INVALIDE");
    const chemins = (e.getResponse() as { details: { chemin: string }[] }).details.map(
      (d) => d.chemin,
    );
    expect(chemins).toEqual(
      expect.arrayContaining(["destinataire.nom", "destinataire.telephone", "poidsKg", "mode"]),
    );
  });

  it("refuse un corps qui n'est pas un objet", () => {
    for (const brut of [null, undefined, "texte", 12, [], [{}]]) {
      expect(echec(() => lireDemandeCreation(brut)).getStatus(), String(brut)).toBe(400);
    }
  });

  it("ne répète jamais la valeur refusée dans le message d'erreur", () => {
    const e = echec(() => lireScan({ colisId: "c", action: "remettre", code: "123456789" }));
    expect(JSON.stringify(e.getResponse())).not.toContain("123456789");
  });

  it("lit les paramètres de devis venus du texte d'une adresse", () => {
    expect(entierDeTexte("25000")).toBe(25000);
    expect(entierDeTexte("abc")).toBe("abc");
    expect(entierDeTexte(undefined)).toBeUndefined();
    expect(
      lireDemandeDevis({ departId: "d", mode: "moto", valeurAssuree: "0", prixLivraison: "1500" }),
    ).toEqual({
      departId: "d",
      mode: "moto",
      valeurAssuree: 0,
      prixLivraison: 1500,
    });
    expect(
      echec(() =>
        lireDemandeDevis({ departId: "d", mode: "gare", valeurAssuree: "-3" }),
      ).getStatus(),
    ).toBe(400);
  });

  it("lit un scan : colis par identifiant ou par numéro, pièce non vérifiée par défaut", () => {
    expect(lireScan({ colisId: "c1", action: "charger" })).toMatchObject({
      colisId: "c1",
      action: "charger",
      pieceVerifiee: false,
      code: undefined,
    });
    expect(
      lireScan({
        numero: "C-DLA-261102-1001",
        action: "remettre",
        code: "482913",
        pieceVerifiee: true,
      }),
    ).toMatchObject({ numero: "C-DLA-261102-1001", code: "482913", pieceVerifiee: true });
    expect(echec(() => lireScan({ action: "charger" })).getStatus()).toBe(400);
    expect(echec(() => lireScan({ colisId: "c1", action: "detruire" })).getStatus()).toBe(400);
    expect(
      echec(() => lireScan({ colisId: "c1", action: "remettre", code: "12345" })).getStatus(),
    ).toBe(400);
    expect(
      echec(() => lireScan({ colisId: "c1", action: "charger", pieceVerifiee: "oui" })).getStatus(),
    ).toBe(400);
  });

  it("lit une décision : montant entier positif, motif borné", () => {
    expect(lireDecision({ decision: "acceptee", montant: 5000, motif: "Geste" })).toEqual({
      decision: "acceptee",
      montant: 5000,
      motif: "Geste",
    });
    expect(lireDecision({ decision: "refusee" })).toEqual({
      decision: "refusee",
      montant: undefined,
      motif: undefined,
    });
    for (const faux of [
      {},
      { decision: "oui" },
      { decision: "acceptee", montant: 1.5 },
      { decision: "acceptee", montant: -1 },
    ]) {
      expect(echec(() => lireDecision(faux)).getStatus(), JSON.stringify(faux)).toBe(400);
    }
  });

  it("lit le déchargement : au moins un colis, au plus 500, tous en texte", () => {
    const base = {
      id: randomUUID(),
      type: "route.colis_decharges",
      at: "2026-11-02T14:30:00.000+01:00",
      appareilId: "a",
      auteurId: "u",
      cible: { type: "depart", id: "d1" },
      numeroPlage: null,
      donnees: { departId: "d1", arret: "Pouma", colisIds: [randomUUID()] },
    };
    expect(lireColisDecharges(base).donnees.colisIds).toHaveLength(1);
    const avec = (colisIds: unknown) => ({ ...base, donnees: { ...base.donnees, colisIds } });
    expect(echec(() => lireColisDecharges(avec([]))).getStatus()).toBe(400);
    expect(echec(() => lireColisDecharges(avec(Array(501).fill("x")))).getStatus()).toBe(400);
    expect(echec(() => lireColisDecharges(avec([12]))).getStatus()).toBe(400);
    expect(echec(() => lireColisDecharges({ ...base, type: "colis.depose" })).getStatus()).toBe(
      400,
    );
  });
});
