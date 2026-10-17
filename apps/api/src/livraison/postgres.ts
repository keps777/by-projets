import { Injectable } from "@nestjs/common";
import type { Prisma } from "../socle/db/generated/client";
import { ChiffrementService } from "../socle/chiffrement/chiffrement.service";
import { PrismaService } from "../socle/db/prisma.service";
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
import type { OperateurMobile } from "../relais/regles";
import type {
  Deplacement,
  DemandeLivreur,
  EssaiMission,
  EtatDemandeLivreur,
  EtatMission,
  InvitationLivreur,
  LivreurStocke,
  MissionLivraison,
  PartageSuivi,
} from "./modele";
import {
  DemandesLivreurRepository,
  Invitations,
  LivreursRepository,
  MissionsRepository,
  PartagesSuivi,
  type ResultatAjoutDemandeLivreur,
  type ResultatAjoutMission,
} from "./ports";

/**
 * Adaptateurs PostgreSQL (Prisma) de la livraison moto. Tables : `livreur`, `demande_livreur`,
 * `mission_livraison`, `partage_suivi`, `invitation_livreur` (migration `20261017000803_livraison`).
 * Les numéros MoMo ne sont jamais écrits en clair ; le jeton d'un lien de suivi non plus (son hachage seul).
 *
 * Les garanties tiennent dans la base :
 * - **concurrence optimiste** : `remplacer` est un `UPDATE … WHERE id = $1 AND version = $2` ;
 * - **une seule mission ouverte par colis** : index unique partiel `mission_livraison_une_ouverte` ;
 * - **une demande ouverte par personne** : index unique partiel `demande_livreur_une_ouverte`.
 *
 * Le portefeuille, les versements, les rôles et les lieux sont ceux du relais (`../relais/postgres.ts`).
 * La diffusion en direct (`DiffusionLivraison`) reste dans le processus : elle n'a pas de table.
 */

export const CONTEXTE_MOMO_LIVREUR = "livraison.momo.telephone";

/** « AAAA-MM-JJ » ↔ colonne `date` (minuit UTC, sans fuseau). */
const jourDe = (s: string | null): Date | null =>
  s === null ? null : new Date(`${s}T00:00:00.000Z`);
const jourVers = (d: Date | null): string | null =>
  d === null ? null : d.toISOString().slice(0, 10);

/* ------------------------------------------------------------------ livreurs */

@Injectable()
export class LivreursPrisma extends LivreursRepository {
  readonly durable = true;

  constructor(
    private readonly prisma: PrismaService,
    private readonly chiffrement: ChiffrementService,
  ) {
    super();
  }

  private vers(l: Prisma.LivreurGetPayload<object>): LivreurStocke {
    return {
      id: l.id,
      version: l.version,
      badge: l.badge,
      numero: l.numero,
      personneId: l.personneId,
      nom: l.nom,
      ville: l.ville,
      deplacement: l.deplacement as Deplacement,
      zone: l.zone,
      heures: l.heures,
      chargeMax: l.chargeMax,
      momo: {
        telephone: this.chiffrement.dechiffrer(l.momoTelephoneChiffre, CONTEXTE_MOMO_LIVREUR),
        operateur: l.momoOperateur as OperateurMobile,
      },
      pieces: {
        permisRef: l.permisRef,
        assuranceRef: l.assuranceRef,
        permisValideJusqua: jourVers(l.permisValideJusqua),
        assuranceExpireLe: jourVers(l.assuranceExpireLe),
      },
      moto: l.moto,
      disponible: l.disponible,
      actif: l.actif,
      note: l.note,
      creeA: iso(l.creeA),
    };
  }

  private donnees(l: LivreurStocke) {
    return {
      nom: l.nom,
      ville: l.ville,
      deplacement: l.deplacement,
      zone: l.zone,
      heures: l.heures,
      chargeMax: l.chargeMax,
      momoTelephoneChiffre: this.chiffrement.chiffrer(l.momo.telephone, CONTEXTE_MOMO_LIVREUR),
      momoOperateur: l.momo.operateur,
      permisRef: l.pieces.permisRef,
      assuranceRef: l.pieces.assuranceRef,
      permisValideJusqua: jourDe(l.pieces.permisValideJusqua),
      assuranceExpireLe: jourDe(l.pieces.assuranceExpireLe),
      moto: l.moto,
      disponible: l.disponible,
      actif: l.actif,
      note: l.note,
    };
  }

