import { describe, expect, it } from "vitest";
import { colis as c } from "@afrimove/contrats";
import { verifierCodeRetrait } from "@afrimove/domain";
import { CODE_RETRAIT_COLIS_0017, ecrans } from "@afrimove/fixtures";
import { ErreurApi, ErreurHttp, ErreurValidation } from "../infra/erreurs";
import { creerClientMock } from "../infra/mock";
import type { Operation } from "../infra/operations";
import { implementer } from "../infra/scenarios";
import type { SourceScenarios } from "../infra/scenarios";
import * as toutes from "./operations";
import {
  CANAL_MISSIONS_LIVREUR,
  CANAL_POSITION_LIVREUR,
  CANAL_SUIVI_COLIS,
  OPERATIONS_PARTENAIRE,
  OPERATIONS_PROPRIETAIRE,
  OP_ACCEPTER_MISSION,
  OP_CHANGER_ADRESSE_LIVRAISON,
  OP_CHANGER_MODE_COLIS,
  OP_CHOISIR_RELAIS,
  OP_CLIENTS_VENDEUR,
  OP_COLIS,
  OP_COLIS_RELAIS,
  OP_CONTESTER_REGLEMENT,
  OP_CONVENTION_INTER_AGENCES,
  OP_CREER_COLIS,
  OP_DEPARTS_VENDEUR,
  OP_DEPOSER_DEMANDE_LIVREUR,
  OP_DEVIS_COLIS,
  OP_DISPONIBILITE_LIVREUR,
  OP_ENREGISTRER_BROUILLON_RELAIS,
  OP_ENVOYER_CODE_COLIS,
  OP_ENVOYER_FICHE_RELAIS,
  OP_ESPACE_LIVREUR,
  OP_ESPACE_RELAIS,
  OP_ESPACE_VENDEUR,
  OP_ESTIMER_PHOTO_COLIS,
  OP_FORMULAIRE_RELAIS,
  OP_INTER_AGENCES,
  OP_INVITER_COMPAGNIE,
  OP_INVITER_LIVREUR,
  OP_LIVRAISON_COLIS,
  OP_OPTIONS_ENVOI_COLIS,
  OP_PARTAGER_SUIVI_LIVRAISON,
  OP_PASSER_MISSION,
  OP_PROGRAMME_LIVREUR,
  OP_PROGRAMME_RELAIS,
  OP_RECEVOIR_COLIS_RELAIS,
  OP_RECLAMER_COLIS,
  OP_REGLEMENT_INTER_AGENCES,
  OP_RELAIS_PROCHES,
  OP_REMETTRE_COLIS_LIVREUR,
  OP_REMETTRE_COLIS_RELAIS,
  OP_RETIRER_GAINS_LIVREUR,
  OP_SCANNER_TRANSFERT_COLIS,
  OP_SIGNALER_ABSENCE_LIVREUR,
  OP_SUIVI_DEMANDE_LIVREUR,
  OP_SUIVI_DEMANDE_RELAIS,
  OP_VENDRE_BILLET_VENDEUR,
} from "./operations";
import { bancDe } from "./testing";
import type { PlancheColis } from "./index";

/** Les codes de retrait des fixtures : colis de Maman (482913) et colis inter-agences (719264). */
const CODES = [CODE_RETRAIT_COLIS_0017, "719264"];

type Appel = readonly [Operation<never, unknown>, unknown];

/** Lit un champ d'une réponse précédente (les appels s'enchaînent dans un même client). */
type Suite = (precedents: unknown[]) => readonly Appel[];

const colisRelais = ecrans.RelaisApp.entites.colis ?? [];
const colis0017 = ecrans.RelaisApp.donnees.remise._colisId;
const colis0011 = colisRelais[1]!;
const colisInter = ecrans.InterAgences.donnees.colis._colisId;

const piece = { pieceVerifiee: true as const, photoRef: "photo-remise" };

/**
 * Tout ce que chaque planche peut demander, dans l'ordre d'un écran, sauf les opérations destinées
 * au propriétaire (`OPERATIONS_PROPRIETAIRE`) qui, elles, portent le code.
 */
