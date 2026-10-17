import { Injectable } from "@nestjs/common";
import { Prisma } from "../../socle/db/generated/client";
import { PrismaService } from "../../socle/db/prisma.service";
import { estErreurSql, UUID, verrouiller } from "../sql";
import { versIsoDouala } from "../temps";
import {
  EvenementsTraites,
  JournalAgenceRepository,
  type EntreeJournalStockee,
  type EtatTraitement,
  type FiltreJournal,
  type ValidationJournal,
} from "./ports";

/**
 * Adaptateurs PostgreSQL (Prisma) du journal signé de l'agence et de l'idempotence des écritures
 * (AM-164). Tables : `journal_agence` et `evenement_agence_traite`.
 *
 * Ce que la base garantit, sans compter sur le code :
 * - **ajout seul** : déclencheurs `journal_agence_ajout_seul` (ni UPDATE, ni DELETE, ni TRUNCATE) ;
 * - **la chaîne d'empreintes ne se ramifie pas** : `ajouter` prend un verrou consultatif propre à la
 *   chaîne, lit la dernière entrée et insère dans la même transaction, de sorte que deux écritures
 *   simultanées se suivent au lieu de partir de la même empreinte. L'index unique
 *   `(chaine, precedente) NULLS NOT DISTINCT` est le filet : s'il arrivait que deux entrées suivent
 *   la même, la seconde serait refusée ;
 * - **un événement n'entre qu'une fois** : `evenementId` est unique, sur toutes les chaînes ;
 * - **un événement n'est traité qu'une fois** : `commencer` est un `INSERT … ON CONFLICT` (clé
 *   primaire `evenementId`). Un traitement resté « en cours » plus de cinq minutes (processus mort
 *   avant la fin) est repris par le premier qui rejoue l'événement.
 */

type LigneJournal = Prisma.JournalAgenceGetPayload<object>;

function versEntree(l: LigneJournal): EntreeJournalStockee {
  return {
    seq: Number(l.seq),
    chaine: l.chaine,
    gareId: l.gareId,
    compagnieId: l.compagnieId,
    evenementId: l.evenementId,
    type: l.type,
    at: versIsoDouala(l.at),
    auteur: { id: l.auteurId, nom: l.auteurNom },
    appareilId: l.appareilId,
    cible: { type: l.cibleType, id: l.cibleId },
    numeroPlage: l.numeroPlage,
    resume: l.resume,
    validePar: l.validePar as unknown as ValidationJournal | null,
    empreinte: l.empreinte,
    precedente: l.precedente,
  };
}

