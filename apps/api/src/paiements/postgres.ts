import { Injectable } from "@nestjs/common";
import type { Prisma } from "../socle/db/generated/client";
import { PrismaService } from "../socle/db/prisma.service";
import {
  sommeMontants,
  type Beneficiaire,
  type CauseRemboursement,
  type ConfirmationCommande,
  type LienPaiement,
  type LigneRemboursement,
  type LigneReversement,
  type MoyenPaiement,
  type OperateurMobile,
  type OriginePaiement,
  type Paiement,
  type ReglageMode,
  type Remboursement,
  type StatutPaiement,
  type StatutRemboursement,
} from "./modeles";
import {
  ComptesReversement,
  LiensPaiement,
  NotificationsTraitees,
  Paiements,
  ReglagesPaiements,
  Remboursements,
  type FiltrePaiements,
  type ResultatAjoutRemboursement,
  type ResultatOuverture,
} from "./ports";

/**
 * Adaptateurs PostgreSQL (Prisma) des six ports de stockage des paiements (AM-165). Tables :
 * `paiement`, `paiement_remboursement`, `paiement_notification`, `paiement_lien`, `compte_reversement`
 * et `reglage_paiements` (migration « paiements »).
 *
 * Ce qui garde les paiements cohérents quand deux appels se croisent tient dans la base, pas dans le
 * code :
 * - **un seul paiement en attente par commande** : index unique partiel, `ouvrir` est un
 *   `INSERT … ON CONFLICT DO NOTHING` ; la clé d'idempotence est unique ;
 * - **un seul jeu de billets par commande** : index unique partiel `(commandeId) WHERE confirmation =
 *   'faite'`, `confirmer` est un `UPDATE … WHERE confirmation = 'a_faire'` qui échoue (faux) si l'index
 *   refuse ;
 * - **un statut qui ne recule pas** : `transitionner` est un seul `UPDATE … WHERE id = $1 AND statut =
 *   ANY($2)` ; un webhook rejoué ou un balayage qui se croisent ne passent qu'une fois ;
 * - **un remboursement ne dépasse jamais le paiement** : `ajouter` verrouille la ligne du paiement
 *   (`SELECT … FOR UPDATE`), somme par bénéficiaire ce qui est déjà demandé ou fait, puis insère ;
 * - **un événement de l'agrégateur ne compte qu'une fois** : clé primaire (fournisseur, événement).
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const estUuid = (v: string): boolean => UUID.test(v);

/** Vrai si l'erreur (ou sa cause) porte ce code (Prisma `P2025`, `P2002` ; SQLSTATE `23505`). */
function porteCode(e: unknown, code: string): boolean {
  const vus = new Set<unknown>();
  const parcourir = (v: unknown, profondeur: number): boolean => {
    if (v === null || typeof v !== "object" || profondeur > 6 || vus.has(v)) return false;
    vus.add(v);
    const o = v as Record<string, unknown>;
    if (o["code"] === code || o["originalCode"] === code) return true;
    return Object.values(o).some((x) => parcourir(x, profondeur + 1));
  };
  return parcourir(e, 0) || (e instanceof Error && e.message.includes(code));
}

/** Vrai si l'erreur est un refus d'index unique. */
const estDoublon = (e: unknown): boolean => porteCode(e, "P2002") || porteCode(e, "23505");

/* ------------------------------------------------------------------ paiements */

type LignePaiement = Prisma.PaiementGetPayload<object>;

