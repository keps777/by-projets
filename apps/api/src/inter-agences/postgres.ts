import { Injectable } from "@nestjs/common";
import { Passagers } from "../billetterie/passagers";
import {
  dateDe,
  dateOuNul,
  estUuid,
  iso,
  isoOuNul,
  json,
  jsonOuNul,
  porteCode,
} from "../relais/postgres";
import { ChiffrementService } from "../socle/chiffrement/chiffrement.service";
import { Prisma } from "../socle/db/generated/client";
import { PrismaService } from "../socle/db/prisma.service";
import type {
  BilletCorrespondanceStocke,
  BilletEmis,
  ColisInterAgencesStocke,
  CompagnieRef,
  ContestationStockee,
  ConventionStockee,
  Creance,
  DepartInterAgences,
  InvitationStockee,
  ReglementStocke,
  StatutContestation,
  TransfertPlan,
  TronconBillet,
  TronconPlan,
} from "./modele";
import {
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
  type FiltreEchanges,
  type ResultatAjoutConvention,
} from "./ports";
import { versIsoDouala } from "./temps";

/**
 * Adaptateurs PostgreSQL (Prisma) du module inter-agences. Tables : `convention_inter_agences`,
 * `signature_convention`, `colis_inter_agences`, `billet_correspondance`, `reglement_inter_agences`,
 * `creance_reglee`, `contestation_reglement`, `invitation_compagnie`, `compte_momo_compagnie`, plus
 * `compteur_dossier` (déjà là, partagée avec les relais) pour les références `INV-…` et `CTX-…` (migration
 * `20261017000806_inter_agences`). Lit aussi `compagnie`, `depart`, `ligne`, `gare`, `bus` et `billet`
 * de la billetterie. Nom et téléphone du voyageur, téléphone des invitations et numéros MoMo des
 * compagnies ne sont jamais écrits en clair.
 *
 * Les garanties tiennent dans la base :
 * - **une seule convention ouverte par paire de compagnies**, quel que soit l'ordre : index unique partiel sur
 *   la paire triée (`convention_inter_agences_une_ouverte`) ;
 * - **concurrence optimiste** : `remplacer` est un `UPDATE … WHERE id = $1 AND version = $2` ;
 * - **un plan par colis, un par billet** : clés primaires, `INSERT … ON CONFLICT DO NOTHING` ;
 * - **un règlement par convention et par lundi** : clé primaire `cle` ; **une opération ne se règle qu'une
 *   fois** : clé primaire de `creance_reglee`, écrite dans la même transaction que le règlement ;
 * - **un règlement clos, une contestation close ne bougent plus** : déclencheurs ; `remplacer` est un
 *   `UPDATE … WHERE … AND etat = $attendu` ;
 * - **références sans trou ni doublon** : `INSERT … ON CONFLICT DO UPDATE … RETURNING`.
 */

export const CONTEXTE_VOYAGEUR_NOM = "inter-agences.voyageur.nom";
export const CONTEXTE_VOYAGEUR_TELEPHONE = "inter-agences.voyageur.telephone";
export const CONTEXTE_INVITATION_TELEPHONE = "inter-agences.invitation.telephone";
export const CONTEXTE_MOMO_COMPAGNIE = "inter-agences.momo.telephone";

/** Les compagnies qui ont un tronçon : ce qui permet de retrouver les échanges d'une compagnie. */
const compagniesDe = (troncons: readonly { compagnieId: string }[]): string[] => [
  ...new Set(troncons.map((t) => t.compagnieId)),
];

/* ------------------------------------------------------------------ conventions */

type LigneConvention = Prisma.ConventionInterAgencesGetPayload<{ include: { signatures: true } }>;