  async ajouter(livreur: LivreurStocke): Promise<boolean> {
    // INSERT … ON CONFLICT DO NOTHING : identifiant, badge ou compte déjà pris.
    const { count } = await this.prisma.livreur.createMany({
      data: [
        {
          id: livreur.id,
          version: 1,
          badge: livreur.badge,
          numero: livreur.numero,
          personneId: livreur.personneId,
          creeA: dateDe(livreur.creeA),
          ...this.donnees(livreur),
        },
      ],
      skipDuplicates: true,
    });
    return count === 1;
  }

  async trouver(id: string): Promise<LivreurStocke | null> {
    if (!estUuid(id)) return null;
    const l = await this.prisma.livreur.findUnique({ where: { id } });
    return l ? this.vers(l) : null;
  }

  async parPersonne(personneId: string): Promise<LivreurStocke | null> {
    if (!estUuid(personneId)) return null;
    const l = await this.prisma.livreur.findUnique({ where: { personneId } });
    return l ? this.vers(l) : null;
  }

  async lister(filtre: { actif?: boolean; disponible?: boolean } = {}): Promise<LivreurStocke[]> {
    const l = await this.prisma.livreur.findMany({
      where: {
        ...(filtre.actif === undefined ? {} : { actif: filtre.actif }),
        ...(filtre.disponible === undefined ? {} : { disponible: filtre.disponible }),
      },
      orderBy: { badge: "asc" },
    });
    return l.map((x) => this.vers(x));
  }

  async remplacer(livreur: LivreurStocke, versionAttendue: number): Promise<boolean> {
    if (!estUuid(livreur.id)) return false;
    // Ni le badge, ni le numéro, ni le compte, ni la date de création ne changent.
    const { count } = await this.prisma.livreur.updateMany({
      where: { id: livreur.id, version: versionAttendue },
      data: { ...this.donnees(livreur), version: versionAttendue + 1 },
    });
    return count === 1;
  }
}

/* ------------------------------------------------------------------ demandes */

@Injectable()
export class DemandesLivreurPrisma extends DemandesLivreurRepository {
  readonly durable = true;

  constructor(
    private readonly prisma: PrismaService,
    private readonly chiffrement: ChiffrementService,
  ) {
    super();
  }

  private vers(l: Prisma.DemandeLivreurGetPayload<object>): DemandeLivreur {
    return {
      dossier: l.dossier,
      version: l.version,
      personneId: l.personneId,
      numero: l.numero,
      ville: l.ville,
      deplacement: l.deplacement as Deplacement,
      zone: l.zone,
      heures: l.heures,
      chargeMax: l.chargeMax,
      momo: {
        telephone: this.chiffrement.dechiffrer(l.momoTelephoneChiffre, CONTEXTE_MOMO_LIVREUR),
        operateur: l.momoOperateur as OperateurMobile,
      },
      pieces: { permisRef: l.permisRef, assuranceRef: l.assuranceRef },
      deposeeA: iso(l.deposeeA),
      verifications: {
        identiteA: isoOuNul(l.verifIdentiteA),
        piecesA: isoOuNul(l.verifPiecesA),
        permisValideJusqua: jourVers(l.permisValideJusqua),
        assuranceExpireLe: jourVers(l.assuranceExpireLe),
        formationA: isoOuNul(l.verifFormationA),
      },
      etat: l.etat as EtatDemandeLivreur,
      decision: l.decision as DemandeLivreur["decision"],
      livreurId: l.livreurId,
    };
  }

  private modifiable(d: DemandeLivreur) {
    return {
      ville: d.ville,
      deplacement: d.deplacement,
      zone: d.zone,
      heures: d.heures,
      chargeMax: d.chargeMax,
      momoTelephoneChiffre: this.chiffrement.chiffrer(d.momo.telephone, CONTEXTE_MOMO_LIVREUR),
      momoOperateur: d.momo.operateur,
      permisRef: d.pieces.permisRef,
      assuranceRef: d.pieces.assuranceRef,
      deposeeA: dateDe(d.deposeeA),
      verifIdentiteA: dateOuNul(d.verifications.identiteA),
      verifPiecesA: dateOuNul(d.verifications.piecesA),
      permisValideJusqua: jourDe(d.verifications.permisValideJusqua),
      assuranceExpireLe: jourDe(d.verifications.assuranceExpireLe),
      verifFormationA: dateOuNul(d.verifications.formationA),
      etat: d.etat,
      decision: jsonOuNul(d.decision),
      livreurId: d.livreurId,
    };
  }