function versPaiement(l: LignePaiement): Paiement {
  return {
    id: l.id,
    cle: l.cle,
    origine: l.origine as OriginePaiement,
    commandeId: l.commandeId,
    voyageurId: l.voyageurId,
    compagnieId: l.compagnieId,
    moyen: l.moyen as MoyenPaiement,
    operateur: l.operateur as OperateurMobile | null,
    montant: l.montant,
    devise:
      l.deviseCode !== null && l.deviseMontantMineur !== null
        ? { code: l.deviseCode, montantMineur: l.deviseMontantMineur }
        : null,
    repartition: l.repartition as unknown as LigneReversement[],
    statut: l.statut as StatutPaiement,
    confirmation: l.confirmation as ConfirmationCommande,
    telephoneChiffre: l.telephoneChiffre,
    telephoneMasque: l.telephoneMasque,
    fournisseur: l.fournisseur,
    idFournisseur: l.idFournisseur,
    referenceOperateur: l.referenceOperateur,
    urlAuthentification: l.urlAuthentification,
    cause: l.cause,
    billetIds: l.billetIds ?? [],
    creeA: l.creeA,
    expireA: l.expireA,
    termineA: l.termineA,
  };
}

function versCreation(p: Paiement): Prisma.PaiementUncheckedCreateInput {
  const { devise, repartition, ...reste } = p;
  return {
    ...reste,
    deviseCode: devise?.code ?? null,
    deviseMontantMineur: devise?.montantMineur ?? null,
    repartition: repartition as unknown as Prisma.InputJsonValue,
    billetIds: [...p.billetIds],
  };
}

/** Les champs à modifier : `devise` se range dans deux colonnes, le reste porte le même nom. */
function versModifsPaiement(
  modifs: Partial<Omit<Paiement, "id">>,
): Prisma.PaiementUncheckedUpdateInput {
  const { devise, repartition, billetIds, ...reste } = modifs;
  const data: Record<string, unknown> = {};
  for (const [cle, valeur] of Object.entries(reste)) {
    if (valeur !== undefined) data[cle] = valeur;
  }
  if (devise !== undefined) {
    data["deviseCode"] = devise?.code ?? null;
    data["deviseMontantMineur"] = devise?.montantMineur ?? null;
  }
  if (repartition !== undefined) data["repartition"] = repartition;
  if (billetIds !== undefined) data["billetIds"] = [...billetIds];
  return data as Prisma.PaiementUncheckedUpdateInput;
}

@Injectable()
export class PaiementsPrisma extends Paiements {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async ouvrir(paiement: Paiement): Promise<ResultatOuverture> {
    for (let essai = 0; essai < 3; essai++) {
      // ON CONFLICT DO NOTHING couvre la clé d'idempotence et l'index « un paiement en attente par
      // commande » : le nombre de lignes écrites dit qui a ouvert le paiement.
      const { count } = await this.prisma.paiement.createMany({
        data: [versCreation(paiement)],
        skipDuplicates: true,
      });
      if (count === 1) return { cree: true };
      if (paiement.cle !== null) {
        const parCle = await this.parCle(paiement.cle);
        if (parCle) return { cree: false, raison: "cle_connue", existant: parCle };
      }
      if (paiement.commandeId !== null && estUuid(paiement.commandeId)) {
        const ouvert = await this.prisma.paiement.findFirst({
          where: { commandeId: paiement.commandeId, statut: "en_attente" },
        });
        if (ouvert) return { cree: false, raison: "en_cours", existant: versPaiement(ouvert) };
      }
      // Le paiement qui gênait a changé d'état entre l'INSERT et la lecture : on retente.
    }
    throw new Error(`Paiement ${paiement.id} : ouverture impossible (identifiant déjà pris ?)`);
  }

  async trouver(id: string): Promise<Paiement | null> {
    if (!estUuid(id)) return null;
    const l = await this.prisma.paiement.findUnique({ where: { id } });
    return l ? versPaiement(l) : null;
  }

  async parIdFournisseur(fournisseur: string, idFournisseur: string): Promise<Paiement | null> {
    const l = await this.prisma.paiement.findFirst({ where: { fournisseur, idFournisseur } });
    return l ? versPaiement(l) : null;
  }

