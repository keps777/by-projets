import { Injectable } from "@nestjs/common";
import { Prisma } from "../socle/db/generated/client";
import { PrismaService } from "../socle/db/prisma.service";
import { Horloge } from "../socle/horloge";
import {
  AlertesPatron,
  GuichetsAgence,
  MouvementsCaisse,
  ReglesAgence,
  SessionsCaisse,
  type AlertePatron,
  type ClotureStockee,
  type Decompte,
  type EtatSession,
  type GuichetAgence,
  type LigneDecompte,
  type RefusCreation,
  type RefusStocke,
  type SessionStockee,
  type ValidationStockee,
} from "./ports";
import { TOLERANCE_ECART_DEFAUT } from "./regles";
import { date, UUID } from "./sql";
import { versIsoDouala } from "./temps";

/**
 * Adaptateurs PostgreSQL (Prisma) des ports de la caisse (AM-164). Tables : `session_caisse`,
 * `annulation_caisse`, `alerte_patron`, et en lecture `guichet`, `gare`, `compagnie`, `billet` et
 * `colis`.
 *
 * Ce que la base garantit, sans compter sur le code :
 * - **une caisse ouverte par agent et par guichet** : index uniques partiels sur `session_caisse`
 *   (`etat = 'ouverte'`). `creer` est un `INSERT … ON CONFLICT DO NOTHING` : deux ouvertures qui se
 *   croisent, ou le rejeu d'un événement, ne produisent jamais deux caisses ouvertes ;
 * - **une transition d'état n'a lieu qu'une fois** : `transiter` est un
 *   `UPDATE … WHERE id = $1 AND etat = $depuis` d'un seul tenant (compare-et-échange) ;
 * - **la clôture et la validation ne se contredisent pas** : le JSON (`cloture`, `validation`) fait
 *   foi, les colonnes `clotureeA`, `cashCompte`, `cashAttendu`, `ecart`, `clotureeAuto`, `valideeA` et
 *   `valideeParId` en sont la copie interrogeable, écrite dans la même instruction. Les CHECK
 *   `session_cloture_copie` et `session_validation_copie` refusent toute divergence, et
 *   `session_etat_cloture` / `session_etat_validation` lient l'état à la présence du JSON ;
 * - **une annulation n'est retranchée qu'une fois** : `annulation_caisse` a pour clé primaire la
 *   demande, et est en ajout seul.
 */

type LigneSession = Prisma.SessionCaisseGetPayload<object>;

function versSession(l: LigneSession): SessionStockee {
  return {
    id: l.id,
    numero: l.numero,
    guichetId: l.guichetId,
    guichetRang: l.guichetRang,
    gareId: l.gareId,
    compagnieId: l.compagnieId,
    agentId: l.agentId,
    fondDeCaisse: l.fondDeCaisse,
    tolerance: l.tolerance,
    ouverteA: versIsoDouala(l.ouverteA),
    reouverteA: l.reouverteA ? versIsoDouala(l.reouverteA) : null,
    etat: l.etat,
    comptage: l.comptage as SessionStockee["comptage"],
    cloture: l.cloture as unknown as ClotureStockee | null,
    validation: l.validation as unknown as ValidationStockee | null,
    refus: l.refus as unknown as RefusStocke[],
    evenementOuvertureId: l.evenementOuvertureId ?? "",
  };
}

const json = (v: unknown): Prisma.InputJsonValue => v as Prisma.InputJsonValue;

/**
 * Les colonnes à écrire pour un changement. Le JSON de clôture et de validation fait foi ; leurs copies
 * interrogeables sont dérivées ici, jamais fournies par l'appelant.
 */
