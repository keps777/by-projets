import { Injectable } from "@nestjs/common";
import type { patron as c } from "@afrimove/contrats";
import { nomAbrege } from "../caisse/format";
import { estErreurSql, UUID } from "../caisse/sql";
import { debutJourDoualaMs, MS_PAR_JOUR } from "../caisse/temps";
import { debutDeJour } from "../rapport/temps";
import { TelephoneDejaUtilise } from "../socle/comptes/personnes.repository";
import { Prisma, type Role } from "../socle/db/generated/client";
import { PrismaService } from "../socle/db/prisma.service";
import { resumerAppareils } from "./calculs";
import {
  droitsParDefaut,
  ROLES_EQUIPE,
  type ActivitePersonne,
  type AlerteEcrite,
  type ArretBus,
  type ChangementMembre,
  type CompagniePatron,
  type ConfirmationMomo,
  type DepartExploitation,
  type Droits,
  type DossierEnAttente,
  type EvenementJournal,
  type GarePatron,
  type MembrePatron,
  type NouveauMembre,
  type OperateurMomo,
  type OperateurPersonne,
  type PanneSignalee,
  type PropositionEnAttente,
  type ReglesLues,
  type RoleEquipe,
} from "./modele";
import {
  AlertesEcrites,
  EquipePatron,
  ExploitationPatron,
  ReferentielPatron,
  ReglesPatron,
} from "./ports";

/**
 * Adaptateurs PostgreSQL (Prisma) des ports du module patron.
 *
 * Tables lues : `compagnie`, `gare`, `guichet`, `appareil_sync`, `bus`, `depart`, `billet`,
 * `colis`, `colis_inter_agences`, `reclamation_colis`, `demande_annulation`, `session_caisse`, `personne`,
 * `alerte_patron`, `alerte_arret`, `depart_incident`, `depart_observation`, `journal_agence`,
 * `assistant_proposition`, `dossier_financement`. Les lignes (`ligne`, `arret`, `horaire_ligne`,
 * `reglage_ligne`) ne sont pas lues d'ici : elles appartiennent au module administration.
 * Tables écrites : `personne` (compte de l'équipe), `compagnie.toleranceEcartCaisse`, et les quatre tables de
 * la migration `lot_da_reglages_patron` : `personne_reglage`, `regles_compagnie`, `compte_momo_agence`,
 * `confirmation_compte_momo`.
 *
 * Ce que la base garantit, sans compter sur le code (migration `lot_da_garanties`) : l'opérateur, le jour de
 * paie, les règles et les essais de confirmation sont bornés par des CHECK ; supprimer une personne emporte
 * ses réglages. Chaque écriture à plusieurs tables est une seule transaction.
 */

const ROLES_PG = ROLES_EQUIPE as unknown as Role[];
const ETATS_VENDUS = ["paye", "embarque", "voyage", "non_presente"] as const;
const SYNC_RECENTE_JOURS = 90;
/** Espace des verrous consultatifs du module patron. */
const VERROU_PATRON = 7_017_410;

const roleDe = (roles: readonly string[]): RoleEquipe | null =>
  ROLES_EQUIPE.find((r) => roles.includes(r)) ?? null;

const enJson = (valeur: unknown): Prisma.InputJsonValue => valeur as Prisma.InputJsonValue;

/* ------------------------------------------------------------------ référentiel */

@Injectable()
export class ReferentielPatronPrisma extends ReferentielPatron {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async compagnie(id: string): Promise<CompagniePatron | null> {
    if (!UUID.test(id)) return null;
    const l = await this.prisma.compagnie.findUnique({
      where: { id },
      select: { id: true, nom: true },
    });
    return l ? { id: l.id, nom: l.nom } : null;
  }