  async parCle(cle: string): Promise<Paiement | null> {
    const l = await this.prisma.paiement.findUnique({ where: { cle } });
    return l ? versPaiement(l) : null;
  }

  async duCommande(commandeId: string): Promise<Paiement[]> {
    if (!estUuid(commandeId)) return [];
    const lignes = await this.prisma.paiement.findMany({
      where: { commandeId },
      orderBy: [{ creeA: "asc" }, { id: "asc" }],
    });
    return lignes.map(versPaiement);
  }

  async transitionner(
    id: string,
    de: readonly StatutPaiement[],
    changement: Partial<Omit<Paiement, "id">>,
  ): Promise<Paiement | null> {
    if (!estUuid(id)) return null;
    try {
      // Un seul UPDATE … WHERE id = $1 AND statut IN (…) : la condition et l'écriture sont atomiques.
      const l = await this.prisma.paiement.update({
        where: { id, statut: { in: [...de] } },
        data: versModifsPaiement(changement),
      });
      return versPaiement(l);
    } catch (e) {
      if (porteCode(e, "P2025")) return null;
      throw e;
    }
  }

  async modifier(id: string, changement: Partial<Omit<Paiement, "id">>): Promise<Paiement | null> {
    if (!estUuid(id)) return null;
    try {
      const l = await this.prisma.paiement.update({
        where: { id },
        data: versModifsPaiement(changement),
      });
      return versPaiement(l);
    } catch (e) {
      if (porteCode(e, "P2025")) return null;
      throw e;
    }
  }

  async confirmer(id: string, billetIds: string[]): Promise<boolean> {
    if (!estUuid(id)) return false;
    try {
      const { count } = await this.prisma.paiement.updateMany({
        where: { id, confirmation: "a_faire", commandeId: { not: null } },
        data: { confirmation: "faite", billetIds: [...billetIds] },
      });
      return count === 1;
    } catch (e) {
      // L'index « une seule confirmation par commande » refuse : un autre paiement a déjà fait les billets.
      if (estDoublon(e)) return false;
      throw e;
    }
  }

  async enAttenteDepuis(avant: Date, limite: number): Promise<Paiement[]> {
    const lignes = await this.prisma.paiement.findMany({
      where: { statut: "en_attente", creeA: { lte: avant } },
      orderBy: [{ creeA: "asc" }, { id: "asc" }],
      take: limite,
    });
    return lignes.map(versPaiement);
  }

  async aConfirmer(limite: number): Promise<Paiement[]> {
    const lignes = await this.prisma.paiement.findMany({
      where: { statut: "reussi", confirmation: "a_faire" },
      orderBy: [{ creeA: "asc" }, { id: "asc" }],
      take: limite,
    });
    return lignes.map(versPaiement);
  }

  async lister(filtre: FiltrePaiements): Promise<Paiement[]> {
    if (filtre.compagnieId !== undefined && !estUuid(filtre.compagnieId)) return [];
    const where: Prisma.PaiementWhereInput = {};
    if (filtre.compagnieId !== undefined) where.compagnieId = filtre.compagnieId;
    if (filtre.statut !== undefined) where.statut = filtre.statut;
    if (filtre.du || filtre.au) {
      where.creeA = {
        ...(filtre.du ? { gte: filtre.du } : {}),
        ...(filtre.au ? { lt: filtre.au } : {}),
      };
    }
    const lignes = await this.prisma.paiement.findMany({
      where,
      orderBy: [{ creeA: "desc" }, { id: "asc" }],
      take: filtre.limite,
    });
    return lignes.map(versPaiement);
  }
}

/* ------------------------------------------------------------------ remboursements */

type LigneRemb = Prisma.PaiementRemboursementGetPayload<object>;

