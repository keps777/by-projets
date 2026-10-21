import { Injectable } from "@nestjs/common";
import { ChiffrementService } from "../socle/chiffrement/chiffrement.service";
import { Prisma } from "../socle/db/generated/client";
import { PrismaService } from "../socle/db/prisma.service";
import { dateDe, dateOuNul, estUuid, iso, isoOuNul, json, porteCode } from "../relais/postgres";
import type {
  ConditionsAvance,
  ConventionFinancement,
  DossierStocke,
  LignePaie,
  LotPaie,
  OffreCreditMateriel,
  OperateurMobile,
  PieceStockee,
  Prelevement,
  ReglagesAgence,
  StatutDossier,
} from "./modele";
import {
  ConventionsFinancement,
  DossiersFinancement,
  LotsPaie,
  OffresCredit,
  Prelevements,
  ReglagesFinancement,
  type ResultatAjoutDossier,
  type ResultatReservationPrelevement,
} from "./ports";
import { JOUR_DE_PAIE_PAR_DEFAUT } from "./regles";

/**
 * Adaptateurs PostgreSQL (Prisma) du financement, du crédit et de la paie. Tables : `dossier_financement`,
 * `compteur_avance`, `prelevement_avance`, `lot_paie`, `ligne_paie`, `reglage_financement`,
 * `convention_financement`, `offre_credit_materiel` (migration `20261017000805_financement`). AfriMove ne
 * détient jamais les fonds : aucune table ne porte un solde. Le numéro MoMo d'un salarié n'est écrit que chiffré.
 *
 * Les garanties tiennent dans la base :
 * - **une seule avance ouverte par agence** : index unique partiel `dossier_financement_une_ouverte`
 *   (envoyée, en analyse, ou versée avec un mandat actif) ; la clé primaire dit « numéro pris » ;
 * - **concurrence optimiste** : `remplacer` est un `UPDATE … WHERE id = $1 AND version = $2` ;
 * - **numéros d'avance sans trou ni doublon** : `INSERT … ON CONFLICT DO UPDATE … RETURNING` ;
 * - **jamais plus que ce qui est dû** : `reserver` verrouille la ligne du dossier (`SELECT … FOR UPDATE`) avant
 *   de sommer les prélèvements ; une vente ne se prélève qu'une fois (clé primaire et `venteId` unique) ;
 * - **un prélèvement exécuté ne bouge plus** : déclencheurs sur `prelevement_avance` ;
 * - **un lot de paie par agence et par mois** : index unique `(agenceId, mois)` ;
 * - **un salaire ne se relance pas deux fois** : `marquerLigne … WHERE etat = $depuisEtat`.
 */

export const CONTEXTE_PAIE_TELEPHONE = "financement.paie.telephone";

/* ------------------------------------------------------------------ dossiers */

type LigneDossier = Prisma.DossierFinancementGetPayload<object>;

/** Les statuts qui occupent la place de l'agence (le mandat décide pour un dossier versé). */
const OUVERT: Prisma.DossierFinancementWhereInput = {
  OR: [{ statut: { in: ["envoye", "en_analyse"] } }, { statut: "verse", mandatActif: true }],
};

@Injectable()
export class DossiersPrisma extends DossiersFinancement {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  private vers(l: LigneDossier): DossierStocke {
    return {
      id: l.id,
      version: l.version,
      agenceId: l.agenceId,
      demandePar: l.demandePar,
      montant: l.montant,
      statut: l.statut as StatutDossier,
      partenaire: l.partenaire,
      referencePartenaire: l.referencePartenaire,
      conditions: l.conditions as unknown as ConditionsAvance,
      envoyeA: iso(l.envoyeA),
      reponseAvant: iso(l.reponseAvant),
      accuseA: isoOuNul(l.accuseA),
      decisionA: isoOuNul(l.decisionA),
      verseA: isoOuNul(l.verseA),
      retireA: isoOuNul(l.retireA),
      motifRefus: l.motifRefus,
      pieces: l.pieces as unknown as PieceStockee[],
      mandat: {
        pourcentage: l.mandatPourcentage,
        signeA: iso(l.mandatSigneA),
        signePar: l.mandatSignePar,
        compteMarchandId: l.mandatCompteMarchandId,
        operateur: l.mandatOperateur as OperateurMobile,
        actif: l.mandatActif,
      },
      resteDu: l.resteDu,
      rembourseA: isoOuNul(l.rembourseA),
    };
  }

