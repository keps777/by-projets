import { Injectable } from "@nestjs/common";
import type { ActionProposee } from "../analyses/modele";
import { versIsoDouala } from "../rapport/temps";
import { Prisma } from "../socle/db/generated/client";
import { PrismaService } from "../socle/db/prisma.service";
import type {
  ContexteConversation,
  EchangeStocke,
  Intention,
  PropositionStockee,
  Redaction,
  ReponseVue,
} from "./modele";
import { ConversationsAssistant, PropositionsAssistant } from "./ports";

/**
 * Adaptateurs PostgreSQL (Prisma) des deux ports d'écriture de l'assistant (AM-109). Tables :
 * `assistant_echange` (ajout seul) et `assistant_proposition`.
 *
 * Ce que la base garantit, sans compter sur le code :
 * - **la mémoire d'un patron ne se réécrit pas** : `assistant_echange` refuse UPDATE, DELETE et TRUNCATE
 *   (déclencheurs) ; l'ordre de la conversation est le rang d'arrivée (`seq`), exact même à la milliseconde ;
 * - **une proposition ne s'applique qu'une fois** : `reserver` est un seul
 *   `UPDATE … WHERE appliqueePar IS NULL`. De deux clics simultanés, un seul change la ligne (le CHECK
 *   `assistant_proposition_application` garde « par » et « quand » ensemble) ;
 * - **une proposition appliquée et encore valable ne redevient pas applicable** : `proposer` est un
 *   `INSERT … ON CONFLICT DO UPDATE … WHERE appliqueePar IS NULL OR expireLe <= maintenant`.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (v: unknown): Prisma.InputJsonValue => v as Prisma.InputJsonValue;

function exigerUuid(nom: string, valeur: string): void {
  if (!UUID.test(valeur)) throw new Error(`${nom} : identifiant invalide (${valeur})`);
}

@Injectable()
export class ConversationsPrisma extends ConversationsAssistant {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async derniers(
    compagnieId: string,
    utilisateurId: string,
    limite: number,
  ): Promise<EchangeStocke[]> {
    if (!UUID.test(compagnieId) || !UUID.test(utilisateurId)) return [];
    const lignes = await this.prisma.assistantEchange.findMany({
      where: { compagnieId, utilisateurId },
      orderBy: { seq: "desc" },
      take: limite,
    });
    return lignes.reverse().map((l) => ({
      id: l.id,
      compagnieId: l.compagnieId,
      utilisateurId: l.utilisateurId,
      intention: l.intention as Intention,
      redaction: l.redaction as Redaction,
      reponse: l.reponse as unknown as ReponseVue,
      contexte: l.contexte as unknown as ContexteConversation,
      creeLe: versIsoDouala(l.creeLe),
    }));
  }

  async ajouter(e: EchangeStocke): Promise<void> {
    exigerUuid("échange", e.id);
    exigerUuid("compagnie", e.compagnieId);
    exigerUuid("utilisateur", e.utilisateurId);
    await this.prisma.assistantEchange.create({
      data: {
        id: e.id,
        compagnieId: e.compagnieId,
        utilisateurId: e.utilisateurId,
        intention: e.intention,
        redaction: e.redaction,
        reponse: json(e.reponse),
        contexte: json(e.contexte),
        creeLe: new Date(e.creeLe),
      },
    });
  }
}

type LigneProposition = Prisma.AssistantPropositionGetPayload<object>;

@Injectable()
export class PropositionsPrisma extends PropositionsAssistant {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async proposer(
    compagnieId: string,
    actions: readonly ActionProposee[],
    proposeeLe: Date,
    expireLe: Date,
  ): Promise<void> {
    exigerUuid("compagnie", compagnieId);
    if (actions.length === 0) return;
    await this.prisma.$transaction(async (tx) => {
      for (const action of actions) {
        // Une proposition appliquée et encore valable reste telle quelle (la clause WHERE du DO UPDATE).
        await tx.$executeRaw`
          INSERT INTO "assistant_proposition" ("compagnieId", "actionId", "action", "proposeeLe", "expireLe")
          VALUES (${compagnieId}::uuid, ${action.id}, ${JSON.stringify(action)}::jsonb, ${proposeeLe}, ${expireLe})
          ON CONFLICT ("compagnieId", "actionId") DO UPDATE
            SET "action" = EXCLUDED."action", "proposeeLe" = EXCLUDED."proposeeLe",
                "expireLe" = EXCLUDED."expireLe", "appliqueePar" = NULL, "appliqueeA" = NULL,
                "journalId" = NULL, "effetA" = NULL
            WHERE "assistant_proposition"."appliqueePar" IS NULL
               OR "assistant_proposition"."expireLe" <= ${proposeeLe}`;
      }
    });
  }

  private vers(l: LigneProposition): PropositionStockee {
    return {
      compagnieId: l.compagnieId,
      action: l.action as unknown as ActionProposee,
      proposeeLe: versIsoDouala(l.proposeeLe),
      expireLe: versIsoDouala(l.expireLe),
      application:
        l.appliqueePar === null || l.appliqueeA === null
          ? null
          : {
              par: l.appliqueePar,
              a: versIsoDouala(l.appliqueeA),
              journalId: l.journalId,
              effetA: l.effetA ? versIsoDouala(l.effetA) : null,
            },
    };
  }

  async trouver(compagnieId: string, actionId: string): Promise<PropositionStockee | null> {
    if (!UUID.test(compagnieId)) return null;
    const l = await this.prisma.assistantProposition.findUnique({
      where: { compagnieId_actionId: { compagnieId, actionId } },
    });
    return l ? this.vers(l) : null;
  }

  async reserver(compagnieId: string, actionId: string, par: string, a: Date): Promise<boolean> {
    exigerUuid("compagnie", compagnieId);
    exigerUuid("patron", par);
    const { count } = await this.prisma.assistantProposition.updateMany({
      where: { compagnieId, actionId, appliqueePar: null },
      data: { appliqueePar: par, appliqueeA: a },
    });
    return count === 1;
  }

  async confirmer(
    compagnieId: string,
    actionId: string,
    journalId: string,
    effetA: string,
  ): Promise<void> {
    exigerUuid("compagnie", compagnieId);
    exigerUuid("journal", journalId);
    await this.prisma.assistantProposition.updateMany({
      where: { compagnieId, actionId, appliqueePar: { not: null } },
      data: { journalId, effetA: new Date(effetA) },
    });
  }

  async liberer(compagnieId: string, actionId: string): Promise<void> {
    if (!UUID.test(compagnieId)) return;
    // Une application déjà confirmée (journal posé) ne se libère plus.
    await this.prisma.assistantProposition.updateMany({
      where: { compagnieId, actionId, journalId: null },
      data: { appliqueePar: null, appliqueeA: null, effetA: null },
    });
  }
}