  async gares(compagnieId: string, maintenant: Date): Promise<GarePatron[]> {
    if (!UUID.test(compagnieId)) return [];
    const [gares, appareils, quais] = await Promise.all([
      this.prisma.gare.findMany({
        where: { compagnieId },
        include: { guichets: { orderBy: { rang: "asc" } } },
        orderBy: [{ nom: "asc" }, { id: "asc" }],
      }),
      this.prisma.appareilSync.findMany({
        where: { compagnieId, genre: "guichet", retire: false },
        select: { gareId: true, rang: true, derniereSyncA: true },
      }),
      this.prisma.$queryRaw<{ gareId: string; quais: number }[]>`
        SELECT l."origineGareId"::text AS "gareId", COALESCE(max(d."quai"), 0)::int AS quais
        FROM "depart" d JOIN "ligne" l ON l."id" = d."ligneId"
        WHERE l."compagnieId" = ${compagnieId}::uuid
        GROUP BY l."origineGareId"`,
    ]);
    const nbQuais = new Map(quais.map((q) => [q.gareId, q.quais]));
    return gares.map((g) => ({
      id: g.id,
      code: g.code,
      nom: g.nom,
      ville: g.ville,
      guichets: g.guichets.map((k) => ({ id: k.id, rang: k.rang })),
      nbQuais: nbQuais.get(g.id) ?? 0,
      appareils: resumerAppareils(
        appareils
          .filter((a) => a.gareId === g.id && a.rang !== null)
          .map((a) => ({ rang: a.rang!, derniereSyncA: a.derniereSyncA })),
        maintenant,
      ),
    }));
  }

  async nbBus(compagnieId: string): Promise<number> {
    if (!UUID.test(compagnieId)) return 0;
    return this.prisma.bus.count({ where: { compagnieId } });
  }
}

/* ------------------------------------------------------------------ exploitation */

interface LigneDepartExploitation {
  departId: string;
  gareId: string;
  origine: string;
  destination: string;
  heureDepart: Date;
  etat: string;
  quai: number | null;
  bus: string | null;
  capacite: number;
  vendus: number;
  chauffeur: string | null;
  convoyeur: string | null;
  embarquementA: Date | null;
  note: string | null;
}

@Injectable()
export class ExploitationPatronPrisma extends ExploitationPatron {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async departsDuJour(compagnieId: string, jour: string): Promise<DepartExploitation[]> {
    if (!UUID.test(compagnieId) || !/^\d{4}-\d{2}-\d{2}$/.test(jour)) return [];
    const debut = debutDeJour(jour);
    if (debut === null) return [];
    const fin = new Date(debut.getTime() + MS_PAR_JOUR);
    const lignes = await this.prisma.$queryRaw<LigneDepartExploitation[]>`
      SELECT d."id"::text AS "departId", l."origineGareId"::text AS "gareId",
             go."ville" AS origine, gd."ville" AS destination,
             d."heureDepart", d."etat"::text AS etat, d."quai",
             bu."immatriculation" AS bus, COALESCE(bu."capacite", 0)::int AS capacite,
             COALESCE(bi.vendus, 0)::int AS vendus,
             ch."nom" AS chauffeur, cv."nom" AS convoyeur,
             bi.embarquement AS "embarquementA", o."note"
      FROM "depart" d
      JOIN "ligne" l ON l."id" = d."ligneId" AND l."compagnieId" = ${compagnieId}::uuid
      JOIN "gare" go ON go."id" = l."origineGareId"
      JOIN "gare" gd ON gd."id" = l."destinationGareId"
      LEFT JOIN "bus" bu ON bu."id" = d."busId"
      LEFT JOIN "personne" ch ON ch."id" = d."chauffeurId"
      LEFT JOIN "personne" cv ON cv."id" = d."convoyeurId"
      LEFT JOIN "depart_observation" o ON o."departId" = d."id"
      LEFT JOIN LATERAL (
        SELECT (count(*) FILTER (WHERE b."etat" IN ('paye', 'embarque', 'voyage')))::int AS vendus,
               min(b."embarqueA") AS embarquement
        FROM "billet" b WHERE b."departId" = d."id"
      ) bi ON true
      WHERE d."heureDepart" >= ${debut} AND d."heureDepart" < ${fin}
      ORDER BY d."heureDepart", d."id"`;
    return lignes.map((l) => ({
      ...l,
      chauffeur: l.chauffeur === null || l.chauffeur === "" ? null : nomAbrege(l.chauffeur),
      convoyeur: l.convoyeur === null || l.convoyeur === "" ? null : nomAbrege(l.convoyeur),
    }));
  }