function colonnes(
  c: Partial<Omit<SessionStockee, "id">>,
): Prisma.SessionCaisseUncheckedUpdateManyInput {
  const d: Prisma.SessionCaisseUncheckedUpdateManyInput = {};
  if (c.numero !== undefined) d.numero = c.numero;
  if (c.guichetId !== undefined) d.guichetId = c.guichetId;
  if (c.guichetRang !== undefined) d.guichetRang = c.guichetRang;
  if (c.gareId !== undefined) d.gareId = c.gareId;
  if (c.compagnieId !== undefined && c.compagnieId !== null) d.compagnieId = c.compagnieId;
  if (c.agentId !== undefined) d.agentId = c.agentId;
  if (c.fondDeCaisse !== undefined) d.fondDeCaisse = c.fondDeCaisse;
  if (c.tolerance !== undefined) d.tolerance = c.tolerance;
  if (c.ouverteA !== undefined) d.ouverteA = new Date(c.ouverteA);
  if (c.reouverteA !== undefined) d.reouverteA = date(c.reouverteA);
  if (c.etat !== undefined) d.etat = c.etat;
  if (c.comptage !== undefined) d.comptage = c.comptage === null ? Prisma.DbNull : json(c.comptage);
  if (c.refus !== undefined) d.refus = json(c.refus);
  if (c.evenementOuvertureId !== undefined) {
    d.evenementOuvertureId = c.evenementOuvertureId === "" ? null : c.evenementOuvertureId;
  }
  if (c.cloture !== undefined) {
    const k = c.cloture;
    d.cloture = k === null ? Prisma.DbNull : json(k);
    d.clotureeA = k === null ? null : new Date(k.at);
    d.cashCompte = k === null ? null : k.cashCompte;
    d.cashAttendu = k === null ? null : k.cashAttendu;
    d.ecart = k === null ? null : k.ecart;
    d.clotureeAuto = k === null ? null : k.auto;
  }
  if (c.validation !== undefined) {
    const v = c.validation;
    d.validation = v === null ? Prisma.DbNull : json(v);
    d.valideeA = v === null ? null : new Date(v.at);
    d.valideeParId = v === null ? null : v.superviseurId;
  }
  return d;
}

@Injectable()
export class SessionsCaissePrisma extends SessionsCaisse {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async creer(session: SessionStockee): Promise<"ok" | RefusCreation> {
    // Les colonnes sont des UUID : un identifiant d'une autre forme ne peut pas être rangé.
    if (
      ![session.id, session.guichetId, session.agentId, session.gareId].every((x) =>
        UUID.test(x),
      ) ||
      (session.evenementOuvertureId !== "" && !UUID.test(session.evenementOuvertureId))
    ) {
      return "identifiant_invalide";
    }
    let compagnieId = session.compagnieId;
    if (compagnieId === null) {
      // La base exige la compagnie : celle de la gare de la session.
      const gare = await this.prisma.gare.findUnique({
        where: { id: session.gareId },
        select: { compagnieId: true },
      });
      compagnieId = gare?.compagnieId ?? null;
    }
    const donnees = {
      id: session.id,
      ...colonnes({ ...session, compagnieId }),
      etat: session.etat,
    } as Prisma.SessionCaisseCreateManyInput;

    for (let tentative = 0; tentative < 3; tentative++) {
      // INSERT … ON CONFLICT DO NOTHING : la clé primaire et les index uniques (numéro, une caisse
      // ouverte par agent, une par guichet, événement d'ouverture) départagent deux ouvertures
      // simultanées sans verrou.
      const { count } = await this.prisma.sessionCaisse.createMany({
        data: [donnees],
        skipDuplicates: true,
      });
      if (count === 1) return "ok";
      const refus = await this.pourquoiRefusee(session);
      if (refus !== null) return refus;
      // Ce qui bloquait vient de disparaître (une caisse s'est fermée entre-temps) : on réessaie.
    }
    return "agent_occupe";
  }

  private async pourquoiRefusee(s: SessionStockee): Promise<RefusCreation | null> {
    if (await this.prisma.sessionCaisse.findUnique({ where: { id: s.id }, select: { id: true } })) {
      return "identifiant_pris";
    }
    if (
      await this.prisma.sessionCaisse.findUnique({
        where: { numero: s.numero },
        select: { id: true },
      })
    ) {
      return "numero_pris";
    }
    if (
      await this.prisma.sessionCaisse.findFirst({
        where: { agentId: s.agentId, etat: "ouverte" },
        select: { id: true },
      })
    ) {
      return "agent_occupe";
    }
    if (
      await this.prisma.sessionCaisse.findFirst({
        where: { guichetId: s.guichetId, etat: "ouverte" },
        select: { id: true },
      })
    ) {
      return "guichet_occupe";
    }
    if (
      s.evenementOuvertureId !== "" &&
      (await this.prisma.sessionCaisse.findUnique({
        where: { evenementOuvertureId: s.evenementOuvertureId },
        select: { id: true },
      }))
    ) {
      return "identifiant_pris";
    }
    return null;
  }

  async trouver(id: string): Promise<SessionStockee | null> {
    if (!UUID.test(id)) return null;
    const l = await this.prisma.sessionCaisse.findUnique({ where: { id } });
    return l ? versSession(l) : null;
  }