@Injectable()
export class ConventionsPrisma extends ConventionsRepository {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  private vers(l: LigneConvention): ConventionStockee {
    return {
      id: l.id,
      version: l.version,
      compagnieA: l.compagnieAId,
      compagnieB: l.compagnieBId,
      statut: l.statut as ConventionStockee["statut"],
      renouvellement: l.renouvellement as ConventionStockee["renouvellement"],
      parts: l.parts as unknown as ConventionStockee["parts"],
      voyageurs: l.voyageurs as unknown as ConventionStockee["voyageurs"],
      proposeeLe: iso(l.proposeeLe),
      signatures: [...l.signatures]
        .sort((a, b) => a.rang - b.rang)
        .map((s) => ({
          compagnieId: s.compagnieId,
          personneId: s.personneId,
          signeLe: iso(s.signeLe),
        })),
      activeLe: isoOuNul(l.activeLe),
      denonciation: l.denonciation as ConventionStockee["denonciation"],
    };
  }

  private signatures(c: ConventionStockee) {
    return c.signatures.map((s, rang) => ({
      conventionId: c.id,
      compagnieId: s.compagnieId,
      personneId: s.personneId,
      signeLe: dateDe(s.signeLe),
      rang,
    }));
  }

  async ajouter(convention: ConventionStockee): Promise<ResultatAjoutConvention> {
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.conventionInterAgences.create({
          data: {
            id: convention.id,
            version: 1,
            compagnieAId: convention.compagnieA,
            compagnieBId: convention.compagnieB,
            statut: convention.statut,
            renouvellement: convention.renouvellement,
            parts: json(convention.parts),
            voyageurs: json(convention.voyageurs),
            proposeeLe: dateDe(convention.proposeeLe),
            activeLe: dateOuNul(convention.activeLe),
            denonciation: jsonOuNul(convention.denonciation),
          },
        });
        await tx.signatureConvention.createMany({ data: this.signatures(convention) });
      });
      return "ajoutee";
    } catch (e) {
      // L'index unique partiel (paire déjà ouverte) ou la clé primaire (identifiant déjà pris).
      if (porteCode(e, "P2002") || porteCode(e, "23505")) return "paire_deja_ouverte";
      throw e;
    }
  }

  async trouver(id: string): Promise<ConventionStockee | null> {
    if (!estUuid(id)) return null;
    const l = await this.prisma.conventionInterAgences.findUnique({
      where: { id },
      include: { signatures: true },
    });
    return l ? this.vers(l) : null;
  }

  async lister(compagnieId: string): Promise<ConventionStockee[]> {
    if (!estUuid(compagnieId)) return [];
    const l = await this.prisma.conventionInterAgences.findMany({
      where: { OR: [{ compagnieAId: compagnieId }, { compagnieBId: compagnieId }] },
      include: { signatures: true },
      orderBy: [{ proposeeLe: "desc" }, { id: "asc" }],
    });
    return l.map((x) => this.vers(x));
  }

  async entre(compagnieA: string, compagnieB: string): Promise<ConventionStockee[]> {
    if (!estUuid(compagnieA) || !estUuid(compagnieB)) return [];
    const l = await this.prisma.conventionInterAgences.findMany({
      where: {
        OR: [
          { compagnieAId: compagnieA, compagnieBId: compagnieB },
          { compagnieAId: compagnieB, compagnieBId: compagnieA },
        ],
      },
      include: { signatures: true },
      orderBy: [{ proposeeLe: "asc" }, { id: "asc" }],
    });
    return l.map((x) => this.vers(x));
  }

  async toutes(): Promise<ConventionStockee[]> {
    const l = await this.prisma.conventionInterAgences.findMany({
      include: { signatures: true },
      orderBy: [{ proposeeLe: "asc" }, { id: "asc" }],
    });
    return l.map((x) => this.vers(x));
  }

  async remplacer(convention: ConventionStockee, versionAttendue: number): Promise<boolean> {
    if (!estUuid(convention.id)) return false;
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.conventionInterAgences.updateMany({
        where: { id: convention.id, version: versionAttendue },
        data: {
          statut: convention.statut,
          renouvellement: convention.renouvellement,
          parts: json(convention.parts),
          voyageurs: json(convention.voyageurs),
          activeLe: dateOuNul(convention.activeLe),
          denonciation: jsonOuNul(convention.denonciation),
          version: versionAttendue + 1,
        },
      });
      if (count === 0) return false;
      // Les signatures s'ajoutent, elles ne changent pas.
      await tx.signatureConvention.createMany({
        data: this.signatures(convention),
        skipDuplicates: true,
      });
      return true;
    });
  }
}