  async busEnRoute(compagnieId: string): Promise<number> {
    if (!UUID.test(compagnieId)) return 0;
    const lignes = await this.prisma.$queryRaw<{ n: number }[]>`
      SELECT count(DISTINCT d."busId")::int AS n
      FROM "depart" d JOIN "ligne" l ON l."id" = d."ligneId"
      WHERE l."compagnieId" = ${compagnieId}::uuid AND d."etat" = 'parti' AND d."busId" IS NOT NULL`;
    return lignes[0]?.n ?? 0;
  }

  async arretsOuverts(compagnieId: string): Promise<ArretBus[]> {
    if (!UUID.test(compagnieId)) return [];
    const lignes = await this.prisma.alerteArret.findMany({
      where: { compagnieId, resolueA: null },
      orderBy: [{ ouverteA: "desc" }, { id: "asc" }],
    });
    return lignes.map((l) => ({
      id: l.id,
      departId: l.departId,
      immatriculation: l.immatriculation,
      apres: l.apres,
      arretDepuis: l.arretDepuis,
      soupcon: l.soupcon as ArretBus["soupcon"],
      aBord: l.aBord,
    }));
  }

  async pannesDepuis(compagnieId: string, depuis: Date): Promise<PanneSignalee[]> {
    if (!UUID.test(compagnieId)) return [];
    const lignes = await this.prisma.$queryRaw<
      {
        id: string;
        departId: string;
        immatriculation: string | null;
        description: string;
        signaleA: Date;
      }[]
    >`
      SELECT i."id"::text AS id, i."departId"::text AS "departId", bu."immatriculation",
             i."description", i."signaleA"
      FROM "depart_incident" i
      JOIN "depart" d ON d."id" = i."departId"
      JOIN "ligne" l ON l."id" = d."ligneId" AND l."compagnieId" = ${compagnieId}::uuid
      LEFT JOIN "bus" bu ON bu."id" = d."busId"
      WHERE i."nature" = 'panne' AND i."signaleA" >= ${depuis}
      ORDER BY i."signaleA" DESC, i."id"`;
    return lignes.map((l) => ({ ...l, immatriculation: l.immatriculation ?? "" }));
  }

  async propositionsEnAttente(
    compagnieId: string,
    maintenant: Date,
  ): Promise<PropositionEnAttente[]> {
    if (!UUID.test(compagnieId)) return [];
    const lignes = await this.prisma.assistantProposition.findMany({
      where: { compagnieId, appliqueeA: null, expireLe: { gt: maintenant } },
      orderBy: [{ proposeeLe: "desc" }, { actionId: "asc" }],
    });
    return lignes.map((l) => ({
      actionId: l.actionId,
      libelle: String((l.action as { libelle?: unknown }).libelle ?? l.actionId),
      proposeeLe: l.proposeeLe,
    }));
  }

  async decalagesProposes(compagnieId: string, maintenant: Date): Promise<Record<string, string>> {
    if (!UUID.test(compagnieId)) return {};
    const lignes = await this.prisma.assistantProposition.findMany({
      where: { compagnieId, appliqueeA: null, expireLe: { gt: maintenant } },
      orderBy: [{ proposeeLe: "desc" }, { actionId: "asc" }],
    });
    const decalages: Record<string, string> = {};
    for (const l of lignes) {
      const p = (l.action as { parametres?: Record<string, unknown> }).parametres;
      if (
        p?.["type"] === "decaler_depart" &&
        typeof p["ligneId"] === "string" &&
        typeof p["heure"] === "string" &&
        typeof p["nouvelleHeure"] === "string" &&
        !(p["ligneId"] in decalages)
      ) {
        // La plus récente fait foi (tri par proposition décroissante).
        decalages[p["ligneId"]] = `${p["heure"]} → ${p["nouvelleHeure"]}`;
      }
    }
    return decalages;
  }

