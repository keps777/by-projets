import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import type {
  BilletCorrespondanceStocke,
  BilletEmis,
  ColisInterAgencesStocke,
  ContestationStockee,
  ConventionStockee,
  Creance,
  DepartInterAgences,
  InvitationStockee,
  MomoCompagnie,
  ReglementStocke,
  TronconBillet,
  TronconPlan,
} from "../modele";
import type {
  AnnuaireCompagnies,
  BilletsCorrespondance,
  BilletsEmis,
  ColisInterAgences,
  CompteursReferences,
  Contestations,
  ConventionsRepository,
  DepartsInterAgences,
  InvitationsCompagnies,
  Reglements,
} from "../ports";
import { versIsoDouala } from "../temps";

/**
 * Contrat des ports du module inter-agences : les mêmes tests passent sur la mémoire et sur PostgreSQL. Un
 * comportement que l'une a et que l'autre n'a pas fait échouer l'un des deux : c'est ce qui prouve que la
 * mémoire, sur laquelle tournent tous les autres tests, se comporte comme la base (une seule convention
 * ouverte par paire, une opération réglée une seule fois, un plan par colis…).
 */

export interface DepartPose {
  compagnieId: string;
  origine: string;
  destination: string;
  heureDepart: string;
  dureeMinutes: number;
  bus: string;
  /** Départ annulé : la base ne le propose jamais (la mémoire ne l'enregistre simplement pas). */
  annule?: boolean;
}

export interface BancInterAgences {
  conventions: ConventionsRepository;
  colis: ColisInterAgences;
  billets: BilletsCorrespondance;
  reglements: Reglements;
  contestations: Contestations;
  invitations: InvitationsCompagnies;
  compteurs: CompteursReferences;
  annuaire: AnnuaireCompagnies;
  departs: DepartsInterAgences;
  emis: BilletsEmis;
  /** Un compte (en base : une ligne `personne`). */
  personne(): Promise<string>;
  /** Une compagnie (en base : une ligne `compagnie`). */
  compagnie(): Promise<string>;
  /** Un colis qui existe (en base : une ligne `colis`). */
  colisExistant(): Promise<string>;
  /** Un billet vendu (en base : une ligne `billet` et ce qu'elle suppose). */
  billetVendu(): Promise<{ id: string; numero: string }>;
  /** Une compagnie dans l'annuaire, avec son nom court et son compte MoMo éventuel. */
  poserCompagnie(o: { nom: string; momo: MomoCompagnie | null }): Promise<string>;
  /** Un départ de la billetterie ; rend ce que `DepartsInterAgences` doit en lire. */
  poserDepart(o: DepartPose): Promise<DepartInterAgences>;
  /** Un billet vendu d'un départ ; rend ce que `BilletsEmis` doit en lire. */
  poserBillet(o: {
    compagnieId: string;
    departId: string;
    voyageur: { nom: string; telephone: string };
    prix: number;
    annule?: boolean;
  }): Promise<BilletEmis>;
  fermer(): Promise<void>;
}

export const T0 = "2027-01-05T09:00:00.000+01:00";
export const apres = (minutes: number, depuis = T0): string =>
  versIsoDouala(Date.parse(depuis) + minutes * 60_000);

let compteur = 0;
const suivant = (): number => {
  compteur += 1;
  return compteur;
};

export function uneConvention(
  a: string,
  b: string,
  signataires: { a: string; b: string },
  o: Partial<ConventionStockee> = {},
): ConventionStockee {
  return {
    id: randomUUID(),
    version: 1,
    compagnieA: a,
    compagnieB: b,
    statut: "active",
    renouvellement: "trimestriel",
    parts: {
      colisType: { poidsKg: 3, prix: 3000 },
      lignes: [
        { troncon: "Douala → Bafoussam", parts: { [a]: 1400, [b]: null } },
        { troncon: "Bafoussam → Bamenda", parts: { [a]: null, [b]: 1200 } },
        { troncon: "Transbordement à Bafoussam", parts: { [a]: 200, [b]: 200 } },
      ],
    },
    voyageurs: {
      garantieMinutes: 25,
      attenteMinutes: 15,
      lignes: [
        {
          origine: "Yaoundé",
          via: "Bafoussam",
          destination: "Bamenda",
          premiere: a,
          parts: { [a]: 4000, [b]: 3000 },
        },
      ],
    },
    proposeeLe: T0,
    signatures: [
      { compagnieId: a, personneId: signataires.a, signeLe: T0 },
      { compagnieId: b, personneId: signataires.b, signeLe: T0 },
    ],
    activeLe: T0,
    denonciation: null,
    ...o,
  };
}

const troncon = (rang: number, compagnieId: string, part: number): TronconPlan => ({
  rang,
  compagnieId,
  departId: randomUUID(),
  origine: rang === 1 ? "Douala" : "Bafoussam",
  destination: rang === 1 ? "Bafoussam" : "Bamenda",
  heureDepart: apres(rang * 100),
  heureArrivee: apres(rang * 100 + 90),
  bus: `LT ${100 + rang} AB`,
  part,
});