  /** Ce qui change au fil de la vie du dossier (ni l'agence ni le patron, fixés à la demande). */
  private modifiable(d: DossierStocke) {
    return {
      montant: d.montant,
      statut: d.statut,
      partenaire: d.partenaire,
      referencePartenaire: d.referencePartenaire,
      conditions: json(d.conditions),
      envoyeA: dateDe(d.envoyeA),
      reponseAvant: dateDe(d.reponseAvant),
      accuseA: dateOuNul(d.accuseA),
      decisionA: dateOuNul(d.decisionA),
      verseA: dateOuNul(d.verseA),
      retireA: dateOuNul(d.retireA),
      motifRefus: d.motifRefus,
      pieces: json(d.pieces),
      mandatPourcentage: d.mandat.pourcentage,
      mandatSigneA: dateDe(d.mandat.signeA),
      mandatSignePar: d.mandat.signePar,
      mandatCompteMarchandId: d.mandat.compteMarchandId,
      mandatOperateur: d.mandat.operateur,
      mandatActif: d.mandat.actif,
      resteDu: d.resteDu,
      rembourseA: dateOuNul(d.rembourseA),
    };
  }

  async ajouter(dossier: DossierStocke): Promise<ResultatAjoutDossier> {
    try {
      await this.prisma.dossierFinancement.create({
        data: {
          id: dossier.id,
          version: 1,
          agenceId: dossier.agenceId,
          demandePar: dossier.demandePar,
          ...this.modifiable(dossier),
        },
      });
      return "ajoute";
    } catch (e) {
      if (!porteCode(e, "P2002") && !porteCode(e, "23505")) throw e;
      // La clé primaire dit « numéro pris » ; l'index unique partiel dit « demande en cours ».
      const pris = await this.prisma.dossierFinancement.findUnique({
        where: { id: dossier.id },
        select: { id: true },
      });
      if (pris) return "numero_pris";
      // Sinon c'est l'index unique partiel. Si l'agence n'a aucune avance ouverte, la violation vient d'ailleurs
      // (référence du partenaire déjà donnée) : ce n'est pas une demande en cours, on laisse l'erreur remonter.
      if (await this.ouvert(dossier.agenceId)) return "demande_en_cours";
      throw e;
    }
  }

  async trouver(agenceId: string, id: string): Promise<DossierStocke | null> {
    if (!estUuid(agenceId)) return null;
    const l = await this.prisma.dossierFinancement.findFirst({ where: { id, agenceId } });
    return l ? this.vers(l) : null;
  }

  async parReference(referencePartenaire: string): Promise<DossierStocke | null> {
    const l = await this.prisma.dossierFinancement.findUnique({ where: { referencePartenaire } });
    return l ? this.vers(l) : null;
  }

  async ouvert(agenceId: string): Promise<DossierStocke | null> {
    if (!estUuid(agenceId)) return null;
    const l = await this.prisma.dossierFinancement.findFirst({ where: { agenceId, ...OUVERT } });
    return l ? this.vers(l) : null;
  }

  async aPrelever(agenceId: string): Promise<DossierStocke | null> {
    if (!estUuid(agenceId)) return null;
    const l = await this.prisma.dossierFinancement.findFirst({
      where: { agenceId, statut: "verse", mandatActif: true },
    });
    return l ? this.vers(l) : null;
  }

  async remplacer(dossier: DossierStocke, versionAttendue: number): Promise<boolean> {
    const { count } = await this.prisma.dossierFinancement.updateMany({
      where: { id: dossier.id, version: versionAttendue },
      data: { ...this.modifiable(dossier), version: versionAttendue + 1 },
    });
    return count === 1;
  }

  async nonTransmis(): Promise<DossierStocke[]> {
    const l = await this.prisma.dossierFinancement.findMany({
      where: { statut: "envoye", accuseA: null },
      orderBy: { id: "asc" },
    });
    return l.map((x) => this.vers(x));
  }

  async enAnalyse(): Promise<DossierStocke[]> {
    const l = await this.prisma.dossierFinancement.findMany({
      where: { statut: "en_analyse" },
      orderBy: { id: "asc" },
    });
    return l.map((x) => this.vers(x));
  }

  /** Atomique : de deux appels simultanés, chacun reçoit son numéro. */
  async prochainNumero(annee: number): Promise<number> {
    const lignes = await this.prisma.$queryRaw<{ valeur: number }[]>`
      INSERT INTO "compteur_avance" ("annee", "valeur") VALUES (${annee}, 1)
      ON CONFLICT ("annee") DO UPDATE SET "valeur" = "compteur_avance"."valeur" + 1
      RETURNING "valeur"`;
    return Number(lignes[0]!.valeur);
  }
}

/* ------------------------------------------------------------------ prélèvements */

type LignePrelevement = Prisma.PrelevementAvanceGetPayload<object>;