@Injectable()
export class JournalAgencePrisma extends JournalAgenceRepository {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async ajouter(
    chaine: string,
    evenementId: string,
    construire: (precedente: string | null) => Omit<EntreeJournalStockee, "seq" | "chaine">,
  ): Promise<EntreeJournalStockee | null> {
    if (!UUID.test(evenementId)) {
      throw new TypeError(`Identifiant d'événement invalide pour le journal : ${evenementId}`);
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        // Tout ce qui s'écrit dans la même chaîne passe l'un après l'autre : l'empreinte de la tête
        // est lue et l'entrée suivante insérée sans qu'une autre ne s'intercale.
        await verrouiller(tx, `journal:${chaine}`);
        const deja = await tx.journalAgence.findUnique({
          where: { evenementId },
          select: { seq: true },
        });
        if (deja) return null;
        const tete = await tx.journalAgence.findFirst({
          where: { chaine },
          orderBy: { seq: "desc" },
          select: { empreinte: true },
        });
        const e = construire(tete?.empreinte ?? null);
        const ligne = await tx.journalAgence.create({
          data: {
            chaine,
            evenementId,
            gareId: e.gareId,
            compagnieId: e.compagnieId,
            type: e.type,
            at: new Date(e.at),
            auteurId: e.auteur.id,
            auteurNom: e.auteur.nom,
            appareilId: e.appareilId,
            cibleType: e.cible.type,
            cibleId: e.cible.id,
            numeroPlage: e.numeroPlage,
            resume: e.resume,
            validePar:
              e.validePar === null
                ? Prisma.DbNull
                : (e.validePar as unknown as Prisma.InputJsonValue),
            empreinte: e.empreinte,
            precedente: e.precedente,
          },
        });
        return versEntree(ligne);
      });
    } catch (err) {
      // Le même événement écrit dans une autre chaîne au même instant (verrou différent) : l'index
      // unique sur `evenementId` en a laissé passer un seul.
      if (estErreurSql(err, "23505") && (await this.contientEvenement(evenementId))) return null;
      throw err;
    }
  }

  private async contientEvenement(evenementId: string): Promise<boolean> {
    return (
      (await this.prisma.journalAgence.findUnique({
        where: { evenementId },
        select: { seq: true },
      })) !== null
    );
  }

  async lister(filtre: FiltreJournal): Promise<EntreeJournalStockee[]> {
    const et: Prisma.JournalAgenceWhereInput[] = [];
    if (filtre.personneId !== undefined) {
      et.push({
        OR: [
          { auteurId: filtre.personneId },
          { cibleType: "personne", cibleId: filtre.personneId },
          { validePar: { path: ["superviseurId"], equals: filtre.personneId } },
        ],
      });
    }
    if (filtre.sessionId !== undefined) {
      et.push({ cibleType: "session", cibleId: filtre.sessionId });
    }
    if (filtre.jour !== undefined) {
      // Le jour est celui de Douala (UTC+1, sans heure d'été).
      const debut = new Date(`${filtre.jour}T00:00:00.000+01:00`);
      if (Number.isNaN(debut.getTime())) return [];
      et.push({ at: { gte: debut, lt: new Date(debut.getTime() + 24 * 3_600_000) } });
    }
    const lignes = await this.prisma.journalAgence.findMany({
      where: {
        ...(filtre.compagnieId !== undefined ? { compagnieId: filtre.compagnieId } : {}),
        ...(filtre.gareId !== undefined ? { gareId: filtre.gareId } : {}),
        ...(filtre.avantSeq !== undefined ? { seq: { lt: BigInt(filtre.avantSeq) } } : {}),
        ...(et.length > 0 ? { AND: et } : {}),
      },
      orderBy: { seq: "desc" },
      take: filtre.limite,
    });
    return lignes.map(versEntree);
  }

  async chaine(chaine: string): Promise<EntreeJournalStockee[]> {
    const lignes = await this.prisma.journalAgence.findMany({
      where: { chaine },
      orderBy: { seq: "asc" },
    });
    return lignes.map(versEntree);
  }
}

/* ------------------------------------------------------------------ événements traités */

/** Un traitement « en cours » plus ancien que ceci est considéré comme abandonné (processus mort). */
const REPRISE_APRES_SECONDES = 300;

@Injectable()
export class EvenementsTraitesPrisma extends EvenementsTraites {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async commencer(evenementId: string): Promise<EtatTraitement<unknown>> {
    if (!UUID.test(evenementId)) {
      throw new TypeError(`Identifiant d'événement invalide : ${evenementId}`);
    }
    for (let tentative = 0; tentative < 3; tentative++) {
      // Une seule instruction : la ligne est créée, ou reprise si un traitement abandonné y dort.
      // Une ligne renvoyée = c'est nous qui traitons ; aucune = un autre traitement la détient.
      const prises = await this.prisma.$queryRaw<{ evenementId: string }[]>`
        INSERT INTO evenement_agence_traite ("evenementId", "etat", "recuA")
        VALUES (${evenementId}::uuid, 'en_cours', now())
        ON CONFLICT ("evenementId") DO UPDATE SET "recuA" = now()
          WHERE evenement_agence_traite."etat" = 'en_cours'
            AND evenement_agence_traite."recuA" < now() - make_interval(secs => ${REPRISE_APRES_SECONDES})
        RETURNING "evenementId"`;
      if (prises.length === 1) return { etat: "nouveau" };
      const l = await this.prisma.evenementAgenceTraite.findUnique({ where: { evenementId } });
      // La ligne a disparu entre-temps (traitement abandonné) : on retente.
      if (!l) continue;
      if (l.etat === "en_cours") return { etat: "en_cours" };
      return {
        etat: "termine",
        resultat: l.resultat,
        recuA: l.recuA ? versIsoDouala(l.recuA) : "",
      };
    }
    return { etat: "en_cours" };
  }

  async terminer(evenementId: string, resultat: unknown, recuA: string): Promise<void> {
    if (!UUID.test(evenementId)) return;
    await this.prisma.evenementAgenceTraite.updateMany({
      where: { evenementId },
      data: {
        etat: "termine",
        resultat: resultat === undefined ? Prisma.DbNull : (resultat as Prisma.InputJsonValue),
        recuA: new Date(recuA),
      },
    });
  }

  async abandonner(evenementId: string): Promise<void> {
    if (!UUID.test(evenementId)) return;
    await this.prisma.evenementAgenceTraite.deleteMany({
      where: { evenementId, etat: "en_cours" },
    });
  }
}