const PARCOURS: Record<PlancheColis, Suite> = {
  ColisEnvoi: () => [
    [OP_OPTIONS_ENVOI_COLIS, {}],
    [OP_ESTIMER_PHOTO_COLIS, { photoRef: "photo-1" }],
    [
      OP_DEVIS_COLIS,
      { departId: "dep-alp-dlabaf-270105-0815", mode: "relais", valeurAssuree: 25_000 },
    ],
  ],
  ColisCode: () => [
    [OP_ENVOYER_CODE_COLIS, { colisId: ecrans.ColisCode.donnees.retrait._colisId }],
    [OP_RECLAMER_COLIS, { colisId: ecrans.ColisCode.donnees.retrait._colisId, motif: "retard" }],
    [OP_CHANGER_MODE_COLIS, { colisId: ecrans.ColisCode.donnees.retrait._colisId, mode: "relais" }],
  ],
  Relais: () => [
    [OP_RELAIS_PROCHES, { colisId: "c" }],
    [OP_CHOISIR_RELAIS, { colisId: "c", relaisId: "relais-boutique-mama-fotso" }],
  ],
  Livraison: () => [
    [
      OP_PARTAGER_SUIVI_LIVRAISON,
      { colisId: ecrans.Livraison.donnees.arrivee._colisId, destinataire: "+237699401822" },
    ],
    [
      OP_CHANGER_ADRESSE_LIVRAISON,
      { colisId: ecrans.Livraison.donnees.arrivee._colisId, adresse: "Djeleng" },
    ],
  ],
  RelaisApp: () => [
    [OP_ESPACE_RELAIS, undefined],
    [OP_COLIS_RELAIS, { colisId: colis0011.id }],
    [OP_RECEVOIR_COLIS_RELAIS, { numeroColis: colis0011.numero }],
    [OP_REMETTRE_COLIS_RELAIS, { colisId: colis0017, code: CODE_RETRAIT_COLIS_0017, ...piece }],
    [OP_ESPACE_RELAIS, undefined],
  ],
  Livreur: (precedents) => {
    const espace = precedents[0] as c.EspaceLivreur | undefined;
    const missionId = espace?.mission?.id ?? "mission-inconnue";
    return [
      [OP_ESPACE_LIVREUR, undefined],
      [OP_DISPONIBILITE_LIVREUR, { disponible: true }],
      [OP_ACCEPTER_MISSION, { missionId }],
      [OP_SIGNALER_ABSENCE_LIVREUR, { missionId }],
      [OP_REMETTRE_COLIS_LIVREUR, { missionId, code: CODE_RETRAIT_COLIS_0017, ...piece }],
      [OP_RETIRER_GAINS_LIVREUR, {}],
      [OP_INVITER_LIVREUR, { telephone: "+237675000010" }],
      [OP_ESPACE_LIVREUR, undefined],
    ];
  },
  RelaisDevenir: () => [[OP_PROGRAMME_RELAIS, undefined]],
  RelaisInscription: () => [
    [OP_FORMULAIRE_RELAIS, undefined],
    [OP_ENREGISTRER_BROUILLON_RELAIS, { fiche: {} }],
    [
      OP_ENVOYER_FICHE_RELAIS,
      {
        nom: "Boutique",
        type: "Pharmacie",
        ouvert: "7 h – 20 h",
        position: { ville: "Bafoussam", quartier: "Tamdja" },
        tailleMax: "Tous (≤ 30 kg)",
        momo: { telephone: "+237699000041", operateur: "orange" },
        facadeRef: "photo-facade",
      },
    ],
  ],
  RelaisVerification: () => [[OP_SUIVI_DEMANDE_RELAIS, {}]],
  LivreurDevenir: () => [
    [OP_PROGRAMME_LIVREUR, undefined],
    [
      OP_DEPOSER_DEMANDE_LIVREUR,
      {
        deplacement: "moto",
        zone: "Bafoussam · Tamdja",
        heures: "Soirs",
        chargeMax: "10 kg",
        momo: { telephone: "+237675000009", operateur: "mtn" },
        pieces: {},
        reglesAcceptees: true,
      },
    ],
  ],
  LivreurVerification: () => [[OP_SUIVI_DEMANDE_LIVREUR, {}]],
  InterAgences: () => [
    [OP_INTER_AGENCES, undefined],
    [OP_REGLEMENT_INTER_AGENCES, undefined],
    [OP_CONTESTER_REGLEMENT, { motif: "6 colis contestés" }],
    [OP_SCANNER_TRANSFERT_COLIS, { colisId: colisInter, sens: "remis_a", compagnie: "Oméga" }],
    [OP_SCANNER_TRANSFERT_COLIS, { colisId: colisInter, sens: "recu", compagnie: "Oméga" }],
    [OP_INVITER_COMPAGNIE, { compagnie: "Bêta Express", patron: "+237677000054" }],
  ],
  InterAgencesConvention: () => [
    [OP_CONVENTION_INTER_AGENCES, { conventionId: "convention-alpha-omega" }],
  ],
  Vendeur: (precedents) => {
    const departs = precedents[1] as c.DepartsVendeur | undefined;
    return [
      [OP_ESPACE_VENDEUR, undefined],
      [OP_DEPARTS_VENDEUR, {}],
      [OP_CLIENTS_VENDEUR, undefined],
      [
        OP_VENDRE_BILLET_VENDEUR,
        {
          departId: departs?.departs[0]?.departId ?? "inconnu",
          voisin: { nom: "M. Tagne", telephone: "+237670111222" },
          reglementAgence: "mtn_momo",
        },
      ],
    ];
  },
};