/* ------------------------------------------------------------------ colis */

type LignePlan = Prisma.PlanColisInterAgencesGetPayload<object>;

@Injectable()
export class ColisInterAgencesPrisma extends ColisInterAgences {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  private vers(l: LignePlan): ColisInterAgencesStocke {
    return {
      colisId: l.colisId,
      version: l.version,
      numero: l.numero,
      conventionId: l.conventionId,
      emettriceId: l.emettriceId,
      prix: l.prix,
      troncons: l.troncons as unknown as TronconPlan[],
      transferts: l.transferts as unknown as TransfertPlan[],
      creeLe: iso(l.creeLe),
      creePar: l.creePar,
    };
  }

  async ajouter(plan: ColisInterAgencesStocke): Promise<boolean> {
    // INSERT … ON CONFLICT DO NOTHING : le colis a déjà un plan.
    const { count } = await this.prisma.planColisInterAgences.createMany({
      data: [
        {
          colisId: plan.colisId,
          version: 1,
          numero: plan.numero,
          conventionId: plan.conventionId,
          emettriceId: plan.emettriceId,
          prix: plan.prix,
          troncons: json(plan.troncons),
          compagnieIds: compagniesDe(plan.troncons),
          transferts: json(plan.transferts),
          creeLe: dateDe(plan.creeLe),
          creePar: plan.creePar,
        },
      ],
      skipDuplicates: true,
    });
    return count === 1;
  }

  async trouver(colisId: string): Promise<ColisInterAgencesStocke | null> {
    if (!estUuid(colisId)) return null;
    const l = await this.prisma.planColisInterAgences.findUnique({ where: { colisId } });
    return l ? this.vers(l) : null;
  }

  async lister(filtre: FiltreEchanges = {}): Promise<ColisInterAgencesStocke[]> {
    if (
      (filtre.compagnieId !== undefined && !estUuid(filtre.compagnieId)) ||
      (filtre.conventionId !== undefined && !estUuid(filtre.conventionId))
    ) {
      return [];
    }
    const l = await this.prisma.planColisInterAgences.findMany({
      where: {
        ...(filtre.conventionId === undefined ? {} : { conventionId: filtre.conventionId }),
        ...(filtre.compagnieId === undefined ? {} : { compagnieIds: { has: filtre.compagnieId } }),
      },
      orderBy: [{ creeLe: "asc" }, { colisId: "asc" }],
    });
    return l.map((x) => this.vers(x));
  }

  async remplacer(plan: ColisInterAgencesStocke, versionAttendue: number): Promise<boolean> {
    if (!estUuid(plan.colisId)) return false;
    const { count } = await this.prisma.planColisInterAgences.updateMany({
      where: { colisId: plan.colisId, version: versionAttendue },
      data: {
        troncons: json(plan.troncons),
        compagnieIds: compagniesDe(plan.troncons),
        transferts: json(plan.transferts),
        version: versionAttendue + 1,
      },
    });
    return count === 1;
  }
}

/* ------------------------------------------------------------------ billets */

type LigneBillet = Prisma.BilletCorrespondanceGetPayload<object>;

@Injectable()
export class BilletsCorrespondancePrisma extends BilletsCorrespondance {
  readonly durable = true;

  constructor(
    private readonly prisma: PrismaService,
    private readonly chiffrement: ChiffrementService,
  ) {
    super();
  }

  private vers(l: LigneBillet): BilletCorrespondanceStocke {
    return {
      id: l.id,
      version: l.version,
      numero: l.numero,
      conventionId: l.conventionId,
      emettriceId: l.emettriceId,
      voyageur: {
        nom: this.chiffrement.dechiffrer(l.voyageurNomChiffre, CONTEXTE_VOYAGEUR_NOM),
        telephone: this.chiffrement.dechiffrer(
          l.voyageurTelephoneChiffre,
          CONTEXTE_VOYAGEUR_TELEPHONE,
        ),
      },
      prix: l.prix,
      troncons: l.troncons as unknown as TronconBillet[],
      arriveePremierBus: l.arriveePremierBus as BilletCorrespondanceStocke["arriveePremierBus"],
      replacement: l.replacement as BilletCorrespondanceStocke["replacement"],
      creeLe: iso(l.creeLe),
      creePar: l.creePar,
    };
  }

