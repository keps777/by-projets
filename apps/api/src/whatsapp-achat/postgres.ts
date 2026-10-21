import { Injectable } from "@nestjs/common";
import type { Prisma } from "../socle/db/generated/client";
import { PrismaService } from "../socle/db/prisma.service";
import type { Langue } from "./langues";
import type {
  AchatWhatsApp,
  ConversationStockee,
  EntreeJournalAchat,
  EtapeAchat,
  EtatAchat,
  EvenementJournalAchat,
} from "./modeles";
import { AchatsWhatsApp, ConversationsAchat, JournalAchatWhatsApp } from "./ports";

/**
 * Adaptateurs PostgreSQL (Prisma) de l'achat par WhatsApp (AM-168) : `ConversationsAchat`,
 * `JournalAchatWhatsApp` et `AchatsWhatsApp`. Tables `whatsapp_achat_conversation`,
 * `whatsapp_achat_journal` et `whatsapp_achat` (migration « whatsapp_achat »).
 *
 * Les garanties tiennent dans la base, pas dans le code :
 * - **conversations partagées entre instances** : un message peut tomber sur n'importe quelle
 *   instance ; la conversation est une ligne, écrite par `INSERT … ON CONFLICT DO UPDATE`, qui
 *   expire à son échéance (`lire` ne rend jamais une conversation échue et la supprime) ;
 * - **un achat avance une fois** : `transitionner` est un `UPDATE … WHERE etat IN (…) RETURNING`
 *   (comparer et remplacer) ; deux instances qui tentent la même transition (le webhook de paiement
 *   et le balayage) ne la réussissent jamais toutes les deux ;
 * - **un achat ne se réécrit pas** : `ajouter` est un `INSERT … ON CONFLICT DO NOTHING`, il ne
 *   remet jamais un achat terminé à « réservé » ;
 * - **le journal est une trace** : un déclencheur interdit de modifier une entrée.
 *
 * La charge de la conversation et le destinataire de l'achat arrivent déjà chiffrés (contextes
 * `whatsapp-achat.conversation:<cle>` et `whatsapp-achat.achat:<commande>`) : la base ne voit jamais
 * un numéro en clair.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Vrai si l'erreur (ou sa cause) porte ce code (Prisma `P2025`). */
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

/* ------------------------------------------------------------------ conversations */

@Injectable()
export class ConversationsAchatPrisma extends ConversationsAchat {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async lire(cle: string, maintenant: Date): Promise<ConversationStockee | null> {
    const l = await this.prisma.whatsappAchatConversation.findUnique({ where: { cle } });
    if (!l) return null;
    if (l.expireA.getTime() <= maintenant.getTime()) {
      // Comme la mémoire : une conversation échue disparaît à la lecture (sans toucher à une
      // conversation réécrite entre-temps par une autre instance).
      await this.prisma.whatsappAchatConversation.deleteMany({
        where: { cle, expireA: { lte: maintenant } },
      });
      return null;
    }
    return { cle: l.cle, expireA: l.expireA, charge: l.charge };
  }

  async ecrire(conversation: ConversationStockee): Promise<void> {
    await this.prisma.whatsappAchatConversation.upsert({
      where: { cle: conversation.cle },
      create: {
        cle: conversation.cle,
        expireA: conversation.expireA,
        charge: conversation.charge,
      },
      update: { expireA: conversation.expireA, charge: conversation.charge },
    });
  }

  async supprimer(cle: string): Promise<void> {
    await this.prisma.whatsappAchatConversation.deleteMany({ where: { cle } });
  }

  async purger(maintenant: Date): Promise<number> {
    const { count } = await this.prisma.whatsappAchatConversation.deleteMany({
      where: { expireA: { lte: maintenant } },
    });
    return count;
  }
}

/* ------------------------------------------------------------------ journal */

@Injectable()
export class JournalAchatPrisma extends JournalAchatWhatsApp {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async enregistrer(entree: EntreeJournalAchat): Promise<void> {
    // Rejouer la même entrée (même identifiant) ne l'écrit pas deux fois.
    await this.prisma.whatsappAchatJournal.createMany({
      data: {
        id: entree.id,
        at: entree.at,
        numeroMasque: entree.numeroMasque,
        conversationRef: entree.conversationRef,
        evenement: entree.evenement,
        etape: entree.etape,
        langue: entree.langue,
        source: entree.source,
        code: entree.code,
        dureeMs: entree.dureeMs,
      },
      skipDuplicates: true,
    });
  }

  /** Les entrées d'une conversation, de la plus ancienne à la plus récente (enquête, tests). */
  async deLaConversation(conversationRef: string): Promise<EntreeJournalAchat[]> {
    const lignes = await this.prisma.whatsappAchatJournal.findMany({
      where: { conversationRef },
      orderBy: [{ at: "asc" }, { id: "asc" }],
    });
    return lignes.map((l) => ({
      id: l.id,
      at: l.at,
      numeroMasque: l.numeroMasque,
      conversationRef: l.conversationRef,
      evenement: l.evenement as EvenementJournalAchat,
      etape: l.etape as EtapeAchat | null,
      langue: l.langue as Langue | null,
      source: l.source as EntreeJournalAchat["source"],
      code: l.code,
      dureeMs: l.dureeMs,
    }));
  }
}

/* ------------------------------------------------------------------ achats */

type LigneAchat = Prisma.WhatsappAchatGetPayload<object>;

function versAchat(l: LigneAchat): AchatWhatsApp {
  return {
    commandeId: l.commandeId,
    voyageurId: l.voyageurId,
    etat: l.etat as EtatAchat,
    langue: l.langue as Langue,
    destinataireChiffre: l.destinataireChiffre,
    creeA: l.creeA,
  };
}

@Injectable()
export class AchatsWhatsAppPrisma extends AchatsWhatsApp {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async ajouter(achat: AchatWhatsApp): Promise<void> {
    await this.prisma.whatsappAchat.createMany({
      data: {
        commandeId: achat.commandeId,
        voyageurId: achat.voyageurId,
        etat: achat.etat,
        langue: achat.langue,
        destinataireChiffre: achat.destinataireChiffre,
        creeA: achat.creeA,
      },
      skipDuplicates: true,
    });
  }

  async trouver(commandeId: string): Promise<AchatWhatsApp | null> {
    if (!UUID.test(commandeId)) return null;
    const l = await this.prisma.whatsappAchat.findUnique({ where: { commandeId } });
    return l ? versAchat(l) : null;
  }

  async transitionner(
    commandeId: string,
    de: readonly EtatAchat[],
    vers: EtatAchat,
  ): Promise<AchatWhatsApp | null> {
    if (!UUID.test(commandeId) || de.length === 0) return null;
    try {
      // UPDATE conditionnel : une seule des tentatives simultanées trouve l'état attendu.
      const l = await this.prisma.whatsappAchat.update({
        where: { commandeId, etat: { in: [...de] } },
        data: { etat: vers },
      });
      return versAchat(l);
    } catch (e) {
      if (porteCode(e, "P2025")) return null;
      throw e;
    }
  }

  async enEtat(etats: readonly EtatAchat[], limite: number): Promise<AchatWhatsApp[]> {
    if (etats.length === 0 || limite <= 0) return [];
    const lignes = await this.prisma.whatsappAchat.findMany({
      where: { etat: { in: [...etats] } },
      orderBy: [{ creeA: "asc" }, { commandeId: "asc" }],
      take: limite,
    });
    return lignes.map(versAchat);
  }
}