interface Reponse {
  planche: PlancheColis;
  operation: string;
  reponse: unknown;
}

/** Parcours en plus : le livreur qui passe son tour au lieu d'accepter. */
const PARCOURS_EN_PLUS: readonly (readonly [PlancheColis, Suite])[] = [
  [
    "Livreur",
    (precedents) => {
      const espace = precedents[0] as c.EspaceLivreur | undefined;
      return [
        [OP_ESPACE_LIVREUR, undefined],
        [OP_PASSER_MISSION, { missionId: espace?.mission?.id ?? "mission-inconnue" }],
      ];
    },
  ],
];

/** Exécute le parcours de chaque planche et rassemble toutes les réponses. */
async function jouerTousLesParcours(): Promise<Reponse[]> {
  const reponses: Reponse[] = [];
  const parcours = [...(Object.entries(PARCOURS) as [PlancheColis, Suite][]), ...PARCOURS_EN_PLUS];
  for (const [planche, suite] of parcours) {
    const { client } = bancDe(planche);
    const precedents: unknown[] = [];
    // Les appels dépendent parfois du résultat des premiers : on relit la suite à chaque pas.
    const premiers = suite(precedents);
    for (let i = 0; i < premiers.length; i++) {
      const [operation, params] = suite(precedents)[i]!;
      const reponse = await client.executer(operation as Operation<unknown, unknown>, params);
      precedents.push(reponse);
      reponses.push({ planche, operation: operation.nom, reponse });
    }
  }
  return reponses;
}