export function unPlanColis(
  colisId: string,
  convention: ConventionStockee,
  creePar: string,
  o: Partial<ColisInterAgencesStocke> = {},
): ColisInterAgencesStocke {
  return {
    colisId,
    version: 1,
    numero: `C-TST-270105-${suivant()}`,
    conventionId: convention.id,
    emettriceId: convention.compagnieA,
    prix: 3000,
    troncons: [troncon(1, convention.compagnieA, 1600), troncon(2, convention.compagnieB, 1400)],
    transferts: [
      {
        rang: 1,
        cedantId: convention.compagnieA,
        preneurId: convention.compagnieB,
        remis: null,
        recu: null,
      },
    ],
    creeLe: T0,
    creePar,
    ...o,
  };
}

export function unBilletCorrespondance(
  vendu: { id: string; numero: string },
  convention: ConventionStockee,
  creePar: string,
  o: Partial<BilletCorrespondanceStocke> = {},
): BilletCorrespondanceStocke {
  const troncons: TronconBillet[] = [
    { ...troncon(1, convention.compagnieA, 4000), etat: "prevu", embarqueLe: null },
    { ...troncon(2, convention.compagnieB, 3000), etat: "prevu", embarqueLe: null },
  ];
  return {
    id: vendu.id,
    version: 1,
    numero: vendu.numero,
    conventionId: convention.id,
    emettriceId: convention.compagnieA,
    voyageur: { nom: "Éloïse Tchamba", telephone: "+237699887766" },
    prix: 7000,
    troncons,
    arriveePremierBus: null,
    replacement: null,
    creeLe: T0,
    creePar,
    ...o,
  };
}

export const uneCreance = (convention: ConventionStockee, o: Partial<Creance> = {}): Creance => {
  const id = randomUUID();
  return {
    cle: `colis:${id}:1`,
    type: "colis",
    reference: id,
    numero: `C-TST-270105-${suivant()}`,
    conventionId: convention.id,
    debiteurId: convention.compagnieA,
    creancierId: convention.compagnieB,
    montant: 1400,
    acquiseLe: T0,
    ...o,
  };
};

export function unReglement(
  convention: ConventionStockee,
  lignes: Creance[],
  o: Partial<ReglementStocke> = {},
): ReglementStocke {
  const montant = lignes.reduce((s, c) => s + c.montant, 0);
  return {
    cle: `${convention.id}:${suivant()}`,
    conventionId: convention.id,
    paiementLe: apres(24 * 60),
    gelLe: apres(12 * 60),
    lignes,
    debiteurId: montant === 0 ? null : convention.compagnieA,
    creancierId: montant === 0 ? null : convention.compagnieB,
    montant,
    etat: montant === 0 ? "sans_solde" : "a_payer",
    reference: null,
    payeLe: null,
    erreur: null,
    ...o,
  };
}

export function uneContestation(
  compagnieId: string,
  personneId: string,
  conventionIds: string[],
  cles: string[],
  o: Partial<ContestationStockee> = {},
): ContestationStockee {
  return {
    reference: `CTX-270105-${suivant()}-${randomUUID().slice(0, 4)}`,
    conventionIds,
    compagnieId,
    personneId,
    motif: "Le colis n'a jamais été remis à la deuxième compagnie",
    cles,
    deposeeLe: T0,
    recevable: true,
    statut: "ouverte",
    resolueLe: null,
    resoluePar: null,
    ...o,
  };
}

export function uneInvitation(
  compagnieId: string,
  personneId: string,
  o: Partial<InvitationStockee> = {},
): InvitationStockee {
  const telephone = o.telephone ?? "+237677001122";
  return {
    reference: `INV-270105-${suivant()}-${randomUUID().slice(0, 4)}`,
    cle: `${compagnieId}:${telephone}:270105`,
    compagnieId,
    personneId,
    nomCompagnie: "Oméga Express",
    telephone,
    envoyeeLe: T0,
    ...o,
  };
}