function versRemboursement(l: LigneRemb): Remboursement {
  return {
    id: l.id,
    paiementId: l.paiementId,
    cle: l.cle,
    cause: l.cause as CauseRemboursement,
    billetId: l.billetId,
    lignes: l.lignes as unknown as LigneRemboursement[],
    montant: l.montant,
    statut: l.statut as StatutRemboursement,
    idFournisseur: l.idFournisseur,
    referenceOperateur: l.referenceOperateur,
    tentatives: l.tentatives,
    prochainEssaiA: l.prochainEssaiA,
    derniereErreur: l.derniereErreur,
    creeA: l.creeA,
    termineA: l.termineA,
  };
}

@Injectable()
export class RemboursementsPrisma extends Remboursements {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async ajouter(
    remboursement: Remboursement,
    plafonds: Readonly<Record<Beneficiaire, number>>,
  ): Promise<ResultatAjoutRemboursement> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        // Le verrou de la ligne du paiement sérialise les demandes de remboursement du même paiement :
        // deux demandes simultanées ne dépassent jamais ce qui a été encaissé.
        if (!estUuid(remboursement.paiementId)) throw new Error("paiement inconnu");
        const verrou = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM paiement WHERE id = ${remboursement.paiementId}::uuid FOR UPDATE`;
        if (verrou.length === 0) {
          throw new Error(`Remboursement : le paiement ${remboursement.paiementId} n'existe pas`);
        }
        const connu = await tx.paiementRemboursement.findUnique({
          where: { cle: remboursement.cle },
        });
        if (connu) return "cle_connue" as const;
        const vivants = await tx.paiementRemboursement.findMany({
          where: { paiementId: remboursement.paiementId, statut: { not: "echoue" } },
        });
        for (const b of ["compagnie", "afrimove"] as const) {
          const deja = sommeMontants(
            vivants
              .flatMap((r) => r.lignes as unknown as LigneRemboursement[])
              .filter((l) => l.beneficiaire === b),
          );
          const demande = sommeMontants(remboursement.lignes.filter((l) => l.beneficiaire === b));
          if (deja + demande > plafonds[b]) return "plafond_depasse" as const;
        }
        const { lignes, ...reste } = remboursement;
        await tx.paiementRemboursement.create({
          data: { ...reste, lignes: lignes as unknown as Prisma.InputJsonValue },
        });
        return "ok" as const;
      });
    } catch (e) {
      // La même clé arrivée sous un autre paiement en même temps : l'index unique tranche.
      if (estDoublon(e)) return "cle_connue";
      throw e;
    }
  }

  async trouver(id: string): Promise<Remboursement | null> {
    if (!estUuid(id)) return null;
    const l = await this.prisma.paiementRemboursement.findUnique({ where: { id } });
    return l ? versRemboursement(l) : null;
  }

  async parCle(cle: string): Promise<Remboursement | null> {
    const l = await this.prisma.paiementRemboursement.findUnique({ where: { cle } });
    return l ? versRemboursement(l) : null;
  }

  async parIdFournisseur(idFournisseur: string): Promise<Remboursement | null> {
    const l = await this.prisma.paiementRemboursement.findFirst({ where: { idFournisseur } });
    return l ? versRemboursement(l) : null;
  }

  async dePaiement(paiementId: string): Promise<Remboursement[]> {
    if (!estUuid(paiementId)) return [];
    const lignes = await this.prisma.paiementRemboursement.findMany({
      where: { paiementId },
      orderBy: [{ creeA: "asc" }, { id: "asc" }],
    });
    return lignes.map(versRemboursement);
  }

  async transitionner(
    id: string,
    de: readonly StatutRemboursement[],
    changement: Partial<Omit<Remboursement, "id">>,
  ): Promise<Remboursement | null> {
    if (!estUuid(id)) return null;
    const { lignes, ...reste } = changement;
    const data: Record<string, unknown> = {};
    for (const [cle, valeur] of Object.entries(reste)) {
      if (valeur !== undefined) data[cle] = valeur;
    }
    if (lignes !== undefined) data["lignes"] = lignes;
    try {
      const l = await this.prisma.paiementRemboursement.update({
        where: { id, statut: { in: [...de] } },
        data: data as Prisma.PaiementRemboursementUncheckedUpdateInput,
      });
      return versRemboursement(l);
    } catch (e) {
      if (porteCode(e, "P2025")) return null;
      throw e;
    }
  }

  async aReprendre(maintenant: Date, limite: number): Promise<Remboursement[]> {
    const lignes = await this.prisma.paiementRemboursement.findMany({
      where: { statut: "demande", prochainEssaiA: { not: null, lte: maintenant } },
      orderBy: [{ creeA: "asc" }, { id: "asc" }],
      take: limite,
    });
    return lignes.map(versRemboursement);
  }
}