  async ajouter(demande: DemandeLivreur): Promise<ResultatAjoutDemandeLivreur> {
    try {
      await this.prisma.demandeLivreur.create({
        data: {
          dossier: demande.dossier,
          version: 1,
          personneId: demande.personneId,
          numero: demande.numero,
          ...this.modifiable(demande),
        },
      });
      return "ajoutee";
    } catch (e) {
      if (!porteCode(e, "P2002") && !porteCode(e, "23505")) throw e;
      // La clé primaire dit « dossier pris » ; l'index unique partiel dit « demande en cours ».
      const prise = await this.prisma.demandeLivreur.findUnique({
        where: { dossier: demande.dossier },
        select: { dossier: true },
      });
      return prise ? "dossier_pris" : "demande_en_cours";
    }
  }

  async trouver(dossier: string): Promise<DemandeLivreur | null> {
    const l = await this.prisma.demandeLivreur.findUnique({ where: { dossier } });
    return l ? this.vers(l) : null;
  }

  async derniereDe(personneId: string): Promise<DemandeLivreur | null> {
    if (!estUuid(personneId)) return null;
    const l = await this.prisma.demandeLivreur.findFirst({
      where: { personneId },
      orderBy: [{ deposeeA: "desc" }, { dossier: "desc" }],
    });
    return l ? this.vers(l) : null;
  }

  async remplacer(demande: DemandeLivreur, versionAttendue: number): Promise<boolean> {
    const { count } = await this.prisma.demandeLivreur.updateMany({
      where: { dossier: demande.dossier, version: versionAttendue },
      data: { ...this.modifiable(demande), version: versionAttendue + 1 },
    });
    return count === 1;
  }
}

/* ------------------------------------------------------------------ missions */

@Injectable()
export class MissionsPrisma extends MissionsRepository {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  private vers(l: Prisma.MissionLivraisonGetPayload<object>): MissionLivraison {
    return {
      id: l.id,
      version: l.version,
      colisId: l.colisId,
      colisNumero: l.colisNumero,
      etat: l.etat as EtatMission,
      livreurId: l.livreurId,
      proposeeA: isoOuNul(l.proposeeA),
      expireA: isoOuNul(l.expireA),
      essais: l.essais as unknown as EssaiMission[],
      tour: l.tour,
      prochaineA: isoOuNul(l.prochaineA),
      creeA: iso(l.creeA),
      accepteeA: isoOuNul(l.accepteeA),
      livreeA: isoOuNul(l.livreeA),
      trajet: l.trajet as unknown as MissionLivraison["trajet"],
      distanceM: l.distanceM,
      dureeMinutes: l.dureeMinutes,
      prixLivraison: l.prixLivraison,
      gain: l.gain,
      absence: l.absence as unknown as MissionLivraison["absence"],
      repliA: isoOuNul(l.repliA),
    };
  }

  private modifiable(m: MissionLivraison) {
    return {
      etat: m.etat,
      livreurId: m.livreurId,
      proposeeA: dateOuNul(m.proposeeA),
      expireA: dateOuNul(m.expireA),
      essais: json(m.essais),
      tour: m.tour,
      prochaineA: dateOuNul(m.prochaineA),
      accepteeA: dateOuNul(m.accepteeA),
      livreeA: dateOuNul(m.livreeA),
      trajet: json(m.trajet),
      distanceM: m.distanceM,
      dureeMinutes: m.dureeMinutes,
      prixLivraison: m.prixLivraison,
      gain: m.gain,
      absence: jsonOuNul(m.absence),
      repliA: dateOuNul(m.repliA),
    };
  }

  async ajouter(mission: MissionLivraison): Promise<ResultatAjoutMission> {
    // ON CONFLICT DO NOTHING joue aussi pour l'index unique partiel : le colis a déjà une mission ouverte.
    const { count } = await this.prisma.missionLivraison.createMany({
      data: [
        {
          id: mission.id,
          version: 1,
          colisId: mission.colisId,
          colisNumero: mission.colisNumero,
          creeA: dateDe(mission.creeA),
          ...this.modifiable(mission),
        },
      ],
      skipDuplicates: true,
    });
    return count === 1 ? "ajoutee" : "colis_deja_servi";
  }

