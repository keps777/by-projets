import { voyageur } from "@afrimove/contrats";
import { describe, expect, it } from "vitest";
import { corps, lireLienProche, lirePayerCommande } from "./requetes";
import type { Paiement } from "./modeles";
import { messageStatut, statutContrat, statutVu, vueGuichet, vuePaiement } from "./vues";

/**
 * Les lecteurs de requêtes et les vues du serveur doivent dire la même chose que les schémas zod de
 * `@afrimove/contrats` (ce que les applications utilisent). Un champ renommé d'un côté seulement fait
 * échouer ces tests.
 */

const accepte = (lecteur: Parameters<typeof corps>[0], brut: unknown): boolean => {
  try {
    corps(lecteur, brut);
    return true;
  } catch {
    return false;
  }
};

const essaisPayer: unknown[] = [
  { moyen: "mtn_momo" },
  { moyen: "mtn_momo", telephone: "+237677012345" },
  { moyen: "orange_money", telephone: "+237691221008" },
  { moyen: "carte", jetonCarte: "tok_1NxQ7a2eZvKYlo2C" },
  { moyen: "carte", jetonCarte: "" },
  { moyen: "proche" },
  { moyen: "bitcoin" },
  { moyen: "mtn_momo", telephone: "pas un numéro" },
  { moyen: "mtn_momo", telephone: "677012345" },
  { moyen: "mtn_momo", telephone: "+23767" },
  { moyen: "mtn_momo", telephone: 677012345 },
  { moyen: "carte", jetonCarte: 42 },
  {},
  { telephone: "+237677012345" },
  "texte",
  null,
  [],
];

describe("corps de POST /voyageur/commandes/:id/paiements", () => {
  it.each(essaisPayer.map((e) => [JSON.stringify(e), e] as const))(
    "même verdict que SchemaPayerCommande : %s",
    (_nom, brut) => {
      const zod = voyageur.SchemaPayerCommande.omit({ commandeId: true }).safeParse(brut).success;
      expect(accepte(lirePayerCommande, brut)).toBe(zod);
    },
  );
});

const essaisLien: unknown[] = [
  {},
  { procheId: "proche-1" },
  { telephone: "+237677012345" },
  { procheId: "proche-1", telephone: "+237677012345" },
  { procheId: "" },
  { telephone: "6 77 01 23 45" },
  { telephone: "abc" },
  { procheId: 12 },
];

describe("corps de POST /voyageur/commandes/:id/lien-proche", () => {
  it.each(essaisLien.map((e) => [JSON.stringify(e), e] as const))(
    "même verdict que SchemaCreerLienProche : %s",
    (_nom, brut) => {
      const zod = voyageur.SchemaCreerLienProche.omit({ commandeId: true }).safeParse(brut).success;
      expect(accepte(lireLienProche, brut)).toBe(zod);
    },
  );
});

function paiement(surcharge: Partial<Paiement> = {}): Paiement {
  return {
    id: "pay-1",
    cle: "voyageur:commande-1:1",
    origine: "voyageur",
    commandeId: "commande-1",
    voyageurId: "voyageur-1",
    compagnieId: "compagnie-1",
    moyen: "mtn_momo",
    operateur: "mtn",
    montant: 4250,
    devise: null,
    repartition: [
      { beneficiaire: "compagnie", compteId: "c", montant: 4000 },
      { beneficiaire: "afrimove", compteId: "a", montant: 250 },
    ],
    statut: "en_attente",
    confirmation: "a_faire",
    telephoneChiffre: null,
    telephoneMasque: "+237 ••••• 345",
    fournisseur: "simule",
    idFournisseur: "simule-enc-1",
    referenceOperateur: null,
    urlAuthentification: null,
    cause: null,
    billetIds: [],
    creeA: new Date("2027-01-05T07:00:00.000Z"),
    expireA: new Date("2027-01-05T07:03:00.000Z"),
    termineA: null,
    ...surcharge,
  } as Paiement;
}

const etats: Array<[string, Partial<Paiement>]> = [
  ["en attente", {}],
  [
    "en attente de carte avec 3-D Secure",
    { moyen: "carte", urlAuthentification: "https://3ds.example/abc" },
  ],
  ["reçu, billets à émettre", { statut: "reussi" }],
  ["reçu, billets émis", { statut: "reussi", confirmation: "faite", billetIds: ["b1"] }],
  ["échoué", { statut: "echoue", cause: "refuse" }],
  ["expiré", { statut: "expire", cause: "delai_depasse" }],
  ["reçu mais places reprises", { statut: "reussi", confirmation: "sieges_perdus" }],
  ["reçu mais commande annulée", { statut: "reussi", confirmation: "commande_annulee" }],
  ["reçu en double", { statut: "reussi", confirmation: "doublon" }],
  ["orange money", { moyen: "orange_money", operateur: "orange" }],
];

describe("réponses : conformes aux schémas du contrat", () => {
  it.each(etats)("paiement %s", (_nom, surcharge) => {
    const p = paiement(surcharge);
    const vue = voyageur.SchemaPaiement.parse(vuePaiement(p));
    expect(vue.id).toBe("pay-1");
    expect(vue.montant).toBe(4250);
    voyageur.SchemaMessageStatutPaiement.parse(
      messageStatut(p, new Date("2027-01-05T07:01:00.000Z")),
    );
  });

  it("le client ne voit jamais `reussi` tant que le billet n'est pas émis", () => {
    expect(vuePaiement(paiement({ statut: "reussi" })).statut).toBe("en_attente_confirmation");
    expect(vuePaiement(paiement({ statut: "reussi", confirmation: "faite" })).statut).toBe(
      "reussi",
    );
    expect(vuePaiement(paiement({ statut: "reussi", confirmation: "doublon" })).statut).toBe(
      "echoue",
    );
  });

  it("tous les statuts vus par le client existent dans le contrat", () => {
    const connus = new Set<string>(voyageur.SchemaStatutPaiement.options);
    for (const statut of ["en_attente", "reussi", "echoue", "expire"] as const) {
      for (const confirmation of [
        "a_faire",
        "faite",
        "sieges_perdus",
        "commande_annulee",
        "doublon",
        "sans_objet",
      ] as const) {
        const vu = statutContrat(statutVu(paiement({ statut, confirmation })));
        expect(connus.has(vu), `${statut}/${confirmation} → ${vu}`).toBe(true);
      }
    }
  });

  it("l'instant est en heure de Douala, comme partout dans le contrat", () => {
    expect(vuePaiement(paiement()).creeA).toBe("2027-01-05T08:00:00.000+01:00");
  });

  it("le push de guichet ne montre la référence de l'opérateur qu'une fois le paiement reçu", () => {
    expect(
      vueGuichet(paiement({ origine: "guichet", commandeId: null })).referenceOperateur,
    ).toBeNull();
    expect(
      vueGuichet(
        paiement({
          origine: "guichet",
          commandeId: null,
          statut: "reussi",
          referenceOperateur: "MP00000007",
        }),
      ).referenceOperateur,
    ).toBe("MP00000007");
  });

  it("les moyens de paiement du contrat sont ceux du serveur", () => {
    expect([...voyageur.SchemaMoyenPaiement.options].sort()).toEqual([
      "carte",
      "mtn_momo",
      "orange_money",
      "proche",
    ]);
  });
});
