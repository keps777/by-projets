import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import type {
  AvisBillets,
  AvisBilletterie,
  ColisDuDepart,
  ProchesVoyageur,
  Promotions,
} from "../ports";
import type { Promotion } from "../ports";

/**
 * Contrat des quatre ports de la billetterie qui n'avaient pas de table (lot B) : `Promotions`,
 * `ProchesVoyageur`, `ColisDuDepart`, `AvisBillets`. Les mêmes tests passent sur la mémoire et sur
 * PostgreSQL ; ce que la base fait de plus (ajout seul, clés étrangères) est dans le fichier
 * d'intégration.
 */

export interface BancAnnexes {
  promotions: Promotions;
  ajouterPromotion(promotion: Promotion): Promise<void>;
  retirerPromotion(code: string): Promise<void>;

  proches: ProchesVoyageur;
  /** Un compte voyageur (en base : une ligne `personne`). */
  nouveauVoyageur(): Promise<string>;
  ajouterProche(
    voyageurId: string,
    proche: { id: string; nom: string; telephone: string | null },
  ): Promise<void>;

  colis: ColisDuDepart;
  nouveauDepart(): Promise<string>;
  /** Pose des colis du départ, par état : (en base : des lignes `colis`). */
  poserColis(
    departId: string,
    colis: {
      enregistres?: number;
      charges?: number;
      enRoute?: number;
      decharges?: number;
      remis?: number;
    },
  ): Promise<void>;

  avis: AvisBillets;
  /** Les avis publiés jusqu'ici, dans l'ordre. */
  lireAvis(): Promise<AvisBilletterie[]>;

  fermer(): Promise<void>;
}

export function contratAnnexesBilletterie(
  titre: string,
  creerBanc: () => Promise<BancAnnexes>,
): void {
  describe(titre, () => {
    let banc: BancAnnexes | null = null;
    const obtenir = async (): Promise<BancAnnexes> => (banc ??= await creerBanc());
    afterAll(async () => {
      await banc?.fermer();
    });

    describe("Promotions", () => {
      it("un code inconnu n'existe pas", async () => {
        const b = await obtenir();
        expect(await b.promotions.trouver("INCONNU-" + randomUUID().slice(0, 6))).toBeNull();
        expect(await b.promotions.trouver("   ")).toBeNull();
      });

      it("un code ajouté est trouvé sans tenir compte de la casse ni des espaces", async () => {
        const b = await obtenir();
        const code = "PROMO" + randomUUID().slice(0, 6).toUpperCase();
        await b.ajouterPromotion({ code, type: "frais_offerts" });
        expect(await b.promotions.trouver(code)).toEqual({ code, type: "frais_offerts" });
        expect(await b.promotions.trouver(`  ${code.toLowerCase()} `)).toEqual({
          code,
          type: "frais_offerts",
        });
      });

      it("un code retiré n'est plus trouvé, et peut être ajouté de nouveau", async () => {
        const b = await obtenir();
        const code = "FIN" + randomUUID().slice(0, 6).toUpperCase();
        await b.ajouterPromotion({ code, type: "frais_offerts" });
        await b.retirerPromotion(code);
        expect(await b.promotions.trouver(code)).toBeNull();
        await b.ajouterPromotion({ code, type: "frais_offerts" });
        expect(await b.promotions.trouver(code)).not.toBeNull();
      });
    });

    describe("ProchesVoyageur", () => {
      it("rend le proche de son voyageur, avec son téléphone", async () => {
        const b = await obtenir();
        const voyageur = await b.nouveauVoyageur();
        const proche = { id: randomUUID(), nom: "Maman Esther", telephone: "+237655000111" };
        await b.ajouterProche(voyageur, proche);
        expect(await b.proches.trouver(voyageur, proche.id)).toEqual(proche);
      });

      it("un proche sans téléphone reste sans téléphone", async () => {
        const b = await obtenir();
        const voyageur = await b.nouveauVoyageur();
        const proche = { id: randomUUID(), nom: "Tonton Paul", telephone: null };
        await b.ajouterProche(voyageur, proche);
        expect(await b.proches.trouver(voyageur, proche.id)).toEqual(proche);
      });

      it("un autre voyageur ne voit pas ce proche", async () => {
        const b = await obtenir();
        const voyageur = await b.nouveauVoyageur();
        const autre = await b.nouveauVoyageur();
        const proche = { id: randomUUID(), nom: "Maman Esther", telephone: "+237655000111" };
        await b.ajouterProche(voyageur, proche);
        expect(await b.proches.trouver(autre, proche.id)).toBeNull();
      });

      it("un proche inconnu est absent", async () => {
        const b = await obtenir();
        expect(await b.proches.trouver(await b.nouveauVoyageur(), randomUUID())).toBeNull();
      });
    });

    describe("ColisDuDepart", () => {
      it("un départ sans colis a une soute vide", async () => {
        const b = await obtenir();
        expect(await b.colis.etat(await b.nouveauDepart())).toEqual({
          charges: 0,
          colisACharger: 0,
        });
        expect(await b.colis.etat(randomUUID())).toEqual({ charges: 0, colisACharger: 0 });
      });

      it("compte les colis en soute et ceux qui restent à charger, rien d'autre", async () => {
        const b = await obtenir();
        const depart = await b.nouveauDepart();
        const autre = await b.nouveauDepart();
        await b.poserColis(depart, {
          enregistres: 3,
          charges: 2,
          enRoute: 1,
          decharges: 4,
          remis: 2,
        });
        await b.poserColis(autre, { enregistres: 7, charges: 5 });
        // Un colis en route est encore en soute ; un colis déchargé ou remis n'y est plus.
        expect(await b.colis.etat(depart)).toEqual({ charges: 3, colisACharger: 3 });
        expect(await b.colis.etat(autre)).toEqual({ charges: 5, colisACharger: 7 });
      });
    });

    describe("AvisBillets", () => {
      it("garde chaque avis publié, dans l'ordre, tel quel", async () => {
        const b = await obtenir();
        const avant = (await b.lireAvis()).length;
        const billetId = randomUUID();
        const departId = randomUUID();
        const emis: AvisBilletterie = {
          type: "billet.emis",
          billetId,
          numero: "ALP-DLA-270106-0001",
          departId,
          canal: "guichet",
          telephone: "+237655000111",
          acheteurId: null,
        };
        const annule: AvisBilletterie = {
          type: "billet.annule",
          billetId,
          numero: "ALP-DLA-270106-0001",
          departId,
          raison: "voyageur",
          retenue: 2000,
          remboursement: 6000,
          acheteurId: randomUUID(),
        };
        await b.avis.publier(emis);
        await b.avis.publier(annule);
        await b.avis.publier({
          type: "depart.etat_change",
          departId,
          de: "en_vente",
          vers: "parti",
        });
        const apres = (await b.lireAvis()).slice(avant);
        expect(apres).toEqual([
          emis,
          annule,
          { type: "depart.etat_change", departId, de: "en_vente", vers: "parti" },
        ]);
      });
    });
  });
}