  async colisEnCorrespondance(
    compagnieId: string,
  ): Promise<{ nombre: number; depuis: Date | null }> {
    if (!UUID.test(compagnieId)) return { nombre: 0, depuis: null };
    const plans = await this.prisma.planColisInterAgences.findMany({
      where: { compagnieIds: { has: compagnieId } },
      select: { transferts: true },
    });
    let nombre = 0;
    let depuis: number | null = null;
    for (const plan of plans) {
      const transferts = (Array.isArray(plan.transferts) ? plan.transferts : []) as Array<{
        preneurId?: string;
        remis?: { a?: string } | null;
        recu?: unknown;
      }>;
      // Remis par la compagnie précédente, pas encore reçu par celle-ci.
      const attente = transferts.find((t) => t.preneurId === compagnieId && t.remis && !t.recu);
      if (!attente?.remis?.a) continue;
      nombre += 1;
      const a = Date.parse(attente.remis.a);
      if (!Number.isNaN(a)) depuis = depuis === null ? a : Math.min(depuis, a);
    }
    return { nombre, depuis: depuis === null ? null : new Date(depuis) };
  }

  async colisAuRelais(gareId: string): Promise<number> {
    if (!UUID.test(gareId)) return 0;
    return this.prisma.colis.count({ where: { gareDestinationId: gareId, etat: "en_relais" } });
  }

  async journalDeGare(gareId: string, depuis: Date, limite: number): Promise<EvenementJournal[]> {
    if (!UUID.test(gareId)) return [];
    const lignes = await this.prisma.journalAgence.findMany({
      where: { gareId, at: { gte: depuis } },
      orderBy: [{ at: "desc" }, { seq: "desc" }],
      take: limite,
      select: { at: true, resume: true, cibleId: true },
    });
    return lignes.map((l) => ({ at: l.at, resume: l.resume, cibleId: l.cibleId }));
  }

  async dossiersFinancementEnAttente(compagnieId: string): Promise<DossierEnAttente[]> {
    if (!UUID.test(compagnieId)) return [];
    const lignes = await this.prisma.dossierFinancement.findMany({
      where: { agenceId: compagnieId, statut: { in: ["envoye", "en_analyse"] } },
      orderBy: [{ envoyeA: "desc" }, { id: "asc" }],
      select: { id: true, montant: true, statut: true, envoyeA: true },
    });
    return lignes.map((l) => ({
      id: l.id,
      montant: l.montant,
      statut: l.statut as DossierEnAttente["statut"],
      envoyeA: l.envoyeA,
    }));
  }
}

@Injectable()
export class AlertesEcritesPrisma extends AlertesEcrites {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async depuis(compagnieId: string, depuis: Date): Promise<AlerteEcrite[]> {
    if (!UUID.test(compagnieId)) return [];
    const lignes = await this.prisma.alertePatron.findMany({
      where: { compagnieId, creeA: { gte: depuis } },
      orderBy: [{ creeA: "desc" }, { id: "desc" }],
    });
    return lignes.map((l) => ({
      id: l.id,
      type: l.type,
      gareId: l.gareId,
      message: l.message,
      details: (l.details ?? {}) as Record<string, unknown>,
      creeA: l.creeA,
    }));
  }
}

/* ------------------------------------------------------------------ équipe */

type LignePersonne = Prisma.PersonneGetPayload<{ include: { gare: true; guichet: true } }>;