  async ajouter(billet: BilletCorrespondanceStocke): Promise<boolean> {
    // INSERT … ON CONFLICT DO NOTHING : identifiant ou numéro déjà équipé.
    const { count } = await this.prisma.billetCorrespondance.createMany({
      data: [
        {
          id: billet.id,
          version: 1,
          numero: billet.numero,
          conventionId: billet.conventionId,
          emettriceId: billet.emettriceId,
          voyageurNomChiffre: this.chiffrement.chiffrer(billet.voyageur.nom, CONTEXTE_VOYAGEUR_NOM),
          voyageurTelephoneChiffre: this.chiffrement.chiffrer(
            billet.voyageur.telephone,
            CONTEXTE_VOYAGEUR_TELEPHONE,
          ),
          prix: billet.prix,
          troncons: json(billet.troncons),
          compagnieIds: compagniesDe(billet.troncons),
          arriveePremierBus: jsonOuNul(billet.arriveePremierBus),
          replacement: jsonOuNul(billet.replacement),
          creeLe: dateDe(billet.creeLe),
          creePar: billet.creePar,
        },
      ],
      skipDuplicates: true,
    });
    return count === 1;
  }

  async trouver(id: string): Promise<BilletCorrespondanceStocke | null> {
    if (!estUuid(id)) return null;
    const l = await this.prisma.billetCorrespondance.findUnique({ where: { id } });
    return l ? this.vers(l) : null;
  }

  async trouverParNumero(numero: string): Promise<BilletCorrespondanceStocke | null> {
    const l = await this.prisma.billetCorrespondance.findUnique({ where: { numero } });
    return l ? this.vers(l) : null;
  }

  async lister(filtre: FiltreEchanges = {}): Promise<BilletCorrespondanceStocke[]> {
    if (
      (filtre.compagnieId !== undefined && !estUuid(filtre.compagnieId)) ||
      (filtre.conventionId !== undefined && !estUuid(filtre.conventionId))
    ) {
      return [];
    }
    const l = await this.prisma.billetCorrespondance.findMany({
      where: {
        ...(filtre.conventionId === undefined ? {} : { conventionId: filtre.conventionId }),
        ...(filtre.compagnieId === undefined ? {} : { compagnieIds: { has: filtre.compagnieId } }),
      },
      orderBy: [{ creeLe: "asc" }, { id: "asc" }],
    });
    return l.map((x) => this.vers(x));
  }

  async remplacer(billet: BilletCorrespondanceStocke, versionAttendue: number): Promise<boolean> {
    if (!estUuid(billet.id)) return false;
    const { count } = await this.prisma.billetCorrespondance.updateMany({
      where: { id: billet.id, version: versionAttendue },
      data: {
        troncons: json(billet.troncons),
        compagnieIds: compagniesDe(billet.troncons),
        arriveePremierBus: jsonOuNul(billet.arriveePremierBus),
        replacement: jsonOuNul(billet.replacement),
        version: versionAttendue + 1,
      },
    });
    return count === 1;
  }
}

/* ------------------------------------------------------------------ règlements */

type LigneReglement = Prisma.ReglementInterAgencesGetPayload<object>;

@Injectable()
export class ReglementsPrisma extends Reglements {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  private vers(l: LigneReglement): ReglementStocke {
    return {
      cle: l.cle,
      conventionId: l.conventionId,
      paiementLe: iso(l.paiementLe),
      gelLe: iso(l.gelLe),
      lignes: l.lignes as unknown as Creance[],
      debiteurId: l.debiteurId,
      creancierId: l.creancierId,
      montant: l.montant,
      etat: l.etat as ReglementStocke["etat"],
      reference: l.reference,
      payeLe: isoOuNul(l.payeLe),
      erreur: l.erreur,
    };
  }