const versPrelevement = (l: LignePrelevement): Prelevement => ({
  cle: l.cle,
  dossierId: l.dossierId,
  agenceId: l.agenceId,
  venteId: l.venteId,
  montantVente: l.montantVente,
  montant: l.montant,
  at: iso(l.at),
  etat: l.etat as Prelevement["etat"],
  reference: l.reference,
});

@Injectable()
export class PrelevementsPrisma extends Prelevements {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async reserver(
    demande: Parameters<Prelevements["reserver"]>[0],
  ): Promise<ResultatReservationPrelevement> {
    return this.prisma.$transaction(async (tx): Promise<ResultatReservationPrelevement> => {
      // Le verrou de la ligne du dossier met les réservations de ce dossier en file : la somme lue
      // ci-dessous ne bouge plus avant la fin de la transaction.
      const dossier = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "dossier_financement" WHERE "id" = ${demande.dossierId} FOR UPDATE`;
      if (dossier.length === 0) throw new Error(`Dossier inconnu : ${demande.dossierId}`);
      const deja = await tx.prelevementAvance.findUnique({
        where: { cle: demande.cle },
        select: { cle: true },
      });
      if (deja) return { resultat: "existe" };
      const somme = await tx.prelevementAvance.aggregate({
        where: { dossierId: demande.dossierId },
        _sum: { montant: true },
      });
      const reste = demande.totalDu - (somme._sum.montant ?? 0);
      if (reste <= 0) return { resultat: "solde_nul" };
      const l = await tx.prelevementAvance.create({
        data: {
          cle: demande.cle,
          dossierId: demande.dossierId,
          agenceId: demande.agenceId,
          venteId: demande.venteId,
          montantVente: demande.montantVente,
          montant: Math.min(demande.souhaite, reste),
          at: dateDe(demande.at),
          etat: "en_attente",
          reference: null,
        },
      });
      return { resultat: "reserve", prelevement: versPrelevement(l) };
    });
  }

  async confirmer(cle: string, reference: string): Promise<void> {
    // Un prélèvement déjà exécuté ne change plus (le déclencheur le garantit aussi).
    await this.prisma.prelevementAvance.updateMany({
      where: { cle, etat: "en_attente" },
      data: { etat: "execute", reference },
    });
  }

  async annuler(cle: string): Promise<void> {
    await this.prisma.prelevementAvance.deleteMany({ where: { cle, etat: "en_attente" } });
  }

  async enAttente(): Promise<Prelevement[]> {
    const l = await this.prisma.prelevementAvance.findMany({
      where: { etat: "en_attente" },
      orderBy: [{ at: "asc" }, { cle: "asc" }],
    });
    return l.map(versPrelevement);
  }

  async totalReserve(dossierId: string): Promise<number> {
    const s = await this.prisma.prelevementAvance.aggregate({
      where: { dossierId },
      _sum: { montant: true },
    });
    return s._sum.montant ?? 0;
  }

  async totalExecute(dossierId: string): Promise<number> {
    const s = await this.prisma.prelevementAvance.aggregate({
      where: { dossierId, etat: "execute" },
      _sum: { montant: true },
    });
    return s._sum.montant ?? 0;
  }
}

/* ------------------------------------------------------------------ paie */

type LotAvecLignes = Prisma.LotPaieGetPayload<{ include: { lignes: true } }>;

@Injectable()
export class LotsPaiePrisma extends LotsPaie {
  readonly durable = true;

  constructor(
    private readonly prisma: PrismaService,
    private readonly chiffrement: ChiffrementService,
  ) {
    super();
  }

  private chiffrerTelephone(t: string | null): string | null {
    return t === null ? null : this.chiffrement.chiffrer(t, CONTEXTE_PAIE_TELEPHONE);
  }

  private vers(l: LotAvecLignes): LotPaie {
    const lignes = [...l.lignes].sort((a, b) => a.rang - b.rang);
    return {
      id: l.id,
      version: l.version,
      agenceId: l.agenceId,
      mois: l.mois,
      lancePar: l.lancePar,
      lanceA: iso(l.lanceA),
      total: l.total,
      lignes: lignes.map(
        (x): LignePaie => ({
          personneId: x.personneId,
          nom: x.nom,
          montant: x.montant,
          operateur: x.operateur as OperateurMobile | null,
          telephone:
            x.telephoneChiffre === null
              ? null
              : this.chiffrement.dechiffrer(x.telephoneChiffre, CONTEXTE_PAIE_TELEPHONE),
          etat: x.etat as LignePaie["etat"],
          tentative: x.tentative,
          reference: x.reference,
          motif: x.motif,
        }),
      ),
    };
  }

  async creer(lot: LotPaie): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      // INSERT … ON CONFLICT DO NOTHING : le lot du mois existe déjà (ou l'identifiant est pris).
      const { count } = await tx.lotPaie.createMany({
        data: [
          {
            id: lot.id,
            version: 1,
            agenceId: lot.agenceId,
            mois: lot.mois,
            lancePar: lot.lancePar,
            lanceA: dateDe(lot.lanceA),
            total: lot.total,
          },
        ],
        skipDuplicates: true,
      });
      if (count === 0) return false;
      await tx.lignePaie.createMany({
        data: lot.lignes.map((x, rang) => ({
          lotId: lot.id,
          personneId: x.personneId,
          rang,
          nom: x.nom,
          montant: x.montant,
          operateur: x.operateur,
          telephoneChiffre: this.chiffrerTelephone(x.telephone),
          etat: x.etat,
          tentative: x.tentative,
          reference: x.reference,
          motif: x.motif,
        })),
      });
      return true;
    });
  }

  async trouver(agenceId: string, mois: string): Promise<LotPaie | null> {
    if (!estUuid(agenceId)) return null;
    const l = await this.prisma.lotPaie.findUnique({
      where: { agenceId_mois: { agenceId, mois } },
      include: { lignes: true },
    });
    return l ? this.vers(l) : null;
  }

  async marquerLigne(
    lotId: string,
    personneId: string,
    modif: Partial<
      Pick<LignePaie, "etat" | "reference" | "motif" | "tentative" | "operateur" | "telephone">
    >,
    depuisEtat?: LignePaie["etat"],
  ): Promise<boolean> {
    if (!estUuid(lotId) || !estUuid(personneId)) return false;
    const data: Prisma.LignePaieUpdateManyMutationInput = {};
    if (modif.etat !== undefined) data.etat = modif.etat;
    if (modif.reference !== undefined) data.reference = modif.reference;
    if (modif.motif !== undefined) data.motif = modif.motif;
    if (modif.tentative !== undefined) data.tentative = modif.tentative;
    if (modif.operateur !== undefined) data.operateur = modif.operateur;
    if (modif.telephone !== undefined)
      data.telephoneChiffre = this.chiffrerTelephone(modif.telephone);
    // UPDATE … WHERE … AND etat = $depuisEtat : de deux requêtes simultanées, une seule passe.
    const { count } = await this.prisma.lignePaie.updateMany({
      where: { lotId, personneId, ...(depuisEtat === undefined ? {} : { etat: depuisEtat }) },
      data,
    });
    return count === 1;
  }

  async incomplets(): Promise<LotPaie[]> {
    const l = await this.prisma.lotPaie.findMany({
      where: { lignes: { some: { etat: "en_attente" } } },
      include: { lignes: true },
      orderBy: [{ lanceA: "asc" }, { id: "asc" }],
    });
    return l.map((x) => this.vers(x));
  }
}

/* ------------------------------------------------------------------ réglages, convention, offre */

@Injectable()
export class ReglagesPrisma extends ReglagesFinancement {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async lire(agenceId: string): Promise<ReglagesAgence> {
    const l = estUuid(agenceId)
      ? await this.prisma.reglageFinancement.findUnique({ where: { agenceId } })
      : null;
    return l
      ? { billetEnDeuxFois: l.billetEnDeuxFois, jourDePaie: l.jourDePaie }
      : { billetEnDeuxFois: false, jourDePaie: JOUR_DE_PAIE_PAR_DEFAUT };
  }

  async definirBilletEnDeuxFois(agenceId: string, actif: boolean): Promise<void> {
    await this.prisma.reglageFinancement.upsert({
      where: { agenceId },
      create: { agenceId, billetEnDeuxFois: actif, jourDePaie: JOUR_DE_PAIE_PAR_DEFAUT },
      update: { billetEnDeuxFois: actif },
    });
  }
}

@Injectable()
export class ConventionsPrisma extends ConventionsFinancement {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async pour(agenceId: string): Promise<ConventionFinancement | null> {
    if (!estUuid(agenceId)) return null;
    const l = await this.prisma.conventionFinancement.findUnique({ where: { agenceId } });
    return l ? { partenaire: l.partenaire, signeeA: isoOuNul(l.signeeA) } : null;
  }
}

@Injectable()
export class OffresCreditPrisma extends OffresCredit {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async pour(agenceId: string): Promise<OffreCreditMateriel | null> {
    if (!estUuid(agenceId)) return null;
    const l = await this.prisma.offreCreditMateriel.findUnique({ where: { agenceId } });
    return l
      ? {
          description: l.description,
          montantTotal: l.montantTotal,
          mensualites: l.mensualites,
          montantMensualite: l.montantMensualite,
        }
      : null;
  }
}