export function contratPortsInterAgences(
  titre: string,
  creerBanc: () => Promise<BancInterAgences>,
): void {
  describe(titre, () => {
    let banc: BancInterAgences | null = null;
    const obtenir = async (): Promise<BancInterAgences> => (banc ??= await creerBanc());
    afterAll(async () => {
      await banc?.fermer();
    });

    /** Deux compagnies, leurs patrons et une convention en vigueur (écrite). */
    const decor = async (o: Partial<ConventionStockee> = {}) => {
      const b = await obtenir();
      const [a, c] = [await b.compagnie(), await b.compagnie()];
      const [pa, pc] = [await b.personne(), await b.personne()];
      const convention = uneConvention(a, c, { a: pa, b: pc }, o);
      expect(await b.conventions.ajouter(convention)).toBe("ajoutee");
      return { b, a, c, pa, pc, convention };
    };

    describe("ConventionsRepository", () => {
      it("garde une convention telle qu'elle a été écrite, signatures dans l'ordre", async () => {
        const b = await obtenir();
        const [a, c] = [await b.compagnie(), await b.compagnie()];
        const [pa, pc] = [await b.personne(), await b.personne()];
        const convention = uneConvention(
          a,
          c,
          { a: pa, b: pc },
          { denonciation: { par: a, le: apres(60), effetLe: apres(60 + 30 * 24 * 60) } },
        );
        expect(await b.conventions.ajouter(convention)).toBe("ajoutee");
        // Deux signatures au même instant : l'ordre d'écriture est conservé.
        expect(await b.conventions.trouver(convention.id)).toEqual(convention);
        expect(await b.conventions.trouver(randomUUID())).toBeNull();
        expect(await b.conventions.trouver("pas-un-uuid")).toBeNull();
      });

      it("une proposition n'a que la signature de son auteur et pas d'entrée en vigueur", async () => {
        const b = await obtenir();
        const [a, c] = [await b.compagnie(), await b.compagnie()];
        const pa = await b.personne();
        const proposee = uneConvention(
          a,
          c,
          { a: pa, b: pa },
          {
            statut: "proposee",
            activeLe: null,
            signatures: [{ compagnieId: a, personneId: pa, signeLe: T0 }],
          },
        );
        expect(await b.conventions.ajouter(proposee)).toBe("ajoutee");
        expect(await b.conventions.trouver(proposee.id)).toEqual(proposee);
      });

      it("une seule convention ouverte par paire de compagnies, dans l'ordre que l'on veut", async () => {
        const { b, a, c, pa, pc, convention } = await decor();
        const inverse = uneConvention(c, a, { a: pc, b: pa });
        expect(await b.conventions.ajouter(inverse)).toBe("paire_deja_ouverte");
        expect(await b.conventions.ajouter(uneConvention(a, c, { a: pa, b: pc }))).toBe(
          "paire_deja_ouverte",
        );
        expect(await b.conventions.trouver(inverse.id)).toBeNull();
        // Un identifiant déjà pris est refusé aussi.
        expect(await b.conventions.ajouter(convention)).toBe("paire_deja_ouverte");
        // Une autre paire, sans problème.
        const d = await b.compagnie();
        expect(await b.conventions.ajouter(uneConvention(a, d, { a: pa, b: pc }))).toBe("ajoutee");
      });

      it("proposée ou suspendue, la convention occupe encore la paire ; résiliée, elle la libère", async () => {
        for (const statut of ["proposee", "suspendue"] as const) {
          const { b, a, c, pa, pc } = await decor({
            statut,
            ...(statut === "proposee" ? { activeLe: null } : {}),
          });
          expect(await b.conventions.ajouter(uneConvention(c, a, { a: pc, b: pa }))).toBe(
            "paire_deja_ouverte",
          );
        }
        const { b, a, c, pa, pc, convention } = await decor({ statut: "resiliee" });
        const nouvelle = uneConvention(c, a, { a: pc, b: pa });
        expect(await b.conventions.ajouter(nouvelle)).toBe("ajoutee");
        expect((await b.conventions.entre(a, c)).map((x) => x.id).sort()).toEqual(
          [convention.id, nouvelle.id].sort(),
        );
      });

      it("de huit propositions simultanées pour la même paire, une seule est acceptée", async () => {
        const b = await obtenir();
        const [a, c] = [await b.compagnie(), await b.compagnie()];
        const pa = await b.personne();
        const essais = await Promise.all(
          Array.from({ length: 8 }, (_, i) =>
            b.conventions.ajouter(uneConvention(i % 2 ? a : c, i % 2 ? c : a, { a: pa, b: pa })),
          ),
        );
        expect(essais.filter((r) => r === "ajoutee")).toHaveLength(1);
        expect((await b.conventions.entre(a, c)).length).toBe(1);
      });

      it("liste les conventions d'une compagnie, de la plus récente à la plus ancienne", async () => {
        const b = await obtenir();
        const [a, c, d, e] = [
          await b.compagnie(),
          await b.compagnie(),
          await b.compagnie(),
          await b.compagnie(),
        ];
        const p = await b.personne();
        const vieille = uneConvention(a, c, { a: p, b: p }, { proposeeLe: apres(-3 * 24 * 60) });
        const recente = uneConvention(d, a, { a: p, b: p }, { proposeeLe: apres(-24 * 60) });
        const autre = uneConvention(c, e, { a: p, b: p });
        for (const x of [vieille, recente, autre]) await b.conventions.ajouter(x);
        expect((await b.conventions.lister(a)).map((x) => x.id)).toEqual([recente.id, vieille.id]);
        expect((await b.conventions.lister(e)).map((x) => x.id)).toEqual([autre.id]);
        expect(await b.conventions.lister(await b.compagnie())).toEqual([]);
        expect(await b.conventions.lister("pas-un-uuid")).toEqual([]);
        expect((await b.conventions.entre(c, a)).map((x) => x.id)).toEqual([vieille.id]);
        const toutes = (await b.conventions.toutes()).map((x) => x.id);
        expect(toutes).toEqual(expect.arrayContaining([vieille.id, recente.id, autre.id]));
      });

      it("remplacer exige la version lue : de cinq écritures simultanées, une seule passe", async () => {
        const { b, convention } = await decor();
        const essais = await Promise.all(
          [1, 2, 3, 4, 5].map((i) =>
            b.conventions.remplacer(
              {
                ...convention,
                statut: "suspendue",
                renouvellement: i % 2 ? "annuel" : "trimestriel",
              },
              1,
            ),
          ),
        );
        expect(essais.filter(Boolean)).toHaveLength(1);
        const lue = (await b.conventions.trouver(convention.id))!;
        expect(lue).toMatchObject({ version: 2, statut: "suspendue" });
        expect(await b.conventions.remplacer({ ...lue, statut: "active" }, 1)).toBe(false);
        expect(await b.conventions.remplacer({ ...lue, statut: "active" }, 2)).toBe(true);
        expect((await b.conventions.trouver(convention.id))?.version).toBe(3);
        expect(await b.conventions.remplacer(convention, 1)).toBe(false);
      });

      it("la signature de la seconde compagnie s'ajoute à la proposition, avec l'entrée en vigueur", async () => {
        const b = await obtenir();
        const [a, c] = [await b.compagnie(), await b.compagnie()];
        const [pa, pc] = [await b.personne(), await b.personne()];
        const proposee = uneConvention(
          a,
          c,
          { a: pa, b: pc },
          {
            statut: "proposee",
            activeLe: null,
            signatures: [{ compagnieId: a, personneId: pa, signeLe: T0 }],
          },
        );
        await b.conventions.ajouter(proposee);
        const signee: ConventionStockee = {
          ...proposee,
          statut: "active",
          activeLe: apres(10),
          signatures: [
            ...proposee.signatures,
            { compagnieId: c, personneId: pc, signeLe: apres(10) },
          ],
        };
        expect(await b.conventions.remplacer(signee, 1)).toBe(true);
        expect(await b.conventions.trouver(proposee.id)).toEqual({ ...signee, version: 2 });
        // Rejouer la même signature ne change rien.
        const lue = (await b.conventions.trouver(proposee.id))!;
        expect(await b.conventions.remplacer(lue, 2)).toBe(true);
        expect((await b.conventions.trouver(proposee.id))?.signatures).toEqual(signee.signatures);
      });
    });

    describe("ColisInterAgences", () => {
      it("garde un plan tel qu'il a été écrit, un seul par colis", async () => {
        const { b, convention, pa } = await decor();
        const plan = unPlanColis(await b.colisExistant(), convention, pa);
        expect(await b.colis.ajouter(plan)).toBe(true);
        expect(await b.colis.trouver(plan.colisId)).toEqual(plan);
        expect(await b.colis.ajouter({ ...plan, numero: "autre" })).toBe(false);
        expect((await b.colis.trouver(plan.colisId))?.numero).toBe(plan.numero);
        expect(await b.colis.trouver(randomUUID())).toBeNull();
        expect(await b.colis.trouver("pas-un-uuid")).toBeNull();
      });

      it("de cinq enregistrements simultanés du même colis, un seul plan est écrit", async () => {
        const { b, convention, pa } = await decor();
        const colisId = await b.colisExistant();
        const essais = await Promise.all(
          Array.from({ length: 5 }, () => b.colis.ajouter(unPlanColis(colisId, convention, pa))),
        );
        expect(essais.filter(Boolean)).toHaveLength(1);
      });

      it("liste par convention, et par compagnie qui a un tronçon", async () => {
        const { b, a, c, convention, pa } = await decor();
        const autre = await decor();
        const p1 = unPlanColis(await b.colisExistant(), convention, pa, { creeLe: apres(0) });
        const p2 = unPlanColis(await b.colisExistant(), convention, pa, { creeLe: apres(5) });
        const p3 = unPlanColis(await b.colisExistant(), autre.convention, autre.pa);
        for (const p of [p3, p2, p1]) await b.colis.ajouter(p);
        expect(
          (await b.colis.lister({ conventionId: convention.id })).map((p) => p.colisId),
        ).toEqual([p1.colisId, p2.colisId]);
        expect((await b.colis.lister({ compagnieId: c })).map((p) => p.colisId)).toEqual([
          p1.colisId,
          p2.colisId,
        ]);
        expect(
          (await b.colis.lister({ compagnieId: a, conventionId: autre.convention.id })).length,
        ).toBe(0);
        expect((await b.colis.lister({ compagnieId: autre.a })).map((p) => p.colisId)).toEqual([
          p3.colisId,
        ]);
        expect(await b.colis.lister({ compagnieId: "pas-un-uuid" })).toEqual([]);
        expect((await b.colis.lister()).length).toBeGreaterThanOrEqual(3);
      });

      it("remplacer exige la version lue et garde les passages de témoin", async () => {
        const { b, convention, pa, pc } = await decor();
        const plan = unPlanColis(await b.colisExistant(), convention, pa);
        await b.colis.ajouter(plan);
        const remis = {
          ...plan,
          transferts: [
            { ...plan.transferts[0]!, remis: { a: apres(10), par: pa, lieu: "Bafoussam" } },
          ],
        };
        const essais = await Promise.all([1, 2, 3].map(() => b.colis.remplacer(remis, 1)));
        expect(essais.filter(Boolean)).toHaveLength(1);
        const recu = {
          ...remis,
          transferts: [{ ...remis.transferts[0]!, recu: { a: apres(20), par: pc, lieu: null } }],
        };
        expect(await b.colis.remplacer(recu, 1)).toBe(false);
        expect(await b.colis.remplacer(recu, 2)).toBe(true);
        expect(await b.colis.trouver(plan.colisId)).toEqual({ ...recu, version: 3 });
        expect(await b.colis.remplacer(unPlanColis(randomUUID(), convention, pa), 1)).toBe(false);
      });
    });

    describe("BilletsCorrespondance", () => {
      it("garde un billet tel qu'il a été écrit, voyageur compris, et le retrouve par numéro", async () => {
        const { b, convention, pa } = await decor();
        const vendu = await b.billetVendu();
        const billet = unBilletCorrespondance(vendu, convention, pa);
        expect(await b.billets.ajouter(billet)).toBe(true);
        expect(await b.billets.trouver(vendu.id)).toEqual(billet);
        expect(await b.billets.trouverParNumero(vendu.numero)).toEqual(billet);
        expect(await b.billets.trouver(randomUUID())).toBeNull();
        expect(await b.billets.trouver("pas-un-uuid")).toBeNull();
        expect(await b.billets.trouverParNumero("inconnu")).toBeNull();
      });

      it("un billet n'est équipé qu'une fois : même identifiant, ou même numéro", async () => {
        const { b, convention, pa } = await decor();
        const [v1, v2] = [await b.billetVendu(), await b.billetVendu()];
        expect(await b.billets.ajouter(unBilletCorrespondance(v1, convention, pa))).toBe(true);
        expect(await b.billets.ajouter(unBilletCorrespondance(v1, convention, pa))).toBe(false);
        expect(
          await b.billets.ajouter(
            unBilletCorrespondance({ id: v2.id, numero: v1.numero }, convention, pa),
          ),
        ).toBe(false);
        expect(await b.billets.trouver(v2.id)).toBeNull();
        const vendu = await b.billetVendu();
        const essais = await Promise.all(
          Array.from({ length: 5 }, () =>
            b.billets.ajouter(unBilletCorrespondance(vendu, convention, pa)),
          ),
        );
        expect(essais.filter(Boolean)).toHaveLength(1);
      });

      it("liste par convention et par compagnie qui a un tronçon", async () => {
        const { b, c, convention, pa } = await decor();
        const autre = await decor();
        const b1 = unBilletCorrespondance(await b.billetVendu(), convention, pa, {
          creeLe: apres(0),
        });
        const b2 = unBilletCorrespondance(await b.billetVendu(), convention, pa, {
          creeLe: apres(5),
        });
        const b3 = unBilletCorrespondance(await b.billetVendu(), autre.convention, autre.pa);
        for (const x of [b3, b2, b1]) await b.billets.ajouter(x);
        expect((await b.billets.lister({ conventionId: convention.id })).map((x) => x.id)).toEqual([
          b1.id,
          b2.id,
        ]);
        expect((await b.billets.lister({ compagnieId: c })).map((x) => x.id)).toEqual([
          b1.id,
          b2.id,
        ]);
        expect((await b.billets.lister({ compagnieId: autre.c })).map((x) => x.id)).toEqual([
          b3.id,
        ]);
        expect(await b.billets.lister({ conventionId: "pas-un-uuid" })).toEqual([]);
      });

      it("remplacer exige la version lue et garde embarquements, arrivée et replacement", async () => {
        const { b, a, c, convention, pa } = await decor();
        const billet = unBilletCorrespondance(await b.billetVendu(), convention, pa);
        await b.billets.ajouter(billet);
        const embarque: BilletCorrespondanceStocke = {
          ...billet,
          troncons: billet.troncons.map((t, i) =>
            i === 0 ? { ...t, etat: "embarque", embarqueLe: apres(30) } : t,
          ),
          arriveePremierBus: { a: apres(120), par: pa, retardMinutes: 40 },
          replacement: {
            decideLe: apres(125),
            departId: randomUUID(),
            heureDepart: apres(24 * 60),
            bus: "OU 117 NW",
            retardataireId: a,
            montant: 3000,
          },
        };
        const essais = await Promise.all([1, 2, 3].map(() => b.billets.remplacer(embarque, 1)));
        expect(essais.filter(Boolean)).toHaveLength(1);
        expect(await b.billets.remplacer(embarque, 1)).toBe(false);
        expect(await b.billets.trouver(billet.id)).toEqual({ ...embarque, version: 2 });
        // Une compagnie de plus sur un tronçon se retrouve par la liste.
        const replace = {
          ...embarque,
          troncons: embarque.troncons.map((t, i) => (i === 1 ? { ...t, compagnieId: c } : t)),
        };
        expect(await b.billets.remplacer(replace, 2)).toBe(true);
        expect((await b.billets.lister({ compagnieId: c })).map((x) => x.id)).toContain(billet.id);
      });
    });

    describe("Reglements", () => {
      it("garde un règlement tel qu'il a été arrêté, créances comprises, et le liste dans l'ordre", async () => {
        const { b, convention } = await decor();
        const r1 = unReglement(convention, [uneCreance(convention), uneCreance(convention)], {
          paiementLe: apres(24 * 60),
        });
        const r2 = unReglement(convention, [uneCreance(convention)], {
          paiementLe: apres(8 * 24 * 60),
        });
        const sansSolde = unReglement(convention, [], { paiementLe: apres(15 * 24 * 60) });
        for (const r of [r2, sansSolde, r1]) expect(await b.reglements.ajouter(r)).toBe(true);
        expect(await b.reglements.trouver(r1.cle)).toEqual(r1);
        expect(await b.reglements.trouver(sansSolde.cle)).toEqual(sansSolde);
        expect(await b.reglements.trouver("inconnu:270105")).toBeNull();
        expect((await b.reglements.lister(convention.id)).map((r) => r.cle)).toEqual([
          r1.cle,
          r2.cle,
          sansSolde.cle,
        ]);
        expect(await b.reglements.lister("pas-un-uuid")).toEqual([]);
        expect((await b.reglements.lister()).length).toBeGreaterThanOrEqual(3);
      });

      it("un seul règlement par clé : de cinq arrêts simultanés, un seul passe", async () => {
        const { b, convention } = await decor();
        const cle = `${convention.id}:270105`;
        const essais = await Promise.all(
          Array.from({ length: 5 }, () =>
            b.reglements.ajouter(unReglement(convention, [uneCreance(convention)], { cle })),
          ),
        );
        expect(essais.filter(Boolean)).toHaveLength(1);
        expect((await b.reglements.lister(convention.id)).length).toBe(1);
      });

      it("une opération réglée ne se règle pas une seconde fois, dans aucun autre règlement", async () => {
        const { b, convention } = await decor();
        const creance = uneCreance(convention);
        expect(await b.reglements.ajouter(unReglement(convention, [creance]))).toBe(true);
        const second = unReglement(convention, [uneCreance(convention), creance]);
        await expect(b.reglements.ajouter(second)).rejects.toThrow();
        expect(await b.reglements.trouver(second.cle)).toBeNull();
        expect((await b.reglements.lister(convention.id)).length).toBe(1);
      });

      it("remplacer exige l'état attendu : de cinq paiements simultanés, un seul passe", async () => {
        const { b, convention } = await decor();
        const r = unReglement(convention, [uneCreance(convention)]);
        await b.reglements.ajouter(r);
        expect(
          await b.reglements.remplacer({ ...r, erreur: "compte_momo_manquant" }, "a_payer"),
        ).toBe(true);
        expect((await b.reglements.trouver(r.cle))?.erreur).toBe("compte_momo_manquant");
        const paye: ReglementStocke = {
          ...r,
          etat: "paye",
          reference: "MOMO-000001",
          payeLe: apres(24 * 60 + 2),
          erreur: null,
        };
        const essais = await Promise.all(
          [1, 2, 3, 4, 5].map(() => b.reglements.remplacer(paye, "a_payer")),
        );
        expect(essais.filter(Boolean)).toHaveLength(1);
        expect(await b.reglements.trouver(r.cle)).toEqual(paye);
        expect(await b.reglements.remplacer(paye, "a_payer")).toBe(false);
        expect(await b.reglements.remplacer({ ...r, cle: "inconnue:270105" }, "a_payer")).toBe(
          false,
        );
      });
    });

    describe("Contestations", () => {
      it("garde une contestation telle qu'elle a été déposée, et refuse une référence déjà prise", async () => {
        const { b, a, pa, convention } = await decor();
        const creance = uneCreance(convention);
        const c = uneContestation(a, pa, [convention.id], [creance.cle]);
        expect(await b.contestations.ajouter(c)).toBe(true);
        expect(await b.contestations.trouver(c.reference)).toEqual(c);
        expect(await b.contestations.ajouter({ ...c, motif: "autre" })).toBe(false);
        expect((await b.contestations.trouver(c.reference))?.motif).toBe(c.motif);
        expect(await b.contestations.trouver("CTX-000000-0")).toBeNull();
        const reference = `CTX-270105-${randomUUID().slice(0, 6)}`;
        const essais = await Promise.all(
          Array.from({ length: 5 }, () => b.contestations.ajouter({ ...c, reference })),
        );
        expect(essais.filter(Boolean)).toHaveLength(1);
      });

      it("une contestation irrecevable ne retient rien : ni opération ni convention", async () => {
        const { b, a, pa } = await decor();
        const c = uneContestation(a, pa, [], [], { recevable: false, statut: "irrecevable" });
        expect(await b.contestations.ajouter(c)).toBe(true);
        expect(await b.contestations.trouver(c.reference)).toEqual(c);
      });

      it("liste par convention, par compagnie et par statut, dans l'ordre des dépôts", async () => {
        const { b, a, c, pa, pc, convention } = await decor();
        const k1 = uneContestation(a, pa, [convention.id], ["colis:1:1"], { deposeeLe: apres(0) });
        const k2 = uneContestation(c, pc, [convention.id], ["colis:2:1"], { deposeeLe: apres(10) });
        const k3 = uneContestation(a, pa, [convention.id], ["colis:3:1"], {
          deposeeLe: apres(20),
          statut: "accordee",
          resolueLe: apres(30),
          resoluePar: pa,
        });
        for (const k of [k3, k1, k2]) await b.contestations.ajouter(k);
        const refs = (l: ContestationStockee[]) => l.map((k) => k.reference);
        expect(refs(await b.contestations.lister({ conventionId: convention.id }))).toEqual([
          k1.reference,
          k2.reference,
          k3.reference,
        ]);
        expect(refs(await b.contestations.lister({ compagnieId: a }))).toEqual([
          k1.reference,
          k3.reference,
        ]);
        expect(
          refs(await b.contestations.lister({ conventionId: convention.id, statut: "ouverte" })),
        ).toEqual([k1.reference, k2.reference]);
        expect(await b.contestations.lister({ conventionId: "pas-un-uuid" })).toEqual([]);
        expect(await b.contestations.lister({ conventionId: randomUUID() })).toEqual([]);
      });

      it("remplacer exige le statut attendu : de cinq décisions simultanées, une seule passe", async () => {
        const { b, a, pa, convention } = await decor();
        const k = uneContestation(a, pa, [convention.id], ["colis:9:1"]);
        await b.contestations.ajouter(k);
        const accordee: ContestationStockee = {
          ...k,
          statut: "accordee",
          resolueLe: apres(60),
          resoluePar: pa,
        };
        const essais = await Promise.all(
          [1, 2, 3, 4, 5].map(() => b.contestations.remplacer(accordee, "ouverte")),
        );
        expect(essais.filter(Boolean)).toHaveLength(1);
        expect(await b.contestations.trouver(k.reference)).toEqual(accordee);
        expect(await b.contestations.remplacer({ ...accordee, statut: "rejetee" }, "ouverte")).toBe(
          false,
        );
        expect(
          await b.contestations.remplacer({ ...k, reference: "CTX-000000-9" }, "ouverte"),
        ).toBe(false);
      });
    });

    describe("InvitationsCompagnies et CompteursReferences", () => {
      it("une invitation par compagnie, numéro et jour : la seconde rend la première", async () => {
        const b = await obtenir();
        const [a, p] = [await b.compagnie(), await b.personne()];
        const inv = uneInvitation(a, p, { nomCompagnie: "Oméga Express — Ébolowa" });
        expect(await b.invitations.parCle(inv.cle)).toBeNull();
        expect(await b.invitations.ajouterOuExistante(inv)).toEqual({
          invitation: inv,
          nouvelle: true,
        });
        expect(await b.invitations.parCle(inv.cle)).toEqual(inv);
        const rejeu = uneInvitation(a, p, { cle: inv.cle, telephone: inv.telephone });
        expect(await b.invitations.ajouterOuExistante(rejeu)).toEqual({
          invitation: inv,
          nouvelle: false,
        });
        // Un autre numéro, ou un autre jour : une nouvelle invitation.
        const autreNumero = uneInvitation(a, p, { telephone: "+237699001122" });
        expect((await b.invitations.ajouterOuExistante(autreNumero)).nouvelle).toBe(true);
      });

      it("de cinq envois simultanés, une seule invitation est créée (un seul SMS)", async () => {
        const b = await obtenir();
        const [a, p] = [await b.compagnie(), await b.personne()];
        const cle = `${a}:+237655000999:270105`;
        const rendus = await Promise.all(
          Array.from({ length: 5 }, () =>
            b.invitations.ajouterOuExistante(
              uneInvitation(a, p, { cle, telephone: "+237655000999" }),
            ),
          ),
        );
        expect(rendus.filter((r) => r.nouvelle)).toHaveLength(1);
        expect(new Set(rendus.map((r) => r.invitation.reference)).size).toBe(1);
      });

      it("les références se comptent par préfixe, à partir de 1, sans trou ni doublon", async () => {
        const b = await obtenir();
        const prefixe = `INV-${suivant() + 300000}`;
        expect(await b.compteurs.prochain(prefixe)).toBe(1);
        expect(await b.compteurs.prochain(prefixe)).toBe(2);
        expect(await b.compteurs.prochain(`${prefixe}-autre`)).toBe(1);
        const numeros = await Promise.all(
          Array.from({ length: 20 }, () => b.compteurs.prochain(prefixe)),
        );
        expect([...numeros].sort((x, y) => x - y)).toEqual(
          Array.from({ length: 20 }, (_, i) => i + 3),
        );
      });
    });

    describe("lectures dans les autres modules", () => {
      it("AnnuaireCompagnies : le nom court et le compte MoMo, ou pas de compte", async () => {
        const b = await obtenir();
        const alpha = await b.poserCompagnie({
          nom: "Alpha",
          momo: { telephone: "+237670000001", operateur: "mtn" },
        });
        const sansCompte = await b.poserCompagnie({ nom: "Oméga", momo: null });
        expect(await b.annuaire.trouver(alpha)).toEqual({
          id: alpha,
          nom: "Alpha",
          momo: { telephone: "+237670000001", operateur: "mtn" },
        });
        expect(await b.annuaire.trouver(sansCompte)).toEqual({
          id: sansCompte,
          nom: "Oméga",
          momo: null,
        });
        expect(await b.annuaire.trouver(randomUUID())).toBeNull();
        expect(await b.annuaire.trouver("pas-un-uuid")).toBeNull();
      });

      it("DepartsInterAgences : le trajet par villes, l'arrivée prévue, le bus", async () => {
        const b = await obtenir();
        const compagnieId = await b.poserCompagnie({ nom: "Alpha", momo: null });
        const depart = await b.poserDepart({
          compagnieId,
          origine: "Douala",
          destination: "Bafoussam",
          heureDepart: "2027-01-05T10:00:00.000+01:00",
          dureeMinutes: 300,
          bus: "LT 118 AB",
        });
        expect(depart).toEqual({
          id: depart.id,
          compagnieId,
          origine: "Douala",
          destination: "Bafoussam",
          heureDepart: "2027-01-05T10:00:00.000+01:00",
          arriveePrevue: "2027-01-05T15:00:00.000+01:00",
          bus: "LT 118 AB",
        });
        expect(await b.departs.trouver(depart.id)).toEqual(depart);
        expect(await b.departs.trouver(randomUUID())).toBeNull();
        expect(await b.departs.trouver("pas-un-uuid")).toBeNull();
      });

      it("DepartsInterAgences.prochain : le premier départ de la compagnie sur ce trajet, strictement après", async () => {
        const b = await obtenir();
        const omega = await b.poserCompagnie({ nom: "Oméga", momo: null });
        const autre = await b.poserCompagnie({ nom: "Bêta", momo: null });
        const trajet = { origine: "Bafoussam", destination: "Bamenda", dureeMinutes: 150 };
        const matin = await b.poserDepart({
          ...trajet,
          compagnieId: omega,
          heureDepart: "2027-01-05T15:40:00.000+01:00",
          bus: "OU 302 NW",
        });
        const lendemain = await b.poserDepart({
          ...trajet,
          compagnieId: omega,
          heureDepart: "2027-01-06T08:00:00.000+01:00",
          bus: "OU 117 NW",
        });
        const tard = await b.poserDepart({
          ...trajet,
          compagnieId: omega,
          heureDepart: "2027-01-07T08:00:00.000+01:00",
          bus: "OU 118 NW",
        });
        await b.poserDepart({
          ...trajet,
          compagnieId: autre,
          heureDepart: "2027-01-05T16:00:00.000+01:00",
          bus: "BX 009 NW",
        });
        await b.poserDepart({
          ...trajet,
          compagnieId: omega,
          origine: "Bamenda",
          destination: "Bafoussam",
          heureDepart: "2027-01-05T17:00:00.000+01:00",
          bus: "OU 119 NW",
        });
        const critere = { compagnieId: omega, origine: "Bafoussam", destination: "Bamenda" };
        expect(
          await b.departs.prochain({ ...critere, apres: "2027-01-05T12:00:00.000+01:00" }),
        ).toEqual(matin);
        // « Strictement après » : à l'heure exacte du départ, c'est le suivant.
        expect(await b.departs.prochain({ ...critere, apres: matin.heureDepart })).toEqual(
          lendemain,
        );
        expect(await b.departs.prochain({ ...critere, apres: lendemain.heureDepart })).toEqual(
          tard,
        );
        expect(await b.departs.prochain({ ...critere, apres: tard.heureDepart })).toBeNull();
        expect(
          await b.departs.prochain({ ...critere, destination: "Douala", apres: T0 }),
        ).toBeNull();
        expect(
          await b.departs.prochain({ ...critere, compagnieId: "pas-un-uuid", apres: T0 }),
        ).toBeNull();
      });

      it("DepartsInterAgences.prochain ne propose jamais un départ annulé", async () => {
        const b = await obtenir();
        const omega = await b.poserCompagnie({ nom: "Oméga", momo: null });
        const trajet = {
          compagnieId: omega,
          origine: "Yaoundé",
          destination: "Garoua",
          dureeMinutes: 600,
        };
        await b.poserDepart({
          ...trajet,
          heureDepart: "2027-01-05T18:00:00.000+01:00",
          bus: "OU 1 NW",
          annule: true,
        });
        const valable = await b.poserDepart({
          ...trajet,
          heureDepart: "2027-01-05T20:00:00.000+01:00",
          bus: "OU 2 NW",
        });
        expect(
          await b.departs.prochain({
            compagnieId: omega,
            origine: "Yaoundé",
            destination: "Garoua",
            apres: "2027-01-05T12:00:00.000+01:00",
          }),
        ).toEqual(valable);
      });

      it("BilletsEmis : par identifiant ou par numéro, voyageur, prix et annulation", async () => {
        const b = await obtenir();
        const compagnieId = await b.poserCompagnie({ nom: "Alpha", momo: null });
        const depart = await b.poserDepart({
          compagnieId,
          origine: "Yaoundé",
          destination: "Bafoussam",
          heureDepart: "2027-01-05T11:00:00.000+01:00",
          dureeMinutes: 240,
          bus: "LT 204 AB",
        });
        const billet = await b.poserBillet({
          compagnieId,
          departId: depart.id,
          voyageur: { nom: "Éloïse Tchamba", telephone: "+237699887766" },
          prix: 7000,
        });
        expect(billet).toMatchObject({
          compagnieId,
          departId: depart.id,
          voyageur: { nom: "Éloïse Tchamba", telephone: "+237699887766" },
          prix: 7000,
          annule: false,
        });
        expect(await b.emis.trouver(billet.id)).toEqual(billet);
        expect(await b.emis.trouver(billet.numero)).toEqual(billet);
        const annule = await b.poserBillet({
          compagnieId,
          departId: depart.id,
          voyageur: { nom: "Paul Ekani", telephone: "+237677112233" },
          prix: 7000,
          annule: true,
        });
        expect((await b.emis.trouver(annule.numero))?.annule).toBe(true);
        expect(await b.emis.trouver(randomUUID())).toBeNull();
        expect(await b.emis.trouver("ALP-INCONNU-0000")).toBeNull();
      });
    });
  });
}