/* ------------------------------------------------------------------ le reste du stockage */

@Injectable()
export class NotificationsTraiteesPrisma extends NotificationsTraitees {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async memoriser(fournisseur: string, evenementId: string, at: Date): Promise<boolean> {
    // INSERT … ON CONFLICT DO NOTHING : vrai pour le seul appel qui a écrit la ligne.
    const { count } = await this.prisma.paiementNotification.createMany({
      data: [{ fournisseur, evenementId, at }],
      skipDuplicates: true,
    });
    return count === 1;
  }

  async connue(fournisseur: string, evenementId: string): Promise<boolean> {
    const l = await this.prisma.paiementNotification.findUnique({
      where: { fournisseur_evenementId: { fournisseur, evenementId } },
    });
    return l !== null;
  }
}

/** Espace des verrous consultatifs des paiements (un espace par usage, voir INTEGRATION.md). */
const ESPACE_VERROU_PAIEMENTS = 7_017_165;

@Injectable()
export class LiensPaiementPrisma extends LiensPaiement {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async remplacer(lien: LienPaiement): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // Un verrou par commande : deux liens demandés en même temps s'enchaînent (le second révoque
      // le premier) au lieu de se heurter à l'index « un seul lien vivant par commande ».
      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(${ESPACE_VERROU_PAIEMENTS}::int, hashtext(${lien.commandeId}))`;
      await tx.paiementLien.updateMany({
        where: { commandeId: lien.commandeId, revoqueA: null },
        data: { revoqueA: lien.creeA },
      });
      await tx.paiementLien.create({ data: lien });
    });
  }

  async parEmpreinte(empreinte: string): Promise<LienPaiement | null> {
    const l = await this.prisma.paiementLien.findUnique({ where: { empreinte } });
    return l ? { ...l } : null;
  }
}

@Injectable()
export class ComptesReversementPrisma extends ComptesReversement {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async compte(compagnieId: string): Promise<string | null> {
    if (!estUuid(compagnieId)) return null;
    const l = await this.prisma.compteReversement.findUnique({ where: { compagnieId } });
    return l?.compteId ?? null;
  }

  async definir(compagnieId: string, compteId: string | null): Promise<void> {
    if (compteId === null) {
      await this.prisma.compteReversement.deleteMany({ where: { compagnieId } });
      return;
    }
    await this.prisma.compteReversement.upsert({
      where: { compagnieId },
      create: { compagnieId, compteId },
      update: { compteId },
    });
  }
}

@Injectable()
export class ReglagesPaiementsPrisma extends ReglagesPaiements {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async lire(): Promise<ReglageMode | null> {
    const l = await this.prisma.reglagePaiements.findUnique({ where: { id: 1 } });
    return l ? { degrade: l.degrade, motif: l.motif, parId: l.parId, at: l.at } : null;
  }

  async definir(reglage: ReglageMode): Promise<void> {
    const champs = {
      degrade: reglage.degrade,
      motif: reglage.motif,
      parId: reglage.parId,
      at: reglage.at,
    };
    await this.prisma.reglagePaiements.upsert({
      where: { id: 1 },
      create: { id: 1, ...champs },
      update: champs,
    });
  }
}