  async ajouter(reglement: ReglementStocke): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      // INSERT … ON CONFLICT DO NOTHING : un règlement existe déjà pour cette convention et ce lundi.
      const { count } = await tx.reglementInterAgences.createMany({
        data: [
          {
            cle: reglement.cle,
            conventionId: reglement.conventionId,
            paiementLe: dateDe(reglement.paiementLe),
            gelLe: dateDe(reglement.gelLe),
            lignes: json(reglement.lignes),
            debiteurId: reglement.debiteurId,
            creancierId: reglement.creancierId,
            montant: reglement.montant,
            etat: reglement.etat,
            reference: reglement.reference,
            payeLe: dateOuNul(reglement.payeLe),
            erreur: reglement.erreur,
          },
        ],
        skipDuplicates: true,
      });
      if (count === 0) return false;
      // Une opération déjà réglée par un autre règlement fait échouer la transaction (clé primaire) : on ne
      // règle jamais deux fois la même opération.
      await tx.creanceReglee.createMany({
        data: reglement.lignes.map((c) => ({ cle: c.cle, reglementCle: reglement.cle })),
      });
      return true;
    });
  }

  async trouver(cle: string): Promise<ReglementStocke | null> {
    const l = await this.prisma.reglementInterAgences.findUnique({ where: { cle } });
    return l ? this.vers(l) : null;
  }

  async lister(conventionId?: string): Promise<ReglementStocke[]> {
    if (conventionId !== undefined && !estUuid(conventionId)) return [];
    const l = await this.prisma.reglementInterAgences.findMany({
      where: conventionId === undefined ? {} : { conventionId },
      orderBy: [{ paiementLe: "asc" }, { cle: "asc" }],
    });
    return l.map((x) => this.vers(x));
  }

  async remplacer(
    reglement: ReglementStocke,
    etatAttendu: ReglementStocke["etat"],
  ): Promise<boolean> {
    // Seuls l'état, la référence de l'opérateur, la date de paiement et l'échec changent après l'arrêt.
    const { count } = await this.prisma.reglementInterAgences.updateMany({
      where: { cle: reglement.cle, etat: etatAttendu },
      data: {
        etat: reglement.etat,
        reference: reglement.reference,
        payeLe: dateOuNul(reglement.payeLe),
        erreur: reglement.erreur,
      },
    });
    return count === 1;
  }
}

/* ------------------------------------------------------------------ contestations */

type LigneContestation = Prisma.ContestationReglementGetPayload<object>;

@Injectable()
export class ContestationsPrisma extends Contestations {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  private vers(l: LigneContestation): ContestationStockee {
    return {
      reference: l.reference,
      conventionIds: l.conventionIds,
      compagnieId: l.compagnieId,
      personneId: l.personneId,
      motif: l.motif,
      cles: l.cles,
      deposeeLe: iso(l.deposeeLe),
      recevable: l.recevable,
      statut: l.statut as StatutContestation,
      resolueLe: isoOuNul(l.resolueLe),
      resoluePar: l.resoluePar,
    };
  }

  async ajouter(contestation: ContestationStockee): Promise<boolean> {
    // INSERT … ON CONFLICT DO NOTHING : la référence est déjà prise.
    const { count } = await this.prisma.contestationReglement.createMany({
      data: [
        {
          reference: contestation.reference,
          conventionIds: contestation.conventionIds,
          compagnieId: contestation.compagnieId,
          personneId: contestation.personneId,
          motif: contestation.motif,
          cles: contestation.cles,
          deposeeLe: dateDe(contestation.deposeeLe),
          recevable: contestation.recevable,
          statut: contestation.statut,
          resolueLe: dateOuNul(contestation.resolueLe),
          resoluePar: contestation.resoluePar,
        },
      ],
      skipDuplicates: true,
    });
    return count === 1;
  }

  async trouver(reference: string): Promise<ContestationStockee | null> {
    const l = await this.prisma.contestationReglement.findUnique({ where: { reference } });
    return l ? this.vers(l) : null;
  }