  async trouver(id: string): Promise<MissionLivraison | null> {
    if (!estUuid(id)) return null;
    const l = await this.prisma.missionLivraison.findUnique({ where: { id } });
    return l ? this.vers(l) : null;
  }

  async derniereDuColis(colisId: string): Promise<MissionLivraison | null> {
    if (!estUuid(colisId)) return null;
    const l = await this.prisma.missionLivraison.findFirst({
      where: { colisId },
      orderBy: [{ creeA: "desc" }, { id: "desc" }],
    });
    return l ? this.vers(l) : null;
  }

  async parEtats(etats: readonly EtatMission[]): Promise<MissionLivraison[]> {
    const l = await this.prisma.missionLivraison.findMany({
      where: { etat: { in: [...etats] } },
      orderBy: [{ creeA: "asc" }, { id: "asc" }],
    });
    return l.map((x) => this.vers(x));
  }

  async deLivreur(livreurId: string, etats: readonly EtatMission[]): Promise<MissionLivraison[]> {
    if (!estUuid(livreurId)) return [];
    const l = await this.prisma.missionLivraison.findMany({
      where: { livreurId, etat: { in: [...etats] } },
      orderBy: [{ creeA: "asc" }, { id: "asc" }],
    });
    return l.map((x) => this.vers(x));
  }

  async terminees(livreurId: string, depuis: string): Promise<MissionLivraison[]> {
    if (!estUuid(livreurId)) return [];
    const d = dateDe(depuis);
    // L'instant de fin est celui de la livraison, à défaut celui du repli, à défaut la création.
    const l = await this.prisma.missionLivraison.findMany({
      where: {
        livreurId,
        etat: { in: ["livree", "repli"] },
        OR: [
          { livreeA: { gte: d } },
          { livreeA: null, repliA: { gte: d } },
          { livreeA: null, repliA: null, creeA: { gte: d } },
        ],
      },
      orderBy: [{ creeA: "asc" }, { id: "asc" }],
    });
    return l.map((x) => this.vers(x));
  }

  async remplacer(mission: MissionLivraison, versionAttendue: number): Promise<boolean> {
    if (!estUuid(mission.id)) return false;
    // Ni le colis, ni le numéro, ni la date de création ne changent.
    const { count } = await this.prisma.missionLivraison.updateMany({
      where: { id: mission.id, version: versionAttendue },
      data: { ...this.modifiable(mission), version: versionAttendue + 1 },
    });
    return count === 1;
  }
}

/* ------------------------------------------------------------------ liens de suivi et invitations */

@Injectable()
export class PartagesSuiviPrisma extends PartagesSuivi {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async ajouter(partage: PartageSuivi): Promise<void> {
    await this.prisma.partageSuivi.createMany({
      data: [
        {
          jetonHache: partage.jetonHache,
          colisId: partage.colisId,
          creeA: dateDe(partage.creeA),
          expireA: dateDe(partage.expireA),
        },
      ],
      skipDuplicates: true,
    });
  }

  async trouver(jetonHache: string): Promise<PartageSuivi | null> {
    const l = await this.prisma.partageSuivi.findUnique({ where: { jetonHache } });
    if (!l) return null;
    return {
      jetonHache: l.jetonHache,
      colisId: l.colisId,
      creeA: iso(l.creeA),
      expireA: iso(l.expireA),
    };
  }

  async compter(colisId: string): Promise<number> {
    if (!estUuid(colisId)) return 0;
    return this.prisma.partageSuivi.count({ where: { colisId } });
  }
}

@Injectable()
export class InvitationsPrisma extends Invitations {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async ajouter(invitation: InvitationLivreur): Promise<void> {
    await this.prisma.invitationLivreur.create({
      data: { livreurId: invitation.livreurId, at: dateDe(invitation.at) },
    });
  }

  async compterDepuis(livreurId: string, depuis: string): Promise<number> {
    if (!estUuid(livreurId)) return 0;
    return this.prisma.invitationLivreur.count({
      where: { livreurId, at: { gte: dateDe(depuis) } },
    });
  }
}