  async transiter(
    id: string,
    depuis: EtatSession,
    changement: Partial<Omit<SessionStockee, "id">>,
  ): Promise<SessionStockee | null> {
    if (!UUID.test(id)) return null;
    // Compare-et-échange : la ligne n'est modifiée que si elle est encore dans l'état `depuis`.
    const { count } = await this.prisma.sessionCaisse.updateMany({
      where: { id, etat: depuis },
      data: colonnes(changement),
    });
    if (count !== 1) return null;
    return this.trouver(id);
  }

  async ouverteDeAgent(agentId: string): Promise<SessionStockee | null> {
    if (!UUID.test(agentId)) return null;
    const l = await this.prisma.sessionCaisse.findFirst({ where: { agentId, etat: "ouverte" } });
    return l ? versSession(l) : null;
  }

  async deAgent(agentId: string, depuisIso?: string): Promise<SessionStockee[]> {
    if (!UUID.test(agentId)) return [];
    const lignes = await this.prisma.sessionCaisse.findMany({
      where: {
        agentId,
        ...(depuisIso !== undefined ? { ouverteA: { gte: new Date(depuisIso) } } : {}),
      },
      orderBy: [{ ouverteA: "desc" }, { numero: "desc" }],
    });
    return lignes.map(versSession);
  }

  async deGare(gareId: string, depuisIso: string): Promise<SessionStockee[]> {
    if (!UUID.test(gareId)) return [];
    const lignes = await this.prisma.sessionCaisse.findMany({
      where: {
        gareId,
        OR: [{ etat: "cloturee" }, { ouverteA: { gte: new Date(depuisIso) } }],
      },
      orderBy: [{ ouverteA: "asc" }, { numero: "asc" }],
    });
    return lignes.map(versSession);
  }

  async ouvertes(): Promise<SessionStockee[]> {
    const lignes = await this.prisma.sessionCaisse.findMany({
      where: { etat: "ouverte" },
      orderBy: [{ ouverteA: "asc" }, { numero: "asc" }],
    });
    return lignes.map(versSession);
  }
}

/* ------------------------------------------------------------------ mouvements */

interface LigneAgregat {
  nombre: number;
  montant: number;
}

const ligne = (a: LigneAgregat | undefined): LigneDecompte => ({
  nombre: a?.nombre ?? 0,
  montant: a?.montant ?? 0,
});

/**
 * Le décompte d'une session est calculé à la lecture, depuis les ventes elles-mêmes (`billet`, `colis`)
 * et les annulations retranchées (`annulation_caisse`) : il n'y a pas de second compteur à garder
 * d'accord avec les ventes.
 *
 * - **Billets** : ceux que l'agent a vendus à ce guichet (`canal = 'guichet'`, `auteurId`,
 *   `guichetId`) entre l'ouverture de la session et `jusqua`, selon le mode de paiement. Le montant
 *   encaissé est le prix du billet plus le supplément bagage. Un billet annulé plus tard reste compté :
 *   le remboursement en cash est retranché à part (`annulationsValidees`).
 * - **Colis** : ceux que l'agent a enregistrés au guichet (`canal = 'agence'`, `deposePar`) payés en cash.
 *   La table `colis` ne garde pas le guichet : une caisse ouverte par agent, l'agent suffit.
 */