@Injectable()
export class EquipePatronPrisma extends EquipePatron {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async lister(compagnieId: string, maintenant: Date): Promise<MembrePatron[]> {
    if (!UUID.test(compagnieId)) return [];
    const lignes = await this.prisma.personne.findMany({
      where: { compagnieId, actif: true, roles: { hasSome: ROLES_PG } },
      include: { gare: true, guichet: true },
      orderBy: [{ creeA: "asc" }, { id: "asc" }],
    });
    return this.enrichir(lignes, maintenant);
  }

  async trouver(
    compagnieId: string,
    personneId: string,
    maintenant: Date,
  ): Promise<MembrePatron | null> {
    if (!UUID.test(compagnieId) || !UUID.test(personneId)) return null;
    const l = await this.prisma.personne.findFirst({
      where: { id: personneId, compagnieId },
      include: { gare: true, guichet: true },
    });
    // Le patron, un voyageur ou un livreur ne sont pas de l'équipe : ils n'ont pas de fiche ici.
    if (!l || roleDe(l.roles) === null) return null;
    return (await this.enrichir([l], maintenant))[0] ?? null;
  }

  /** Les états du jour de tout un groupe de personnes, en quelques requêtes (jamais une par personne). */
  private async enrichir(lignes: LignePersonne[], maintenant: Date): Promise<MembrePatron[]> {
    if (lignes.length === 0) return [];
    const ids = lignes.map((l) => l.id);
    const debutJour = new Date(debutJourDoualaMs(maintenant));
    const finJour = new Date(debutJour.getTime() + MS_PAR_JOUR);
    const depuis90 = new Date(maintenant.getTime() - SYNC_RECENTE_JOURS * MS_PAR_JOUR);

    const [reglages, billets, departs, sessions] = await Promise.all([
      this.prisma.personneReglage.findMany({ where: { personneId: { in: ids } } }),
      this.prisma.billet.groupBy({
        by: ["auteurId"],
        where: { auteurId: { in: ids }, creeA: { gte: depuis90 }, etat: { in: [...ETATS_VENDUS] } },
        _count: { _all: true },
      }),
      this.prisma.depart.findMany({
        where: {
          heureDepart: { gte: debutJour, lt: finJour },
          etat: { notIn: ["annule", "arrive", "fusionne"] },
          OR: [{ chauffeurId: { in: ids } }, { convoyeurId: { in: ids } }],
        },
        include: { bus: true },
        orderBy: { heureDepart: "asc" },
      }),
      this.prisma.sessionCaisse.findMany({
        where: { agentId: { in: ids }, etat: "ouverte" },
        select: { agentId: true, ouverteA: true },
      }),
    ]);
    const reglageDe = new Map(reglages.map((r) => [r.personneId, r]));
    const billetsDe = new Map(billets.map((b) => [b.auteurId ?? "", b._count._all]));

    return lignes.map((l) => {
      const role = roleDe(l.roles) ?? ("guichetier" as RoleEquipe);
      const reglage = reglageDe.get(l.id);
      let situation: MembrePatron["situation"] = "repos";
      let enServiceDepuis: Date | null = null;
      let bus: string | null = null;
      if (role === "chauffeur" || role === "convoyeur") {
        const depart = departs.find((d) =>
          role === "chauffeur" ? d.chauffeurId === l.id : d.convoyeurId === l.id,
        );
        if (depart) {
          bus = depart.bus?.immatriculation ?? null;
          situation = depart.etat === "parti" ? "en_route" : "a_bord";
          enServiceDepuis = depart.heureDepart;
        }
      } else if (role === "guichetier") {
        const ouverte = sessions.find((s) => s.agentId === l.id);
        if (ouverte) {
          situation = "en_service";
          enServiceDepuis = ouverte.ouverteA;
        }
      } else if (l.derniereConnexionA !== null && l.derniereConnexionA >= debutJour) {
        situation = "en_service";
        enServiceDepuis = l.derniereConnexionA;
      }
      return {
        id: l.id,
        nom: l.nom,
        role,
        gareId: l.gareId,
        gareNom: l.gare?.nom ?? null,
        guichetId: l.guichetId,
        guichetRang: l.guichet?.rang ?? null,
        bus,
        situation,
        enServiceDepuis,
        actif: l.actif,
        bloqueJusqua: l.bloqueJusqua,
        pinProvisoireJusqua: l.pinProvisoireJusqua,
        creeA: l.creeA,
        telephoneChiffre: l.telephoneChiffre,
        operateur: (reglage?.operateur as OperateurPersonne | undefined) ?? "MTN",
        salaire: reglage?.salaire ?? 0,
        jourDePaie: reglage?.jourDePaie ?? 30,
        droits: (reglage?.droits as Droits | undefined) ?? droitsParDefaut(role),
        billets90: billetsDe.get(l.id) ?? 0,
      };
    });
  }

