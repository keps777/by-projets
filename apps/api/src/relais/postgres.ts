import { Injectable } from "@nestjs/common";
import { Prisma } from "../socle/db/generated/client";
import { ChiffrementService } from "../socle/chiffrement/chiffrement.service";
import { PrismaService } from "../socle/db/prisma.service";
import type {
  BrouillonRelais,
  DemandeRelais,
  FicheRelais,
  PointRelaisStocke,
  ReceptionRelais,
} from "./modele";
import {
  AttributionRoles,
  BrouillonsRelais,
  CompteursDossiers,
  DemandesRelaisRepository,
  Lieux,
  Portefeuille,
  ReceptionsRelais,
  RelaisRepository,
  type Credit,
  type Debit,
  type ResultatAjoutDemande,
  type ResultatReservation,
  type TypePartenaire,
} from "./ports";
import type { OperateurMobile, Point } from "./regles";
import { versIsoDouala } from "./temps";

/**
 * Adaptateurs PostgreSQL (Prisma) des points relais et du portefeuille partagé avec la livraison.
 * Tables : `relais`, `demande_relais`, `brouillon_relais`, `compteur_dossier`, `reception_relais`,
 * `credit_partenaire`, `debit_partenaire`, `coordonnees_gare`, `adresse_geolocalisee` (migration
 * `20261017000802_relais`). Les numéros MoMo ne sont jamais écrits en clair.
 *
 * Les garanties tiennent dans la base :
 * - **concurrence optimiste** : `remplacer` est un `UPDATE … WHERE id = $1 AND version = $2` ;
 * - **une demande ouverte par personne** : index unique partiel `demande_relais_une_ouverte` ;
 * - **numéros de dossier sans trou ni doublon** : `INSERT … ON CONFLICT DO UPDATE … RETURNING` ;
 * - **un gain n'est compté qu'une fois** : clé primaire `cle` de `credit_partenaire` ;
 * - **deux retraits simultanés ne dépensent pas deux fois le solde** : `reserver` prend un verrou
 *   consultatif par partenaire avant de relire le solde.
 */

/** Espace de noms des verrous consultatifs du portefeuille (livraison et relais). */
const VERROU_PORTEFEUILLE = 7_017_148;

export const CONTEXTE_MOMO_RELAIS = "relais.momo.telephone";
export const CONTEXTE_DEBIT_TELEPHONE = "portefeuille.debit.telephone";

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const estUuid = (v: string): boolean => UUID.test(v);

