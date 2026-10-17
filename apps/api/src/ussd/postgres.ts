import { Injectable } from "@nestjs/common";
import type { Prisma } from "../socle/db/generated/client";
import { PrismaService } from "../socle/db/prisma.service";
import type { OperateurUssd } from "./config";
import type {
  AchatUssd,
  EntreeJournalUssd,
  EtapeUssd,
  EtatAchatUssd,
  EvenementJournalUssd,
  SessionStockee,
} from "./modeles";
import { AchatsUssd, JournalUssd, SessionsUssd } from "./ports";

/**
 * Adaptateurs PostgreSQL (Prisma) du service USSD (AM-169) : `SessionsUssd`, `JournalUssd` et
 * `AchatsUssd`. Tables `ussd_session`, `ussd_journal` et `ussd_achat` (migration « ussd »). Le suivi
 * des colis et celui des bus restent à brancher (modules colis et GPS), voir le README.
 *
 * Les garanties tiennent dans la base, pas dans le code :
 * - **sessions partagées entre instances** : une requête de l'opérateur peut tomber sur n'importe
 *   quelle instance ; la session est une ligne, écrite par `INSERT … ON CONFLICT DO UPDATE`, qui
 *   expire à son échéance (`lire` ne rend jamais une session échue et la supprime) ;
 * - **un achat avance une fois** : `transitionner` est un `UPDATE … WHERE etat = ANY(…) RETURNING`
 *   (comparer et remplacer) ; deux instances qui tentent la même transition (le webhook et le
 *   balayage) ne la réussissent jamais toutes les deux ;
 * - **un achat ne se réécrit pas** : `ajouter` est un `INSERT … ON CONFLICT DO NOTHING`, il ne
 *   remet jamais un achat terminé à « réservé » ;
 * - **le journal est une trace** : un déclencheur interdit de modifier une entrée.
 *
 * La charge de la session et le destinataire de l'achat arrivent déjà chiffrés (contextes
 * `ussd.session:<cle>` et `ussd.achat:<commande>`) : la base ne voit jamais un numéro en clair.
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

/* ------------------------------------------------------------------ sessions */

@Injectable()
export class SessionsUssdPrisma extends SessionsUssd {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async lire(cle: string, maintenant: Date): Promise<SessionStockee | null> {
    const l = await this.prisma.ussdSession.findUnique({ where: { cle } });
    if (!l) return null;
    if (l.expireA.getTime() <= maintenant.getTime()) {
      // Comme la mémoire : une session échue disparaît à la lecture (sans toucher à une session
      // réécrite entre-temps par une autre instance).
      await this.prisma.ussdSession.deleteMany({
        where: { cle, expireA: { lte: maintenant } },
      });
      return null;
    }
    return { cle: l.cle, expireA: l.expireA, charge: l.charge };
  }

  async ecrire(session: SessionStockee): Promise<void> {
    await this.prisma.ussdSession.upsert({
      where: { cle: session.cle },
      create: { cle: session.cle, expireA: session.expireA, charge: session.charge },
      update: { expireA: session.expireA, charge: session.charge },
    });
  }

  async supprimer(cle: string): Promise<void> {
    await this.prisma.ussdSession.deleteMany({ where: { cle } });
  }

  async purger(maintenant: Date): Promise<number> {
    const { count } = await this.prisma.ussdSession.deleteMany({
      where: { expireA: { lte: maintenant } },
    });
    return count;
  }
}

/* ------------------------------------------------------------------ journal */

@Injectable()
export class JournalUssdPrisma extends JournalUssd {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async enregistrer(entree: EntreeJournalUssd): Promise<void> {
    // Rejouer la même entrée (même identifiant) ne l'écrit pas deux fois.
    await this.prisma.ussdJournal.createMany({
      data: {
        id: entree.id,
        at: entree.at,
        operateur: entree.operateur,
        msisdnMasque: entree.msisdnMasque,
        sessionRef: entree.sessionRef,
        evenement: entree.evenement,
        etape: entree.etape,
        code: entree.code,
        dureeMs: entree.dureeMs,
      },
      skipDuplicates: true,
    });
  }

  /** Les entrées d'une session, de la plus ancienne à la plus récente (enquête, tests). */
  async deLaSession(sessionRef: string): Promise<EntreeJournalUssd[]> {
    const lignes = await this.prisma.ussdJournal.findMany({
      where: { sessionRef },
      orderBy: [{ at: "asc" }, { id: "asc" }],
    });
    return lignes.map((l) => ({
      id: l.id,
      at: l.at,
      operateur: l.operateur as OperateurUssd,
      msisdnMasque: l.msisdnMasque,
      sessionRef: l.sessionRef,
      evenement: l.evenement as EvenementJournalUssd,
      etape: l.etape as EtapeUssd | null,
      code: l.code,
      dureeMs: l.dureeMs,
    }));
  }
}

/* ------------------------------------------------------------------ achats */

type LigneAchat = Prisma.UssdAchatGetPayload<object>;

function versAchat(l: LigneAchat): AchatUssd {
  return {
    commandeId: l.commandeId,
    voyageurId: l.voyageurId,
    operateur: l.operateur as OperateurUssd,
    etat: l.etat as EtatAchatUssd,
    destinataireChiffre: l.destinataireChiffre,
    creeA: l.creeA,
  };
}

@Injectable()
export class AchatsUssdPrisma extends AchatsUssd {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async ajouter(achat: AchatUssd): Promise<void> {
    await this.prisma.ussdAchat.createMany({
      data: {
        commandeId: achat.commandeId,
        voyageurId: achat.voyageurId,
        operateur: achat.operateur,
        etat: achat.etat,
        destinataireChiffre: achat.destinataireChiffre,
        creeA: achat.creeA,
      },
      skipDuplicates: true,
    });
  }

  async trouver(commandeId: string): Promise<AchatUssd | null> {
    if (!UUID.test(commandeId)) return null;
    const l = await this.prisma.ussdAchat.findUnique({ where: { commandeId } });
    return l ? versAchat(l) : null;
  }

  async transitionner(
    commandeId: string,
    de: readonly EtatAchatUssd[],
    vers: EtatAchatUssd,
  ): Promise<AchatUssd | null> {
    if (!UUID.test(commandeId) || de.length === 0) return null;
    try {
      // UPDATE conditionnel : une seule des tentatives simultanées trouve l'état attendu.
      const l = await this.prisma.ussdAchat.update({
        where: { commandeId, etat: { in: [...de] } },
        data: { etat: vers },
      });
      return versAchat(l);
    } catch (e) {
      if (porteCode(e, "P2025")) return null;
      throw e;
    }
  }

  async enEtat(etats: readonly EtatAchatUssd[], limite: number): Promise<AchatUssd[]> {
    if (etats.length === 0 || limite <= 0) return [];
    const lignes = await this.prisma.ussdAchat.findMany({
      where: { etat: { in: [...etats] } },
      orderBy: [{ creeA: "asc" }, { commandeId: "asc" }],
      take: limite,
    });
    return lignes.map(versAchat);
  }
}