  async lister(
    filtre: { conventionId?: string; compagnieId?: string; statut?: StatutContestation } = {},
  ): Promise<ContestationStockee[]> {
    if (
      (filtre.compagnieId !== undefined && !estUuid(filtre.compagnieId)) ||
      (filtre.conventionId !== undefined && !estUuid(filtre.conventionId))
    ) {
      return [];
    }
    const l = await this.prisma.contestationReglement.findMany({
      where: {
        ...(filtre.conventionId === undefined
          ? {}
          : { conventionIds: { has: filtre.conventionId } }),
        ...(filtre.compagnieId === undefined ? {} : { compagnieId: filtre.compagnieId }),
        ...(filtre.statut === undefined ? {} : { statut: filtre.statut }),
      },
      orderBy: [{ deposeeLe: "asc" }, { reference: "asc" }],
    });
    return l.map((x) => this.vers(x));
  }

  async remplacer(
    contestation: ContestationStockee,
    statutAttendu: StatutContestation,
  ): Promise<boolean> {
    // Seule la décision change après le dépôt.
    const { count } = await this.prisma.contestationReglement.updateMany({
      where: { reference: contestation.reference, statut: statutAttendu },
      data: {
        statut: contestation.statut,
        resolueLe: dateOuNul(contestation.resolueLe),
        resoluePar: contestation.resoluePar,
      },
    });
    return count === 1;
  }
}

/* ------------------------------------------------------------------ invitations et références */

@Injectable()
export class InvitationsPrisma extends InvitationsCompagnies {
  readonly durable = true;

  constructor(
    private readonly prisma: PrismaService,
    private readonly chiffrement: ChiffrementService,
  ) {
    super();
  }

  private vers(l: Prisma.InvitationCompagnieGetPayload<object>): InvitationStockee {
    return {
      reference: l.reference,
      cle: l.cle,
      compagnieId: l.compagnieId,
      personneId: l.personneId,
      nomCompagnie: l.nomCompagnie,
      telephone: this.chiffrement.dechiffrer(l.telephoneChiffre, CONTEXTE_INVITATION_TELEPHONE),
      envoyeeLe: iso(l.envoyeeLe),
    };
  }

  async parCle(cle: string): Promise<InvitationStockee | null> {
    const l = await this.prisma.invitationCompagnie.findUnique({ where: { cle } });
    return l ? this.vers(l) : null;
  }

  async ajouterOuExistante(
    invitation: InvitationStockee,
  ): Promise<{ invitation: InvitationStockee; nouvelle: boolean }> {
    // INSERT … ON CONFLICT DO NOTHING : de deux envois simultanés, un seul crée l'invitation (un seul SMS).
    const { count } = await this.prisma.invitationCompagnie.createMany({
      data: [
        {
          reference: invitation.reference,
          cle: invitation.cle,
          compagnieId: invitation.compagnieId,
          personneId: invitation.personneId,
          nomCompagnie: invitation.nomCompagnie,
          telephoneChiffre: this.chiffrement.chiffrer(
            invitation.telephone,
            CONTEXTE_INVITATION_TELEPHONE,
          ),
          envoyeeLe: dateDe(invitation.envoyeeLe),
        },
      ],
      skipDuplicates: true,
    });
    if (count === 1) return { invitation, nouvelle: true };
    const existante = await this.parCle(invitation.cle);
    if (!existante) throw new Error(`Référence d'invitation déjà prise : ${invitation.reference}`);
    return { invitation: existante, nouvelle: false };
  }
}

@Injectable()
export class CompteursReferencesPrisma extends CompteursReferences {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  /** Atomique : de deux appels simultanés, chacun reçoit son numéro. */
  async prochain(prefixe: string): Promise<number> {
    const lignes = await this.prisma.$queryRaw<{ valeur: number }[]>`
      INSERT INTO "compteur_dossier" ("prefixe", "valeur") VALUES (${prefixe}, 1)
      ON CONFLICT ("prefixe") DO UPDATE SET "valeur" = "compteur_dossier"."valeur" + 1
      RETURNING "valeur"`;
    return Number(lignes[0]!.valeur);
  }
}

/* ------------------------------------------------------------------ lectures dans les autres modules */

/** Les compagnies (table `compagnie`) et leur compte mobile money (`compte_momo_compagnie`). */
@Injectable()
export class AnnuaireCompagniesPrisma extends AnnuaireCompagnies {
  readonly durable = true;