describe("sécurité du code de retrait : guichet, relais, livreur, compagnies", () => {
  it("aucune réponse hors expéditeur et destinataire ne contient le code, son haché ni son sel", async () => {
    const reponses = await jouerTousLesParcours();
    expect(reponses.length).toBeGreaterThan(40);
    for (const r of reponses) {
      expect(c.fuitesCodeRetrait(r.reponse, CODES), `${r.planche} · ${r.operation}`).toEqual([]);
      const json = JSON.stringify(r.reponse);
      for (const colis of [
        ...(ecrans.RelaisApp.entites.colis ?? []),
        ...(ecrans.InterAgences.entites.colis ?? []),
      ]) {
        expect(json, `${r.operation} : haché`).not.toContain(colis.codeRetraitHache);
        expect(json, `${r.operation} : sel`).not.toContain(colis.codeRetraitSel);
      }
    }
  });

  it("chaque opération destinée à un partenaire est couverte par ce balayage", async () => {
    const jouees = new Set((await jouerTousLesParcours()).map((r) => r.operation));
    for (const operation of OPERATIONS_PARTENAIRE) {
      expect(jouees, operation.nom).toContain(operation.nom);
    }
  });

  it("toute opération déclarée est soit propriétaire, soit balayée : une nouvelle opération force le choix", async () => {
    const jouees = new Set((await jouerTousLesParcours()).map((r) => r.operation));
    const proprietaires = new Set(OPERATIONS_PROPRIETAIRE.map((o) => o.nom));
    const declarees = Object.entries(toutes)
      .filter(([nom]) => nom.startsWith("OP_"))
      .map(([, v]) => v as Operation<never, unknown>);
    expect(declarees.length).toBeGreaterThanOrEqual(40);
    for (const operation of declarees) {
      expect(jouees.has(operation.nom) || proprietaires.has(operation.nom), operation.nom).toBe(
        true,
      );
    }
    // Les opérations propriétaires n'apparaissent dans aucune liste partenaire.
    for (const operation of OPERATIONS_PARTENAIRE)
      expect(proprietaires.has(operation.nom)).toBe(false);
  });

  it("aucun message temps réel ne contient le code", async () => {
    const messages: { canal: string; message: unknown }[] = [];
    const ecouter = async <P, M>(
      planche: PlancheColis,
      canal: { nom: string },
      params: P,
      avance: number,
    ): Promise<void> => {
      const banc = bancDe(planche);
      const desabonner = banc.client.souscrire(canal as never, params as never, (m: unknown) =>
        messages.push({ canal: canal.nom, message: m }),
      );
      await new Promise((r) => setTimeout(r, 0));
      await banc.horloge.avancer(avance);
      desabonner();
    };
    await ecouter(
      "ColisCode",
      CANAL_SUIVI_COLIS,
      { colisId: ecrans.ColisCode.donnees.retrait._colisId },
      0,
    );
    await ecouter(
      "Livraison",
      CANAL_POSITION_LIVREUR,
      { colisId: ecrans.Livraison.donnees.arrivee._colisId },
      120_000,
    );
    await ecouter("Livreur", CANAL_MISSIONS_LIVREUR, undefined, 30_000);
    expect(messages.map((m) => m.canal)).toEqual(
      expect.arrayContaining([
        CANAL_SUIVI_COLIS.nom,
        CANAL_POSITION_LIVREUR.nom,
        CANAL_MISSIONS_LIVREUR.nom,
      ]),
    );
    for (const m of messages) expect(c.fuitesCodeRetrait(m.message, CODES), m.canal).toEqual([]);
  });

  it("seuls l'expéditeur et le destinataire reçoivent le code : création, lecture, livraison", async () => {
    const colis = await bancDe("ColisCode").client.executer(OP_COLIS, {
      colisId: ecrans.ColisCode.donnees.retrait._colisId,
    });
    expect(colis.retrait.code).toBe(CODE_RETRAIT_COLIS_0017);
    expect(c.fuitesCodeRetrait(colis, CODES)).not.toEqual([]);

    const livraison = await bancDe("Livraison").client.executer(OP_LIVRAISON_COLIS, {
      colisId: ecrans.Livraison.donnees.arrivee._colisId,
    });
    expect(livraison.remise.code).toBe(CODE_RETRAIT_COLIS_0017);

    const cree = await bancDe("ColisEnvoi").client.executer(OP_CREER_COLIS, {
      departId: "dep-alp-dlabaf-270105-0815",
      photoRef: "photo-1",
      destinataire: { nom: "Ngo Thérèse", telephone: "+237699401822" },
      contenu: "Colis",
      poidsKg: 2,
      valeurDeclaree: 0,
      assurer: false,
      mode: "gare",
      paiement: { moyen: "mtn_momo" },
    });
    expect(cree.colis.retrait.code).toMatch(/^\d{6}$/);

    for (const operation of OPERATIONS_PROPRIETAIRE) {
      expect(["colis.creer", "colis.lire", "colis.livraison"]).toContain(operation.nom);
    }
  });

  it("le code remis à l'expéditeur est bien celui que vérifie le haché du domaine", async () => {
    const colis = await bancDe("ColisCode").client.executer(OP_COLIS, {
      colisId: ecrans.ColisCode.donnees.retrait._colisId,
    });
    const entite = ecrans.ColisCode.entites.colis![0]!;
    expect(
      await verifierCodeRetrait(colis.retrait.code, entite.codeRetraitHache, entite.codeRetraitSel),
    ).toBe(true);
  });

  it("un mauvais code échoue sans jamais répéter ni le code saisi ni le bon", async () => {
    const erreurs: ErreurApi[] = [];
    const relais = bancDe("RelaisApp").client;
    for (const code of ["123456", "654321", "000111", CODE_RETRAIT_COLIS_0017]) {
      await relais
        .executer(OP_REMETTRE_COLIS_RELAIS, { colisId: colis0017, code, ...piece })
        .catch((e: ErreurApi) => erreurs.push(e));
    }
    const livreur = bancDe("Livreur").client;
    const espace = await livreur.executer(OP_ESPACE_LIVREUR, undefined);
    await livreur.executer(OP_ACCEPTER_MISSION, { missionId: espace.mission!.id });
    await livreur
      .executer(OP_REMETTRE_COLIS_LIVREUR, {
        missionId: espace.mission!.id,
        code: "135790",
        ...piece,
      })
      .catch((e: ErreurApi) => erreurs.push(e));
    expect(erreurs).toHaveLength(5);
    for (const e of erreurs) {
      expect(e).toBeInstanceOf(ErreurHttp);
      const lisible = JSON.stringify({
        message: e.message,
        code: (e as ErreurHttp).code,
        details: (e as ErreurHttp).details,
      });
      for (const code of [...CODES, "123456", "654321", "000111", "135790"])
        expect(lisible).not.toContain(code);
    }
    expect(erreurs.map((e) => (e as ErreurHttp).code)).toEqual([
      "code_invalide",
      "code_invalide",
      "code_bloque",
      "code_bloque",
      "code_invalide",
    ]);
  });
});