  async activite(personneId: string, depuis: Date): Promise<ActivitePersonne> {
    if (!UUID.test(personneId)) return { billets: 0, colis: 0, litiges: 0, annulations: 0 };
    const marque = JSON.stringify([{ par: personneId }]);
    const [billets, annulations, colis, litiges] = await Promise.all([
      this.prisma.billet.count({
        where: { auteurId: personneId, creeA: { gte: depuis }, etat: { in: [...ETATS_VENDUS] } },
      }),
      this.prisma.demandeAnnulation.count({
        where: { demandeurId: personneId, demandeA: { gte: depuis } },
      }),
      // Un colis est « à la personne » quand elle figure dans son historique (prise en charge, remise).
      this.prisma.$queryRaw<{ n: number }[]>`
        SELECT count(*)::int AS n FROM "colis" c
        WHERE c."creeA" >= ${depuis} AND c."historique" @> ${marque}::jsonb`,
      this.prisma.$queryRaw<{ n: number }[]>`
        SELECT count(*)::int AS n FROM "reclamation_colis" r
        JOIN "colis" c ON c."id" = r."colisId"
        WHERE r."ouverteA" >= ${depuis} AND c."historique" @> ${marque}::jsonb`,
    ]);
    return {
      billets,
      annulations,
      colis: colis[0]?.n ?? 0,
      litiges: litiges[0]?.n ?? 0,
    };
  }

  async guichetDeGare(gareId: string, rang: number): Promise<string | null> {
    if (!UUID.test(gareId)) return null;
    const g = await this.prisma.guichet.findUnique({
      where: { gareId_rang: { gareId, rang } },
      select: { id: true },
    });
    return g?.id ?? null;
  }

