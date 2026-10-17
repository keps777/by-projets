import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { RapportSoir } from "../modele";
import type { RapportsSoir, StockeRapport } from "../ports";

/**
 * Contrat du port `RapportsSoir` (les rapports arrêtés, en ajout seul) : les mêmes tests
 * s'exécutent sur la mémoire (toujours) et sur PostgreSQL (quand `DATABASE_URL_TEST` est donnée).
 * Un comportement que la mémoire a et que la base n'a pas (ou l'inverse) fait échouer l'un des deux.
 *
 * Chaque test prend sa propre compagnie : la base n'est pas vidée entre deux tests. Les instants
 * sont donnés en heure de Douala, avec les millisecondes, comme le module les produit.
 */

export interface BancRapports {
  rapports: RapportsSoir;
  fermer(): Promise<void>;
}

export function unRapport(surcharge: Partial<RapportSoir> = {}): RapportSoir {
  return {
    jour: "2027-01-05",
    envoyeA: "2027-01-05T21:00:00.000+01:00",
    titre: "Rapport du mardi 5 janvier · 2 gares",
    nbGares: 2,
    chiffres: {
      billets: 12,
      variationBilletsPct: -3.5,
      colis: 4,
      litiges: 1,
      recette: 52_500,
      cash: 30_000,
      momo: 22_500,
    },
    gares: [
      {
        gareId: randomUUID(),
        nom: "Akwa",
        billets: 8,
        ecart: -1_000,
        remarques: ["Caisse 2 : écart"],
      },
      { gareId: randomUUID(), nom: "Mvan", billets: 4, ecart: 0, remarques: [] },
    ],
    enRoute: { billetsConvoyeurs: 2, controles: 1, regularisations: 1, texte: "1 contrôle à Edéa" },
    remplissage: { moyenPct: 71.5, remarque: null },
    annulations: { nombre: 1, montant: 3_500, toutesAvecPin: true },
    enLigne: { billets: 3, partPct: 25 },
    signatures: [{ nom: "Essono", gare: "Akwa" }],
    questionSuggeree: { question: "Pourquoi le 09:30 part si vide ?", reponse: "…" },
    ...surcharge,
  };
}

export function unStocke(surcharge: Partial<StockeRapport> = {}): StockeRapport {
  const jour = surcharge.jour ?? "2027-01-05";
  return {
    compagnieId: randomUUID(),
    jour,
    genereA: `${jour}T21:00:00.000+01:00`,
    rapport: unRapport({ jour }),
    ...surcharge,
  };
}

export function contratRapportsSoir(nom: string, creerBanc: () => Promise<BancRapports>): void {
  describe(`contrat · rapports du soir · ${nom}`, () => {
    it("un rapport qui n'existe pas n'est pas trouvé", async () => {
      const { rapports, fermer } = await creerBanc();
      try {
        expect(await rapports.trouver(randomUUID(), "2027-01-05")).toBeNull();
      } finally {
        await fermer();
      }
    });

    it("le premier rapport du jour est écrit tel quel et se relit à l'identique", async () => {
      const { rapports, fermer } = await creerBanc();
      try {
        const entree = unStocke();
        const r = await rapports.creer(entree);
        expect(r.nouveau).toBe(true);
        expect(r.rapport).toEqual(entree);
        expect(await rapports.trouver(entree.compagnieId, entree.jour)).toEqual(entree);
      } finally {
        await fermer();
      }
    });

    it("un second rapport pour la même compagnie et le même jour ne remplace pas le premier", async () => {
      const { rapports, fermer } = await creerBanc();
      try {
        const premier = unStocke();
        await rapports.creer(premier);
        const second = {
          ...premier,
          genereA: "2027-01-05T22:15:00.000+01:00",
          rapport: unRapport({
            titre: "Rapport refait",
            chiffres: { ...unRapport().chiffres, billets: 99 },
          }),
        };
        const r = await rapports.creer(second);
        expect(r.nouveau).toBe(false);
        expect(r.rapport).toEqual(premier);
        expect(await rapports.trouver(premier.compagnieId, premier.jour)).toEqual(premier);
      } finally {
        await fermer();
      }
    });

    it("un rapport est propre à sa compagnie et à son jour", async () => {
      const { rapports, fermer } = await creerBanc();
      try {
        const a = unStocke({ jour: "2027-01-05" });
        const autreJour = unStocke({ compagnieId: a.compagnieId, jour: "2027-01-06" });
        const autreCompagnie = unStocke({ jour: "2027-01-05" });
        expect((await rapports.creer(a)).nouveau).toBe(true);
        expect((await rapports.creer(autreJour)).nouveau).toBe(true);
        expect((await rapports.creer(autreCompagnie)).nouveau).toBe(true);
        expect(await rapports.trouver(a.compagnieId, "2027-01-06")).toEqual(autreJour);
        expect(await rapports.trouver(autreCompagnie.compagnieId, "2027-01-05")).toEqual(
          autreCompagnie,
        );
        expect(await rapports.trouver(a.compagnieId, "2027-01-07")).toBeNull();
      } finally {
        await fermer();
      }
    });

    it("la valeur rendue n'est pas partagée avec le stockage", async () => {
      const { rapports, fermer } = await creerBanc();
      try {
        const entree = unStocke();
        const r = await rapports.creer(entree);
        r.rapport.rapport.gares[0]!.nom = "Modifié";
        const relu = await rapports.trouver(entree.compagnieId, entree.jour);
        expect(relu?.rapport.gares[0]?.nom).toBe("Akwa");
      } finally {
        await fermer();
      }
    });

    it("douze instances arrêtent le rapport en même temps : un seul est écrit, tous voient le même", async () => {
      const { rapports, fermer } = await creerBanc();
      try {
        const compagnieId = randomUUID();
        const resultats = await Promise.all(
          Array.from({ length: 12 }, (_, i) =>
            rapports.creer(
              unStocke({
                compagnieId,
                genereA: `2027-01-05T21:00:00.${String(i).padStart(3, "0")}+01:00`,
                rapport: unRapport({ titre: `Instance ${i}` }),
              }),
            ),
          ),
        );
        expect(resultats.filter((r) => r.nouveau)).toHaveLength(1);
        const titres = new Set(resultats.map((r) => r.rapport.rapport.titre));
        expect(titres.size).toBe(1);
        const fait = await rapports.trouver(compagnieId, "2027-01-05");
        expect(fait?.rapport.titre).toBe([...titres][0]);
      } finally {
        await fermer();
      }
    });
  });
}