describe("les schémas partenaire refusent tout code de retrait", () => {
  const partenaire: c.ColisPartenaire = {
    id: "colis-1",
    numero: "C-DLA-270105-0017",
    etat: "en_relais",
    mode: "relais",
    poidsKg: 2,
    assure: true,
    valeurAssuree: 25_000,
    expediteur: { nom: "Ngo Aïcha" },
    destinataire: { nom: "Ngo Thérèse", telephoneMasque: "6 99 …" },
    codeRequis: true,
    disponibleDepuis: null,
    limiteRetrait: null,
  };

  it("le schéma valide un colis partenaire sans code", () => {
    expect(c.SchemaColisPartenaire.safeParse(partenaire).success).toBe(true);
  });

  for (const champ of [
    "code",
    "codeRetrait",
    "codeRetraitHache",
    "codeRetraitSel",
    "hache",
    "sel",
  ]) {
    it(`le schéma refuse le champ « ${champ} »`, () => {
      const resultat = c.SchemaColisPartenaire.safeParse({ ...partenaire, [champ]: "482913" });
      expect(resultat.success).toBe(false);
    });
  }

  it("le schéma refuse un code caché dans une réponse imbriquée (espace relais, mission, inter-agences)", async () => {
    const espace = await bancDe("RelaisApp").client.executer(OP_ESPACE_RELAIS, undefined);
    const fuyant = structuredClone(espace) as Record<string, unknown>;
    (fuyant["remiseEnCours"] as { colis: Record<string, unknown> }).colis["codeRetrait"] =
      CODE_RETRAIT_COLIS_0017;
    expect(c.SchemaEspaceRelais.safeParse(fuyant).success).toBe(false);

    const livreur = await bancDe("Livreur").client.executer(OP_ESPACE_LIVREUR, undefined);
    const mission = structuredClone(livreur.mission) as Record<string, unknown>;
    (mission["colis"] as Record<string, unknown>)["code"] = CODE_RETRAIT_COLIS_0017;
    expect(c.SchemaMissionLivraison.safeParse(mission).success).toBe(false);
    expect(
      c.SchemaMissionLivraison.safeParse({ ...livreur.mission, codeRetrait: "482913" }).success,
    ).toBe(false);

    const inter = await bancDe("InterAgences").client.executer(OP_INTER_AGENCES, undefined);
    const colisInterAgences = structuredClone(inter.colis[0]) as Record<string, unknown>;
    (colisInterAgences["colis"] as Record<string, unknown>)["codeRetraitHache"] = "ab";
    expect(c.SchemaColisEnCorrespondance.safeParse(colisInterAgences).success).toBe(false);
  });

  it("le client mock rejette (ErreurValidation) une implémentation qui laisserait fuir le code", async () => {
    const source: SourceScenarios = {
      noms: () => ["defaut"],
      charger: (nom) => ({
        nom,
        operations: [
          implementer(OP_COLIS_RELAIS, () => ({ ...partenaire, codeRetrait: "482913" }) as never),
        ],
      }),
    };
    const client = creerClientMock({ source, latenceMs: 0 });
    await expect(client.executer(OP_COLIS_RELAIS, { colisId: "colis-1" })).rejects.toBeInstanceOf(
      ErreurValidation,
    );
  });

  it("fuitesCodeRetrait trouve le code sous toutes ses formes", () => {
    expect(c.fuitesCodeRetrait({ a: { codeRetrait: "x" } })).toEqual(["a.codeRetrait"]);
    expect(c.fuitesCodeRetrait({ t: "Éric demande le code 482 913" }, ["482913"])).toEqual(["t"]);
    expect(c.fuitesCodeRetrait({ t: ["48-29-13"] }, ["482913"])).toEqual(["t[0]"]);
    expect(c.fuitesCodeRetrait({ n: 482913 }, ["482913"])).toEqual(["n"]);
    expect(c.fuitesCodeRetrait({ t: "R-BAF-0215", n: 215 }, ["482913"])).toEqual([]);
  });
});