  async creer(m: NouveauMembre): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.personne.create({
          data: {
            id: m.id,
            nom: m.nom,
            telephoneChiffre: m.telephoneChiffre,
            telephoneIndex: m.telephoneIndex,
            roles: [m.role as Role],
            compagnieId: m.compagnieId,
            gareId: m.gareId,
            guichetId: m.guichetId,
            actif: true,
            pinHache: m.pinHache,
            motDePasseHache: m.motDePasseHache,
            pinProvisoireJusqua: m.pinProvisoireJusqua,
          },
        });
        await tx.personneReglage.create({
          data: {
            personneId: m.id,
            operateur: m.operateur,
            salaire: m.salaire,
            jourDePaie: m.jourDePaie,
            droits: enJson(m.droits),
            modifieA: new Date(),
          },
        });
      });
    } catch (e) {
      if ((e as { code?: string }).code === "P2002" || estErreurSql(e, "23505")) {
        throw new TelephoneDejaUtilise();
      }
      throw e;
    }
  }

  async modifier(personneId: string, ch: ChangementMembre): Promise<void> {
    if (!UUID.test(personneId)) return;
    try {
      await this.prisma.$transaction(async (tx) => {
        const actuelle = await tx.personne.findUnique({
          where: { id: personneId },
          select: { roles: true },
        });
        if (!actuelle) return;
        const data: Prisma.PersonneUncheckedUpdateInput = {};
        if (ch.nom !== undefined) data.nom = ch.nom;
        if (ch.telephoneChiffre !== undefined) data.telephoneChiffre = ch.telephoneChiffre;
        if (ch.telephoneIndex !== undefined) data.telephoneIndex = ch.telephoneIndex;
        if (ch.gareId !== undefined) data.gareId = ch.gareId;
        if (ch.guichetId !== undefined) data.guichetId = ch.guichetId;
        if (ch.role !== undefined) {
          // Le rôle d'équipe est remplacé ; les autres rôles du compte sont conservés.
          data.roles = [
            ...actuelle.roles.filter((r) => !(ROLES_EQUIPE as readonly string[]).includes(r)),
            ch.role as Role,
          ];
        }
        if (Object.keys(data).length > 0)
          await tx.personne.update({ where: { id: personneId }, data });
        if (ch.operateur !== undefined || ch.salaire !== undefined || ch.droits !== undefined) {
          const role = ch.role ?? roleDe(actuelle.roles) ?? "guichetier";
          await tx.personneReglage.upsert({
            where: { personneId },
            create: {
              personneId,
              operateur: ch.operateur ?? "MTN",
              salaire: ch.salaire ?? 0,
              droits: enJson(ch.droits ?? droitsParDefaut(role)),
              modifieA: new Date(),
            },
            update: {
              ...(ch.operateur !== undefined ? { operateur: ch.operateur } : {}),
              ...(ch.salaire !== undefined ? { salaire: ch.salaire } : {}),
              ...(ch.droits !== undefined ? { droits: enJson(ch.droits) } : {}),
              modifieA: new Date(),
            },
          });
        }
      });
    } catch (e) {
      if ((e as { code?: string }).code === "P2002" || estErreurSql(e, "23505")) {
        throw new TelephoneDejaUtilise();
      }
      throw e;
    }
  }

  async desactiver(personneId: string): Promise<void> {
    if (!UUID.test(personneId)) return;
    await this.prisma.personne.updateMany({ where: { id: personneId }, data: { actif: false } });
  }
}

/* ------------------------------------------------------------------ règles et comptes mobile money */

@Injectable()
export class ReglesPatronPrisma extends ReglesPatron {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async lire(compagnieId: string): Promise<ReglesLues | null> {
    if (!UUID.test(compagnieId)) return null;
    const [r, compagnie] = await Promise.all([
      this.prisma.reglesCompagnie.findUnique({ where: { compagnieId } }),
      this.prisma.compagnie.findUnique({
        where: { id: compagnieId },
        select: { toleranceEcartCaisse: true },
      }),
    ]);
    if (!r) return null;
    return {
      annulation: {
        gratuiteJusqua: r.gratuiteJusqua as ReglesLues["annulation"]["gratuiteJusqua"],
        retenue: r.retenue as ReglesLues["annulation"]["retenue"],
        retenueParClassePct: { classique: r.retenueClassiquePct, vip: r.retenueVipPct },
      },
      caisse: {
        toleranceEcart: compagnie?.toleranceEcartCaisse ?? null,
        auDela: r.auDela as ReglesLues["caisse"]["auDela"],
      },
      cadence: { numeroObligatoire: r.numeroObligatoire },
      fraisService: {
        montant: r.fraisServiceMontant,
        priseEnChargeParAgence: r.fraisServicePrisEnCharge,
      },
    };
  }