@Injectable()
export class MouvementsCaissePrisma extends MouvementsCaisse {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async decompte(
    session: Pick<SessionStockee, "id" | "agentId" | "guichetId" | "ouverteA">,
    jusqua: string,
  ): Promise<Decompte> {
    const debut = new Date(session.ouverteA);
    const fin = new Date(jusqua);
    if (!UUID.test(session.agentId) || !UUID.test(session.guichetId)) {
      return {
        billetsCash: ligne(undefined),
        colisCash: ligne(undefined),
        annulationsValidees: ligne(undefined),
        momo: { ventes: 0, montant: 0 },
      };
    }

    const billets = await this.prisma.$queryRaw<(LigneAgregat & { mode: string })[]>`
      SELECT "paiement" ->> 'mode' AS mode,
             count(*)::int AS nombre,
             COALESCE(sum("prix" + "bagage"), 0)::int AS montant
      FROM "billet"
      WHERE "canal" = 'guichet'
        AND "auteurId" = ${session.agentId}::uuid
        AND "guichetId" = ${session.guichetId}::uuid
        AND "creeA" >= ${debut} AND "creeA" <= ${fin}
        AND "paiement" IS NOT NULL
      GROUP BY 1`;
    const colis = await this.prisma.$queryRaw<LigneAgregat[]>`
      SELECT count(*)::int AS nombre, COALESCE(sum(COALESCE("paiementMontant", "prixTotal")), 0)::int AS montant
      FROM "colis"
      WHERE "canal" = 'agence'
        AND "paiementMoyen" = 'cash'
        AND "deposePar" = ${session.agentId}
        AND "creeA" >= ${debut} AND "creeA" <= ${fin}`;
    const annulations = await this.prisma.$queryRaw<LigneAgregat[]>`
      SELECT count(*)::int AS nombre, COALESCE(sum("montant"), 0)::int AS montant
      FROM "annulation_caisse"
      WHERE "sessionId" = ${session.id}::uuid AND "at" <= ${fin}`;

    const parMode = (...modes: string[]): LigneAgregat => {
      const lignes = billets.filter((b) => modes.includes(b.mode));
      return {
        nombre: lignes.reduce((t, b) => t + b.nombre, 0),
        montant: lignes.reduce((t, b) => t + b.montant, 0),
      };
    };
    const momo = parMode("momo", "orange_money");
    return {
      billetsCash: ligne(parMode("cash")),
      colisCash: ligne(colis[0]),
      annulationsValidees: ligne(annulations[0]),
      momo: { ventes: momo.nombre, montant: momo.montant },
    };
  }

  async enregistrerAnnulation(a: {
    demandeId: string;
    sessionId: string;
    montant: number;
    at: string;
  }): Promise<void> {
    // La clé primaire est la demande : rejouer l'annulation ne retranche rien de plus.
    await this.prisma.annulationCaisse.createMany({
      data: [
        { demandeId: a.demandeId, sessionId: a.sessionId, montant: a.montant, at: new Date(a.at) },
      ],
      skipDuplicates: true,
    });
  }
}

/* ------------------------------------------------------------------ guichets, règles, alertes */

@Injectable()
export class GuichetsAgencePrisma extends GuichetsAgence {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async trouver(guichetId: string): Promise<GuichetAgence | null> {
    if (!UUID.test(guichetId)) return null;
    const g = await this.prisma.guichet.findUnique({
      where: { id: guichetId },
      include: { gare: true },
    });
    return g
      ? {
          id: g.id,
          rang: g.rang,
          gareId: g.gareId,
          gareCode: g.gare.code,
          compagnieId: g.gare.compagnieId,
        }
      : null;
  }
}

/** La tolérance d'écart est réglée par compagnie (`compagnie.toleranceEcartCaisse`), 1 000 F sinon. */
@Injectable()
export class ReglesAgencePrisma extends ReglesAgence {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async tolerance(compagnieId: string | null): Promise<number> {
    if (compagnieId === null || !UUID.test(compagnieId)) return TOLERANCE_ECART_DEFAUT;
    const c = await this.prisma.compagnie.findUnique({
      where: { id: compagnieId },
      select: { toleranceEcartCaisse: true },
    });
    return c?.toleranceEcartCaisse ?? TOLERANCE_ECART_DEFAUT;
  }

  /** Pour l'écran « Règles » du patron. */
  async definirTolerance(compagnieId: string, montant: number): Promise<void> {
    await this.prisma.compagnie.update({
      where: { id: compagnieId },
      data: { toleranceEcartCaisse: montant },
    });
  }
}

@Injectable()
export class AlertesPatronPrisma extends AlertesPatron {
  readonly durable = true;

  constructor(
    private readonly prisma: PrismaService,
    private readonly horloge: Horloge,
  ) {
    super();
  }

  async alerter(alerte: AlertePatron): Promise<void> {
    await this.prisma.alertePatron.create({
      data: {
        type: alerte.type,
        compagnieId: alerte.compagnieId,
        gareId: alerte.gareId,
        message: alerte.message,
        details: json(alerte.details),
        creeA: this.horloge.maintenant(),
      },
    });
  }

  /** Les alertes d'une compagnie, de la plus ancienne à la plus récente (centre d'alertes du patron). */
  async lister(compagnieId: string): Promise<AlertePatron[]> {
    const lignes = await this.prisma.alertePatron.findMany({
      where: { compagnieId },
      orderBy: [{ creeA: "asc" }, { id: "asc" }],
    });
    return lignes.map((l) => ({
      type: l.type as AlertePatron["type"],
      compagnieId: l.compagnieId,
      gareId: l.gareId,
      message: l.message,
      details: l.details as Record<string, unknown>,
    }));
  }
}
