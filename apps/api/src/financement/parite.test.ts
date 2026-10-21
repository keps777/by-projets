import { patron } from "@afrimove/contrats";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  OP_DEMANDER_AVANCE,
  OP_DOSSIER_FINANCEMENT,
  OP_LANCER_PAIE,
  OP_OFFRE_FINANCEMENT,
  OP_REGLER_BILLET_EN_DEUX_FOIS,
  OP_RETIRER_DEMANDE,
} from "../../../../packages/api-client/src/patron/operations";
import {
  AGENCE,
  creerAppFinancementTest,
  salairesTypes,
  type AppFinancementTest,
} from "./testing/app-financement-test";

/**
 * L'API ne peut pas importer le client à l'exécution (paquet non compilé) : ce test pilote l'API avec les
 * définitions d'opérations du client (`operations.ts`, méthode, chemin, corps, schéma de réponse), comme le
 * fera l'adaptateur HTTP des écrans Financement et FinancementDemande. Une route, un chemin ou une forme de
 * réponse modifiés d'un seul côté font échouer la CI.
 */

describe("parité avec le client d'API (écrans Financement et FinancementDemande)", () => {
  let t: AppFinancementTest;
  let jeton: string;

  beforeEach(async () => {
    t = await creerAppFinancementTest();
    jeton = (await t.compte("patron")).jeton;
    t.agenceEligible();
    t.salaires.parAgence.set(AGENCE, salairesTypes());
  });
  afterEach(async () => {
    await t.fermer();
  });

  /** Fait l'appel exact que fabrique le client pour l'opération. */
  async function appel<P, R>(
    op: {
      methode: string;
      chemin: (p: P) => string;
      corps?: (p: P) => unknown;
      reponse: { parse: (brut: unknown) => R };
    },
    params: P,
  ): Promise<{ statut: number; corps: unknown; valeur: R | null }> {
    const requete = t.http();
    const chemin = op.chemin(params);
    const envoi =
      op.methode === "GET"
        ? requete.get(chemin)
        : op.methode === "PUT"
          ? requete.put(chemin)
          : requete.post(chemin);
    const reponse = await envoi.set(t.entete(jeton)).send(op.corps?.(params) as object);
    return {
      statut: reponse.status,
      corps: reponse.body,
      valeur: reponse.status < 300 ? op.reponse.parse(reponse.body) : null,
    };
  }

  it("le parcours de l'écran Financement : offre, demande signée, suivi, retrait", async () => {
    const offre = await appel(OP_OFFRE_FINANCEMENT, undefined);
    expect(offre.statut).toBe(200);
    expect(offre.valeur!.avance.statut).toBe("eligible");

    const demande: patron.DemanderAvance = {
      montant: offre.valeur!.avance.montantPropose,
      signature: t.signature(),
    };
    const demandee = await appel(OP_DEMANDER_AVANCE, demande);
    expect(demandee.statut, JSON.stringify(demandee.corps)).toBe(201);
    const id = demandee.valeur!.dossier.id;
    expect(id).toMatch(/^AV-\d{4}-\d{4}$/);

    // L'écran FinancementDemande ouvre le dossier par l'identifiant reçu.
    const suivi = await appel(OP_DOSSIER_FINANCEMENT, { dossierId: id });
    expect(suivi.statut).toBe(200);
    expect(suivi.valeur).toEqual(demandee.valeur!.dossier);

    const retrait: patron.RetirerDemande = { dossierId: id, signature: t.signature() };
    const retiree = await appel(OP_RETIRER_DEMANDE, retrait);
    expect(retiree.statut, JSON.stringify(retiree.corps)).toBe(200);
    expect(retiree.valeur!.dossier.statut).toBe("retire");
    expect(retiree.valeur!.dossier.retirable).toBe(false);
  });

  it("les codes d'erreur que l'écran sait lire sont ceux du mock", async () => {
    // Montant au-dessus du plafond : 422 AU_DESSUS_DU_PLAFOND (FeuillePin).
    const trop = await appel(OP_DEMANDER_AVANCE, { montant: 99_000_000, signature: t.signature() });
    expect(trop.statut).toBe(422);
    expect((trop.corps as { code: string }).code).toBe("AU_DESSUS_DU_PLAFOND");
    // PIN faux : 403 (la feuille de PIN compte un essai).
    const faux = await appel(OP_DEMANDER_AVANCE, {
      montant: 1_000_000,
      signature: t.signature("111111"),
    });
    expect(faux.statut).toBe(403);
    expect((faux.corps as { code: string }).code).toBe("PIN_INCORRECT");
    // Dossier inconnu : 404 (l'écran FinancementDemande affiche « introuvable »).
    const inconnu = await appel(OP_DOSSIER_FINANCEMENT, { dossierId: "AV-2026-0404" });
    expect(inconnu.statut).toBe(404);
    expect((inconnu.corps as { code: string }).code).toBe("DOSSIER_INCONNU");
    // Retrait d'un dossier versé : 409 (« le partenaire a déjà répondu »).
    const demandee = await appel(OP_DEMANDER_AVANCE, {
      montant: 1_000_000,
      signature: t.signature(),
    });
    const id = demandee.valeur!.dossier.id;
    await t.notifier({
      type: "verse",
      reference: `PART-${id}`,
      at: t.iso(),
      coutTotalPct: 5,
    });
    const tard = await appel(OP_RETIRER_DEMANDE, { dossierId: id, signature: t.signature() });
    expect(tard.statut).toBe(409);
    expect((tard.corps as { code: string }).code).toBe("DOSSIER_NON_RETIRABLE");
  });

  it("le paiement en 2 fois : l'opération du client active l'option et l'offre le relit", async () => {
    const avant = await appel(OP_OFFRE_FINANCEMENT, undefined);
    expect(avant.valeur!.billetEnDeuxFois.actif).toBe(false);
    const commande: patron.ReglerBilletEnDeuxFois = { actif: true, signature: t.signature() };
    const regle = await appel(OP_REGLER_BILLET_EN_DEUX_FOIS, commande);
    expect(regle.statut, JSON.stringify(regle.corps)).toBe(200);
    expect(regle.valeur).toMatchObject({ actif: true });
    const apres = await appel(OP_OFFRE_FINANCEMENT, undefined);
    expect(apres.valeur!.billetEnDeuxFois.actif).toBe(true);
    // L'offre renvoie vers le dossier dès qu'une demande est ouverte.
    const demandee = await appel(OP_DEMANDER_AVANCE, {
      montant: 1_000_000,
      signature: t.signature(),
    });
    const enCours = await appel(OP_OFFRE_FINANCEMENT, undefined);
    expect(enCours.valeur!.avance).toMatchObject({
      statut: "en_cours",
      dossierId: demandee.valeur!.dossier.id,
    });
  });

  it("la paie en une touche (écran PatronEquipe et Financement)", async () => {
    const commande: patron.LancerPaie = { mois: "2026-11", signature: t.signature() };
    const lancee = await appel(OP_LANCER_PAIE, commande);
    expect(lancee.statut, JSON.stringify(lancee.corps)).toBe(200);
    expect(lancee.valeur).toMatchObject({ mois: "2026-11", nbSalaires: 3, total: 360_000 });
  });

  it("toute écriture du patron de ce module est dans le registre des commandes signées", () => {
    for (const nom of [
      "patron.financement.demander",
      "patron.financement.retirer",
      "patron.financement.billetEnDeuxFois",
      "patron.paie.lancer",
    ] as const) {
      expect(Object.keys(patron.COMMANDES_SIGNEES)).toContain(nom);
    }
    expect(OP_DEMANDER_AVANCE.nom).toBe("patron.financement.demander");
    expect(OP_RETIRER_DEMANDE.nom).toBe("patron.financement.retirer");
    expect(OP_LANCER_PAIE.nom).toBe("patron.paie.lancer");
  });
});