  async ecrire(
    compagnieId: string,
    regles: c.ReglesModifiables,
    par: string,
    a: Date,
  ): Promise<void> {
    const donnees = {
      gratuiteJusqua: regles.annulation.gratuiteJusqua,
      retenue: regles.annulation.retenue,
      retenueClassiquePct: regles.annulation.retenueParClassePct.classique,
      retenueVipPct: regles.annulation.retenueParClassePct.vip,
      auDela: regles.caisse.auDela,
      numeroObligatoire: regles.cadence.numeroObligatoire,
      fraisServiceMontant: regles.fraisService.montant,
      fraisServicePrisEnCharge: regles.fraisService.priseEnChargeParAgence,
      modifieA: a,
      modifiePar: UUID.test(par) ? par : null,
    };
    await this.prisma.$transaction(async (tx) => {
      await tx.reglesCompagnie.upsert({
        where: { compagnieId },
        create: { compagnieId, ...donnees },
        update: donnees,
      });
      // La caisse lit déjà cette colonne : la tolérance réglée ici s'applique aux prochaines clôtures.
      await tx.compagnie.update({
        where: { id: compagnieId },
        data: { toleranceEcartCaisse: regles.caisse.toleranceEcart },
      });
    });
  }

  async comptes(compagnieId: string): Promise<Record<OperateurMomo, string | null>> {
    const sortie: Record<OperateurMomo, string | null> = { mtn: null, orange: null };
    if (!UUID.test(compagnieId)) return sortie;
    const lignes = await this.prisma.compteMomoAgence.findMany({ where: { compagnieId } });
    for (const l of lignes) {
      if (l.operateur === "mtn" || l.operateur === "orange")
        sortie[l.operateur] = l.telephoneChiffre;
    }
    return sortie;
  }

  async demanderConfirmation(
    compagnieId: string,
    operateur: OperateurMomo,
    confirmation: Omit<ConfirmationMomo, "essais">,
  ): Promise<void> {
    await this.prisma.confirmationCompteMomo.upsert({
      where: { compagnieId_operateur: { compagnieId, operateur } },
      create: { compagnieId, operateur, ...confirmation, essais: 0 },
      update: { ...confirmation, essais: 0 },
    });
  }

  async confirmation(
    compagnieId: string,
    operateur: OperateurMomo,
  ): Promise<ConfirmationMomo | null> {
    if (!UUID.test(compagnieId)) return null;
    const l = await this.prisma.confirmationCompteMomo.findUnique({
      where: { compagnieId_operateur: { compagnieId, operateur } },
    });
    return l
      ? { empreinte: l.empreinte, creeA: l.creeA, expireA: l.expireA, essais: l.essais }
      : null;
  }

  async compterEssai(compagnieId: string, operateur: OperateurMomo): Promise<number> {
    if (!UUID.test(compagnieId)) return 0;
    // Un seul UPDATE : deux essais simultanés comptent chacun, et le CHECK borne le total à 3.
    const lignes = await this.prisma.$queryRaw<{ essais: number }[]>`
      UPDATE "confirmation_compte_momo" SET "essais" = LEAST("essais" + 1, 3)
      WHERE "compagnieId" = ${compagnieId}::uuid AND "operateur" = ${operateur}
      RETURNING "essais"`;
    return lignes[0]?.essais ?? 0;
  }

  async changerCompte(
    compagnieId: string,
    operateur: OperateurMomo,
    nouveauChiffre: string,
    ancienJusqua: Date,
    par: string,
    a: Date,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${VERROU_PATRON}::int, hashtext(${`momo:${compagnieId}:${operateur}`}))`;
      const actuel = await tx.compteMomoAgence.findUnique({
        where: { compagnieId_operateur: { compagnieId, operateur } },
      });
      const ancien = actuel?.telephoneChiffre ?? null;
      const donnees = {
        telephoneChiffre: nouveauChiffre,
        ancienChiffre: ancien,
        ancienJusqua: ancien === null ? null : ancienJusqua,
        modifieA: a,
        modifiePar: par,
      };
      await tx.compteMomoAgence.upsert({
        where: { compagnieId_operateur: { compagnieId, operateur } },
        create: { compagnieId, operateur, ...donnees },
        update: donnees,
      });
      await tx.confirmationCompteMomo.deleteMany({ where: { compagnieId, operateur } });
    });
  }
}