/** Vrai si l'erreur (ou sa cause) porte ce code SQLSTATE ou Prisma. */
export function porteCode(e: unknown, code: string): boolean {
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

export const iso = (d: Date): string => versIsoDouala(d);
export const isoOuNul = (d: Date | null): string | null => (d === null ? null : versIsoDouala(d));
export const dateDe = (s: string): Date => new Date(s);
export const dateOuNul = (s: string | null): Date | null => (s === null ? null : new Date(s));
export const json = (v: unknown): Prisma.InputJsonValue => v as Prisma.InputJsonValue;
export const jsonOuNul = (v: unknown) => (v === null ? Prisma.DbNull : json(v));

/**
 * Recopie une fiche en chiffrant (ou déchiffrant) le téléphone MoMo qu'elle porte. La fiche peut être
 * partielle (brouillon) : on ne touche qu'à ce qui est là.
 */
function transformerMomo<T extends { momo?: { telephone?: string } }>(
  fiche: T,
  f: (telephone: string) => string,
): T {
  const copie = structuredClone(fiche);
  if (copie.momo && typeof copie.momo.telephone === "string") {
    copie.momo.telephone = f(copie.momo.telephone);
  }
  return copie;
}

/* ------------------------------------------------------------------ points relais */

type LigneRelais = Prisma.RelaisGetPayload<object>;

@Injectable()
export class RelaisPrisma extends RelaisRepository {
  readonly durable = true;

  constructor(
    private readonly prisma: PrismaService,
    private readonly chiffrement: ChiffrementService,
  ) {
    super();
  }

  private vers(l: LigneRelais): PointRelaisStocke {
    return {
      id: l.id,
      version: l.version,
      code: l.code,
      personneId: l.personneId,
      nom: l.nom,
      typeBoutique: l.typeBoutique,
      ville: l.ville,
      quartier: l.quartier,
      repere: l.repere,
      position:
        l.latitude === null || l.longitude === null ? null : { lat: l.latitude, lon: l.longitude },
      ouvert: l.ouvert,
      tailleMax: l.tailleMax,
      capacite: l.capacite,
      particularite: l.particularite,
      momo: {
        telephone: this.chiffrement.dechiffrer(l.momoTelephoneChiffre, CONTEXTE_MOMO_RELAIS),
        operateur: l.momoOperateur as OperateurMobile,
      },
      facadeRef: l.facadeRef,
      actif: l.actif,
      note: l.note,
      creeA: iso(l.creeA),
      premierColisA: isoOuNul(l.premierColisA),
    };
  }

  private donnees(r: PointRelaisStocke) {
    return {
      nom: r.nom,
      typeBoutique: r.typeBoutique,
      ville: r.ville,
      quartier: r.quartier,
      repere: r.repere,
      latitude: r.position?.lat ?? null,
      longitude: r.position?.lon ?? null,
      ouvert: r.ouvert,
      tailleMax: r.tailleMax,
      capacite: r.capacite,
      particularite: r.particularite,
      momoTelephoneChiffre: this.chiffrement.chiffrer(r.momo.telephone, CONTEXTE_MOMO_RELAIS),
      momoOperateur: r.momo.operateur,
      facadeRef: r.facadeRef,
      actif: r.actif,
      note: r.note,
      premierColisA: dateOuNul(r.premierColisA),
    };
  }

  async ajouter(relais: PointRelaisStocke): Promise<boolean> {
    // INSERT … ON CONFLICT DO NOTHING : identifiant, code ou compte déjà pris.
    const { count } = await this.prisma.relais.createMany({
      data: [
        {
          id: relais.id,
          code: relais.code,
          personneId: relais.personneId,
          creeA: dateDe(relais.creeA),
          version: 1,
          ...this.donnees(relais),
        },
      ],
      skipDuplicates: true,
    });
    return count === 1;
  }

  async trouver(id: string): Promise<PointRelaisStocke | null> {
    if (!estUuid(id)) return null;
    const l = await this.prisma.relais.findUnique({ where: { id } });
    return l ? this.vers(l) : null;
  }

  async parPersonne(personneId: string): Promise<PointRelaisStocke | null> {
    if (!estUuid(personneId)) return null;
    const l = await this.prisma.relais.findUnique({ where: { personneId } });
    return l ? this.vers(l) : null;
  }

  async lister(filtre: { ville?: string; actif?: boolean } = {}): Promise<PointRelaisStocke[]> {
    const l = await this.prisma.relais.findMany({
      where: {
        ...(filtre.ville === undefined ? {} : { ville: filtre.ville }),
        ...(filtre.actif === undefined ? {} : { actif: filtre.actif }),
      },
      orderBy: { code: "asc" },
    });
    return l.map((x) => this.vers(x));
  }

  async remplacer(relais: PointRelaisStocke, versionAttendue: number): Promise<boolean> {
    if (!estUuid(relais.id)) return false;
    const { count } = await this.prisma.relais.updateMany({
      where: { id: relais.id, version: versionAttendue },
      data: { ...this.donnees(relais), version: versionAttendue + 1 },
    });
    return count === 1;
  }
}

/* ------------------------------------------------------------------ demandes et brouillons */

@Injectable()
export class DemandesRelaisPrisma extends DemandesRelaisRepository {
  readonly durable = true;

  constructor(
    private readonly prisma: PrismaService,
    private readonly chiffrement: ChiffrementService,
  ) {
    super();
  }

  private chiffrerFiche(f: FicheRelais): Prisma.InputJsonValue {
    return json(transformerMomo(f, (t) => this.chiffrement.chiffrer(t, CONTEXTE_MOMO_RELAIS)));
  }

  private vers(l: Prisma.DemandeRelaisGetPayload<object>): DemandeRelais {
    return {
      dossier: l.dossier,
      version: l.version,
      personneId: l.personneId,
      fiche: transformerMomo(l.fiche as unknown as FicheRelais, (t) =>
        this.chiffrement.dechiffrer(t, CONTEXTE_MOMO_RELAIS),
      ),
      etat: l.etat as DemandeRelais["etat"],
      deposeeA: iso(l.deposeeA),
      visite: l.visite as DemandeRelais["visite"],
      decision: l.decision as DemandeRelais["decision"],
      relaisId: l.relaisId,
    };
  }

  async ajouter(demande: DemandeRelais): Promise<ResultatAjoutDemande> {
    try {
      await this.prisma.demandeRelais.create({
        data: {
          dossier: demande.dossier,
          version: 1,
          personneId: demande.personneId,
          fiche: this.chiffrerFiche(demande.fiche),
          etat: demande.etat,
          deposeeA: dateDe(demande.deposeeA),
          visite: jsonOuNul(demande.visite),
          decision: jsonOuNul(demande.decision),
          relaisId: demande.relaisId,
        },
      });
      return "ajoutee";
    } catch (e) {
      if (!porteCode(e, "P2002") && !porteCode(e, "23505")) throw e;
      // La clé primaire dit « dossier pris » ; l'index unique partiel dit « demande en cours ».
      const prise = await this.prisma.demandeRelais.findUnique({
        where: { dossier: demande.dossier },
        select: { dossier: true },
      });
      return prise ? "dossier_pris" : "demande_en_cours";
    }
  }

  async trouver(dossier: string): Promise<DemandeRelais | null> {
    const l = await this.prisma.demandeRelais.findUnique({ where: { dossier } });
    return l ? this.vers(l) : null;
  }

  async derniereDe(personneId: string): Promise<DemandeRelais | null> {
    if (!estUuid(personneId)) return null;
    const l = await this.prisma.demandeRelais.findFirst({
      where: { personneId },
      orderBy: [{ deposeeA: "desc" }, { dossier: "desc" }],
    });
    return l ? this.vers(l) : null;
  }

  async remplacer(demande: DemandeRelais, versionAttendue: number): Promise<boolean> {
    const { count } = await this.prisma.demandeRelais.updateMany({
      where: { dossier: demande.dossier, version: versionAttendue },
      data: {
        fiche: this.chiffrerFiche(demande.fiche),
        etat: demande.etat,
        deposeeA: dateDe(demande.deposeeA),
        visite: jsonOuNul(demande.visite),
        decision: jsonOuNul(demande.decision),
        relaisId: demande.relaisId,
        version: versionAttendue + 1,
      },
    });
    return count === 1;
  }
}

@Injectable()
export class BrouillonsRelaisPrisma extends BrouillonsRelais {
  readonly durable = true;

  constructor(
    private readonly prisma: PrismaService,
    private readonly chiffrement: ChiffrementService,
  ) {
    super();
  }

  async lire(personneId: string): Promise<BrouillonRelais | null> {
    if (!estUuid(personneId)) return null;
    const l = await this.prisma.brouillonRelais.findUnique({ where: { personneId } });
    if (!l) return null;
    return {
      personneId: l.personneId,
      fiche: transformerMomo(l.fiche as Partial<FicheRelais>, (t) =>
        this.chiffrement.dechiffrer(t, CONTEXTE_MOMO_RELAIS),
      ),
      enregistreA: iso(l.enregistreA),
    };
  }

  async enregistrer(brouillon: BrouillonRelais): Promise<void> {
    const fiche = json(
      transformerMomo(brouillon.fiche, (t) => this.chiffrement.chiffrer(t, CONTEXTE_MOMO_RELAIS)),
    );
    const enregistreA = dateDe(brouillon.enregistreA);
    await this.prisma.brouillonRelais.upsert({
      where: { personneId: brouillon.personneId },
      create: { personneId: brouillon.personneId, fiche, enregistreA },
      update: { fiche, enregistreA },
    });
  }

  async supprimer(personneId: string): Promise<void> {
    if (!estUuid(personneId)) return;
    await this.prisma.brouillonRelais.deleteMany({ where: { personneId } });
  }
}

@Injectable()
export class CompteursDossiersPrisma extends CompteursDossiers {
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

/* ------------------------------------------------------------------ réceptions */

@Injectable()
export class ReceptionsRelaisPrisma extends ReceptionsRelais {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  private vers(l: Prisma.ReceptionRelaisGetPayload<object>): ReceptionRelais {
    return {
      colisId: l.colisId,
      relaisId: l.relaisId,
      recuA: iso(l.recuA),
      rappelEnvoyeA: isoOuNul(l.rappelEnvoyeA),
      remiseOuverteA: isoOuNul(l.remiseOuverteA),
    };
  }

  async ajouter(reception: ReceptionRelais): Promise<boolean> {
    const { count } = await this.prisma.receptionRelais.createMany({
      data: [
        {
          colisId: reception.colisId,
          relaisId: reception.relaisId,
          recuA: dateDe(reception.recuA),
          rappelEnvoyeA: dateOuNul(reception.rappelEnvoyeA),
          remiseOuverteA: dateOuNul(reception.remiseOuverteA),
        },
      ],
      skipDuplicates: true,
    });
    return count === 1;
  }

  async trouver(colisId: string): Promise<ReceptionRelais | null> {
    if (!estUuid(colisId)) return null;
    const l = await this.prisma.receptionRelais.findUnique({ where: { colisId } });
    return l ? this.vers(l) : null;
  }

  async lister(relaisId: string): Promise<ReceptionRelais[]> {
    if (!estUuid(relaisId)) return [];
    const l = await this.prisma.receptionRelais.findMany({
      where: { relaisId },
      orderBy: [{ recuA: "asc" }, { colisId: "asc" }],
    });
    return l.map((x) => this.vers(x));
  }

  async marquerRappel(colisId: string, a: string): Promise<boolean> {
    if (!estUuid(colisId)) return false;
    const { count } = await this.prisma.receptionRelais.updateMany({
      where: { colisId, rappelEnvoyeA: null },
      data: { rappelEnvoyeA: dateDe(a) },
    });
    return count === 1;
  }

  async ouvrirRemise(colisId: string, a: string | null): Promise<void> {
    if (!estUuid(colisId)) return;
    await this.prisma.receptionRelais.updateMany({
      where: { colisId },
      data: { remiseOuverteA: dateOuNul(a) },
    });
  }
}

/* ------------------------------------------------------------------ portefeuille */

@Injectable()
export class PortefeuillePrisma extends Portefeuille {
  readonly durable = true;

  constructor(
    private readonly prisma: PrismaService,
    private readonly chiffrement: ChiffrementService,
  ) {
    super();
  }

  async crediter(credit: Credit): Promise<boolean> {
    const { count } = await this.prisma.creditPartenaire.createMany({
      data: [
        {
          cle: credit.cle,
          type: credit.type,
          partenaireId: credit.partenaireId,
          montant: credit.montant,
          motif: credit.motif,
          reference: credit.reference,
          at: dateDe(credit.at),
        },
      ],
      skipDuplicates: true,
    });
    return count === 1;
  }

  private async soldeTx(
    tx: Prisma.TransactionClient,
    type: TypePartenaire,
    partenaireId: string,
  ): Promise<number> {
    const [credits, debits] = await Promise.all([
      tx.creditPartenaire.aggregate({ _sum: { montant: true }, where: { type, partenaireId } }),
      tx.debitPartenaire.aggregate({ _sum: { montant: true }, where: { type, partenaireId } }),
    ]);
    return (credits._sum.montant ?? 0) - (debits._sum.montant ?? 0);
  }

  async solde(type: TypePartenaire, partenaireId: string): Promise<number> {
    if (!estUuid(partenaireId)) return 0;
    return this.prisma.$transaction((tx) => this.soldeTx(tx, type, partenaireId));
  }

  async reserver(demande: {
    cle: string;
    type: TypePartenaire;
    partenaireId: string;
    montant: number;
    motif: Debit["motif"];
    at: string;
    soldeMinimum: number;
    operateur: OperateurMobile;
    telephone: string;
    libelle: string;
  }): Promise<ResultatReservation> {
    if (!estUuid(demande.partenaireId)) return "solde_insuffisant";
    return this.prisma.$transaction(async (tx): Promise<ResultatReservation> => {
      // Un verrou par partenaire : deux retraits simultanés passent l'un après l'autre et le second
      // relit le solde déjà amputé du premier.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${VERROU_PORTEFEUILLE}::int, hashtext(${`${demande.type}:${demande.partenaireId}`}))`;
      const existe = await tx.debitPartenaire.findUnique({
        where: { cle: demande.cle },
        select: { cle: true },
      });
      if (existe) return "existe";
      const solde = await this.soldeTx(tx, demande.type, demande.partenaireId);
      if (demande.montant <= 0 || solde < Math.max(demande.montant, demande.soldeMinimum)) {
        return "solde_insuffisant";
      }
      await tx.debitPartenaire.create({
        data: {
          cle: demande.cle,
          type: demande.type,
          partenaireId: demande.partenaireId,
          montant: demande.montant,
          motif: demande.motif,
          at: dateDe(demande.at),
          etat: "en_attente",
          operateur: demande.operateur,
          telephoneChiffre: this.chiffrement.chiffrer(demande.telephone, CONTEXTE_DEBIT_TELEPHONE),
          libelle: demande.libelle,
        },
      });
      return "reserve";
    });
  }

  async confirmer(cle: string, reference: string): Promise<void> {
    await this.prisma.debitPartenaire.updateMany({
      where: { cle, etat: "en_attente" },
      data: { etat: "verse", reference },
    });
  }

  async annuler(cle: string): Promise<void> {
    // Seul un débit « en attente » disparaît : l'argent versé ne revient pas dans le solde.
    await this.prisma.debitPartenaire.deleteMany({ where: { cle, etat: "en_attente" } });
  }

  async debitsEnAttente(): Promise<Debit[]> {
    const l = await this.prisma.debitPartenaire.findMany({
      where: { etat: "en_attente" },
      orderBy: [{ at: "asc" }, { cle: "asc" }],
    });
    return l.map((d) => ({
      cle: d.cle,
      type: d.type as TypePartenaire,
      partenaireId: d.partenaireId,
      montant: d.montant,
      motif: d.motif as Debit["motif"],
      at: iso(d.at),
      etat: d.etat as Debit["etat"],
      operateur: d.operateur as OperateurMobile,
      telephone: this.chiffrement.dechiffrer(d.telephoneChiffre, CONTEXTE_DEBIT_TELEPHONE),
      libelle: d.libelle,
      reference: d.reference,
    }));
  }

  private versCredit(c: Prisma.CreditPartenaireGetPayload<object>): Credit {
    return {
      cle: c.cle,
      type: c.type as TypePartenaire,
      partenaireId: c.partenaireId,
      montant: c.montant,
      motif: c.motif as Credit["motif"],
      reference: c.reference,
      at: iso(c.at),
    };
  }

  async credits(
    type: TypePartenaire,
    partenaireId: string,
    depuis: string,
    avant?: string,
  ): Promise<Credit[]> {
    if (!estUuid(partenaireId)) return [];
    const l = await this.prisma.creditPartenaire.findMany({
      where: {
        type,
        partenaireId,
        at: { gte: dateDe(depuis), ...(avant === undefined ? {} : { lt: dateDe(avant) }) },
      },
      orderBy: [{ at: "asc" }, { cle: "asc" }],
    });
    return l.map((c) => this.versCredit(c));
  }

  async creditsPeriode(type: TypePartenaire, depuis: string, avant: string): Promise<Credit[]> {
    const l = await this.prisma.creditPartenaire.findMany({
      where: { type, at: { gte: dateDe(depuis), lt: dateDe(avant) } },
      orderBy: [{ at: "asc" }, { cle: "asc" }],
    });
    return l.map((c) => this.versCredit(c));
  }

  async soldesPositifs(type: TypePartenaire): Promise<{ partenaireId: string; solde: number }[]> {
    const l = await this.prisma.$queryRaw<{ partenaireId: string; solde: number }[]>`
      SELECT c."partenaireId", (c."total" - COALESCE(d."total", 0))::int AS "solde"
      FROM (SELECT "partenaireId", SUM("montant") AS "total" FROM "credit_partenaire"
            WHERE "type" = ${type} GROUP BY "partenaireId") c
      LEFT JOIN (SELECT "partenaireId", SUM("montant") AS "total" FROM "debit_partenaire"
                 WHERE "type" = ${type} GROUP BY "partenaireId") d USING ("partenaireId")
      WHERE c."total" - COALESCE(d."total", 0) > 0
      ORDER BY c."partenaireId"`;
    return l.map((x) => ({ partenaireId: x.partenaireId, solde: Number(x.solde) }));
  }
}

/* ------------------------------------------------------------------ lieux et rôles */

/**
 * Coordonnées lues dans la base : celles des gares (`coordonnees_gare`) et des adresses déjà
 * géocodées (`adresse_geolocalisee`, clé « ville|adresse » en minuscules). Aucun géocodeur n'écrit
 * encore dans la seconde : une adresse inconnue reste sans coordonnées, les distances sont alors
 * estimées par le module (3 km, 10 minutes).
 */
@Injectable()
export class LieuxPrisma extends Lieux {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async pointDeLaGare(gareId: string): Promise<Point | null> {
    if (!estUuid(gareId)) return null;
    const l = await this.prisma.coordonneesGare.findUnique({ where: { gareId } });
    return l ? { lat: l.latitude, lon: l.longitude } : null;
  }

  async pointDeLAdresse(adresse: string, ville: string): Promise<Point | null> {
    const l = await this.prisma.adresseGeolocalisee.findUnique({
      where: { cle: `${ville}|${adresse}`.toLowerCase() },
    });
    return l ? { lat: l.latitude, lon: l.longitude } : null;
  }

  /** Enregistre (ou corrige) les coordonnées d'une adresse. */
  async poserAdresse(adresse: string, ville: string, point: Point): Promise<void> {
    const cle = `${ville}|${adresse}`.toLowerCase();
    await this.prisma.adresseGeolocalisee.upsert({
      where: { cle },
      create: { cle, latitude: point.lat, longitude: point.lon },
      update: { latitude: point.lat, longitude: point.lon },
    });
  }
}

/** Ajoute le rôle de relais ou de livreur au compte, une seule fois (`personne.roles`). */
@Injectable()
export class AttributionRolesPrisma extends AttributionRoles {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async ajouterRole(personneId: string, role: "relais" | "livreur"): Promise<void> {
    if (!estUuid(personneId)) return;
    await this.prisma.$executeRaw`
      UPDATE "personne" SET "roles" = array_append("roles", ${role}::"role")
      WHERE "id" = ${personneId}::uuid AND NOT (${role}::"role" = ANY("roles"))`;
  }
}