  constructor(
    private readonly prisma: PrismaService,
    private readonly chiffrement: ChiffrementService,
  ) {
    super();
  }

  async trouver(id: string): Promise<CompagnieRef | null> {
    if (!estUuid(id)) return null;
    const c = await this.prisma.compagnie.findUnique({ where: { id } });
    if (!c) return null;
    const momo = await this.prisma.compteMomoCompagnie.findUnique({ where: { compagnieId: id } });
    return {
      id: c.id,
      nom: c.nom,
      momo: momo
        ? {
            telephone: this.chiffrement.dechiffrer(momo.telephoneChiffre, CONTEXTE_MOMO_COMPAGNIE),
            operateur: momo.operateur as "mtn" | "orange",
          }
        : null,
    };
  }
}

type DepartLu = Prisma.DepartGetPayload<{
  include: { ligne: { include: { origine: true; destination: true } }; bus: true };
}>;

const MS_PAR_MINUTE = 60_000;
const AVEC_LIGNE = {
  ligne: { include: { origine: true, destination: true } },
  bus: true,
} satisfies Prisma.DepartInclude;

/**
 * Les départs de la billetterie. Origine et destination sont les villes des gares de la ligne ; l'arrivée
 * prévue est le départ plus la durée de la ligne (0 quand elle n'est pas renseignée) ; le bus est son
 * immatriculation (vide tant qu'aucun n'est affecté).
 */
@Injectable()
export class DepartsInterAgencesPrisma extends DepartsInterAgences {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  private vers(d: DepartLu): DepartInterAgences {
    return {
      id: d.id,
      compagnieId: d.ligne.compagnieId,
      origine: d.ligne.origine.ville,
      destination: d.ligne.destination.ville,
      heureDepart: iso(d.heureDepart),
      arriveePrevue: versIsoDouala(d.heureDepart.getTime() + d.ligne.dureeMinutes * MS_PAR_MINUTE),
      bus: d.bus?.immatriculation ?? "",
    };
  }

  async trouver(id: string): Promise<DepartInterAgences | null> {
    if (!estUuid(id)) return null;
    const d = await this.prisma.depart.findUnique({ where: { id }, include: AVEC_LIGNE });
    return d ? this.vers(d) : null;
  }

  async prochain(critere: {
    compagnieId: string;
    origine: string;
    destination: string;
    apres: string;
  }): Promise<DepartInterAgences | null> {
    if (!estUuid(critere.compagnieId)) return null;
    const d = await this.prisma.depart.findFirst({
      where: {
        heureDepart: { gt: dateDe(critere.apres) },
        // Un départ annulé ou fusionné dans un autre ne peut pas accueillir un voyageur replacé.
        etat: { notIn: ["annule", "fusionne"] },
        ligne: {
          compagnieId: critere.compagnieId,
          origine: { ville: critere.origine },
          destination: { ville: critere.destination },
        },
      },
      orderBy: [{ heureDepart: "asc" }, { id: "asc" }],
      include: AVEC_LIGNE,
    });
    return d ? this.vers(d) : null;
  }
}

/** Les billets vendus par la billetterie, retrouvés par identifiant ou par numéro. */
@Injectable()
export class BilletsEmisPrisma extends BilletsEmis {
  readonly durable = true;

  constructor(
    private readonly prisma: PrismaService,
    private readonly passagers: Passagers,
  ) {
    super();
  }

  async trouver(reference: string): Promise<BilletEmis | null> {
    const b = await this.prisma.billet.findFirst({
      where: { OR: [...(estUuid(reference) ? [{ id: reference }] : []), { numero: reference }] },
    });
    if (!b) return null;
    const passager = b.passagerChiffre ? this.passagers.dechiffrer(b.passagerChiffre) : null;
    return {
      id: b.id,
      numero: b.numero,
      compagnieId: b.compagnieId,
      departId: b.departId,
      voyageur: { nom: passager?.nom ?? "", telephone: passager?.telephone ?? "" },
      prix: b.prix,
      annule: b.etat === "annule",
    };
  }
}
